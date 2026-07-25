import { Global, Module } from '@nestjs/common';
import { UserModule } from '../user/infrastructure/user.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/**
 * Modulo de realtime (Socket.io) autenticado por sessao do SuperTokens e
 * isolado por tenant.
 *
 * `@Global()` porque publicar evento e transversal: qualquer use case de
 * qualquer modulo pode querer emitir, e obrigar cada modulo a importar
 * `RealtimeModule` so espalha boilerplate. Em troca, a dependencia fica
 * implicita — se isso incomodar no seu projeto, remova o `@Global()` e importe
 * onde precisar.
 *
 * `UserModule` entra por causa do `USER_REPOSITORY`: o gateway traduz o usuario
 * do SuperTokens no `tenantId` que define a sala do socket.
 *
 * A politica de CORS/Origin do handshake NAO esta aqui — ela vem do
 * `RealtimeIoAdapter` registrado em `main.ts`.
 */
@Global()
@Module({
  imports: [UserModule],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
