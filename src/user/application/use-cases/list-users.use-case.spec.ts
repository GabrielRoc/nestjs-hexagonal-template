import { ListUsersUseCase } from './list-users.use-case';
import { User } from '../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { Role } from '../../../common/enums/role.enum';

type UserRepoMock = jest.Mocked<Pick<UserRepositoryPort, 'findAll'>>;

const TENANT_ID = 'tenant-1';

function makeUser(overrides: Partial<User> = {}): User {
  return new User({
    id: 'user-1',
    tenantId: TENANT_ID,
    supertokensUserId: 'st-1',
    name: 'Alvo',
    email: 'alvo@example.com',
    role: Role.USER,
    isActive: true,
    ...overrides,
  });
}

describe('ListUsersUseCase', () => {
  let useCase: ListUsersUseCase;
  let repo: UserRepoMock;

  beforeEach(() => {
    repo = { findAll: jest.fn() };
    repo.findAll.mockResolvedValue([[makeUser()], 1]);
    useCase = new ListUsersUseCase(repo as unknown as UserRepositoryPort);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('usa pagina 1 e 20 itens quando a query nao traz paginacao', async () => {
    await useCase.execute(TENANT_ID, {});

    expect(repo.findAll).toHaveBeenCalledWith(TENANT_ID, 1, 20);
  });

  it('converte page e perPage da query string em numeros', async () => {
    await useCase.execute(TENANT_ID, { page: '3', perPage: '5' });

    expect(repo.findAll).toHaveBeenCalledWith(TENANT_ID, 3, 5);
  });

  it('limita perPage para o cliente nao poder baixar o tenant inteiro', async () => {
    await useCase.execute(TENANT_ID, { page: '1', perPage: '5000' });

    expect(repo.findAll).toHaveBeenCalledWith(TENANT_ID, 1, 100);
  });

  it('devolve o envelope com data e meta.pagination calculados do total', async () => {
    repo.findAll.mockResolvedValue([[makeUser({ name: 'Primeiro' })], 42]);

    const result = await useCase.execute(TENANT_ID, {
      page: '2',
      perPage: '20',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Primeiro');
    expect(result.meta.pagination).toEqual({
      total: 42,
      page: 2,
      perPage: 20,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('consulta somente o tenant recebido', async () => {
    await useCase.execute('outro-tenant', {});

    expect(repo.findAll).toHaveBeenCalledWith('outro-tenant', 1, 20);
  });
});
