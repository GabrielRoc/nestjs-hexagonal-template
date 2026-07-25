import './instrument';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import SuperTokens from 'supertokens-node';
import { FORM_TOKEN_HEADER } from './anti-bot/anti-bot.constants';
import { AppModule } from './app.module';
import { AppLoggerService } from './logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const logger = app.get(AppLoggerService);
  app.useLogger(logger);

  // O ThrottlerGuard usa req.ip. Sem trust proxy, atras de ALB/nginx/ingress
  // todos os clientes compartilham o MESMO balde de rate limit (um usuario
  // queima os 100/min de todos). Nunca ligar sem proxy na frente: habilita
  // spoof de X-Forwarded-For e burla completa do rate limit.
  app.set(
    'trust proxy',
    process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : false,
  );

  // Security
  app.use(helmet());

  // CORS
  const corsOrigins = app
    .get(ConfigService)
    .get<string[]>('app.corsOrigins', ['http://localhost:3001']);
  // FORM_TOKEN_HEADER precisa estar aqui: header customizado dispara preflight, e
  // sem ele no Access-Control-Allow-Headers o navegador bloqueia a submissao de
  // qualquer formulario protegido por `@AntiBot()` vindo de outra origem.
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: [
      'content-type',
      FORM_TOKEN_HEADER,
      ...SuperTokens.getAllCORSHeaders(),
    ],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger: opt-in explicito. NODE_ENV !== 'production' deixava a doc exposta
  // em staging e em `npm run start:prod` sem NODE_ENV (o ConfigModule carrega o
  // .env com NODE_ENV=development antes desta linha). As rotas do Swagger sao
  // registradas direto no httpAdapter, fora do pipeline de guards: nao ha
  // autenticacao nenhuma na frente delas.
  if (process.env.ENABLE_SWAGGER === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('My App API')
      .setDescription('API Documentation')
      .setVersion('1.0')
      .addCookieAuth('sAccessToken')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`, 'Bootstrap');
}
void bootstrap();
