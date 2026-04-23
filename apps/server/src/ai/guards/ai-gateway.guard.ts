import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

interface LlmTokenPayload {
  sub: string;
  type: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AiGatewayGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('LLM token required');
    }

    const publicKey = Buffer.from(
      process.env.AUTH_JWT_PUBLIC_KEY!,
      'base64',
    ).toString('utf-8');

    let payload: LlmTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<LlmTokenPayload>(token, {
        algorithms: ['RS256'],
        publicKey,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired LLM token');
    }

    if (payload.type !== 'llm-proxy') {
      throw new UnauthorizedException('Token type mismatch');
    }

    (request as Request & { user: { userId: string } }).user = { userId: payload.sub };
    return true;
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    // Support x-api-key for OpenClaw provider config compatibility
    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey === 'string') return apiKey;
    return null;
  }
}
