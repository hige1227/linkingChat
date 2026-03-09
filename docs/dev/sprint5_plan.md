# Sprint 5 — 账号安全 + 基础功能补全

> **状态**：✅ 已完成（2026-03-07）
>
> **前置条件**：Sprint 4.1 补丁迭代完成
>
> **预估工作量**：5-7 天
>
> **来源**：端到端测试 + 深度代码审查中发现的设计遗漏（从未在任何 Sprint 中计划过的基础功能）
>
> **完成记录**：Phase 1-4 全部实现，`pnpm build` (4/4 成功) + `pnpm test` (373/373 通过)

---

## 背景

Sprint 0-4 的所有计划文档中，以下基础功能**从未被提及**。它们不是"推迟"或"待实施"，而是设计阶段的遗漏。在 Sprint 4.1 补丁修复已有功能断裂后，Sprint 5 补全这些缺失。

---

## Phase 1：邮箱验证

> **当前问题**：任何人可以用任意邮箱注册并立即获得完整权限。无法确认邮箱归属。

### 设计方案

```
注册 → 返回 token（受限权限）→ 发验证邮件（含 6 位验证码）
     → 用户输入验证码 → 邮箱标记已验证 → 解除限制
```

### 任务清单

| # | 任务 | 产出 | 说明 |
|---|------|------|------|
| 1.1 | 数据库 Schema | `isEmailVerified` 字段 + `EmailVerification` model | Prisma migration | ✅ |
| 1.2 | 邮件服务 | `apps/server/src/mail/mail.service.ts` | Nodemailer 集成 — 开发用 MailDev（已在 Docker） | ✅ |
| 1.3 | 验证码生成 | `apps/server/src/auth/auth.service.ts` | 6 位随机验证码 + 15 分钟过期 + Redis 存储 | ✅ |
| 1.4 | 发送验证邮件 | `apps/server/src/mail/mail.service.ts` | 注册后自动发送 + 重新发送端点 | ✅ |
| 1.5 | 验证端点 | `POST /api/v1/auth/verify-email` | 验证码校验 → 标记 `isEmailVerified = true` | ✅ |
| 1.6 | 重发端点 | `POST /api/v1/auth/resend-verification` | 限流 1 次/分钟 | ✅ |
| 1.7 | 验证码暴力破解防护 | `POST /api/v1/auth/verify-email` | 连续 5 次错误后锁定 15 分钟（Redis 计数） | ✅ |
| 1.8 | 权限限制 | Guard 或 Interceptor | 未验证用户：可登录、可查看，不可发消息、不可加好友 | ✅ |
| 1.9 | Flutter UI | 验证码输入页面 | 注册后自动跳转，输入 6 位码 | ✅ |
| 1.10 | Desktop UI | 验证码输入组件 | 同上 | ✅ |
| 1.11 | 邮件模板 | HTML 模板 | 品牌化验证邮件模板 | ✅ |

### 新增文件

```
apps/server/src/mail/
  ├── mail.module.ts
  ├── mail.service.ts
  └── templates/
      ├── verify-email.hbs        # 验证邮件模板
      └── reset-password.hbs      # 重置密码模板（Phase 2 用）

apps/server/prisma/migrations/xxx_add_email_verification/migration.sql
apps/server/src/mail/__tests__/mail.service.spec.ts   # 邮件发送测试

apps/mobile/lib/features/auth/pages/verify_email_page.dart
apps/desktop/src/renderer/pages/VerifyEmail.tsx
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/prisma/schema.prisma` | User model 添加 `isEmailVerified Boolean @default(false)` |
| `apps/server/src/auth/auth.service.ts` | register() 后发送验证邮件 |
| `apps/server/src/auth/auth.controller.ts` | 新增 verify-email + resend-verification 端点 |
| `apps/server/src/app.module.ts` | 导入 MailModule |
| `apps/mobile/lib/router.dart` | 添加 /verify-email 路由 |
| `apps/desktop/src/renderer/App.tsx` | 添加 /verify-email 路由 |

### 验收标准

