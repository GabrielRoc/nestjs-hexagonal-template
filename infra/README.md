# Deploy: stack de producao e workflow

Esta pasta tem a stack de producao (EC2 + Docker Compose atras do Caddy) e o
material que o workflow de deploy copia para o servidor.

| Arquivo              | Para que serve                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `docker-compose.yml` | Stack de producao. Enviado para `<REMOTE_DIR>/infra/docker-compose.yml` a cada deploy.       |
| `Caddyfile.example`  | Config do Caddy. Enviado para `<REMOTE_DIR>/infra/Caddyfile` (sem `.example`) a cada deploy. |
| `.env.example`       | Modelo do `.env` do servidor. **Nao** e copiado pelo deploy: e preenchido a mao, uma vez.    |

O `docker-compose.yml` da **raiz** do repositorio e outro arquivo, so para
desenvolvimento local (Postgres, SuperTokens e LocalStack com portas expostas).
Os dois nao se misturam.

---

## Arquitetura da stack

```
Internet ──443/80──> caddy ──┐        (unico servico com portas publicadas)
                             │
                    rede interna `internal`
                             │
                   api ──> postgres
                    └──> supertokens ──> postgres
```

- **TLS automatico** (Let's Encrypt via ACME HTTP-01) terminado no Caddy. A porta
  **80 precisa ficar aberta** no security group: e por ela que passa o desafio de
  emissao e de renovacao.
- **Nada alem do Caddy publica porta.** Postgres (5432) e SuperTokens core (3567)
  ficam apenas na rede interna do compose.
- **`restart: unless-stopped`** em todos os servicos, e `depends_on` com
  `condition: service_healthy` onde existe healthcheck.
- **Rotacao de log em todos os servicos** (`json-file` com `max-size`/`max-file`).
  O default do Docker e json-file **sem limite**: um container em crashloop enche
  o disco da instancia e derruba a stack inteira, inclusive o Postgres. Ja
  aconteceu em producao no projeto de onde esta stack foi extraida.
- **Variaveis obrigatorias com `${VAR:?mensagem}`**: falta uma e o
  `docker compose up` para na hora dizendo qual, em vez de subir com um default
  silencioso.

### Nome do projeto compose

Use **sempre** `-f infra/docker-compose.yml` a partir de `<REMOTE_DIR>` e **nunca**
`-p` nem `--project-directory`. O compose deriva o nome do projeto do diretorio
do arquivo, entao o projeto se chama `infra` (containers `infra-api-1`, volumes
`infra_pgdata`). Trocar isso em uma invocacao cria um **segundo** projeto com
volumes novos: o banco parece ter desaparecido sem nada ter sido apagado.

### Redis

A stack **nao** tem Redis: o template nao usa (nao ha client no `package.json` e
o `ThrottlerModule` usa o storage in-memory padrao). Ha um bloco comentado no fim
do `docker-compose.yml`, ja com o hardening de cache/broker (`--maxmemory`,
`--maxmemory-policy allkeys-lru`, `--save ""`,
`--stop-writes-on-bgsave-error no`), para quando aparecer fila ou cache.

---

## Pre-requisitos na AWS

**Repositorio ECR** para a imagem da aplicacao.

**Instancia EC2** com:

- `docker` e o plugin `docker compose` **v2.20 ou maior** (piso conservador: o
  deploy usa `up -d --wait --wait-timeout`);
- **SSM Agent** rodando (o deploy chega por `ssm:SendCommand`, sem SSH e sem
  porta 22 aberta);
- **instance profile** com `AmazonSSMManagedInstanceCore`, permissao de `pull` no
  ECR e, se a aplicacao usa storage, acesso ao bucket S3 — incluindo
  **`s3:ListBucket`**, que o check de storage do `GET /api/health` exige
  (`HeadBucketCommand`). Sem ele o health responde **503 permanente** com uploads
  funcionando;
- **IMDSv2 com hop limit 2**, senao o SDK da AWS dentro do container nao alcanca
  as credenciais da role:
  ```bash
  aws ec2 modify-instance-metadata-options \
    --instance-id i-0123456789abcdef0 \
    --http-tokens required --http-put-response-hop-limit 2
  ```
- **security group** liberando 80 e 443 (a 80 e obrigatoria para o ACME).

**DNS**: um registro A do dominio (`CADDY_DOMAIN`) apontando para o IP da
instancia, propagado **antes** do primeiro deploy — o Caddy tenta emitir o
certificado no primeiro start.

**Role de deploy para o GitHub** (OIDC, sem chave estatica). Trust policy
aceitando `token.actions.githubusercontent.com` para o seu repositorio, e
permissoes de:

- `ecr:GetAuthorizationToken` (recurso `*`);
- push no repositorio ECR (`ecr:BatchCheckLayerAvailability`,
  `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`,
  `ecr:PutImage`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`);
- `ssm:SendCommand` na instancia e no documento `AWS-RunShellScript`;
- `ssm:GetCommandInvocation` (recurso `*` — a acao nao aceita recurso especifico,
  e sem ela o workflow **nao consegue saber se o deploy falhou**).

---

## Preparar o servidor (uma vez)

```bash
sudo mkdir -p /opt/app/infra
sudo chown "$USER":"$USER" /opt/app /opt/app/infra

# copie infra/.env.example do repositorio para ca e preencha
vi /opt/app/.env
chmod 600 /opt/app/.env
```

O `.env` **nao** e versionado nem enviado pelo deploy: e o unico estado que fica
na instancia. Se ele nao existir, o deploy falha de proposito com a mensagem
`ERRO: /opt/app/.env nao existe` em vez de subir a stack pela metade.

O deploy cria/atualiza `infra/docker-compose.yml`, `infra/Caddyfile` e a linha
`API_IMAGE=` do `.env`. Todo o resto do `.env` e responsabilidade sua.

---

## GitHub Environments

Crie um Environment por ambiente (`staging`, `production`) em
**Settings > Environments** e defina nele as **variables** (nao secrets — nenhum
desses valores e sigiloso):

| Variable             | Exemplo                                                  | Para que serve                        |
| -------------------- | -------------------------------------------------------- | ------------------------------------- |
| `AWS_ROLE_ARN`       | `arn:aws:iam::000000000000:role/github-deploy`           | Role assumida via OIDC.               |
| `ECR_REPOSITORY_URL` | `000000000000.dkr.ecr.us-east-1.amazonaws.com/minha-app` | Repositorio ECR de destino da imagem. |
| `EC2_INSTANCE_ID`    | `i-0123456789abcdef0`                                    | Instancia que recebe o comando SSM.   |

Nenhum **secret** e necessario: a autenticacao na AWS e por OIDC e a do ECR sai
de `ecr get-login-password` executado na propria instancia.

Em `production`, use as protection rules do Environment (**required reviewers**)
— o job de deploy declara `environment:`, entao a aprovacao acontece antes de
qualquer coisa ser publicada.

Se algum ambiente usa outra regiao ou outro diretorio no servidor, passe pelos
inputs do caller (`aws-region`, `remote-dir`).

---

## Os tres workflows

| Arquivo                                   | O que e                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `.github/workflows/deploy.yml`            | Reusavel (`workflow_call`). Toda a logica de build e deploy vive aqui. |
| `.github/workflows/deploy-staging.yml`    | Caller: `push` na `main` (com filtro de paths) ou `workflow_dispatch`. |
| `.github/workflows/deploy-production.yml` | Caller: `release` publicada ou `workflow_dispatch`.                    |

Os callers tem ~30 linhas cada e nao contem logica: so o gatilho, o
`concurrency` e o nome do Environment. Um fix no deploy entra em um lugar e vale
para os dois ambientes.

`permissions` fica no minimo (`id-token: write` para o OIDC, `contents: read`
para o checkout) e e declarado **tambem** nos callers: as permissoes do caller
sao o teto do que o workflow chamado recebe.

### O que o deploy faz

1. Assume a role via OIDC e faz login no ECR.
2. `docker build` com cache do GitHub Actions (`type=gha`) e push com a tag
   **`${{ github.sha }}` e so ela**. Nada de `:latest`: com tag movel, um restart
   do container passa a subir outra build e o rollback deixa de ser
   deterministico.
3. Manda **um unico** comando SSM para a instancia que: valida que
   `<REMOTE_DIR>/.env` existe, escreve `infra/docker-compose.yml` e
   `infra/Caddyfile`, reescreve a linha `API_IMAGE=`, faz `pull` da imagem nova,
   `up -d --wait`, roda as migrations e limpa imagens orfas.
4. **Espera o resultado do comando** consultando `ssm get-command-invocation` em
   loop, e falha o job se o status nao for `Success`.

O passo 4 e o que separa este workflow do original: `send-command` retorna assim
que a AWS **aceita** o comando, muito antes de ele rodar. Sem consultar o status
da invocacao o job fica **verde num deploy que falhou** — imagem que nao baixou,
container unhealthy, migration quebrada. O script do comando tambem comeca com
`set -eu`: sem isso o SSM reporta apenas o codigo de saida da **ultima** linha, e
um erro no meio passaria batido.

As migrations rodam com `docker compose exec -T api` (nunca `docker exec` com
nome de container fixo: o nome depende do nome do projeto e da replica, e o
comando quebra em silencio quando qualquer um dos dois muda).

> O template nao traz nenhuma migration (`src/database/migrations/` esta vazia),
> so o esqueleto. `migration:run` sera um no-op ate voce gerar a primeira, e a
> aplicacao vai subir com o banco sem tabelas: gere as migrations antes do
> primeiro deploy de verdade.

---

## Operacao

```bash
cd /opt/app
COMPOSE="docker compose --env-file .env -f infra/docker-compose.yml"

$COMPOSE ps                      # estado e health de cada servico
$COMPOSE logs -f --tail=100 api  # logs da aplicacao
$COMPOSE logs caddy | tail        # emissao/renovacao de certificado
```

**Rollback** para uma imagem anterior, sem passar pelo build:

```bash
cd /opt/app
sed -i "/^API_IMAGE=/d" .env
echo "API_IMAGE=<repo-ecr>:<sha-anterior>" >> .env
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait api
```

Migrations **nao** sao revertidas por isso. Se a versao anterior nao aguenta o
schema novo, rode `migration:revert` antes.

---

## Validar as alteracoes localmente

```bash
# o compose resolve? (o .env descartavel so existe para as vars obrigatorias)
docker compose --env-file /tmp/throwaway.env -f infra/docker-compose.yml config

# o Caddyfile e valido?
docker run --rm -v "$PWD/infra:/w" -w /w caddy:2-alpine \
  caddy validate --config Caddyfile.example --adapter caddyfile

# os workflows sao validos? (inclui shellcheck nos blocos `run:`)
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color

# formatacao (cobre infra/**, .github/** e a raiz)
npm run format:check
```
