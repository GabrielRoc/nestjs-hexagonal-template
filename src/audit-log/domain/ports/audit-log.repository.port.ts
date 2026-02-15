import { AuditLog } from '../entities/audit-log.entity';

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export interface AuditLogRepositoryPort {
  save(auditLog: AuditLog): Promise<AuditLog>;
}
