import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  ParseUUIDPipe,
  PipeTransform,
} from '@nestjs/common';
import { ErrorCode } from '../enums/error-codes.enum';

/**
 * Valida um parametro de rota como UUID v4 devolvendo o MESMO envelope de erro
 * do resto da API.
 *
 * O `ParseUUIDPipe` do Nest lanca `BadRequestException('Validation failed (uuid
 * is expected)')`: string crua, sem `code`. O GlobalExceptionFilter entao monta
 * `code: 'HTTP_400'` — um codigo que nao existe em `ErrorCode` — e repassa a
 * mensagem em ingles. Na mesma rota, um corpo invalido devolveria
 * `VALIDATION_ERROR` com mensagem em portugues pelo ZodValidationPipe: dois
 * contratos de erro diferentes para o mesmo 400.
 *
 * Use `@Param('id', UuidParamPipe)` em toda rota com id no path.
 */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, Promise<string>> {
  private readonly pipe = new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () =>
      new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Erro de validação',
        details: [
          { field: 'id', message: 'Identificador deve ser um UUID v4' },
        ],
      }),
  });

  async transform(value: string, metadata: ArgumentMetadata): Promise<string> {
    return this.pipe.transform(value, metadata);
  }
}
