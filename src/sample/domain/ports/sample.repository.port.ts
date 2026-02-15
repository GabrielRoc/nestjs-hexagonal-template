import { Sample } from '../entities/sample.entity';

export const SAMPLE_REPOSITORY = Symbol('SAMPLE_REPOSITORY');

export interface SampleRepositoryPort {
  save(sample: Sample): Promise<Sample>;
  findById(id: string, tenantId: string): Promise<Sample | null>;
  findAll(
    tenantId: string,
    page: number,
    perPage: number,
  ): Promise<[Sample[], number]>;
  update(sample: Sample): Promise<Sample>;
  softDelete(id: string, tenantId: string): Promise<void>;
}
