import type { FeatureKeyValue } from '../enums/feature-key.enum';

export class TenantFeature {
  id: string;
  tenantId: string;
  featureKey: FeatureKeyValue;
  enabled: boolean;
  numericValue: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(props: {
    id?: string;
    tenantId: string;
    featureKey: FeatureKeyValue;
    enabled?: boolean;
    numericValue?: number | null;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date | null;
  }) {
    this.id = props.id ?? '';
    this.tenantId = props.tenantId;
    this.featureKey = props.featureKey;
    this.enabled = props.enabled ?? true;
    this.numericValue = props.numericValue ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }
}
