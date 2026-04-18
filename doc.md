# Bug & Issue Log

## UI/UX 迭代 (2026-04-18) — Polanyi × Impeccable 修复

### 预存 Bug（非本次引入，待修复）

#### 1. TypeScript 类型错误 — desktop renderer
**文件：** 多处 `src/renderer/`  
**错误类型：** `TS7006 Parameter implicitly has 'any' type`  
**典型位置：**
- `src/renderer/components/chat/ConversationList.tsx` — `converses.filter((c) => ...)` 中 `c`/`a`/`b` 无类型
- `src/renderer/components/chat/WhisperBar.tsx` — `useAiStore((s) => ...)` selector 中 `s` 无类型  
- `src/renderer/hooks/useChatSocket.ts` — 多处 socket 回调参数无类型
- `src/renderer/stores/aiStore.ts` — `create<>(...)` 调用方式不接受泛型参数 (TS2347)
- `src/renderer/pages/ChatPage.tsx` / `FriendsPage.tsx` 等多处

**根因：** Zustand store 创建方式与当前 TypeScript 配置不匹配，store state 类型推断丢失  
**影响：** 编译报错但运行时功能正常（`tsc --noEmit` 失败）  
**修复建议：** 为每个 Zustand store 补全显式类型标注，或升级 Zustand 版本

---

#### 2. TypeScript 错误 — `openclaw-process.service.ts`
**文件：** `apps/desktop/src/main/services/openclaw-process.service.ts`  
**错误：**
- Line 83: `Type 'string | null' is not assignable to type 'string'`
- Line 310/343/345/347: `Cannot find name 'fs'` — `fs` 模块未导入
- Line 402: `This expression is not constructable` — `@types/ws` 构造方式问题

**修复建议：** 补 `import * as fs from 'fs'`；Line 83 添加 null 断言；ws 构造改用 `new (WS as any)(...)`

---

#### 3. 服务端集成测试失败 — ws-integration
**测试套件：** `apps/server/src/__tests__/ws-integration/group-events.spec.ts` 等 3 个  
**失败数：** 10 failures / 419 tests  
**错误：** `cleanupTestUsers` 在 `afterAll` 中调用时 Prisma context 已关闭  
**影响：** CI 测试失败，但生产代码逻辑正常  
**修复建议：** 在 `afterAll` 中先断开所有 socket 再执行 cleanup，或改用 `afterEach`

---

### 本次 UI 改动摘要（已完成，无新 bug 引入）

| 文件 | 改动 |
|------|------|
| `global.css` | Anthropic Brand：Poppins/Lora字体，暖奶油light theme，橙色主色，橄榄绿AI色 |
| `chat.css` | 深色sidebar，12px圆角头像，WhisperBar融入输入区，Jarvis Dock，呼吸动画，Predictive边框语义 |
| `friends.css` | friend-avatar 圆角 50% → 12px |
| `Login.tsx` | 界面语言全中文 |
| `DraftCard.tsx` | 按钮：不用了/修改/发送，标题：✦ 贾维斯起草 |
| `WhisperBar.tsx` | 移除 dismiss 按钮，标签改为 ✦ |
| `PredictiveActionCard.tsx` | 圆点emoji → CSS边框语义，Run→执行 |
| `ConversationList.tsx` | Jarvis 会话固定在 ai-dock，普通联系人在下方，标题改为中文 |
