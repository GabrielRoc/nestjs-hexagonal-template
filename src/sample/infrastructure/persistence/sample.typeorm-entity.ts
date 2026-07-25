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

/**
 * Indices compostos comecam por `tenantId`: toda query do repositorio filtra por
 * tenant, entao um indice que nao lidera por ele nao e usado.
 */
@Entity('samples')
@Index(['tenantId', 'name'])
@Index(['tenantId', 'sortOrder'])
export class SampleTypeormEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => TenantTypeormEntity)
  @JoinColumn({ name: 'tenantId' })
  tenant!: TenantTypeormEntity;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
