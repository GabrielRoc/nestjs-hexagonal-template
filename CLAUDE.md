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
- **Realtime:** Socket.io (`@nestjs/websockets` + `@nestjs/platform-socket.io`)
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

| Modulo           | Caminho               | Descricao                                                                                                                     |
| ---------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `auth`           | `src/auth/`           | Autenticacao via SuperTokens                                                                                                  |
| `user`           | `src/user/`           | Gestao de usuarios                                                                                                            |
| `tenant`         | `src/tenant/`         | Multi-tenancy                                                                                                                 |
| `tenant-feature` | `src/tenant-feature/` | Feature flags por tenant (`@RequiresFeature` + `FeatureGuard`). `FeatureKey` vem vazio: preencha com as chaves do seu projeto |
| `audit-log`      | `src/audit-log/`      | Log de auditoria                                                                                                              |
| `health`         | `src/health/`         | Health check (db, storage, redis)                                                                                             |
| `storage`        | `src/storage/`        | Upload de arquivos (S3)                                                                                                       |
| `anti-bot`       | `src/anti-bot/`       | Protecao anti-bot em camadas (opt-in)                                                                                         |
| `queue`          | `src/queue/`          | Conexao BullMQ/Redis compartilhada                                                                                            |
| `realtime`       | `src/realtime/`       | Eventos em tempo real (Socket.io)                                                                                             |
| `sample`         | `src/sample/`         | Modulo de referencia (pode ser removido)                                                                                      |
| `common`         | `src/common/`         | Guards, filters, pipes, decorators, utils                                                                                     |

### Realtime (`src/realtime/`)

Namespace Socket.io em `/realtime`, autenticado pela sessao do SuperTokens e
isolado por tenant. Nao segue as tres camadas hexagonais: e infraestrutura, como
`storage` e `logger`.

- **Emitir de qualquer modulo:** injete `RealtimeService` (o modulo e `@Global()`)
  e chame `emit(tenantId, event, payload)`. A API e generica de proposito — nao
  adicione metodos por evento de negocio, isso acopla a infra a cada dominio.
- **Isolamento:** cada socket entra na sala `tenant:<tenantId>` no handshake e o
  `emit` so publica nessa sala, nunca no namespace inteiro.
- **Handshake:** o cookie de sessao e verificado com `Session.getSession` e o
  `tenantId` vem do `USER_REPOSITORY`. Sem sessao valida ou sem usuario ativo, o
  socket recebe o evento `unauthorized` e e desconectado. Falha de
  infraestrutura (SuperTokens/JWKS/banco fora) NAO vira `unauthorized`: e logada
  em `error` e o socket cai sem esse evento, para o front reconectar com backoff
  em vez de derrubar a sessao do usuario.
- **A autenticacao vale SO no handshake.** Nao ha revalidacao depois que o
  socket entra na sala: revogar a sessao (logout) ou desativar/remover o usuario
  **nao** derruba um socket ja aberto, que segue recebendo os eventos do tenant
  enquanto a conexao viver (o caminho HTTP, esse sim, bloqueia na requisicao
  seguinte). Revalidar com `getSession` nao resolveria: `client.handshake` e um
  snapshot congelado no upgrade, entao derrubaria todo socket saudavel quando
  aquele access token expirasse. As saidas reais estao documentadas no doc
  comment de `RealtimeGateway`.
- **CORS/Origin:** aplicado pelo `RealtimeIoAdapter`, registrado em `main.ts` com
  as origens de `CORS_ORIGINS`. O decorator `@WebSocketGateway` e avaliado no
  carregamento da classe e nao consegue ler o `ConfigService`, por isso a
  politica vive no adapter. **Se escrever outro bootstrap, registre o adapter** —
  sem ele o handshake nao valida `Origin` (o gateway loga um erro no boot).
- **Cliente:** `io('<host>/realtime', { withCredentials: true })`.

---

## Convencoes Obrigatorias

