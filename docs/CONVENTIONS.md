# Convencoes do Projeto

Este documento descreve todas as convencoes de codigo, nomeacao, API e banco de dados adotadas no projeto.

---

## Nomeacao

### Arquivos

Todos os arquivos usam **kebab-case** (palavras separadas por hifen, tudo minusculo):

```
create-sample.use-case.ts
sample.typeorm-repository.ts
tenant-context.middleware.ts
```

### Classes

Classes usam **PascalCase**:

```typescript
export class CreateSampleUseCase {}
export class SampleTypeormRepository {}
export class TenantContextMiddleware {}
```

### Variaveis e Funcoes

Variaveis e funcoes usam **camelCase**:

```typescript
const tenantId = req.user.tenantId;
function parsePaginationParams(query) {}
```

### Banco de Dados

Tabelas e colunas usam **snake_case** (convencao do TypeORM com `namingStrategy` padrao):

```sql
CREATE TABLE samples (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

> Nota: no TypeORM, as propriedades da entidade sao `camelCase` e o framework converte automaticamente para `snake_case` no banco.

### Rotas da API

Rotas usam **kebab-case** no plural, sempre versionadas:

```
POST   /api/v1/samples
GET    /api/v1/samples
GET    /api/v1/samples/:id
PATCH  /api/v1/samples/:id
DELETE /api/v1/samples/:id
```

---

## Sufixos de Arquivo

Cada tipo de artefato possui um sufixo padrao para facilitar a identificacao:

| Sufixo                   | Camada         | Descricao                            |
| ------------------------ | -------------- | ------------------------------------ |
| `.entity.ts`             | Domain         | Entidade pura de dominio             |
| `.typeorm-entity.ts`     | Infrastructure | Entidade decorada com TypeORM        |
| `.repository.port.ts`    | Domain         | Interface (port) do repositorio      |
| `.typeorm-repository.ts` | Infrastructure | Implementacao TypeORM do port        |
| `.use-case.ts`           | Application    | Caso de uso                          |
| `.mapper.ts`             | Application    | Conversao entre camadas              |
| `.dto.ts`                | Application    | Schemas Zod e tipos de transferencia |
| `.controller.ts`         | Infrastructure | Controller HTTP NestJS               |
| `.module.ts`             | Infrastructure | Modulo NestJS (wiring)               |
| `.service.ts`            | Domain/Infra   | Domain service ou servico de infra   |
| `.guard.ts`              | Common         | Guard de autorizacao                 |
| `.pipe.ts`               | Common         | Pipe de validacao                    |
| `.middleware.ts`         | Common         | Middleware Express/NestJS            |
| `.filter.ts`             | Common         | Exception filter                     |
| `.interceptor.ts`        | Common         | Interceptor NestJS                   |
| `.decorator.ts`          | Common         | Decorator customizado                |
| `.spec.ts`               | Test           | Arquivo de teste unitario            |
| `.e2e-spec.ts`           | Test           | Arquivo de teste end-to-end          |

---

## Padroes de Resposta da API

### Sucesso -- Recurso Unico

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "tenantId": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Exemplo",
    "description": null,
    "isActive": true,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

Interface TypeScript:

```typescript
interface SingleResponse<T> {
  data: T;
}
```

### Sucesso -- Lista com Paginacao

```json
{
  "data": [
    { "id": "...", "name": "Item 1" },
    { "id": "...", "name": "Item 2" }
  ],
  "meta": {
    "pagination": {
      "total": 42,
      "page": 1,
      "perPage": 20,
      "totalPages": 3,
      "hasNext": true,
      "hasPrevious": false
    }
  }
}
```

Interface TypeScript:

```typescript
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: PaginationMeta;
  };
}

interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
```

### Sucesso -- Sem Conteudo

Para operacoes de exclusao, retornar HTTP **204 No Content** sem body:

```typescript
@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
async remove(
  @Param('id', new UuidValidationPipe()) id: string,
  @TenantId() tenantId: string,
) {
  await this.deleteSampleUseCase.execute(id, tenantId);
}
```

### Erro

```json
{
  "error": {
    "code": "SAMPLE_NOT_FOUND",
    "message": "Amostra nao encontrada",
    "details": null
  }
}
```

Para erros de validacao, o campo `details` contem a lista de problemas:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Erro de validacao",
    "details": [
      {
        "field": "name",
        "message": "String must contain at least 2 character(s)"
      },
      {
        "field": "description",
        "message": "String must contain at most 1000 character(s)"
      }
    ]
  }
}
```

Interface TypeScript:

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

---

## Codigos de Erro

### Formato

Os codigos de erro seguem o padrao `{PREFIXO_MODULO}_{DESCRICAO}`, usando UPPER_SNAKE_CASE:

