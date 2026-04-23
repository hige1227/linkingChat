import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiGatewayGuard } from './guards/ai-gateway.guard';
import { AiGatewayService } from './ai-gateway.service';
import { LlmProxyDto } from './dto/llm-proxy.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('ai')
export class AiGatewayController {
  constructor(private readonly aiGatewayService: AiGatewayService) {}

  @Post('llm-token')
  @UseGuards(JwtAuthGuard)
  async issueLlmToken(@Req() req: AuthenticatedRequest) {
    return this.aiGatewayService.issueLlmToken(req.user.userId);
  }

  @Post('llm-proxy')
  @UseGuards(AiGatewayGuard)
  async llmProxy(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Body() body: LlmProxyDto,
  ): Promise<void> {
    const userId = req.user.userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await this.aiGatewayService.checkRateLimit(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rate limit exceeded';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      res.end();
      return;
    }

    try {
      for await (const chunk of this.aiGatewayService.streamProxy(userId, body)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stream error';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
