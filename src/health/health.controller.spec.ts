import type {
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';
import type { S3HealthIndicator } from './s3.health-indicator';

describe('HealthController', () => {
  let health: jest.Mocked<Pick<HealthCheckService, 'check'>>;
  let db: jest.Mocked<Pick<TypeOrmHealthIndicator, 'pingCheck'>>;
  let s3: jest.Mocked<Pick<S3HealthIndicator, 'isHealthy'>>;
  let controller: HealthController;

  beforeEach(() => {
    health = { check: jest.fn() };
    db = { pingCheck: jest.fn() };
    s3 = { isHealthy: jest.fn() };
    controller = new HealthController(
      health as unknown as HealthCheckService,
      db as unknown as TypeOrmHealthIndicator,
      s3 as unknown as S3HealthIndicator,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('liveness responde ok sem consultar nenhuma dependencia externa', () => {
    expect(controller.live()).toEqual({ status: 'ok' });

    // O negativo e o ponto do teste: a liveness e a sonda do healthcheck do
    // container e do health_uri do Caddy. Agregar dependencia aqui faz uma
    // falha de S3/banco tirar o unico upstream do pool -> 502 em toda rota.
    expect(health.check).not.toHaveBeenCalled();
    expect(db.pingCheck).not.toHaveBeenCalled();
    expect(s3.isHealthy).not.toHaveBeenCalled();
  });

  it('readiness agrega exatamente os indicadores de banco e de storage', () => {
    void controller.check();

    expect(health.check).toHaveBeenCalledTimes(1);
    const indicators = health.check.mock.calls[0][0];
    expect(indicators).toHaveLength(2);

    indicators.forEach((indicator) => void indicator());

    expect(db.pingCheck).toHaveBeenCalledWith('database');
    expect(s3.isHealthy).toHaveBeenCalledWith('storage');
  });

  it('readiness delega ao terminus e nao trata a falha por conta propria', () => {
    const failure = new Error('storage indisponivel');
    health.check.mockRejectedValue(failure);

    // O 503 e responsabilidade do terminus/filtro global: o controller so
    // repassa a promise, sem engolir o erro (o que mascararia a degradacao).
    return expect(controller.check()).rejects.toBe(failure);
  });
});
