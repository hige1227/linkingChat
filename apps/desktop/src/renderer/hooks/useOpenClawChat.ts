import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { ChatState } from '../stores/chatStore';

const API_URL = 'http://localhost:3008/api/v1';

export function useOpenClawChat(converseId: string) {
  const activeRequestRef = useRef<string | null>(null);

  // Register global chunk listener once per mount
  useEffect(() => {
    const handler = (data: {
      requestId: string;
      chunk: { type: string; text: string };
    }) => {
      useChatStore.getState().appendStreamChunk(data.requestId, data.chunk);
    };
    window.electronAPI.onOpenClawStreamChunk(handler);
    return () => window.electronAPI.offOpenClawStreamChunk(handler);
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

      // 3. Wait for streaming to complete (done or error)
      await new Promise<void>((resolve) => {
        const unsubscribe = useChatStore.subscribe((state: ChatState) => {
          const sm = state.streamingMessages[requestId];
          if (!sm || sm.status === 'done' || sm.status === 'error') {
            unsubscribe();
            resolve();
          }
        });
      });

      // 4. Persist bot reply to server
      const finalState = useChatStore.getState().streamingMessages[requestId];
      if (finalState?.status === 'done' && finalState.text) {
        try {
          await fetch(`${API_URL}/bots/${botId}/reply`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ converseId, content: finalState.text }),
          });
        } catch (err) {
          // Log but do not re-throw: user already saw the streaming reply
          console.error('[Bot] Failed to persist bot reply:', err);
        }
      }

      // 5. Remove placeholder — persisted message arrives via socket as message:new
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
