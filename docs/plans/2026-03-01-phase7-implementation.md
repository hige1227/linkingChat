# Phase 7 Implementation Plan: Group Chat @Bot Routing + @ai Fallback

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable @Bot mentions in group chats to route messages to specific Bot Agents, with @ai as fallback to Supervisor.

**Architecture:** New MentionsModule with MentionService handles @mention parsing, validation, and routing. Integrates with existing AgentOrchestratorService and WhisperService.

**Tech Stack:** NestJS, TypeScript, Prisma, Jest

---

## Task 1: Create MentionsModule Structure

**Files:**
- Create: `apps/server/src/mentions/mentions.module.ts`
- Create: `apps/server/src/mentions/index.ts`
- Create: `apps/server/src/mentions/interfaces/mention.interface.ts`

**Step 1: Create interface definitions**

```typescript
// apps/server/src/mentions/interfaces/mention.interface.ts

/** 解析后的原始 @mention */
export interface ParsedMention {
  /** 提取的名称（不含 @ 符号） */
  name: string;
  /** 完整匹配文本（含 @ 符号） */
  fullMatch: string;
  /** 在原文中的起始位置 */
  startIndex: number;
}

/** 验证后的有效 @mention */
export interface ValidMention {
  /** 类型：bot 或 ai */
  type: 'bot' | 'ai';
  /** 名称 */
  name: string;
  /** 完整匹配文本 */
  fullMatch: string;
  /** Bot ID（仅 type='bot' 时） */
  botId?: string;
  /** Bot 关联的用户 ID（仅 type='bot' 时） */
  userId?: string;
}
```

**Step 2: Create module file**

```typescript
// apps/server/src/mentions/mentions.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { AgentsModule } from '../agents/agents.module';
import { MentionService } from './mentions.service';

@Module({
  imports: [PrismaModule, AiModule, AgentsModule],
  providers: [MentionService],
  exports: [MentionService],
})
export class MentionsModule {}
```

**Step 3: Create index export**

```typescript
// apps/server/src/mentions/index.ts
export * from './mentions.module';
export * from './mentions.service';
export * from './interfaces/mention.interface';
```

**Step 4: Commit**

```bash
git add apps/server/src/mentions/
git commit -m "feat(mentions): add MentionsModule structure and interfaces"
```

---

## Task 2: Implement MentionService.parse()

**Files:**
- Create: `apps/server/src/mentions/mentions.service.ts`
- Create: `apps/server/src/mentions/__tests__/mentions.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// apps/server/src/mentions/__tests__/mentions.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { MentionService } from '../mentions.service';

describe('MentionService', () => {
  let service: MentionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MentionService],
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
```

**Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm jest src/mentions/__tests__/mentions.service.spec.ts
```
Expected: FAIL with "Cannot find module '../mentions.service'"

**Step 3: Implement MentionService with parse()**

```typescript
// apps/server/src/mentions/mentions.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhisperService } from '../ai/services/whisper.service';
import { AgentOrchestratorService } from '../agents/orchestrator/agent-orchestrator.service';
import type { ParsedMention, ValidMention } from './interfaces/mention.interface';

/**
 * Mention Service
 *
 * 处理群聊中的 @mention 解析、验证和路由
 * - @BotName → 路由到对应 Bot Agent
 * - @ai → 路由到 Supervisor (WhisperService)
 */
@Injectable()
export class MentionService {
  private readonly logger = new Logger(MentionService.name);

