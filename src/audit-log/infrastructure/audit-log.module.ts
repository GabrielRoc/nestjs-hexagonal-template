import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogTypeormEntity } from './persistence/audit-log.typeorm-entity';
import { AuditLogTypeormRepository } from './persistence/audit-log.typeorm-repository';
import { AUDIT_LOG_REPOSITORY } from '../domain/ports/audit-log.repository.port';
import { AuditLogController } from './http/audit-log.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogTypeormEntity])],
  controllers: [AuditLogController],
  providers: [
    {
      provide: AUDIT_LOG_REPOSITORY,
      useClass: AuditLogTypeormRepository,
    },
  ],
  exports: [AUDIT_LOG_REPOSITORY],
})
export class AuditLogModule {}
