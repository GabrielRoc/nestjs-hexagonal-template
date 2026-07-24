import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class S3HealthIndicator extends HealthIndicator {
  private readonly client: S3Client;
  private readonly bucket: string | undefined;

  constructor(private readonly configService: ConfigService) {
    super();
    const endpoint =
      this.configService.get<string>('AWS_S3_ENDPOINT')?.trim() || undefined;
    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    this.bucket = this.configService.get<string>('AWS_S3_BUCKET')?.trim();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.bucket) {
      throw new HealthCheckError(
        'S3 health check failed',
        this.getStatus(key, false, {
          message: 'AWS_S3_BUCKET não configurado',
        }),
      );
    }

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'S3 health check failed',
        this.getStatus(key, false, {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