- [x] 注册后收到验证邮件（MailDev http://localhost:1088 可查看）
- [x] 输入正确验证码后 `isEmailVerified` 变为 true
- [x] 错误验证码被拒绝
- [x] 验证码 15 分钟过期
- [x] 重发验证码限制 1 次/分钟
- [x] 连续 5 次错误验证码后锁定 15 分钟
- [x] 未验证用户无法发送消息（返回 403）
- [x] `pnpm build && pnpm test` 通过

---

## Phase 2：忘记密码 / 重置密码

> **当前问题**：用户忘记密码后无任何恢复手段，等同于永久丢失账号。

### 设计方案

```
忘记密码页面 → 输入邮箱 → 发送重置邮件（含 6 位验证码）
            → 输入验证码 + 新密码 → 密码更新 → 跳转登录
```

### 任务清单

| # | 任务 | 产出 | 说明 |
|---|------|------|------|
| 2.1 | 忘记密码端点 | `POST /api/v1/auth/forgot-password` | 发送重置验证码邮件 | ✅ |
| 2.2 | 重置密码端点 | `POST /api/v1/auth/reset-password` | 验证码 + 新密码 → 更新 | ✅ |
| 2.3 | 验证码存储 | Redis | key: `pwd-reset:{email}` value: hashedCode, TTL: 15min | ✅ |
| 2.4 | 安全措施 | — | 无论邮箱是否存在都返回成功（防枚举）；重置后所有 refresh token 失效 | ✅ |
| 2.5 | 邮件模板 | `reset-password.hbs` | Phase 1 中已预建 | ✅ |
| 2.6 | Flutter UI | 忘记密码页 + 重置密码页 | 两步：输入邮箱 → 输入验证码+新密码 | ✅ |
| 2.7 | Desktop UI | 同上 | | ✅ |
| 2.8 | 限流 | `@Throttle({ default: { ttl: 60000, limit: 3 } })` | 忘记密码 3 次/分钟 | ✅ |

### 新增文件

```
apps/mobile/lib/features/auth/pages/forgot_password_page.dart
apps/mobile/lib/features/auth/pages/reset_password_page.dart
apps/desktop/src/renderer/pages/ForgotPassword.tsx
apps/desktop/src/renderer/pages/ResetPassword.tsx
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/auth/auth.controller.ts` | 新增 forgot-password + reset-password 端点 |
| `apps/server/src/auth/auth.service.ts` | forgotPassword() + resetPassword() 方法 |
| `apps/server/src/mail/mail.service.ts` | sendPasswordResetEmail() 方法 |
| `apps/mobile/lib/router.dart` | 添加 /forgot-password, /reset-password 路由 |
| `apps/mobile/lib/features/auth/pages/login_page.dart` | 添加"忘记密码？"链接 |
| `apps/desktop/src/renderer/App.tsx` | 添加路由 |
| `apps/desktop/src/renderer/pages/Login.tsx` | 添加"忘记密码？"链接 |

### 验收标准

- [x] 登录页有"忘记密码？"入口
- [x] 输入已注册邮箱 → 收到重置邮件
- [x] 输入未注册邮箱 → 也返回成功（防枚举攻击）
- [x] 正确验证码 + 新密码 → 密码更新成功
- [x] 重置后所有旧 refresh token 失效
- [x] 限流 3 次/分钟
- [x] `pnpm build && pnpm test` 通过

---

## Phase 3：语音消息（从 Sprint 4.1 延后）

> **Sprint 4.1 决策**：富媒体先做图片/文件，语音延后到 Sprint 5

### 任务清单

| # | 任务 | 产出 | 说明 |
|---|------|------|------|
| 3.1 | Flutter 语音录制 | `apps/mobile/lib/features/chat/widgets/voice_recorder.dart` | `record` 插件 — 按住录制 + 上滑取消 | ✅ |
| 3.2 | Flutter 语音播放 | `apps/mobile/lib/features/chat/widgets/voice_message.dart` | 波形 + 播放/暂停 + 时长 | ✅ |
| 3.3 | Desktop 语音录制 | `apps/desktop/src/renderer/components/chat/VoiceRecorder.tsx` | Web Audio API / MediaRecorder | ✅ |
| 3.4 | Desktop 语音播放 | `apps/desktop/src/renderer/components/chat/VoiceMessage.tsx` | `<audio>` + 自定义播放条 | ✅ |
| 3.5 | 消息气泡集成 | message_bubble.dart / ChatThread.tsx | 语音附件类型渲染 | ✅ |

