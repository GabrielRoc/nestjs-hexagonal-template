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
    const endpoint =
      this.configService.get<string>('AWS_S3_ENDPOINT')?.trim() || undefined;
    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';

    this.client = new S3Client({
      region,
      // Sem timeout explicito o SDK espera indefinidamente por um endpoint que
      // aceita a conexao e nao responde, segurando a requisicao HTTP do
      // usuario. requestTimeout no @smithy/node-http-handler e um teto DURO da
      // requisicao inteira (setTimeout simples, nao inatividade de socket), por
      // isso aqui ele e 30s e nao os 3s do health check: um PutObject de 10MB
      // (o MAX_FILE_SIZE do controller) leva mais de 3s em qualquer link
      // domestico. throwOnRequestTimeout e obrigatorio -- sem ele o handler so
      // loga um aviso e a requisicao continua pendurada. maxAttempts fica no
      // default 3: diferente do health check, vale repetir um upload que
      // falhou por rede.
      requestHandler: {
        connectionTimeout: 2000,
        requestTimeout: 30000,
        throwOnRequestTimeout: true,
      },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    // Sem default silencioso: 'template-files' aqui e a ausencia de default no
    // S3HealthIndicator faziam a mesma variavel significar coisas diferentes,
    // e o health ficava verde apontando para um bucket que o adapter nem usa.
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET')?.trim() ?? '';
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
