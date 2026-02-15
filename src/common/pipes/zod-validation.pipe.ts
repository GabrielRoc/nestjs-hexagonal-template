import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema?: ZodType) {}

  transform(value: unknown) {
    if (!this.schema) {
      return value;
    }

    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        message: issue.message,
      }));
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Erro de validação',
        details: issues,
      });
    }

    return result.data;
  }
}
