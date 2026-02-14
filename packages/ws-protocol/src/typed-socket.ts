import type { WsResponse, WsEnvelope } from './envelope';
import type {
  DeviceRegisterPayload,
  DeviceHeartbeatPayload,
  DeviceCommandPayload,
  DeviceResultPayload,
  DeviceStatusPayload,
} from './payloads/device.payloads';

export interface SocketData {
  userId: string;
  username: string;
  deviceId?: string;
  deviceType: 'mobile' | 'desktop' | 'web';
}

export interface ClientToServerEvents {
  'device:register': (
    data: DeviceRegisterPayload,
    ack: (res: WsResponse) => void,
  ) => void;
  'device:heartbeat': (data: DeviceHeartbeatPayload) => void;
  'device:command:send': (
    data: WsEnvelope<DeviceCommandPayload>,
    ack: (res: WsResponse) => void,
  ) => void;
  'device:command:cancel': (
    data: { commandId: string },
    ack: (res: WsResponse) => void,
  ) => void;
  'device:result:complete': (data: WsEnvelope<DeviceResultPayload>) => void;
  'device:result:progress': (data: {
    commandId: string;
    progress: number;
    output?: string;
  }) => void;
}

export interface ServerToClientEvents {
  'device:command:execute': (data: DeviceCommandPayload) => void;
  'device:command:ack': (data: {
    commandId: string;
    status: string;
  }) => void;
  'device:result:delivered': (data: DeviceResultPayload) => void;
  'device:result:progress': (data: {
    commandId: string;
    progress: number;
    output?: string;
  }) => void;
  'device:status:changed': (data: DeviceStatusPayload) => void;
  'system:error': (data: { code: string; message: string }) => void;
}

// These types require socket.io as a peer dependency.
// They are re-exported as type-only to avoid runtime dependency.
// Consumers must cast their Server/Socket instances.
export type TypedServer = any;
export type TypedSocket = any;
