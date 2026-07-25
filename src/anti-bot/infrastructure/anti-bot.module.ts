import { Module } from '@nestjs/common';
import { TOKEN_STORE } from '../domain/ports/token-store.port';
import { AntiBotController } from './http/anti-bot.controller';
import { tokenStoreProvider } from './persistence/token-store.provider';
import { ChallengeGuard } from './guards/challenge.guard';
import { FormTokenGuard } from './guards/form-token.guard';
import { HoneypotGuard } from './guards/honeypot.guard';
import { TimingGuard } from './guards/timing.guard';
import { TurnstileGuard } from './guards/turnstile.guard';
import { BodySanitizerInterceptor } from './interceptors/body-sanitizer.interceptor';
import { FormTokenService } from './services/form-token.service';
import { TurnstileVerifyService } from './services/turnstile-verify.service';

/**
 * Protecao anti-bot em camadas. Ver `decorators/anti-bot.decorator.ts` para a
 * ordem das camadas e o que cada uma para.
 *
 * NAO e `@Global()`, ao contrario da versao de onde veio. O que `@Global()`
 * comprava era conveniencia: `@AntiBot()` funcionaria em qualquer controller sem
 * import. O que custava era o oposto de um template: dependencia invisivel, com
 * cinco guards e um interceptor disponiveis em todo lugar sem nenhuma linha
 * dizendo de onde vem. Com o import explicito, esquecer o import quebra o BOOT
 * com o nome do guard que nao resolveu — erro cedo e legivel, no lugar de uma
 * rota que se acha protegida.
 *
 * Tambem NAO importa nem reexporta modulo de feature nenhum. O acoplamento que
 * existia (o guard de desafio consultava o repositorio de uma entidade de
 * negocio) virou o port `CHALLENGE_RESOURCE_RESOLVER`, que o projeto liga no seu
 * proprio modulo.
 *
 * Para usar em um modulo de feature:
 *
 * ```ts
 * @Module({
 *   imports: [AntiBotModule],
 *   controllers: [ThingController], // rotas com @AntiBot()
 * })
 * export class ThingModule {}
 * ```
 */
@Module({
  controllers: [AntiBotController],
  providers: [
    tokenStoreProvider,
    FormTokenService,
    TurnstileVerifyService,
    HoneypotGuard,
    TimingGuard,
    FormTokenGuard,
    TurnstileGuard,
    ChallengeGuard,
    BodySanitizerInterceptor,
  ],
  // TOKEN_STORE, FormTokenService e TurnstileVerifyService sao as dependencias
  // que os guards resolvem no injector do modulo que declara o controller: sem
  // exportar, `@AntiBot()` nao sobe em modulo nenhum de fora daqui. Os guards e
  // o interceptor vao junto porque um modulo consumidor pode querer injetar um
  // deles direto (ex.: `@UseGuards(TurnstileGuard)` sozinho).
  exports: [
    TOKEN_STORE,
    FormTokenService,
    TurnstileVerifyService,
    HoneypotGuard,
    TimingGuard,
    FormTokenGuard,
    TurnstileGuard,
    ChallengeGuard,
    BodySanitizerInterceptor,
  ],
})
export class AntiBotModule {}
