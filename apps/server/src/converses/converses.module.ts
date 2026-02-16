import { Module } from '@nestjs/common';
import { ConversesController } from './converses.controller';
import { ConversesService } from './converses.service';

@Module({
  controllers: [ConversesController],
  providers: [ConversesService],
  exports: [ConversesService],
})
export class ConversesModule {}
