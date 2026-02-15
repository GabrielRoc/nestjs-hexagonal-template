import { Sample } from '../entities/sample.entity';

/**
 * Example domain service for business rules that span multiple entities
 * or don't naturally belong to a single entity.
 *
 * Domain services should:
 * - Contain pure business logic (no infrastructure dependencies)
 * - Be stateless
 * - Not import from infrastructure layer
 */
export class SampleDomainService {
  /**
   * Example: validate a business rule before creating a sample
   */
  static validateName(name: string): boolean {
    return name.length >= 2 && name.length <= 255;
  }

  /**
   * Example: check if sample can be deactivated
   */
  static canDeactivate(sample: Sample): boolean {
    return sample.isActive;
  }
}
