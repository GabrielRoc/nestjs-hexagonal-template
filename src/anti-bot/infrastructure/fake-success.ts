import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';

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
export function respondWithFakeSuccess(response: Response): void {
  response.status(HttpStatus.OK).json({ data: { success: true } });
}
