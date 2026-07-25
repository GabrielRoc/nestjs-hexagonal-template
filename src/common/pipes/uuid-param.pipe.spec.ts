import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { UuidParamPipe } from './uuid-param.pipe';
import { ErrorCode } from '../enums/error-codes.enum';

const METADATA: ArgumentMetadata = { type: 'param', data: 'id' };
const UUID_V4 = '3f1c9f4a-1111-4222-8333-444455556666';

describe('UuidParamPipe', () => {
  let pipe: UuidParamPipe;

  beforeEach(() => {
    pipe = new UuidParamPipe();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devolve o valor quando e um UUID v4', async () => {
    await expect(pipe.transform(UUID_V4, METADATA)).resolves.toBe(UUID_V4);
  });

  it('recusa valor que nao e UUID com o code do enum centralizado', async () => {
    // Sem este pipe o Nest devolveria code 'HTTP_400' (fora de ErrorCode) e
    // mensagem em ingles, divergindo do ZodValidationPipe na mesma rota.
    await expect(pipe.transform('abc', METADATA)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const error = await pipe
      .transform('abc', METADATA)
      .catch((thrown: BadRequestException) => thrown);

    expect((error as BadRequestException).getResponse()).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Erro de validação',
      details: [{ field: 'id', message: 'Identificador deve ser um UUID v4' }],
    });
  });

  it('recusa UUID de outra versao, porque os ids do template sao v4', async () => {
    const uuidV1 = '2c1b8a90-6f3d-11ee-b962-0242ac120002';

    await expect(pipe.transform(uuidV1, METADATA)).rejects.toMatchObject({
      response: { code: ErrorCode.VALIDATION_ERROR },
    });
  });
});
