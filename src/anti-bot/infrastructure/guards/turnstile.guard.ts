import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { TURNSTILE_FIELD } from '../../anti-bot.constants';
import { TurnstileVerifyService } from '../services/turnstile-verify.service';

/**
 * Camada 5 — CAPTCHA (Cloudflare Turnstile).
 *
 * ATAQUE QUE PARA: automacao com navegador de verdade (Puppeteer/Playwright), que
 * passa por isca, timing e form token sem dificuldade porque executa o JS da
 * pagina. O Turnstile avalia sinais do browser do lado da Cloudflare e o token
 * resultante e verificado server-side aqui; nao da para reaproveitar (a
 * Cloudflare recusa o mesmo token duas vezes).
 *
 * INERTE por default: sem `TURNSTILE_ENABLED=true` passa direto e nem chama a
 * Cloudflare. E o unico jeito de o guard poder ficar declarado em rotas publicas
 * (ex.: recuperacao de senha) sem quebrar um clone recem-criado do template —
 * o operador liga a chave e a protecao entra sem mudar codigo.
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly turnstileService: TurnstileVerifyService,
  ) {
    this.enabled = this.configService.get<boolean>(
      'antiBot.turnstileEnabled',
      false,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as Record<string, unknown> | undefined;
    const raw = body?.[TURNSTILE_FIELD];
    const token = typeof raw === 'string' ? raw.trim() : '';

    if (!token) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_CAPTCHA_FAILED,
        'Verificação de segurança ausente. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const isValid = await this.turnstileService.verify(token, request.ip);
    if (!isValid) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_CAPTCHA_FAILED,
        'Verificação de segurança falhou. Tente novamente.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return true;
  }
}
