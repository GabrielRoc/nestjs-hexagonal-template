import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { Role } from '../../../common/enums/role.enum';

@ApiTags('Audit Logs')
@Controller('v1/audit-logs')
export class AuditLogController {
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List audit logs' })
  list() {
    // TODO: Implement audit log listing with filters (entityType, entityId query params)
    return {
      data: [],
      meta: {
        pagination: {
          total: 0,
          page: 1,
          perPage: 20,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
      },
    };
  }
}
