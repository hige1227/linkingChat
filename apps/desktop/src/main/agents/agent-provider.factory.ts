import type { AgentProvider, AgentType } from './agent-provider.interface';
import { OpenClawAdapter } from './openclaw.adapter';
import { HermesAdapter } from './hermes.adapter';
import Store from 'electron-store';

const store = new Store<{ agentType: AgentType }>({ name: 'linkingchat-agent' });

let activeProvider: AgentProvider | null = null;

export class AgentProviderFactory {
  static create(type: AgentType): AgentProvider {
    if (type === 'openclaw') {
      activeProvider = new OpenClawAdapter();
    } else if (type === 'hermes') {
      activeProvider = new HermesAdapter();
    } else {
      throw new Error(`Unknown agent type: ${String(type)}`);
    }
    store.set('agentType', type);
    return activeProvider;
  }

  static active(): AgentProvider {
    if (!activeProvider) {
      const saved = store.get('agentType', 'openclaw') as AgentType;
      return AgentProviderFactory.create(saved);
    }
    return activeProvider;
  }

  static getPersistedType(): AgentType {
    return (store.get('agentType', 'openclaw') as AgentType);
  }

  /** For testing only */
  static reset(): void {
    activeProvider = null;
  }
}
