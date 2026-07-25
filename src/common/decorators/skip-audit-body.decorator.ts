import { SetMetadata } from '@nestjs/common';
import { SKIP_AUDIT_BODY_KEY } from '../constants';

/**
 * Impede o AuditLogInterceptor de gravar `changes.after` na rota.
 *
 * O interceptor ja redige toda chave que casa com o padrao de segredo, mas isso
 * depende do NOME do campo. Em rotas cujo corpo existe SO para transportar
 * credencial (troca e redefinicao de senha) nao ha nada de util para auditar no
 * corpo, e o registro de que a acao aconteceu (action, entityType, entityId,
 * userId, ip) continua sendo gravado. Use nas rotas de credencial.
 */
export const SkipAuditBody = () => SetMetadata(SKIP_AUDIT_BODY_KEY, true);
