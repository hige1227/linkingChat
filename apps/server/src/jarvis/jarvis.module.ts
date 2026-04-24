import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JarvisAgentService } from './jarvis-agent.service';
import { JarvisToolRegistry } from './jarvis-tool.registry';
import { JarvisMemoryService } from './jarvis-memory.service';
import { AiModule } from '../ai/ai.module';
import { BotsModule } from '../bots/bots.module';

// RedisModule, PrismaModule, and GatewayModule (BroadcastService) are @Global()
// so their providers are available without explicit import here.
@Module({
  imports: [ConfigModule, AiModule, BotsModule],
  providers: [JarvisAgentService, JarvisToolRegistry, JarvisMemoryService],
  exports: [JarvisAgentService],
})
export class JarvisModule {}
