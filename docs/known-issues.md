# Known Issues — 待修复问题清单

> 记录于 2026-04-15，在执行 zero-friction onboarding 实现计划时发现。

---

## 1. Server `pnpm build` 存在 68 个既存 TypeScript 错误

**发现时机：** Task 7（服务端 config endpoint）验证构建步骤  
**命令：** `pnpm --filter @linkingchat/server build`  
**严重程度：** 中 — 不影响 `pnpm test` 和 `pnpm dev`，但 CI 构建会失败

### 根因分类

#### A. Prisma 客户端未生成（需 `pnpm db:migrate` 或 `prisma generate`）
```
prisma/seed.ts — Module '"@prisma/client"' has no exported member 'ConverseType'
prisma/seed.ts — Module '"@prisma/client"' has no exported member 'MessageType'
prisma/seed.ts — Module '"@prisma/client"' has no exported member 'UserStatus'
src/bots/bot-templates.ts — Module '"@prisma/client"' has no exported member 'BotType'
```
**修复：** `pnpm db:migrate`（需要 Docker 服务运行）或 `pnpm --filter @linkingchat/server exec prisma generate`

#### B. `@linkingchat/ws-protocol` 未构建
```
src/ai/services/draft.service.ts — Cannot find module '@linkingchat/ws-protocol'
src/ai/services/predictive.service.ts — Cannot find module '@linkingchat/ws-protocol'
src/ai/services/whisper.service.ts — Cannot find module '@linkingchat/ws-protocol'
src/bots/bot-communication.service.ts — Cannot find module '@linkingchat/ws-protocol'
```
**修复：** `pnpm --filter @linkingchat/ws-protocol build` 先构建 shared 包

#### C. `@linkingchat/shared` 未构建
```
src/bots/bots.service.ts — Cannot find module '@linkingchat/shared'
```
**修复：** 同上，先执行 `pnpm build`（全量 turbo build）

#### D. `implicit any` 类型错误（代码质量问题）
```
src/agents/impl/supervisor.agent.ts:98,100 — Parameter 'm' implicitly has an 'any' type
src/ai/services/whisper.service.ts:231 — Parameter 'm' implicitly has an 'any' type
src/bots/bot-communication.service.ts:197 — Parameter 'b' implicitly has an 'any' type
src/bots/bot-init.service.ts:41,43 — Parameter 'tx' implicitly has an 'any' type
```
**修复：** 给这些参数加上显式类型注解

---

## 2. Desktop 缺少 Jest 测试环境（已在本次计划中修复）

**发现时机：** Task 1 运行测试时  
**问题：** `apps/desktop/package.json` 没有 `test` 脚本，也没有 Jest / ts-jest 依赖  
**修复状态：** ✅ 已修复（commit `feat(desktop): add AgentProvider interface, ChatChunk types, and Jest test setup`）

---

## 3. `__mocks__/electron.ts` 类型问题（已在本次计划中修复）

**发现时机：** Task 4 测试运行时  
**问题：** `BrowserWindow.getAllWindows` 挂载到 `jest.fn()` 上报 TS2339  
**修复状态：** ✅ 已修复（改用 `any` 类型的中间变量）

---

## 推荐修复顺序

1. `pnpm build`（全量构建，解决 ws-protocol / shared 依赖问题）
2. `pnpm docker:up && pnpm db:migrate`（生成 Prisma 客户端）
3. 手动修复 `implicit any` 参数（4 个文件，加类型注解）
4. 再次验证 `pnpm --filter @linkingchat/server build` → 应清零错误
