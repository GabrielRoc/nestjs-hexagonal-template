import type { Server } from 'node:http';
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { Role } from '../src/common/enums/role.enum';
import { ErrorCode } from '../src/common/enums/error-codes.enum';
import type { PaginationMeta } from '../src/common/interfaces/api-response.interface';
import type {
  RequestUser,
  RequestWithUser,
} from '../src/common/interfaces/request-with-user.interface';

import { InitialSchema1784953438174 } from '../src/database/migrations/1784953438174-InitialSchema';
import { AuditLogTypeormEntity } from '../src/audit-log/infrastructure/persistence/audit-log.typeorm-entity';
import { TenantTypeormEntity } from '../src/tenant/infrastructure/persistence/tenant.typeorm-entity';
import { UserTypeormEntity } from '../src/user/infrastructure/persistence/user.typeorm-entity';

import { SampleTypeormEntity } from '../src/sample/infrastructure/persistence/sample.typeorm-entity';
import { SampleModule } from '../src/sample/infrastructure/sample.module';
import type { SampleResponseDto } from '../src/sample/application/dtos/sample.dto';

/**
 * ==========================================================================
 * O QUE ESTE TESTE COBRE — e o que ele NAO cobre
 * ==========================================================================
 *
 * Cobre, de ponta a ponta, contra um **Postgres real** com o schema criado pela
 * migration deste repositorio (`dropSchema` + `migrationsRun`):
 *
 * - HTTP -> controller -> ZodValidationPipe -> use case -> repositorio TypeORM
 *   -> banco -> envelope de resposta -> GlobalExceptionFilter.
 * - O wiring real do `SampleModule` (o modulo e importado como esta em
 *   producao, sem provider redeclarado no teste).
 * - Autorizacao por rota (`@Roles` em cada handler) com o `RolesGuard` real.
 * - Isolamento entre tenants, com dois tenants gravados de verdade.
 * - Semantica de soft delete (a linha continua no banco, com `deletedAt`).
 * - Contas de paginacao sobre dados reais.
 * - A propria migration: se ela quebrar, este arquivo nao sobe. Inclusive os
 *   indices unique parciais, que so um banco real pode provar, e a sincronia
 *   entre a migration e a metadata das entidades.
 *
 * NAO cobre — e por que:
 *
 * - **SuperTokens / autenticacao.** O `AppModule` completo chama
 *   `SuperTokens.init()` e o `SuperTokensAuthGuard` exige o core em
 *   `http://localhost:3567`; o job `test-e2e` do CI levanta apenas Postgres (ver
 *   `.github/workflows/ci.yml`). Aqui um middleware fake injeta `req.user` e os
 *   dois guards que consomem esse objeto (`RolesGuard`, `TenantGuard`) rodam de
 *   verdade. Ou seja: isto testa **autorizacao**, nao **autenticacao** — nada
 *   aqui garante que uma sessao invalida receba 401.
 * - **O `TenantContextMiddleware`.** E ele, no app real, quem popula `req.user`:
 *   resolve a sessao do SuperTokens, busca o usuario **ativo** por
 *   `supertokensUserId` e mapeia `SUPERADMIN_SUPERTOKENS_IDS` para
 *   `role: SUPERADMIN` com `tenantId` vazio. O middleware fake abaixo ocupa o
 *   lugar dele, entao nada aqui cobre "sessao valida + usuario inexistente ou
 *   inativo no banco => `req.user` undefined => 403", que e regra de negocio do
 *   middleware — e hoje o template nao tem teste nenhum sobre ela.
 * - **ThrottlerGuard, AuditLogInterceptor, Helmet, CORS, Swagger.** Ficam fora
 *   do modulo de teste; sao montados no `AppModule`/`main.ts`.
 *
 * Para cobrir autenticacao de verdade seria preciso adicionar o servico
 * `supertokens` ao job `test-e2e` do CI.
 *
 * ==========================================================================
 * BANCO
 * ==========================================================================
 *
 * O nome do banco tem de terminar em `_test`: o setup faz `dropSchema` e apagar
 * o banco de desenvolvimento de alguem seria imperdoavel. O CI ja usa
 * `DB_DATABASE=template_db_test`. Localmente o `docker-compose.yml` cria esse
 * banco no primeiro boot do volume; se o seu volume ja existia:
 *
 *   docker compose exec postgres createdb -U postgres template_db_test
 *
 * `process.env` direto e proposital: a regra de ler tudo pelo `ConfigService`
 * vale para codigo de aplicacao, nao para o harness de teste.
 */

