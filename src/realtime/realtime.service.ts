import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import { tenantRoom } from './realtime.constants';

/**
 * Ponto de entrada para o resto da aplicacao publicar eventos em tempo real.
 *
 * A API e generica de proposito: qualquer modulo injeta este servico e chama
 * `emit(tenantId, evento, payload)`. Nao adicione metodos por evento de
 * negocio aqui — isso acopla a infraestrutura de realtime a cada dominio.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  /**
   * O gateway so recebe o servidor no `afterInit`, que roda durante o
   * `app.listen()`. Ate la (e em qualquer processo que suba o modulo sem
   * servidor HTTP, como um worker ou a CLI de migrations) fica null.
   */
  private server: Namespace | null = null;

  /** Chamado pelo RealtimeGateway em `afterInit`. */
  setServer(server: Namespace): void {
    this.server = server;
  }

  /**
   * Emite um evento para todos os sockets autenticados do tenant.
   *
   * Nunca emite para o namespace inteiro: o escopo e sempre a sala do tenant,
   * que e o unico ponto que garante o isolamento multi-tenant no realtime.
   */
  emit(tenantId: string, event: string, data: unknown): void {
    if (!this.server) {
      this.logger.warn(
        `Cannot emit ${event}: WebSocket server not initialized`,
      );
      return;
    }

    const room = tenantRoom(tenantId);
    this.server.to(room).emit(event, data);
    this.logger.debug(`Emitted ${event} to ${room}`);
  }
}
