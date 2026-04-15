import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';

@Controller('config')
export class ConfigController {
  @Get('agent-key')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  getAgentKey(): { success: boolean; data: { apiKey: string; provider: string } } {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const kimiKey = process.env.KIMI_API_KEY;

    if (deepseekKey) {
      return { success: true, data: { apiKey: deepseekKey, provider: 'deepseek' } };
    }
    if (kimiKey) {
      return { success: true, data: { apiKey: kimiKey, provider: 'kimi' } };
    }

    throw new Error('No LLM API key configured on server');
  }
}
