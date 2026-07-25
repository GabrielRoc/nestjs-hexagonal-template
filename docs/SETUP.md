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
ENABLE_SWAGGER=true

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=template_db

# Redis (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

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

# Anti-bot (opt-in por rota; ver .env.example para os comentarios completos)
ANTI_BOT_TOKEN_SECRET=
ANTI_BOT_MIN_TIME_MS=2000
ANTI_BOT_MAX_TIME_MS=1800000
TURNSTILE_ENABLED=false
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_FAIL_OPEN=true
```

Para desenvolvimento local, os valores padrao funcionam sem alteracoes.

---

## 4. Iniciar a Infraestrutura

O projeto usa Docker Compose para subir os servicos de infraestrutura:

```bash
docker compose up -d
```

Isso ira iniciar:

| Servico           | Porta | Descricao                 |
| ----------------- | ----- | ------------------------- |
| **PostgreSQL 16** | 5432  | Banco de dados principal  |
| **SuperTokens**   | 3567  | Servico de autenticacao   |
| **Redis 7**       | 6379  | Broker das filas (BullMQ) |
| **LocalStack**    | 4566  | Emulador AWS S3 local     |

Verifique se todos os containers estao rodando:

```bash
docker compose ps
```

Aguarde ate que todos os servicos estejam com status `healthy` ou `running`.

---

## 5. Criar o Schema do Banco

O template ja versiona a migration inicial
(`src/database/migrations/*-InitialSchema.ts`), que cria `app_tenants`, `users`,
`audit_logs`, `samples` e `tenant_features`. `synchronize` e `false` de proposito, entao rode:

```bash
npm run migration:run
```

O comando compila o projeto antes de chamar o CLI do TypeORM e executa todas as
migrations pendentes.

Sem esse passo a aplicacao sobe normalmente, mas a primeira query falha com `relation "..." does not exist` -- e nas rotas autenticadas o erro chega ao cliente como um 403 opaco, nao como erro de banco.

### Banco de testes

`npm run test:e2e` roda contra um banco separado, `template_db_test`, e faz
`dropSchema` nele a cada execucao (por isso o harness recusa qualquer nome que
nao termine em `_test`). O `docker-compose.yml` cria esse banco no primeiro boot
do volume do Postgres. Se o seu volume ja existia antes desta versao do template:

```bash
docker compose exec postgres createdb -U postgres template_db_test
```

O e2e cria o schema pela propria migration, entao nao e preciso rodar
`migration:run` nesse banco.

### Gerando novas migrations

`migration:generate` **exige um Postgres de pe**: ele compara a metadata das
entidades com o schema real e nao tem como diferenciar sem conectar (sem banco, o
comando falha com `ECONNREFUSED`).

```bash
npm run migration:generate -- src/database/migrations/NomeDaMigration
```

Depois de gerar, confira dois pontos que o TypeORM erra ou nao sabe:

- Troque `uuid_generate_v4()` por `gen_random_uuid()`. O primeiro depende da
  extensao `uuid-ossp`; o TypeORM tenta instala-la na conexao mas engole o erro
  quando o papel do banco nao e dono dele, e a migration quebra com
  `function uuid_generate_v4() does not exist`.
- Unicidade em tabela com soft delete tem de ser indice parcial
  (`WHERE "deletedAt" IS NULL`) — declare na entidade com
  `@Index([...], { unique: true, where: '"deletedAt" IS NULL' })` e o TypeORM
  gera certo. Ver `docs/CONVENTIONS.md`.

Nao renomeie os indices/constraints gerados: o proximo `migration:generate`
passaria a acusar diferenca e emitir DROP/CREATE sem motivo.

O caso concreto no template e `tenant_features`: o indice unico e parcial em
`("tenantId", "featureKey") WHERE "deletedAt" IS NULL`. O predicado vem do
`@Index` da entidade e e o que permite recriar uma flag apagada logicamente —
um unique comum quebraria o `ON CONFLICT` do upsert de features.

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

A doc so e registrada quando `ENABLE_SWAGGER=true` esta no ambiente -- e opt-in explicito, em qualquer `NODE_ENV`. As rotas do Swagger sao registradas direto no adaptador HTTP, fora do pipeline de guards: nao ha autenticacao nenhuma na frente delas, entao a variavel deve ficar ausente fora do ambiente local.

Com a variavel definida e o servidor rodando, acesse a documentacao interativa da API:

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

1. Com o servidor da aplicacao rodando (`npm run start:dev`), acesse:

```
http://localhost:3000/api/auth/dashboard
```

> O dashboard e servido pelo **backend da aplicacao** (`apiDomain` + `apiBasePath`, definidos em `src/config/supertokens.config.ts` e `src/auth/auth.module.ts`). A porta 3567 e apenas o core do SuperTokens (`SUPERTOKENS_CONNECTION_URI`) e nao serve o dashboard.

2. Na primeira vez, crie o usuario do dashboard direto no core (necessario porque `SUPERTOKENS_API_KEY` e vazio por padrao e o dashboard cai no modo email/senha):

```bash
curl -X POST http://localhost:3567/recipe/dashboard/user \
  -H 'Content-Type: application/json' \
  -H 'rid: dashboard' \
  -d '{"email":"admin@example.com","password":"SUA_SENHA_FORTE"}'
```

3. Faca login no dashboard e crie um novo usuario da aplicacao com email e senha

> A senha precisa atender a politica registrada em `EmailPassword.init()` (`src/auth/auth.module.ts`): 8 a 99 caracteres, com ao menos uma letra maiuscula, uma minuscula e um numero. A regra vive em `src/common/validation/password.schema.ts` e vale para o dashboard, para as rotas nativas do SuperTokens e para `POST /api/v1/auth/reset-password`.

4. Copie o **User ID** gerado pelo SuperTokens

5. (Opcional) Para tornar este usuario superadmin, adicione o ID na variavel `SUPERADMIN_SUPERTOKENS_IDS` no `.env`:

```env
SUPERADMIN_SUPERTOKENS_IDS=<user-id-copiado>
```

6. Reinicie o servidor para aplicar as alteracoes

### Via API

Apos criar o usuario no SuperTokens, voce precisa registra-lo na aplicacao:

- Crie um tenant (se ainda nao existir)
- Associe o usuario ao tenant via endpoint de criacao de usuario

---

## 9. Scripts Disponiveis

| Script                                                                  | Descricao                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run start:dev`                                                     | Servidor com hot-reload                                      |
| `npm run start:debug`                                                   | Servidor com debug (--inspect)                               |
| `npm run build`                                                         | Compilar para producao                                       |
| `npm run start:prod`                                                    | Executar build de producao                                   |
| `npm run lint`                                                          | Executar ESLint com auto-fix                                 |
| `npm run lint:check`                                                    | ESLint sem auto-fix, `--max-warnings 0` (gate do CI)         |
| `npm run format`                                                        | Formatar codigo com Prettier                                 |
| `npm run format:check`                                                  | Prettier em modo check; cobre `docs/`, `.github/` e `infra/` |
| `npm run typecheck`                                                     | `tsc --noEmit` sobre o projeto inteiro, incluindo `test/`    |
| `npm test`                                                              | Executar testes unitarios                                    |
| `npm run test:watch`                                                    | Testes em modo watch                                         |
| `npm run test:cov`                                                      | Testes com relatorio de cobertura                            |
| `npm run test:e2e`                                                      | Testes end-to-end                                            |
| `npm run migration:generate -- src/database/migrations/NomeDaMigration` | Gerar migration                                              |
| `npm run migration:create -- src/database/migrations/NomeDaMigration`   | Criar migration vazia                                        |
| `npm run migration:run`                                                 | Executar migrations pendentes                                |
| `npm run migration:revert`                                              | Reverter ultima migration                                    |

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

---

## Pre-requisitos de Producao

Itens que o template nao resolve sozinho e precisam existir no ambiente de deploy:

- **Rate limit por IP em `/api/auth/*` no proxy ou WAF.** O `ThrottlerGuard` e um `APP_GUARD` e essas rotas nunca chegam aos guards: o middleware Express do `supertokens-nestjs` responde sem chamar `next()`. Sem limite no proxy, login e signup ficam sem protecao contra forca bruta.
- **`TRUST_PROXY_HOPS` igual ao numero de proxies na frente da app.** Sem isso o throttler usa o IP do balanceador e todos os clientes dividem o mesmo balde. Nunca defina um valor maior que o numero real de proxies: `X-Forwarded-For` passa a ser falsificavel.
- **Storage compartilhado para o throttler, se rodar mais de uma replica.** O default e in-memory por processo: o limite efetivo vira `THROTTLE_LIMIT` x numero de processos e zera a cada restart.
- **`ANTI_BOT_TOKEN_SECRET` definido, se alguma rota usa `@AntiBot()`.** Sem a variavel a app gera uma chave aleatoria por processo e registra `ERROR` no boot: os form tokens deixam de valer no restart e nao validam entre instancias, entao parte das submissoes legitimas e rejeitada. O registro de tokens usados tambem e in-memory por processo — para uso unico global, ligue um `TOKEN_STORE` compartilhado (ver `src/anti-bot/infrastructure/persistence/token-store.provider.ts`).
- **`s3:ListBucket` na role/usuario IAM da aplicacao, alem de `s3:PutObject`, `s3:GetObject` e `s3:DeleteObject`.** O check de storage do `GET /api/health` usa `HeadBucketCommand`, que exige `s3:ListBucket` sobre o bucket. Uma politica de menor privilegio so com as tres permissoes de objeto faz a readiness responder **503 permanente** num deploy perfeitamente saudavel -- os uploads funcionam, o health nao.
- **Sonda de proxy, load balancer e healthcheck de container em `GET /api/health/live`, nunca em `GET /api/health`.** Sao dois endpoints com papeis diferentes: `/api/health/live` (liveness) responde 200 enquanto o processo aceita conexoes e **nao** consulta dependencia externa; `/api/health` (readiness) agrega banco + storage e responde 503 quando alguma falha. Apontar o roteamento para a readiness faz uma dependencia opcional derrubar a aplicacao inteira: o proxy tira o unico upstream do pool e passa a responder **502 em todas as rotas**, inclusive as que nao tocam storage.
- **Nao deixe `AWS_S3_BUCKET` vazio se a aplicacao usa storage.** Sem a variavel o check de storage e ignorado (`configured: false`) e o health continua 200: e proposital para deploys que nao usam S3, mas nao protege quem esqueceu de configurar.

---

## Deploy em Producao

O template traz uma stack de producao pronta e um workflow de deploy. O passo a passo completo (pre-requisitos na AWS, preparo do servidor, operacao e rollback) esta em **[`infra/README.md`](../infra/README.md)**; aqui fica so o mapa.

### O que existe

| Arquivo                                   | O que e                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `infra/docker-compose.yml`                | Stack de producao: Caddy (TLS automatico) + api + postgres + supertokens em rede interna.    |
| `infra/Caddyfile.example`                 | Config do Caddy (reverse proxy, headers de seguranca, log JSON). Vai para `infra/Caddyfile`. |
| `infra/.env.example`                      | Modelo do `.env` do servidor. Preenchido a mao, uma vez, e **nunca** enviado pelo deploy.    |
| `.github/workflows/deploy.yml`            | Workflow **reusavel** (`workflow_call`) com toda a logica de build e deploy.                 |
| `.github/workflows/deploy-staging.yml`    | Caller: `push` na `main` (com filtro de paths) ou `workflow_dispatch`.                       |
| `.github/workflows/deploy-production.yml` | Caller: `release` publicada ou `workflow_dispatch`.                                          |

O `docker-compose.yml` da raiz continua sendo **so de desenvolvimento** (portas expostas, senhas fixas, LocalStack). Os dois arquivos nao se misturam.

> **A instancia nao e descartavel.** O banco de producao vive no volume Docker `infra_pgdata` da propria EC2 (e os certificados em `infra_caddy_data`): recriar a maquina ou rodar `down -v` apaga os dois. Nao ha backup automatico -- veja [`infra/README.md`](../infra/README.md#a-instancia-nao-e-descartavel-estado-em-volume-docker).

### Variaveis por GitHub Environment

Crie um Environment por ambiente (`staging`, `production`) e defina nele estas tres **variables** — nenhum secret e necessario, porque a autenticacao na AWS e por OIDC:

| Variable             | Exemplo                                                  |
| -------------------- | -------------------------------------------------------- |
| `AWS_ROLE_ARN`       | `arn:aws:iam::000000000000:role/github-deploy`           |
| `ECR_REPOSITORY_URL` | `000000000000.dkr.ecr.us-east-1.amazonaws.com/minha-app` |
| `EC2_INSTANCE_ID`    | `i-0123456789abcdef0`                                    |

A imagem e publicada com a tag **`${{ github.sha }}` e so ela** (sem `:latest`, para o rollback ser deterministico), o deploy chega na instancia por `ssm:SendCommand` (sem SSH) e o workflow **espera o status do comando SSM** antes de se declarar verde. Sem essa espera o job passaria mesmo com o deploy quebrado -- e o motivo pelo qual `ssm:GetCommandInvocation` precisa estar na policy da role.

### Antes do primeiro deploy

O deploy roda `migration:run` na instancia (num container efemero da imagem nova, via `docker compose run --rm --no-deps api`, **antes** de trocar o trafego), mas o template **nao versiona migrations** — veja [5. Criar o Schema do Banco](#5-criar-o-schema-do-banco). Gere e commite a migration inicial antes do primeiro deploy: sem ela o `migration:run` e um no-op e a aplicacao sobe com o banco vazio.
