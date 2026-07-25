import { Injectable, Logger } from '@nestjs/common';
import { TokenStore } from '../../domain/ports/token-store.port';

/** Varredura no maximo a cada minuto, amortizada nas escritas. */
const PRUNE_INTERVAL_MS = 60_000;

/**
 * Teto de entradas. Com o TTL default de 30 min, 100k entradas equivalem a
 * ~55 submissoes por segundo sustentadas — muito acima do rate limit global.
 */
const MAX_ENTRIES = 100_000;

/**
 * Store de form tokens usados em memoria.
 *
 * LIMITACAO REAL, e o motivo de existir um port: o Map vive em UM processo.
 * Com mais de uma instancia (replicas, `PM2 -i`, autoscaling) cada uma tem seu
 * proprio registro, entao o "uso unico" vale por instancia — o mesmo token e
 * aceito uma vez em cada. E um deploy rolling (ou qualquer restart) esvazia o
 * registro: formularios em voo perdem a marca de uso, e os tokens emitidos
 * antes do restart deixam de validar quando o segredo tambem e por processo.
 * Para uso unico global, ligue um adapter compartilhado (Redis) no `TOKEN_STORE`.
 *
 * Nao usa `@nestjs/schedule`: a limpeza e amortizada nas escritas (ver `prune`),
 * o que dispensa a dependencia inteira.
 */
@Injectable()
export class InMemoryTokenStore implements TokenStore {
  private readonly logger = new Logger(InMemoryTokenStore.name);
  /** jti -> instante (ms) em que a marca de uso pode ser descartada. */
  private readonly used = new Map<string, number>();
  private lastPruneAt = 0;

  markUsed(jti: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    this.prune(now);

    const expiresAt = this.used.get(jti);
    if (expiresAt !== undefined && expiresAt > now) {
      return Promise.resolve(false);
    }

    // Entrada expirada e sobrescrita, e nao reaproveitada como "ja usado": o
    // FormTokenGuard checa o `exp` do token ANTES de chegar aqui, entao um jti
    // com marca expirada so pode vir de um token que tambem ja expirou.
    this.used.set(jti, now + ttlMs);
    this.enforceCap();
    return Promise.resolve(true);
  }

  /**
   * Expiracao preguicosa nao basta sozinha: o `jti` e aleatorio e nunca e
   * consultado de novo, entao nada dispararia a limpeza da propria chave. A
   * varredura periodica (no maximo uma por minuto, na escrita) e o que mantem o
   * Map limitado sem um scheduler.
   */
  private prune(now: number): void {
    if (now - this.lastPruneAt < PRUNE_INTERVAL_MS) {
      return;
    }
    this.lastPruneAt = now;
    for (const [jti, expiresAt] of this.used) {
      if (expiresAt <= now) {
        this.used.delete(jti);
      }
    }
  }

  /**
   * Ultima linha de defesa contra crescimento sem limite (flood de submissoes
   * dentro de uma unica janela de TTL, quando a varredura nao tem nada a
   * remover). Descarta as entradas mais antigas — `Map` itera na ordem de
   * insercao, e a mais antiga e a que expira primeiro. O custo e explicito:
   * o token descartado volta a ser aceito uma vez. Preferivel a estourar a
   * memoria do processo, e o aviso diz que o store compartilhado ja era.
   */
  private enforceCap(): void {
    if (this.used.size <= MAX_ENTRIES) {
      return;
    }
    const excess = this.used.size - MAX_ENTRIES;
    let removed = 0;
    for (const jti of this.used.keys()) {
      if (removed >= excess) {
        break;
      }
      this.used.delete(jti);
      removed += 1;
    }
    this.logger.warn(
      `In-memory token store hit ${MAX_ENTRIES} entries; dropped ${removed} of the oldest. Those form tokens become replayable once.`,
    );
  }
}
