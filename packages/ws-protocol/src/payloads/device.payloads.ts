export interface DeviceRegisterPayload {
  deviceId: string;
  name: string;
  platform: 'darwin' | 'win32' | 'linux';
  capabilities?: string[];
}

export interface DeviceHeartbeatPayload {
  deviceId: string;
  cpuUsage?: number;
  memoryUsage?: number;
}

export interface DeviceCommandPayload {
  commandId: string;
  targetDeviceId: string;
  type: 'shell' | 'file' | 'automation';
  action: string;
  args?: Record<string, unknown>;
  timeout?: number;
}

export interface DeviceResultPayload {
  commandId: string;
  status: 'success' | 'error' | 'partial' | 'cancelled';
  data?: {
    output?: string;
    exitCode?: number;
  };
  error?: { code: string; message: string };
  executionTimeMs: number;
}

export interface DeviceStatusPayload {
  deviceId: string;
  name: string;
  platform: 'darwin' | 'win32' | 'linux';
  online: boolean;
  lastSeenAt: string;
}
