import { HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/** Camada que descartou a submissao — vai para o log, nunca para a resposta. */
export type FakeSuccessReason = 'honeypot-field-filled' | 'timing-too-fast';

const logger = new Logger('AntiBotFakeSuccess');

/**
 * Responde 200 com um envelope de sucesso para uma requisicao identificada como
 * bot, sem executar o handler.
 *
 * POR QUE UM SUCESSO FALSO E NAO 403: o 403 e um sinal de calibragem. O bot
 * remove um campo, tenta de novo, ve 200 e aprende exatamente qual campo era a
 * isca (ou quantos milissegundos precisa esperar); o custo de descobrir isso e
 * de duas requisicoes. Com 200 em todas as tentativas, nada distingue o
 * bloqueio do sucesso: nao ha sinal para otimizar contra, e o operador do bot
 * continua contando submissoes que nunca existiram.
 *
 * Limite honesto: quem compara o CORPO da resposta com uma submissao legitima
 * (id criado, campos derivados) percebe a diferenca. O alvo aqui e bot de
 * volume, nao atacante dedicado — por isso esta e uma camada, nao a defesa.
 *
 * Mantenha o corpo parecido com o sucesso real da rota protegida. Se a rota
 * devolve 201 com o recurso criado, o ideal e imitar isso; este default serve
 * para rotas de "recebido" (formulario, contato, inscricao).
 */
export function respondWithFakeSuccess(
  request: Request,
  response: Response,
  reason: FakeSuccessReason,
): void {
  // O log aqui e OBRIGATORIO, nao um extra: o cliente recebe 200, o handler nunca
  // roda e nada e gravado, entao sem esta linha a submissao descartada nao deixa
  // rastro nenhum — o GlobalExceptionFilter tambem retorna cedo quando os headers
  // ja foram enviados. E `warn` e nao `debug` porque um pico aqui e a unica
  // evidencia de que uma camada esta descartando gente de verdade (autofill do
  // navegador na isca, relogio do dispositivo adiantado).
  //
  // So rota e motivo: nem valor de campo, nem corpo, nem IP. Log de bloqueio nao
  // e lugar de dado de formulario.
  logger.warn(
    `Discarded submission with a fake success (reason=${reason}, route=${request.method} ${request.originalUrl})`,
  );

  response.status(HttpStatus.OK).json({ data: { success: true } });
}
