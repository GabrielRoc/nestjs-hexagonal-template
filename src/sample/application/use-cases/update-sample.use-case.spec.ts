import { HttpStatus } from '@nestjs/common';
import {
  SAMPLE_ID,
  TENANT_A,
  TENANT_B,
  makeSample,
} from '../../../../test/factories/sample.factory';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';
import { UpdateSampleUseCase } from './update-sample.use-case';

describe('UpdateSampleUseCase', () => {
  let repo: jest.Mocked<Pick<SampleRepositoryPort, 'findById' | 'update'>>;
  let useCase: UpdateSampleUseCase;

  beforeEach(() => {
    repo = { findById: jest.fn(), update: jest.fn() };
    useCase = new UpdateSampleUseCase(repo as unknown as SampleRepositoryPort);
    repo.update.mockImplementation((sample) => Promise.resolve(sample));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('altera somente os campos presentes no DTO', async () => {
    repo.findById.mockResolvedValue(
      makeSample({ name: 'Antigo', description: 'Mantem', isActive: true }),
    );

    const result = await useCase.execute(SAMPLE_ID, TENANT_A, { name: 'Novo' });

    expect(result.name).toBe('Novo');
    expect(result.description).toBe('Mantem');
    expect(result.isActive).toBe(true);
  });

  it('limpa a description quando o cliente manda null explicito', async () => {
    repo.findById.mockResolvedValue(makeSample({ description: 'Tinha texto' }));

    const result = await useCase.execute(SAMPLE_ID, TENANT_A, {
      description: null,
    });

    // `undefined` (ausente) mantem, `null` (explicito) limpa. Um
    // `if (dto.description)` trataria os dois como "nao mexe".
    expect(result.description).toBeNull();
  });

  it('aceita isActive false (nao confunde com campo ausente)', async () => {
    repo.findById.mockResolvedValue(makeSample({ isActive: true }));

    const result = await useCase.execute(SAMPLE_ID, TENANT_A, {
      isActive: false,
    });

    expect(result.isActive).toBe(false);
  });

  it('aceita sortOrder 0', async () => {
    repo.findById.mockResolvedValue(makeSample({ sortOrder: 5 }));

    const result = await useCase.execute(SAMPLE_ID, TENANT_A, { sortOrder: 0 });

    expect(result.sortOrder).toBe(0);
  });

  it('devolve SAMPLE_NOT_FOUND com 404 e nao grava nada', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(SAMPLE_ID, TENANT_A, { name: 'Novo' }),
    ).rejects.toMatchObject({
      code: ErrorCode.SAMPLE_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });
    // O negativo e a parte que importa: sem ele o teste nao distingue "recusou
    // antes de gravar" de "gravou e depois reclamou".
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('nao atualiza registro de outro tenant', async () => {
    // O repositorio filtra por tenant: para o TENANT_B o registro nao existe.
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(SAMPLE_ID, TENANT_B, { name: 'Invasao' }),
    ).rejects.toMatchObject({ httpStatus: HttpStatus.NOT_FOUND });

    expect(repo.findById).toHaveBeenCalledWith(SAMPLE_ID, TENANT_B);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('preserva o tenantId da entidade ao gravar', async () => {
    repo.findById.mockResolvedValue(makeSample());

    await useCase.execute(SAMPLE_ID, TENANT_A, { name: 'Novo' });

    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: SAMPLE_ID, tenantId: TENANT_A }),
    );
  });
});
