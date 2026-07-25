import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/**
 * Tabela `app_tenants`, nao `tenants`: o SuperTokens self-hosted aponta para o
 * mesmo banco da aplicacao (ver `docker-compose.yml`) e cria a sua propria
 * tabela `public.tenants` (app_id, tenant_id) no primeiro boot. Um `tenants` da
 * aplicacao colidiria com ela.
 *
 * `document` e unico apenas entre as linhas vivas (indice parcial com
 * `WHERE "deletedAt" IS NULL`): com um unique comum, um tenant soft-deletado
 * bloquearia para sempre o recadastro do mesmo CNPJ.
 */
@Entity('app_tenants')
@Index(['document'], { unique: true, where: '"deletedAt" IS NULL' })
export class TenantTypeormEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 18 })
  document!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
