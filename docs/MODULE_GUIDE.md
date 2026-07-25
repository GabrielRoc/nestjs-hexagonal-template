# Guia para Criar um Novo Modulo

Este guia descreve o passo a passo para criar um novo modulo seguindo a arquitetura hexagonal do projeto. Usamos o modulo `sample/` como referencia em todos os exemplos.

---

## Estrutura Final

Ao concluir, seu modulo tera a seguinte estrutura:

```
src/meu-modulo/
  domain/
    entities/
      meu-modulo.entity.ts
    ports/
      meu-modulo.repository.port.ts
    services/
      meu-modulo-domain.service.ts     (opcional)
  application/
    dtos/
      meu-modulo.dto.ts
    mappers/
      meu-modulo.mapper.ts
    use-cases/
      create-meu-modulo.use-case.ts
      get-meu-modulo.use-case.ts
      list-meu-modulos.use-case.ts
      update-meu-modulo.use-case.ts
      delete-meu-modulo.use-case.ts
  infrastructure/
    http/
      meu-modulo.controller.ts
    persistence/
      meu-modulo.typeorm-entity.ts
      meu-modulo.typeorm-repository.ts
    queue/                               (opcional -- ver Passo 15)
      meu-modulo-queue.constants.ts
      meu-modulo-queue.adapter.ts
      meu-modulo.processor.ts
    meu-modulo.module.ts
```

---

## Passo 1: Criar a Entidade de Dominio

A entidade de dominio e uma classe TypeScript pura, sem nenhuma dependencia externa.

**Arquivo:** `src/meu-modulo/domain/entities/meu-modulo.entity.ts`

Exemplo do `sample/`:

```typescript
// src/sample/domain/entities/sample.entity.ts
export class Sample {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(props: {
    id?: string;
    tenantId: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date | null;
  }) {
    this.id = props.id ?? '';
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description ?? null;
    this.isActive = props.isActive ?? true;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }
}
```

**Regras:**

- Nenhum `import` de bibliotecas externas (NestJS, TypeORM, etc.)
- O `id` recebe string vazia como default porque sera gerado pelo banco
- O `tenantId` e obrigatorio para garantir multitenancy
- Sempre incluir `createdAt`, `updatedAt` e `deletedAt` para soft delete

---

## Passo 2: Criar o Port (Interface do Repositorio)

O port define o contrato de persistencia como uma interface, acompanhada de um Symbol para injecao de dependencia.

**Arquivo:** `src/meu-modulo/domain/ports/meu-modulo.repository.port.ts`

Exemplo do `sample/`:

```typescript
// src/sample/domain/ports/sample.repository.port.ts
import { Sample } from '../entities/sample.entity';

export const SAMPLE_REPOSITORY = Symbol('SAMPLE_REPOSITORY');

export interface SampleRepositoryPort {
  save(sample: Sample): Promise<Sample>;
  findById(id: string, tenantId: string): Promise<Sample | null>;
  findAll(
    tenantId: string,
    page: number,
    perPage: number,
  ): Promise<[Sample[], number]>;
  update(sample: Sample): Promise<Sample>;
  softDelete(id: string, tenantId: string): Promise<void>;
}
```

**Regras:**

- O Symbol e exportado como constante (UPPER_SNAKE_CASE)
- Todos os metodos de leitura recebem `tenantId` como parametro para isolamento
- `findAll` retorna uma tupla `[entidades[], total]` para paginacao
- Apenas tipos do dominio sao usados (nunca DTOs ou entidades TypeORM)

---

## Passo 3: Criar Domain Service (Opcional)

Domain services contem regras de negocio que nao pertencem naturalmente a uma unica entidade. Sao classes com metodos estaticos puros.

**Arquivo:** `src/meu-modulo/domain/services/meu-modulo-domain.service.ts`

Exemplo do `sample/`:

```typescript
// src/sample/domain/services/sample-domain.service.ts
import { Sample } from '../entities/sample.entity';

export class SampleDomainService {
  /**
   * Validar uma regra de negocio antes de criar um sample
   */
  static validateName(name: string): boolean {
    return name.length >= 2 && name.length <= 255;
  }

  /**
   * Verificar se o sample pode ser desativado
   */
  static canDeactivate(sample: Sample): boolean {
    return sample.isActive;
  }
}
```

**Regras:**

