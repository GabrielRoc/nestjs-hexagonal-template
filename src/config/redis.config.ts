import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  // Porta invalida (texto, 0, negativa) cai no padrao: o ioredis tentaria
  // conectar em NaN e o worker nunca subiria.
  port: (() => {
    const parsed = parseInt(process.env.REDIS_PORT || '6379', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 6379;
  })(),
  // String vazia e uma senha valida para o ioredis (manda AUTH ""): so envia
  // quando realmente houver senha configurada.
  password: process.env.REDIS_PASSWORD?.trim() || undefined,
}));
