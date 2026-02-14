export enum DevicePlatform {
  DARWIN = 'darwin',
  WIN32 = 'win32',
  LINUX = 'linux',
}

export enum CommandStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}
