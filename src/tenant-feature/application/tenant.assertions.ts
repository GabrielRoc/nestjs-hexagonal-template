import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-codes.enum';
import { DomainException } from '../../common/exceptions/domain.exception';
import type { TenantRepositoryPort } from '../../tenant/domain/ports/tenant.repository.port';

/**
 * Guardas de tenant compartilhadas pelos use cases e pelo TenantFeatureService.
 *
 * Ficam aqui, e nao repetidas em cada use case, porque a ORDEM entre as duas
 * importa: `assertTenantContext` primeiro. Um `tenantId` vazio passado para
 * `findById` iria ao Postgres como `''` e voltaria como `22P02 invalid input
 * syntax for type uuid` — 500 mascarado — em vez do 403 correto.
 */

/**
 * Recusa requisicao sem tenant no contexto.
 *
 * Caso real: SUPERADMIN em `GET /v1/tenant-features/me`. O
 * tenant-context.middleware cria o usuario dele com `tenantId: ''` e o
 * RolesGuard o libera em rota `@Roles(ADMIN)`, entao a string vazia chega ate
 * aqui.
 */
export function assertTenantContext(tenantId: string): void {
  if (!tenantId) {
    throw new DomainException(
      ErrorCode.TENANT_CONTEXT_MISSING,
      'Contexto de tenant não encontrado',
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * Recusa tenant inexistente (ou soft-deleted: `findById` nao traz apagados).
 *
 * Sem isto, `:id` das rotas de admin so era validado como uuid: o PUT batia na
 * FK do banco e o `QueryFailedError` (23503) virava 500 `INTERNAL_ERROR`, e o
 * GET respondia 200 afirmando o estado das flags de um tenant que nao existe.
 */
export async function assertTenantExists(
  tenantRepository: TenantRepositoryPort,
  tenantId: string,
): Promise<void> {
  const tenant = await tenantRepository.findById(tenantId);
  if (!tenant) {
    throw new DomainException(
      ErrorCode.TENANT_NOT_FOUND,
      'Tenant não encontrado',
      HttpStatus.NOT_FOUND,
    );
  }
}
