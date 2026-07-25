import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '../../domain/enums/feature-key.enum';

/**
 * Chave de metadata lida pelo FeatureGuard.
 *
 * Mora aqui, e nao em `src/common/constants`, porque a feature flag e vocabulario
 * deste modulo: `src/common/` nao deve conhecer modulo de feature nenhum.
 */
export const FEATURE_KEY = 'requiredFeature';

/**
 * Marca a rota (ou o controller inteiro) como dependente de uma feature flag do
 * tenant. O FeatureGuard, registrado como APP_GUARD, faz a checagem.
 *
 * O parametro e tipado como `FeatureKey` de proposito: e a superficie de autoria
 * e o unico ponto onde o enum aparece. Enquanto `FeatureKey` estiver vazio nao
 * existe argumento valido para passar aqui — nenhuma rota pode ser marcada, que
 * e o comportamento correto para um projeto que ainda nao declarou features.
 */
export const RequiresFeature = (feature: FeatureKey) =>
  SetMetadata(FEATURE_KEY, feature);