  /** @mention 正则：支持英文、数字、下划线、中文 */
  private readonly MENTION_REGEX = /@([a-zA-Z0-9_\u4e00-\u9fa5]{2,20})/g;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whisperService: WhisperService,
    private readonly agentOrchestrator: AgentOrchestratorService,
  ) {}

  /**
   * 解析消息中的 @mentions
   *
   * @param content - 消息内容
   * @returns 解析后的 mention 列表（已去重）
   */
  parse(content: string | null): ParsedMention[] {
    if (!content) return [];

    const mentions: ParsedMention[] = [];
    let match: RegExpExecArray | null;

    while ((match = this.MENTION_REGEX.exec(content)) !== null) {
      mentions.push({
        name: match[1],
        fullMatch: match[0],
        startIndex: match.index,
      });
    }

    return this.deduplicate(mentions);
  }

  /**
   * 去重：同一名称只保留第一次出现
   */
  private deduplicate(mentions: ParsedMention[]): ParsedMention[] {
    const seen = new Set<string>();
    return mentions.filter((m) => {
      if (seen.has(m.name)) return false;
      seen.add(m.name);
      return true;
    });
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm jest src/mentions/__tests__/mentions.service.spec.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/mentions/
git commit -m "feat(mentions): implement MentionService.parse()"
```

---

## Task 3: Implement MentionService.validate()

**Files:**
- Modify: `apps/server/src/mentions/mentions.service.ts`
- Modify: `apps/server/src/mentions/__tests__/mentions.service.spec.ts`

**Step 1: Write the failing test**

Add to `apps/server/src/mentions/__tests__/mentions.service.spec.ts`:

```typescript
  describe('validate', () => {
    it('should validate @ai as special type', async () => {
      const parsed = service.parse('Hello @ai');
      const result = await service.validate(parsed, 'converse-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'ai',
        name: 'ai',
        fullMatch: '@ai',
      });
    });

    it('should return empty for non-existent bot', async () => {
      const parsed = service.parse('Hello @NonExistentBot');
      const result = await service.validate(parsed, 'converse-1');

      expect(result).toEqual([]);
    });

    it('should validate existing bot from database', async () => {
      // This test requires Prisma mock - will be integration test
      // Unit test with mock:
      const mockPrisma = {
        bot: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'bot-1', name: 'CodingBot', userId: 'user-1' },
          ]),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MentionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: WhisperService, useValue: {} },
          { provide: AgentOrchestratorService, useValue: {} },
        ],
      }).compile();

      const serviceWithMock = module.get<MentionService>(MentionService);
      const parsed = serviceWithMock.parse('@CodingBot help');
      const result = await serviceWithMock.validate(parsed, 'converse-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'bot',
        name: 'CodingBot',
        fullMatch: '@CodingBot',
        botId: 'bot-1',
        userId: 'user-1',
      });
    });
  });
```

**Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm jest src/mentions/__tests__/mentions.service.spec.ts
```
Expected: FAIL with "service.validate is not a function"

**Step 3: Implement validate()**

Add to `apps/server/src/mentions/mentions.service.ts`:

```typescript
  /**
   * 验证 @mentions 并获取对应的 Bot 信息
   *
   * @param mentions - 解析后的 mentions
   * @param converseId - 会话 ID（用于未来可能的权限检查）
   * @returns 验证后的有效 mentions
   */
  async validate(
    mentions: ParsedMention[],
    _converseId: string,
  ): Promise<ValidMention[]> {
    if (mentions.length === 0) return [];

    const validMentions: ValidMention[] = [];

    // 1. 特殊处理 @ai
    const aiMention = mentions.find((m) => m.name.toLowerCase() === 'ai');
    if (aiMention) {
      validMentions.push({
        type: 'ai',
        name: 'ai',
        fullMatch: aiMention.fullMatch,
      });
    }

    // 2. 查询存在的 Bot
    const botNames = mentions
      .filter((m) => m.name.toLowerCase() !== 'ai')
      .map((m) => m.name);

    if (botNames.length > 0) {
      const bots = await this.prisma.bot.findMany({
        where: {
          name: { in: botNames },
        },
      });

      for (const bot of bots) {
        validMentions.push({
          type: 'bot',
          name: bot.name,
          fullMatch: `@${bot.name}`,
          botId: bot.id,
          userId: bot.userId,
        });
      }
    }

    return validMentions;
  }
```

Add import at top:
```typescript
import { PrismaService } from '../prisma/prisma.service';
```

**Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm jest src/mentions/__tests__/mentions.service.spec.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/mentions/
git commit -m "feat(mentions): implement MentionService.validate()"
```

---

## Task 4: Implement MentionService.route()

**Files:**
- Modify: `apps/server/src/mentions/mentions.service.ts`
- Modify: `apps/server/src/mentions/__tests__/mentions.service.spec.ts`

**Step 1: Write the failing test**

Add to `apps/server/src/mentions/__tests__/mentions.service.spec.ts`:

```typescript
  describe('route', () => {
    it('should route @ai to WhisperService', async () => {
      const mockWhisper = {
        handleWhisperTrigger: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MentionService,
          { provide: PrismaService, useValue: { bot: { findMany: jest.fn() } } },
          { provide: WhisperService, useValue: mockWhisper },
          { provide: AgentOrchestratorService, useValue: { dispatchEvent: jest.fn() } },
        ],
      }).compile();

      const serviceWithMock = module.get<MentionService>(MentionService);

      const mentions: ValidMention[] = [{
        type: 'ai',
        name: 'ai',
        fullMatch: '@ai',
      }];

      await serviceWithMock.route(mentions, {
        id: 'msg-1',
        content: '@ai hello',
        converseId: 'conv-1',
      } as any, 'user-1', 'conv-1');

      expect(mockWhisper.handleWhisperTrigger).toHaveBeenCalledWith(
        'user-1',
        'conv-1',
        'msg-1',
      );
    });

    it('should route @bot to AgentOrchestrator', async () => {
      const mockOrchestrator = {
        dispatchEvent: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MentionService,
          { provide: PrismaService, useValue: { bot: { findMany: jest.fn() } } },
          { provide: WhisperService, useValue: { handleWhisperTrigger: jest.fn() } },
          { provide: AgentOrchestratorService, useValue: mockOrchestrator },
        ],
      }).compile();

      const serviceWithMock = module.get<MentionService>(MentionService);

      const mentions: ValidMention[] = [{
        type: 'bot',
        name: 'CodingBot',
        fullMatch: '@CodingBot',
        botId: 'bot-1',
        userId: 'user-bot-1',
      }];

      await serviceWithMock.route(mentions, {
        id: 'msg-1',
        content: '@CodingBot help',
        converseId: 'conv-1',
      } as any, 'user-1', 'conv-1');

      expect(mockOrchestrator.dispatchEvent).toHaveBeenCalledWith(
        'bot-1',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'MESSAGE',
            payload: expect.objectContaining({
              messageId: 'msg-1',
              converseId: 'conv-1',
              senderId: 'user-1',
            }),
          }),
        ]),
      );
    });
  });
```

**Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm jest src/mentions/__tests__/mentions.service.spec.ts
```
Expected: FAIL with "service.route is not a function"

**Step 3: Implement route()**

Add to `apps/server/src/mentions/mentions.service.ts`:

```typescript
  /**
   * 路由 @mentions 到对应的处理器
   *
   * @param mentions - 验证后的 mentions
   * @param message - 原始消息对象
   * @param senderId - 发送者 ID
   * @param converseId - 会话 ID
   */
  async route(
    mentions: ValidMention[],
    message: { id: string; content: string | null; converseId: string },
    senderId: string,
    converseId: string,
  ): Promise<void> {
    for (const mention of mentions) {
      try {
        switch (mention.type) {
          case 'bot':
            await this.routeToBot(mention, message, senderId, converseId);
            break;
          case 'ai':
            await this.routeToSupervisor(senderId, converseId, message.id);
            break;
        }
      } catch (error) {
        this.logger.error(
          `Failed to route mention ${mention.fullMatch}: ${error}`,
        );
      }
    }
  }

  /**
   * 路由到 Bot Agent
   */
  private async routeToBot(
    mention: ValidMention,
    message: { id: string; content: string | null; converseId: string },
    senderId: string,
    converseId: string,
  ): Promise<void> {
    if (!mention.botId) return;

    const event = {
      type: 'MESSAGE' as const,
      payload: {
        messageId: message.id,
        converseId,
        senderId,
        content: message.content,
        mention: mention.fullMatch,
      },
    };

    await this.agentOrchestrator.dispatchEvent(mention.botId, [event]);

    this.logger.log(
      `Routed @${mention.name} to bot ${mention.botId} for message ${message.id}`,
    );
  }

  /**
   * 路由到 Supervisor (@ai)
   */
  private async routeToSupervisor(
    senderId: string,
    converseId: string,
    messageId: string,
  ): Promise<void> {
    await this.whisperService.handleWhisperTrigger(
      senderId,
      converseId,
      messageId,
    );

    this.logger.log(
      `Routed @ai to WhisperService for message ${messageId}`,
    );
  }
```

**Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm jest src/mentions/__tests__/mentions.service.spec.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/mentions/
git commit -m "feat(mentions): implement MentionService.route()"
```

---

## Task 5: Integrate MentionsModule into AppModule

**Files:**
- Modify: `apps/server/src/app.module.ts`

**Step 1: Add MentionsModule import**

```typescript
// apps/server/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { GatewayModule } from './gateway/gateway.module';
import { FriendsModule } from './friends/friends.module';
import { ConversesModule } from './converses/converses.module';
import { MessagesModule } from './messages/messages.module';
import { UsersModule } from './users/users.module';
import { BotsModule } from './bots/bots.module';
import { AiModule } from './ai/ai.module';
import { OpenclawModule } from './openclaw/openclaw.module';
import { AgentsModule } from './agents/agents.module';  // Add if not present
import { MentionsModule } from './mentions/mentions.module';  // ADD THIS

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    DevicesModule,
    GatewayModule,
    FriendsModule,
    ConversesModule,
    MessagesModule,
    UsersModule,
    BotsModule,
    AiModule,
    OpenclawModule,
    AgentsModule,  // Add if not present
    MentionsModule,  // ADD THIS
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**Step 2: Verify build passes**

```bash
cd apps/server && pnpm build
```
Expected: No errors

**Step 3: Commit**

```bash
git add apps/server/src/app.module.ts
git commit -m "feat(app): import MentionsModule"
```

---

## Task 6: Integrate MentionService into MessagesModule

**Files:**
- Modify: `apps/server/src/messages/messages.module.ts`
- Modify: `apps/server/src/messages/messages.service.ts`

**Step 1: Update MessagesModule imports**

```typescript
// apps/server/src/messages/messages.module.ts
import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ConversesModule } from '../converses/converses.module';
import { AiModule } from '../ai/ai.module';
import { MentionsModule } from '../mentions/mentions.module';  // ADD THIS

@Module({
  imports: [ConversesModule, AiModule, MentionsModule],  // ADD MentionsModule
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
```

**Step 2: Update MessagesService constructor**

```typescript
// apps/server/src/messages/messages.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastService } from '../gateway/broadcast.service';
import { ConversesService } from '../converses/converses.service';
import { WhisperService } from '../ai/services/whisper.service';
import { MentionService } from '../mentions/mentions.service';  // ADD THIS
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

// ... existing code ...

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
    private readonly conversesService: ConversesService,
    private readonly whisperService: WhisperService,
    private readonly mentionService: MentionService,  // ADD THIS
  ) {}

  // ... rest of the service ...
}
```

**Step 3: Verify build passes**

```bash
cd apps/server && pnpm build
```
Expected: No errors

**Step 4: Commit**

```bash
git add apps/server/src/messages/
git commit -m "feat(messages): inject MentionService"
```

---

## Task 7: Add @mention Routing Logic to MessagesService.create()

**Files:**
- Modify: `apps/server/src/messages/messages.service.ts`

**Step 1: Replace detectBotRecipient with @mention routing**

Find the `detectBotRecipient` call (around line 127) and replace with:

