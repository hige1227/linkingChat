import { Test, TestingModule } from '@nestjs/testing';
import { MentionService } from '../mentions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WhisperService } from '../../ai/services/whisper.service';
import { AgentOrchestratorService } from '../../agents/orchestrator/agent-orchestrator.service';

describe('MentionService', () => {
  let service: MentionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentionService,
        { provide: PrismaService, useValue: {} },
        { provide: WhisperService, useValue: {} },
        { provide: AgentOrchestratorService, useValue: {} },
      ],
    }).compile();

    service = module.get<MentionService>(MentionService);
  });

  describe('parse', () => {
    it('should parse single @mention', () => {
      const result = service.parse('Hello @CodingBot, how are you?');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'CodingBot',
        fullMatch: '@CodingBot',
        startIndex: 6,
      });
    });

    it('should parse multiple @mentions', () => {
      const result = service.parse('@Bot1 and @Bot2 please help');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Bot1');
      expect(result[1].name).toBe('Bot2');
    });

    it('should parse @ai as special mention', () => {
      const result = service.parse('Hey @ai what do you think?');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ai');
    });

    it('should handle Chinese characters in bot names', () => {
      const result = service.parse('@小助手 帮我查一下');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('小助手');
    });

    it('should deduplicate repeated mentions', () => {
      const result = service.parse('@Bot1 @Bot1 @Bot1');
      expect(result).toHaveLength(1);
    });

    it('should return empty array for no mentions', () => {
      expect(service.parse('Hello world')).toEqual([]);
      expect(service.parse('')).toEqual([]);
      expect(service.parse(null as any)).toEqual([]);
    });

    it('should not match email addresses', () => {
      const result = service.parse('Contact me at test@example.com');
      expect(result).toEqual([]);
    });
  });
});