const DB_NAME = process.env.DB_DATABASE ?? 'template_db_test';

if (!DB_NAME.endsWith('_test')) {
  throw new Error(
    `Recusando rodar o e2e contra o banco "${DB_NAME}": o setup faz dropSchema. ` +
      'Use um banco com sufixo _test (ex.: DB_DATABASE=template_db_test).',
  );
}

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

const adminOfA: RequestUser = {
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: TENANT_A,
  role: Role.ADMIN,
  supertokensUserId: 'st-admin-a',
};
const userOfA: RequestUser = { ...adminOfA, role: Role.USER };
const adminOfB: RequestUser = { ...adminOfA, tenantId: TENANT_B };

interface SingleBody {
  data: SampleResponseDto;
}
interface ListBody {
  data: SampleResponseDto[];
  meta: { pagination: PaginationMeta };
}
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

/**
 * Recorte do `AppModule` com o minimo para exercitar o modulo `sample` de
 * verdade. O `SampleModule` entra como esta em producao — controller, use cases
 * e o bind do `SAMPLE_REPOSITORY` vem dele, nao de providers redeclarados aqui:
 * assim um erro de wiring no modulo real quebra este teste.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: DB_NAME,
      entities: [
        TenantTypeormEntity,
        UserTypeormEntity,
        AuditLogTypeormEntity,
        SampleTypeormEntity,
      ],
      migrations: [InitialSchema1784953438174],
      // O schema sai da migration, nao de `synchronize`: e isso que faz este
      // teste falhar quando a migration esta errada.
      dropSchema: true,
      migrationsRun: true,
      synchronize: false,
    }),
    SampleModule,
  ],
  providers: [
    // Os guards reais: os dois dependem apenas de `req.user`.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
class SampleE2eModule {}

describe('Samples (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  /** Quem esta chamando. Cada teste troca antes do request. */
  let currentUser: RequestUser | undefined;

  /**
   * `app.getHttpServer()` e tipado como `any`; o cast fica em um lugar so para os
   * testes nao carregarem `any` (o ESLint do projeto roda com
   * `no-unsafe-argument`).
   */
  const api = () => request(app.getHttpServer() as Server);

  const send = async <T>(
    method: 'post' | 'get' | 'patch' | 'delete',
    url: string,
    payload?: object,
    query?: Record<string, string | number>,
  ): Promise<{ status: number; body: T }> => {
    let req = api()[method](url);
    if (query) req = req.query(query);
    const response = await (payload === undefined ? req : req.send(payload));
    return { status: response.status, body: response.body as T };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SampleE2eModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();

    // Substitui o TenantContextMiddleware: no app real e ele quem popula
    // req.user a partir da sessao do SuperTokens (o SuperTokensAuthGuard so
    // grava req.session).
    app.use((req: unknown, _res: unknown, next: () => void) => {
      (req as RequestWithUser).user = currentUser as RequestUser;
      next();
    });

    // Mesmo prefixo e mesmo filtro do main.ts: sem o filtro, as assercoes de
    // envelope de erro estariam testando o formato default do Nest.
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());

    await app.init();

    dataSource = app.get(DataSource);

    // `samples` tem FK para `app_tenants`: os tenants precisam existir.
    const tenants: [string, string, string][] = [
      [TENANT_A, 'Tenant A', '11.111.111/0001-11'],
      [TENANT_B, 'Tenant B', '22.222.222/0001-22'],
    ];
    for (const [id, name, document] of tenants) {
      await dataSource.query(
        `INSERT INTO app_tenants (id, name, document, email, phone) VALUES ($1, $2, $3, $4, $5)`,
        [id, name, document, `${name}@example.com`, '11999999999'],
      );
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    currentUser = adminOfA;
    // DELETE e nao TRUNCATE: TRUNCATE em tabela com FK exigiria CASCADE e
    // levaria os tenants do setup junto.
    await dataSource.query('DELETE FROM samples');
  });

  /** Cria um sample e devolve o corpo, falhando o teste se nao vier 201. */
  const createSample = async (
    payload: Record<string, unknown>,
    as: RequestUser = adminOfA,
  ): Promise<SampleResponseDto> => {
    currentUser = as;
    const { status, body } = await send<SingleBody>(
      'post',
      '/api/v1/samples',
      payload,
    );
    expect(status).toBe(201);
    currentUser = adminOfA;
    return body.data;
  };

  describe('POST /api/v1/samples', () => {
    it('cria o sample e devolve 201 com o envelope { data }', async () => {
      const { status, body } = await send<SingleBody>(
        'post',
        '/api/v1/samples',
        { name: 'Primeiro', description: 'Com descricao' },
      );

      expect(status).toBe(201);
      expect(body).toEqual({
        data: {
          id: expect.any(String),
          tenantId: TENANT_A,
          name: 'Primeiro',
          description: 'Com descricao',
          isActive: true,
          sortOrder: 0,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });
    });

    it('grava a linha com o tenant do chamador, nao com o do body', async () => {
      const created = await createSample({
        name: 'Ignora o body',
        tenantId: TENANT_B,
      });

      const rows = await dataSource.query<{ tenantId: string }[]>(
        'SELECT "tenantId" FROM samples WHERE id = $1',
        [created.id],
      );
      expect(rows[0].tenantId).toBe(TENANT_A);
    });

    it('recusa body invalido com 400 VALIDATION_ERROR e um item por campo', async () => {
      const { status, body } = await send<ErrorBody>(
        'post',
        '/api/v1/samples',
        { name: 'x' },
      );

      expect(status).toBe(400);
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(body.error.details).toEqual([
        { field: 'name', message: expect.any(String) },
      ]);
    });

    it('nao grava nada quando a validacao falha', async () => {
      await send<ErrorBody>('post', '/api/v1/samples', { name: '' });

      const rows = await dataSource.query<unknown[]>('SELECT 1 FROM samples');
      expect(rows).toHaveLength(0);
    });

    it('coloca cada novo sample no fim da lista do tenant', async () => {
      const first = await createSample({ name: 'Um' });
      const second = await createSample({ name: 'Dois' });
      const third = await createSample({ name: 'Tres' });

      // getMaxSortOrder rodando contra o banco de verdade.
      expect([first.sortOrder, second.sortOrder, third.sortOrder]).toEqual([
        0, 1, 2,
      ]);
    });

    it('conta sortOrder por tenant, nao globalmente', async () => {
      await createSample({ name: 'A1' });
      await createSample({ name: 'A2' });

      const firstOfB = await createSample({ name: 'B1' }, adminOfB);

      expect(firstOfB.sortOrder).toBe(0);
    });

    it('ignora o sample soft-deletado ao calcular o fim da lista', async () => {
      const first = await createSample({ name: 'Um' });
      const removed = await send<never>(
        'delete',
        `/api/v1/samples/${first.id}`,
      );
      expect(removed.status).toBe(204);

      const next = await createSample({ name: 'Depois do delete' });

      // `getMaxSortOrder` filtra `deletedAt IS NULL` na mao — o queryBuilder nao
      // herda o filtro do @DeleteDateColumn.
      expect(next.sortOrder).toBe(0);
    });

    it('exige ADMIN: USER recebe 403 AUTH_INSUFFICIENT_ROLE', async () => {
      currentUser = userOfA;

      const { status, body } = await send<ErrorBody>(
        'post',
        '/api/v1/samples',
        { name: 'Tentativa' },
      );

      // Antes o @Roles estava na classe e leitura e escrita compartilhavam
      // permissao: este teste falha se alguem voltar a por @Roles na classe.
      expect(status).toBe(403);
      expect(body.error.code).toBe(ErrorCode.AUTH_INSUFFICIENT_ROLE);
    });
  });

  describe('GET /api/v1/samples', () => {
    it('permite leitura para USER', async () => {
      await createSample({ name: 'Visivel' });
      currentUser = userOfA;

      const { status, body } = await send<ListBody>('get', '/api/v1/samples');

      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
    });

    it('nao lista registros de outro tenant', async () => {
      await createSample({ name: 'Do tenant A' });
      await createSample({ name: 'Do tenant B' }, adminOfB);

      const { body } = await send<ListBody>('get', '/api/v1/samples');

      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Do tenant A');
      expect(body.meta.pagination.total).toBe(1);
    });

    it('devolve meta.pagination coerente com os dados', async () => {
      for (const suffix of ['a', 'b', 'c', 'd', 'e']) {
        await createSample({ name: `nome-${suffix}` });
      }

      const { body } = await send<ListBody>(
        'get',
        '/api/v1/samples',
        undefined,
        { page: 2, perPage: 2 },
      );

      expect(body.data).toHaveLength(2);
      expect(body.meta.pagination).toEqual({
        total: 5,
        page: 2,
        perPage: 2,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      });
    });

    it('ordena por sortOrder crescente', async () => {
      await createSample({ name: 'terceiro', sortOrder: 2 });
      await createSample({ name: 'primeiro', sortOrder: 0 });
      await createSample({ name: 'segundo', sortOrder: 1 });

      const { body } = await send<ListBody>('get', '/api/v1/samples');

      expect(body.data.map((sample) => sample.name)).toEqual([
        'primeiro',
        'segundo',
        'terceiro',
      ]);
    });
  });

  describe('GET /api/v1/samples/:id', () => {
    it('devolve 404 SAMPLE_NOT_FOUND para id inexistente', async () => {
      const { status, body } = await send<ErrorBody>(
        'get',
        `/api/v1/samples/${MISSING_ID}`,
      );

      expect(status).toBe(404);
      expect(body).toEqual({
        error: {
          code: ErrorCode.SAMPLE_NOT_FOUND,
          message: expect.any(String),
        },
      });
    });

    it('devolve 404 (nao 403, nao o registro) para id de outro tenant', async () => {
      const ofA = await createSample({ name: 'Secreto do A' });

      currentUser = adminOfB;
      const { status, body } = await send<ErrorBody>(
        'get',
        `/api/v1/samples/${ofA.id}`,
      );

      expect(status).toBe(404);
      expect(body.error.code).toBe(ErrorCode.SAMPLE_NOT_FOUND);
    });
  });

  describe('PATCH /api/v1/samples/:id', () => {
    /**
     * Regressao do bug que esta PR corrigiu, e o motivo de a rota com `@Param` +
     * `@Body` ter teste proprio. Com `@UsePipes(new ZodValidationPipe(schema))` o
     * pipe roda em TODOS os argumentos do handler, inclusive no `@Param('id')` e
     * no `@TenantId()`: a string chega no schema de objeto e a rota passa a
     * responder 400 sempre, para qualquer body. Com
     * `@Body(new ZodValidationPipe(schema))` so o body e validado.
     */
    it('valida o body sem validar o :id (regressao do @UsePipes)', async () => {
      const created = await createSample({ name: 'Antigo' });

      const { status } = await send<SingleBody>(
        'patch',
        `/api/v1/samples/${created.id}`,
        {},
      );

      expect(status).toBe(200);
    });

    it('atualiza somente os campos enviados', async () => {
      const created = await createSample({
        name: 'Antigo',
        description: 'Mantem',
      });

      const { status, body } = await send<SingleBody>(
        'patch',
        `/api/v1/samples/${created.id}`,
        { name: 'Novo' },
      );

      expect(status).toBe(200);
      expect(body.data.name).toBe('Novo');
      expect(body.data.description).toBe('Mantem');
    });

    it('limpa a description com null explicito', async () => {
      const created = await createSample({
        name: 'Com texto',
        description: 'Apaga isso',
      });

      const { body } = await send<SingleBody>(
        'patch',
        `/api/v1/samples/${created.id}`,
        { description: null },
      );

      expect(body.data.description).toBeNull();
    });

    it('devolve 404 para id de outro tenant e nao altera a linha', async () => {
      const ofA = await createSample({ name: 'Do A' });

      currentUser = adminOfB;
      const { status } = await send<ErrorBody>(
        'patch',
        `/api/v1/samples/${ofA.id}`,
        { name: 'Invadido' },
      );
      expect(status).toBe(404);

      const rows = await dataSource.query<{ name: string }[]>(
        'SELECT name FROM samples WHERE id = $1',
        [ofA.id],
      );
      expect(rows[0].name).toBe('Do A');
    });

    it('exige ADMIN', async () => {
      const created = await createSample({ name: 'Alvo' });
      currentUser = userOfA;

      const { status } = await send<ErrorBody>(
        'patch',
        `/api/v1/samples/${created.id}`,
        { name: 'Novo' },
      );

      expect(status).toBe(403);
    });
  });

  describe('DELETE /api/v1/samples/:id', () => {
    it('faz soft delete: 204 e a linha continua no banco com deletedAt', async () => {
      const created = await createSample({ name: 'Para apagar' });

      const { status } = await send<never>(
        'delete',
        `/api/v1/samples/${created.id}`,
      );
      expect(status).toBe(204);

      const rows = await dataSource.query<{ deletedAt: Date | null }[]>(
        'SELECT "deletedAt" FROM samples WHERE id = $1',
        [created.id],
      );
      // A linha continua la — DELETE fisico nunca.
      expect(rows).toHaveLength(1);
      expect(rows[0].deletedAt).not.toBeNull();
    });

    it('esconde o registro apagado das leituras', async () => {
      const created = await createSample({ name: 'Para apagar' });
      await send<never>('delete', `/api/v1/samples/${created.id}`);

      const single = await send<ErrorBody>(
        'get',
        `/api/v1/samples/${created.id}`,
      );
      expect(single.status).toBe(404);

      const list = await send<ListBody>('get', '/api/v1/samples');
      expect(list.body.data).toHaveLength(0);
      expect(list.body.meta.pagination.total).toBe(0);
    });

    it('devolve 404 no segundo DELETE do mesmo id', async () => {
      const created = await createSample({ name: 'Para apagar' });

      const first = await send<never>(
        'delete',
        `/api/v1/samples/${created.id}`,
      );
      expect(first.status).toBe(204);

      const second = await send<ErrorBody>(
        'delete',
        `/api/v1/samples/${created.id}`,
      );
      expect(second.status).toBe(404);
      expect(second.body.error.code).toBe(ErrorCode.SAMPLE_NOT_FOUND);
    });

    it('exige ADMIN', async () => {
      const created = await createSample({ name: 'Alvo' });
      currentUser = userOfA;

      const { status } = await send<ErrorBody>(
        'delete',
        `/api/v1/samples/${created.id}`,
      );

      expect(status).toBe(403);
    });
  });

  /**
   * Garantias do schema que nao passam pela API. Ficam aqui porque so um banco
   * real prova: os unique que convivem com soft delete sao indices PARCIAIS
   * (`WHERE "deletedAt" IS NULL`). Trocar por um unique comum faz estes testes
   * falharem — e esse era exatamente o bug latente: um registro soft-deletado
   * bloqueando o recadastro do mesmo documento para sempre.
   */
  describe('schema criado pela migration', () => {
    const DOC = '33.333.333/0001-33';

    afterEach(async () => {
      await dataSource.query('DELETE FROM users');
      await dataSource.query('DELETE FROM app_tenants WHERE document = $1', [
        DOC,
      ]);
    });

    const insertTenant = (name: string) =>
      dataSource.query(
        `INSERT INTO app_tenants (name, document, email, phone) VALUES ($1, $2, $3, $4) RETURNING id`,
        [name, DOC, `${name}@example.com`, '11999999999'],
      );

    const insertUser = (
      tenantId: string,
      supertokensUserId: string,
      email: string,
    ) =>
      dataSource.query(
        `INSERT INTO users ("tenantId", "supertokensUserId", name, email, role) VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, supertokensUserId, 'Usuario', email, Role.USER],
      );

    it('impede dois tenants vivos com o mesmo documento', async () => {
      await insertTenant('Original');

      await expect(insertTenant('Duplicado')).rejects.toThrow(
        /duplicate key value/,
      );
    });

    it('libera o documento depois do soft delete', async () => {
      await insertTenant('Original');
      await dataSource.query(
        'UPDATE app_tenants SET "deletedAt" = now() WHERE document = $1',
        [DOC],
      );

      // Com um unique comum, esta linha falharia para sempre.
      await expect(insertTenant('Recadastro')).resolves.toBeDefined();
    });

    it('impede dois usuarios vivos com o mesmo e-mail no mesmo tenant', async () => {
      await insertUser(TENANT_A, 'st-1', 'colisao@example.com');

      // O indice fecha a corrida que o `findByEmail` do use case nao fecha.
      await expect(
        insertUser(TENANT_A, 'st-2', 'colisao@example.com'),
      ).rejects.toThrow(/duplicate key value/);
    });

    it('permite o mesmo e-mail em tenants diferentes', async () => {
      await insertUser(TENANT_A, 'st-a', 'mesmo@example.com');

      // O indice e (tenantId, email): unico por tenant, nao global.
      await expect(
        insertUser(TENANT_B, 'st-b', 'mesmo@example.com'),
      ).resolves.toBeDefined();
    });

    it('libera o e-mail depois do soft delete do usuario', async () => {
      await insertUser(TENANT_A, 'st-1', 'reuso@example.com');
      await dataSource.query(
        'UPDATE users SET "deletedAt" = now() WHERE email = $1',
        ['reuso@example.com'],
      );

      await expect(
        insertUser(TENANT_A, 'st-2', 'reuso@example.com'),
      ).resolves.toBeDefined();
    });

    it('impede dois usuarios vivos com o mesmo supertokensUserId', async () => {
      await insertUser(TENANT_A, 'st-unico', 'primeiro@example.com');

      // O indice de `supertokensUserId` e global, nao por tenant: um usuario do
      // SuperTokens pertence a exatamente uma linha viva de `users`.
      await expect(
        insertUser(TENANT_B, 'st-unico', 'segundo@example.com'),
      ).rejects.toThrow(/duplicate key value/);
    });

    it('libera o supertokensUserId depois do soft delete do usuario', async () => {
      await insertUser(TENANT_A, 'st-reuso', 'primeiro@example.com');
      await dataSource.query(
        'UPDATE users SET "deletedAt" = now() WHERE "supertokensUserId" = $1',
        ['st-reuso'],
      );

      // Com `unique: true` no lugar do indice parcial, o usuario soft-deletado
      // manteria o id do SuperTokens ocupado e o recadastro do MESMO usuario
      // falharia para sempre.
      await expect(
        insertUser(TENANT_A, 'st-reuso', 'segundo@example.com'),
      ).resolves.toBeDefined();
    });

    /**
     * Os testes de indice acima rodam contra o schema que a **migration** criou,
     * nao contra a metadata das entidades: trocar um `@Index(..., { where })` por
     * `@Column({ unique: true })` na entidade nao os quebraria. Este fecha essa
     * porta — `log()` devolve o que um `migration:generate` emitiria agora, e
     * vazio significa "entidades e migration dizem a mesma coisa".
     */
    it('mantem as entidades em sincronia com o schema da migration', async () => {
      const { upQueries } = await dataSource.driver.createSchemaBuilder().log();

      expect(upQueries.map((query) => query.query)).toEqual([]);
    });
  });
});
