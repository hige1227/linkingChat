import { Logger } from '@nestjs/common';
import {
  IAgent,
  AgentRole,
  AgentMemory,
  AgentWorkspace,
  AgentEvent,
  ConversationContext,
  AgentResponse,
  AgentTool,
} from '../interfaces';
import { AgentMemoryService } from './memory.service';
import { AgentWorkspaceService } from './workspace.service';

export abstract class BaseAgent implements IAgent {
  abstract readonly id: string;
  abstract readonly botId: string;
  abstract readonly name: string;
  abstract readonly role: AgentRole;

  protected readonly logger: Logger;

  constructor(
    protected readonly memoryService: AgentMemoryService,
    protected readonly workspaceService: AgentWorkspaceService,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract handleEvent(events: AgentEvent[]): Promise<void>;
  abstract generateResponse(context: ConversationContext): Promise<AgentResponse>;

  async getMemory(): Promise<AgentMemory> {
    const [shortTerm, working] = await Promise.all([
      this.memoryService.getShortTermMemory(this.botId),
      this.memoryService.getWorkingMemory(this.botId),
    ]);

    return {
      shortTerm,
      working,
    };
  }

  async getWorkspace(): Promise<AgentWorkspace> {
    return this.workspaceService.getWorkspace(this.botId);
  }

  getTools(): AgentTool[] {
    return [];
  }

  protected async addToMemory(role: 'user' | 'agent' | 'system', content: string): Promise<void> {
    await this.memoryService.addShortTermMemory(this.botId, {
      role,
      content,
      timestamp: new Date(),
    });
  }
}
