import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageServicePort } from '../common/interfaces';

@Injectable()
export class S3StorageAdapter implements StorageServicePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly defaultExpirySeconds: number;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    this.bucket =
      this.configService.get<string>('AWS_S3_BUCKET') ?? 'template-files';
    this.defaultExpirySeconds =
      this.configService.get<number>('SIGNED_URL_EXPIRY_SECONDS') ?? 900;
  }

  async upload(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ key: string; url: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    const url = await this.getSignedUrl(key);
    return { key, url };
  }

  async getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds ?? this.defaultExpirySeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
