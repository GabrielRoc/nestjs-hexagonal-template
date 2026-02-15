# nestjs-hexagonal-template — Guia do Agente

## Stack

- **Runtime:** Node.js 20, TypeScript 5
- **Framework:** NestJS 11
- **ORM:** TypeORM 0.3 (PostgreSQL 16)
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

| Modulo       | Caminho         | Descricao                                |
|--------------|-----------------|------------------------------------------|
| `auth`       | `src/auth/`     | Autenticacao via SuperTokens             |
| `user`       | `src/user/`     | Gestao de usuarios                       |
| `tenant`     | `src/tenant/`   | Multi-tenancy                            |
| `audit-log`  | `src/audit-log/`| Log de auditoria                         |
| `health`     | `src/health/`   | Health check                             |
| `storage`    | `src/storage/`  | Upload de arquivos (S3)                  |
| `sample`     | `src/sample/`   | Modulo de referencia (pode ser removido) |
| `common`     | `src/common/`   | Guards, filters, pipes, decorators, utils|

---

## Convencoes Obrigatorias

| Aspecto         | Regra                                                                 |
|-----------------|-----------------------------------------------------------------------|
| Idioma codigo   | Ingles para codigo, portugues para mensagens de usuario               |
| Rotas           | kebab-case, plural (`/api/v1/audit-logs`)                             |
| IDs             | UUID v4                                                               |
| Datas           | ISO 8601 (`2024-01-15T10:30:00Z`)                                    |
| Moeda           | Inteiro em centavos (`1999` = R$ 19,99)                               |
| Soft delete     | Campo `deletedAt` (nullable timestamp), nunca DELETE fisico           |
| Respostas       | Envelope `{ data, meta? }` para listas; objeto direto para item unico|
| Codigos de erro | Enum centralizado em `common/exceptions/`                             |
| Multi-tenancy   | Todo recurso possui `tenantId`; filtrar sempre nas queries            |
| Controllers     | Apenas validam entrada (Zod) e delegam ao use case                   |

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

  async execute(dto: CreateSampleDto, tenantId: string): Promise<SampleResponseDto> {
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
  static toDto(entity: SampleEntity): SampleResponseDto { /* ... */ }
  static toEntity(dto: CreateSampleDto): SampleEntity { /* ... */ }
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

## Comandos

| Comando                       | Descricao                              |
|-------------------------------|----------------------------------------|
| `npm run start:dev`           | Inicia em modo watch                   |
| `npm run build`               | Compila o projeto                      |
| `npm run lint`                | Executa ESLint com auto-fix            |
| `npm test`                    | Executa testes unitarios               |
| `npm run test:e2e`            | Executa testes end-to-end              |
| `npm run migration:generate`  | Gera nova migration TypeORM            |
| `npm run migration:run`       | Executa migrations pendentes           |

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
10. Gerar migration (`npm run migration:generate`)
11. Adicionar testes unitarios para o use case
12. Adicionar testes e2e para o controller
13. Documentar endpoints no Swagger (decorators `@ApiOperation`, `@ApiResponse`)
