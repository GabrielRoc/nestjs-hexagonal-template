import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../exceptions/domain.exception';
import { ErrorCode } from '../enums/error-codes.enum';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;
    let code: string;
    let message: string;
    let details: unknown;

    if (exception instanceof DomainException) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      code = `HTTP_${status}`;
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resp = exceptionResponse as Record<string, unknown>;
        const hasExplicitCode = typeof resp.code === 'string';
        // Preserva o code customizado (ex.: VALIDATION_ERROR do ZodValidationPipe)
        if (hasExplicitCode) {
          code = resp.code as string;
        }
        // Preserva os details em qualquer formato, como faz a DomainException
        const hasExplicitDetails = resp.details !== undefined;
        if (hasExplicitDetails) {
          details = resp.details;
        }
        if (Array.isArray(resp.message)) {
          // Array de message e uma falha de validacao nativa do Nest
          if (!hasExplicitCode) {
            code = ErrorCode.VALIDATION_ERROR;
          }
          message = 'Erro de validação';
          // So deriva details do array de message quando nao veio details explicito
          if (!hasExplicitDetails) {
            details = resp.message;
          }
        } else {
          // message precisa ser sempre string para nao quebrar o contrato da API
          message =
            typeof resp.message === 'string' ? resp.message : exception.message;
        }
      } else {
        message = exception.message;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = ErrorCode.INTERNAL_ERROR;
      message = 'Erro interno do servidor';
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
      },
    });
  }
}
