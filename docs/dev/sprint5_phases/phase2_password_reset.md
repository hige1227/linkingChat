# Sprint 5 — Phase 2: 忘记密码 / 重置密码

> **状态**：✅ 已完成（2026-03-07）
>
> **优先级**：P0（账号安全基础功能）
>
> **预估工作量**：2 天
>
> **前置条件**：Phase 1（邮箱验证）完成 — 复用 MailModule 基础设施
>
> **参考**：[sprint5_plan.md](../sprint5_plan.md) Phase 2

---

## 目标

解决"用户忘记密码后无任何恢复手段，等同于永久丢失账号"的问题。通过邮箱验证码重置密码，重置后所有旧 session 失效。

---

## 设计方案

```
忘记密码页面 → 输入邮箱 → 发送重置邮件（含 6 位验证码）
            → 输入验证码 + 新密码 → 密码更新 → 所有 refresh token 失效 → 跳转登录
```

**关键安全设计：**
- 无论邮箱是否存在都返回相同响应（防邮箱枚举攻击）
- 验证码 6 位数字，15 分钟过期
- Redis 存储，key: `pwd-reset:{email}`（注意：这里用 email 不用 userId，因为用户可能未登录）
- 重置成功后**所有** refresh token 失效（强制重新登录）
- 限流 3 次/分钟

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 2.1 | 忘记密码端点 | `POST /api/v1/auth/forgot-password` | Phase 1 MailModule | ✅ |
| 2.2 | 重置密码端点 | `POST /api/v1/auth/reset-password` | 2.1 | ✅ |
| 2.3 | 验证码存储 | Redis key: `pwd-reset:{email}` | — | ✅ |
| 2.4 | 安全措施 | 防枚举 + token 失效 | 2.2 | ✅ |
| 2.5 | 邮件模板 | `reset-password.hbs` | Phase 1 创建骨架文件，本 Phase 填充实际内容 | ✅ |
| 2.6 | Flutter UI — 忘记密码页 | 输入邮箱 → 发送验证码 | 2.1 | ✅ |
| 2.7 | Flutter UI — 重置密码页 | 输入验证码 + 新密码 → 重置 | 2.2 | ✅ |
| 2.8 | Desktop UI — 忘记密码页 | 同上 | 2.1 | ✅ |
| 2.9 | Desktop UI — 重置密码页 | 同上 | 2.2 | ✅ |
| 2.10 | 限流配置 | `@Throttle` 3 次/分钟 | 2.1 | ✅ |
| 2.11 | 单元测试 | forgot-password + reset-password 测试 | 2.1-2.4 | ✅ |

---

## 后端实现

### 2.1 忘记密码端点

```typescript
// auth.controller.ts
@Post('forgot-password')
@Throttle({ default: { ttl: 60000, limit: 3 } })
async forgotPassword(@Body() body: { email: string }) {
  return this.authService.forgotPassword(body.email);
}
```

```typescript
// auth.service.ts
async forgotPassword(email: string) {
  const user = await this.prisma.user.findUnique({ where: { email } });

  // ⚠️ 无论用户是否存在都返回相同响应（防枚举）
  if (user) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(`pwd-reset:${email}`, code, 'EX', 15 * 60);
    await this.mailService.sendPasswordResetEmail(email, code);
  }

  return { message: 'If that email is registered, a reset code has been sent.' };
}
```

### 2.2 重置密码端点

```typescript
// auth.controller.ts
@Post('reset-password')
@Throttle({ default: { ttl: 60000, limit: 5 } })
async resetPassword(@Body() body: { email: string; code: string; newPassword: string }) {
  return this.authService.resetPassword(body.email, body.code, body.newPassword);
}
```

```typescript
// auth.service.ts
async resetPassword(email: string, code: string, newPassword: string) {
  // 1. 验证 code
  const storedCode = await this.redis.get(`pwd-reset:${email}`);
  if (!storedCode || storedCode !== code) {
    throw new BadRequestException('Invalid or expired reset code');
  }

  // 2. 查找用户
  const user = await this.prisma.user.findUnique({ where: { email } });
  if (!user) throw new BadRequestException('Invalid or expired reset code');

  // 3. 更新密码（项目使用 argon2，不是 bcrypt）
  const hashedPassword = await argon2.hash(newPassword);
  await this.prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  // 4. 清除所有 refresh tokens（强制重新登录）
  await this.prisma.refreshToken.deleteMany({
    where: { userId: user.id },
  });

  // 5. 清理 Redis
  await this.redis.del(`pwd-reset:${email}`);

  return { message: 'Password reset successfully. Please log in.' };
}
```

### 2.5 邮件模板

Phase 1 中创建了 `apps/server/src/mail/templates/reset-password.hbs` 骨架文件，此处填充实际模板内容：

