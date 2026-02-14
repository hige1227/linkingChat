export interface WsEnvelope<T> {
  requestId: string;
  timestamp: string;
  data: T;
}

export interface WsResponse<T = unknown> {
  requestId?: string;
  success: boolean;
  data?: T;
  error?: WsError;
  timestamp: string;
}

export interface WsError {
  code: string;
  message: string;
}
