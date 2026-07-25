import { Injectable, Logger } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

/** Mensagem generica devolvida ao cliente; o motivo real vai para o log. */
const UNAVAILABLE_MESSAGE = 'Storage indisponível';

@Injectable()
export class S3HealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(S3HealthIndicator.name);
  private readonly client: S3Client;
  private readonly bucket: string | undefined;

  constructor(private readonly configService: ConfigService) {
    super();
    const endpoint =
      this.configService.get<string>('AWS_S3_ENDPOINT')?.trim() || undefined;
    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';

    this.client = new S3Client({
      region,
      // Sem timeout explicito o SDK espera indefinidamente (setRequestTimeout(0)
      // nao arma timer) e ainda repete 3x: /api/health e publico e ficaria
      // pendurado por minutos quando o endpoint S3 aceita a conexao e nao
      // responde. throwOnRequestTimeout e OBRIGATORIO: sem ele o
      // @smithy/node-http-handler apenas loga um aviso e a requisicao continua.
      requestHandler: {
        connectionTimeout: 2000,
        requestTimeout: 3000,
        throwOnRequestTimeout: true,
      },
      maxAttempts: 1,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    this.bucket = this.configService.get<string>('AWS_S3_BUCKET')?.trim();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    // GET /api/health e publico: a resposta nunca pode descrever a infra
    // (endpoint interno, IP, credencial). O detalhe fica so no log do servidor.
    // Sem bucket configurado o storage simplesmente nao e usado: derrubar o
    // health de um deploy que nao usa S3 impede o rollout inteiro.
    if (!this.bucket) {
      this.logger.warn(
        'AWS_S3_BUCKET nao configurado: check de storage ignorado',
      );
      return this.getStatus(key, true, { configured: false });
    }

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return this.getStatus(key, true);
    } catch (error) {
      this.logger.error(
        `S3 health check failed for bucket "${this.bucket}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new HealthCheckError(
        'S3 health check failed',
        this.getStatus(key, false, { message: UNAVAILABLE_MESSAGE }),
      );
    }
  }
}
