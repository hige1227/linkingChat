import { ipcMain } from 'electron';
import { AgentProviderFactory } from '../agents/agent-provider.factory';
import type { AgentType } from '../agents/agent-provider.interface';

export function registerAgentIpc(): void {
  ipcMain.handle('agent:get-type', (): AgentType => {
    return AgentProviderFactory.getPersistedType();
  });

  ipcMain.handle('agent:set-type', (_event, type: AgentType): { success: boolean } => {
    try {
      AgentProviderFactory.create(type);
      return { success: true };
    } catch (error: unknown) {
      console.error('[Agent IPC] Failed to set agent type:', (error as Error).message);
      return { success: false };
    }
  });
}
