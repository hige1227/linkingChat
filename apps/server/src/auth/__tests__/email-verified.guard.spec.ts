import { ForbiddenException } from '@nestjs/common';
import { EmailVerifiedGuard } from '../guards/email-verified.guard';

function createContext(user: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('EmailVerifiedGuard', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts JwtStrategy userId payload shape', async () => {
    prisma.user.findUnique.mockResolvedValue({ isEmailVerified: true });
    const guard = new EmailVerifiedGuard(prisma as any);

    await expect(guard.canActivate(createContext({ userId: 'user-1' }))).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { isEmailVerified: true },
    });
  });

  it('rejects unverified users', async () => {
    prisma.user.findUnique.mockResolvedValue({ isEmailVerified: false });
    const guard = new EmailVerifiedGuard(prisma as any);

    await expect(guard.canActivate(createContext({ userId: 'user-1' }))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
