# Guia de Contribuicao

Obrigado pelo interesse em contribuir com o projeto! Este documento descreve o fluxo de trabalho e as regras para contribuicoes.

---

## Fluxo de Trabalho (Git Flow)

### 1. Fork do Repositorio

Crie um fork do repositorio na sua conta GitHub.

### 2. Clonar o Fork

```bash
git clone <url-do-seu-fork>
cd nestjs-hexagonal-template
npm install
```

### 3. Criar uma Branch

Crie uma branch a partir da `main` seguindo o padrao de nomeacao:

```bash
# Para novas funcionalidades
git checkout -b feature/descricao-curta

# Para correcoes de bugs
git checkout -b fix/descricao-curta

# Para tarefas de manutencao
git checkout -b chore/descricao-curta
```

Exemplos:

```bash
git checkout -b feature/add-invoice-module
git checkout -b fix/tenant-filter-missing-in-report
git checkout -b chore/upgrade-typeorm-to-0.4
```

### 4. Desenvolver e Commitar

Faca suas alteracoes seguindo as convencoes do projeto (veja `docs/CONVENTIONS.md`) e commite frequentemente.

### 5. Abrir um Pull Request

Envie sua branch para o fork e abra um PR contra a branch `main` do repositorio original.

### 6. Review e Merge

Apos aprovacao na revisao de codigo, o PR sera mergeado na `main`.

---

## Conventional Commits (Obrigatorio)

Todos os commits devem seguir o padrao [Conventional Commits](https://www.conventionalcommits.org/). Commits fora do padrao serao rejeitados.

### Formato

```
<tipo>: <descricao curta>

[corpo opcional]

[rodape opcional]
```

### Tipos Permitidos

| Tipo | Descricao |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correcao de bug |
| `chore` | Manutencao (deps, configs, scripts) |
| `refactor` | Refatoracao sem mudanca de comportamento |
| `test` | Adicao ou correcao de testes |
| `docs` | Alteracao em documentacao |
| `style` | Formatacao, whitespace, ponto e virgula |
| `perf` | Melhoria de performance |
| `ci` | Configuracao de CI/CD |

### Exemplos

```bash
feat: add invoice module with CRUD operations
fix: correct tenant isolation in user repository query
chore: upgrade @nestjs/core to v11.0.2
refactor: extract pagination logic to shared utility
test: add unit tests for create-tenant use case
docs: update architecture diagram with storage module
perf: add database index on invoices(tenantId, dueDate)
ci: add migration check to PR workflow
```

### Commits com Breaking Changes

Para mudancas que quebram compatibilidade, adicione `!` apos o tipo ou inclua `BREAKING CHANGE:` no rodape:

```bash
feat!: change API response format to wrapped structure

BREAKING CHANGE: all endpoints now return { data: T } instead of T directly
```

---

## Antes de Abrir um PR

Execute as seguintes verificacoes localmente:

### 1. Lint

```bash
npm run lint
```

O ESLint deve passar sem erros. Warnings sao aceitaveis em casos justificados, mas devem ser minimizados.

### 2. Formatacao

```bash
npm run format
```

O Prettier formata automaticamente o codigo. Certifique-se de que nao ha diferencas apos a formatacao.

### 3. Testes Unitarios

```bash
npm test
```

Todos os testes devem passar. Se voce adicionou codigo novo, adicione testes correspondentes.

### 4. Testes E2E (se aplicavel)

```bash
npm run test:e2e
```

### 5. Build

```bash
npm run build
```

O projeto deve compilar sem erros TypeScript.

---

## Checklist do Pull Request

Ao abrir um PR, verifique os seguintes itens:

- [ ] Branch nomeada corretamente (`feature/`, `fix/`, `chore/`)
- [ ] Commits seguem Conventional Commits
- [ ] Codigo segue as convencoes do projeto (`docs/CONVENTIONS.md`)
- [ ] Arquitetura hexagonal respeitada (regra de dependencia)
- [ ] `npm run lint` passa sem erros
- [ ] `npm run build` compila sem erros
- [ ] Testes unitarios adicionados para codigo novo
- [ ] `npm test` passa com todos os testes
- [ ] Migration criada (se alterou entidades TypeORM)
- [ ] Codigos de erro adicionados no enum (se novo modulo)
- [ ] Documentacao atualizada (se mudanca publica na API)

---

## Diretrizes de Code Review

### Para Autores do PR

- Mantenha PRs pequenos e focados (idealmente < 400 linhas)
- Escreva uma descricao clara do que foi feito e por que
- Responda aos comentarios de review prontamente
- Nao faca force-push apos a review comecar (dificulta rastreamento)

### Para Revisores

- Verifique se a regra de dependencia da arquitetura hexagonal e respeitada:
  - `domain/` nao importa de `application/` nem `infrastructure/`
  - `application/` nao importa de `infrastructure/`
- Verifique isolamento multi-tenant: toda query deve filtrar por `tenantId`
- Verifique se validacao usa Zod (nao class-validator ou validacao manual)
- Verifique se erros usam `DomainException` com codigos padronizados
- Verifique se DTOs de resposta nao vazam campos internos (`deletedAt`, senhas, etc.)
- Verifique se testes unitarios cobrem os cenarios principais
- Comente com sugestoes construtivas, nao apenas criticas
- Aprove quando as alteracoes estiverem satisfatorias

### Criterios de Aprovacao

- Pelo menos **1 aprovacao** de um mantenedor
- CI/CD passando (lint, build, testes)
- Sem conflitos com a branch `main`
- Convencoes do projeto respeitadas

---

## Reportando Bugs

Ao abrir uma issue para reportar um bug, inclua:

1. **Descricao**: O que aconteceu vs. o que era esperado
2. **Passos para reproduzir**: Sequencia detalhada de acoes
3. **Ambiente**: versao do Node, SO, Docker
4. **Logs**: mensagens de erro relevantes (sem dados sensiveis)

---

## Sugerindo Funcionalidades

Para sugerir novas funcionalidades, abra uma issue com:

1. **Problema**: Que problema a funcionalidade resolve?
2. **Proposta**: Como a funcionalidade deveria funcionar?
3. **Alternativas**: Outras abordagens consideradas
4. **Impacto**: Quais modulos serao afetados?
