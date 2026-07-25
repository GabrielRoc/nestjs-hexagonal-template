import { HttpStatus } from '@nestjs/common';
import {
  SAMPLE_ID,
  TENANT_A,
  TENANT_B,
  makeSample,
} from '../../../../test/factories/sample.factory';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';
import { DeleteSampleUseCase } from './delete-sample.use-case';

describe('DeleteSampleUseCase', () => {
  let repo: jest.Mocked<Pick<SampleRepositoryPort, 'findById' | 'softDelete'>>;
  let useCase: DeleteSampleUseCase;

  beforeEach(() => {
    repo = { findById: jest.fn(), softDelete: jest.fn() };
    useCase = new DeleteSampleUseCase(repo as unknown as SampleRepositoryPort);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('chama softDelete com id e tenantId', async () => {
    repo.findById.mockResolvedValue(makeSample());
    repo.softDelete.mockResolvedValue(undefined);

    await useCase.execute(SAMPLE_ID, TENANT_A);

    // `softDelete`, nunca `delete`: a convencao do template e nao fazer DELETE
    // fisico. O tenant vai no where junto com o id.
    expect(repo.softDelete).toHaveBeenCalledWith(SAMPLE_ID, TENANT_A);
  });

  it('confere a existencia antes de apagar', async () => {
    repo.findById.mockResolvedValue(makeSample());
    repo.softDelete.mockResolvedValue(undefined);

    await useCase.execute(SAMPLE_ID, TENANT_A);

    // Sem o findById antes, apagar um id inexistente devolveria 204 e o cliente
    // acreditaria ter removido algo.
    expect(repo.findById).toHaveBeenCalledWith(SAMPLE_ID, TENANT_A);
  });

  it('devolve SAMPLE_NOT_FOUND com 404 e nao apaga nada', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute(SAMPLE_ID, TENANT_A)).rejects.toMatchObject({
      code: ErrorCode.SAMPLE_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('nao apaga registro de outro tenant', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute(SAMPLE_ID, TENANT_B)).rejects.toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
    });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('trata um sample ja soft-deletado como inexistente', async () => {
    // O repositorio nao devolve linha com deletedAt preenchido (o TypeORM
    // adiciona `deletedAt IS NULL` por causa do @DeleteDateColumn), entao um
    // segundo DELETE tem de dar 404 e nao 204.
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute(SAMPLE_ID, TENANT_A)).rejects.toMatchObject({
      code: ErrorCode.SAMPLE_NOT_FOUND,
    });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});