```typescript
// apps/server/src/messages/messages.service.ts

    // ... existing message creation code ...

    this.logger.log(
      `Message created: ${message.id} in converse ${dto.converseId} by ${userId}`,
    );

    // 7. 群聊 @mention 路由（fire-and-forget）
    this.handleGroupMentions(userId, dto.converseId, message, converse.type)
      .catch((err) =>
        this.logger.error(`handleGroupMentions failed: ${err.message}`, err.stack),
      );

    // 8. 私信 Bot 检测（保留原有逻辑，仅记录日志）
    if (converse.type === 'DIRECT') {
      this.detectBotRecipient(userId, dto.converseId, message).catch((err) =>
        this.logger.error(`detectBotRecipient failed: ${err.message}`, err.stack),
      );
    }

    // 9. 检测 @ai 触发词（fire-and-forget）- 保留兼容
    if (this.whisperService.isWhisperTrigger(message.content)) {
      this.whisperService
        .handleWhisperTrigger(userId, dto.converseId, message.id)
        .catch((err) =>
          this.logger.error(`whisper trigger failed: ${err.message}`, err.stack),
        );
    }

    return message;
  }

  /**
   * 处理群聊中的 @mention 路由
   *
   * @param userId - 发送者 ID
   * @param converseId - 会话 ID
   * @param message - 消息对象
   * @param converseType - 会话类型
   */
  private async handleGroupMentions(
    userId: string,
    converseId: string,
    message: { id: string; content: string | null; type: string },
    converseType: string,
  ): Promise<void> {
    // 仅处理群聊消息
    if (converseType !== 'GROUP') return;

    // 解析 @mentions
    const mentions = this.mentionService.parse(message.content);
    if (mentions.length === 0) return;

    // 验证并路由
    const validMentions = await this.mentionService.validate(mentions, converseId);
    if (validMentions.length === 0) return;

    await this.mentionService.route(validMentions, {
      id: message.id,
      content: message.content,
      converseId,
    }, userId, converseId);

    this.logger.log(
      `Routed ${validMentions.length} mentions in group ${converseId}`,
    );
  }
```

**Step 2: Get converse type in create() method**

Add this after line 45 (after verifyMembership):

```typescript
    // 1.5 获取会话类型（用于 @mention 路由）
    const converse = await this.prisma.converse.findUnique({
      where: { id: dto.converseId },
      select: { type: true },
    });

    if (!converse) {
      throw new NotFoundException('Conversation not found');
    }
```

**Step 3: Verify build passes**

```bash
cd apps/server && pnpm build
```
Expected: No errors

**Step 4: Commit**

```bash
git add apps/server/src/messages/messages.service.ts
git commit -m "feat(messages): add @mention routing for group chats"
```

---

## Task 8: Run All Tests

**Step 1: Run unit tests**

```bash
cd apps/server && pnpm test
```
Expected: All tests pass

**Step 2: Run e2e tests if available**

```bash
cd apps/server && pnpm test:e2e
```

**Step 3: Run lint**

```bash
cd apps/server && pnpm lint
```

**Step 4: Run type check**

```bash
cd apps/server && pnpm type-check
```

**Step 5: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix(mentions): address test/lint issues"
```

---

## Task 9: Final Verification

**Step 1: Start development server**

```bash
pnpm docker:up
pnpm dev:server
```

**Step 2: Manual test scenarios**

1. Create a group chat with at least one Bot
2. Send `@CodingBot help` → Verify Bot receives the message
3. Send `@ai what do you think?` → Verify Whisper suggestions appear
4. Send `@NonExistentBot hello` → Verify no error, message still sends
5. Send message without @mention → Verify no routing happens

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(phase7): complete @Bot routing and @ai fallback for group chats"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Create MentionsModule structure | 3 new files |
| 2 | Implement parse() | 2 files |
| 3 | Implement validate() | 2 files |
| 4 | Implement route() | 2 files |
| 5 | Integrate into AppModule | 1 file |
| 6 | Integrate into MessagesModule | 2 files |
| 7 | Add routing logic to create() | 1 file |
| 8 | Run tests | - |
| 9 | Final verification | - |

**Total new files:** 4
**Total modified files:** 4
