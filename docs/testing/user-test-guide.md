# LinkingChat 用户功能测试手册

> **版本**：Sprint 5 | **更新日期**：2026-03-07
>
> **目标读者**：测试人员 / 产品经理 / 开发者
>
> **测试环境**：本地开发环境（Windows / macOS）

---

## 目录

1. [环境准备](#1-环境准备)
2. [启动服务](#2-启动服务)
3. [账号注册与登录](#3-账号注册与登录)
4. [邮箱验证（Sprint 5 新增）](#4-邮箱验证sprint-5-新增)
5. [忘记密码 / 重置密码（Sprint 5 新增）](#5-忘记密码--重置密码sprint-5-新增)
6. [好友系统](#6-好友系统)
7. [单聊](#7-单聊)
8. [群聊](#8-群聊)
9. [语音消息（Sprint 5 新增）](#9-语音消息sprint-5-新增)
10. [AI 功能：Whisper 智能建议](#10-ai-功能whisper-智能建议)
11. [AI 功能：Draft 草稿审批](#11-ai-功能draft-草稿审批)
12. [AI 功能：Predictive 预测操作](#12-ai-功能predictive-预测操作)
13. [消息撤回](#13-消息撤回)
14. [消息搜索](#14-消息搜索)
15. [远程设备控制](#15-远程设备控制)
16. [Bot 系统](#16-bot-系统)
17. [个人资料](#17-个人资料)
18. [语言切换 / i18n（Sprint 5 新增）](#18-语言切换--i18nsprint-5-新增)
19. [速率限制验证](#19-速率限制验证)
20. [监控端点](#20-监控端点)
21. [已知限制](#21-已知限制)

---

## 1. 环境准备

### 前置条件

| 软件 | 最低版本 | 用途 |
|------|---------|------|
| Node.js | 22+ | 服务端运行时 |
| pnpm | 10+ | 包管理器 |
| Docker Desktop | 最新 | 数据库 + Redis + MinIO |
| Flutter SDK | 3.22+ | 移动端（如需测试） |
| Git | 2.x | 代码管理 |

### 端口一览

| 服务 | 端口 | 用途 |
|------|------|------|
| NestJS API | `3008` | 后端 API + WebSocket |
| PostgreSQL | `5440` | 数据库 |
| Redis | `6387` | 缓存 + WS 适配器 |
| MinIO API | `9008` | 文件存储 |
| MinIO 控制台 | `9009` | 文件存储管理 UI |
| Adminer | `8088` | 数据库管理 UI |
| MailDev | `1088` | 邮件测试 UI |
| Electron Desktop | 自动分配 | 桌面客户端 |

---

## 2. 启动服务

### 步骤 1：启动 Docker 基础设施

```bash
cd D:\myproject\LinkChat_new
pnpm docker:up
```

等待所有容器 healthy（约 10 秒）。验证：

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

应看到 5 个容器全部 Up：
- `linkingchat-postgres` (healthy)
- `linkingchat-redis` (healthy)
- `linkingchat-minio`
- `linkingchat-adminer`
- `linkingchat-maildev` (healthy)

### 步骤 2：数据库迁移

```bash
pnpm db:migrate
```

### 步骤 3：启动服务端

```bash
pnpm dev:server
```

看到 `Application is running on: http://localhost:3008` 即成功。

验证：浏览器打开 http://localhost:3008/api/v1/health ，应返回 `{"status":"ok"}`。

### 步骤 4A：启动桌面客户端

```bash
pnpm dev:desktop
```

Electron 窗口自动弹出。

### 步骤 4B：启动移动端（可选）

```bash
cd apps/mobile
flutter pub get
flutter run
```
**chrome模拟** 
flutter run -d chrome 2>&1 

> **提示**：如在中国大陆，配置 Flutter 国内镜像：
> ```bash
> set PUB_HOSTED_URL=https://pub.flutter-io.cn
> set FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
> ```

### 一键启动（服务端 + 桌面端）

```bash
pnpm dev:all
```

---

## 3. 账号注册与登录

### 3.1 Desktop 端注册

1. 启动 Desktop 客户端后看到登录页面
2. 点击 **"注册"** 链接切换到注册表单
3. 填写：
   - **邮箱**：`alice@test.com`
   - **用户名**：`alice`（3-30 字符，仅字母/数字/下划线）
   - **密码**：`Test1234x`（至少 8 字符）
   - **显示名**：`Alice`
4. 点击 **注册** 按钮
5. **预期结果**：注册成功，进入主界面（邮箱未验证状态，部分功能受限）
6. **Sprint 5 新增**：注册后系统自动发送验证邮件到注册邮箱，可在 MailDev 查看

### 3.2 Mobile 端注册

1. 启动 App 后看到登录页面
2. 切换到注册模式
3. 填写同样信息（建议用不同账号，如 `bob@test.com` / `bob`）
4. 点击注册
5. **预期结果**：注册成功，跳转到邮箱验证页面（6 位验证码输入）

### 3.3 登录

1. 输入已注册的邮箱和密码
2. 点击 **登录**
3. **预期结果**：进入主界面
4. 登录页面底部有 **"忘记密码？"** 链接（Sprint 5 新增）

### 验收标准

- [ ] 用户名格式校验生效（特殊字符被拒绝）
- [ ] 重复邮箱注册被拒绝
- [ ] 登录后能看到聊天列表
- [ ] 注册后系统自动创建 2 个 Bot 会话（Supervisor、Coding Bot）
- [ ] 注册后收到验证邮件（Sprint 5）
- [ ] 登录页有"忘记密码？"入口（Sprint 5）

---

## 4. 邮箱验证（Sprint 5 新增）

> **目的**：确认用户邮箱归属。未验证用户不能发消息、加好友。

### 4.1 查看验证邮件

1. 注册新用户后，打开浏览器访问 **MailDev**：http://localhost:1088
2. **预期结果**：
   - 收件箱中有一封来自 `LinkingChat <noreply@linkingchat.com>` 的邮件
   - 邮件标题："验证您的邮箱 - LinkingChat"
   - 邮件正文包含 **6 位数字验证码**，有效期 15 分钟

### 4.2 Flutter 端验证邮箱

1. 注册完成后自动跳转到 **验证码输入页面**
2. 页面显示 6 个独立输入框
3. 输入 MailDev 中看到的 6 位验证码
4. 输入第一个数字后光标自动跳转到下一个输入框
5. **预期结果**：验证成功，跳转到主界面，功能限制解除

### 4.3 Desktop 端验证邮箱

1. 注册后如果需要验证，会显示验证码输入界面
2. 输入 MailDev 中的 6 位验证码
3. **预期结果**：验证成功，进入正常主界面

### 4.4 重发验证码

1. 在验证码输入页面，等待 60 秒倒计时结束
2. 点击 **"重新发送"** 按钮
3. **预期结果**：
   - MailDev 中收到新的验证邮件（新验证码）
   - 旧验证码失效
   - 重发按钮再次进入 60 秒倒计时

### 4.5 错误验证码

1. 输入错误的 6 位码（如 `000000`）
2. **预期结果**：提示 "Invalid verification code"
3. 连续输入 5 次错误验证码
4. **预期结果**：提示 "Too many attempts. Locked for 15 minutes."

### 4.6 未验证用户功能限制

1. 注册新用户但**不做邮箱验证**
2. 尝试发送消息给好友
3. **预期结果**：返回 403 错误，提示 "Email not verified"
4. 尝试发送好友请求
5. **预期结果**：同样被拒绝

### 4.7 API 方式验证（如客户端 UI 不方便测试）

```bash
# 1. 注册
REGISTER=$(curl -s -X POST http://localhost:3008/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testverify","email":"verify@test.com","password":"Test1234x","displayName":"Test"}')
TOKEN=$(echo $REGISTER | python -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# 2. 去 http://localhost:1088 查看邮件，获取 6 位验证码

# 3. 验证邮箱（替换 CODE 为实际验证码）
curl -X POST http://localhost:3008/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"code":"123456"}'
# 预期：{"verified":true}

# 4. 重发验证码
curl -X POST http://localhost:3008/api/v1/auth/resend-verification \
  -H "Authorization: Bearer $TOKEN"
```

### 验收标准

- [ ] 注册后 MailDev 中收到验证邮件
- [ ] 正确验证码 → 邮箱标记已验证
- [ ] 错误验证码被拒绝
- [ ] 验证码 15 分钟过期后不可用
- [ ] 重发限制 1 次/分钟
- [ ] 连续 5 次错误后锁定 15 分钟
- [ ] 未验证用户不能发消息（403）
- [ ] 未验证用户不能加好友（403）
- [ ] 验证成功后功能恢复正常

---

## 5. 忘记密码 / 重置密码（Sprint 5 新增）

> **目的**：用户忘记密码时通过邮箱验证码重置。

### 5.1 Desktop 端忘记密码

1. 在登录页面，点击 **"Forgot password?"**（或"忘记密码？"）
2. 跳转到忘记密码页面
3. 输入注册时的邮箱地址（如 `alice@test.com`）
4. 点击 **发送验证码**
5. **预期结果**：
   - 页面提示"If that email is registered, a reset code has been sent."
   - MailDev (http://localhost:1088) 收到重置密码邮件，包含 6 位验证码
6. 页面自动跳转到重置密码页面

### 5.2 Desktop 端重置密码

1. 在重置密码页面输入：
   - **验证码**：MailDev 中看到的 6 位码
   - **新密码**：`NewPass1234!`
   - **确认密码**：`NewPass1234!`
2. 点击 **重置密码**
3. **预期结果**：
   - 提示"密码重置成功"
   - 跳转回登录页面
   - 用**新密码**可以正常登录
   - 用**旧密码**登录失败

### 5.3 Flutter 端忘记密码

1. 登录页面 → 点击 **"忘记密码？"**
2. 输入邮箱 → 点击发送
3. MailDev 查看验证码
4. 输入验证码 + 新密码 + 确认密码
5. 点击重置
6. **预期结果**：跳转到登录页，用新密码登录

### 5.4 防枚举攻击验证

1. 输入一个**从未注册过的邮箱**（如 `nobody@test.com`）
2. 点击发送验证码
3. **预期结果**：也返回相同的成功提示"If that email is registered, a reset code has been sent."
4. **注意**：MailDev 中**不会**收到邮件（因为邮箱不存在），但前端看不出区别

### 5.5 重置后所有设备登出

1. 用 Alice 账号在 Desktop 和 Mobile 同时登录
2. 在 Desktop 执行密码重置
3. **预期结果**：Mobile 端被强制登出（refresh token 已失效）

### 5.6 API 方式验证

```bash
# 1. 请求发送重置码
curl -X POST http://localhost:3008/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com"}'
# 预期：{"message":"If that email is registered, a reset code has been sent."}

# 2. 去 http://localhost:1088 查看邮件获取验证码

# 3. 重置密码（替换 CODE）
curl -X POST http://localhost:3008/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","code":"123456","newPassword":"NewPass1234!"}'
# 预期：{"message":"Password reset successfully. Please log in."}

# 4. 用新密码登录
curl -X POST http://localhost:3008/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"NewPass1234!"}'
# 预期：返回 accessToken
```

### 验收标准

- [ ] 登录页双端都有"忘记密码？"入口
- [ ] 输入已注册邮箱 → MailDev 收到重置邮件
- [ ] 输入未注册邮箱 → 也返回成功（防枚举）
- [ ] 正确验证码 + 新密码 → 重置成功
- [ ] 错误验证码被拒绝
- [ ] 验证码 15 分钟过期后不可用
- [ ] 重置后旧密码失效
- [ ] 重置后其他设备被强制登出
- [ ] 限流 3 次/分钟（快速请求第 4 次返回 429）

---

## 6. 好友系统

> **需要两个账号**：在两个设备（或 Desktop + Mobile）分别登录 Alice 和 Bob

### 6.1 添加好友

**Alice 操作**：
1. **Mobile**：点击底部 **通讯录** Tab → 右上角 **+** 图标
2. **Desktop**：聊天列表页 → 找到添加好友入口
3. 搜索 Bob 的用户名（如 `bob`）
4. 点击 **发送好友请求**
5. **预期结果**：提示"请求已发送"

### 6.2 接受好友请求

**Bob 操作**：
1. 进入 **通讯录** 页面
2. 顶部应显示 **待处理请求** 区域
3. 看到来自 Alice 的好友请求
4. 点击 **接受**
5. **预期结果**：
   - Alice 出现在好友列表中
   - 系统自动创建 1 对 1 聊天会话
   - 聊天列表中出现与 Alice 的对话

### 6.3 查看好友列表

1. 进入通讯录页面
2. **预期结果**：显示已添加的好友，包含头像、显示名、在线状态

### 验收标准

- [ ] 好友请求能成功发送
- [ ] 对方能看到并接受/拒绝请求
- [ ] 接受后双方都能看到对方
- [ ] 自动创建 DM 会话

---

## 7. 单聊

> **前提**：Alice 和 Bob 已成为好友

### 7.1 发送消息

**Alice 操作**：
1. 在聊天列表中点击与 Bob 的对话
2. 进入聊天页面
3. 在底部输入框输入 `你好 Bob，这是一条测试消息`
4. 点击发送按钮（或按 Enter）
5. **预期结果**：消息出现在聊天气泡中（右侧 = 自己发的）

### 7.2 接收消息

**Bob 操作**：
1. 打开与 Alice 的对话
2. **预期结果**：看到 Alice 发的消息（左侧气泡 = 对方发的）

### 7.3 消息历史

1. 发送多条消息后
2. 退出聊天页面再重新进入
3. **预期结果**：所有历史消息仍然存在，按时间排序

### 7.4 输入指示器（Typing Indicator）

1. Alice 开始输入文字（不发送）
2. **预期结果（Bob 端）**：在聊天页面底部看到 "Alice 正在输入..." 提示
3. Alice 停止输入约 3 秒后提示消失

### 7.5 已读回执

1. Alice 发送消息给 Bob
2. Bob 打开对话阅读消息
3. **预期结果（Alice 端）**：消息状态显示"已读"

### 验收标准

- [ ] 消息能实时送达
- [ ] 消息气泡方向正确（自己右侧，对方左侧）
- [ ] 历史消息持久化
- [ ] 输入指示器正常工作
- [ ] 已读回执正常更新

---

## 8. 群聊

### 8.1 创建群组

**Alice 操作**：
1. **Mobile**：聊天列表页 → 右下角 FAB 按钮 → 选择"创建群组"
2. **Desktop**：聊天列表页 → 点击创建群组按钮
3. 填写群名称：`测试群组`
4. 选择成员：勾选 Bob
5. 点击 **创建**
6. **预期结果**：
   - 群组出现在聊天列表中
   - Alice 角色 = OWNER
   - Bob 角色 = MEMBER

### 8.2 群消息

1. Alice 在群组中发送消息
2. **预期结果**：所有成员都能看到消息，消息显示发送者名称

### 8.3 群组信息

1. **Mobile**：聊天页面 → 点击顶部群名称
2. **Desktop**：聊天页面 → 点击群组信息图标（打开右侧面板）
3. **预期结果**：
   - 显示群名称、成员列表
   - 显示每个成员的角色（OWNER / ADMIN / MEMBER）
   - OWNER 能看到管理选项

### 验收标准

- [ ] 群组能成功创建
- [ ] 多人能收到群消息
- [ ] 群组信息页显示正确
- [ ] OWNER 有管理权限

---

## 9. 语音消息（Sprint 5 新增）

> **前提**：两个用户已成为好友，且邮箱已验证

### 9.1 Desktop 端录制语音

1. 打开与好友的聊天页面
2. 确保输入框为空（不输入任何文字）
3. 在输入框右侧应看到 **麦克风按钮** 🎤（替代发送按钮）
4. 点击麦克风按钮
5. **预期结果**：
   - 浏览器弹出麦克风权限请求（首次使用时）
   - 允许后进入录制状态：显示红色脉冲动画 + 计时器 `0:00`
   - 看到 **停止** 和 **取消** 按钮
6. 说一段话，然后点击 **停止** 按钮
7. **预期结果**：语音自动上传并发送

### 9.2 Desktop 端取消录制

1. 开始录制后，点击 **取消** 按钮
2. **预期结果**：录制取消，不发送任何消息

### 9.3 Desktop 端播放语音

1. 对方发来语音消息（或自己发的）
2. 聊天气泡中显示 **语音条**：
   - 播放/暂停按钮（三角形 ▶ / 暂停 ⏸）
   - 波形可视化（多个高低不同的竖条）
   - 时长显示（如 `0:12`）
   - 进度滑块
3. 点击 **播放** → 语音开始播放，波形随进度变色
4. 点击 **暂停** → 暂停播放
5. 拖动进度滑块 → 跳转到指定位置

### 9.4 Flutter 端录制语音（长按模式）

1. 打开聊天页面，确保输入框为空
2. 右侧显示麦克风按钮
3. **长按** 麦克风按钮开始录制
4. 屏幕显示录制状态：红色指示 + 计时 + "上滑取消" 提示
5. **松手** → 停止录制并发送

### 9.5 Flutter 端上滑取消

1. 长按麦克风开始录制
2. **手指向上滑动**（超过 100px）
3. 提示变为 "松手取消"
4. **松手** → 录制取消，不发送

### 9.6 Flutter 端播放语音

1. 收到语音消息后，聊天气泡显示语音条
2. 点击播放按钮 → 播放
3. 再次点击 → 暂停
4. 显示波形动画 + 时长

### 9.7 录制时长限制

1. 开始录制后持续录制 **5 分钟**
2. **预期结果**：达到 5 分钟后自动停止录制并发送

### 9.8 跨端互通

1. Desktop 端发送一条语音消息
2. Flutter 端打开同一对话
3. **预期结果**：Flutter 端能看到并播放 Desktop 发的语音消息
4. 反之亦然

### 验收标准

- [ ] Desktop 点击录制 → 停止 → 发送成功
- [ ] Desktop 取消录制 → 不发送
- [ ] Flutter 长按录制 → 松手发送
- [ ] Flutter 上滑取消 → 不发送
- [ ] 语音条显示波形 + 时长
- [ ] 播放/暂停正常工作
- [ ] 进度条可拖拽（Desktop）
- [ ] 5 分钟录制上限自动停止
- [ ] 双端语音消息可互相播放
- [ ] 首次使用弹出麦克风权限请求

---

## 10. AI 功能：Whisper 智能建议

> **原理**：用户在消息中输入 `@ai` 触发 → 服务端调用 LLM 生成建议 → 通过 WebSocket 推送到客户端

### 10.1 触发 Whisper

1. 在任意聊天页面的输入框中输入：`@ai 帮我想一个回复`
2. 点击发送
3. **预期结果**（约 2-3 秒后）：
   - 输入框上方出现 **建议条**
   - 显示 1 条主要建议（chip 样式）
   - 右侧有 `···` 展开按钮 和 `×` 关闭按钮

### 10.2 使用建议

1. 点击主要建议 chip
2. **预期结果**：建议文本自动填入输入框（不会直接发送）
3. 可以编辑后再发送，或直接点发送

### 10.3 查看备选建议

1. 触发 Whisper 后，点击 `···` 按钮
2. **预期结果**：展开显示 2 条备选建议
3. 点击任意一条 → 填入输入框

### 10.4 关闭建议

1. 点击 `×` 按钮
2. **预期结果**：建议条消失

### 10.5 不覆盖已有输入

1. 先在输入框中输入一些文字
2. 此时收到 Whisper 建议
3. **预期结果**：建议条出现，但输入框中的文字不被替换
4. 用户必须主动点击建议才会替换

### 验收标准

- [ ] `@ai` 消息在 3 秒内触发建议
- [ ] 建议条 UI 正确显示
- [ ] 点击建议填入输入框
- [ ] `···` 展开备选建议
- [ ] `×` 关闭建议条
- [ ] 不覆盖已有输入

---

## 11. AI 功能：Draft 草稿审批

> **原理**：Bot 生成草稿 → 用户审核后决定发送/拒绝 → Bot 永远不会自主执行操作

### 11.1 触发 Draft（通过测试端点）

由于 Draft 通常由 Bot 自动生成，测试时可通过 API 手动触发：

```bash
# 获取 token（替换为你的邮箱和密码）
TOKEN=$(curl -s -X POST http://localhost:3008/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"Test1234x"}' | python -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# 获取 Bot ID
BOTS=$(curl -s http://localhost:3008/api/v1/bots -H "Authorization: Bearer $TOKEN")
echo $BOTS

# 触发 Draft（替换 converseId 和 botId）
curl -X POST http://localhost:3008/api/v1/ai/test/draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"converseId":"你的会话ID","botId":"Bot的ID","botName":"Supervisor","draftType":"message","userIntent":"帮我写一条感谢消息"}'
```

### 11.2 Draft 卡片 UI

触发 Draft 后，在聊天页面应看到：

1. **Draft 卡片**出现在消息列表上方
2. 卡片包含：
   - 头部：Bot 头像 + "Draft from Supervisor"
   - 内容：LLM 生成的草稿文本
   - 倒计时：`04:59` 开始倒计时（5 分钟 TTL）
   - 三个按钮：
     - ✓ **Approve**（绿色）— 批准发送
     - ✎ **Edit**（蓝色）— 编辑后发送
     - ✕ **Reject**（红色）— 拒绝

### 11.3 批准草稿

1. 点击 **Approve** 按钮
2. **预期结果**：草稿作为消息发送到聊天中，卡片变为绿色 "Approved" 状态

### 11.4 编辑草稿

1. 点击 **Edit** 按钮
2. **预期结果**：展开内联编辑器，显示草稿内容
3. 修改内容后点击 **Save**
4. **预期结果**：修改后的内容作为消息发送

### 11.5 拒绝草稿

1. 点击 **Reject** 按钮
2. **预期结果**：卡片变为灰色 "Rejected" 状态，不发送任何消息

### 11.6 草稿过期

1. 触发 Draft 后等待 5 分钟不操作
2. **预期结果**：
   - 倒计时归零
   - 卡片变为灰色 "Expired" 状态
   - 三个操作按钮变为不可点击

### 验收标准

- [ ] Draft 卡片正确显示
- [ ] Approve → 消息发送
- [ ] Edit → 编辑后发送
- [ ] Reject → 不发送
- [ ] 5 分钟过期后按钮禁用
- [ ] 倒计时实时更新

---

## 12. AI 功能：Predictive 预测操作

> **原理**：设备命令出错后，Bot 分析错误并推荐修复操作

### 12.1 触发 Predictive（通过测试端点）

```bash
curl -X POST http://localhost:3008/api/v1/ai/test/predictive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"converseId":"你的会话ID","errorOutput":"npm ERR ENOENT no such file or directory"}'
```

### 12.2 操作卡片 UI

触发后聊天页面应显示 **Predictive Action Card**：

1. 头部："Suggested Actions" + 触发描述
2. 操作列表，每个操作包含：
   - 图标 + 描述
   - 命令文本（等宽字体显示）
   - 颜色编码：

| 危险级别 | 颜色 | 点击行为 |
|---------|------|---------|
| `safe` | 绿色 | 点击即执行 |
| `warning` | 黄色 | 弹出确认对话框 |
| `dangerous` | 红色 | 弹出警告对话框 + 强调风险 |

3. 右上角 `×` 按钮关闭卡片

### 12.3 安全操作

1. 点击一个绿色（safe）操作
2. **预期结果**：命令直接发送执行

### 12.4 警告操作

1. 点击一个黄色（warning）操作
2. **预期结果**：弹出确认对话框
3. 点击 **确认** → 执行
4. 点击 **取消** → 不执行

### 12.5 危险操作

1. 点击一个红色（dangerous）操作
2. **预期结果**：弹出明显的警告对话框，包含风险说明
3. 需要二次确认才能执行

### 12.6 关闭卡片

1. 点击右上角 `×`
2. **预期结果**：卡片消失

### 验收标准

- [ ] 操作卡片正确显示
- [ ] 颜色编码正确（绿/黄/红）
- [ ] safe 操作一键执行
- [ ] warning/dangerous 操作需确认
- [ ] 关闭按钮正常工作

---

## 13. 消息撤回

### 13.1 2 分钟内撤回

1. 发送一条消息
2. **在 2 分钟内**，长按（Mobile）或右键（Desktop）该消息
3. 选择 **撤回**
4. **预期结果**：
   - 消息从聊天记录中消失
   - 对方也看不到这条消息

### 13.2 超时撤回（应失败）

1. 发送一条消息
2. 等待 **超过 2 分钟**
3. 尝试撤回
4. **预期结果**：提示"超过撤回时限"或"无法撤回"

### 13.3 管理员撤回（群聊）

1. 作为群主（OWNER）或管理员（ADMIN），在群聊中
2. 对 **他人的消息** 执行撤回
3. **预期结果**：管理员可以撤回任何成员的消息（无时间限制）

### 验收标准

- [ ] 2 分钟内自己的消息可撤回
- [ ] 超时后不可撤回
- [ ] 群管理员可撤回他人消息

---

## 14. 消息搜索

### 14.1 搜索英文消息

1. 在聊天页面中找到搜索入口（如搜索图标）
2. 输入关键词，如 `test`
3. **预期结果**：列出包含 "test" 的消息，关键词高亮显示

### 14.2 搜索中文消息

1. 搜索中文关键词，如 `测试`
2. **预期结果**：找到包含"测试"的消息（使用 ILIKE 备选搜索）

### 14.3 按会话搜索

1. 在特定会话中搜索
2. **预期结果**：只返回该会话内的消息

### 14.4 权限隔离

1. 用 Alice 搜索
2. **预期结果**：只能搜到 Alice 参与的会话中的消息
3. 用 Bob 搜索同样的关键词
4. **预期结果**：只能搜到 Bob 参与的会话中的消息

### API 方式搜索（如客户端搜索 UI 未实现）

```bash
curl "http://localhost:3008/api/v1/messages/search?converseId=会话ID&query=关键词" \
  -H "Authorization: Bearer $TOKEN"
```

### 验收标准

- [ ] 英文全文搜索正常
- [ ] 中文搜索正常（ILIKE fallback）
- [ ] 搜索结果限定在指定会话
- [ ] 不同用户只能搜到自己有权限的消息

---

## 15. 远程设备控制

> **需要**：同时运行 Desktop 客户端 + Mobile（或另一个 Desktop）

### 15.1 设备注册

1. 启动 Desktop 客户端并登录
2. Desktop 自动通过 WebSocket 注册为设备
3. **Mobile 端**：进入 **设备** Tab
4. **预期结果**：看到已注册的桌面设备，状态为 "在线"（绿色）

### 15.2 发送远程命令

1. **Mobile**：点击在线设备 → 进入命令页面
2. 输入命令：`echo hello world`
3. 点击发送
4. **预期结果**：
   - Desktop 执行命令
   - 执行结果返回并显示在 Mobile 上
   - 延迟应 < 3 秒

### 15.3 危险命令拦截

1. 尝试发送危险命令：`rm -rf /` 或 `format C:`
2. **预期结果**：命令被黑名单拦截，显示警告，不执行

### 15.4 设备离线

1. 关闭 Desktop 客户端
2. **Mobile**：刷新设备列表
3. **预期结果**：设备状态变为 "离线"（灰色）

### 验收标准

- [ ] Desktop 自动注册为设备
- [ ] Mobile 能看到设备列表
- [ ] 命令能远程执行并返回结果
- [ ] 危险命令被拦截
- [ ] 离线状态正确显示

---

## 16. Bot 系统

### 16.1 默认 Bot

1. 注册新账号后，进入聊天列表
2. **预期结果**：看到 2 个 Bot 会话（置顶）
   - **Supervisor**（系统管家）— 聚合通知 + 智能助手
   - **Coding Bot**（编程助手）— 代码相关任务

### 16.2 Bot 对话

1. 点击 Supervisor 会话
2. 发送消息（如 `hello`）
3. **预期结果**：Bot 显示为特殊标识（Bot 徽章），消息正常发送

### 16.3 Notification Card

1. 当其他 Bot 触发事件时，Supervisor 会收到通知卡片
2. **预期结果**：在 Supervisor 聊天中看到 NotificationCard 格式的系统消息

### 验收标准

- [ ] 注册后自动创建 2 个 Bot
- [ ] Bot 会话显示 Bot 标识
- [ ] Bot 会话在列表中置顶

---

## 17. 个人资料

### 17.1 查看个人资料

1. **Mobile**：底部 Tab → **我的**
2. **Desktop**：点击左侧头像或导航到 Profile
3. **预期结果**：显示头像、显示名、用户名（@handle）、邮箱

### 17.2 修改显示名

1. 点击显示名区域的编辑按钮
2. 修改为新名称
3. 保存
4. **预期结果**：显示名立即更新，其他用户也能看到新名称

### 17.3 在线状态

1. **Desktop**：在 Profile 页面选择状态
   - 🟢 ONLINE — 在线
   - 🟡 IDLE — 空闲
   - 🔴 DND — 勿扰
   - ⚫ OFFLINE — 离线
2. **预期结果**：状态立即更新，好友能看到新状态

### 17.4 退出登录

1. 点击 **退出登录** 按钮
2. **预期结果**：弹出确认对话框
3. 确认后返回登录页面

### 验收标准

- [ ] 个人信息正确显示
- [ ] 显示名可修改
- [ ] 状态切换正常
- [ ] 退出登录正常

---

## 18. 语言切换 / i18n（Sprint 5 新增）

> **目的**：支持中英双语切换，所有 UI 文本即时更新，语言偏好持久化。

### 18.1 Desktop 端语言切换

1. 登录后点击左侧导航 → 进入 **个人资料** 页面
2. 找到 **"语言 / Language"** 设置项
3. 当前显示 "中文"（默认）
4. 点击该设置项 → 展开语言选择菜单
5. 选择 **"English"**
6. **预期结果**：
   - 页面上所有文本立即变为英文（"昵称" → "Nickname"，"退出登录" → "Log Out" 等）
   - 语言设置项显示 "English"
7. 刷新页面（Ctrl+R）
8. **预期结果**：语言仍然是 English（localStorage 持久化）

### 18.2 Desktop 端切回中文

1. 在英文界面下，进入 Profile 页面
2. 点击 "Language" → 选择 **"中文"**
3. **预期结果**：所有文本立即切回中文

### 18.3 Flutter 端语言切换

1. 打开 App → 进入 **个人资料**（底部 Tab "我的"）
2. 找到 **"语言"** 设置项
3. 点击 → 弹出底部选择器
4. 选择 **"English"**
5. **预期结果**：
   - 个人资料页所有文本变为英文
   - 底部 Tab 标签可能保持中文（部分页面尚未完成 i18n 替换，见已知限制）
6. 关闭 App 重新打开
7. **预期结果**：语言设置保持 English（SharedPreferences 持久化）

### 18.4 默认语言跟随系统

1. 将系统语言设置为英文
2. 首次启动 App / Desktop（清除 localStorage/SharedPreferences）
3. **预期结果**：App 默认显示英文

### 18.5 API 错误消息跟随语言

1. 切换为 English 后，触发一个服务端错误（如发送空消息）
2. **预期结果**：错误提示为英文（服务端根据 Accept-Language 头返回对应语言）

### 验收标准

- [ ] Desktop 语言切换即时生效
- [ ] Flutter 语言切换即时生效
- [ ] 刷新/重启后语言设置保持
- [ ] 默认跟随系统语言
- [ ] 中英双语翻译无缺失 key（无 t('xxx') 原始 key 显示）

---

## 19. 速率限制验证

> 速率限制使用 `@nestjs/throttler`，按 IP 限制

| 操作 | 限制 | 验证方法 |
|------|------|---------|
| 登录 | 5 次/分钟 | 连续登录 6 次，第 6 次应返回 429 |
| 注册 | 5 次/分钟 | 连续注册 6 次 |
| 发消息 | 30 条/分钟 | 快速发送 31 条消息 |
| 搜索 | 20 次/分钟 | 快速搜索 21 次 |
| 上传 | 20 次/分钟 | 快速上传请求 21 次 |
| 忘记密码 | 3 次/分钟 | 快速请求 4 次（Sprint 5） |
| 重置密码 | 5 次/分钟 | 快速请求 6 次（Sprint 5） |
| 重发验证码 | 1 次/分钟 | 快速请求 2 次（Sprint 5） |
| 邮箱验证码错误 | 5 次后锁定 15 分钟 | 连续输错 5 次（Sprint 5） |
| 全局默认 | 100 次/分钟 | 其他 API |

### 验证方法

```bash
# 快速登录 6 次
for i in $(seq 1 6); do
  echo "Attempt $i: $(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3008/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@test.com","password":"Test1234x"}')"
done
# 预期：前 5 次 200/201，第 6 次 429
```

### 验收标准

- [ ] 超频请求返回 HTTP 429
- [ ] 等待 1 分钟后限制重置
- [ ] 不同端点有不同限制

---

## 20. 监控端点

### 20.1 健康检查

- URL：http://localhost:3008/api/v1/health
- **预期返回**：`{"status":"ok","timestamp":"..."}`

### 20.2 AI 健康检查

- URL：http://localhost:3008/api/v1/ai/health
- **预期返回**：LLM 配置信息和连接状态

### 20.3 Prometheus 指标

- URL：http://localhost:3008/api/v1/metrics
- **预期返回**：Prometheus 格式文本，包含：
  - `http_request_duration_seconds` — HTTP 请求延迟
  - `http_requests_total` — HTTP 请求总数
  - `ws_connections_active` — 活跃 WebSocket 连接数
  - `messages_sent_total` — 消息发送总数
  - `llm_requests_total` — LLM 调用次数
  - `llm_latency_seconds` — LLM 调用延迟
  - `process_cpu_*` — Node.js 进程指标

### 20.4 数据库管理

- URL：http://localhost:8088
- 系统：PostgreSQL
- 服务器：`linkingchat-postgres`
- 用户名：`linkingchat`
- 密码：`linkingchat_dev`
- 数据库：`linkingchat`

### 验收标准

- [ ] Health 端点返回 OK
- [ ] Metrics 端点返回 Prometheus 格式数据
- [ ] Adminer 能连接并查看数据库

---

## 21. 已知限制

| 功能 | 状态 | 说明 |
|------|------|------|
| 富媒体消息（图片/文件） | ✅ 已实现 | 预签名上传 + 客户端渲染 |
| 语音消息 | ✅ 已实现（Sprint 5） | Desktop 完整实现；Flutter 需添加 `record`/`audioplayers` 包后完整可用 |
| i18n 语言切换 | ✅ 已实现（Sprint 5） | 双端个人资料页已完成；其他页面的硬编码文本替换后续迭代 |
| 邮箱验证 | ✅ 已实现（Sprint 5） | 注册后验证 + 未验证用户功能限制 |
| 忘记/重置密码 | ✅ 已实现（Sprint 5） | 邮箱验证码方式 + 防枚举 |
| 消息搜索客户端 UI | 部分实现 | Desktop 有搜索面板，Mobile 可通过 API 搜索 |
| Flutter i18n 全量替换 | 部分完成 | 个人资料页已完成，聊天/登录等页面部分完成 |
| Desktop i18n 全量替换 | 部分完成 | 个人资料页已完成，其他页面部分完成 |
| Flutter 语音包依赖 | 待配置 | `record` + `audioplayers` 需添加到 pubspec.yaml 并配置平台权限 |
| 推送通知 | 推迟至 v2.0 | — |
| 语音/视频通话 | 不在 MVP 范围 | — |
| Desktop + Mobile 同时在线 | 支持 | 通过 Redis Pub/Sub 消息同步 |
| 横向扩展 | 基础就绪 | Redis adapter 已配置，多实例测试推迟 |

---

## 快速冒烟测试清单

> 10 分钟内快速验证核心功能是否可用

- [ ] 1. `pnpm docker:up` → 5 容器全部 Up
- [ ] 2. `pnpm dev:server` → health 返回 OK
- [ ] 3. 注册新用户 → MailDev 收到验证邮件
- [ ] 4. 输入验证码 → 邮箱验证成功
- [ ] 5. 看到 Supervisor + Coding Bot 两个默认会话
- [ ] 6. 第二个账号注册 + 验证 → 添加好友 → 接受
- [ ] 7. 发送消息 → 对方收到
- [ ] 8. 发送 `@ai 帮我想一个回复` → 建议条出现
- [ ] 9. 撤回刚发的消息 → 消息消失
- [ ] 10. Desktop 聊天输入框（空文本）→ 显示麦克风按钮
- [ ] 11. 个人资料页 → 切换语言为 English → UI 文本变英文
- [ ] 12. 登录页 → 点击"忘记密码？"→ 进入忘记密码页面
- [ ] 13. http://localhost:3008/api/v1/metrics → 看到指标数据
- [ ] 14. 连续登录 6 次 → 第 6 次返回 429

---

## 故障排查

| 现象 | 可能原因 | 解决方案 |
|------|---------|---------|
| 服务器启动失败 | Docker 容器未启动 | `pnpm docker:up` |
| 数据库连接失败 | PG 容器未 healthy | `docker logs linkingchat-postgres` |
| WebSocket 连接失败 | Redis 未启动 | `docker logs linkingchat-redis` |
| AI 功能不触发 | API Key 未配置 | 检查 `apps/server/.env` 中的 `DEEPSEEK_API_KEY` |
| @ai 无响应 | LLM API 超时/限流 | 查看服务器日志中的 LLM 错误 |
| 搜索返回 500 | 迁移未应用 | `cd apps/server && npx prisma migrate deploy` |
| 429 Too Many Requests | 速率限制触发 | 等待 1 分钟后重试 |
| Flutter `pub get` 失败 | 国内网络问题 | 配置 Flutter 国内镜像 |
| Desktop 白屏 | 编译错误 | 检查 `pnpm build` 输出 |
| 消息发送失败 401 | Token 过期 | 重新登录获取新 Token |
| 验证邮件未收到 | MailDev 未启动或 SMTP 端口错误 | 确认 `docker ps` 中 linkingchat-maildev 运行中，SMTP 端口 1033 |
| 发消息返回 403 | 邮箱未验证 | 完成邮箱验证后重试 |
| 语音录制无反应 | 麦克风权限未授予 | 检查浏览器/系统麦克风权限设置 |
| 语言切换不生效 | 缓存问题 | 清除 localStorage（Desktop）或 SharedPreferences（Flutter）后重试 |
| 忘记密码无邮件 | 邮箱未注册 | 设计如此（防枚举），确认邮箱已注册 |
