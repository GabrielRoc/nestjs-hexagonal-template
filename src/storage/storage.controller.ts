import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Public, Roles } from '../common/decorators';
import { ErrorCode } from '../common/enums/error-codes.enum';
import { Role } from '../common/enums/role.enum';
import { DomainException } from '../common/exceptions/domain.exception';
import { STORAGE_SERVICE, type StorageServicePort } from '../common/interfaces';
import { ErrorResponseSwagger } from '../common/swagger/common.swagger';
import { ImageProcessingService } from './image-processing.service';

// file-type v21+ e ESM-only; o import dinamico evita ERR_REQUIRE_ESM sob CJS.
async function detectFileType(buffer: Buffer) {
  const { fileTypeFromBuffer } = await import('file-type');
  return fileTypeFromBuffer(buffer);
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

const ALLOWED_PUBLIC_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PUBLIC_URL_EXPIRY_SECONDS = 3600;

@ApiTags('Storage')
@Controller()
export class StorageController {
  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageServicePort,
    private readonly imageProcessingService: ImageProcessingService,
  ) {}

  @Post('v1/storage/upload')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.USER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiCookieAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia um arquivo para o storage' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Arquivo enviado' })
  @ApiResponse({
    status: 400,
    description: 'Arquivo ausente, grande demais ou de tipo não permitido',
    type: ErrorResponseSwagger,
  })
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw this.badRequest('Nenhum arquivo enviado');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw this.badRequest('Arquivo excede o limite de 10MB');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw this.badRequest(`Tipo de arquivo não permitido: ${file.mimetype}`);
    }

    // Valida o conteudo real, nao o cabecalho enviado pelo cliente.
    const detected = await detectFileType(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
      throw this.badRequest(
        'Conteúdo do arquivo não corresponde a um tipo permitido',
      );
    }

    if (file.mimetype.split('/')[0] !== detected.mime.split('/')[0]) {
      throw this.badRequest(
        `Tipo declarado (${file.mimetype}) não corresponde ao conteúdo detectado (${detected.mime})`,
      );
    }

    const fileId = randomUUID();

    if (this.imageProcessingService.isProcessable(detected.mime)) {
      let processed;
      try {
        processed = await this.imageProcessingService.process(file.buffer);
      } catch {
        throw this.badRequest(
          'Falha ao processar a imagem. Verifique se o arquivo é válido.',
        );
      }

      const [optimized, thumbnail] = await Promise.all([
        this.storageService.upload(
          `uploads/${fileId}.webp`,
          processed.optimizedBuffer,
          processed.optimizedMimeType,
        ),
        this.storageService.upload(
          `uploads/${fileId}-thumb.webp`,
          processed.thumbnailBuffer,
          processed.thumbnailMimeType,
        ),
      ]);

      return {
        data: {
          key: optimized.key,
          url: optimized.url,
          thumbnailKey: thumbnail.key,
          thumbnailUrl: thumbnail.url,
        },
      };
    }

    // originalname e entrada do usuario: usamos apenas a extensao, ja validada
    // indiretamente pela deteccao de magic bytes acima.
    const ext = extname(file.originalname).toLowerCase() || '.bin';
    const result = await this.storageService.upload(
      `uploads/${fileId}${ext}`,
      file.buffer,
      detected.mime,
    );

    return {
      data: {
        key: result.key,
        url: result.url,
        thumbnailKey: null,
        thumbnailUrl: null,
      },
    };
  }

  @Get('v1/storage/public/images/*key')
  @Public()
  @ApiOperation({
    summary: 'Redireciona para a URL assinada de uma imagem pública',
  })
  @ApiResponse({ status: 302, description: 'Redireciona para a URL assinada' })
  @ApiResponse({
    status: 400,
    description: 'Chave inválida',
    type: ErrorResponseSwagger,
  })
  async getPublicImage(
    @Param('key') rawKey: string | string[],
    @Res() res: Response,
  ) {
    const key = Array.isArray(rawKey) ? rawKey.join('/') : rawKey;
    const ext = key ? key.slice(key.lastIndexOf('.')).toLowerCase() : '';

    if (
      !key ||
      !key.startsWith('uploads/') ||
      key.includes('..') ||
      !ALLOWED_PUBLIC_EXTENSIONS.includes(ext)
    ) {
      throw new DomainException(
        ErrorCode.STORAGE_INVALID_KEY,
        'Chave de imagem inválida',
        HttpStatus.BAD_REQUEST,
      );
    }

    const signedUrl = await this.storageService.getSignedUrl(
      key,
      PUBLIC_URL_EXPIRY_SECONDS,
    );
    res.redirect(302, signedUrl);
  }

  private badRequest(message: string): DomainException {
    return new DomainException(
      ErrorCode.STORAGE_UPLOAD_FAILED,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
