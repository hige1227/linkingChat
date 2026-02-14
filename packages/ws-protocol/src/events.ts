export const DEVICE_EVENTS = {
  // Client → Server
  REGISTER: 'device:register',
  HEARTBEAT: 'device:heartbeat',
  COMMAND_SEND: 'device:command:send',
  COMMAND_CANCEL: 'device:command:cancel',
  RESULT_COMPLETE: 'device:result:complete',
  RESULT_PROGRESS: 'device:result:progress',

  // Server → Client
  COMMAND_EXECUTE: 'device:command:execute',
  COMMAND_ACK: 'device:command:ack',
  RESULT_DELIVERED: 'device:result:delivered',
  RESULT_PROGRESS_FWD: 'device:result:progress', // same event name, Socket.IO distinguishes by direction
  STATUS_CHANGED: 'device:status:changed',
} as const;
