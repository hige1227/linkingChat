import type { AgentProvider, AgentType } from './agent-provider.interface';
import { OpenClawAdapter } from './openclaw.adapter';
import { HermesAdapter } from './hermes.adapter';
import { ServerAgentAdapter } from './server.adapter';
import Store from 'electron-store';

import { app } from 'electron';

const store = new Store<{ agentType: AgentType }>({ name: 'linkingchat-agent' });

let activeProvider: AgentProvider | null = null;

export class AgentProviderFactory {
  static create(type: AgentType): AgentProvider {
    if (type === 'openclaw') {
      activeProvider = new OpenClawAdapter();
    } else if (type === 'hermes') {
      activeProvider = new HermesAdapter();
    } else if (type === 'server') {
      activeProvider = new ServerAgentAdapter();
    } else {
      throw new Error(`Unknown agent type: ${String(type)}`);
    }
    store.set('agentType', type);
    return activeProvider;
  }

  static active(): AgentProvider {
    if (!activeProvider) {
      const saved = store.get('agentType') as AgentType | undefined;
      const type = saved ?? AgentProviderFactory.autoSelect();
      return AgentProviderFactory.create(type);
    }
    return activeProvider;
  }

  static getPersistedType(): AgentType {
    return (store.get('agentType', AgentProviderFactory.autoSelect()) as AgentType);
  }

  /** In packaged production builds without a local sidecar, default to server mode */
  static autoSelect(): AgentType {
    if (!app.isPackaged) return 'openclaw';
    return 'server';
  }

  /** For testing only */
  static reset(): void {
    activeProvider = null;
  }
}
