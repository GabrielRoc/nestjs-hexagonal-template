export const CHALLENGE_RESOURCE_RESOLVER = Symbol(
  'CHALLENGE_RESOURCE_RESOLVER',
);

/**
 * `challenge`: a rota exige a resposta correta em `_challenge_answer`.
 * `none`: recurso sem desafio; o ChallengeGuard passa direto.
 */
export type ChallengeProtectionLevel = 'none' | 'challenge';

export interface ChallengeProtectedResource {
  protectionLevel: ChallengeProtectionLevel;
  /**
   * Resposta esperada, comparada sem diferenciar caixa nem espaco em volta.
   * `null` com `protectionLevel: 'challenge'` e configuracao incompleta e o
   * guard rejeita a requisicao (ver challenge.guard.ts).
   */
  expectedAnswer: string | null;
}

/**
 * Port do recurso protegido por desafio.
 *
 * O ChallengeGuard so precisa de tres coisas do recurso que a rota acessa:
 * localizar por um identificador de rota, saber se ele exige desafio e qual e a
 * resposta esperada. Nada disso e vocabulario de dominio, entao o modulo
 * anti-bot NAO importa modulo de feature nenhum: quem tem o repositorio liga
 * uma implementacao a este token.
 *
 * Ligue o provider no MESMO modulo que declara o controller com `@AntiBot(...)`
 * — guards de rota sao instanciados no injector do modulo do controller, e e la
 * que o token precisa ser resolvivel:
 *
 * ```ts
 * @Module({
 *   imports: [AntiBotModule],
 *   controllers: [ThingController],
 *   providers: [
 *     { provide: CHALLENGE_RESOURCE_RESOLVER, useClass: ThingChallengeResolver },
 *   ],
 * })
 * export class ThingModule {}
 * ```
 *
 * Sem nenhuma implementacao ligada o guard e um no-op — um clone novo do
 * template nao tem recurso protegido, e port nao ligado nao derruba o boot.
 */
export interface ChallengeResourceResolver {
  /**
   * @param identifier valor do parametro de rota declarado em
   *   `@AntiBot({ challengeParam })`
   * @param tenantId tenant do usuario autenticado, ou `null` em rota publica
   *   (que e o caso normal aqui). Com `null`, a implementacao precisa resolver
   *   o recurso por um identificador globalmente unico.
   * @returns `null` quando o recurso nao existe — o guard passa direto e deixa
   *   o handler devolver o 404, para nao transformar o desafio em oraculo de
   *   existencia de recurso.
   */
  findProtection(
    identifier: string,
    tenantId: string | null,
  ): Promise<ChallengeProtectedResource | null>;
}
