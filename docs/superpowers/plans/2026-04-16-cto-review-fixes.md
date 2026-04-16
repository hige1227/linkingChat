# CTO Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 CTO 审查中发现的 4 个高优先级问题：CI 安全审计失效、OpenClaw 默认 token 硬编码、N+1 查询性能问题、`AiDraft.draftType` 枚举化。

**Architecture:** 4 个独立任务，按风险从低到高排序。每个任务都是自包含的，可单独 commit。Task 1-2 是纯配置修改（5 分钟内），Task 3 是查询重构（需要新方法 + 测试），Task 4 是 schema 变更（需要 Prisma migration）。

**Tech Stack:** NestJS 11、Prisma 6、Jest、TypeScript 5.7、pnpm 10

---

## 文件地图

| 任务 | 修改文件 |
|------|---------|
| Task 1 | `.github/workflows/ci.yml` |
| Task 2 | `apps/server/src/openclaw/gateway-manager.service.ts` + `gateway-manager.service.spec.ts` |
| Task 3 | `apps/server/src/converses/converses.service.ts` + `converses.service.spec.ts` |
| Task 4 | `apps/server/prisma/schema.prisma`、`apps/server/src/ai/services/draft.service.ts`、`apps/server/src/ai/ai.controller.ts` |

---

## Task 1: 修复 CI 安全审计（5 分钟）

**Files:**
- Modify: `.github/workflows/ci.yml:60`

`continue-on-error: true` 让高危漏洞不阻断构建，安全审计形同虚设。

- [ ] **Step 1: 删除 `continue-on-error: true`**

打开 `.github/workflows/ci.yml`，找到 `security-audit` job，将：

```yaml
      - name: Security audit
        run: pnpm audit --audit-level=high
        continue-on-error: true
```

改为：

```yaml
      - name: Security audit
        run: pnpm audit --audit-level=high
```

- [ ] **Step 2: 验证修改正确**

```bash
grep -A 3 "Security audit" .github/workflows/ci.yml
```

预期输出（不含 `continue-on-error`）：
```
      - name: Security audit
        run: pnpm audit --audit-level=high
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: make security audit block on high vulnerabilities"
```

---

## Task 2: 修复 OpenClaw 硬编码默认 token（15 分钟）

**Files:**
- Modify: `apps/server/src/openclaw/gateway-manager.service.ts`
- Modify: `apps/server/src/openclaw/gateway-manager.service.spec.ts`

OpenClaw 是远程代码执行通道。`'lc_dev_token_change_me'` 作为默认值意味着生产环境如果漏配，任何知道该值的人都能执行任意命令。生产环境必须强制要求配置存在。

- [ ] **Step 1: 先写失败的测试**

打开 `apps/server/src/openclaw/gateway-manager.service.spec.ts`，在文件**末尾**现有 `describe` 块之后添加：

```typescript
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="gateway-manager" --verbose
```

预期：两个新测试 **FAIL**。

- [ ] **Step 3: 修改 `gateway-manager.service.ts`**

用以下完整内容替换该文件（保留注释和现有 public API，只改 `createStrategy` 相关逻辑）：

