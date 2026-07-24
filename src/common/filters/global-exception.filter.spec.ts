import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { DomainException } from '../exceptions/domain.exception';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserva o code e os details lancados pelo ZodValidationPipe', () => {
    const details = [{ field: 'name', message: 'Obrigatorio' }];
    filter.catch(
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Erro de validação',
        details,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Erro de validação',
        details,
      },
    });
  });

  it('usa o array de message do Nest como details quando nao ha details', () => {
    filter.catch(new BadRequestException(['campo invalido']), host);

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'HTTP_400',
        message: 'Erro de validação',
        details: ['campo invalido'],
      },
    });
  });

  it('mantem o code da DomainException', () => {
    filter.catch(
      new DomainException(
        'SAMPLE_NOT_FOUND',
        'Nao encontrado',
        HttpStatus.NOT_FOUND,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'SAMPLE_NOT_FOUND', message: 'Nao encontrado' },
    });
  });

  it('nao vaza detalhe de excecao desconhecida', () => {
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    filter.catch(new Error('segredo do banco'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
    });
  });
});
