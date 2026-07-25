import { applyDecorators, SetMetadata } from '@nestjs/common';
import { PublicAccess } from 'supertokens-nestjs';
import { IS_PUBLIC_KEY } from '../constants';

/**
 * Marca a rota como publica nos DOIS pipelines: o SuperTokensAuthGuard le a
 * chave do PublicAccess (Reflector.createDecorator), enquanto RolesGuard e
 * TenantGuard leem IS_PUBLIC_KEY. Sem os dois, o auth guard (primeiro APP_GUARD)
 * rejeita a rota com 401 antes dos demais.
 */
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), PublicAccess());
