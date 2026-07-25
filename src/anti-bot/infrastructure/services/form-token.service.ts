import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

export interface FormTokenPayload {
  /** Identificador unico do token — e a chave do controle de uso unico. */
  jti: string;
  /** Rotulo livre do formulario que pediu o token (ex.: `signup`). */
  context: string;
  /** Emissao, em segundos epoch. */
  iat: number;
  /** Expiracao, em segundos epoch. */
  exp: number;
}

/**
 * Emite e verifica o form token: um JWS HS256 curto, assinado com
 * `ANTI_BOT_TOKEN_SECRET`. Nao e sessao nem autenticacao — prova apenas que o
 * corpo veio de um formulario que a API entregou, e por isso nao carrega
 * nenhuma informacao do usuario.
 *
 * Emissao e verificacao vivem na MESMA classe de proposito: separadas, o
 * controller e o guard resolveriam o segredo e o formato por conta propria e
 * poderiam divergir (foi assim que o token de 30 min ficou com um limite de
 * timing de 30 min configurado em outro lugar).
 */
@Injectable()
export class FormTokenService {
  private readonly logger = new Logger(FormTokenService.name);
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.ttlSeconds = Math.max(
      1,
      Math.floor(
        this.configService.get<number>('antiBot.maxTimeMs', 1_800_000) / 1000,
      ),
    );

    const configured = this.configService.get<string>(
      'antiBot.tokenSecret',
      '',
    );
    if (configured) {
      this.secret = configured;
      return;
    }

    // Sem segredo configurado: chave aleatoria por PROCESSO, nunca um default
    // fixo no repositorio (segredo publicado = qualquer um forja form token).
    // A consequencia e real e precisa aparecer no log: os tokens morrem no
    // restart e nao valem entre instancias, entao com mais de uma replica parte
    // dos submits legitimos e rejeitada.
    this.secret = randomBytes(32).toString('hex');
    const warning =
      'ANTI_BOT_TOKEN_SECRET is not set: using a random per-process secret. ' +
      'Form tokens will not survive a restart and will not validate across instances.';
    if (this.configService.get<string>('app.nodeEnv') === 'production') {
      this.logger.error(warning);
    } else {
      this.logger.warn(warning);
    }
  }

  issue(context: string): { token: string; expiresAt: string } {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: FormTokenPayload = {
      jti: randomUUID(),
      context,
      iat: issuedAt,
      exp: issuedAt + this.ttlSeconds,
    };

    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const body = this.encode(payload);
    const signature = this.sign(`${header}.${body}`);

    return {
      token: `${header}.${body}.${signature}`,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  /** @returns o payload quando a assinatura confere, `null` em qualquer outro caso. */
  verify(token: string): FormTokenPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [header, body, signature] = parts;
    if (!this.signatureMatches(`${header}.${body}`, signature)) {
      return null;
    }

    try {
      const payload: unknown = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf-8'),
      );
      return this.isPayload(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  private encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private sign(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }

  /**
   * `===` em assinatura vaza, pelo tempo de comparacao, quantos bytes iniciais o
   * atacante acertou — e o suficiente para forjar byte a byte. `timingSafeEqual`
   * exige buffers do mesmo tamanho, e a checagem de tamanho vem antes.
   */
  private signatureMatches(data: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(data));
    const received = Buffer.from(signature);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  private isPayload(value: unknown): value is FormTokenPayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.jti === 'string' &&
      candidate.jti.length > 0 &&
      typeof candidate.context === 'string' &&
      typeof candidate.iat === 'number' &&
      typeof candidate.exp === 'number'
    );
  }
}
