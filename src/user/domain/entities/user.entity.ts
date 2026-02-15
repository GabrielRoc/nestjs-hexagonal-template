import { Role } from '../../../common/enums/role.enum';

export class User {
  id: string;
  tenantId: string;
  supertokensUserId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(props: {
    id?: string;
    tenantId: string;
    supertokensUserId: string;
    name: string;
    email: string;
    phone?: string | null;
    role: Role;
    isActive?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date | null;
  }) {
    this.id = props.id ?? '';
    this.tenantId = props.tenantId;
    this.supertokensUserId = props.supertokensUserId;
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone ?? null;
    this.role = props.role;
    this.isActive = props.isActive ?? true;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }
}
