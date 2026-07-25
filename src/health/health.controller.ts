import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { RedisHealthIndicator } from './redis.health-indicator';
import { S3HealthIndicator } from './s3.health-indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private s3: S3HealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  /**
   * Readiness: agrega as dependencias e responde 503 quando alguma falha.
   * NAO use este endpoint como sonda de roteamento (proxy) nem como healthcheck
   * de container: o `storage` aqui pode derrubar o upstream inteiro por causa de
   * uma dependencia opcional. Para isso existe `GET /api/health/live`.
   */
  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness check (banco + storage)',
    description:
      'Responde 503 se alguma dependencia estiver indisponivel. Para sonda de proxy/container use /api/health/live.',
  })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.s3.isHealthy('storage'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  /**
   * Liveness: confirma apenas que o processo aceita conexoes e responde.
   * De proposito NAO consulta banco, S3 nem nada externo -- e a sonda usada
   * pelo healthcheck do container e pelo `health_uri` do Caddy, e um 503 aqui
   * significaria "tire este upstream do pool". Uma dependencia externa oscilando
   * nunca deve ter esse poder: o Caddy tem um upstream unico, entao marcar a api
   * como unhealthy faz TODA rota responder 502, inclusive as que nao tocam a
   * dependencia que falhou.
   *
   * Nao adicione indicador nenhum aqui (ha teste garantindo isso).
   */
  @Get('live')
  @Public()
  @ApiOperation({
    summary: 'Liveness check',
    description:
      'Responde 200 enquanto o processo estiver de pe. Nao consulta dependencias externas.',
  })
  live() {
    return { status: 'ok' };
  }
}
