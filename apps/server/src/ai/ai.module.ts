import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { LlmConfigService } from './llm-config.service';
import { WhisperService } from './services/whisper.service';
import { DraftService } from './services/draft.service';
import { PredictiveService } from './services/predictive.service';

@Module({
  controllers: [AiController],
  providers: [
    LlmConfigService,
    WhisperService,
    DraftService,
    PredictiveService,
  ],
  exports: [LlmConfigService, WhisperService, DraftService, PredictiveService],
})
export class AiModule {}
