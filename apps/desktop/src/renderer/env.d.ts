interface ElectronAPI {
  login: (
    email: string,
    password: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    user?: { id: string; username: string; displayName: string };
  }>;
  register: (data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }) => Promise<{
    success: boolean;
    error?: string;
    user?: { id: string; username: string; displayName: string };
  }>;
  logout: () => Promise<{ success: boolean }>;
  getToken: () => Promise<string | null>;
  refreshToken: () => Promise<string | null>;

  getConnectionStatus: () => Promise<string>;
  getDeviceInfo: () => Promise<{
    deviceId: string;
    name: string;
    platform: string;
  }>;
  getCommandLog: () => Promise<
    Array<{
      commandId: string;
      action: string;
      type: string;
      status: string;
      output?: string;
      exitCode?: number;
      executionTimeMs?: number;
      receivedAt: string;
      completedAt?: string;
    }>
  >;

  getOpenClawStatus: () => Promise<{
    connected: boolean;
    mode?: string;
    url?: string;
    process?: {
      mode: string;
      running: boolean;
      pid?: number;
      restartCount: number;
      lastError?: string;
    };
  }>;
  connectOpenClaw: () => Promise<{
    connected: boolean;
    url?: string;
    error?: string;
    mode?: string;
  }>;
  disconnectOpenClaw: () => Promise<{ success: boolean }>;
  restartOpenClaw: () => Promise<{
    connected: boolean;
    url?: string;
    error?: string;
    mode?: string;
  }>;

  onConnectionStatusChanged: (callback: (status: string) => void) => void;
  onCommandReceived: (callback: (entry: unknown) => void) => void;
  onOpenClawStatusChanged: (callback: (connected: boolean) => void) => void;

  openClawStartStream: (message: string, sessionKey: string) => Promise<{ requestId: string }>;
  openClawCancelStream: (requestId: string) => Promise<{ cancelled: boolean }>;
  onOpenClawStreamChunk: (
    callback: (data: { requestId: string; chunk: { type: string; text: string } }) => void,
  ) => void;
  offOpenClawStreamChunk: (
    callback: (data: { requestId: string; chunk: { type: string; text: string } }) => void,
  ) => void;
}

declare module 'zustand';
declare module 'react-router-dom';

interface Window {
  electronAPI: ElectronAPI;
}
