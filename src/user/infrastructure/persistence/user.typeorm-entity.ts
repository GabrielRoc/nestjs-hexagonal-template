import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TenantTypeormEntity } from '../../../tenant/infrastructure/persistence/tenant.typeorm-entity';

/**
 * Os dois unique sao **indices parciais** (`WHERE "deletedAt" IS NULL`): um
 * unique comum contaria as linhas soft-deletadas e um usuario excluido
 * bloquearia para sempre o recadastro do mesmo e-mail / do mesmo usuario do
 * SuperTokens.
 *
 * O indice de e-mail comeca por `tenantId` (convencao de indice composto) e
 * transforma em erro do banco a corrida que `CreateUserUseCase` nao consegue
 * fechar sozinho: o `findByEmail` antes do `save` deixa uma janela entre a
 * leitura e a escrita.
 */
@Entity('users')
@Index(['supertokensUserId'], { unique: true, where: '"deletedAt" IS NULL' })
@Index(['tenantId', 'email'], { unique: true, where: '"deletedAt" IS NULL' })
export class UserTypeormEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => TenantTypeormEntity)
  @JoinColumn({ name: 'tenantId' })
  tenant!: TenantTypeormEntity;

  @Column({ type: 'varchar', length: 255 })
  supertokensUserId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 50 })
  role!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
