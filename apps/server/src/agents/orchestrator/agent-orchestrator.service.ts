import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IAgent, AgentEvent } from '../interfaces';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';

@Injectable()
export class AgentOrchestratorService implements OnModuleInit {
  private agents: Map<string, IAgent> = new Map();
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly workspaceService: AgentWorkspaceService,
  ) {}

  async onModuleInit() {
    this.logger.log('AgentOrchestrator initialized');
  }

  registerAgent(agent: IAgent): void {
    this.agents.set(agent.botId, agent);
    this.logger.log(`Agent registered: ${agent.name} (${agent.botId})`);
  }

  unregisterAgent(botId: string): void {
    this.agents.delete(botId);
    this.logger.log(`Agent unregistered: ${botId}`);
  }

  getAgent(botId: string): IAgent | undefined {
    return this.agents.get(botId);
  }

  getAllAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }

  async dispatchEvent(botId: string, events: AgentEvent[]): Promise<void> {
    const agent = this.agents.get(botId);
    if (!agent) {
      this.logger.warn(`Agent not found: ${botId}`);
      return;
    }

    this.logger.debug(`Dispatching ${events.length} events to ${agent.name}`);
    await agent.handleEvent(events);
  }

  async broadcast(events: AgentEvent[]): Promise<void> {
    const promises = this.getAllAgents().map((agent) =>
      agent.handleEvent(events).catch((err) => {
        this.logger.error(`Failed to dispatch to ${agent.name}:`, err);
      }),
    );
    await Promise.all(promises);
  }
}
