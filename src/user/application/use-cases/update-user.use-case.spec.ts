import { HttpStatus } from '@nestjs/common';
import { UpdateUserUseCase } from './update-user.use-case';
import { User } from '../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { Role } from '../../../common/enums/role.enum';

type UserRepoMock = jest.Mocked<
  Pick<
    UserRepositoryPort,
    'findById' | 'update' | 'countActiveAdminsByTenantId'
  >
>;

const TENANT_ID = 'tenant-1';
const TARGET_ID = 'user-target';
const CURRENT_ID = 'user-current';

function makeUser(overrides: Partial<User> = {}): User {
  return new User({
    id: TARGET_ID,
    tenantId: TENANT_ID,
    supertokensUserId: 'st-target',
    name: 'Alvo',
    email: 'alvo@example.com',
    phone: '11999999999',
    role: Role.USER,
    isActive: true,
    ...overrides,
  });
}

describe('UpdateUserUseCase', () => {
  let useCase: UpdateUserUseCase;
  let repo: UserRepoMock;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      update: jest.fn(),
      countActiveAdminsByTenantId: jest.fn(),
    };
    // Devolve a propria entidade recebida: o repositorio real relê a linha
    // atualizada, e os testes que dependem disso sobrescrevem o mock.
    repo.update.mockImplementation((user) => Promise.resolve(user));
    useCase = new UpdateUserUseCase(repo as unknown as UserRepositoryPort);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lanca USER_NOT_FOUND quando o usuario nao existe no tenant', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, { name: 'Novo' }),
    ).rejects.toBeInstanceOf(DomainException);
    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, { name: 'Novo' }),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
      httpStatus: HttpStatus.NOT_FOUND,
    });

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('busca o usuario sempre escopado pelo tenant da requisicao', async () => {
    repo.findById.mockResolvedValue(makeUser());

    await useCase.execute(TARGET_ID, 'outro-tenant', CURRENT_ID, {});

    expect(repo.findById).toHaveBeenCalledWith(TARGET_ID, 'outro-tenant');
  });

  it('recusa alterar o proprio papel antes de tocar no repositorio', async () => {
    // O veredito depende so do dto e dos dois ids, entao nao ha SELECT antes —
    // mesma ordem de SetUserActiveUseCase e DeleteUserUseCase.
    await expect(
      useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID, { role: Role.USER }),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_CANNOT_CHANGE_OWN_ROLE,
      httpStatus: HttpStatus.FORBIDDEN,
    });

    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('recusa o proprio papel mesmo quando o role enviado e o que ja esta em vigor', async () => {
    await expect(
      useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID, { role: Role.ADMIN }),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_CANNOT_CHANGE_OWN_ROLE,
    });

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('permite que o usuario atualize os proprios dados quando nao envia role', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ id: CURRENT_ID, role: Role.ADMIN }),
    );

    const result = await useCase.execute(CURRENT_ID, TENANT_ID, CURRENT_ID, {
      name: 'Nome Novo',
    });

    expect(result.name).toBe('Nome Novo');
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: CURRENT_ID, role: Role.ADMIN }),
    );
  });

  it('recusa rebaixar o ultimo administrador ativo do tenant', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: true }),
    );
    repo.countActiveAdminsByTenantId.mockResolvedValue(1);

    await expect(
      useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, { role: Role.USER }),
    ).rejects.toMatchObject({
      code: ErrorCode.USER_LAST_ADMIN,
      httpStatus: HttpStatus.FORBIDDEN,
    });

    expect(repo.countActiveAdminsByTenantId).toHaveBeenCalledWith(TENANT_ID);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rebaixa um admin quando o tenant ainda tem outro administrador ativo', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: true }),
    );
    repo.countActiveAdminsByTenantId.mockResolvedValue(2);

    const result = await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, {
      role: Role.USER,
    });

    expect(result.role).toBe(Role.USER);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: TARGET_ID, role: Role.USER }),
    );
  });

  it('rebaixa um admin inativo sem consultar a contagem de admins ativos', async () => {
    // Um admin inativo nao entra em countActiveAdminsByTenantId: rebaixa-lo nao
    // reduz o numero de administradores ativos do tenant.
    repo.findById.mockResolvedValue(
      makeUser({ role: Role.ADMIN, isActive: false }),
    );

    const result = await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, {
      role: Role.USER,
    });

    expect(result.role).toBe(Role.USER);
    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalled();
  });

  it('nao consulta a contagem de admins ao promover um usuario comum', async () => {
    repo.findById.mockResolvedValue(makeUser({ role: Role.USER }));

    const result = await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, {
      role: Role.ADMIN,
    });

    expect(result.role).toBe(Role.ADMIN);
    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
  });

  it('nao consulta a contagem de admins quando o role enviado continua ADMIN', async () => {
    repo.findById.mockResolvedValue(makeUser({ role: Role.ADMIN }));

    await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, {
      role: Role.ADMIN,
    });

    expect(repo.countActiveAdminsByTenantId).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalled();
  });

  it('limpa o telefone quando o dto envia phone nulo', async () => {
    repo.findById.mockResolvedValue(makeUser({ phone: '11999999999' }));

    const result = await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, {
      phone: null,
    });

    expect(result.phone).toBeNull();
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null }),
    );
  });

  it('preserva os campos ausentes no dto', async () => {
    repo.findById.mockResolvedValue(
      makeUser({ name: 'Alvo', phone: '11888888888', role: Role.ADMIN }),
    );

    const result = await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, {});

    expect(result).toMatchObject({
      name: 'Alvo',
      phone: '11888888888',
      role: Role.ADMIN,
    });
  });

  it('retorna o usuario devolvido pelo repositorio, nao a entidade em memoria', async () => {
    const persistedAt = new Date('2026-01-15T10:30:00.000Z');
    repo.findById.mockResolvedValue(makeUser());
    repo.update.mockResolvedValue(
      makeUser({ name: 'Persistido', updatedAt: persistedAt }),
    );

    const result = await useCase.execute(TARGET_ID, TENANT_ID, CURRENT_ID, {
      name: 'Enviado No Dto',
    });

    expect(result.name).toBe('Persistido');
    expect(result.updatedAt).toBe(persistedAt.toISOString());
  });
});
