import { Module } from '@nestjs/common';
import { RelationshipGraphService } from './relationship-graph.service';
import { ContentAnalyzerService } from './content-analyzer.service';
import { RelationshipEventListener } from './relationship-event.listener';
import { ReminderEngineService } from './reminder-engine.service';
import { RelationshipSchedulerService } from './relationship-scheduler.service';
import { RelationshipsController } from './relationships.controller';
import { AiModule } from '../ai/ai.module';
import { JarvisModule } from '../jarvis/jarvis.module';

@Module({
  imports: [AiModule, JarvisModule],
  controllers: [RelationshipsController],
  providers: [
    RelationshipGraphService,
    ContentAnalyzerService,
    RelationshipEventListener,
    ReminderEngineService,
    RelationshipSchedulerService,
  ],
  exports: [RelationshipGraphService],
})
export class RelationshipModule {}