```typescript
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { GatewayStrategy } from './strategies';
import { SingleContainerStrategy } from './strategies';

/**
 * Gateway Manager Service
 *
 * Delegates to a GatewayStrategy based on OPENCLAW_MODE env var.
 * The controller and consumers call this service — they never touch the strategy directly.
 *
 * Supported modes (OPENCLAW_MODE):
 *   "single"   — all users share one Docker container  (default, implemented)
 *   "per-user" — one container per user                (TODO)
 *   "pool"     — N containers : M users                (TODO)
 */
@Injectable()
export class GatewayManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(GatewayManagerService.name);
  private readonly strategy: GatewayStrategy;

  constructor(private readonly configService: ConfigService) {
    const mode = this.configService.get<string>('OPENCLAW_MODE', 'single');
    this.strategy = this.createStrategy(mode);
    this.logger.log(`Gateway Manager initialized (mode: ${mode})`);
  }

  /**
   * Returns the gateway token.
   * In production, throws if OPENCLAW_GATEWAY_TOKEN is not set.
   * In development, falls back to the dev default.
   */
  private getRequiredToken(): string {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const token = this.configService.get<string>('OPENCLAW_GATEWAY_TOKEN');

    if (isProduction && !token) {
      throw new Error('OPENCLAW_GATEWAY_TOKEN must be set in production');
    }

    return token ?? 'lc_dev_token_change_me';
  }

  private createStrategy(mode: string): GatewayStrategy {
    switch (mode) {
      case 'single': {
        const url = this.configService.get<string>(
          'OPENCLAW_GATEWAY_URL',
          'ws://127.0.0.1:18790',
        );
        const token = this.getRequiredToken();
        return new SingleContainerStrategy(url, token);
      }

      default:
        this.logger.warn(
          `Unknown OPENCLAW_MODE "${mode}", falling back to "single"`,
        );
        const url = this.configService.get<string>(
          'OPENCLAW_GATEWAY_URL',
          'ws://127.0.0.1:18790',
        );
        const token = this.getRequiredToken();
        return new SingleContainerStrategy(url, token);
    }
  }

  async acquire(userId: string): Promise<{ url: string; token: string }> {
    return this.strategy.acquire(userId);
  }

  async release(userId: string): Promise<void> {
    return this.strategy.release(userId);
  }

  async health(userId: string): Promise<boolean> {
    return this.strategy.health(userId);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Gateway Manager...');
    await this.strategy.destroy();
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="gateway-manager" --verbose
```

预期：所有测试 **PASS**。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/openclaw/gateway-manager.service.ts \
        apps/server/src/openclaw/gateway-manager.service.spec.ts