- Nenhuma dependencia de infraestrutura
- Metodos estaticos e puros (sem estado)
- Apenas logica de negocio que nao cabe em uma entidade isolada

---

## Passo 4: Criar DTOs (Schemas Zod)

Os DTOs sao definidos como schemas Zod, servindo como fonte unica de verdade para validacao e tipagem.

**Arquivo:** `src/meu-modulo/application/dtos/meu-modulo.dto.ts`

Exemplo do `sample/`:

```typescript
// src/sample/application/dtos/sample.dto.ts
import { z } from 'zod';

// Schema de criacao
export const createSampleSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
});

// Schema de atualizacao (todos os campos opcionais)
export const updateSampleSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
});

// Schema de query para listagem
export const listSamplesQuerySchema = z.object({
  page: z.string().optional().default('1'),
  perPage: z.string().optional().default('20'),
});

// Tipos inferidos dos schemas
export type CreateSampleDto = z.infer<typeof createSampleSchema>;
export type UpdateSampleDto = z.infer<typeof updateSampleSchema>;
export type ListSamplesQuery = z.infer<typeof listSamplesQuerySchema>;

// Interface de resposta (manual, pois datas sao convertidas para string)
export interface SampleResponseDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Regras:**

- Schemas de criacao: todos os campos obrigatorios presentes
- Schemas de atualizacao: todos os campos com `.optional()`
- Schemas de query: campos como `string` (query params sao sempre string)
- O `ResponseDto` e uma interface separada porque datas sao serializadas como ISO string
- Tipos sao inferidos com `z.infer<>` -- nunca duplicar manualmente

---

## Passo 5: Criar o Mapper

O mapper converte entre as diferentes representacoes de dados nas camadas.

**Arquivo:** `src/meu-modulo/application/mappers/meu-modulo.mapper.ts`

Exemplo do `sample/`:

```typescript
// src/sample/application/mappers/sample.mapper.ts
import { Sample } from '../../domain/entities/sample.entity';
import type { CreateSampleDto, SampleResponseDto } from '../dtos/sample.dto';

export class SampleMapper {
  /**
   * Converte entidade de dominio para DTO de resposta
   */
  static toResponse(entity: Sample): SampleResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      description: entity.description,
      isActive: entity.isActive,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /**
   * Converte DTO de criacao para entidade de dominio
   */
  static toDomain(dto: CreateSampleDto, tenantId: string): Sample {
    return new Sample({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
    });
  }
}
```

**Regras:**

- Metodos estaticos (a classe nao precisa ser instanciada)
- `toResponse()` converte `Date` para `string` ISO
- `toDomain()` recebe o `tenantId` como parametro separado (vem do contexto, nao do body)
- Nunca expor campos internos (como `deletedAt`) na resposta

---

## Passo 6: Criar os Use Cases

Cada operacao tem seu proprio use case. Isso mantém o codigo focado e facilita testes.

### Use Case de Criacao

**Arquivo:** `src/meu-modulo/application/use-cases/create-meu-modulo.use-case.ts`

```typescript
// src/sample/application/use-cases/create-sample.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import type { CreateSampleDto, SampleResponseDto } from '../dtos/sample.dto';
import { SampleMapper } from '../mappers/sample.mapper';

@Injectable()
export class CreateSampleUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {}

  async execute(
    dto: CreateSampleDto,
    tenantId: string,
  ): Promise<SampleResponseDto> {
    const sample = SampleMapper.toDomain(dto, tenantId);
    const saved = await this.sampleRepo.save(sample);
    return SampleMapper.toResponse(saved);
  }
}
```

### Use Case de Listagem com Paginacao

**Arquivo:** `src/meu-modulo/application/use-cases/list-meu-modulos.use-case.ts`

```typescript
// src/sample/application/use-cases/list-samples.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  SAMPLE_REPOSITORY,
  type SampleRepositoryPort,
} from '../../domain/ports/sample.repository.port';
import type { SampleResponseDto } from '../dtos/sample.dto';
import { SampleMapper } from '../mappers/sample.mapper';
import {
  parsePaginationParams,
  buildPaginationMeta,
} from '../../../common/utils/pagination.util';
import type { PaginatedResponse } from '../../../common/interfaces';

@Injectable()
export class ListSamplesUseCase {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {}

