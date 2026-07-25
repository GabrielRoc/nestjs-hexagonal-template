import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, TenantId } from '../../../common/decorators';
import { Role } from '../../../common/enums/role.enum';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ErrorResponseSwagger } from '../../../common/swagger/common.swagger';
import {
  BulkUpdateTenantFeaturesSwagger,
  bulkUpdateTenantFeaturesSchema,
  TenantFeatureListResponseSwagger,
  tenantIdParamSchema,
  type BulkUpdateTenantFeaturesDto,
} from '../../application/dtos/tenant-feature.dto';
import { BulkUpdateTenantFeaturesUseCase } from '../../application/use-cases/bulk-update-tenant-features.use-case';
import { GetTenantFeaturesUseCase } from '../../application/use-cases/get-tenant-features.use-case';

@ApiTags('Tenant Features')
@ApiCookieAuth()
@Controller('v1')
export class TenantFeatureController {
  constructor(
    private readonly getTenantFeaturesUseCase: GetTenantFeaturesUseCase,
    private readonly bulkUpdateUseCase: BulkUpdateTenantFeaturesUseCase,
  ) {}

  @Get('tenant-features/me')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List the feature flags of the current tenant' })
  @ApiResponse({ status: 200, type: TenantFeatureListResponseSwagger })
  @ApiResponse({ status: 401, type: ErrorResponseSwagger })
  @ApiResponse({ status: 403, type: ErrorResponseSwagger })
  async getMyFeatures(@TenantId() tenantId: string) {
    const data = await this.getTenantFeaturesUseCase.execute(tenantId);
    return { data };
  }

  @Get('admin/tenants/:id/features')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'List the feature flags of a specific tenant' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, type: TenantFeatureListResponseSwagger })
  @ApiResponse({ status: 401, type: ErrorResponseSwagger })
  @ApiResponse({ status: 403, type: ErrorResponseSwagger })
  async getTenantFeatures(
    @Param('id', new ZodValidationPipe(tenantIdParamSchema)) tenantId: string,
  ) {
    const data = await this.getTenantFeaturesUseCase.execute(tenantId);
    return { data };
  }

  @Put('admin/tenants/:id/features')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Bulk upsert the feature flags of a tenant' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: BulkUpdateTenantFeaturesSwagger })
  @ApiResponse({ status: 200, type: TenantFeatureListResponseSwagger })
  @ApiResponse({ status: 400, type: ErrorResponseSwagger })
  @ApiResponse({ status: 401, type: ErrorResponseSwagger })
  @ApiResponse({ status: 403, type: ErrorResponseSwagger })
  async bulkUpdateFeatures(
    @Param('id', new ZodValidationPipe(tenantIdParamSchema)) tenantId: string,
    @Body(new ZodValidationPipe(bulkUpdateTenantFeaturesSchema))
    dto: BulkUpdateTenantFeaturesDto,
  ) {
    const data = await this.bulkUpdateUseCase.execute(tenantId, dto);
    return { data };
  }
}
