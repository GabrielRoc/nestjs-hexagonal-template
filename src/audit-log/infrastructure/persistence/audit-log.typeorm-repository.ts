import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogTypeormEntity } from './audit-log.typeorm-entity';
import { AuditLog } from '../../domain/entities/audit-log.entity';
import type { AuditLogRepositoryPort } from '../../domain/ports/audit-log.repository.port';

@Injectable()
export class AuditLogTypeormRepository implements AuditLogRepositoryPort {
  constructor(
    @InjectRepository(AuditLogTypeormEntity)
    private readonly repo: Repository<AuditLogTypeormEntity>,
  ) {}

  async save(auditLog: AuditLog): Promise<AuditLog> {
    const entity = this.repo.create({
      tenantId: auditLog.tenantId,
      userId: auditLog.userId,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      changes: auditLog.changes,
      ipAddress: auditLog.ipAddress,
      userAgent: auditLog.userAgent,
    });

    const saved = await this.repo.save(entity);

    return new AuditLog({
      id: saved.id,
      tenantId: saved.tenantId,
      userId: saved.userId,
      action: saved.action,
      entityType: saved.entityType,
      entityId: saved.entityId,
      changes: saved.changes,
      ipAddress: saved.ipAddress,
      userAgent: saved.userAgent,
      createdAt: saved.createdAt,
    });
  }
}