  async execute(
    tenantId: string,
    query: { page?: string; perPage?: string },
  ): Promise<PaginatedResponse<SampleResponseDto>> {
    const { page, perPage } = parsePaginationParams(query);
    const [samples, total] = await this.sampleRepo.findAll(
      tenantId,
      page,
      perPage,
    );

    return {
      data: samples.map(SampleMapper.toResponse),
      meta: {
        pagination: buildPaginationMeta(total, page, perPage),
      },
    };
  }
}
```

**Regras:**

- Cada use case e `@Injectable()` e recebe dependencias via `@Inject(SYMBOL)`
- O metodo principal sempre se chama `execute()`
- Use cases usam apenas ports (interfaces), nunca implementacoes concretas
- Paginacao usa os utilitarios compartilhados `parsePaginationParams` e `buildPaginationMeta`

---

## Passo 7: Criar a Entidade TypeORM

A entidade TypeORM e uma representacao da tabela no banco de dados, com decorators de persistencia.

**Arquivo:** `src/meu-modulo/infrastructure/persistence/meu-modulo.typeorm-entity.ts`

Exemplo do `sample/`:

```typescript
// src/sample/infrastructure/persistence/sample.typeorm-entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TenantTypeormEntity } from '../../../tenant/infrastructure/persistence/tenant.typeorm-entity';

@Entity('samples')
@Index(['tenantId', 'name'])
export class SampleTypeormEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantTypeormEntity)
  @JoinColumn({ name: 'tenantId' })
  tenant: TenantTypeormEntity;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
```

**Regras:**

- Nome da tabela no plural e snake_case (`@Entity('samples')`)
- PK sempre UUID (`@PrimaryGeneratedColumn('uuid')`)
- Timestamps com `timestamptz`
- Soft delete com `@DeleteDateColumn`
- Indice composto com `tenantId` como primeiro campo
- Relacao `@ManyToOne` com `TenantTypeormEntity`

---

## Passo 8: Criar o Repositorio (Adapter)

O repositorio TypeORM implementa o port definido no dominio, fazendo a conversao entre entidades TypeORM e entidades de dominio.

**Arquivo:** `src/meu-modulo/infrastructure/persistence/meu-modulo.typeorm-repository.ts`

Exemplo do `sample/`:

```typescript
// src/sample/infrastructure/persistence/sample.typeorm-repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SampleTypeormEntity } from './sample.typeorm-entity';
import { Sample } from '../../domain/entities/sample.entity';
import type { SampleRepositoryPort } from '../../domain/ports/sample.repository.port';

@Injectable()
export class SampleTypeormRepository implements SampleRepositoryPort {
  constructor(
    @InjectRepository(SampleTypeormEntity)
    private readonly repo: Repository<SampleTypeormEntity>,
  ) {}

