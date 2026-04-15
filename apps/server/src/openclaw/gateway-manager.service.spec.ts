import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GatewayManagerService } from './gateway-manager.service';

// ── Mock Services ────────────────────────────

const MOCK_GATEWAY_URL = 'ws://127.0.0.1:18790';
const MOCK_GATEWAY_TOKEN = 'test-gateway-token';

const createMockConfigService = (overrides: Record<string, any> = {}) => ({
  get: jest.fn((key: string, defaultValue: any) => {
    const config: Record<string, any> = {
      OPENCLAW_MODE: 'single',
      OPENCLAW_GATEWAY_URL: MOCK_GATEWAY_URL,
      OPENCLAW_GATEWAY_TOKEN: MOCK_GATEWAY_TOKEN,
      ...overrides,
    };
    return config[key] ?? defaultValue;
  }),
});

// ── Tests ────────────────────────────

describe('GatewayManagerService', () => {
  let service: GatewayManagerService;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GatewayManagerService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<GatewayManagerService>(GatewayManagerService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('initialization', () => {
    it('should create the service', () => {
      expect(service).toBeDefined();
    });

    it('should read OPENCLAW_MODE from config', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('OPENCLAW_MODE', 'single');
    });

    it('should fall back to single mode for unknown mode', async () => {
      const customConfig = createMockConfigService({ OPENCLAW_MODE: 'unknown-mode' });
      const module = await Test.createTestingModule({
        providers: [
          GatewayManagerService,
          { provide: ConfigService, useValue: customConfig },
        ],
      }).compile();

      const svc = module.get<GatewayManagerService>(GatewayManagerService);
      const result = await svc.acquire('any-user');
      expect(result.url).toBe(MOCK_GATEWAY_URL);
    });
  });

  describe('acquire (single mode)', () => {
    it('should return the shared gateway URL and token', async () => {
      const result = await service.acquire('user-1');

      expect(result).toEqual({
        url: MOCK_GATEWAY_URL,
        token: MOCK_GATEWAY_TOKEN,
      });
    });

    it('should return the same URL for different users', async () => {
      const result1 = await service.acquire('user-1');
      const result2 = await service.acquire('user-2');

      expect(result1.url).toBe(result2.url);
      expect(result1.token).toBe(result2.token);
    });
  });

  describe('release (single mode)', () => {
    it('should be a no-op without errors', async () => {
      await expect(service.release('user-1')).resolves.not.toThrow();
    });
  });

  describe('health (single mode)', () => {
    it('should return false when gateway is unreachable', async () => {
      // In test env, no actual gateway is running on this port
      const customConfig = createMockConfigService({
        OPENCLAW_GATEWAY_URL: 'ws://127.0.0.1:19999',
      });
      const module = await Test.createTestingModule({
        providers: [
          GatewayManagerService,
          { provide: ConfigService, useValue: customConfig },
        ],
      }).compile();

      const svc = module.get<GatewayManagerService>(GatewayManagerService);
      const healthy = await svc.health('user-1');
      expect(healthy).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clean up without errors', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});

describe('constructor — production token validation', () => {
  it('should throw if OPENCLAW_GATEWAY_TOKEN is not set in production', () => {
    const mockConfig = {
      get: (key: string, defaultVal?: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'OPENCLAW_MODE') return 'single';
        if (key === 'OPENCLAW_GATEWAY_URL') return 'ws://127.0.0.1:18790';
        if (key === 'OPENCLAW_GATEWAY_TOKEN') return undefined;
        return defaultVal;
      },
    } as unknown as ConfigService;

    expect(() => new GatewayManagerService(mockConfig)).toThrow(
      'OPENCLAW_GATEWAY_TOKEN must be set in production',
    );
  });

  it('should not throw if token is missing in development', () => {
    const mockConfig = {
      get: (key: string, defaultVal?: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'OPENCLAW_MODE') return 'single';
        if (key === 'OPENCLAW_GATEWAY_URL') return 'ws://127.0.0.1:18790';
        if (key === 'OPENCLAW_GATEWAY_TOKEN') return undefined;
        return defaultVal;
      },
    } as unknown as ConfigService;

    expect(() => new GatewayManagerService(mockConfig)).not.toThrow();
  });
});
