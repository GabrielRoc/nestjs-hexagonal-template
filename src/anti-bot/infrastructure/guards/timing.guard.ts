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

/**
 * Camada 2 — janela de tempo.
 *
 * ATAQUE QUE PARA, de dois lados:
 * - RAPIDO DEMAIS (`elapsed < minTimeMs`): script que faz POST direto, sem
 *   passar o tempo que uma pessoa gasta preenchendo o formulario. Devolve 200
 *   falso, pelo mesmo motivo da isca — um 403 aqui entregaria o limiar, e o bot
 *   passaria a esperar 2s.
 * - VELHO DEMAIS (`elapsed > maxTimeMs`): token colhido de uma pagina e
 *   reenviado depois (replay), ou aba aberta ha horas. Aqui SIM devolve erro:
 *   e o caso legitimo comum, e o usuario precisa saber que deve recarregar.
 *
 * LIMITES QUE ESTA CAMADA TEM, e que sao o motivo de ela nao vir sozinha:
 * - `_t` vem do cliente. Um bot que conhece o campo manda `Date.now() - 5000` e
 *   passa. A idade que NAO da para falsificar e o `exp` assinado do form token,
 *   verificado pelo FormTokenGuard no mesmo stack do `@AntiBot()`.
 * - `_t` ausente ou nao numerico passa direto (a rota pode nao ter formulario
 *   instrumentado). Quem fecha essa porta e o FormTokenGuard, que exige header.
 * - depende do relogio do cliente: relogio adiantado produz `elapsed` negativo
 *   e cai no ramo "rapido demais".
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
    const body = http.getRequest<Request>().body as
      Record<string, unknown> | undefined;
    const raw = body?.[TIMESTAMP_FIELD];

    if (raw === undefined || raw === null || raw === '') {
      return true;
    }

    const renderedAt = Number(raw);
    if (!Number.isFinite(renderedAt)) {
      return true;
    }

    const elapsed = Date.now() - renderedAt;

    if (elapsed < this.minTimeMs) {
      respondWithFakeSuccess(http.getResponse<Response>());
      return false;
    }

    if (elapsed > this.maxTimeMs) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_EXPIRED,
        'Formulário expirado. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return true;
  }
}
