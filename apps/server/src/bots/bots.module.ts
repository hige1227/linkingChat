import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { BotInitService } from './bot-init.service';
import { BotCommunicationService } from './bot-communication.service';
import { AiModule } from '../ai/ai.module';
import { ConversesModule } from '../converses/converses.module';

@Module({
  imports: [AiModule, ConversesModule],
  controllers: [BotsController],
  providers: [BotsService, BotInitService, BotCommunicationService],
  exports: [BotsService, BotInitService, BotCommunicationService],
})
export class BotsModule {}
