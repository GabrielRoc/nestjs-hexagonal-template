import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';
import { ErrorCode } from '../enums/error-codes.enum';

/**
 * Valida um parametro de rota como UUID v4 **antes** de ele virar query.
 *
 * OBRIGATORIO em toda rota com `:id`. Sem pipe, o `@Param('id')` entrega a
 * string crua e ela chega intacta ao `findOne({ where: { id } })` sobre uma
 * coluna `uuid`: o Postgres rejeita com `22P02 invalid input syntax for type
 * uuid`, o `QueryFailedError` nao e `HttpException` nem `DomainException` e o
 * `GlobalExceptionFilter` cai no ramo de excecao desconhecida. Resultado para um
 * `GET /api/v1/samples/abc`: **500 `INTERNAL_ERROR`** e um stack de erro de
 * banco no log da aplicacao — qualquer cliente com um id errado (ou um scanner)
 * gera 5xx e ruido de alerta a vontade, quando a resposta correta e 400.
 *
 * Este e o caso didatico de pipe **por parametro**: `@UsePipes` aplicaria a
 * validacao de UUID tambem ao body (e o schema do body ao id), que e justamente
 * o bug que o template proibe.
 *
 * A regex e a do `ParseUUIDPipe` do Nest, mantida pelo framework. O que esta
 * classe acrescenta e a excecao no formato do template — `VALIDATION_ERROR`,
 * mensagem em portugues e `details` com o nome do campo, igual ao
 * `ZodValidationPipe`. Com o pipe cru a rota responderia `code: 'HTTP_400'` com
 * o texto em ingles do Nest, fora do enum de erros.
 *
 * `version: '4'` e proposital: todo id do template vem de `gen_random_uuid()`,
 * entao um UUID de outra versao jamais existiria no banco.
 */
@Injectable()
export class UuidValidationPipe extends ParseUUIDPipe {
  constructor(field = 'id') {
    super({
      version: '4',
      exceptionFactory: () =>
        new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Erro de validação',
          details: [{ field, message: `${field} deve ser um UUID v4` }],
        }),
    });
  }
}
