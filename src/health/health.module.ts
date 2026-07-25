import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health-indicator';
import { S3HealthIndicator } from './s3.health-indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [S3HealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