```
SAMPLE_NOT_FOUND
AUTH_INSUFFICIENT_ROLE
TENANT_CONTEXT_MISSING
USER_EMAIL_ALREADY_EXISTS
```

### Prefixos por Modulo

| Modulo | Prefixo         | Exemplos                                                                       |
| ------ | --------------- | ------------------------------------------------------------------------------ |
| Global | _(sem prefixo)_ | `INTERNAL_ERROR`, `VALIDATION_ERROR`                                           |
| Auth   | `AUTH_`         | `AUTH_INSUFFICIENT_ROLE`, `AUTH_SESSION_EXPIRED`                               |
| Tenant | `TENANT_`       | `TENANT_NOT_FOUND`, `TENANT_CONTEXT_MISSING`, `TENANT_DOCUMENT_ALREADY_EXISTS` |
| User   | `USER_`         | `USER_NOT_FOUND`, `USER_EMAIL_ALREADY_EXISTS`, `USER_LAST_ADMIN`               |
| Sample | `SAMPLE_`       | `SAMPLE_NOT_FOUND`                                                             |

Ao criar um novo modulo, adicione os codigos no enum `ErrorCode` em `src/common/enums/error-codes.enum.ts` seguindo o padrao de prefixo.

### Como Lancar Erros

Use a classe `DomainException`:

```typescript
import { DomainException } from '../../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';

throw new DomainException(
  'SAMPLE_NOT_FOUND',
  'Amostra nao encontrada',
  HttpStatus.NOT_FOUND,
);
```

---

## Validacao

### Zod como Fonte Unica de Verdade

Toda validacao de entrada e feita exclusivamente com **Zod**. Os schemas Zod servem tanto para validacao em runtime quanto para geracao de tipos TypeScript via `z.infer<>`:

```typescript
import { z } from 'zod';

export const createSampleSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
});

export type CreateSampleDto = z.infer<typeof createSampleSchema>;
```

### Pipes no Controller

A validacao e aplicada **sempre no parametro**, nunca com `@UsePipes`:

```typescript
@Post()
async create(
  @Body(new ZodValidationPipe(createSampleSchema)) dto: CreateSampleDto,
  @TenantId() tenantId: string,
) {}

@Patch(':id')
async update(
  @Param('id', new UuidValidationPipe()) id: string,
  @Body(new ZodValidationPipe(updateSampleSchema)) dto: UpdateSampleDto,
) {}
```

**Nunca `@UsePipes(new ZodValidationPipe(schema))`.** O `@UsePipes` no metodo
aplica o pipe a **todos** os argumentos do handler — `@Param`, `@Query`,
`@TenantId`, `@CurrentUser`. A string do id (ou do tenant) e validada contra o
schema de objeto do body e a rota passa a responder **400 sempre**. Nao e um
risco futuro: e o que acontece na primeira vez que a rota ganha qualquer
parametro alem do body. Exemplo correto e comentado em
`src/sample/infrastructure/http/sample.controller.ts`.

**Toda rota com `:id` leva `@Param('id', new UuidValidationPipe())`**
(`src/common/pipes/uuid-validation.pipe.ts`). E o caso que so o pipe por
parametro resolve, e ele existe por um bug concreto: sem validacao a string crua
chega ao `findOne({ where: { id } })` sobre uma coluna `uuid`, o Postgres rejeita
com `22P02 invalid input syntax for type uuid`, o `QueryFailedError` nao e
`HttpException` nem `DomainException` e o `GlobalExceptionFilter` responde **500
`INTERNAL_ERROR`** com stack de banco no log. `GET /api/v1/samples/abc` — de um
cliente com id errado ou de um scanner — virava 5xx e alerta. Com o pipe e 400
`VALIDATION_ERROR`, no mesmo formato de `details` do Zod, e o
`@ApiParam({ format: 'uuid' })` para de prometer uma validacao inexistente. O
`version: '4'` do pipe casa com os ids do template, todos de `gen_random_uuid()`.

### Validacao de CPF e CNPJ

O projeto inclui utilitarios com validacao de checksum em `src/common/utils/`:

```typescript
import { validateCpf } from '../../../common/utils/validate-cpf';
import { validateCnpj } from '../../../common/utils/validate-cnpj';

const documentSchema = z
  .string()
  .refine((val) => validateCpf(val) || validateCnpj(val), {
    message: 'CPF ou CNPJ invalido',
  });
```

---

## Banco de Dados

### Chaves Primarias

Sempre usar **UUID** gerado automaticamente:

```typescript
@PrimaryGeneratedColumn('uuid')
id: string;
```

### Timestamps

Usar **TIMESTAMPTZ** (com timezone) para todas as colunas de data:

```typescript
@CreateDateColumn({ type: 'timestamptz' })
createdAt: Date;

@UpdateDateColumn({ type: 'timestamptz' })
updatedAt: Date;
```

