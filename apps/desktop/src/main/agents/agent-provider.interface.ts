export interface ChatChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  content?: string;
  error?: string;
  requestId: string;
}

export interface AgentChatParams {
  botId: string;
  converseId: string;
  message: string;
  requestId: string;
}

export interface AgentProvider {
  readonly name: string;
  isReady(): Promise<boolean>;
  chat(params: AgentChatParams): AsyncGenerator<ChatChunk>;
  cancelStream(requestId: string): void;
}

export type AgentType = 'openclaw' | 'hermes';
