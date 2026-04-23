import type { AgentProvider, AgentChatParams, ChatChunk } from './agent-provider.interface';
import { HERMES_CONFIG } from '../openclaw/openclaw.config';
import { aiGatewayService } from '../services/ai-gateway.service';
import { app } from 'electron';

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
    // In production, Hermes routes through Server proxy — ready if we have a token
    if (app.isPackaged) return aiGatewayService.getToken() !== null;

    try {
      const res = await fetch(`${HERMES_CONFIG.baseUrl}${HERMES_CONFIG.api.health}`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async *chat(params: AgentChatParams): AsyncGenerator<ChatChunk> {
    // In production, call Server LLM proxy instead of local Hermes process
    if (app.isPackaged) {
      yield* this.chatViaServerProxy(params);
      return;
    }
    yield* this.chatViaLocalHermes(params);
  }

  private async *chatViaServerProxy(params: AgentChatParams): AsyncGenerator<ChatChunk> {
    const token = aiGatewayService.getToken();
    if (!token) {
      yield { type: 'error', error: 'No LLM token. Please log in again.', requestId: params.requestId };
      return;
    }

    const controller = new AbortController();
    this.activeStreams.set(params.requestId, controller);

    try {
      const res = await fetch(`${aiGatewayService.getApiBase()}/api/v1/ai/llm-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: params.message }],
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        yield { type: 'error', error: `Server proxy returned ${res.status}`, requestId: params.requestId };
        return;
      }

      for await (const line of readSSELines(res.body)) {
        try {
          const chunk = JSON.parse(line) as { type: string; content?: string; message?: string };
          if (chunk.type === 'text' && chunk.content) {
            yield { type: 'text', content: chunk.content, requestId: params.requestId };
          } else if (chunk.type === 'done') {
            yield { type: 'done', requestId: params.requestId };
            return;
          } else if (chunk.type === 'error') {
            yield { type: 'error', error: chunk.message ?? 'Server proxy error', requestId: params.requestId };
            return;
          }
        } catch {
          // skip malformed SSE lines
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

  private async *chatViaLocalHermes(params: AgentChatParams): AsyncGenerator<ChatChunk> {
    const controller = new AbortController();
    this.activeStreams.set(params.requestId, controller);

    try {
      const res = await fetch(`${HERMES_CONFIG.baseUrl}${HERMES_CONFIG.api.chat}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: HERMES_CONFIG.model,
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
        if (line === HERMES_CONFIG.sseEndMarker) {
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
