#!/bin/bash
# Roda uma unica vez, quando o volume do Postgres e criado pela primeira vez
# (/docker-entrypoint-initdb.d). Cria o banco que `npm run test:e2e` usa.
#
# O e2e faz `dropSchema` no banco em que roda, por isso ele NAO pode ser o
# template_db de desenvolvimento — e o harness recusa qualquer nome que nao
# termine em `_test`.
#
# Se o seu volume ja existia antes deste script, crie o banco na mao:
#   docker compose exec postgres createdb -U postgres template_db_test
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE template_db_test;
EOSQL

echo "Banco de testes criado: template_db_test"
