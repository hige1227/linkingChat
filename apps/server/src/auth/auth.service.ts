import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { BotInitService } from '../bots/bot-init.service';
import { MailService } from '../mail/mail.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { I18nService } from '../i18n/i18n.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtPrivateKey: string;
  private readonly jwtPublicKey: string;
  private readonly refreshPrivateKey: string;
  private readonly refreshPublicKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly botInitService: BotInitService,
    private readonly i18n: I18nService,
    private readonly mailService: MailService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.jwtPrivateKey = Buffer.from(
      process.env.AUTH_JWT_PRIVATE_KEY!,
      'base64',
    ).toString('utf-8');
    this.jwtPublicKey = Buffer.from(
      process.env.AUTH_JWT_PUBLIC_KEY!,
      'base64',
    ).toString('utf-8');
    this.refreshPrivateKey = Buffer.from(
      process.env.AUTH_REFRESH_PRIVATE_KEY!,
      'base64',
    ).toString('utf-8');
    this.refreshPublicKey = Buffer.from(
      process.env.AUTH_REFRESH_PUBLIC_KEY!,
      'base64',
    ).toString('utf-8');
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (existing) {
      throw new ConflictException(
        existing.email === dto.email
          ? this.i18n.t('auth.email_already_exists')
          : this.i18n.t('auth.user_already_exists'),
      );
    }

    const hashedPassword = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashedPassword,
        displayName: dto.displayName,
      },
    });

    const tokens = await this.generateTokenPair(user.id, user.username);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    // Auto-create default bots for new user (non-blocking)
    try {
      await this.botInitService.createDefaultBots(user.id);
    } catch (error) {
      this.logger.error(
        `Failed to create default bots for user ${user.id}: ${error}`,
      );
    }

    // Send verification email (non-blocking)
    try {
      const code = await this.generateVerificationCode(user.id);
      await this.mailService.sendVerificationEmail(user.email, code);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${user.email}: ${error}`,
      );
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        isEmailVerified: false,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException(this.i18n.t('auth.invalid_credentials'));
    }

    const isPasswordValid = await argon2.verify(user.password, dto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException(this.i18n.t('auth.invalid_credentials'));
    }

    const tokens = await this.generateTokenPair(user.id, user.username);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        isEmailVerified: user.isEmailVerified,
      },
      ...tokens,
    };
  }

  async refresh(dto: RefreshDto) {
    let payload: { sub: string; type: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        algorithms: ['RS256'],
        publicKey: this.refreshPublicKey,
      });
    } catch {
      throw new UnauthorizedException(this.i18n.t('auth.token_expired'));
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException(this.i18n.t('auth.token_invalid'));
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException(this.i18n.t('auth.token_expired'));
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException(this.i18n.t('auth.user_not_found'));
    }

    // Token Rotation: delete old, generate new
    await this.prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    const tokens = await this.generateTokenPair(user.id, user.username);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken
      .delete({ where: { token: refreshToken } })
      .catch(() => {
        // Token already deleted or doesn't exist — safe to ignore
      });
    return { success: true };
  }

  private async generateTokenPair(userId: string, username: string) {
    const jti = crypto.randomUUID();

    const accessExpiresIn = process.env.AUTH_JWT_TOKEN_EXPIRES_IN || '15m';
    const refreshExpiresIn =
      process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN || '30d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, username, jti },
        {
          algorithm: 'RS256',
          privateKey: this.jwtPrivateKey,
          expiresIn: accessExpiresIn as any,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, type: 'refresh', jti: crypto.randomUUID() },
        {
          algorithm: 'RS256',
          privateKey: this.refreshPrivateKey,
          expiresIn: refreshExpiresIn as any,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, token: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
  }

  // ========== Email Verification (Phase 1) ==========

  async generateVerificationCode(userId: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `email-verify:${userId}`;
    await this.redis.set(key, code, 'EX', 15 * 60); // 15 min expiry
    return code;
  }

  async verifyEmail(userId: string, code: string) {
    // 1. Check lockout
    const lockKey = `email-verify-lock:${userId}`;
    const locked = await this.redis.get(lockKey);
    if (locked) {
      throw new ForbiddenException(
        'Too many failed attempts. Please try again in 15 minutes.',
      );
    }

    // 2. Get stored code
    const storedCode = await this.redis.get(`email-verify:${userId}`);
    if (!storedCode) {
      throw new BadRequestException('Verification code expired or not found.');
    }

    // 3. Validate
    if (storedCode !== code) {
      const failKey = `email-verify-fail:${userId}`;
      const failures = await this.redis.incr(failKey);
      await this.redis.expire(failKey, 15 * 60);

      if (failures >= 5) {
        await this.redis.set(lockKey, '1', 'EX', 15 * 60);
        throw new ForbiddenException(
          'Too many failed attempts. Locked for 15 minutes.',
        );
      }
      throw new BadRequestException('Invalid verification code.');
    }

    // 4. Mark verified
    await this.prisma.user.update({
      where: { id: userId },
      data: { isEmailVerified: true },
    });

    // 5. Cleanup Redis
    await this.redis.del(
      `email-verify:${userId}`,
      `email-verify-fail:${userId}`,
    );

    return { verified: true };
  }

  async resendVerification(userId: string) {
    // Rate limit: 1 per minute
    const rateKey = `email-verify-resend:${userId}`;
    const recent = await this.redis.get(rateKey);
    if (recent) {
      throw new ForbiddenException(
        'Please wait 1 minute before requesting another verification email.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new BadRequestException('User not found.');
    }
    if (user.isEmailVerified) {
      return { message: 'Email already verified.' };
    }

    const code = await this.generateVerificationCode(userId);
    await this.mailService.sendVerificationEmail(user.email, code);
    await this.redis.set(rateKey, '1', 'EX', 60); // 1 min cooldown

    return { message: 'Verification email sent.' };
  }

  // ========== Password Reset (Phase 2) ==========

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return same response to prevent email enumeration
    if (user) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await this.redis.set(`pwd-reset:${email}`, code, 'EX', 15 * 60);
      try {
        await this.mailService.sendPasswordResetEmail(email, code);
      } catch (error) {
        this.logger.error(`Failed to send reset email to ${email}: ${error}`);
      }
    }

    return {
      message: 'If that email is registered, a reset code has been sent.',
    };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const storedCode = await this.redis.get(`pwd-reset:${email}`);
    if (!storedCode || storedCode !== code) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    const hashedPassword = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Invalidate all refresh tokens (force re-login on all devices)
    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    // Cleanup Redis
    await this.redis.del(`pwd-reset:${email}`);

    return { message: 'Password reset successfully. Please log in.' };
  }
}