### Valores Monetarios

Usar **DECIMAL(12,2)** para valores monetarios, nunca `float` ou `double`:

```typescript
@Column({ type: 'decimal', precision: 12, scale: 2 })
price: string; // TypeORM retorna decimal como string
```

### Soft Delete

Toda entidade principal deve implementar soft delete com `DeleteDateColumn`:

```typescript
@DeleteDateColumn({ type: 'timestamptz', nullable: true })
deletedAt: Date | null;
```

No repositorio, usar o metodo `softDelete` do TypeORM:

```typescript
async softDelete(id: string, tenantId: string): Promise<void> {
  await this.repo.softDelete({ id, tenantId });
}
```

### Indices Compostos

Indices compostos que envolvam `tenantId` devem lista-lo **primeiro** para otimizar queries filtradas por tenant:

```typescript
@Entity('samples')
@Index(['tenantId', 'name'])
export class SampleTypeormEntity {
  // ...
}
```

### Unique + Soft Delete: sempre indice parcial

Toda restricao de unicidade em tabela com `deletedAt` precisa ser um **indice
parcial** com `WHERE "deletedAt" IS NULL`:

```typescript
// ERRADO: `unique: true` cria um unique comum, que conta a linha soft-deletada
@Column({ type: 'varchar', length: 18, unique: true })
document!: string;

// CERTO: o unique so vale entre as linhas vivas
@Entity('app_tenants')
@Index(['document'], { unique: true, where: '"deletedAt" IS NULL' })
export class TenantTypeormEntity {
  @Column({ type: 'varchar', length: 18 })
  document!: string;
}
```

Com um unique comum, um registro soft-deletado continua ocupando o valor e
**bloqueia para sempre** o recadastro do mesmo documento/e-mail — a operacao de
"apagar e cadastrar de novo" fica impossivel e o erro chega ao usuario como um
conflito sem explicacao.

Declarar como `@Index(..., { where })` na entidade (em vez de escrever o indice
so na migration) mantem entidade e banco em sincronia: o
`migration:generate` gera o indice parcial sozinho e nao acusa diferenca depois.
No template a regra se aplica a `app_tenants.document`,
`users.supertokensUserId` e `users (tenantId, email)`. O bloco
`schema criado pela migration` de `test/sample.e2e-spec.ts` trava esse
comportamento contra um Postgres real, em oito testes: para **cada** um dos tres
indices, o caso que deve falhar (duas linhas vivas com o mesmo valor) e o caso
que deve passar (o mesmo valor depois do soft delete), mais o escopo por tenant
do indice de e-mail e uma checagem de que a metadata das entidades e o schema da
migration nao divergiram (um `migration:generate` agora nao emitiria nada). Sem
esses dois casos, um indice novo e uma garantia que ninguem verifica — e o teste
de indice sozinho nao ve a troca por `unique: true` feita **so** na entidade,
porque ele roda contra o schema da migration.

### Nome da tabela de tenants: `app_tenants`

A tabela e `app_tenants`, nao `tenants`. O SuperTokens self-hosted aponta para o
**mesmo banco** da aplicacao (ver `docker-compose.yml`) e cria a sua propria
`public.tenants` (`app_id`, `tenant_id`) no primeiro boot. Um `tenants` da
aplicacao colide com ela. O mesmo cuidado vale para qualquer tabela nova: o
SuperTokens tambem ocupa `roles`, `user_roles`, `apps`, `session_info`,
`key_value`, entre outras.

### Relacoes com Tenant

Toda entidade multi-tenant deve ter a relacao com `TenantTypeormEntity`:

```typescript
@Column({ type: 'uuid' })
tenantId: string;

@ManyToOne(() => TenantTypeormEntity)
@JoinColumn({ name: 'tenantId' })
tenant: TenantTypeormEntity;
```

---

## Seguranca

### Helmet

Habilitado globalmente no `main.ts` para headers de seguranca HTTP:

```typescript
app.use(helmet());
```

### CORS

Configurado via variavel de ambiente `CORS_ORIGINS` (lista separada por virgula). O parsing (com `trim`) fica em `src/config/app.config.ts` e o `main.ts` consome a lista pelo `ConfigService`. A mesma lista governa o HTTP **e** o handshake de WebSocket, em dois pontos distintos:

```typescript
const corsOrigins = app
  .get(ConfigService)
  .get<string[]>('app.corsOrigins', ['http://localhost:3001']);
app.enableCors({
  origin: corsOrigins,
  credentials: true,
  allowedHeaders: ['content-type', ...SuperTokens.getAllCORSHeaders()],
});

// Obrigatorio: sem esta linha o handshake do Socket.io aceita QUALQUER Origin.
app.useWebSocketAdapter(new RealtimeIoAdapter(app, corsOrigins));
```

