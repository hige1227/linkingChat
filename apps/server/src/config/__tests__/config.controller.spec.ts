import { Test } from '@nestjs/testing';
import { ConfigController } from '../config.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../../auth/guards/email-verified.guard';

describe('ConfigController', () => {
  let controller: ConfigController;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ConfigController],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ConfigController);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns apiKey from DEEPSEEK_API_KEY', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-test';
    delete process.env.KIMI_API_KEY;

    const result = controller.getAgentKey();

    expect(result).toEqual({
      success: true,
      data: { apiKey: 'sk-deepseek-test', provider: 'deepseek' },
    });
  });

  it('falls back to KIMI_API_KEY when DEEPSEEK missing', () => {
    delete process.env.DEEPSEEK_API_KEY;
    process.env.KIMI_API_KEY = 'sk-kimi-test';

    const result = controller.getAgentKey();

    expect(result).toEqual({
      success: true,
      data: { apiKey: 'sk-kimi-test', provider: 'kimi' },
    });
  });

  it('throws when no API key configured', () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.KIMI_API_KEY;

    expect(() => controller.getAgentKey()).toThrow('No LLM API key configured');
  });
});
