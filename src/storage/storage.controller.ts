import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
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
import { randomUUID } from 'node:crypto';
import { Roles, TenantId } from '../common/decorators';
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

/**
 * Apenas formatos que o ImageProcessingService reencoda para WebP sao aceitos:
 * o ciclo decode/encode descarta payloads poliglotas embutidos na imagem.
 * GIF fica de fora porque o sharp nao o reprocessa aqui, entao seria o unico
 * formato armazenado byte a byte. A excecao deliberada e application/pdf, que
 * nao e imagem e e armazenado sem processamento.
 */
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

@ApiTags('Storage')
@Controller()
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageServicePort,
    private readonly imageProcessingService: ImageProcessingService,
  ) {}

  @Post('v1/storage/upload')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.USER)
  // O limite precisa estar no multer: sem ele o corpo inteiro e bufferizado em
  // memoria antes de qualquer validacao no handler.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE, files: 1 } }),
  )
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
    description: 'Arquivo ausente ou de tipo não permitido',
    type: ErrorResponseSwagger,
  })
  @ApiResponse({
    status: 413,
    description: 'Arquivo excede o limite de 10MB',
    type: ErrorResponseSwagger,
  })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @TenantId() tenantId: string | undefined,
  ) {
    if (!file) {
      throw this.badRequest('Nenhum arquivo enviado');
    }

    if (!tenantId) {
      throw new DomainException(
        ErrorCode.TENANT_CONTEXT_MISSING,
        'Contexto de tenant ausente na requisição',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Defesa em profundidade: o multer ja rejeita o excedente durante o stream.
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
    const prefix = `uploads/${tenantId}`;

    if (this.imageProcessingService.isProcessable(detected.mime)) {
      let processed;
      try {
        processed = await this.imageProcessingService.process(file.buffer);
      } catch (error) {
        this.logger.error(
          `Falha ao processar imagem (${detected.mime}, ${file.size} bytes): ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
        throw this.badRequest(
          'Falha ao processar a imagem. Verifique se o arquivo é válido.',
        );
      }

      const [optimized, thumbnail] = await Promise.all([
        this.storageService.upload(
          `${prefix}/${fileId}.webp`,
          processed.optimizedBuffer,
          processed.optimizedMimeType,
        ),
        this.storageService.upload(
          `${prefix}/${fileId}-thumb.webp`,
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

    // A extensao vem da deteccao por magic bytes, nunca de originalname: assim
    // ela sempre concorda com o conteudo validado e nao e controlada pelo cliente.
    const ext = `.${detected.ext}`;
    const result = await this.storageService.upload(
      `${prefix}/${fileId}${ext}`,
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

  private badRequest(message: string): DomainException {
    return new DomainException(
      ErrorCode.STORAGE_UPLOAD_FAILED,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
