## O que muda?

<!-- Descreva de forma clara e objetiva o que este PR altera no projeto. -->

## Tipo

- [ ] Feature (nova funcionalidade)
- [ ] Bug fix (correcao de defeito)
- [ ] Refactoring (melhoria de codigo sem alterar comportamento)
- [ ] Docs (documentacao)

## Checklist

- [ ] `npm run lint` passa sem erros
- [ ] Testes unitarios adicionados/atualizados (`npm test`)
- [ ] Testes e2e adicionados/atualizados (`npm run test:e2e`)
- [ ] Migration gerada, se houve alteracao no banco (`npm run migration:generate -- src/database/migrations/NomeDaMigration`)
- [ ] Endpoints documentados no Swagger (`@ApiOperation`, `@ApiResponse`)
- [ ] Codigos de erro adicionados ao enum centralizado, se necessario
- [ ] Queries filtram por `tenantId` corretamente
