import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MentionService } from './mentions.service';

@Module({
  imports: [PrismaModule],
  providers: [MentionService],
  exports: [MentionService],
})
export class MentionsModule {}
