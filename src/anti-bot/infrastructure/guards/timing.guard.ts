import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import { TIMESTAMP_FIELD } from '../../anti-bot.constants';
import { respondWithFakeSuccess } from '../fake-success';
import { getVerifiedFormToken } from '../form-token-context';

/**
 * Camada 3 — janela de tempo.
 *
 * ATAQUE QUE PARA, de dois lados:
 * - RAPIDO DEMAIS (`age < minTimeMs`): script que faz POST direto, sem passar o
 *   tempo que uma pessoa gasta preenchendo o formulario. Devolve 200 falso, pelo
 *   mesmo motivo da isca — um 403 aqui entregaria o limiar, e o bot passaria a
 *   esperar 2s.
 * - VELHO DEMAIS (`age > maxTimeMs`): token colhido de uma pagina e reenviado
 *   depois (replay), ou aba aberta ha horas. Aqui SIM devolve erro: e o caso
 *   legitimo comum, e o usuario precisa saber que deve recarregar.
 *
 * DE ONDE VEM A IDADE, e por que isso importa: do `iat` do form token, gerado e
 * assinado pelo SERVIDOR e ja verificado pelo `FormTokenGuard`, que roda antes
 * desta camada no `@AntiBot()`. O `_t` do corpo e apenas o fallback para rota que
 * usa `@UseGuards(TimingGuard)` sem form token, e vale como sinal, nao como prova
 * — quem manda `_t` manda o que quiser.
 *
 * A versao anterior media so pelo `_t`, e o custo era assimetrico: o bot que
 * conhece o campo manda `Date.now() - 5000` e passa, enquanto um usuario com o
 * relogio do dispositivo adiantado produzia idade NEGATIVA, caia no ramo "rapido
 * demais" e tinha a submissao descartada com um 200 falso — dado de gente
 * perdido em silencio por causa do relogio dela. Idade nao medivel agora nao
 * opina (ver `resolveAgeMs`).
 *
 * LIMITES QUE ESTA CAMADA TEM, e que sao o motivo de ela nao vir sozinha:
 * - sem form token e sem `_t` (ou com `_t` nao numerico), passa direto: a rota
 *   pode nao ter formulario instrumentado. Quem fecha essa porta e o
 *   `FormTokenGuard`, que exige header e falha fechado.
 * - a janela e a MESMA do `exp` do form token (`ANTI_BOT_MAX_TIME_MS`), de
 *   proposito: dois limites separados divergem e o usuario recebe "expirado" com
 *   token valido, ou o contrario.
 */
@Injectable()
export class TimingGuard implements CanActivate {
  private readonly minTimeMs: number;
  private readonly maxTimeMs: number;

  constructor(private readonly configService: ConfigService) {
    this.minTimeMs = this.configService.get<number>('antiBot.minTimeMs', 2_000);
    this.maxTimeMs = this.configService.get<number>(
      'antiBot.maxTimeMs',
      1_800_000,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const ageMs = this.resolveAgeMs(request);

    if (ageMs === undefined) {
      return true;
    }

    if (ageMs < this.minTimeMs) {
      respondWithFakeSuccess(
        request,
        http.getResponse<Response>(),
        'timing-too-fast',
      );
      return false;
    }

    if (ageMs > this.maxTimeMs) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_EXPIRED,
        'Formulário expirado. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return true;
  }

  /**
   * @returns a idade do formulario em ms, ou `undefined` quando ela nao e
   *   medivel — e nesse caso a camada nao opina. Idade negativa entra em
   *   `undefined` de proposito: ela significa relogio adiantado (fallback do
   *   cliente) ou skew entre instancias (token), nunca "submissao instantanea", e
   *   concluir "rapido demais" a partir dela DESCARTA uma submissao legitima sem
   *   deixar rastro para o usuario.
   */
  private resolveAgeMs(request: Request): number | undefined {
    const renderedAtMs = this.resolveRenderedAtMs(request);
    if (renderedAtMs === undefined) {
      return undefined;
    }

    const ageMs = Date.now() - renderedAtMs;
    return ageMs >= 0 ? ageMs : undefined;
  }

  /** Instante (ms) em que o formulario foi entregue, na melhor fonte disponivel. */
  private resolveRenderedAtMs(request: Request): number | undefined {
    // Fonte de verdade: `iat` assinado, deixado na requisicao pelo FormTokenGuard.
    // Imune ao relogio do cliente e impossivel de esticar sem o segredo HMAC.
    const verified = getVerifiedFormToken(request);
    if (verified) {
      return verified.iat * 1000;
    }

    // Fallback do cliente. Aceita numero em string porque `_t` vem de um campo de
    // formulario; nao numerico e tratado como ausente (NaN em comparacao e sempre
    // falso, o que desligaria a camada sem nenhum sinal).
    const body = request.body as Record<string, unknown> | undefined;
    const raw = body?.[TIMESTAMP_FIELD];
    if (raw === undefined || raw === null || raw === '') {
      return undefined;
    }

    const renderedAt = Number(raw);
    return Number.isFinite(renderedAt) ? renderedAt : undefined;
  }
}
