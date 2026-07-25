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
    └── persistence/     # Repositorios TypeORM, entidades ORM
```

### Modulos existentes

| Modulo      | Caminho          | Descricao                                 |
| ----------- | ---------------- | ----------------------------------------- |
| `auth`      | `src/auth/`      | Autenticacao via SuperTokens              |
| `user`      | `src/user/`      | Gestao de usuarios                        |
| `tenant`    | `src/tenant/`    | Multi-tenancy                             |
| `audit-log` | `src/audit-log/` | Log de auditoria                          |
| `health`    | `src/health/`    | Health check                              |
| `storage`   | `src/storage/`   | Upload de arquivos (S3)                   |
| `anti-bot`  | `src/anti-bot/`  | Protecao anti-bot em camadas (opt-in)     |
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

---

## Modulo anti-bot (`src/anti-bot/`)

Cinco camadas independentes para formularios publicos, compostas pelo decorator
`@AntiBot()`. Cada camada resolve um ataque diferente; nenhuma delas basta sozinha.

| Camada                     | O que para                                                    | Ao pegar                     |
| -------------------------- | ------------------------------------------------------------- | ---------------------------- |
| `HoneypotGuard`            | bot que preenche todo `<input>` (campo isca `website`)        | **200 falso**                |
| `TimingGuard`              | submit instantaneo (script) e formulario velho (replay/aba)   | 200 falso / 400 expirado     |
| `FormTokenGuard`           | POST direto sem carregar o form, e reenvio do mesmo corpo     | 400 (falha **fechada**)      |
| `ChallengeGuard`           | acesso a recurso restrito por resposta combinada fora do site | 400                          |
| `TurnstileGuard`           | automacao com navegador real (Puppeteer/Playwright)           | 400 (inerte se desabilitado) |
| `BodySanitizerInterceptor` | remove os campos de controle antes do DTO/dominio/audit log   | —                            |

O **200 falso** e deliberado: um 403 diz ao atacante qual campo era a isca ou
quanto tempo esperar, e ele corrige em duas tentativas. Detalhes em
`src/anti-bot/infrastructure/fake-success.ts`.

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

O frontend precisa: chamar `GET /api/v1/anti-bot/form-token` ao renderizar e
mandar o valor no header `x-form-token`; enviar `_t` com `Date.now()` da
renderizacao; e um input escondido `website` (vazio).

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
`infrastructure/persistence/token-store.provider.ts`.

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
