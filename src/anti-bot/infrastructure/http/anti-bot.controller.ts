import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ErrorResponseSwagger } from '../../../common/swagger/common.swagger';
import {
  AntiBotConfigSwagger,
  formTokenQuerySchema,
  FormTokenSwagger,
  TurnstileConfigSwagger,
  type FormTokenQueryDto,
} from '../../application/dtos/form-token.dto';
import { FormTokenService } from '../services/form-token.service';

/**
 * Endpoints que o frontend precisa para montar um formulario protegido. Sao
 * publicos por necessidade: quem preenche o formulario ainda nao tem sessao.
 */
@ApiTags('Anti-Bot')
@Controller('v1/anti-bot')
export class AntiBotController {
  constructor(
    private readonly formTokenService: FormTokenService,
    private readonly configService: ConfigService,
  ) {}

  @Get('form-token')
  @Public()
  @ApiOperation({
    summary: 'Issue a single-use form token',
    description:
      'Chame ao renderizar o formulário e envie o valor no header ' +
      '`x-form-token` no submit. Cada token vale uma única submissão.',
  })
  @ApiQuery({
    name: 'context',
    required: false,
    example: 'signup',
    description: 'Rótulo do formulário que pediu o token.',
  })
  @ApiExtraModels(FormTokenSwagger)
  @ApiResponse({
    status: 200,
    description: 'Token de uso único',
    schema: {
      type: 'object',
      properties: { data: { $ref: getSchemaPath(FormTokenSwagger) } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Erro de validação',
    type: ErrorResponseSwagger,
  })
  getFormToken(
    @Query(new ZodValidationPipe(formTokenQuerySchema))
    query: FormTokenQueryDto,
  ) {
    return { data: this.formTokenService.issue(query.context ?? 'default') };
  }

  @Get('config')
  @Public()
  @ApiOperation({
    summary: 'Anti-bot settings the browser needs',
    description:
      'Devolve apenas o que o navegador precisa para renderizar o widget. ' +
      'Nada aqui revela como a checagem funciona.',
  })
  @ApiExtraModels(AntiBotConfigSwagger, TurnstileConfigSwagger)
  @ApiResponse({
    status: 200,
    description: 'Configuração pública do anti-bot',
    schema: {
      type: 'object',
      properties: { data: { $ref: getSchemaPath(AntiBotConfigSwagger) } },
    },
  })
  getConfig() {
    const enabled = this.configService.get<boolean>(
      'antiBot.turnstileEnabled',
      false,
    );

    // Fica DE FORA de proposito, ainda que o frontend "precisasse":
    // - `minTimeMs`: diria ao bot exatamente quantos ms esperar;
    // - nome do campo isca: nao e segredo (esta no HTML), mas anunciar numa rota
    //   de API entrega a lista pronta para quem nunca abriu a pagina;
    // - `turnstileSecretKey`: chave de servidor, nunca vai para o cliente.
    return {
      data: {
        turnstile: {
          enabled,
          siteKey: enabled
            ? this.configService.get<string>('antiBot.turnstileSiteKey', '')
            : null,
        },
      },
    };
  }
}
