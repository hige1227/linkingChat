import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { BotInitService } from '../../bots/bot-init.service';
import { MailService } from '../../mail/mail.service';
import { I18nService } from '../../i18n/i18n.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('AuthService — Email Verification & Password Reset', () => {
  let service: AuthService;
  let mockRedis: any;

  const mockPrisma: any = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockJwt = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
    verifyAsync: jest.fn(),
  };

  const mockBotInit = {
    createDefaultBots: jest.fn(),
  };

  const mockMail = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  const mockI18n = {
    t: jest.fn((key: string) => key),
    detectLocale: jest.fn(() => 'en'),
  };

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Set env vars for JWT keys
    process.env.AUTH_JWT_PRIVATE_KEY = Buffer.from('test-key').toString('base64');
    process.env.AUTH_JWT_PUBLIC_KEY = Buffer.from('test-key').toString('base64');
    process.env.AUTH_REFRESH_PRIVATE_KEY = Buffer.from('test-key').toString('base64');
    process.env.AUTH_REFRESH_PUBLIC_KEY = Buffer.from('test-key').toString('base64');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: BotInitService, useValue: mockBotInit },
        { provide: MailService, useValue: mockMail },
        { provide: I18nService, useValue: mockI18n },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ========== Email Verification ==========

  describe('verifyEmail', () => {
    it('should verify email with correct code', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'email-verify-lock:user1') return null;
        if (key === 'email-verify:user1') return '123456';
        return null;
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.verifyEmail('user1', '123456');
      expect(result).toEqual({ verified: true });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { isEmailVerified: true },
      });
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should reject wrong code and increment failure count', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'email-verify-lock:user1') return null;
        if (key === 'email-verify:user1') return '123456';
        return null;
      });
      mockRedis.incr.mockResolvedValue(1);

      await expect(service.verifyEmail('user1', '000000')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRedis.incr).toHaveBeenCalledWith('email-verify-fail:user1');
    });

    it('should lock after 5 failed attempts', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'email-verify-lock:user1') return null;
        if (key === 'email-verify:user1') return '123456';
        return null;
      });
      mockRedis.incr.mockResolvedValue(5);

      await expect(service.verifyEmail('user1', '000000')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'email-verify-lock:user1',
        '1',
        'EX',
        15 * 60,
      );
    });

    it('should reject when locked', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'email-verify-lock:user1') return '1';
        return null;
      });

      await expect(service.verifyEmail('user1', '123456')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject expired code', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyEmail('user1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resendVerification', () => {
    it('should send verification email', async () => {
      mockRedis.get.mockResolvedValue(null); // no recent send
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
        isEmailVerified: false,
      });
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.resendVerification('user1');
      expect(result).toEqual({ message: 'Verification email sent.' });
      expect(mockMail.sendVerificationEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
      );
    });

    it('should reject if sent too recently', async () => {
      mockRedis.get.mockResolvedValue('1'); // recent send exists

      await expect(service.resendVerification('user1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return message if already verified', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
        isEmailVerified: true,
      });

      const result = await service.resendVerification('user1');
      expect(result).toEqual({ message: 'Email already verified.' });
    });
  });

  // ========== Password Reset ==========

  describe('forgotPassword', () => {
    it('should send reset email for existing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
      });

      const result = await service.forgotPassword('test@example.com');
      expect(result.message).toContain('If that email is registered');
      expect(mockMail.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should return same message for non-existing email (anti-enumeration)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('nonexistent@example.com');
      expect(result.message).toContain('If that email is registered');
      expect(mockMail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password with correct code', async () => {
      mockRedis.get.mockResolvedValue('123456');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user1',
        email: 'test@example.com',
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({});

      const result = await service.resetPassword(
        'test@example.com',
        '123456',
        'newPassword123',
      );
      expect(result.message).toContain('Password reset successfully');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user1' },
          data: { password: expect.any(String) },
        }),
      );
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user1' },
      });
    });

    it('should reject with wrong code', async () => {
      mockRedis.get.mockResolvedValue('123456');

      await expect(
        service.resetPassword('test@example.com', '000000', 'newPass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject with expired code', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.resetPassword('test@example.com', '123456', 'newPass'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
