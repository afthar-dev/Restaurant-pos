import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { DEVICE_COOKIE } from '../auth/cookies';
import { TokenService } from '../auth/token.service';
import { sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

interface OutletEvent {
  outletId: string;
  [key: string]: unknown;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Pushes small "something changed" notices to screens. Clients refetch over HTTP on each
 * notice and on reconnect, so a missed message never loses data.
 *
 * Sockets authenticate with an access token (`auth.token`), the device cookie, or both, and join
 * `outlet:<id>`; a registered device also joins `device:<id>` for its print jobs.
 *
 * The path is under /api because the httpOnly device cookie is scoped to Path=/api: browsers
 * would not send it to any other path.
 */
export const SOCKET_PATH = '/api/socket.io';

@WebSocketGateway({ path: SOCKET_PATH })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const rooms = await this.roomsFor(client);
      if (!rooms) {
        client.emit('auth_error', { code: 'UNAUTHENTICATED' });
        client.disconnect(true);
        return;
      }
      await client.join(rooms);
    } catch (error) {
      this.logger.warn(`Socket rejected: ${String(error)}`);
      client.disconnect(true);
    }
  }

  private async roomsFor(client: Socket): Promise<string[] | null> {
    const rooms: string[] = [];
    let outletId: string | null = null;

    const token: unknown = client.handshake.auth?.token;
    if (typeof token === 'string' && token) {
      const claims = this.tokens.verifyAccess(token);
      if (!claims) return null;
      const user = await this.prisma.user.findUnique({ where: { id: claims.userId } });
      if (!user || user.archivedAt) return null;
      outletId = user.outletId;
      rooms.push(`user:${user.id}`);
    }

    const deviceToken = readCookie(client.handshake.headers.cookie, DEVICE_COOKIE);
    if (deviceToken) {
      const device = await this.prisma.device.findUnique({
        where: { tokenHash: sha256(deviceToken) },
      });
      // A signed-in browser on an unknown or other-outlet device still gets its user events.
      if (device && !device.revokedAt && (!outletId || device.outletId === outletId)) {
        outletId = device.outletId;
        rooms.push(`device:${device.id}`);
      } else if (!outletId) {
        return null;
      }
    }

    return outletId ? [`outlet:${outletId}`, ...rooms] : null;
  }

  private toOutlet(event: string, { outletId, ...payload }: OutletEvent) {
    this.server?.to(`outlet:${outletId}`).emit(event, payload);
  }

  @OnEvent('order.updated')
  orderUpdated(event: OutletEvent) {
    this.toOutlet('order.updated', event);
  }

  @OnEvent('bill.updated')
  billUpdated(event: OutletEvent) {
    this.toOutlet('bill.updated', event);
  }

  @OnEvent('kot.created')
  kotCreated(event: OutletEvent) {
    this.toOutlet('kot.created', event);
  }

  @OnEvent('kot.updated')
  kotUpdated(event: OutletEvent) {
    this.toOutlet('kot.updated', event);
  }

  @OnEvent('menu.availability')
  menuAvailability(event: OutletEvent) {
    this.toOutlet('menu.availability', event);
  }

  @OnEvent('day.updated')
  dayUpdated(event: OutletEvent) {
    this.toOutlet('day.updated', event);
  }

  @OnEvent('print.job')
  printJob({ deviceId, jobId }: { deviceId: string; jobId: string }) {
    this.server?.to(`device:${deviceId}`).emit('print.job', { jobId });
  }
}
