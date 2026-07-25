# nestjs-hexagonal-template — Guia do Agente

## Stack

- **Runtime:** Node.js 24 (22.13+ LTS tambem suportado), TypeScript 5
- **Framework:** NestJS 11
- **ORM:** TypeORM 1.1 (PostgreSQL 16)
- **Autenticacao:** SuperTokens
- **Validacao:** Zod 4
- **Docs:** Swagger (@nestjs/swagger)
- **Observabilidade:** OpenTelemetry + Winston
- **Storage:** AWS S3 (LocalStack local)
- **Filas:** BullMQ (@nestjs/bullmq) sobre Redis 7
- **Seguranca:** Helmet, @nestjs/throttler
- **Testes:** Jest + Supertest

---

## Arquitetura

O projeto segue **Arquitetura Hexagonal** (Ports & Adapters). Cada modulo de dominio possui tres camadas:

```
modulo/
├── domain/
│   ├── entities/        # Entidades de dominio (classes puras)
│   └── ports/           # Interfaces (contratos para repositorios e servicos)
├── application/
│   ├── use-cases/       # Casos de uso (@Injectable, metodo execute())
│   ├── dtos/            # Schemas Zod + tipos inferidos
│   └── mappers/         # Classes estaticas para conversao Entity <-> DTO
└── infrastructure/
    ├── http/            # Controllers, decorators de rota
    ├── persistence/     # Repositorios TypeORM, entidades ORM
    └── queue/           # Adapters de fila + processors BullMQ (opcional)
```

### Modulos existentes

| Modulo      | Caminho          | Descricao                                 |
| ----------- | ---------------- | ----------------------------------------- |
| `auth`      | `src/auth/`      | Autenticacao via SuperTokens              |
| `user`      | `src/user/`      | Gestao de usuarios                        |
| `tenant`    | `src/tenant/`    | Multi-tenancy                             |
| `audit-log` | `src/audit-log/` | Log de auditoria                          |
| `health`    | `src/health/`    | Health check (db, storage, redis)         |
| `storage`   | `src/storage/`   | Upload de arquivos (S3)                   |
| `anti-bot`  | `src/anti-bot/`  | Protecao anti-bot em camadas (opt-in)     |
| `queue`     | `src/queue/`     | Conexao BullMQ/Redis compartilhada        |
| `sample`    | `src/sample/`    | Modulo de referencia (pode ser removido)  |
| `common`    | `src/common/`    | Guards, filters, pipes, decorators, utils |

---

## Convencoes Obrigatorias

| Aspecto         | Regra                                                               |
| --------------- | ------------------------------------------------------------------- |
| Idioma codigo   | Ingles para codigo, portugues para mensagens de usuario             |
| Rotas           | kebab-case, plural (`/api/v1/audit-logs`)                           |
| IDs             | UUID v4                                                             |
| Datas           | ISO 8601 (`2024-01-15T10:30:00Z`)                                   |
| Moeda           | Inteiro em centavos (`1999` = R$ 19,99)                             |
| Soft delete     | Campo `deletedAt` (nullable timestamp), nunca DELETE fisico         |
| Respostas       | Envelope `{ data }` sempre; `{ data, meta.pagination }` para listas |
| Codigos de erro | Enum centralizado em `src/common/enums/error-codes.enum.ts`         |
| Multi-tenancy   | Todo recurso possui `tenantId`; filtrar sempre nas queries          |
| Controllers     | Apenas validam entrada (Zod) e delegam ao use case                  |

---

## Padroes de Codigo

### Injecao de dependencia

Ports (interfaces) sao injetados via Symbol tokens:

```typescript
// domain/ports/sample.repository.ts
export const SAMPLE_REPOSITORY = Symbol('SAMPLE_REPOSITORY');

export interface SampleRepository {
  findById(id: string, tenantId: string): Promise<SampleEntity | null>;
}
```

### Use Cases

Cada use case e uma classe `@Injectable()` com um unico metodo `execute()`:

```typescript
@Injectable()
export class CreateSampleUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepository: SampleRepository,
  ) {}

  async execute(
    dto: CreateSampleDto,
    tenantId: string,
  ): Promise<SampleResponseDto> {
    // logica de negocio
  }
}
```

### Repositorios

Repositorios sempre filtram por `tenantId`:

```typescript
async findById(id: string, tenantId: string): Promise<SampleEntity | null> {
  return this.repository.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
}
```

### Mappers

Classes estaticas com metodos `toDto()` e `toEntity()`:

```typescript
export class SampleMapper {
  static toDto(entity: SampleEntity): SampleResponseDto {
    /* ... */
  }
  static toEntity(dto: CreateSampleDto): SampleEntity {
    /* ... */
  }
}
```