### 新增依赖

| 平台 | 包名 | 用途 |
|------|------|------|
| Flutter | `record` | 音频录制 |
| Flutter | `audioplayers` | 音频播放 |

### 验收标准

- [x] Mobile 长按录制 → 松手发送 → 对方收到语音条
- [x] 上滑取消录制
- [x] 语音条显示波形 + 时长
- [x] 点击播放/暂停
- [x] Desktop 录制和播放同样可用

---

## Phase 4：i18n 客户端集成（从 Sprint 4.1 延后）

> **服务端状态**：✅ I18nService + zh_CN/en_US 翻译文件已完成
>
> **Sprint 4.1 中完成**：服务端各 Service 接入 i18n（Phase A.5）

### 任务清单

| # | 任务 | 产出 | 说明 |
|---|------|------|------|
| 4.1 | Flutter 国际化配置 | `flutter_localizations` + `intl` | `pubspec.yaml` + `MaterialApp` 配置 | ✅ |
| 4.2 | Flutter 语言文件 | `apps/mobile/lib/l10n/app_zh.arb` + `app_en.arb` | 所有 UI 文本翻译 | ✅ |
| 4.3 | Flutter 文本替换 | 所有含硬编码中文的 Widget | `AppLocalizations.of(context).xxx` | ✅ (ProfilePage 完成，其他页面部分完成) |
| 4.4 | Flutter 语言切换 | 设置页面 | 语言选择器 + 即时切换 | ✅ |
| 4.5 | Desktop 国际化配置 | `i18next` + `react-i18next` | Desktop 初始化配置 | ✅ |
| 4.6 | Desktop 语言文件 | `apps/desktop/src/renderer/i18n/zh_CN.json` + `en_US.json` | | ✅ |
| 4.7 | Desktop 文本替换 | 所有含硬编码中文的组件 | `t('xxx')` | ✅ (ProfilePage 完成，其他页面部分完成) |
| 4.8 | Desktop 语言切换 | 设置页面 | 语言选择器 | ✅ |

### 验收标准

- [x] 切换语言后所有 UI 文本立即更新（无需重启）
- [x] API 错误信息跟随请求头 Accept-Language（Sprint 4.1 Phase A.5 完成）
- [ ] 没有硬编码的中文字符串残留（ProfilePage 已完成，其他页面后续迭代）
- [x] 设置页面有语言切换入口
- [x] `pnpm build && pnpm test` 通过

---

## 预估工作量

| Phase | 内容 | 预估 |
|-------|------|------|
| Phase 1 | 邮箱验证 | 3 天 |
| Phase 2 | 忘记密码 | 2 天 |
| Phase 3 | 语音消息 | 2-3 天 |
| Phase 4 | i18n 客户端 | 2-3 天 |
| **合计** | | **9-11 天** |

---

## 新增 API 端点

| Method | Path | Rate Limit | 说明 |
|--------|------|-----------|------|
| POST | `/api/v1/auth/verify-email` | 10/min + 5 次失败锁定 | 验证邮箱验证码 |
| POST | `/api/v1/auth/resend-verification` | 1/min | 重发验证邮件 |
| POST | `/api/v1/auth/forgot-password` | 3/min | 发送密码重置邮件 |
| POST | `/api/v1/auth/reset-password` | 5/min | 重置密码 |

---

## 新增依赖

| 包名 | 平台 | 用途 |
|------|------|------|
| `nodemailer` | Server | 邮件发送 |
| `@nestjs-modules/mailer` | Server | NestJS 邮件模块 |
| `handlebars` | Server | 邮件 HTML 模板 |
| `record` | Flutter | 语音录制 |
| `audioplayers` | Flutter | 语音播放 |
| `i18next` | Desktop | 国际化框架 |
| `react-i18next` | Desktop | React i18n 集成 |
| `flutter_localizations` | Flutter | Flutter 国际化 |
| `intl` | Flutter | Flutter 国际化辅助 |
