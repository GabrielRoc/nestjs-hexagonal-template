import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  // Entradas com espaco em volta ("a, b") nao batem com o header Origin e a
  // origem seria silenciosamente rejeitada; entradas vazias virariam "".
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}));