| Aspecto              | Regra                                                               |
| -------------------- | ------------------------------------------------------------------- |
| Idioma codigo        | Ingles para codigo, portugues para mensagens de usuario             |
| Rotas                | kebab-case, plural (`/api/v1/audit-logs`)                           |
| IDs                  | UUID v4                                                             |
| Datas                | ISO 8601 (`2024-01-15T10:30:00Z`)                                   |
| Moeda                | Inteiro em centavos (`1999` = R$ 19,99)                             |
| Soft delete          | Campo `deletedAt` (nullable timestamp), nunca DELETE fisico         |
| Respostas            | Envelope `{ data }` sempre; `{ data, meta.pagination }` para listas |
| Codigos de erro      | Enum centralizado em `src/common/enums/error-codes.enum.ts`         |
| Multi-tenancy        | Todo recurso possui `tenantId`; filtrar sempre nas queries          |
| Controllers          | Apenas validam entrada (Zod) e delegam ao use case                  |
| Validacao            | `@Body(new ZodValidationPipe(schema))`; **nunca** `@UsePipes(...)`  |
| Param de rota        | `@Param('id', new UuidValidationPipe())` em toda rota com `:id`     |
| Autorizacao          | `@Roles(...)` por rota; **nunca** na classe                         |
| Unique + soft delete | Indice parcial `WHERE "deletedAt" IS NULL`                          |

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

### Schemas de validacao e classes Swagger

O arquivo de DTO carrega os schemas Zod (validacao em runtime) **e** as classes
Swagger (contrato publicado) juntos, em blocos separados por comentario: quando
um campo muda, os dois estao na mesma tela. Referencia:
`src/sample/application/dtos/sample.dto.ts`.

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createSampleSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
});

export type CreateSampleDto = z.infer<typeof createSampleSchema>;

export class CreateSampleSwagger {
  @ApiProperty({ example: 'Primeiro registro', minLength: 2, maxLength: 255 })
  name!: string;
}

