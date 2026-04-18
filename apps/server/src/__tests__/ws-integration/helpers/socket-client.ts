/**
 * Socket.IO client helpers for WS integration tests.
 */
import { io, Socket as ClientSocket } from 'socket.io-client';

export interface ConnectOptions {
  baseUrl: string;
  namespace: string;
  token: string;
  deviceType?: string;
}

/**
 * Connect a socket.io client and wait for the 'connect' event.
 */
export function connectSocket(opts: ConnectOptions): Promise<ClientSocket> {
  const url = `${opts.baseUrl}/${opts.namespace}`;
  const socket = io(url, {
    transports: ['websocket'],
    auth: {
      token: opts.token,
      deviceType: opts.deviceType ?? 'desktop',
    },
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket connection timeout for ${url}`));
    }, 10_000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(new Error(`Socket connect_error: ${err.message}`));
    });
  });
}

/**
 * Wait for a specific event on the socket with timeout.
 */
export function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeout = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: did not receive "${event}" within ${timeout}ms`)),
      timeout,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Assert that an event does NOT arrive within the given duration.
 */
export function assertNoEvent(
  socket: ClientSocket,
  event: string,
  duration = 1000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (data: unknown) =>
      reject(new Error(`Should NOT have received "${event}" but got: ${JSON.stringify(data)}`));
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, duration);
  });
}

/**
 * Safely disconnect a socket (no-op if already disconnected).
 */
export function disconnectSocket(socket: ClientSocket | undefined): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

/**
 * Disconnect a socket and wait for it to fully close.
 * Use in afterAll before Prisma cleanup to avoid Prisma-after-close errors.
 */
export function disconnectSocketAndWait(socket: ClientSocket | undefined, timeout = 3000): Promise<void> {
  if (!socket || !socket.connected) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeout);
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.disconnect();
  });
}
