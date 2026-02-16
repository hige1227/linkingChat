import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { BotInitService } from './bot-init.service';

@Module({
  controllers: [BotsController],
  providers: [BotsService, BotInitService],
  exports: [BotsService, BotInitService],
})
export class BotsModule {}
