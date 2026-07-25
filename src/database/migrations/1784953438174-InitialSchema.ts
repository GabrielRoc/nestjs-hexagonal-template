import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema inicial do template: `audit_logs`, `app_tenants`, `samples`,
 * `tenant_features` e `users` — uma tabela para cada entidade ORM
 * (`*.typeorm-entity.ts`). Nenhum modulo do template traz migration propria:
 * todos dependem desta, entao uma entidade nova aqui esquecida deixa o clone sem
 * a tabela (foi o que aconteceu com `tenant_features`).
 *
 * Gerada por `npm run migration:generate` contra um banco vazio (o comando exige
 * um Postgres de pe: ele compara a metadata das entidades com o schema real) e
 * ajustada em um unico ponto: `gen_random_uuid()` no lugar do
 * `uuid_generate_v4()` que o TypeORM emite.
 *
 * Por que a troca: `uuid_generate_v4()` vem da extensao `uuid-ossp`. O TypeORM
 * tenta instala-la sozinho (`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` na
 * conexao) mas engole o erro quando o papel do banco nao tem permissao — e ai a
 * migration quebraria com `function uuid_generate_v4() does not exist` no
 * primeiro deploy. `gen_random_uuid()` e nucleo do Postgres desde a 13 e o
 * template exige a 16.
 *
 * Os nomes de indice e constraint sao os que o TypeORM gerou, de proposito:
 * renomea-los deixaria o proximo `migration:generate` acusar diferenca e emitir
 * DROP/CREATE de indice sem motivo. A ordem das queries tambem e a gerada.
 *
 * Todo unique que convive com soft delete e um **indice parcial**
 * (`WHERE "deletedAt" IS NULL`) — `app_tenants.document`,
 * `users.supertokensUserId`, `users (tenantId, email)` e
 * `tenant_features (tenantId, featureKey)`. Com um unique comum a linha
 * soft-deletada continua ocupando o valor e bloqueia para sempre o recadastro do
 * mesmo documento/e-mail; em `tenant_features` ela ainda quebraria o
 * `ON CONFLICT` do upsert de feature flags.
 */
export class InitialSchema1784953438174 implements MigrationInterface {
  name = 'InitialSchema1784953438174';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenantId" uuid, "userId" character varying(255) NOT NULL, "action" character varying(100) NOT NULL, "entityType" character varying(100) NOT NULL, "entityId" character varying(255) NOT NULL, "changes" jsonb NOT NULL DEFAULT '{}', "ipAddress" character varying(50) NOT NULL DEFAULT '', "userAgent" character varying(500) NOT NULL DEFAULT '', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f09b40d69c2488932373effd4e" ON "audit_logs"  ("tenantId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8939e4da5d5d01d3a90a85863c" ON "audit_logs"  ("tenantId", "userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1242ad5160aac0feb5da4aa15" ON "audit_logs"  ("tenantId", "entityType", "entityId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "app_tenants" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(255) NOT NULL, "document" character varying(18) NOT NULL, "email" character varying(255) NOT NULL, "phone" character varying(20) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e5bdca0947418078b0583721b2a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f1f24b5457790addeacab9c505" ON "app_tenants"  ("document") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "samples" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL, "name" character varying(255) NOT NULL, "description" text, "isActive" boolean NOT NULL DEFAULT true, "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d68b5b3bd25a6851b033fb63444" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a6d9b9fbb7a1b44390b048597f" ON "samples"  ("tenantId", "sortOrder") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ddf311d6882c9d4e79db459cc0" ON "samples"  ("tenantId", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_features" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL, "featureKey" character varying(50) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "numericValue" integer, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9015681c140679fe10e78e4edd0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_tenant_features_tenant_key" ON "tenant_features"  ("tenantId", "featureKey") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL, "supertokensUserId" character varying(255) NOT NULL, "name" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "phone" character varying(20), "role" character varying(50) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_75d9c8b9369eab8aed5777962f" ON "users"  ("tenantId", "email") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f5dded26aa80bb8529a12b3685" ON "users"  ("supertokensUserId") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "samples" ADD CONSTRAINT "FK_7c2caf0356d7f413509c27fcee0" FOREIGN KEY ("tenantId") REFERENCES "app_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_features" ADD CONSTRAINT "FK_7c57aa735c08d8b6ac7edc77098" FOREIGN KEY ("tenantId") REFERENCES "app_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_c58f7e88c286e5e3478960a998b" FOREIGN KEY ("tenantId") REFERENCES "app_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_c58f7e88c286e5e3478960a998b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_features" DROP CONSTRAINT "FK_7c57aa735c08d8b6ac7edc77098"`,
    );
    await queryRunner.query(
      `ALTER TABLE "samples" DROP CONSTRAINT "FK_7c2caf0356d7f413509c27fcee0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f5dded26aa80bb8529a12b3685"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_75d9c8b9369eab8aed5777962f"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_tenant_features_tenant_key"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_features"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ddf311d6882c9d4e79db459cc0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a6d9b9fbb7a1b44390b048597f"`,
    );
    await queryRunner.query(`DROP TABLE "samples"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f1f24b5457790addeacab9c505"`,
    );
    await queryRunner.query(`DROP TABLE "app_tenants"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b1242ad5160aac0feb5da4aa15"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8939e4da5d5d01d3a90a85863c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f09b40d69c2488932373effd4e"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
