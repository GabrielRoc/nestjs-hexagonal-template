import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5_000;

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Verificacao server-side do token do widget Cloudflare Turnstile.
 *
 * Usa o `fetch` global do Node (>= 22.13 pelo `engines`) em vez de
 * `@nestjs/axios`: e uma unica chamada HTTP e o axios entraria como dependencia
 * de producao permanente do template (ver report-anti-bot.md).
 */
@Injectable()
export class TurnstileVerifyService {
  private readonly logger = new Logger(TurnstileVerifyService.name);
  private readonly secretKey: string;
  private readonly failOpen: boolean;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>(
      'antiBot.turnstileSecretKey',
      '',
    );
    this.failOpen = this.configService.get<boolean>(
      'antiBot.turnstileFailOpen',
      true,
    );

    // Turnstile ligado sem secret: a Cloudflare responde
    // `invalid-input-secret` e TODA submissao e rejeitada. Melhor ver isso no
    // boot do que no primeiro formulario perdido.
    if (
      this.configService.get<boolean>('antiBot.turnstileEnabled', false) &&
      !this.secretKey
    ) {
      this.logger.error(
        'TURNSTILE_ENABLED=true but TURNSTILE_SECRET_KEY is empty: every verification will fail.',
      );
    }
  }

  async verify(token: string, remoteIp?: string): Promise<boolean> {
    const form = new URLSearchParams();
    form.append('secret', this.secretKey);
    form.append('response', token);
    if (remoteIp) {
      form.append('remoteip', remoteIp);
    }

    try {
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        // Sem timeout, uma chamada pendurada segura a requisicao do usuario ate
        // o timeout do socket.
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.error(
          `Turnstile verification returned HTTP ${response.status}`,
        );
        return this.failOpen;
      }

      const data = (await response.json()) as TurnstileVerifyResponse | null;
      if (typeof data?.success !== 'boolean') {
        this.logger.error('Turnstile verification returned an unexpected body');
        return this.failOpen;
      }

      if (!data.success) {
        // Os error-codes sao da Cloudflare e nao contem o token do usuario.
        this.logger.warn(
          `Turnstile verification failed: ${data['error-codes']?.join(', ') ?? 'no error code'}`,
        );
      }

      return data.success;
    } catch (error) {
      // Rede fora, DNS, timeout: cai na politica de `TURNSTILE_FAIL_OPEN`.
      this.logger.error(
        `Turnstile verification error (fail ${this.failOpen ? 'open' : 'closed'})`,
        error instanceof Error ? error.stack : String(error),
      );
      return this.failOpen;
    }
  }
}