O adapter e necessario porque `@WebSocketGateway({ cors: ... })` e avaliado no carregamento da classe, sem container e sem `ConfigService`. Quem escrever outro bootstrap (worker com WS, `main.ts` de teste de integracao, serverless) precisa registrar o `RealtimeIoAdapter` tambem — o gateway loga um `error` no boot quando ele esta ausente. Ver `src/realtime/realtime-io.adapter.ts`.

### Rate Limiting

Implementado com `@nestjs/throttler`, configurado via variaveis de ambiente:

```
THROTTLE_TTL=60000    # Janela de tempo em ms
THROTTLE_LIMIT=100    # Maximo de requisicoes por janela
```

Duas limitacoes que precisam ser conhecidas antes de contar com ele em producao:

- O `ThrottlerGuard` e um `APP_GUARD` e **nao cobre `/api/auth/*`**. Essas rotas sao atendidas pelo middleware Express do `supertokens-nestjs`, que responde sem chamar `next()`: nenhum guard da aplicacao chega a rodar. Login e signup precisam de rate limit por IP no proxy/WAF.
- O storage padrao e **in-memory por processo**. Com varias replicas o limite efetivo e multiplicado pelo numero de processos e o contador zera a cada restart; um limite global exige um storage compartilhado (Redis).

A chave do balde e `req.ip`. Atras de proxy, defina `TRUST_PROXY_HOPS` (ver `.env.example`), senao todos os clientes compartilham o mesmo balde.

### Anti-Bot

Camadas opt-in para formularios publicos (`src/anti-bot/`), aplicadas por rota com
`@AntiBot()`. Variaveis em `.env.example`; a unica obrigatoria em producao e
`ANTI_BOT_TOKEN_SECRET` (chave HMAC dos form tokens). Duas limitacoes conhecidas:

- o registro de tokens usados e **in-memory por processo**, entao o uso unico vale por
  instancia e zera no restart (mesma limitacao do throttler; a solucao tambem e Redis).
  `ANTI_BOT_REDIS_URL` nao liga nada hoje: so registra um aviso no boot para quem
  esperava o store compartilhado. Nao ha fallback para `REDIS_URL`, que pertence a
  fila/cache;
- `TURNSTILE_FAIL_OPEN=true` (default) libera a requisicao quando a Cloudflare esta
  inacessivel — disponibilidade sobre rigor. `false` inverte a escolha.

O modulo **nao adiciona dependencia de producao**, por escolha: a verificacao do
Turnstile usa o `fetch` global do Node (uma chamada HTTP nao justifica
`@nestjs/axios` + `axios` herdados por todo projeto gerado do template) e a limpeza
do registro de tokens e amortizada nas escritas, o que dispensa `@nestjs/schedule`.

Ver a secao "Modulo anti-bot" no `CLAUDE.md` para o que cada camada bloqueia e para a
ordem do stack (que e contrato: o form token e verificado no inicio e gasto no fim).

### URLs Assinadas (S3)

Para acesso a arquivos, usar URLs pre-assinadas com tempo de expiracao configuravel:

```
SIGNED_URL_EXPIRY_SECONDS=900
```

### Segredos

**Nunca** hardcode de secrets no codigo. Toda informacao sensivel deve vir de variaveis de ambiente (`.env`), e o arquivo `.env` esta no `.gitignore`.

---

## Git

### Conventional Commits

Todos os commits devem seguir o padrao [Conventional Commits](https://www.conventionalcommits.org/):

| Prefixo     | Uso                                   |
| ----------- | ------------------------------------- |
| `feat:`     | Nova funcionalidade                   |
| `fix:`      | Correcao de bug                       |
| `chore:`    | Tarefas de manutencao (deps, configs) |
| `refactor:` | Refatoracao sem alterar comportamento |
| `test:`     | Adicao ou correcao de testes          |
| `docs:`     | Documentacao                          |
| `style:`    | Formatacao, whitespace                |
| `perf:`     | Melhoria de performance               |
| `ci:`       | Configuracao de CI/CD                 |

Exemplos:

```
feat: add sample module with CRUD operations
fix: correct tenant isolation in user repository
chore: upgrade nestjs to v11
refactor: extract pagination logic to shared util
test: add unit tests for create-sample use case
docs: update architecture diagram
```

### Nomeacao de Branches

| Tipo       | Padrao                    | Exemplo                      |
| ---------- | ------------------------- | ---------------------------- |
| Feature    | `feature/descricao-curta` | `feature/add-invoice-module` |
| Correcao   | `fix/descricao-curta`     | `fix/tenant-filter-missing`  |
| Manutencao | `chore/descricao-curta`   | `chore/upgrade-typeorm`      |
