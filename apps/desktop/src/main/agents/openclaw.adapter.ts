import type { AgentProvider, AgentChatParams, ChatChunk } from './agent-provider.interface';
import { openClawClientService } from '../services/openclaw-client.service';

export class OpenClawAdapter implements AgentProvider {
  readonly name = 'openclaw';

  private cancelledStreams = new Set<string>();

  async isReady(): Promise<boolean> {
    return openClawClientService.isClientConnected();
  }

  async *chat(params: AgentChatParams): AsyncGenerator<ChatChunk> {
    const client = openClawClientService.getClient();
    if (!client || !openClawClientService.isClientConnected()) {
      yield { type: 'error', error: 'Not connected to OpenClaw Gateway', requestId: params.requestId };
      return;
    }

    this.cancelledStreams.delete(params.requestId);

    try {
      for await (const chunk of client.chat(params.message, { timeout: 300_000 })) {
        if (this.cancelledStreams.has(params.requestId)) break;

        if (chunk.type === 'text') {
          yield { type: 'text', content: chunk.text, requestId: params.requestId };
        } else if (chunk.type === 'done') {
          yield { type: 'done', requestId: params.requestId };
        } else if (chunk.type === 'error') {
          yield { type: 'error', error: chunk.text, requestId: params.requestId };
        } else if (chunk.type === 'tool_use') {
          yield { type: 'tool_call', content: chunk.text, requestId: params.requestId };
        }
      }
    } finally {
      this.cancelledStreams.delete(params.requestId);
    }
  }

  cancelStream(requestId: string): void {
    this.cancelledStreams.add(requestId);
  }
}
