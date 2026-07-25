import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/enums/error-codes.enum';
import {
  TOKEN_STORE,
  type TokenStore,
} from '../../domain/ports/token-store.port';
import { getVerifiedFormToken } from '../form-token-context';

/**
 * Camada 6 — token de formulario: CONSUMO (uso unico).
 *
 * ATAQUE QUE PARA: REPLAY. O `jti` do token e marcado no `TOKEN_STORE` de forma
 * atomica; da segunda submissao em diante, o mesmo token e rejeitado.
 *
 * POR QUE E A ULTIMA CAMADA, e nao parte do `FormTokenGuard`:
 * - as camadas anteriores que falham por erro humano (desafio) ou por rede
 *   (Turnstile) mandam o usuario "tentar novamente". Se o token ja tivesse sido
 *   gasto, a tentativa seguinte com o mesmo formulario bateria em "token ja
 *   utilizado" — a instrucao da mensagem seria impossivel de seguir;
 * - e ainda assim roda ANTES do handler, que e o que fecha a corrida entre duas
 *   submissoes simultaneas do mesmo token: as duas passariam pelos guards
 *   anteriores, mas so uma ganha o `markUsed`.
 *
 * O que fica de fora, por escolha: uma falha DEPOIS deste guard (validacao Zod do
 * corpo, regra de negocio) tambem gasta o token. Preservar o token ate o fim do
 * handler exigiria consumir depois da resposta, e ai duas requisicoes
 * concorrentes com o mesmo token passariam as duas — perder o uso unico e pior do
 * que pedir uma recarga de pagina num corpo invalido.
 */
@Injectable()
export class FormTokenConsumeGuard implements CanActivate {
  private readonly logger = new Logger(FormTokenConsumeGuard.name);

  constructor(
    @Inject(TOKEN_STORE)
    private readonly tokenStore: TokenStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const payload = getVerifiedFormToken(request);

    if (!payload) {
      // Só chega aqui quem usou este guard sem o `FormTokenGuard` antes dele.
      // Falha fechada: liberar seria transformar um erro de composicao em rota
      // sem uso unico, silenciosamente. O log e o que diz ao dev o que fazer;
      // o usuario recebe a mensagem generica de token ausente.
      this.logger.error(
        'FormTokenConsumeGuard ran without a verified form token: it must always follow FormTokenGuard (use @AntiBot()).',
      );
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID,
        'Token de formulário ausente. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // O tempo restante e recalculado, e nao herdado do FormTokenGuard: entre a
    // verificacao e este ponto rodaram uma chamada a Cloudflare e uma consulta ao
    // resolver do desafio. Com `remainingMs <= 0` a marca de uso nasceria morta e
    // o token voltaria a ser aceito.
    const remainingMs = payload.exp * 1000 - Date.now();
    if (remainingMs <= 0) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_EXPIRED,
        'Formulário expirado. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // A marca de uso precisa durar pelo menos o tempo que resta do token; menos
    // que isso e o token volta a ser aceito antes de expirar.
    const isFirstUse = await this.tokenStore.markUsed(payload.jti, remainingMs);
    if (!isFirstUse) {
      throw new DomainException(
        ErrorCode.ANTI_BOT_FORM_TOKEN_INVALID,
        'Token de formulário já utilizado. Recarregue a página.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return true;
  }
}
