/**
 * Namespace do Socket.io usado pelo gateway. O cliente conecta em
 * `io('<host>/realtime', { withCredentials: true })`.
 */
export const REALTIME_NAMESPACE = '/realtime';

/**
 * Nome da sala por tenant. O gateway coloca o socket nesta sala no handshake e
 * o RealtimeService emite para ela: os dois lados precisam usar a mesma
 * funcao, senao o evento vai para uma sala vazia sem nenhum erro.
 */
export function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/**
 * Evento enviado ao cliente imediatamente antes de o servidor derrubar um
 * handshake sem sessao valida. Sem ele o cliente so recebe um `disconnect` e
 * nao consegue distinguir falha de autenticacao de queda de rede — o que leva
 * o front a ficar reconectando em loop com uma sessao expirada.
 */
export const REALTIME_UNAUTHORIZED_EVENT = 'unauthorized';
