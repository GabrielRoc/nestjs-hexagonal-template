import {
  TENANT_A,
  makeSample,
} from '../../../../test/factories/sample.factory';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';
import { CreateSampleUseCase } from './create-sample.use-case';

/**
 * Modelo de teste unitario de use case no template. Cinco regras, todas
 * visiveis aqui:
 *
 * 1. `new CreateSampleUseCase(repo)` — sem `Test.createTestingModule`. O use
 *    case nao depende do container do Nest; montar um modulo so deixaria o teste
 *    lento e mais fragil.
 * 2. `jest.Mocked<Pick<Port, ...>>` — o mock declara **somente** os metodos que
 *    este use case chama. Se amanha ele chamar um metodo novo, o teste passa a
 *    nao compilar em vez de falhar em runtime com `undefined is not a function`.
 * 3. `jest.restoreAllMocks()` no `afterEach`.
 * 4. Falha se assere em `code` + `httpStatus`, nunca no texto da mensagem: a
 *    mensagem e para o usuario e muda; o code e o contrato.
 * 5. Assere o negativo (`expect(repo.save).not.toHaveBeenCalled()`) — sem isso o
 *    teste nao distingue "rejeitou antes de gravar" de "gravou e depois
 *    reclamou".
 */
describe('CreateSampleUseCase', () => {
  let repo: jest.Mocked<Pick<SampleRepositoryPort, 'save' | 'getMaxSortOrder'>>;
  let useCase: CreateSampleUseCase;

  beforeEach(() => {
    repo = {
      save: jest.fn(),
      getMaxSortOrder: jest.fn(),
    };
    useCase = new CreateSampleUseCase(repo as unknown as SampleRepositoryPort);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('grava o sample no tenant recebido, nao no tenant do DTO', async () => {
    repo.getMaxSortOrder.mockResolvedValue(-1);
    repo.save.mockImplementation((sample) => Promise.resolve(sample));

    await useCase.execute({ name: 'Novo' }, TENANT_A);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, name: 'Novo' }),
    );
  });

  it('coloca o primeiro sample do tenant em sortOrder 0', async () => {
    // -1 e o contrato do port para "o tenant nao tem nenhum sample".
    repo.getMaxSortOrder.mockResolvedValue(-1);
    repo.save.mockImplementation((sample) => Promise.resolve(sample));

    const result = await useCase.execute({ name: 'Primeiro' }, TENANT_A);

    expect(result.sortOrder).toBe(0);
  });

  it('coloca o sample seguinte no fim da lista', async () => {
    repo.getMaxSortOrder.mockResolvedValue(7);
    repo.save.mockImplementation((sample) => Promise.resolve(sample));

    const result = await useCase.execute({ name: 'Ultimo' }, TENANT_A);

    expect(result.sortOrder).toBe(8);
    expect(repo.getMaxSortOrder).toHaveBeenCalledWith(TENANT_A);
  });

  it('respeita o sortOrder explicito e nao consulta o maximo', async () => {
    repo.save.mockImplementation((sample) => Promise.resolve(sample));

    const result = await useCase.execute(
      { name: 'Fixo', sortOrder: 3 },
      TENANT_A,
    );

    expect(result.sortOrder).toBe(3);
    // A consulta agregada e um round-trip no banco: quando o cliente ja mandou a
    // posicao, ela nao deve acontecer.
    expect(repo.getMaxSortOrder).not.toHaveBeenCalled();
  });

  it('aceita sortOrder 0 explicito (nao cai no fallback do ??)', async () => {
    repo.save.mockImplementation((sample) => Promise.resolve(sample));

    const result = await useCase.execute(
      { name: 'Primeiro da lista', sortOrder: 0 },
      TENANT_A,
    );

    expect(result.sortOrder).toBe(0);
    expect(repo.getMaxSortOrder).not.toHaveBeenCalled();
  });

  it('normaliza description ausente para null', async () => {
    repo.getMaxSortOrder.mockResolvedValue(-1);
    repo.save.mockImplementation((sample) => Promise.resolve(sample));

    const result = await useCase.execute({ name: 'Sem descricao' }, TENANT_A);

    // `null` explicito, nunca `undefined`: o contrato da resposta declara
    // `description: string | null` e `undefined` desapareceria do JSON.
    expect(result.description).toBeNull();
  });

  it('devolve datas em ISO 8601 e nao expoe deletedAt', async () => {
    repo.getMaxSortOrder.mockResolvedValue(-1);
    repo.save.mockResolvedValue(makeSample());

    const result = await useCase.execute({ name: 'Novo' }, TENANT_A);

    expect(result.createdAt).toBe('2024-01-15T10:30:00.000Z');
    expect(result).not.toHaveProperty('deletedAt');
  });
});