// Respostas declaram o ENVELOPE, nunca a entidade solta: `type: SampleSwagger`
// direto publica um contrato que a API nao cumpre.
export class SampleResponseSwagger {
  @ApiProperty({ type: SampleSwagger })
  data!: SampleSwagger;
}
```

### Controllers

```typescript
@ApiTags('Samples')
@ApiCookieAuth()
@Controller('v1/samples')
export class SampleController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN) // por rota, nunca na classe
  @ApiOperation({ summary: 'Create a sample' })
  @ApiBody({ type: CreateSampleSwagger })
  @ApiResponse({ status: 201, type: SampleResponseSwagger })
  @ApiResponse({ status: 400, type: ErrorResponseSwagger })
  async create(
    @Body(new ZodValidationPipe(createSampleSchema)) dto: CreateSampleDto,
    @TenantId() tenantId: string,
  ) {
    return { data: await this.createSampleUseCase.execute(dto, tenantId) };
  }
}
```

Tres regras, todas por bug real e nao por estilo:

- **Nunca `@UsePipes(new ZodValidationPipe(schema))`.** O `@UsePipes` aplica o
  pipe a **todos** os argumentos do handler — `@Param`, `@Query`, `@TenantId`,
  `@CurrentUser`. A string do id/tenant e validada contra o schema de objeto do
  body e a rota responde **400 sempre**. `test/sample.e2e-spec.ts` tem o teste de
  regressao ("regressao do @UsePipes").
- **Sempre `@Param('id', new UuidValidationPipe())`** (de
  `src/common/pipes/uuid-validation.pipe.ts`) em toda rota com `:id`. O outro lado
  da regra acima, e o caso que so um pipe **por parametro** resolve: sem ele a
  string crua chega a uma coluna `uuid`, o Postgres estoura
  `22P02 invalid input syntax for type uuid`, o `QueryFailedError` nao e
  `HttpException` nem `DomainException` e o `GlobalExceptionFilter` devolve **500
  `INTERNAL_ERROR`** — qualquer id errado de qualquer cliente virava 5xx com stack
  de banco no log. Com o pipe e 400 `VALIDATION_ERROR`, no mesmo formato de
  `details` do Zod, e o `format: 'uuid'` do `@ApiParam` deixa de prometer uma
  validacao que nao existe.
- **Nunca `@Roles(...)` na classe.** Na classe, leitura e escrita compartilham
  permissao: quem pode listar passa a poder apagar. Leitura costuma ser
  `ADMIN, USER`; escrita, `ADMIN`.

### Entidades TypeORM

Entidades ORM ficam em `infrastructure/persistence/` e representam a tabela no banco:

```typescript
@Entity('samples')
// Indice composto sempre comecando por tenantId
@Index(['tenantId', 'name'])
export class SampleOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
```

Unicidade em tabela com soft delete e **indice parcial**, nunca `unique: true`:

```typescript
@Index(['document'], { unique: true, where: '"deletedAt" IS NULL' })
```

Com um unique comum, a linha soft-deletada continua ocupando o valor e bloqueia
para sempre o recadastro do mesmo documento/e-mail. Detalhes e a lista dos
indices do template em `docs/CONVENTIONS.md`.

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

- **Nao** declare `maxRetriesPerRequest` na conexao compartilhada: o BullMQ ja
  forca `null` na conexao bloqueante do worker (e nao emite aviso quando a chave
  e omitida), enquanto no produtor `null` faz o `queue.add()` ficar pendurado no
  request em vez de falhar.
- Todo `add()` do adapter tem **timeout explicito** (`Promise.race`, ver
  `sample-queue.adapter.ts`) e traduz o estouro em `QUEUE_UNAVAILABLE` /
  `503`: com o Redis fora do ar a espera do `add()` nao termina e a resposta
  HTTP nunca sai.
- Todo processor registra `@OnWorkerEvent('failed')` e `@OnWorkerEvent('error')`
  logando em `logger.error`: o BullMQ descarta esses eventos quando nao ha
  listener, e job que esgota `attempts` desapareceria sem uma linha de log.
- `backoff: { type: 'exponential', delay }` espera `2^(tentativa-1) * delay`;
  `attempts: 3` produz 2 reagendamentos (com `delay: 30000`, 30s e 60s).
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
  Nunca `sleep` — dormir ocupa um slot de concorrencia sem fazer nada e para a
  fila (o lock em si continua sendo renovado pelo timer do BullMQ).
- Rota que apenas enfileira responde `202 Accepted`.

O shutdown ja e coberto: o `@nestjs/bullmq` fecha workers e queues no
`onApplicationShutdown` e o `main.ts` chama `app.enableShutdownHooks()`.
---

## Convencoes de teste

Testes sao lidos como documentacao: cada `it` deve ensinar algo que o leitor
precisa saber (isolamento entre tenants, not-found, soft delete, conta de
paginacao). Referencias: `src/sample/application/use-cases/*.spec.ts`,
`src/common/filters/global-exception.filter.spec.ts`, `test/sample.e2e-spec.ts`.

**As seis regras — obrigatorias:**

1. **Instanciar com `new`, sem `Test.createTestingModule`.** Um use case recebe
   ports pelo construtor; montar o container do Nest so deixa o teste lento e
   acoplado ao wiring do modulo. Reserve `Test.createTestingModule` para o e2e,
   onde o objetivo e justamente o app montado.
2. **Mockar so o que e usado, via `jest.Mocked<Pick<Port, 'x' | 'y'>>`.** Se o
   use case passar a chamar um metodo novo, o teste deixa de **compilar** — em
   vez de estourar `undefined is not a function` em runtime. Mockar o port
   inteiro esconde essa mudanca.
3. **Fabrica com overrides `Partial<Entity>`** (`test/factories/`). Cada teste
   sobrescreve apenas o campo de que a assercao depende — o resto vem do padrao,
   com datas fixas e nunca `new Date()`.
4. **Assercao de falha em `code` + `httpStatus`, nunca no texto da mensagem.** A
   mensagem e em portugues, para o usuario, e sera reescrita; o `code` e o
   contrato:
   ```typescript
   await expect(useCase.execute(id, tenantId)).rejects.toMatchObject({
     code: ErrorCode.SAMPLE_NOT_FOUND,
     httpStatus: HttpStatus.NOT_FOUND,
   });
   ```
5. **Assertar o negativo** e `jest.restoreAllMocks()` no `afterEach`. Sem
   `expect(repo.save).not.toHaveBeenCalled()` o teste nao distingue "recusou
   antes de gravar" de "gravou e depois reclamou".
6. **Spec ao lado do arquivo testado**, mesmo diretorio e mesmo nome com
   `.spec.ts` (`create-sample.use-case.ts` -> `create-sample.use-case.spec.ts`).
   Sem pasta `__tests__/`: com o spec ao lado, mover ou apagar o fonte leva o
   teste junto e o import e sempre `./arquivo`. Em `test/` ficam **somente** as
   fabricas (`test/factories/`) e os e2e (`test/*.e2e-spec.ts`), que nao
   pertencem a nenhum diretorio de fonte. O `testRegex` do Jest (`.*\.spec\.ts$`)
   aceita as duas formas, entao ninguem vai ser avisado por uma falha: a regra
   esta escrita aqui justamente por isso.

**Testes e2e** (`test/*.e2e-spec.ts`) rodam contra um Postgres real com o schema
criado pela migration (`dropSchema` + `migrationsRun`) — se a migration quebrar,
o e2e nao sobe — **e contra um Redis real**. Os dois tem guarda de isolamento e o
harness recusa rodar sem ela: o banco tem de terminar em `_test` e a fila roda em
`prefix`/`db` proprios (`bull-e2e`, `db` 15). O `docker-compose.yml` cria
`template_db_test` no primeiro boot do volume e ja sobe o Redis. O que o e2e cobre
e o que ele **nao** cobre esta no cabecalho de `test/sample.e2e-spec.ts` — leia
antes de confiar na cobertura.

Duas regras que valem para qualquer e2e novo deste template:

- **Modulo de teste e recorte do `AppModule`, e recorte leva as dependencias
  globais.** Um modulo de dominio que declara fila (`registerQueue` +
  `@Processor`) so sobe com um `BullModule.forRoot`/`forRootAsync` no recorte —
  no app real quem faz isso e o `QueueModule`. Sem ele o `app.init()` estoura
  `Worker requires a connection` no `onModuleInit` do `@nestjs/bullmq` e **todos**
  os testes do arquivo falham, com Redis de pe ou nao. Importar o modulo real e o
  ponto: e o que faz um erro de wiring aparecer no teste em vez de em producao.
  Diagnostico: arquivo de e2e que falha **inteiro em menos de 1s** e dependencia
  de modulo faltando; Redis fora do ar derruba so os testes de fila, e devagar.
- **O Redis do e2e tem namespace proprio — e obrigatorio.** O e2e declara o seu
  `BullModule.forRoot` com `prefix` `bull-e2e` e `db` 15 em vez de importar o
  `QueueModule`, e recusa rodar com prefixo sem `e2e` (a guarda equivalente ao
  sufixo `_test` do banco). Motivo: o `@Processor` sobe um Worker **de verdade** no
  `app.init()`; no namespace default (`bull:<fila>`) ele **consome** os jobs
  pendentes do Redis de quem rodou o teste, e como o registro nao existe no banco
  de teste o job termina em `completed` e e descartado — dano silencioso, sem erro
  nenhum. Nao chamar `queue.obliterate()` nao protege: consumir destroi igual. O
  `prefix` do `forRoot` vale para os dois lados (`@nestjs/bullmq` monta o Worker a
  partir das opcoes resolvidas da Queue), entao produtor e consumidor continuam
  reais.
- **Fila com Redis real, nao dobro em memoria.** Substituir o port de fila por um
  stub no e2e faz o teste parar na borda do port — nada prova que
  `registerQueue`, `@InjectQueue` e `@Processor` apontam para a mesma fila nem que
  o job chega ao worker. Assercao de efeito assincrono e por **polling com
  prazo** (helper `waitUntil` em `test/sample.e2e-spec.ts`), nunca `setTimeout`
  fixo. Dentro do namespace do harness a fila nao e limpa em massa: cada assercao
  filtra os jobs pelo id que ela mesma criou.

**Duas decisoes de configuracao, para nao serem revertidas por engano:**

- `npm test` **nao** usa `--passWithNoTests`. Com a flag, uma falha de descoberta
  (mudanca em `rootDir`/`testRegex`, specs movidos) faz o Jest imprimir
  `No tests found, exiting with code 0` e o CI fica verde sem rodar teste nenhum.
- **Nao ha `coverageThreshold`.** O numero global do template nao mede o que
  parece medir e um limite ou reprova o clone no primeiro dia ou nao trava nada.
  Quando o projeto tiver modulos reais, configure um limite **por diretorio**
  (ex.: `application/use-cases/`) em vez de um global. O `collectCoverageFrom` do
  `package.json` ja exclui wiring (modules, DTOs, classes Swagger, entidades ORM,
  `main.ts`, config, migrations) para o relatorio ser informativo.

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

| Comando                                                                 | Descricao                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run start:dev`                                                     | Inicia em modo watch                                                   |
| `npm run build`                                                         | Compila o projeto                                                      |
| `npm run lint`                                                          | Executa ESLint com auto-fix                                            |
| `npm run lint:check`                                                    | ESLint sem auto-fix, `--max-warnings 0` (gate do CI)                   |
| `npm run format:check`                                                  | Prettier em modo check, inclui `docs/**/*.md` e `.github/**/*.yml`     |
| `npm run typecheck`                                                     | `tsc --noEmit` sobre o projeto inteiro, incluindo `test/`              |
| `npm test`                                                              | Executa testes unitarios (sem `--passWithNoTests`, de proposito)       |
| `npm run test:cov`                                                      | Cobertura (informativa; nao ha `coverageThreshold`)                    |
| `npm run test:e2e`                                                      | E2E contra Postgres + Redis; exige `DB_DATABASE` terminando em `_test` |
| `npm run migration:generate -- src/database/migrations/NomeDaMigration` | Gera nova migration TypeORM (o path e obrigatorio)                     |
| `npm run migration:run`                                                 | Executa migrations pendentes                                           |

---

## Checklist para Nova Feature

1. Criar entidade de dominio em `domain/entities/`
2. Definir port (interface) em `domain/ports/`
3. Criar Zod schema, DTO e classes Swagger em `application/dtos/` (mesmo arquivo)
4. Implementar mapper em `application/mappers/`
5. Implementar use case em `application/use-cases/`
6. Criar entidade ORM em `infrastructure/persistence/`
7. Implementar repositorio em `infrastructure/persistence/`
8. Criar controller em `infrastructure/http/`
9. Registrar providers no modulo (bind Symbol token ao repositorio concreto)
10. Gerar migration (`npm run migration:generate -- src/database/migrations/NomeDaMigration`;
    exige um Postgres de pe — o comando compara a metadata com o schema real)
11. Adicionar testes unitarios para o use case (ver "Convencoes de teste")
12. Adicionar testes e2e para o controller, cobrindo isolamento entre tenants e o
    papel exigido em cada rota
13. Documentar endpoints no Swagger (`@ApiOperation`, `@ApiParam`/`@ApiQuery`,
    `@ApiBody`, um `@ApiResponse` por status, erros com `ErrorResponseSwagger`)
