import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { HealthModule } from '../src/health/health.module';

/**
 * Contrato de infraestrutura: o healthcheck do container
 * (infra/docker-compose.yml) e o `health_uri` do Caddy (infra/Caddyfile.example)
 * consultam a URL exata `/api/health/live`. Mudar o prefixo global, o path do
 * controller ou o nome da rota quebraria as duas sondas em producao -- e o
 * sintoma seria "container unhealthy" / "502 no upstreams available", sem nenhuma
 * pista de que a causa foi uma rota renomeada. Este teste trava a URL.
 *
 * Nao depende de banco nem de S3 de proposito: e exatamente essa a propriedade da
 * liveness.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        HealthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mesmo prefixo do src/main.ts.
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/live responde 200 sem banco nem S3 configurados', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/api/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
