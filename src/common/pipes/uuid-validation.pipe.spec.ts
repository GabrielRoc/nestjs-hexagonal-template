import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { ErrorCode } from '../enums/error-codes.enum';
import { UuidValidationPipe } from './uuid-validation.pipe';

describe('UuidValidationPipe', () => {
  const metadata: ArgumentMetadata = { type: 'param', data: 'id' };
  const V4 = '99999999-9999-4999-8999-999999999999';

  let pipe: UuidValidationPipe;

  beforeEach(() => {
    pipe = new UuidValidationPipe();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** O erro do pipe, para inspecionar status e corpo. */
  const rejectionOf = async (
    value: string,
    target: UuidValidationPipe = pipe,
  ): Promise<BadRequestException> => {
    const error: unknown = await target
      .transform(value, metadata)
      .then((ok) => ok)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    return error as BadRequestException;
  };

  it('devolve o UUID v4 intacto', async () => {
    await expect(pipe.transform(V4, metadata)).resolves.toBe(V4);
  });

  it('aceita UUID v4 em maiusculas (a comparacao ignora caixa)', async () => {
    const upper = V4.toUpperCase();

    await expect(pipe.transform(upper, metadata)).resolves.toBe(upper);
  });

  it('recusa id malformado com 400 VALIDATION_ERROR no formato do template', async () => {
    const error = await rejectionOf('nao-e-uuid');

    // Sem este pipe a string iria para uma coluna `uuid` e o 22P02 do Postgres
    // viraria 500 INTERNAL_ERROR no GlobalExceptionFilter.
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    // O contrato e o `code` do enum, nao o `HTTP_400` do ParseUUIDPipe cru.
    expect(error.getResponse()).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Erro de validação',
      details: [{ field: 'id', message: 'id deve ser um UUID v4' }],
    });
  });

  it('recusa UUID de outra versao', async () => {
    // Bem formado, mas v1: nenhum id do template (todos de gen_random_uuid())
    // teria essa forma, entao aceitar so abriria caminho para uma query inutil.
    const error = await rejectionOf('99999999-9999-1999-8999-999999999999');

    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('nomeia no details o campo recebido no construtor', async () => {
    const error = await rejectionOf('nao-e-uuid', new UuidValidationPipe('id'));

    expect(error.getResponse()).toMatchObject({
      details: [{ field: 'id', message: 'id deve ser um UUID v4' }],
    });

    const other = await rejectionOf(
      'nao-e-uuid',
      new UuidValidationPipe('tenantId'),
    );

    expect(other.getResponse()).toMatchObject({
      details: [{ field: 'tenantId', message: 'tenantId deve ser um UUID v4' }],
    });
  });
});
