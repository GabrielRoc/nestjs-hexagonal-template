import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TenantFeature } from '../../domain/entities/tenant-feature.entity';
import {
  DEFAULT_CACHE_TTL_MS,
  InMemoryTenantFeatureCache,
} from './in-memory-tenant-feature.cache';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function feature(key: string): TenantFeature {
  return new TenantFeature({ tenantId: TENANT_ID, featureKey: key });
}

describe('InMemoryTenantFeatureCache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devolve null no miss e a lista no hit', () => {
    const cache = new InMemoryTenantFeatureCache(configWith({}));

    expect(cache.get(TENANT_ID)).toBeNull();

    cache.set(TENANT_ID, [feature('A')]);

    expect(cache.get(TENANT_ID)).toHaveLength(1);
  });

  it('trata lista vazia como hit valido, nao como miss', () => {
    // Tenant sem nenhuma flag persistida e o caso comum: se lista vazia contasse
    // como miss, toda requisicao dele voltaria ao banco.
    const cache = new InMemoryTenantFeatureCache(configWith({}));

    cache.set(TENANT_ID, []);

    expect(cache.get(TENANT_ID)).toEqual([]);
  });

  it('expira a entrada depois do TTL', () => {
    const cache = new InMemoryTenantFeatureCache(
      configWith({ TENANT_FEATURE_CACHE_TTL_MS: '1000' }),
    );
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start);

    cache.set(TENANT_ID, [feature('A')]);
    expect(cache.get(TENANT_ID)).not.toBeNull();

    jest.spyOn(Date, 'now').mockReturnValue(start + 1000);
    expect(cache.get(TENANT_ID)).toBeNull();
  });

  it('nao guarda nada quando o TTL e 0', () => {
    // O aviso sai no construtor, entao o spy precisa ser no prototype: espiar a
    // instancia depois de construida chegaria tarde.
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const cache = new InMemoryTenantFeatureCache(
      configWith({ TENANT_FEATURE_CACHE_TTL_MS: '0' }),
    );

    expect(warn).toHaveBeenCalled();

    cache.set(TENANT_ID, [feature('A')]);

    expect(cache.get(TENANT_ID)).toBeNull();
  });

  it('cai no TTL padrao com valor invalido', () => {
    const cache = new InMemoryTenantFeatureCache(
      configWith({ TENANT_FEATURE_CACHE_TTL_MS: 'abc' }),
    );

    expect(cache['ttlMs']).toBe(DEFAULT_CACHE_TTL_MS);
  });

  it('invalida so o tenant pedido', () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const cache = new InMemoryTenantFeatureCache(configWith({}));
    cache.set(TENANT_ID, [feature('A')]);
    cache.set(other, [feature('A')]);

    cache.invalidate(TENANT_ID);

    expect(cache.get(TENANT_ID)).toBeNull();
    expect(cache.get(other)).not.toBeNull();
  });

  it('respeita o teto de tenants evacuando a entrada mais antiga', () => {
    const cache = new InMemoryTenantFeatureCache(
      configWith({ TENANT_FEATURE_CACHE_MAX_TENANTS: '2' }),
    );

    cache.set('tenant-a', [feature('A')]);
    cache.set('tenant-b', [feature('A')]);
    cache.set('tenant-c', [feature('A')]);

    expect(cache.get('tenant-a')).toBeNull();
    expect(cache.get('tenant-b')).not.toBeNull();
    expect(cache.get('tenant-c')).not.toBeNull();
  });

  it('nao deixa quem le mutar a lista guardada', () => {
    const cache = new InMemoryTenantFeatureCache(configWith({}));
    cache.set(TENANT_ID, [feature('A')]);

    cache.get(TENANT_ID)?.push(feature('B'));

    expect(cache.get(TENANT_ID)).toHaveLength(1);
  });
});
