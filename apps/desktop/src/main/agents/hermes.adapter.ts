import type { AgentProvider, AgentChatParams, ChatChunk } from './agent-provider.interface';
import { HERMES_CONFIG } from '../openclaw/openclaw.config';

async function* readSSELines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) yield trimmed.slice(6);
    }
  }

  if (buffer.trim().startsWith('data: ')) yield buffer.trim().slice(6);
}

export class HermesAdapter implements AgentProvider {
  readonly name = 'hermes';
  readonly activeStreams = new Map<string, AbortController>();

  async isReady(): Promise<boolean> {
    try {
      const res = await fetch(`${HERMES_CONFIG.baseUrl}${HERMES_CONFIG.api.health}`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async *chat(params: AgentChatParams): AsyncGenerator<ChatChunk> {
    const controller = new AbortController();
    this.activeStreams.set(params.requestId, controller);

    try {
      const res = await fetch(`${HERMES_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'hermes-agent',
          messages: [{ role: 'user', content: params.message }],
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        yield { type: 'error', error: `Hermes returned ${res.status}`, requestId: params.requestId };
        return;
      }

      for await (const line of readSSELines(res.body)) {
        if (line === '[DONE]') {
          yield { type: 'done', requestId: params.requestId };
          return;
        }
        try {
          const parsed = JSON.parse(line) as { choices: Array<{ delta: { content?: string } }> };
          const delta = parsed.choices[0]?.delta?.content;
          if (delta) yield { type: 'text', content: delta, requestId: params.requestId };
        } catch {
          // Skip malformed SSE lines
        }
      }
    } catch (error: unknown) {
      if ((error as Error).name !== 'AbortError') {
        yield { type: 'error', error: (error as Error).message, requestId: params.requestId };
      }
    } finally {
      this.activeStreams.delete(params.requestId);
    }
  }

  cancelStream(requestId: string): void {
    const ctrl = this.activeStreams.get(requestId);
    if (ctrl) {
      ctrl.abort();
      this.activeStreams.delete(requestId);
    }
  }
}
