import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // Auth
  login: (email: string, password: string) =>
    ipcRenderer.invoke('auth:login', email, password),
  register: (data: { email: string; username: string; password: string; displayName: string }) =>
    ipcRenderer.invoke('auth:register', data),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getToken: () => ipcRenderer.invoke('auth:get-token'),
  refreshToken: () => ipcRenderer.invoke('auth:refresh-token'),

  // Device / WS status
  getConnectionStatus: () => ipcRenderer.invoke('device:get-status'),
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),
  getCommandLog: () => ipcRenderer.invoke('device:get-command-log'),

  // OpenClaw
  getOpenClawStatus: () => ipcRenderer.invoke('openclaw:status'),
  connectOpenClaw: () => ipcRenderer.invoke('openclaw:connect'),
  disconnectOpenClaw: () => ipcRenderer.invoke('openclaw:disconnect'),
  restartOpenClaw: () => ipcRenderer.invoke('openclaw:restart'),
  sendOpenClawMessage: (message: string) => ipcRenderer.invoke('openclaw:send-message', message),
  executeCommand: (command: string) => ipcRenderer.invoke('openclaw:execute-command', command),

  // Event listeners (main → renderer)
  onConnectionStatusChanged: (callback: (status: string) => void) => {
    ipcRenderer.on('device:status-changed', (_event, status) =>
      callback(status),
    );
  },
  onCommandReceived: (callback: (entry: unknown) => void) => {
    ipcRenderer.on('device:command-received', (_event, entry) =>
      callback(entry),
    );
  },
  onOpenClawStatusChanged: (callback: (connected: boolean) => void) => {
    ipcRenderer.on('openclaw:status-changed', (_event, connected) =>
      callback(connected),
    );
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