### Schemas de validacao

Zod schemas ficam em `application/dtos/`:

```typescript
import { z } from 'zod';

export const createSampleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export type CreateSampleDto = z.infer<typeof createSampleSchema>;
```

### Entidades TypeORM

Entidades ORM ficam em `infrastructure/persistence/` e representam a tabela no banco:

```typescript
@Entity('samples')
export class SampleOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
```

### Filas (BullMQ)

A conexao Redis e registrada uma vez em `src/queue/queue.module.ts`
(`BullModule.forRootAsync` lendo do `ConfigService`, nunca de `process.env`) e e
global: cada modulo de dominio so declara a sua fila. Exemplo completo em
`src/sample/` — quatro arquivos:

| Arquivo                                          | Papel                                                |
| ------------------------------------------------ | ---------------------------------------------------- |
| `domain/ports/sample-queue.port.ts`              | Symbol + interface; a aplicacao nunca importa BullMQ |
| `infrastructure/queue/sample-queue.constants.ts` | Nome da fila e dos jobs (uma unica fonte da verdade) |
| `infrastructure/queue/sample-queue.adapter.ts`   | `@InjectQueue`, politica de retry em um lugar so     |
| `infrastructure/queue/sample.processor.ts`       | `@Processor(NOME)` + `extends WorkerHost`            |

Wiring no modulo: `BullModule.registerQueue({ name })` nos `imports`, o adapter
ligado ao Symbol e o processor como provider comum.

Regras obrigatorias:

- `maxRetriesPerRequest: null` na conexao — o worker usa comandos bloqueantes e
  qualquer outro valor gera erro de conexao confuso.
- Payload de job carrega **somente identificadores** (`{ id, tenantId }`), nunca
  a entidade: o JSON fica parado no Redis e chega desatualizado.
- Todo job leva `tenantId`: o worker roda fora do request e nao tem o
  `TenantContextMiddleware`.
- `process()` precisa ser **idempotente** (entrega at-least-once) e deve deixar o
  erro subir para o BullMQ reagendar; capturar so para logar marca o job como
  concluido com sucesso.
- Falha permanente (registro nao existe mais) retorna sem lancar erro.
- Trabalho que nao pode rodar agora por motivo temporario (rate limit, janela de
  horario): `job.moveToDelayed(ts, job.token)` + `throw new DelayedError()`.
  Nunca `sleep` — dormir ocupa um slot de concorrencia e o job vira _stalled_.
- Rota que apenas enfileira responde `202 Accepted`.

O shutdown ja e coberto: o `@nestjs/bullmq` fecha workers e queues no
`onApplicationShutdown` e o `main.ts` chama `app.enableShutdownHooks()`.

---

## Modulo anti-bot (`src/anti-bot/`)

Camadas independentes para formularios publicos, compostas pelo decorator
`@AntiBot()`. Cada camada resolve um ataque diferente; nenhuma delas basta sozinha.
A tabela esta na ordem em que o stack roda, que e parte do contrato:

| #   | Camada                     | O que para                                                    | Ao pegar                     |
| --- | -------------------------- | ------------------------------------------------------------- | ---------------------------- |
| 1   | `HoneypotGuard`            | bot que preenche todo `<input>` (campo isca `website`)        | **200 falso**                |
| 2   | `FormTokenGuard`           | POST direto sem carregar o form (verifica o token, nao gasta) | 400 (falha **fechada**)      |
| 3   | `TimingGuard`              | submit instantaneo (script) e formulario velho (aba parada)   | 200 falso / 400 expirado     |
| 4   | `TurnstileGuard`           | automacao com navegador real (Puppeteer/Playwright)           | 400 (inerte se desabilitado) |
| 5   | `ChallengeGuard`           | acesso a recurso restrito por resposta combinada fora do site | 400                          |
| 6   | `FormTokenConsumeGuard`    | replay: gasta o `jti` do token, uma submissao por token       | 400                          |
| —   | `BodySanitizerInterceptor` | remove os campos de controle antes do DTO/dominio/audit log   | —                            |

O **200 falso** e deliberado: um 403 diz ao atacante qual campo era a isca ou
quanto tempo esperar, e ele corrige em duas tentativas. Detalhes em
`src/anti-bot/infrastructure/fake-success.ts` — que tambem LOGA todo descarte, para
o bloqueio nao ser invisivel ao operador.

Duas escolhas de ordem que nao devem ser desfeitas (ha teste em
`decorators/anti-bot.decorator.spec.ts`):

