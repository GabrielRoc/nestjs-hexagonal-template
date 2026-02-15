import './instrument';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import SuperTokens from 'supertokens-node';
import { AppModule } from './app.module';
import { AppLoggerService } from './logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(AppLoggerService);
  app.useLogger(logger);

  // Security
  app.use(helmet());

  // CORS
  const corsOrigins = (
    process.env.CORS_ORIGINS || 'http://localhost:3001'
  ).split(',');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ['content-type', ...SuperTokens.getAllCORSHeaders()],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('My App API')
    .setDescription('API Documentation')
    .setVersion('1.0')
    .addCookieAuth('sAccessToken')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  logger.log(`Application running on port ${port}`, 'Bootstrap');
}
void bootstrap();
