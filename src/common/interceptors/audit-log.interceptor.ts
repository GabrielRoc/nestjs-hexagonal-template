import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { RequestWithUser } from '../interfaces';
import { AUDIT_LOG_REPOSITORY } from '../../audit-log/domain/ports/audit-log.repository.port';
import type { AuditLogRepositoryPort } from '../../audit-log/domain/ports/audit-log.repository.port';
import { AuditLog } from '../../audit-log/domain/entities/audit-log.entity';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: AuditLogRepositoryPort,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const method = request.method;

    if (!WRITE_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseBody) => {
        if (!request.user?.userId) {
          return;
        }

        try {
          const entityId = this.extractEntityId(request, responseBody);
          const entityType = this.extractEntityType(request);
          const action = this.mapMethodToAction(method);

          const auditLog = new AuditLog({
            tenantId: request.user.tenantId || null,
            userId: request.user.userId,
            action,
            entityType,
            entityId: entityId || 'unknown',
            changes: {
              after:
                method !== 'DELETE'
                  ? this.sanitizeBody(request.body)
                  : undefined,
            },
            ipAddress: String(
              request.ip || request.socket?.remoteAddress || '',
            ).substring(0, 50),
            userAgent: (request.headers['user-agent'] || '').substring(0, 500),
          });

          void this.auditLogRepo.save(auditLog).catch((error) => {
            this.logger.error('Failed to save audit log', error);
          });
        } catch (error) {
          this.logger.error('Failed to build audit log', error);
        }
      }),
    );
  }

  private extractEntityId(
    request: RequestWithUser,
    responseBody: unknown,
  ): string | undefined {
    if (request.params?.id) {
      const id = request.params.id;
      return Array.isArray(id) ? id[0] : id;
    }
    if (
      responseBody &&
      typeof responseBody === 'object' &&
      'data' in responseBody
    ) {
      const data = (responseBody as Record<string, unknown>).data;
      if (data && typeof data === 'object' && 'id' in data) {
        return (data as Record<string, unknown>).id as string;
      }
    }
    return undefined;
  }

  private extractEntityType(request: RequestWithUser): string {
    const parts = request.path.split('/').filter(Boolean);
    for (const part of parts.reverse()) {
      if (!this.isUuid(part) && part !== 'api' && part !== 'v1') {
        return part;
      }
    }
    return 'unknown';
  }

  private mapMethodToAction(method: string): string {
    switch (method) {
      case 'POST':
        return 'CREATE';
      case 'PUT':
      case 'PATCH':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      default:
        return method;
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private sanitizeBody(body: unknown): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const sanitized = { ...body } as Record<string, unknown>;
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.secret;
    return sanitized;
  }
}