- **verificar o form token na 2 e gasta-lo na 6.** As camadas 4 e 5 falham por rede
  ou por erro de digitacao, e as duas mandam "tente novamente"; com o token gasto no
  meio do stack, a segunda tentativa com o mesmo formulario morria em "token ja
  utilizado". O consumo ainda acontece antes do handler, que e o que impede replay
  concorrente.
- **medir o tempo (3) depois de verificar o token (2).** A idade do formulario sai do
  `iat` assinado pelo servidor, nao do relogio do cliente: relogio adiantado produzia
  idade negativa e descartava submissao legitima com um 200 falso.

### Ligando numa rota

```typescript
@Module({
  imports: [AntiBotModule], // obrigatorio: os guards resolvem DI neste modulo
  controllers: [ThingController],
})
export class ThingModule {}

@Post(':slug/messages')
@Public()
@AntiBot({ challengeParam: 'slug' })
@ApiResponse({ status: 400, type: ErrorResponseSwagger })
async create(@Body(new ZodValidationPipe(createMessageSchema)) dto: CreateMessageDto) {}
```

O frontend precisa: chamar `GET /api/v1/anti-bot/form-token` ao renderizar e mandar
o valor no header `x-form-token`; e um input escondido `website` (vazio). O `_t`
(`Date.now()` da renderizacao) e opcional no stack completo — quem manda na janela
de tempo e o `iat` assinado do form token; `_t` so e usado por rota que aplica
`@UseGuards(TimingGuard)` sem form token.

Nao use `@AntiBot()` em rota cujo frontend nao busca form token — o
`FormTokenGuard` falha fechado. Para rotas em que so o CAPTCHA faz sentido
(recuperacao de senha, por exemplo, onde ele ja esta aplicado), use
`@UseGuards(TurnstileGuard)`.

### Desafio por recurso

O `ChallengeGuard` depende do port `CHALLENGE_RESOURCE_RESOLVER`
(`domain/ports/challenge-resource.port.ts`). Sem implementacao ligada ele passa
direto. Ligue no MESMO modulo que declara o controller:

```typescript
providers: [{ provide: CHALLENGE_RESOURCE_RESOLVER, useClass: ThingChallengeResolver }],
```

### Token store

`TOKEN_STORE` guarda os `jti` ja usados. O template traz so o adapter em memoria:
uso unico **por processo**, e um restart/deploy esvazia o registro. Para uso unico
global, implemente o adapter Redis descrito em
`infrastructure/persistence/token-store.provider.ts`. `ANTI_BOT_REDIS_URL` existe
para avisar quem espera esse store compartilhado (nao ha fallback para `REDIS_URL`,
que pertence a fila/cache).

### Default

Inerte, nao desligado: o modulo sobe sempre e publica `GET /api/v1/anti-bot/*`,
mas nenhuma rota existente ganha checagem — as camadas entram por `@AntiBot()`, e
o `TurnstileGuard` das rotas de auth so exige captcha quando
`TURNSTILE_ENABLED=true`. Variaveis em `.env.example`.

---

## Comandos

| Comando                                                                 | Descricao                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run start:dev`                                                     | Inicia em modo watch                                               |
| `npm run build`                                                         | Compila o projeto                                                  |
| `npm run lint`                                                          | Executa ESLint com auto-fix                                        |
| `npm run lint:check`                                                    | ESLint sem auto-fix, `--max-warnings 0` (gate do CI)               |
| `npm run format:check`                                                  | Prettier em modo check, inclui `docs/**/*.md` e `.github/**/*.yml` |
| `npm run typecheck`                                                     | `tsc --noEmit` sobre o projeto inteiro, incluindo `test/`          |
| `npm test`                                                              | Executa testes unitarios                                           |
| `npm run test:e2e`                                                      | Executa testes end-to-end                                          |
| `npm run migration:generate -- src/database/migrations/NomeDaMigration` | Gera nova migration TypeORM (o path e obrigatorio)                 |
| `npm run migration:run`                                                 | Executa migrations pendentes                                       |

---

## Checklist para Nova Feature

1. Criar entidade de dominio em `domain/entities/`
2. Definir port (interface) em `domain/ports/`
3. Criar Zod schema e DTO em `application/dtos/`
4. Implementar mapper em `application/mappers/`
5. Implementar use case em `application/use-cases/`
6. Criar entidade ORM em `infrastructure/persistence/`
7. Implementar repositorio em `infrastructure/persistence/`
8. Criar controller em `infrastructure/http/`
9. Registrar providers no modulo (bind Symbol token ao repositorio concreto)
10. Gerar migration (`npm run migration:generate -- src/database/migrations/NomeDaMigration`)
11. Adicionar testes unitarios para o use case
12. Adicionar testes e2e para o controller
13. Documentar endpoints no Swagger (decorators `@ApiOperation`, `@ApiResponse`)
