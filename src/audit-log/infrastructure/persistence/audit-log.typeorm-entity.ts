import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_logs')
@Index(['tenantId', 'entityType', 'entityId'])
@Index(['tenantId', 'userId'])
@Index(['tenantId', 'createdAt'])
export class AuditLogTypeormEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ type: 'varchar', length: 255 })
  entityId!: string;

  @Column({ type: 'jsonb', default: '{}' })
  changes!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 50, default: '' })
  ipAddress!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  userAgent!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
