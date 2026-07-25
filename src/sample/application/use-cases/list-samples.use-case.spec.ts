import {
  TENANT_A,
  makeSample,
} from '../../../../test/factories/sample.factory';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';
import { ListSamplesUseCase } from './list-samples.use-case';

describe('ListSamplesUseCase', () => {
  let repo: jest.Mocked<Pick<SampleRepositoryPort, 'findAll'>>;
  let useCase: ListSamplesUseCase;

  beforeEach(() => {
    repo = { findAll: jest.fn() };
    useCase = new ListSamplesUseCase(repo as unknown as SampleRepositoryPort);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devolve o envelope { data, meta.pagination }', async () => {
    repo.findAll.mockResolvedValue([[makeSample()], 1]);

    const result = await useCase.execute(TENANT_A, {});

    expect(result.data).toHaveLength(1);
    expect(result.meta.pagination).toEqual({
      total: 1,
      page: 1,
      perPage: 20,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('usa page 1 e perPage 20 quando a query vem vazia', async () => {
    repo.findAll.mockResolvedValue([[], 0]);

    await useCase.execute(TENANT_A, {});

    expect(repo.findAll).toHaveBeenCalledWith(TENANT_A, 1, 20);
  });

  it('calcula totalPages arredondando para cima', async () => {
    // 101 itens em paginas de 20 sao 6 paginas, nao 5: a ultima tem 1 item.
    repo.findAll.mockResolvedValue([[], 101]);

    const { meta } = await useCase.execute(TENANT_A, { perPage: '20' });

    expect(meta.pagination.totalPages).toBe(6);
  });

  it('marca hasNext/hasPrevious no meio da lista', async () => {
    repo.findAll.mockResolvedValue([[], 100]);

    const { meta } = await useCase.execute(TENANT_A, {
      page: '3',
      perPage: '20',
    });

    expect(meta.pagination).toMatchObject({
      page: 3,
      totalPages: 5,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('nao marca hasNext na ultima pagina', async () => {
    repo.findAll.mockResolvedValue([[], 40]);

    const { meta } = await useCase.execute(TENANT_A, {
      page: '2',
      perPage: '20',
    });

    expect(meta.pagination.hasNext).toBe(false);
    expect(meta.pagination.hasPrevious).toBe(true);
  });

  it('devolve lista vazia com totalPages 0 quando o tenant nao tem registros', async () => {
    repo.findAll.mockResolvedValue([[], 0]);

    const { data, meta } = await useCase.execute(TENANT_A, {});

    expect(data).toEqual([]);
    expect(meta.pagination.totalPages).toBe(0);
    expect(meta.pagination.hasNext).toBe(false);
  });

  it('limita perPage a 100 em vez de aceitar o valor do cliente', async () => {
    repo.findAll.mockResolvedValue([[], 0]);

    // Sem o teto, `?perPage=100000` viraria um SELECT de 100 mil linhas por
    // requisicao.
    await useCase.execute(TENANT_A, { perPage: '100000' });

    expect(repo.findAll).toHaveBeenCalledWith(TENANT_A, 1, 100);
  });

  it('normaliza page e perPage invalidos em vez de repassar NaN', async () => {
    repo.findAll.mockResolvedValue([[], 0]);

    await useCase.execute(TENANT_A, { page: 'abc', perPage: '-5' });

    // `skip: (NaN - 1) * NaN` chegaria no banco e derrubaria a query.
    expect(repo.findAll).toHaveBeenCalledWith(TENANT_A, 1, 1);
  });

  it('consulta apenas o tenant recebido', async () => {
    repo.findAll.mockResolvedValue([[], 0]);

    await useCase.execute(TENANT_A, { page: '2' });

    expect(repo.findAll).toHaveBeenCalledWith(TENANT_A, 2, 20);
  });
});
