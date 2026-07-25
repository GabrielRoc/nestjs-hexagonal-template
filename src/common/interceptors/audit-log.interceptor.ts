import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { RequestWithUser } from '../interfaces';
import { SKIP_AUDIT_BODY_KEY } from '../constants';
import { AUDIT_LOG_REPOSITORY } from '../../audit-log/domain/ports/audit-log.repository.port';
import type { AuditLogRepositoryPort } from '../../audit-log/domain/ports/audit-log.repository.port';
import { AuditLog } from '../../audit-log/domain/entities/audit-log.entity';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Chaves que podem carregar credencial. O padrao casa em QUALQUER posicao do
 * nome e ignora caixa (`newPassword`, `confirmPassword`, `refreshToken`,
 * `apiSecret`), porque uma lista de nomes exatos falha em silencio na primeira
 * rota que usa outro nome: era o caso de `newPassword` em
 * `PATCH /v1/users/:id/password`, gravado em claro na coluna jsonb
 * `audit_logs.changes`.
 *
 * Falso positivo aqui (um campo `passengerName` redigido) custa um valor a menos
 * no audit log; falso negativo custa uma credencial em claro no banco. Sempre
 * amplie o padrao em vez de restringi-lo.
 */
const SENSITIVE_KEY_PATTERN =
  /pass|pwd|senha|secret|token|credential|authorization|api[-_]?key/i;

const REDACTED_VALUE = '[REDACTED]';

/** Teto de profundidade: um corpo aninhado nao pode virar recursao sem fim. */
const MAX_REDACTION_DEPTH = 5;

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: AuditLogRepositoryPort,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const method = request.method;

    if (!WRITE_METHODS.has(method)) {
      return next.handle();
    }

    // Rotas de credencial optam por nao gravar corpo NENHUM: e a segunda camada
    // de defesa, para o caso de um campo novo escapar de SENSITIVE_KEY_PATTERN.
    const skipBody = this.reflector.getAllAndOverride<boolean>(
      SKIP_AUDIT_BODY_KEY,
      [context.getHandler(), context.getClass()],
    );

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
                method !== 'DELETE' && !skipBody
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return undefined;
    }
    return this.redact(body as Record<string, unknown>, 0);
  }

  /**
   * Troca o valor de toda chave sensivel por `[REDACTED]` em vez de apagar a
   * chave: o audit log continua registrando QUE o campo foi enviado, sem guardar
   * o segredo. Percorre objetos e arrays aninhados porque `changes` e uma coluna
   * jsonb persistida — o que passar por aqui fica no banco, nas replicas e em
   * todo backup por tempo indeterminado.
   */
  private redact(
    source: Record<string, unknown>,
    depth: number,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(source)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = REDACTED_VALUE;
        continue;
      }

      if (depth >= MAX_REDACTION_DEPTH) {
        // Abaixo do teto nao ha como garantir a redacao: nada desce em claro.
        result[key] = REDACTED_VALUE;
        continue;
      }

      if (Array.isArray(value)) {
        result[key] = (value as unknown[]).map((item: unknown) =>
          this.isPlainObject(item) ? this.redact(item, depth + 1) : item,
        );
        continue;
      }

      result[key] = this.isPlainObject(value)
        ? this.redact(value, depth + 1)
        : value;
    }

    return result;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !Buffer.isBuffer(value)
    );
  }
}
