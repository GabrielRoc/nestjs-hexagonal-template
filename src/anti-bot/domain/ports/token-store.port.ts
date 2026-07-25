export const TOKEN_STORE = Symbol('TOKEN_STORE');

/**
 * Registro de form tokens ja consumidos — a metade com estado do "uso unico".
 * A assinatura e assincrona de proposito: o adapter em memoria nao precisa,
 * mas um adapter Redis precisa, e trocar um pelo outro nao pode mudar o
 * contrato de quem chama.
 */
export interface TokenStore {
  /**
   * Marca o `jti` como usado de forma atomica.
   *
   * @param jti identificador unico do form token
   * @param ttlMs por quanto tempo a marca precisa sobreviver — sempre >= ao
   *   tempo restante de validade do token, senao a marca expira antes do token
   *   e o mesmo token volta a ser aceito (replay).
   * @returns `true` no primeiro uso, `false` se o token ja tinha sido usado.
   */
  markUsed(jti: string, ttlMs: number): Promise<boolean>;
}
