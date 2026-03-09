# Sprint 5 — Phase 1: 邮箱验证

> **状态**：✅ 已完成（2026-03-07）
>
> **优先级**：P0（必须先做 — Phase 2 依赖邮件基础设施）
>
> **预估工作量**：3 天
>
> **前置条件**：Sprint 4.1 补丁迭代完成
>
> **参考**：[sprint5_plan.md](../sprint5_plan.md) Phase 1

---

## 目标

解决"任何人可以用任意邮箱注册并立即获得完整权限"的安全漏洞。注册后发送 6 位验证码到邮箱，验证通过后解除功能限制。

---

## 设计方案

```
注册 → 返回 token（受限权限）→ 发验证邮件（含 6 位验证码）
     → 用户输入验证码 → 邮箱标记已验证 → 解除限制
```

**关键安全设计：**
- 验证码 6 位数字，15 分钟过期
- Redis 存储，key: `email-verify:{userId}`
- 连续 5 次错误后锁定 15 分钟（防暴力破解）
- 重发限制 1 次/分钟
- 未验证用户：可登录、可查看，不可发消息、不可加好友

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 1.1 | 数据库 Schema 更新 | `isEmailVerified` 字段 + `EmailVerification` model | — | ✅ |
| 1.2 | MailModule 基础设施 | `mail.module.ts` + `mail.service.ts` | 1.1 | ✅ |
| 1.3 | 验证码生成与存储 | auth.service.ts 中生成 6 位码 + Redis 存储 | 1.2 | ✅ |
| 1.4 | 注册后自动发送验证邮件 | register() 流程集成 | 1.2, 1.3 | ✅ |
| 1.5 | 验证端点 `POST /auth/verify-email` | 验证码校验 → 标记已验证 | 1.3 | ✅ |
| 1.6 | 重发端点 `POST /auth/resend-verification` | 限流 1 次/分钟 | 1.2 | ✅ |
| 1.7 | 暴力破解防护 | 5 次错误锁定 15 分钟 | 1.5 | ✅ |
| 1.8 | 未验证用户权限限制 | Guard/Interceptor 拦截受限操作 | 1.1 | ✅ |
| 1.9 | 邮件 HTML 模板 | 品牌化验证邮件 | 1.2 | ✅ |
| 1.10 | Flutter 验证码输入页面 | 注册后跳转，输入 6 位码 | 1.5 | ✅ |
| 1.11 | Desktop 验证码输入组件 | 同上 | 1.5 | ✅ |
| 1.12 | 单元测试 | mail.service.spec.ts + auth verify 测试 | 1.2-1.7 | ✅ |

---

## 后端实现

### 1.1 数据库 Schema

```prisma
// schema.prisma — User model 新增字段
model User {
  // ... existing fields
  isEmailVerified Boolean @default(false)
}
```

执行 `npx prisma migrate dev --name add_email_verification`

### 1.2 MailModule

**新建文件结构：**

```
apps/server/src/mail/
├── mail.module.ts
├── mail.service.ts
├── __tests__/
│   └── mail.service.spec.ts
└── templates/
    ├── verify-email.hbs        # 验证邮件模板
    └── reset-password.hbs      # 重置密码模板（Phase 2 用，先预建）
```

**mail.module.ts：**

```typescript
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

**mail.service.ts 核心逻辑：**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1033'), // MailDev 宿主机端口（容器内 1025 → 宿主机 1033）
      secure: false,
      // 生产环境需要 auth
      ...(process.env.SMTP_USER && {
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      }),
    });
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    // 使用 Handlebars 模板渲染
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || '"LinkingChat" <noreply@linkingchat.com>',
      to: email,
      subject: '验证您的邮箱 - LinkingChat',
      html: this.renderTemplate('verify-email', { code, expiresIn: '15 分钟' }),
    });
    this.logger.log(`Verification email sent to ${email}`);
  }

  async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    // Phase 2 实现
  }
}
```

### 1.3 验证码生成

```typescript
// auth.service.ts — 新增方法
// 注意：Redis 通过 @Inject('REDIS_CLIENT') private redis: Redis 注入（ioredis）
async generateVerificationCode(userId: string): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 位
  const key = `email-verify:${userId}`;

  await this.redis.set(key, code, 'EX', 15 * 60); // 15 分钟过期
  return code;
}
```

### 1.5 验证端点

```typescript
// auth.controller.ts
@Post('verify-email')
@UseGuards(JwtAuthGuard)
async verifyEmail(@Req() req, @Body() body: { code: string }) {
  return this.authService.verifyEmail(req.user.id, body.code);
}
```

```typescript
// auth.service.ts（Redis 通过 @Inject('REDIS_CLIENT') private redis: Redis 注入）
async verifyEmail(userId: string, code: string) {
  // 1. 检查锁定状态
  const lockKey = `email-verify-lock:${userId}`;
  const locked = await this.redis.get(lockKey);
  if (locked) throw new ForbiddenException('Too many attempts. Try again in 15 minutes.');

  // 2. 获取存储的验证码
  const storedCode = await this.redis.get(`email-verify:${userId}`);
  if (!storedCode) throw new BadRequestException('Verification code expired');

  // 3. 验证
  if (storedCode !== code) {
    // 递增失败计数
    const failKey = `email-verify-fail:${userId}`;
    const failures = await this.redis.incr(failKey);
    await this.redis.expire(failKey, 15 * 60);

    if (failures >= 5) {
      await this.redis.set(lockKey, '1', 'EX', 15 * 60);
      throw new ForbiddenException('Too many attempts. Locked for 15 minutes.');
    }
    throw new BadRequestException('Invalid verification code');
  }

  // 4. 标记已验证
  await this.prisma.user.update({
    where: { id: userId },
    data: { isEmailVerified: true },
  });

  // 5. 清理 Redis
  await this.redis.del(`email-verify:${userId}`, `email-verify-fail:${userId}`);

  return { verified: true };
}
```

