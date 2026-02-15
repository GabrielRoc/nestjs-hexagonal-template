import { LoggerService, Injectable } from '@nestjs/common';
import * as winston from 'winston';
import { trace, context } from '@opentelemetry/api';

@Injectable()
export class AppLoggerService implements LoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'ISO' }),
        winston.format((info) => {
          const span = trace.getSpan(context.active());
          if (span) {
            const spanContext = span.spanContext();
            info.traceId = spanContext.traceId;
            info.spanId = spanContext.spanId;
          }
          return info;
        })(),
        winston.format.json(),
      ),
      transports: [new winston.transports.Console()],
    });
  }

  log(message: string, ...optionalParams: unknown[]) {
    this.logger.info(message, { context: optionalParams[0] });
  }

  error(message: string, ...optionalParams: unknown[]) {
    this.logger.error(message, {
      trace: optionalParams[0],
      context: optionalParams[1],
    });
  }

  warn(message: string, ...optionalParams: unknown[]) {
    this.logger.warn(message, { context: optionalParams[0] });
  }

  debug(message: string, ...optionalParams: unknown[]) {
    this.logger.debug(message, { context: optionalParams[0] });
  }

  verbose(message: string, ...optionalParams: unknown[]) {
    this.logger.verbose(message, { context: optionalParams[0] });
  }
}