git commit -m "fix(openclaw): require OPENCLAW_GATEWAY_TOKEN in production"
```

---

## Task 3: 修复 N+1 查询（30 分钟）

**Files:**
- Modify: `apps/server/src/converses/converses.service.ts`
- Modify: `apps/server/src/converses/converses.service.spec.ts`

**问题：** `findUserConverses` 对每个会话各调用一次 `getUnreadCount`。该方法内部：先查 `lastSeenMessage.createdAt`（1次），再 count 未读（1次）。用户有 N 个会话 = 最多 2N 次额外查询。

**修复：** 新增私有方法 `batchGetUnreadCounts`，先用 1 次 `message.findMany` 批量取所有 `lastSeenMessageId` 对应的 `createdAt`，再并发 N 次 count（消除额外的 createdAt 查询那层）。

- [ ] **Step 1: 先写失败的测试**

打开 `apps/server/src/converses/converses.service.spec.ts`，在最后一个 `describe` 块之后添加：

```typescript
describe('findUserConverses — unread count batching', () => {
  it('calls message.findMany once to batch-fetch timestamps, not per-converse', async () => {
    mockPrisma.converseMember.findMany.mockResolvedValue([
      {
        converseId: 'c1', userId: 'u1', isOpen: true,
        lastSeenMessageId: 'msg1', lastMessageId: null,
        role: null, nickname: null, mutedUntil: null, joinedAt: new Date(),
        converse: {
          id: 'c1', type: 'DM', name: null, description: null,
          avatarUrl: null, creatorId: null, maxMembers: 200,
          deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
          members: [
            { userId: 'u1', role: null, isOpen: true, mutedUntil: null, user: mockUser('u1') },
            { userId: 'u2', role: null, isOpen: true, mutedUntil: null, user: mockUser('u2') },
          ],
          messages: [],
          _count: { members: 2 },
        },
      },
      {
        converseId: 'c2', userId: 'u1', isOpen: true,
        lastSeenMessageId: 'msg2', lastMessageId: null,
        role: null, nickname: null, mutedUntil: null, joinedAt: new Date(),
        converse: {
          id: 'c2', type: 'DM', name: null, description: null,
          avatarUrl: null, creatorId: null, maxMembers: 200,
          deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
          members: [
            { userId: 'u1', role: null, isOpen: true, mutedUntil: null, user: mockUser('u1') },
            { userId: 'u3', role: null, isOpen: true, mutedUntil: null, user: mockUser('u3') },
          ],
          messages: [],
          _count: { members: 2 },
        },
      },
    ]);

    mockPrisma.message.findMany = jest.fn().mockResolvedValue([
      { id: 'msg1', createdAt: new Date('2026-01-01') },
      { id: 'msg2', createdAt: new Date('2026-01-02') },
    ]);
    mockPrisma.message.count = jest.fn().mockResolvedValue(0);
    mockPrisma.bot.findMany.mockResolvedValue([]);

    await service.findUserConverses('u1');

    // One findMany for timestamps, not one findUnique per converse
    expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.arrayContaining(['msg1', 'msg2']) } },
      }),
    );
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="converses.service" --verbose
```

预期：新测试 **FAIL**（当前代码没有 `message.findMany` 批量查询）。

- [ ] **Step 3: 在 `converses.service.ts` 添加 `batchGetUnreadCounts` 私有方法**

在 `getUnreadCount` 方法定义之前（找到 `async getUnreadCount` 这行，在它前面）插入：

```typescript
  /**
   * 批量获取多个会话的未读数，避免 N+1 查询。
   * 相比逐个调用 getUnreadCount，节省了每个会话的 lastSeenMessage.createdAt 查询。
   */
  private async batchGetUnreadCounts(
    userId: string,
    entries: Array<{ converseId: string; lastSeenMessageId: string | null }>,
  ): Promise<Map<string, number>> {
    if (entries.length === 0) return new Map();

    // 1. 批量取所有 lastSeenMessage 的 createdAt（1 次 findMany）
    const seenIds = entries
      .map((e) => e.lastSeenMessageId)
      .filter((id): id is string => id !== null);

    const seenMessages =
      seenIds.length > 0
        ? await this.prisma.message.findMany({
            where: { id: { in: seenIds } },
            select: { id: true, createdAt: true },
          })
        : [];

    const seenCreatedAt = new Map(
      seenMessages.map((m) => [m.id, m.createdAt]),
    );

    // 2. 并发 N 次 count（无额外 createdAt 查询）
    const results = await Promise.all(
      entries.map(async ({ converseId, lastSeenMessageId }) => {
        if (!lastSeenMessageId) {
          const count = await this.prisma.message.count({
            where: { converseId, authorId: { not: userId }, deletedAt: null },
          });
          return { converseId, count };
        }

        const createdAt = seenCreatedAt.get(lastSeenMessageId);
        const count = await this.prisma.message.count({
          where: {
            converseId,
            authorId: { not: userId },
            deletedAt: null,
            ...(createdAt ? { createdAt: { gt: createdAt } } : {}),
          },
        });
        return { converseId, count };
      }),
    );

    return new Map(results.map((r) => [r.converseId, r.count]));
  }