```handlebars
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1976D2;">重置密码 - LinkingChat</h2>
  <p>您正在重置 LinkingChat 账号密码。请使用以下验证码：</p>
  <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1976D2;">{{code}}</span>
  </div>
  <p>验证码有效期 {{expiresIn}}。如非本人操作，请忽略此邮件。</p>
  <p style="color: #999; font-size: 12px;">LinkingChat Team</p>
</body>
</html>
```

---

## 客户端实现

### Flutter Mobile

**新建文件：**

| 文件 | 说明 |
|------|------|
| `apps/mobile/lib/features/auth/pages/forgot_password_page.dart` | 输入邮箱 → 发送验证码 |
| `apps/mobile/lib/features/auth/pages/reset_password_page.dart` | 输入验证码 + 新密码 → 重置 |

**ForgotPasswordPage 核心逻辑：**

```dart
class ForgotPasswordPage extends StatefulWidget {
  // Step 1: 输入邮箱
  // - TextField + "发送验证码" 按钮
  // - 发送成功后 Navigator.push → ResetPasswordPage(email)
  // - 60 秒倒计时防重复点击
}
```

**ResetPasswordPage 核心逻辑：**

```dart
class ResetPasswordPage extends StatefulWidget {
  final String email;

  // Step 2: 输入验证码 + 新密码
  // - 6 位验证码输入
  // - 新密码 + 确认密码
  // - 密码强度指示器（可选）
  // - "重置密码" 按钮
  // - 成功后跳转登录页
}
```

**修改文件：**

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/router.dart` | 添加 `/forgot-password`, `/reset-password` 路由 |
| `apps/mobile/lib/features/auth/pages/login_page.dart` | 添加"忘记密码？"链接，点击跳转 ForgotPasswordPage |

### Desktop

**新建文件：**

| 文件 | 说明 |
|------|------|
| `apps/desktop/src/renderer/pages/ForgotPassword.tsx` | 输入邮箱 → 发送验证码 |
| `apps/desktop/src/renderer/pages/ResetPassword.tsx` | 输入验证码 + 新密码 → 重置 |

**修改文件：**

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/renderer/App.tsx` | 添加 `/forgot-password`, `/reset-password` 路由 |
| `apps/desktop/src/renderer/pages/Login.tsx` | 添加"忘记密码？"链接 |

---

## 新增文件汇总

```
# Flutter
apps/mobile/lib/features/auth/pages/forgot_password_page.dart
apps/mobile/lib/features/auth/pages/reset_password_page.dart

# Desktop
apps/desktop/src/renderer/pages/ForgotPassword.tsx
apps/desktop/src/renderer/pages/ResetPassword.tsx
```

## 修改文件汇总

| 文件 | 变更 |
|------|------|
| `apps/server/src/auth/auth.controller.ts` | 新增 `forgot-password` + `reset-password` 端点 |
| `apps/server/src/auth/auth.service.ts` | `forgotPassword()` + `resetPassword()` 方法 |
| `apps/server/src/mail/mail.service.ts` | `sendPasswordResetEmail()` 方法 |
| `apps/server/src/mail/templates/reset-password.hbs` | 填充实际模板内容 |
| `apps/mobile/lib/router.dart` | 添加 `/forgot-password`, `/reset-password` 路由 |
| `apps/mobile/lib/features/auth/pages/login_page.dart` | 添加"忘记密码？"链接 |
| `apps/desktop/src/renderer/App.tsx` | 添加路由 |
| `apps/desktop/src/renderer/pages/Login.tsx` | 添加"忘记密码？"链接 |

---

## 新增 API 端点

| Method | Path | Auth | Rate Limit | 说明 |
|--------|------|------|-----------|------|
| POST | `/api/v1/auth/forgot-password` | 无需 | 3/min | 发送密码重置邮件 |
| POST | `/api/v1/auth/reset-password` | 无需 | 5/min | 重置密码 |

---

## 验收标准

- [x] 登录页有"忘记密码？"入口（双端）
- [x] 输入已注册邮箱 → 收到重置邮件（MailDev 可查看）
- [x] 输入未注册邮箱 → 也返回成功消息（防枚举攻击）
- [x] 正确验证码 + 新密码 → 密码更新成功
- [x] 错误验证码被拒绝
- [x] 验证码 15 分钟过期后不可用
- [x] 重置后所有旧 refresh token 失效（其他设备被强制登出）
- [x] 可用新密码正常登录
- [x] 限流 3 次/分钟
- [x] Flutter 两步页面流程正常（邮箱 → 验证码+密码）
- [x] Desktop 两步页面流程正常
- [x] `pnpm build && pnpm test` 通过
