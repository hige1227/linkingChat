# LinkingChat 剩余功能测试手册

> **版本**：Sprint 5 补充测试 | **创建日期**：2026-03-11
>
> **说明**：本文档覆盖 `user-test-guide.md` 中尚未实际测试的功能（§9, §13-20）。
> 已完成的功能测试见 `docs/realtest/` 目录。
>
> **测试环境**：
> - Desktop: Electron + React（登录 **ice** 用户，`ice@test.com` / `Test1234x`）
> - Mobile: Flutter Chrome（登录 **frank** 用户，`frank@test.com` / `Test1234x`）
> - Server: NestJS `pnpm dev:server`（localhost:3008）
> - Docker: PostgreSQL:5440, Redis:6387, MinIO:9008, MailDev:1088
>
> **已测试功能**（不在本文档范围）：
> - 3/8：环境启动、注册登录、基础连通性
> - 3/9：Flutter Mobile 首次启动
> - 3/10：Whisper 耳语建议（7 个 bug 修复）
> - 3/11：Draft 草稿审批 + Predictive 预测操作（7 个 bug 修复）

---

## 目录

1. [消息撤回](#1-消息撤回) 🔴 关键
2. [消息搜索](#2-消息搜索) 🔴 关键
3. [语音消息](#3-语音消息) 🔴 关键
4. [个人资料](#4-个人资料) 🟢 低优先
5. [语言切换 / i18n](#5-语言切换--i18n) 🟢 低优先
6. [速率限制验证](#6-速率限制验证) 🟢 低优先
7. [监控端点](#7-监控端点) 🟢 低优先
8. [远程设备控制](#8-远程设备控制) 🟡 复杂
9. [Bot 系统](#9-bot-系统) 🟡 复杂

---

## 1. 消息撤回

> **对应 user-test-guide §13**
>
> **原理**：用户发送消息后 2 分钟内可撤回。群管理员可撤回任何人的消息（无时间限制）。
> 撤回通过 REST API `DELETE /api/v1/messages/:id` 实现，服务端软删除（设置 deletedAt）+ WS 广播。

### 1.1 Desktop 端撤回（2 分钟内）

**准备**：Desktop(ice) 和 Mobile(frank) 都进入同一 DM 对话

1. **Desktop(ice)**：发送一条消息，如 `这条消息将被撤回`
2. 确认 Mobile(frank) 端能看到这条消息
3. **Desktop(ice)**：右键点击刚发的消息（或找到撤回入口）
4. 选择 **撤回 / Recall**
5. **验证**：
   - [ ] ice 端消息消失或变为"消息已撤回"
   - [ ] frank 端该消息也消失或变为"消息已撤回"

### 1.2 Mobile 端撤回（2 分钟内）

1. **Mobile(frank)**：发送一条消息
2. **长按**该消息 → 弹出操作菜单
3. 选择 **撤回 / Recall**
4. **验证**：
   - [ ] frank 端消息消失
   - [ ] ice 端该消息也消失

### 1.3 超时撤回（应失败）

**方法 A（API 直接测试，推荐）**：

```bash
# 1. ice 发送一条消息
TOKEN=$(curl -s -X POST http://localhost:3008/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ice@test.com","password":"Test1234x"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).accessToken))")

MSG=$(curl -s -X POST http://localhost:3008/api/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"converseId":"cmmiv539c000lgdz8rv0ut8xd","content":"测试超时撤回"}')
MSG_ID=$(echo $MSG | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).id))")

# 2. 修改 createdAt 为 3 分钟前（模拟超时）
cd apps/server && npx prisma db execute --stdin <<SQL
UPDATE "Message" SET "createdAt" = NOW() - INTERVAL '3 minutes' WHERE id = '$MSG_ID';
SQL

# 3. 尝试撤回
curl -s -X DELETE "http://localhost:3008/api/v1/messages/$MSG_ID" \
  -H "Authorization: Bearer $TOKEN"
# 预期：400 或 403，提示"超过撤回时限"
```

**方法 B（等待 2 分钟）**：发送消息 → 等 2 分钟 → 尝试撤回 → 应失败

**验证**：
- [ ] 超过 2 分钟后撤回被拒绝

### 1.4 群管理员撤回他人消息

**前提**：ice 是群主，frank 是群成员

1. **frank** 在群聊中发送一条消息
2. **ice**（群主）对 frank 的消息执行撤回
3. **验证**：
   - [ ] 群主可以撤回成员消息（无时间限制）
   - [ ] 所有群成员看到消息被撤回

### 验收标准

- [ ] 2 分钟内自己的消息可撤回
- [ ] 撤回后双方 UI 同步更新
- [ ] 超时后撤回被拒绝
- [ ] 群管理员可撤回他人消息

---

## 2. 消息搜索

> **对应 user-test-guide §14**
>
> **原理**：PostgreSQL 全文检索（`to_tsvector` + `ts_rank`），中文使用 ILIKE 降级。
> Desktop 有 SearchPanel（Ctrl+F），Mobile 有 SearchPage。
> API: `GET /api/v1/messages/search?converseId=xxx&query=xxx`

### 2.1 Desktop 搜索（Ctrl+F）

1. **Desktop(ice)**：进入与 frank 的对话
2. 按 **Ctrl+F** 打开搜索面板
3. 输入英文关键词，如 `hello`（前提：对话中有 hello）
4. **验证**：
   - [ ] 搜索面板出现
   - [ ] 搜索结果列出包含 hello 的消息
   - [ ] 点击结果跳转到对应消息

### 2.2 中文搜索

1. 搜索中文关键词，如 `测试`
2. **验证**：
   - [ ] 返回包含"测试"的消息（ILIKE 降级搜索）

### 2.3 Mobile 搜索

1. **Mobile(frank)**：进入聊天页面
2. 点击顶部 **搜索图标** 🔍
3. 进入 SearchPage，输入关键词
4. **验证**：
   - [ ] 搜索结果正确显示

### 2.4 权限隔离（API 验证）

```bash
# ice 搜索
TOKEN_ICE=$(curl -s -X POST http://localhost:3008/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ice@test.com","password":"Test1234x"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).accessToken))")

curl -s "http://localhost:3008/api/v1/messages/search?query=hello" \
  -H "Authorization: Bearer $TOKEN_ICE"
# 预期：只返回 ice 参与的会话中的消息

# frank 搜索同样关键词
TOKEN_FRANK=$(curl -s -X POST http://localhost:3008/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"frank@test.com","password":"Test1234x"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).accessToken))")

curl -s "http://localhost:3008/api/v1/messages/search?query=hello" \
  -H "Authorization: Bearer $TOKEN_FRANK"
# 预期：只返回 frank 参与的会话中的消息
```

### 验收标准

- [ ] Desktop Ctrl+F 搜索面板正常工作
- [ ] Mobile 搜索页面正常工作
- [ ] 英文全文搜索正确
- [ ] 中文搜索正确（ILIKE fallback）
- [ ] 不同用户搜索结果隔离

---

## 3. 语音消息

> **对应 user-test-guide §9**
>
> **原理**：录制音频 → 上传到 MinIO (S3) → 发送消息含 attachment (mimeType: audio/*) → 播放端拉取。
> Desktop 使用 MediaRecorder API + Web Audio API 波形可视化。
> Flutter 需要 `record` + `audioplayers` 包。
>
> ⚠️ **注意**：Flutter Chrome 模式可能不支持 `record` 包的音频录制。Desktop Electron 应支持。

### 3.1 Desktop 端录制

1. **Desktop(ice)**：进入与 frank 的对话
2. 确保输入框为空（不输入文字）
3. 输入框右侧应显示 **麦克风按钮** 🎤
4. 点击麦克风按钮
5. **验证**：
   - [ ] 浏览器弹出麦克风权限请求（首次）
   - [ ] 允许后进入录制状态：红色脉冲 + 计时器
   - [ ] 显示"停止"和"取消"按钮
6. 说一段话 → 点击 **停止**
7. **验证**：
   - [ ] 语音自动上传并发送
   - [ ] 聊天中出现语音条（播放按钮 + 波形 + 时长）

### 3.2 Desktop 端取消录制

1. 开始录制 → 点击 **取消**
2. **验证**：
   - [ ] 录制取消，不发送消息

### 3.3 Desktop 端播放

1. 点击语音消息的 **播放** 按钮
2. **验证**：
   - [ ] 语音开始播放
   - [ ] 波形进度条随播放推进
   - [ ] 点击暂停 → 暂停播放
   - [ ] 拖动进度条 → 跳转

### 3.4 跨端播放

1. Desktop(ice) 发送语音消息
2. Mobile(frank) 打开同一对话
3. **验证**：
   - [ ] Mobile 端能看到语音消息气泡
   - [ ] 能播放 Desktop 发的语音

### 3.5 Flutter 端录制（如可用）

> Flutter Chrome 模式可能不支持录音。如遇问题记录为已知限制。

1. **Mobile(frank)**：输入框为空时应显示麦克风按钮
2. **长按**麦克风按钮
3. **验证**：
   - [ ] 进入录制状态
   - [ ] 松手 → 发送
   - [ ] 上滑 → 取消

### 验收标准

- [ ] Desktop 录制 + 发送正常
- [ ] Desktop 取消录制正常
- [ ] Desktop 播放 + 暂停 + 进度条正常
- [ ] Desktop 发的语音 Mobile 能播放
- [ ] Mobile 录制/播放（如平台支持）

---

## 4. 个人资料

> **对应 user-test-guide §17**

### 4.1 查看个人资料

1. **Desktop**：点击左下角头像/Profile 图标
2. **Mobile**：底部 Tab → "我的"
3. **验证**：
   - [ ] 显示正确的用户名（@ice / @frank）
   - [ ] 显示 displayName
   - [ ] 显示邮箱

### 4.2 修改显示名

1. 点击编辑/修改按钮
2. 修改 displayName
3. 保存
4. **验证**：
   - [ ] 显示名立即更新
   - [ ] 对方（另一端）也能看到新名称

### 4.3 在线状态切换

1. **Desktop**：Profile 页面切换状态 (ONLINE/IDLE/DND/OFFLINE)
2. **验证**：
   - [ ] 状态更新成功
   - [ ] 好友列表中状态图标变化

### 4.4 退出登录

1. 点击"退出登录"
2. **验证**：
   - [ ] 弹出确认对话框
   - [ ] 确认后返回登录页

### 验收标准

- [ ] 个人信息正确显示
- [ ] displayName 可修改
- [ ] 状态切换正常
- [ ] 退出登录正常

---

## 5. 语言切换 / i18n

> **对应 user-test-guide §18**

### 5.1 Desktop 语言切换

1. Profile 页面 → 找到"语言 / Language"设置
2. 切换为 **English**
3. **验证**：
   - [ ] 页面文本立即变英文
   - [ ] 刷新后语言保持（localStorage 持久化）
4. 切回 **中文**
5. **验证**：
   - [ ] 文本恢复中文

### 5.2 Mobile 语言切换

1. "我的" → 语言设置 → 选择 **English**
2. **验证**：
   - [ ] 文本变英文
   - [ ] 关闭重开后保持

### 验收标准

- [ ] 双端语言切换即时生效
- [ ] 持久化正常
- [ ] 无缺失翻译 key

---

## 6. 速率限制验证

> **对应 user-test-guide §19**

### 快速验证（API 方式）

```bash
# 快速登录 6 次，第 6 次应返回 429
for i in $(seq 1 6); do
  echo "Attempt $i: $(curl -s -o /dev/null -w '%{http_code}' \
    -X POST http://localhost:3008/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"ice@test.com","password":"Test1234x"}')"
done
```

### 验收标准

- [ ] 第 6 次登录返回 429
- [ ] 等 1 分钟后恢复
- [ ] 测试中已意外触发过 429（2026-03-10 调试期间），确认机制可用

---

## 7. 监控端点

> **对应 user-test-guide §20**

### 快速验证

```bash
# 健康检查
curl -s http://localhost:3008/api/v1/health
# 预期：{"status":"ok","timestamp":"..."}

# AI 健康检查
curl -s http://localhost:3008/api/v1/ai/health
# 预期：{"status":"ok","providers":["deepseek","kimi"]}

# Prometheus 指标
curl -s http://localhost:3008/api/v1/metrics | head -20
# 预期：# HELP ... / # TYPE ... / http_request_duration_seconds...

# Adminer（浏览器打开）
# http://localhost:8088 → 登录 PostgreSQL
```

### 验收标准

- [ ] /health 返回 OK
- [ ] /metrics 返回 Prometheus 格式
- [ ] Adminer 可连接

---

## 8. 远程设备控制

> **对应 user-test-guide §15**
>
> ⚠️ 需要 Desktop 端完整运行（不只是 renderer），且 OpenClaw Gateway 或 fallback shell exec 可用。

### 8.1 设备注册

1. Desktop(ice) 登录后自动注册为设备
2. Mobile(frank) 进入"设备" Tab
3. **验证**：
   - [ ] 看到 ice 的桌面设备，状态"在线"

### 8.2 远程命令执行

1. Mobile 点击在线设备 → 输入 `echo hello world`
2. **验证**：
   - [ ] Desktop 执行命令
   - [ ] 结果返回 Mobile（< 3 秒）

### 8.3 危险命令拦截

1. 尝试发送 `rm -rf /`
2. **验证**：
   - [ ] 命令被拦截

### 验收标准

- [ ] 设备自动注册 + 在线状态
- [ ] 命令可远程执行
- [ ] 危险命令被拦截

---

## 9. Bot 系统

> **对应 user-test-guide §16**

### 9.1 默认 Bot 会话

1. 登录后在聊天列表中
2. **验证**：
   - [ ] 看到 Supervisor 和 Coding Bot 两个置顶会话
   - [ ] Bot 有特殊标识

### 9.2 Bot 对话

1. 打开 Supervisor 会话
2. 发送 `hello`
3. **验证**：
   - [ ] 消息正常发送
   - [ ] Bot 会话中消息格式正确

### 验收标准

- [ ] 默认 2 个 Bot 存在
- [ ] Bot 会话可正常交互

---

## 推荐测试顺序

| 优先级 | 功能 | 预计耗时 | 备注 |
|--------|------|---------|------|
| 🔴 1 | 消息撤回 | 5 min | 核心功能，简单快速 |
| 🔴 2 | 消息搜索 | 5 min | 需要先有消息数据 |
| 🔴 3 | 语音消息 | 10 min | 需要麦克风 |
| 🟢 4 | 监控端点 | 2 min | 3 个 curl 命令 |
| 🟢 5 | 速率限制 | 2 min | 1 个循环脚本 |
| 🟢 6 | 个人资料 | 3 min | UI 点点 |
| 🟢 7 | 语言切换 | 3 min | UI 点点 |
| 🟡 8 | Bot 系统 | 5 min | 验证默认 Bot 存在 |
| 🟡 9 | 远程设备控制 | 10 min | 需要 Desktop Worker |