```

- [ ] **Step 4: 修改 `findUserConverses` 使用新方法**

找到 `findUserConverses` 方法中的这段（约第 90 行）：

```typescript
    // 构建响应并附加 Bot 信息
    const converses = await Promise.all(
      activeMembers.map(async (member) => {
        const unreadCount = await this.getUnreadCount(
          member.converseId,
          userId,
          member.lastSeenMessageId,
        );
```

替换为：

```typescript
    // 批量预取所有会话的未读数（避免 N+1）
    const unreadCounts = await this.batchGetUnreadCounts(
      userId,
      activeMembers.map((m) => ({
        converseId: m.converseId,
        lastSeenMessageId: m.lastSeenMessageId ?? null,
      })),
    );

    // 构建响应并附加 Bot 信息
    const converses = await Promise.all(
      activeMembers.map(async (member) => {
        const unreadCount = unreadCounts.get(member.converseId) ?? 0;
```

（map 函数其余内容不变）

- [ ] **Step 5: 运行所有 converses 测试，确认通过**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="converses" --verbose
```

预期：所有测试 **PASS**。

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/converses/converses.service.ts \
        apps/server/src/converses/converses.service.spec.ts
git commit -m "perf(converses): batch unread count queries to eliminate N+1"
```

---

## Task 4: `AiDraft.draftType` 枚举化（20 分钟）

**Files:**
- Modify: `apps/server/prisma/schema.prisma`（第 365 行）
- Modify: `apps/server/src/ai/services/draft.service.ts`（第 50、243、247、267、271 行附近）
- Modify: `apps/server/src/ai/ai.controller.ts`（第 53 行）

将 `draftType: String` 替换为 Prisma 枚举，让数据库和 TypeScript 都约束合法值。

- [ ] **Step 1: 在 `schema.prisma` 添加枚举**

在 `DraftStatus` 枚举之后（约第 80 行），插入：

```prisma
enum DraftType {
  MESSAGE
  COMMAND
}
```

- [ ] **Step 2: 更新 `AiDraft` 模型字段**

将 `AiDraft` 模型中的（第 365 行）：

```prisma
  draftType    String      // 'message' | 'command'
```

改为：

```prisma
  draftType    DraftType
```

- [ ] **Step 3: 生成 migration**

```bash
pnpm --filter @linkingchat/server prisma migrate dev --name add_draft_type_enum
```

预期输出包含：
```
migrations/
  └─ 20260416XXXXXX_add_draft_type_enum/
    └─ migration.sql
```

检查生成的 `migration.sql`（路径在上面输出中），应包含类似：
```sql
CREATE TYPE "DraftType" AS ENUM ('MESSAGE', 'COMMAND');
ALTER TABLE "ai_drafts" ALTER COLUMN "draft_type" TYPE "DraftType" USING ...
```

- [ ] **Step 4: 更新 `draft.service.ts`**

在文件顶部 import 区添加：
```typescript
import { DraftType } from '@prisma/client';
```

然后做以下替换（全文搜索替换）：

| 原文 | 替换为 |
|------|--------|
| `draftType: 'message' \| 'command'` | `draftType: DraftType` |
| `draftType === 'message'` | `draftType === DraftType.MESSAGE` |
| `draftType === 'command'` | `draftType === DraftType.COMMAND` |

- [ ] **Step 5: 更新 `ai.controller.ts`**

在文件顶部 import 区添加：
```typescript
import { DraftType } from '@prisma/client';
```

将第 53 行：
```typescript
      draftType: 'message' | 'command';
```
改为：
```typescript
      draftType: DraftType;
```

- [ ] **Step 6: 类型检查 + 测试**

```bash
pnpm --filter @linkingchat/server type-check && \
pnpm --filter @linkingchat/server test
```

预期：0 type errors，所有测试 PASS。

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/schema.prisma \
        apps/server/prisma/migrations/ \
        apps/server/src/ai/services/draft.service.ts \
        apps/server/src/ai/ai.controller.ts
git commit -m "refactor(ai): replace draftType string with DraftType enum"
```

---

## 全量验证（所有任务完成后）

```bash
# 完整构建 + 测试
pnpm build && pnpm test

# 类型检查
pnpm type-check

# 确认 CI 已无 continue-on-error
grep "continue-on-error" .github/workflows/ci.yml
# 预期：无输出

# 确认 OpenClaw 无裸默认 token（只应出现在注释里）
grep -n "lc_dev_token_change_me" apps/server/src/openclaw/gateway-manager.service.ts
# 预期：只出现在 getRequiredToken 方法的 fallback 行（开发环境）

# 确认 DraftType 枚举存在
grep "DraftType" apps/server/prisma/schema.prisma
# 预期：出现 enum DraftType 定义 + AiDraft.draftType 字段
```