### 1.8 权限限制 Guard

```typescript
// auth/guards/email-verified.guard.ts（与现有 jwt-auth.guard.ts 同目录）
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { isEmailVerified: true },
    });
    if (!user?.isEmailVerified) {
      throw new ForbiddenException('Email not verified');
    }
    return true;
  }
}
```

应用到需要限制的 Controller：
- `MessagesController` — 发送消息
- `FriendsController` — 发送好友请求

---

## 客户端实现

### Flutter Mobile

**新建文件：** `apps/mobile/lib/features/auth/pages/verify_email_page.dart`

```dart
class VerifyEmailPage extends ConsumerStatefulWidget {
  // 6 位验证码输入 UI
  // - 6 个独立的 TextField（自动跳转下一个）
  // - 重发按钮（60 秒倒计时）
  // - 验证成功后跳转主页
}
```

**修改文件：**

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/router.dart` | 添加 `/verify-email` 路由 |
| `apps/mobile/lib/features/auth/providers/auth_provider.dart` | 注册成功后检查 `isEmailVerified`，未验证则跳转验证页 |

### Desktop

**新建文件：** `apps/desktop/src/renderer/pages/VerifyEmail.tsx`

```tsx
const VerifyEmail: React.FC = () => {
  // 6 位验证码输入
  // - 6 个 input 框，自动焦点跳转
  // - 重发按钮 + 倒计时
  // - 验证成功后 navigate('/')
};
```

**修改文件：**

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/renderer/App.tsx` | 添加 `/verify-email` 路由 |
| 登录/注册流程 | 注册成功后检查 `isEmailVerified` 字段，决定跳转目标 |

---

## 新增文件汇总

```
# Server
apps/server/src/mail/mail.module.ts
apps/server/src/mail/mail.service.ts
apps/server/src/mail/__tests__/mail.service.spec.ts
apps/server/src/mail/templates/verify-email.hbs
apps/server/src/mail/templates/reset-password.hbs       # 预建，Phase 2 用
apps/server/src/auth/guards/email-verified.guard.ts
apps/server/prisma/migrations/xxx_add_email_verification/migration.sql

# Flutter
apps/mobile/lib/features/auth/pages/verify_email_page.dart

# Desktop
apps/desktop/src/renderer/pages/VerifyEmail.tsx
```

## 修改文件汇总

| 文件 | 变更 |
|------|------|
| `apps/server/prisma/schema.prisma` | User model 添加 `isEmailVerified Boolean @default(false)` |
| `apps/server/src/auth/auth.service.ts` | `register()` 后发验证邮件 + `verifyEmail()` + `generateVerificationCode()` |
| `apps/server/src/auth/auth.controller.ts` | 新增 `verify-email` + `resend-verification` 端点 |
| `apps/server/src/app.module.ts` | 导入 `MailModule` |
| `apps/server/src/messages/messages.controller.ts` | 添加 `@UseGuards(EmailVerifiedGuard)` |
| `apps/server/src/friends/friends.controller.ts` | 添加 `@UseGuards(EmailVerifiedGuard)` |
| `apps/mobile/lib/router.dart` | 添加 `/verify-email` 路由 |
| `apps/mobile/lib/features/auth/providers/auth_provider.dart` | 注册后跳转验证页逻辑 |
| `apps/desktop/src/renderer/App.tsx` | 添加 `/verify-email` 路由 |

---

## 新增依赖

| 包名 | 平台 | 用途 |
|------|------|------|
| `nodemailer` | Server | 邮件发送 |
| `handlebars` | Server | 邮件 HTML 模板引擎 |

---

## 新增 API 端点

| Method | Path | Auth | Rate Limit | 说明 |
|--------|------|------|-----------|------|
| POST | `/api/v1/auth/verify-email` | JWT | 10/min + 5 次失败锁定 | 验证邮箱验证码 |
| POST | `/api/v1/auth/resend-verification` | JWT | 1/min | 重发验证邮件 |

---

## 验收标准

- [x] 注册后收到验证邮件（MailDev http://localhost:1088 可查看）
- [x] 输入正确验证码后 `isEmailVerified` 变为 true
- [x] 错误验证码被拒绝，返回明确错误消息
- [x] 验证码 15 分钟过期后不可用
- [x] 重发验证码限制 1 次/分钟
- [x] 连续 5 次错误验证码后锁定 15 分钟
- [x] 未验证用户无法发送消息（返回 403 + 提示验证邮箱）
- [x] 未验证用户无法发送好友请求
- [x] 已验证用户不受影响
- [x] 注册后返回的 token 为受限权限（未验证状态），验证后解除
- [x] Flutter 验证码页面：6 位输入框 + 自动跳转 + 重发倒计时
- [x] Desktop 验证码页面：同上
- [x] `pnpm build && pnpm test` 通过

---

## 开发环境说明

MailDev 已在 Docker Compose 中配置，无需额外设置：

```yaml
# docker-compose.yaml 中已有
maildev:
  image: maildev/maildev
  container_name: linkingchat-maildev
  ports:
    - "1088:1080"  # Web UI
    - "1033:1025"  # SMTP（宿主机 1033 → 容器 1025）
```

所有发送的验证邮件可在 http://localhost:1088 查看。
