import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantTypeormEntity } from '../../../tenant/infrastructure/persistence/tenant.typeorm-entity';
import { FEATURE_KEY_MAX_LENGTH } from '../../domain/enums/feature-key.enum';

/**
 * O indice unico e PARCIAL (`WHERE "deletedAt" IS NULL`): com soft delete, um
 * unique comum impediria recriar a flag de um par (tenantId, featureKey) que ja
 * foi apagado logicamente, porque a linha antiga continua na tabela. O mesmo
 * predicado reaparece no `indexPredicate` do repositorio, sem o que o Postgres
 * recusa o `ON CONFLICT`.
 *
 * Este modulo nao traz migration propria: o DDL de `tenant_features` sai da
 * `InitialSchema` versionada em `src/database/migrations/`, como o das outras
 * quatro entidades do template. Entidade que nao aparece la deixa o clone sem a
 * tabela — ver docs/SETUP.md secao 5. O `where` acima chega na
 * migration gerada: o TypeORM concatena o predicado no CREATE INDEX
 * (`PostgresQueryRunner.createIndexSql`). A FK de `tenantId` sai do @ManyToOne
 * abaixo. Nada aqui depende de DDL escrito a mao.
 */
@Entity('tenant_features')
@Index('idx_tenant_features_tenant_key', ['tenantId', 'featureKey'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
export class TenantFeatureTypeormEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => TenantTypeormEntity)
  @JoinColumn({ name: 'tenantId' })
  tenant!: TenantTypeormEntity;

  @Column({ type: 'varchar', length: FEATURE_KEY_MAX_LENGTH })
  featureKey!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'integer', nullable: true })
  numericValue!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