  async save(sample: Sample): Promise<Sample> {
    const entity = this.repo.create({
      tenantId: sample.tenantId,
      name: sample.name,
      description: sample.description,
      isActive: sample.isActive,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async findById(id: string, tenantId: string): Promise<Sample | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAll(
    tenantId: string,
    page: number,
    perPage: number,
  ): Promise<[Sample[], number]> {
    const [entities, total] = await this.repo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return [entities.map((e) => this.toDomain(e)), total];
  }

  async update(sample: Sample): Promise<Sample> {
    await this.repo.update(
      { id: sample.id, tenantId: sample.tenantId },
      {
        name: sample.name,
        description: sample.description,
        isActive: sample.isActive,
      },
    );
    const updated = await this.repo.findOneOrFail({
      where: { id: sample.id, tenantId: sample.tenantId },
    });
    return this.toDomain(updated);
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.repo.softDelete({ id, tenantId });
  }

  private toDomain(entity: SampleTypeormEntity): Sample {
    return new Sample({
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      description: entity.description,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }
}
```

**Regras:**

- Implementa a interface do port (`implements SampleRepositoryPort`)
- Todas as queries filtram por `tenantId` para isolamento multi-tenant
- Metodo privado `toDomain()` converte entidade TypeORM para entidade de dominio
- O `update` usa `tenantId` no `WHERE` para evitar acesso cruzado
- Soft delete usa `repo.softDelete()` que preenche `deletedAt`

---

## Passo 9: Criar o Controller

O controller e o ponto de entrada HTTP, responsavel por validacao, roteamento e delegacao para use cases.

**Arquivo:** `src/meu-modulo/infrastructure/http/meu-modulo.controller.ts`

Exemplo do `sample/`:

```typescript
// src/sample/infrastructure/http/sample.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles, TenantId } from '../../../common/decorators';
import { Role } from '../../../common/enums/role.enum';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createSampleSchema,
  updateSampleSchema,
} from '../../application/dtos/sample.dto';
import type {
  CreateSampleDto,
  UpdateSampleDto,
} from '../../application/dtos/sample.dto';
import { CreateSampleUseCase } from '../../application/use-cases/create-sample.use-case';
import { GetSampleUseCase } from '../../application/use-cases/get-sample.use-case';
import { ListSamplesUseCase } from '../../application/use-cases/list-samples.use-case';
import { UpdateSampleUseCase } from '../../application/use-cases/update-sample.use-case';
import { DeleteSampleUseCase } from '../../application/use-cases/delete-sample.use-case';

@ApiTags('Samples')
@Controller('v1/samples')
@Roles(Role.ADMIN, Role.USER)
export class SampleController {
  constructor(
    private readonly createSampleUseCase: CreateSampleUseCase,
    private readonly getSampleUseCase: GetSampleUseCase,
    private readonly listSamplesUseCase: ListSamplesUseCase,
    private readonly updateSampleUseCase: UpdateSampleUseCase,
    private readonly deleteSampleUseCase: DeleteSampleUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(createSampleSchema))
  @ApiOperation({ summary: 'Create a sample' })
  async create(@Body() dto: CreateSampleDto, @TenantId() tenantId: string) {
    const sample = await this.createSampleUseCase.execute(dto, tenantId);
    return { data: sample };
  }

  @Get()
  @ApiOperation({ summary: 'List samples (paginated)' })
  async list(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.listSamplesUseCase.execute(tenantId, { page, perPage });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a sample by ID' })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    const sample = await this.getSampleUseCase.execute(id, tenantId);
    return { data: sample };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a sample' })
  async update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(updateSampleSchema)) dto: UpdateSampleDto,
  ) {
    const sample = await this.updateSampleUseCase.execute(id, tenantId, dto);
    return { data: sample };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a sample' })
  async remove(@Param('id') id: string, @TenantId() tenantId: string) {
    await this.deleteSampleUseCase.execute(id, tenantId);
  }
}
```

**Regras:**

- Decorator `@ApiTags` para agrupamento no Swagger
- Rotas versionadas: `v1/meu-modulo` (plural, kebab-case)
- `@Roles()` no nivel da classe define quais roles podem acessar
- `@TenantId()` extrai o tenantId do contexto da requisicao
- `@UsePipes(new ZodValidationPipe(schema))` para validacao do body
- Resposta singular retorna `{ data: T }`
- DELETE retorna `204 No Content`

---

## Passo 10: Criar o Modulo

O modulo NestJS faz o wiring entre ports e adapters, registra use cases e controllers.

**Arquivo:** `src/meu-modulo/infrastructure/meu-modulo.module.ts`

Exemplo do `sample/`:

```typescript
// src/sample/infrastructure/sample.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SampleTypeormEntity } from './persistence/sample.typeorm-entity';
import { SampleTypeormRepository } from './persistence/sample.typeorm-repository';
import { SAMPLE_REPOSITORY } from '../domain/ports/sample.repository.port';
import { SampleController } from './http/sample.controller';
import { CreateSampleUseCase } from '../application/use-cases/create-sample.use-case';
import { GetSampleUseCase } from '../application/use-cases/get-sample.use-case';
import { ListSamplesUseCase } from '../application/use-cases/list-samples.use-case';
import { UpdateSampleUseCase } from '../application/use-cases/update-sample.use-case';
import { DeleteSampleUseCase } from '../application/use-cases/delete-sample.use-case';

@Module({
  imports: [TypeOrmModule.forFeature([SampleTypeormEntity])],
  controllers: [SampleController],
  providers: [
    // Port -> Adapter binding
    {
      provide: SAMPLE_REPOSITORY,
      useClass: SampleTypeormRepository,
    },
    // Use Cases
    CreateSampleUseCase,
    GetSampleUseCase,
    ListSamplesUseCase,
    UpdateSampleUseCase,
    DeleteSampleUseCase,
  ],
  exports: [SAMPLE_REPOSITORY],
})
export class SampleModule {}
```

**Regras:**

- `imports`: registrar a entidade TypeORM com `TypeOrmModule.forFeature()`
- `providers`: fazer o binding do Symbol do port para a classe do adapter
- `providers`: registrar todos os use cases
- `exports`: exportar o Symbol do port caso outros modulos precisem acessar
- `controllers`: registrar o controller HTTP

---

## Passo 11: Registrar no AppModule

Adicione o modulo na lista de imports do `AppModule`:

```typescript
// src/app.module.ts
import { MeuModuloModule } from './meu-modulo/infrastructure/meu-modulo.module';

@Module({
  imports: [
    // ... modulos existentes
    MeuModuloModule,
  ],
  // ...
})
export class AppModule implements NestModule {
  // ...
}
```

---

## Passo 12: Criar a Migration

Gere a migration automaticamente a partir das entidades TypeORM:

```bash
# Gerar migration baseada nas diferencas entre entidades e banco
npm run migration:generate -- src/database/migrations/CreateMeuModuloTable

# Executar migrations pendentes
npm run migration:run
```

Se precisar de uma migration manual:

```bash
npm run migration:create -- src/database/migrations/SeedMeuModuloData
```

---

## Passo 13: Adicionar Codigos de Erro

Adicione os codigos de erro do modulo no enum `ErrorCode` seguindo o padrao de prefixo:

```typescript
// src/common/enums/error-codes.enum.ts
export enum ErrorCode {
  // ... codigos existentes

  // MeuModulo
  MEU_MODULO_NOT_FOUND = 'MEU_MODULO_NOT_FOUND',
  MEU_MODULO_ALREADY_EXISTS = 'MEU_MODULO_ALREADY_EXISTS',
  MEU_MODULO_INACTIVE = 'MEU_MODULO_INACTIVE',
}
```

Use nos use cases com `DomainException`:

```typescript
import { DomainException } from '../../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';

// No use case de busca
const entity = await this.repo.findById(id, tenantId);
if (!entity) {
  throw new DomainException(
    'MEU_MODULO_NOT_FOUND',
    'Recurso nao encontrado',
    HttpStatus.NOT_FOUND,
  );
}
```

---

## Passo 14: Exemplos de Testes

### Teste Unitario do Use Case

```typescript
// src/sample/application/use-cases/__tests__/create-sample.use-case.spec.ts
import { CreateSampleUseCase } from '../create-sample.use-case';
import type { SampleRepositoryPort } from '../../../domain/ports/sample.repository.port';
import { Sample } from '../../../domain/entities/sample.entity';

describe('CreateSampleUseCase', () => {
  let useCase: CreateSampleUseCase;
  let mockRepo: jest.Mocked<SampleRepositoryPort>;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    useCase = new CreateSampleUseCase(mockRepo);
  });

  it('deve criar um sample com sucesso', async () => {
    const dto = { name: 'Test Sample', description: 'Descricao' };
    const tenantId = 'tenant-123';

    const savedSample = new Sample({
      id: 'uuid-123',
      tenantId,
      name: dto.name,
      description: dto.description,
    });

    mockRepo.save.mockResolvedValue(savedSample);

    const result = await useCase.execute(dto, tenantId);

    expect(result.name).toBe('Test Sample');
    expect(result.tenantId).toBe(tenantId);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });
});
```

### Teste da Entidade de Dominio

```typescript
// src/sample/domain/entities/__tests__/sample.entity.spec.ts
import { Sample } from '../sample.entity';

describe('Sample Entity', () => {
  it('deve criar com valores padrao', () => {
    const sample = new Sample({
      tenantId: 'tenant-1',
      name: 'Test',
    });

    expect(sample.id).toBe('');
    expect(sample.isActive).toBe(true);
    expect(sample.description).toBeNull();
    expect(sample.deletedAt).toBeNull();
  });

  it('deve aceitar valores customizados', () => {
    const sample = new Sample({
      id: 'custom-id',
      tenantId: 'tenant-1',
      name: 'Custom',
      description: 'Minha descricao',
      isActive: false,
    });

    expect(sample.id).toBe('custom-id');
    expect(sample.isActive).toBe(false);
    expect(sample.description).toBe('Minha descricao');
  });
});
```

### Teste do Domain Service

```typescript
// src/sample/domain/services/__tests__/sample-domain.service.spec.ts
import { SampleDomainService } from '../sample-domain.service';
import { Sample } from '../../entities/sample.entity';

describe('SampleDomainService', () => {
  describe('validateName', () => {
    it('deve rejeitar nome com menos de 2 caracteres', () => {
      expect(SampleDomainService.validateName('A')).toBe(false);
    });

    it('deve aceitar nome valido', () => {
      expect(SampleDomainService.validateName('Nome Valido')).toBe(true);
    });
  });

  describe('canDeactivate', () => {
    it('deve permitir desativar sample ativo', () => {
      const sample = new Sample({
        tenantId: 't1',
        name: 'Test',
        isActive: true,
      });
      expect(SampleDomainService.canDeactivate(sample)).toBe(true);
    });

    it('nao deve permitir desativar sample ja inativo', () => {
      const sample = new Sample({
        tenantId: 't1',
        name: 'Test',
        isActive: false,
      });
      expect(SampleDomainService.canDeactivate(sample)).toBe(false);
    });
  });
});
```

---

## Passo 15: Filas (Opcional)

Use uma fila quando o trabalho nao precisa terminar dentro do request: envio de
notificacao, chamada de API externa lenta, processamento agendado. A conexao
Redis ja existe (`src/queue/queue.module.ts`, global) — o modulo so declara a
propria fila. Referencia completa e funcionando: `src/sample/`.

### 15.1 Port de fila (`domain/ports/`)

A camada de aplicacao depende da interface, nunca do BullMQ.

```typescript
// src/sample/domain/ports/sample-queue.port.ts
export const SAMPLE_QUEUE = Symbol('SAMPLE_QUEUE');

// Somente identificadores: o payload e serializado em JSON e fica parado no
// Redis. Um snapshot da entidade chega desatualizado no worker e ainda joga
// dado de negocio/PII para dentro do Redis.
export interface DeactivateSampleJobData {
  sampleId: string;
  tenantId: string;
}

export interface SampleQueuePort {
  enqueueDeactivation(
    data: DeactivateSampleJobData,
    delayMs?: number,
  ): Promise<void>;
}
```

### 15.2 Constantes (`infrastructure/queue/`)

O nome da fila e usado em tres lugares (`registerQueue`, `@InjectQueue`,
`@Processor`) e por isso mora em um arquivo so.

```typescript
// src/sample/infrastructure/queue/sample-queue.constants.ts
export const SAMPLE_QUEUE_NAME = 'sample';
export const SAMPLE_DEACTIVATE_JOB = 'deactivate-sample';
```

### 15.3 Adapter — produtor (`infrastructure/queue/`)

A politica de retry fica em uma constante unica. Espalhar `attempts`/`backoff`
por cada `add()` faz cada job ganhar uma politica diferente sem ninguem notar.

```typescript
// src/sample/infrastructure/queue/sample-queue.adapter.ts
const SAMPLE_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30000 }, // 30s, 60s, 120s
  removeOnComplete: 100, // sem limite o Redis guarda todo job para sempre
  removeOnFail: 1000,
};

