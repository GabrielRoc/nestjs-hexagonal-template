import { HttpStatus } from '@nestjs/common';
import {
  SAMPLE_ID,
  TENANT_A,
  TENANT_B,
  makeSample,
} from '../../../../test/factories/sample.factory';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';
import { GetSampleUseCase } from './get-sample.use-case';

describe('GetSampleUseCase', () => {
  let repo: jest.Mocked<Pick<SampleRepositoryPort, 'findById'>>;
  let useCase: GetSampleUseCase;

  beforeEach(() => {
    repo = { findById: jest.fn() };
    useCase = new GetSampleUseCase(repo as unknown as SampleRepositoryPort);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devolve o sample do tenant', async () => {
    repo.findById.mockResolvedValue(makeSample({ name: 'Encontrado' }));

    const result = await useCase.execute(SAMPLE_ID, TENANT_A);

    expect(result.name).toBe('Encontrado');
  });

  it('sempre repassa o tenantId para o repositorio', async () => {
    repo.findById.mockResolvedValue(makeSample());

    await useCase.execute(SAMPLE_ID, TENANT_A);

    // O tenant tem de chegar no `where` da query. Um `findById(id)` sem tenant
    // devolveria o registro de qualquer tenant que soubesse o UUID.
    expect(repo.findById).toHaveBeenCalledWith(SAMPLE_ID, TENANT_A);
  });

  it('devolve SAMPLE_NOT_FOUND com 404 quando o id nao existe', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute(SAMPLE_ID, TENANT_A)).rejects.toMatchObject({
      code: ErrorCode.SAMPLE_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });
    // A assercao e no code + status, nunca no texto: a mensagem e em portugues,
    // para o usuario, e pode ser reescrita sem quebrar o contrato.
  });

  it('trata id de outro tenant como 404, nunca 403', async () => {
    // O repositorio filtra por tenant, entao um id valido do TENANT_A nao existe
    // do ponto de vista do TENANT_B.
    repo.findById.mockResolvedValue(null);

    const error: unknown = await useCase
      .execute(SAMPLE_ID, TENANT_B)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DomainException);
    // 404 e nao 403 de proposito: 403 confirmaria ao chamador que o id existe em
    // outro tenant.
    expect((error as DomainException).httpStatus).toBe(HttpStatus.NOT_FOUND);
    expect((error as DomainException).httpStatus).not.toBe(
      HttpStatus.FORBIDDEN,
    );
  });
});
