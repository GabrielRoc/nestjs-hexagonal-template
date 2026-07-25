# Guia de Configuracao e Instalacao

Este guia descreve como configurar o ambiente de desenvolvimento do projeto do zero.

---

## Pre-requisitos

Antes de comecar, certifique-se de ter instalado:

| Ferramenta         | Versao Minima                      | Verificacao              |
| ------------------ | ---------------------------------- | ------------------------ |
| **Node.js**        | 24.x (22.13+ LTS tambem suportado) | `node --version`         |
| **npm**            | 10.x ou superior                   | `npm --version`          |
| **Docker**         | 24.x ou superior                   | `docker --version`       |
| **Docker Compose** | 2.x ou superior                    | `docker compose version` |

---

## 1. Clonar o Repositorio

```bash
git clone <url-do-repositorio>
cd nestjs-hexagonal-template
```

---

## 2. Instalar Dependencias

```bash
npm install
```

---

## 3. Configurar Variaveis de Ambiente

Copie o arquivo de exemplo e ajuste conforme necessario:

```bash
cp .env.example .env
```

O arquivo `.env.example` contem todas as variaveis necessarias com valores padrao para desenvolvimento local:

```env
# Application
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:3001,http://localhost:3002
TRUST_PROXY_HOPS=0

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=template_db

# SuperTokens
SUPERTOKENS_CONNECTION_URI=http://localhost:3567
SUPERTOKENS_API_KEY=
SUPERTOKENS_APP_NAME=MyApp
SUPERTOKENS_API_DOMAIN=http://localhost:3000
SUPERTOKENS_WEBSITE_DOMAIN=http://localhost:3001

# SuperAdmin — IDs do SuperTokens separados por virgula
SUPERADMIN_SUPERTOKENS_IDS=

# AWS S3 / LocalStack
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_S3_BUCKET=template-files
AWS_S3_ENDPOINT=http://localhost:4566
SIGNED_URL_EXPIRY_SECONDS=900

# OpenTelemetry (deixar vazio para desabilitar em dev)
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
OTEL_SERVICE_NAME=my-app-api

# Logging
LOG_LEVEL=debug

# Throttling
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
```

Para desenvolvimento local, os valores padrao funcionam sem alteracoes.

---

## 4. Iniciar a Infraestrutura

O projeto usa Docker Compose para subir os servicos de infraestrutura:

```bash
docker compose up -d
```

Isso ira iniciar:

| Servico           | Porta | Descricao                |
| ----------------- | ----- | ------------------------ |
| **PostgreSQL 16** | 5432  | Banco de dados principal |
| **SuperTokens**   | 3567  | Servico de autenticacao  |
| **LocalStack**    | 4566  | Emulador AWS S3 local    |

Verifique se todos os containers estao rodando:

```bash
docker compose ps
```

Aguarde ate que todos os servicos estejam com status `healthy` ou `running`.

---

## 5. Criar o Schema do Banco

O template **nao versiona migrations**: as 4 entidades ORM (samples, users, tenants, audit_logs) nao tem DDL commitado e `synchronize` e `false` de proposito. Com o PostgreSQL rodando, gere a migration inicial e execute-a:

```bash
npm run migration:generate -- src/database/migrations/InitialSchema
npm run migration:run
```

Os dois comandos compilam o projeto antes de chamar o CLI do TypeORM. `migration:run` executa todas as migrations pendentes.

Sem esse passo a aplicacao sobe normalmente, mas a primeira query falha com `relation "..." does not exist` -- e nas rotas autenticadas o erro chega ao cliente como um 403 opaco, nao como erro de banco.

---

## 6. Iniciar o Servidor de Desenvolvimento

```bash
npm run start:dev
```

O servidor inicia com hot-reload habilitado. Qualquer alteracao nos arquivos `.ts` reinicia automaticamente.

Saida esperada:

```
Application running on port 3000
```

---

## 7. Acessar a Documentacao Swagger

Com o servidor rodando, acesse a documentacao interativa da API:

```
http://localhost:3000/api/docs
```

A interface Swagger permite:

- Visualizar todos os endpoints disponiveis
- Testar requisicoes diretamente no navegador
- Ver os schemas de request/response

