import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { ChatState, ToolRecord } from '../stores/chatStore';
import { API_BASE_URL } from '@renderer/config';

const API_URL = API_BASE_URL + '/api/v1';

export function useOpenClawChat(converseId: string) {
  const activeRequestRef = useRef<string | null>(null);

  // Register global chunk listener once per mount
  useEffect(() => {
    const cleanup = window.electronAPI.onOpenClawStreamChunk((data) => {
      useChatStore.getState().appendStreamChunk(data.requestId, data.chunk);
    });
    return cleanup;
  }, []);

  const sendMessage = useCallback(
    async (message: string, botId: string, token: string): Promise<void> => {
      const sessionKey = `bot_converse_${converseId}`;

      // 1. Start stream → returns requestId immediately
      const { requestId } = await window.electronAPI.openClawStartStream(
        message,
        sessionKey,
      );
      activeRequestRef.current = requestId;

      // 2. Add streaming placeholder bubble in store
      useChatStore.getState().addStreamingMessage(converseId, requestId);

      // 3. Wait for streaming to complete (done or error), with safety timeout
      await new Promise<void>((resolve) => {
        const STREAM_TIMEOUT = 120_000; // 2 min max for any stream
        const timeout = setTimeout(() => {
          unsubscribe();
          // Force-finish stale streaming bubble
          const sm = useChatStore.getState().streamingMessages[requestId];
          if (sm && sm.status === 'streaming') {
            useChatStore.getState().appendStreamChunk(requestId, {
              type: 'done',
              text: '',
            });
          }
          resolve();
        }, STREAM_TIMEOUT);
        const unsubscribe = useChatStore.subscribe((state: ChatState) => {
          const sm = state.streamingMessages[requestId];
          if (!sm || sm.status === 'done' || sm.status === 'error') {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          }
        });
      });

      // 4. Persist bot reply to server (include tool records in metadata)
      const finalState = useChatStore.getState().streamingMessages[requestId];
      console.log('[useOpenClawChat] Stream complete. finalState=', {
        exists: !!finalState,
        status: finalState?.status,
        textLen: finalState?.text?.length,
        toolRecords: finalState?.toolRecords?.length,
        converseId,
        botId,
      });
      let persisted = false;

      if (finalState?.status === 'done') {
        const hasText = !!finalState.text;
        const hasToolRecords = !!(finalState.toolRecords?.length);
        console.log('[useOpenClawChat] hasText=', hasText, 'hasToolRecords=', hasToolRecords);

        // Try to persist if there's text (server requires content)
        if (hasText) {
          try {
            const MAX_OUTPUT_SIZE = 10 * 1024; // 10KB per tool output
            const toolRecords = finalState.toolRecords
              ?.filter((r: ToolRecord) => r.status === 'done' || r.status === 'error')
              .map((r: ToolRecord) => ({
                tool: r.tool,
                input: r.input,
                output:
                  r.output && r.output.length > MAX_OUTPUT_SIZE
                    ? r.output.slice(0, MAX_OUTPUT_SIZE) + '\n[...truncated]'
                    : r.output,
                status: r.status,
              }));

            const persistUrl = `${API_URL}/bots/${botId}/reply`;
            console.log('[useOpenClawChat] Persisting to:', persistUrl, 'content length:', finalState.text.length);
            const res = await fetch(persistUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                converseId,
                content: finalState.text,
                ...(toolRecords?.length ? { metadata: { toolRecords } } : {}),
              }),
            });

            console.log('[useOpenClawChat] Persist response:', res.status, res.ok);
            if (res.ok) {
              const savedMsg = await res.json();
              console.log('[useOpenClawChat] Saved message:', savedMsg?.id, 'authorId:', savedMsg?.authorId);
              if (savedMsg?.id) {
                useChatStore.getState().addMessage(converseId, savedMsg);
                persisted = true;
                console.log('[useOpenClawChat] Persisted OK, message added to store');
              }
            } else {
              const errBody = await res.text().catch(() => '');
              console.error('[useOpenClawChat] Persist FAILED:', res.status, errBody);
            }
          } catch (err) {
            console.error('[useOpenClawChat] Persist error:', err);
          }
        }

        // Fallback: create a local message so the reply never disappears
        // This covers: persist failed, or no text but has tool records
        if (!persisted && (hasText || hasToolRecords)) {
          console.log('[useOpenClawChat] Creating LOCAL fallback message');
          useChatStore.getState().addMessage(converseId, {
            id: `local-${requestId}`,
            converseId,
            authorId: botId,
            content: finalState.text || '(工具调用完成)',
            type: 'TEXT',
            createdAt: finalState.createdAt,
            updatedAt: new Date().toISOString(),
            author: { id: botId, username: 'Bot', displayName: 'Bot' },
            metadata: hasToolRecords
              ? { toolRecords: finalState.toolRecords }
              : undefined,
          } as any);
        } else if (persisted) {
          console.log('[useOpenClawChat] Already persisted, skipping local fallback');
        } else {
          console.log('[useOpenClawChat] No text and no tool records — no message to create');
        }
      } else if (finalState?.status === 'error') {
        // Stream errored — create local error message so user sees what happened
        const errorText = finalState.errorText || 'Unknown error';
        console.warn('[useOpenClawChat] Stream error:', errorText);
        useChatStore.getState().addMessage(converseId, {
          id: `local-${requestId}`,
          converseId,
          authorId: botId,
          content: `⚠ ${errorText}`,
          type: 'TEXT',
          createdAt: finalState.createdAt,
          updatedAt: new Date().toISOString(),
          author: { id: botId, username: 'Bot', displayName: 'Bot' },
        } as any);
      } else {
        console.warn('[useOpenClawChat] finalState missing or unexpected status:', finalState?.status);
      }

      // 5. Remove streaming placeholder — persisted/local message is already in store
      console.log('[useOpenClawChat] Removing streaming message:', requestId);
      useChatStore.getState().removeStreamingMessage(requestId);
      activeRequestRef.current = null;
    },
    [converseId],
  );

  const cancel = useCallback((): void => {
    if (activeRequestRef.current) {
      window.electronAPI.openClawCancelStream(activeRequestRef.current);
      useChatStore.getState().removeStreamingMessage(activeRequestRef.current);
      activeRequestRef.current = null;
    }
  }, []);

  return { sendMessage, cancel };
}
