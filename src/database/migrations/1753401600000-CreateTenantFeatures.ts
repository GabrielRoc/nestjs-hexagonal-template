import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cria `tenant_features`.
 *
 * Escrita a mao: `npm run migration:generate` exige banco de pe (compara o
 * metadata das entidades com o schema real) e falha com ECONNREFUSED sem ele.
 *
 * Pressupoe a tabela `tenants` — a FK abaixo depende dela. O template ainda nao
 * tem a migration do schema inicial (as entidades existentes nunca foram
 * migradas), entao esta migration precisa rodar depois daquela.
 *
 * Os identificadores sao camelCase entre aspas porque a naming strategy padrao
 * do TypeORM nao converte nada: as colunas no banco sao "tenantId", "deletedAt".
 */
export class CreateTenantFeatures1753401600000 implements MigrationInterface {
  name = 'CreateTenantFeatures1753401600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // @PrimaryGeneratedColumn('uuid') no Postgres se apoia no DEFAULT
    // uuid_generate_v4() da coluna, que vem da extensao uuid-ossp. Com
    // synchronize: false ninguem cria a extensao em runtime, entao e aqui.
    // Idempotente: a migration do schema inicial pode criar a mesma extensao.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "tenant_features" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "featureKey" character varying(50) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "numericValue" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tenant_features" PRIMARY KEY ("id")
      )
    `);

    // Indice composto comecando por "tenantId": e unico e PARCIAL. O parcial e
    // obrigatorio por causa do soft delete — um unique comum impediria recriar a
    // flag de um par (tenantId, featureKey) apagado logicamente, porque a linha
    // antiga continua na tabela. O mesmo predicado aparece no ON CONFLICT do
    // repositorio (indexPredicate), sem o que o Postgres recusa o upsert.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_tenant_features_tenant_key"
        ON "tenant_features" ("tenantId", "featureKey")
        WHERE "deletedAt" IS NULL
    `);

    // O nome opaco da FK e o que a naming strategy padrao do TypeORM calcula
    // (sha1 de tabela + colunas). Usar um nome legivel faz o proximo
    // `migration:generate` num banco sincronizado emitir um DROP/ADD so para
    // renomear a constraint.
    await queryRunner.query(`
      ALTER TABLE "tenant_features"
        ADD CONSTRAINT "FK_7c57aa735c08d8b6ac7edc77098"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_features" DROP CONSTRAINT "FK_7c57aa735c08d8b6ac7edc77098"`,
    );
    await queryRunner.query(`DROP INDEX "idx_tenant_features_tenant_key"`);
    await queryRunner.query(`DROP TABLE "tenant_features"`);
  }
}