---

## 8. Criar o Primeiro Usuario

### Via SuperTokens Dashboard

1. Acesse o dashboard do SuperTokens:

```
http://localhost:3567/auth/dashboard
```

2. Crie um novo usuario com email e senha

3. Copie o **User ID** gerado pelo SuperTokens

4. (Opcional) Para tornar este usuario superadmin, adicione o ID na variavel `SUPERADMIN_SUPERTOKENS_IDS` no `.env`:

```env
SUPERADMIN_SUPERTOKENS_IDS=<user-id-copiado>
```

5. Reinicie o servidor para aplicar as alteracoes

### Via API

Apos criar o usuario no SuperTokens, voce precisa registra-lo na aplicacao:

- Crie um tenant (se ainda nao existir)
- Associe o usuario ao tenant via endpoint de criacao de usuario

---

## 9. Scripts Disponiveis

| Script                                                                  | Descricao                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run start:dev`                                                     | Servidor com hot-reload                                            |
| `npm run start:debug`                                                   | Servidor com debug (--inspect)                                     |
| `npm run build`                                                         | Compilar para producao                                             |
| `npm run start:prod`                                                    | Executar build de producao                                         |
| `npm run lint`                                                          | Executar ESLint com auto-fix                                       |
| `npm run lint:check`                                                    | ESLint sem auto-fix, `--max-warnings 0` (gate do CI)               |
| `npm run format`                                                        | Formatar codigo com Prettier                                       |
| `npm run format:check`                                                  | Prettier em modo check, inclui `docs/**/*.md` e `.github/**/*.yml` |
| `npm run typecheck`                                                     | `tsc --noEmit` sobre o projeto inteiro, incluindo `test/`          |
| `npm test`                                                              | Executar testes unitarios                                          |
| `npm run test:watch`                                                    | Testes em modo watch                                               |
| `npm run test:cov`                                                      | Testes com relatorio de cobertura                                  |
| `npm run test:e2e`                                                      | Testes end-to-end                                                  |
| `npm run migration:generate -- src/database/migrations/NomeDaMigration` | Gerar migration                                                    |
| `npm run migration:create -- src/database/migrations/NomeDaMigration`   | Criar migration vazia                                              |
| `npm run migration:run`                                                 | Executar migrations pendentes                                      |
| `npm run migration:revert`                                              | Reverter ultima migration                                          |

---

## Troubleshooting

### Porta 5432 ja em uso

Se o PostgreSQL nao subir porque a porta esta ocupada:

```bash
# Verificar o que esta usando a porta
lsof -i :5432

# Parar o PostgreSQL local (se existir)
sudo systemctl stop postgresql

# Ou alterar a porta no docker-compose.yml
ports:
  - '5433:5432'
# E atualizar DB_PORT=5433 no .env
```

### Erro de conexao com o banco

Verifique se o container do PostgreSQL esta saudavel:

```bash
docker compose logs postgres
docker compose exec postgres pg_isready -U postgres
```

### SuperTokens nao inicia

O SuperTokens depende do PostgreSQL estar saudavel. Verifique a ordem de inicializacao:

```bash
docker compose logs supertokens
```

Se persistir, reinicie os containers:

```bash
docker compose down
docker compose up -d
```

### Migration falha

Certifique-se de que o banco esta acessivel e as variaveis de ambiente estao corretas:

```bash
# Testar conexao manual
docker compose exec postgres psql -U postgres -d template_db -c "SELECT 1"

# Recompilar e tentar novamente
npm run build
npm run migration:run
```

### Erro "Cannot find module"

Limpe os artefatos de build e reinstale:

```bash
rm -rf dist node_modules
npm install
npm run build
```

### LocalStack/S3 nao funciona

Verifique se o container esta rodando e o script de inicializacao foi executado:

```bash
docker compose logs localstack

# Verificar se o bucket foi criado
docker compose exec localstack awslocal s3 ls
```

### Hot-reload nao funciona

Em ambientes WSL2 ou com volumes Docker, o file watching pode falhar. Tente:

```bash
# Usar polling ao inves de inotify
npm run start:dev -- --watchAll
```
