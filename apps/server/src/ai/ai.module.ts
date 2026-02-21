import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { LlmRouterService } from './services/llm-router.service';
import { WhisperService } from './services/whisper.service';
import { DraftService } from './services/draft.service';
import { PredictiveService } from './services/predictive.service';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { KimiProvider } from './providers/kimi.provider';

@Module({
  controllers: [AiController],
  providers: [
    LlmRouterService,
    WhisperService,
    DraftService,
    PredictiveService,
    DeepSeekProvider,
    KimiProvider,
  ],
  exports: [LlmRouterService, WhisperService, DraftService, PredictiveService],
})
export class AiModule {}
