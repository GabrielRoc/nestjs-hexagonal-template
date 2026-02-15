export class AuditLog {
  readonly id: string;
  readonly tenantId: string | null;
  readonly userId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly changes: Record<string, unknown>;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly createdAt: Date;

  constructor(props: {
    id?: string;
    tenantId: string | null;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    changes: Record<string, unknown>;
    ipAddress: string;
    userAgent: string;
    createdAt?: Date;
  }) {
    this.id = props.id ?? '';
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.action = props.action;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.changes = props.changes;
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.createdAt = props.createdAt ?? new Date();
  }
}
