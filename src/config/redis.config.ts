import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  // Porta invalida (texto, 0, negativa) cai no padrao: o ioredis tentaria
  // conectar em NaN e o worker nunca subiria.
  port: (() => {
    const parsed = parseInt(process.env.REDIS_PORT || '6379', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 6379;
  })(),
  // Para o ioredis `''` e `undefined` sao equivalentes: ele so manda AUTH
  // quando a senha e truthy, entao string vazia nao quebra o handshake. O
  // `trim() || undefined` normaliza o tipo (uma unica forma de "sem senha") e
  // evita que espacos acidentais no .env virem uma senha errada.
  password: process.env.REDIS_PASSWORD?.trim() || undefined,
}));
