import { Test, TestingModule } from '@nestjs/testing';
import { PresenceService } from './presence.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PresenceService', () => {
  let service: PresenceService;

  // Mock Redis client
  const mockRedis: any = {
    pipeline: jest.fn(),
    srem: jest.fn(),
    scard: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    sismember: jest.fn(),
    sadd: jest.fn(),
    del: jest.fn(),
  };

  // Mock pipeline
  const mockPipeline: any = {
    sadd: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    srem: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  const mockPrisma: any = {
    user: {
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    mockRedis.pipeline.mockReturnValue(mockPipeline);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PresenceService>(PresenceService);
    jest.clearAllMocks();
    mockRedis.pipeline.mockReturnValue(mockPipeline);
  });

  describe('setOnline', () => {
    it('should add user to online set, register socket, set status with TTL, and update DB', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await service.setOnline('user1', 'socket1');

      // Redis pipeline should be called
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.sadd).toHaveBeenCalledWith(
        'online_users',
        'user1',
      );
      expect(mockPipeline.sadd).toHaveBeenCalledWith(
        'user:sockets:user1',
        'socket1',
      );
      expect(mockPipeline.set).toHaveBeenCalledWith(
        'user:status:user1',
        'ONLINE',
        'EX',
        300,
      );
      expect(mockPipeline.exec).toHaveBeenCalled();

      // DB update
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { status: 'ONLINE' },
      });
    });
  });

  describe('setOffline', () => {
    it('should only remove socket when other sockets remain', async () => {
      mockRedis.srem.mockResolvedValue(1);
      mockRedis.scard.mockResolvedValue(2); // 2 sockets remaining

      await service.setOffline('user1', 'socket1');

      expect(mockRedis.srem).toHaveBeenCalledWith(
        'user:sockets:user1',
        'socket1',
      );
      // Should NOT create a cleanup pipeline
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
      // Should NOT update DB
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should fully mark offline when no sockets remain', async () => {
      mockRedis.srem.mockResolvedValue(1);
      mockRedis.scard.mockResolvedValue(0); // no sockets remaining
      mockPrisma.user.update.mockResolvedValue({});

      await service.setOffline('user1', 'socket1');

      // Should create cleanup pipeline
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.srem).toHaveBeenCalledWith(
        'online_users',
        'user1',
      );
      expect(mockPipeline.del).toHaveBeenCalledWith('user:status:user1');
      expect(mockPipeline.del).toHaveBeenCalledWith('user:sockets:user1');
      expect(mockPipeline.exec).toHaveBeenCalled();

      // DB update
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { status: 'OFFLINE', lastSeenAt: expect.any(Date) },
      });
    });
  });

  describe('updateStatus', () => {
    it('should update Redis status with TTL and update DB', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockPrisma.user.update.mockResolvedValue({});

      await service.updateStatus('user1', 'DND');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'user:status:user1',
        'DND',
        'EX',
        300,
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { status: 'DND' },
      });
    });
  });

  describe('refreshTtl', () => {
    it('should refresh TTL when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await service.refreshTtl('user1');

      expect(mockRedis.exists).toHaveBeenCalledWith('user:status:user1');
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'user:status:user1',
        300,
      );
    });

    it('should not refresh TTL when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      await service.refreshTtl('user1');

      expect(mockRedis.exists).toHaveBeenCalledWith('user:status:user1');
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe('isOnline', () => {
    it('should return true when user is in online set', async () => {
      mockRedis.sismember.mockResolvedValue(1);

      const result = await service.isOnline('user1');

      expect(result).toBe(true);
      expect(mockRedis.sismember).toHaveBeenCalledWith(
        'online_users',
        'user1',
      );
    });

    it('should return false when user is not in online set', async () => {
      mockRedis.sismember.mockResolvedValue(0);

      const result = await service.isOnline('user1');

      expect(result).toBe(false);
    });
  });

  describe('getStatuses', () => {
    it('should return empty map for empty input', async () => {
      const result = await service.getStatuses([]);

      expect(result.size).toBe(0);
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });

    it('should batch query statuses via pipeline', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 'ONLINE'],
        [null, 'DND'],
        [null, null], // no status key → OFFLINE
      ]);

      const result = await service.getStatuses([
        'user1',
        'user2',
        'user3',
      ]);

      expect(result.get('user1')).toBe('ONLINE');
      expect(result.get('user2')).toBe('DND');
      expect(result.get('user3')).toBe('OFFLINE');
    });

    it('should return OFFLINE for Redis errors', async () => {
      mockPipeline.exec.mockResolvedValue([
        [new Error('connection error'), null],
      ]);

      const result = await service.getStatuses(['user1']);

      expect(result.get('user1')).toBe('OFFLINE');
    });
  });

  describe('getStatus', () => {
    it('should return status when key exists', async () => {
      mockRedis.get.mockResolvedValue('IDLE');

      const result = await service.getStatus('user1');

      expect(result).toBe('IDLE');
    });

    it('should return OFFLINE when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getStatus('user1');

      expect(result).toBe('OFFLINE');
    });
  });

  describe('getOnlineCount', () => {
    it('should return count from Redis SET', async () => {
      mockRedis.scard.mockResolvedValue(42);

      const result = await service.getOnlineCount();

      expect(result).toBe(42);
    });
  });
});