@Injectable()
export class SampleQueueAdapter implements SampleQueuePort {
  constructor(
    @InjectQueue(SAMPLE_QUEUE_NAME)
    private readonly queue: Queue<DeactivateSampleJobData>,
  ) {}

  async enqueueDeactivation(
    data: DeactivateSampleJobData,
    delayMs = 0,
  ): Promise<void> {
    await this.queue.add(SAMPLE_DEACTIVATE_JOB, data, {
      ...SAMPLE_JOB_OPTIONS,
      delay: delayMs,
    });
  }
}
```

### 15.4 Processor — consumidor (`infrastructure/queue/`)

```typescript
// src/sample/infrastructure/queue/sample.processor.ts
@Processor(SAMPLE_QUEUE_NAME)
export class SampleProcessor extends WorkerHost {
  constructor(
    @Inject(SAMPLE_REPOSITORY)
    private readonly sampleRepo: SampleRepositoryPort,
  ) {
    super();
  }

  async process(job: Job<DeactivateSampleJobData>): Promise<void> {
    const { sampleId, tenantId } = job.data;
    const sample = await this.sampleRepo.findById(sampleId, tenantId);
    if (!sample) return; // falha permanente: retry nao resolve
    if (!SampleDomainService.canDeactivate(sample)) return; // idempotencia

    sample.isActive = false;
    await this.sampleRepo.update(sample); // erro sobe: BullMQ reagenda
  }
}
```

Regras que valem para qualquer worker:

- A entrega e **at-least-once** (crash, job stalled, retry): `process()` precisa
  ser idempotente.
- Erro lancado consome uma tentativa e o BullMQ reagenda com o `backoff` do
  adapter. Nao capture o erro so para logar — engolir a excecao marca o job como
  concluido com sucesso.
- Situacao permanente (registro nao existe mais) retorna sem lancar: retry nunca
  fara o registro aparecer.
- O job leva `tenantId` porque o worker roda fora do request e nao tem o
  `TenantContextMiddleware`.

**Backpressure:** quando o job nao pode rodar agora por motivo temporario (rate
limit de provedor, quota diaria, janela de horario), devolva o job a fila com
atraso em vez de segurar o worker:

```typescript
if (!podeRodarAgora) {
  await job.moveToDelayed(Date.now() + retryAfterMs, job.token);
  throw new DelayedError(); // sinaliza "reagendado", nao consome `attempts`
}
```

`await sleep(...)` esta errado: o worker tem um numero fixo de slots de
concorrencia e dormir ocupa um slot inteiro sem fazer nada; alem disso o Redis
marca como _stalled_ o job cujo lock nao e renovado e o entrega a outro worker,
duplicando o processamento. `job.token` e obrigatorio no `moveToDelayed`.

### 15.5 Wiring no modulo

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([SampleTypeormEntity]),
    // Conexao e opcoes vem do BullModule.forRootAsync do QueueModule.
    BullModule.registerQueue({ name: SAMPLE_QUEUE_NAME }),
  ],
  providers: [
    { provide: SAMPLE_QUEUE, useClass: SampleQueueAdapter },
    // Provider comum: o @nestjs/bullmq descobre pelo @Processor e cria o Worker.
    SampleProcessor,
    ScheduleSampleDeactivationUseCase,
  ],
})
export class SampleModule {}
```

