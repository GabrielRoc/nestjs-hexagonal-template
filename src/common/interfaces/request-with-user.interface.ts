import { Request } from 'express';
import { Role } from '../enums/role.enum';

export interface RequestUser {
  userId: string;
  tenantId: string;
  role: Role;
  supertokensUserId: string;
}

export interface RequestWithUser extends Request {
  user: RequestUser;
}