### 15.6 Rota que enfileira

Responda `202 Accepted`: o efeito pedido ainda nao aconteceu quando a resposta
sai. Ver `POST /api/v1/samples/:id/deactivations` em
`src/sample/infrastructure/http/sample.controller.ts`.

### 15.7 Teste do processor

O processor e um provider comum, entao testa-se com `new` e um job mockado —
sem Redis, sem `Test.createTestingModule`. Ver
`src/sample/infrastructure/queue/sample.processor.spec.ts`: cobre o caminho
feliz, o filtro por `tenantId`, o registro inexistente, a reentrega idempotente e
a propagacao do erro de persistencia.

```typescript
function createJob(
  data: DeactivateSampleJobData,
): Job<DeactivateSampleJobData> {
  return {
    name: SAMPLE_DEACTIVATE_JOB,
    data,
  } as unknown as Job<DeactivateSampleJobData>;
}

it('propaga falha de persistencia para o BullMQ reagendar', async () => {
  repo.findById.mockResolvedValue(createSample());
  repo.update.mockRejectedValue(new Error('connection terminated'));

  await expect(
    processor.process(createJob({ sampleId: SAMPLE_ID, tenantId: TENANT_ID })),
  ).rejects.toThrow('connection terminated');
});
```

---

## Checklist Final

- [ ] Entidade de dominio criada em `domain/entities/`
- [ ] Port com Symbol criado em `domain/ports/`
- [ ] Domain service criado (se necessario) em `domain/services/`
- [ ] DTOs com schemas Zod criados em `application/dtos/`
- [ ] Mapper com `toResponse()` e `toDomain()` em `application/mappers/`
- [ ] Use cases criados em `application/use-cases/`
- [ ] Entidade TypeORM criada em `infrastructure/persistence/`
- [ ] Repositorio implementando o port em `infrastructure/persistence/`
- [ ] Controller com decorators em `infrastructure/http/`
- [ ] Modulo com wiring port-adapter em `infrastructure/`
- [ ] Modulo registrado no `AppModule`
- [ ] Migration criada e executada
- [ ] Codigos de erro adicionados no `ErrorCode` enum
- [ ] Fila declarada (se necessario): port, constantes, adapter e processor em
      `infrastructure/queue/`
- [ ] Testes unitarios escritos para use cases, domain services e processors
