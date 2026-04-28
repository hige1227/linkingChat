# LinkingChat 完整回归测试记录 2026-04-27

> 测试目标: 对当前 `main` 做一轮完整回归，覆盖 Desktop 开发版、Desktop 打包版、生产部署流程。
> 测试方式: Codex 执行自动化与可脚本化检查，用户协助确认 Desktop UI、真实 AI 回复、真实桌面命令执行结果。
> 当前范围: 当前 `main`，本地多服务环境 + 打包产物 + 生产部署流程验证。

---

## 1. 测试基线

| 项目 | 值 |
|------|----|
| 日期 | 2026-04-27 |
| 仓库 | `D:\myproject\LinkChat_new` |
| 分支 | `main` |
| HEAD | `d288541 fix: stabilize main validation flow and desktop auth state` |
| 工作区 | 干净 |
| 包管理 | `pnpm@10.22.0` |
| Node 要求 | `>=22.0.0` |

## 2. 用户确认的测试范围

| 问题 | 确认结果 |
|------|----------|
| 测试目的 | 完整回归，之前只做过阶段性测试 |
| 目标版本 | 当前 `main` |
| 必测端 | Desktop 开发版、Desktop 打包版、生产部署流程 |
| 测试环境 | 多环境都要测 |
| 测试数据 | 可以创建新账号或重置本地数据 |
| AI 调用 | 允许真实模型调用和真实费用 |
| 远程控制 | 测桌面端真实执行 |
| 破坏性/限流类场景 | 需要覆盖 |
| 通过标准 | 本文先定义，执行中可调整 |
| 输出物 | `docs/realtest/2026-04-27-full-regression.md` 并记录执行结果 |

## 3. 本轮通过标准

P0 必须全部通过:

| 编号 | 标准 | 状态 |
|------|------|------|
| P0-1 | 依赖安装、Prisma generate、type-check、build 通过 | PASS |
| P0-2 | Server 与 Desktop 自动化测试通过，或失败项有明确已知原因 | PASS |
| P0-3 | 本地 Docker 基础服务健康，迁移可执行 | PASS |
| P0-4 | Desktop 开发版可登录、收发消息、真实 AI 回复、服务重启恢复 | PASS |
| P0-5 | Desktop 打包版可构建、启动、登录、真实 AI 回复 | PASS |
| P0-6 | 真实桌面命令可安全执行并返回结果，危险命令被拦截 | PASS |
| P0-7 | 生产部署流程的构建、迁移、环境变量、健康检查、回滚点明确 | PASS |

P1 可以有遗留，但必须记录:

| 编号 | 标准 | 状态 |
|------|------|------|
| P1-1 | 邮箱验证、密码重置、限流、搜索、i18n 等扩展流程完成 | PARTIAL |
| P1-2 | 打包版冷启动、退出登录、重登、重复发送防护完成 | PASS |
| P1-3 | 生产环境真实 smoke 完成，或因缺少目标信息标记 BLOCKED | PASS |

失败分级:

| 级别 | 定义 |
|------|------|
| BLOCKER | 阻止登录、收发消息、AI 回复、打包启动或部署 |
| HIGH | 核心链路可用但存在数据错乱、重复发送、状态恢复失败 |
| MEDIUM | 功能可用但提示、边界、可观测性不足 |
| LOW | 文案、样式、非阻断体验问题 |

## 4. 环境矩阵

| 环境 | 范围 | 状态 | 说明 |
|------|------|------|------|
| 本地自动化 | pnpm、Prisma、Jest、build | PASS | Codex 已执行 |
| 本地 Desktop 开发版 | `pnpm dev:server` + `pnpm dev:desktop` | PASS | 用户确认 UI smoke 通过；DB 看到 A 账号设备在线、Bot 回复和真实 AI usage；服务重启后 Desktop 自动重连 |
| 本地 Desktop 打包版 | `pnpm --filter @linkingchat/desktop dist:dir` + `win-unpacked/LinkingChat.exe` | PASS | 打包产物构建、启动、设备上线、用户确认 UI、真实 AI 回复、真实命令执行通过 |
| 本地 Docker 基础服务 | PostgreSQL、Redis、MinIO、MailDev、OpenClaw | PASS | PostgreSQL/Redis/MailDev/OpenClaw healthy；MinIO running |
| 生产部署流程 | 构建、迁移、发布、健康检查、回滚 | PASS | 生产 server 发布、迁移、备份、容器健康检查、Nginx HTTPS 入口、API smoke、WebSocket smoke、Desktop UI smoke 与命令授权热修复复测通过 |

## 5. 测试账号规划

本地测试账号使用本轮唯一前缀，避免污染旧记录:

| 用途 | 邮箱 | 用户名 | 状态 |
|------|------|--------|------|
| 主账号 | `regression-a-20260427093809@test.local` | `reg_a_20260427093809` | PASS，已验证邮箱 |
| 好友账号 | `regression-b-20260427093809@test.local` | `reg_b_20260427093809` | PASS，已验证邮箱 |
| 限流/负向账号 | `regression-c-20260427093809@test.local` | `reg_c_20260427093809` | PASS，已完成密码重置 |

生产测试账号:

| 用途 | 邮箱 | 状态 | 说明 |
|------|------|------|------|
| 生产 smoke | `prod-regression-20260428010252@test.local` | PASS | 已创建测试账号，HTTPS API/AI/WebSocket smoke 通过 |

## 6. P0 自动化与构建验证

| 编号 | 命令 | 预期 | 状态 | 证据 |
|------|------|------|------|------|
| A1 | `git status --short --branch` | `main` 且工作区干净 | PASS | `## main...origin/main` |
| A2 | `git rev-parse --short HEAD` | 当前 HEAD 固定 | PASS | `d288541` |
| A3 | `pnpm install --frozen-lockfile` | 依赖不改 lockfile | PASS | Lockfile up to date；退出码 0；pnpm 元数据更新检查有一次网络失败 warning |
| A4 | `pnpm --filter @linkingchat/server exec prisma generate --schema prisma/schema.prisma` | Prisma Client 生成成功 | PASS | 首次因旧 server/dev 进程占用 Prisma DLL 失败；停止当前仓库进程后通过 |
| A5 | `pnpm --filter @linkingchat/server type-check` | 通过 | PASS | `tsc --noEmit` 通过 |
| A6 | `pnpm --filter @linkingchat/server build` | 通过 | PASS | `nest build` 通过 |
| A7 | `pnpm --filter @linkingchat/desktop type-check` | 通过 | PASS | `tsc --noEmit` 通过 |
| A8 | `pnpm --filter @linkingchat/desktop build` | 通过 | PASS | `electron-vite build` 通过；Vite dynamic import chunk warning 非阻断 |
| A9 | `pnpm --filter @linkingchat/server test` | 通过或已知非阻断 | PASS | 47 suites / 460 tests passed；保留 Jest worker graceful-exit warning |
| A10 | `pnpm --filter @linkingchat/desktop test` | 通过或已知非阻断 | PASS | 6 suites / 24 tests passed |
| A11 | `pnpm check-ws-coverage` | WebSocket 协议覆盖检查通过 | PASS | 28 events；21 OK；7 exempt；0 issues |

## 7. P1 本地基础服务与数据库

| 编号 | 测试项 | 预期 | 状态 | 证据 |
|------|--------|------|------|------|
| B1 | `docker compose up -d postgres redis minio maildev openclaw` | 基础服务启动 | PASS | Postgres/Redis/MailDev/OpenClaw already running；MinIO started |
| B2 | `docker compose ps` | 关键服务 healthy 或 running | PASS | Postgres/Redis/MailDev/OpenClaw healthy；MinIO running |
| B3 | `pnpm db:migrate` | 本地迁移成功 | PASS | 退出码 0；`prisma migrate status` 显示 schema up to date |
| B4 | `GET /api/v1/health` | 返回健康 | PASS | 200 `{"status":"ok","timestamp":"2026-04-27T01:34:33.629Z"}` |
| B5 | `GET /api/v1/metrics` | Prometheus 指标可读 | PASS | 200，包含 `http_request_duration_seconds` |
| B6 | MailDev `http://localhost:1088` | 可接收验证邮件 | PASS | 200，MailDev UI 可访问 |

## 8. P2 Desktop 开发版功能回归

| 编号 | 测试项 | 预期 | 状态 | 证据 |
|------|--------|------|------|------|
| C1 | 启动 `pnpm dev:server` | Server 监听 `3008` | PASS | 后台启动，日志在 `tmp/regression-server.*.log`；health 200 |
| C2 | 启动 `pnpm dev:desktop` | Electron 开发版打开 | PASS | 用户确认通过；重启后窗口标题 `LinkingChat Desktop`，Electron 进程存在 |
| C3 | 注册主账号 | 自动创建默认 Bot 会话 | PASS(API) | A 账号创建 2 个默认 Bot：Supervisor、Coding Bot；会话类型为 `DM`，不是 `BOT` |
| C4 | 邮箱验证 | MailDev 收信，验证码通过 | PASS(API) | MailDev 收到 A/B/C 验证邮件；A/B 通过 Redis 验证码完成验证 |
| C5 | 登录/刷新登录 | 登录后主界面可用 | PASS | 用户确认 A 账号登录成功；设备 `device-yehui-win32` 在线 |
| C6 | 注册好友账号并验证 | 第二账号可用 | PASS(API) | B 账号已注册并验证 |
| C7 | 添加好友/接受好友 | 双方好友关系与 DM 会话创建 | PASS(API) | request `cmogj2ujf001agde8uc4ihgeu`；DM `cmogj8vo5001mgde8i4i64on6` |
| C8 | DM 文本消息 | 双方实时收发，无重复 | PASS(API) | 消息 `cmogj8vp6001sgde82jy5s78o` 创建成功；实时 UI 待确认 |
| C9 | 消息撤回 | 2 分钟内可撤回，超时失败 | PASS(API) | DB `deletedAt=2026-04-27 01:42:53.15`；超时撤回待后续负向验证 |
| C10 | 群聊创建与群消息 | OWNER/MEMBER 正确，消息可达 | PASS(API) | 群 `cmogj8wkp001xgde8vvddk7t7`；群消息 `cmogj8wl2001zgde8d4dikpwu` |
| C11 | 搜索英文/中文消息 | 结果权限正确 | PASS(API) | `test` 与 `中文搜索` 均返回 1 条结果；跨用户权限待 UI/负向补测 |
| C12 | 个人资料与状态 | 昵称/在线状态更新 | PASS(API) | A 昵称改为 `Regression A 20260427093809`，状态 `IDLE` |
| C13 | i18n 切换 | 中英文切换并持久化 | TODO | |
| C14 | 忘记密码/重置密码 | 邮件验证码、旧密码失效、新密码可登录 | PASS(API) | C 账号 MailDev 收到重置邮件；旧密码失效，新密码登录成功 |
| C15 | 登录/注册/消息限流 | 超限返回 429 或明确错误 | PASS(API) | 本地 3008 实测：登录 `401,401,401,401,401,429`；注册因先创建 2 个准备账号，后续 `201,201,201,429,429,429`；消息发送 `201 x30` 后第 31 条 `429` |

## 9. P3 AI、Bot 与稳定性回归

| 编号 | 测试项 | 预期 | 状态 | 证据 |
|------|--------|------|------|------|
| D1 | Desktop provider 为 `server` | `getAgentType()` 返回 `server` | PASS(UI) | 用户确认 Supervisor 正常回复；API Gateway 同时通过 |
| D2 | Supervisor 短回复 | 真实模型返回指定短语 | PASS(UI+DB) | 用户确认回复；DB 记录用户消息和 Bot 回复 `DEV AI REGRESSION OK`；`ai_usage` 写入 `deepseek-chat` |
| D3 | 长流式回复 | UI 不冻结，最终标记出现 | TODO | |
| D4 | 生成中切换会话 | 不丢消息，不重复回复 | TODO | |
| D5 | 连续点击/回车重复发送 | 只产生一次真实用户消息和一次 Bot 回复 | TODO | |
| D6 | Server 重启恢复 | Desktop 自动重连，之后仍可 AI 回复 | PASS | 重启 3008 后健康检查 200；打包版在 17:46:15 CST 重新注册 `device-yehui-win32` 并保持 `ONLINE` |
| D7 | DeepSeek/Kimi fallback | 主 provider 故障时 fallback 或错误清晰 | TODO | |
| D8 | LLM 限流 | 超过分钟限制后返回清晰错误，不写 usage | PASS | 对 C 账号预置 `llm:rate:min:<userId>=20` 后请求 `llm-proxy`，SSE 返回 `Rate limit exceeded (per minute)`；`ai_usage` 未新增 |
| D9 | `ai_usage` 落库 | 成功 AI 调用写 usage | PASS(API) | A 账号 `/ai/llm-proxy` 真实调用写入 1 行：`deepseek-chat`，prompt 14，completion 6 |
| D10 | Jarvis/Supervisor 状态 | `jarvis_states` 持久化 | TODO | |
| D11 | Whisper / Draft / Predictive | 卡片显示与操作结果正确 | TODO | |

## 10. P4 真实桌面命令执行回归

| 编号 | 测试项 | 预期 | 状态 | 证据 |
|------|--------|------|------|------|
| E1 | Desktop 注册为设备 | 设备在线 | PASS | `device-yehui-win32`，用户 `regression-a-20260427093809@test.local`，状态 `ONLINE` |
| E2 | 真实安全命令 | 例如 `echo LINKCHAT_REGRESSION_20260427` 返回正确输出 | PASS | 修复后命令 `echo LINKCHAT_REGRESSION_20260427_FIXED` 返回正确输出，source=`child_process` |
| E3 | PowerShell 命令 | 例如查询当前目录或时间，返回真实结果 | PASS | 生产打包版真实执行 `powershell -NoProfile -Command "Write-Output 'LINKCHAT_POWERSHELL_20260428'; Get-Date -Format o"`，命令 `cmoia63ta0059pg0183xtaboc`，source=`child_process`，输出包含 `LINKCHAT_POWERSHELL_20260428` 和 `2026-04-28T15:04:48.7331431+08:00` |
| E4 | 危险命令拦截 | `format C:` / `rm -rf /` 不执行且提示风险 | PASS | `format C:` 返回 `COMMAND_DANGEROUS`，未派发到 Desktop |
| E5 | Desktop 离线状态 | 关闭 Desktop 后设备离线 | TODO | |
| E6 | Server/Redis 故障恢复 | 依赖恢复后命令链路恢复 | TODO | |

## 11. P5 Desktop 打包版回归

| 编号 | 测试项 | 预期 | 状态 | 证据 |
|------|--------|------|------|------|
| F1 | 停止已运行的打包版进程 | 避免构建占用 | PASS | 未发现残留打包版进程；停止开发版 Electron 后构建 |
| F2 | 带本地 URL 构建 `dist:dir` | `win-unpacked/LinkingChat.exe` 存在 | PASS | `apps/desktop/dist/win-unpacked/LinkingChat.exe` 存在，大小 201,481,728 bytes；renderer 产物内 API/WS 为 `http://localhost:3008` |
| F3 | 启动打包版 | 应用打开，连接本地 API/WS | PASS | `LinkingChat.exe` 多进程启动；DB 设备 `device-yehui-win32` 状态 `ONLINE`，`lastSeenAt=2026-04-27 09:38:34.726Z` |
| F4 | 打包版登录 | 登录成功，连接指示恢复 | PASS | 用户确认打包版 UI 通过；后端设备在线且归属 A 账号 |
| F5 | 打包版 Bot 短回复 | 真实 AI 回复指定短语 | PASS | 用户确认通过；DB 消息 `cmoh0sp6g000fgdq4dxd3yjcp` 为 `PACKAGED AI REGRESSION OK`；`ai_usage` 写入 `deepseek-chat` prompt 17 / completion 9 |
| F6 | 打包版长回复/切换/重复发送 | 与开发版一致 | TODO | |
| F7 | 打包版真实命令执行 | 设备在线并返回命令结果 | PASS | `format C:` 返回 `COMMAND_DANGEROUS`；`echo LINKCHAT_PACKAGE_COMMAND_OK_20260427` 返回正确输出，命令 `cmoh0agqq0003gdqo9mobi7dp` |
| F8 | 退出登录清理 token | auth store 与 LLM token store 清空 | TODO | |
| F9 | 冷启动恢复 | 重启后 token 恢复、会话恢复、连接恢复 | TODO | |

## 12. P6 生产部署流程验证

生产环境操作已获用户授权后执行。本节记录实际发布、迁移、代理接入和 smoke 验证结果。

| 编号 | 测试项 | 预期 | 状态 | 证据 |
|------|--------|------|------|------|
| G1 | 确认生产目标 | 域名、服务器、部署目录、Docker Compose 项目明确 | PASS | SSH 目标 `ubuntu@49.235.109.94`、目录 `/opt/linkchat`、compose 项目 `linkchat` 已确认；DNS 已解析到 `49.235.109.94` |
| G2 | 确认生产账号 | 可用于 smoke 的账号或允许创建账号 | PASS | 已创建 `prod-regression-20260428010252@test.local` 用于 HTTPS API/AI/WebSocket smoke |
| G3 | 确认密钥 | DeepSeek/Kimi/JWT/Redis/DB 等生产变量存在 | PASS | `/opt/linkchat/.env.production` 存在；仅核对 key 名，未打印 secret |
| G4 | 生产前构建 | Server/desktop 构建通过 | PASS | 生产机独立构建 `linkchat-server-regression:20260427-migratefix` 成功；实际 `linkchat-server` 发布镜像 `sha256:7d62a734435b5629f4d5f562b35773eb15b5c990d5365ab4de464ebedc3a54d6` |
| G5 | 生产迁移计划 | `prisma migrate deploy` 可执行，有备份/回滚点 | PASS | 备份后用修复镜像执行 `prisma migrate deploy`，3 个待迁移全部应用，状态 up to date |
| G6 | 发布前备份 | 数据库和当前服务镜像/目录备份完成 | PASS | DB 备份 `/opt/linkchat/backups/linkingchat-regression-pre-migrate-20260427-183844.sql.gz`；代码备份 `/opt/linkchat/backups/code/linkchat-code-pre-current-main-20260427-185251.tar.gz`；旧镜像 `sha256:4a975fd34bfd33e014b19c0889f5d2099bb60762b2663050391d5f89c8153de2` |
| G7 | 发布服务 | 服务重建/重启完成 | PASS | `/opt/linkchat` 已同步当前源码和修复；`docker compose -f docker-compose.prod.yaml up -d --build server` 成功 |
| G8 | 生产健康检查 | `/health`、Redis、DB、WS 正常 | PASS | 内部 `127.0.0.1:3008/api/v1/health` 200、metrics 200、server/postgres/redis healthy；公网 `https://linkchat-api.matrix-ai.com.cn/api/v1/health` 200，`/api/v1/ai/health` 200，Socket.IO `/device` WebSocket 连接成功 |
| G9 | 生产 Desktop smoke | 登录、AI 回复、usage 落库 | PASS | 公网 HTTPS API smoke 通过：注册/登录/LLM token/真实 AI 回复 `PROD API AI REGRESSION OK`，`ai_usage` 落库；修复打包版 renderer API 后，用户确认生产 Desktop UI smoke 通过 |
| G10 | 生产回滚演练 | 回滚路径明确或已演练 | PARTIAL | 回滚点已明确：恢复代码备份并重新构建，或回退旧 server 镜像 `sha256:4a975...`；未实际演练回滚 |

需要用户补充的信息:

| 信息 | 状态 |
|------|------|
| 生产 API 域名 | PASS: `https://linkchat-api.matrix-ai.com.cn` 解析到 `49.235.109.94`，Nginx 代理到 `127.0.0.1:3008` |
| 生产服务器访问方式 | PASS: `ubuntu@49.235.109.94` + `~/.ssh/id_ed25519` |
| 生产部署目录 | PASS: `/opt/linkchat` |
| 是否允许真实发布/重启生产服务 | PASS: 已授权并完成 server 重建/重启 |
| 是否允许在生产创建测试账号 | PASS: 已创建 `prod-regression-20260428010252@test.local` |
| 是否允许临时注入故障测试 fallback/Redis 不可用 | TODO |

## 13. 执行日志

| 时间 | 执行人 | 步骤 | 结果 | 备注 |
|------|--------|------|------|------|
| 2026-04-27 | Codex | 初始化测试基线 | PASS | 分支 `main`，HEAD `d288541`，工作区干净 |
| 2026-04-27 09:31 CST | Codex | P0 自动化与构建验证 | PASS | install、Prisma generate、server/desktop type-check/build/test、WS coverage 均通过 |
| 2026-04-27 09:34 CST | Codex | P1 本地服务与数据库 | PASS | Docker 基础服务、迁移状态、health、metrics、MailDev、OpenClaw 均通过 |
| 2026-04-27 09:42 CST | Codex | P2 API 核心功能链路 | PASS | 注册/验证/默认 Bot/好友/DM/搜索/撤回/群聊/资料/密码重置通过；Desktop UI 待确认 |
| 2026-04-27 09:48 CST | Codex | P3 AI Gateway API smoke | PASS | `/ai/llm-token` + `/ai/llm-proxy` 真实流式调用成功，拼接结果为 `API AI REGRESSION OK`，`ai_usage` 落库 |
| 2026-04-27 09:53 CST | Codex | P6 生产部署流程预检 | BLOCKED | 本机缺 `.env.production`；生产 Dockerfile 镜像构建两次被 npm registry 网络错误阻塞 |
| 2026-04-27 09:46 CST | Codex | Desktop 开发版启动 | PARTIAL | Electron 开发版启动，OpenClaw local gateway ready；A 账号设备尚未上线，等待用户登录确认 |
| 2026-04-27 17:17 CST | 用户 + Codex | Desktop 开发版 UI smoke | PASS | 用户确认窗口、登录、连接指示、默认 Bot、Supervisor 回复均通过；DB 证据吻合 |
| 2026-04-27 17:21 CST | Codex | 真实命令危险拦截 | PASS | `format C:` 被服务端安全过滤器拒绝，返回 `COMMAND_DANGEROUS` |
| 2026-04-27 17:23 CST | Codex | 真实命令 OpenClaw 输出检查 | FAIL -> FIXED | OpenClaw 路径返回 `exec` 而非命令输出；修复 Desktop `tool_result` 输出读取 |
| 2026-04-27 17:27 CST | Codex | 真实命令执行复测 | PASS | `echo LINKCHAT_REGRESSION_20260427_FIXED` 控制端收到结果，DB 状态 `COMPLETED`，输出正确 |
| 2026-04-27 17:28 CST | Codex | Desktop 修复后验证 | PASS | `pnpm --filter @linkingchat/desktop type-check/build/test` 通过 |
| 2026-04-27 17:34 CST | Codex | Desktop 打包版构建 | PASS | `pnpm --filter @linkingchat/desktop dist:dir` 通过，生成 `win-unpacked/LinkingChat.exe` |
| 2026-04-27 17:36 CST | Codex | Desktop 打包版启动与设备上线 | PASS | `LinkingChat.exe` 启动；DB 看到 A 账号设备 `device-yehui-win32` 在线 |
| 2026-04-27 17:40 CST | Codex | Desktop 打包版真实命令执行 | PASS | 危险命令被拦截，安全 `echo LINKCHAT_PACKAGE_COMMAND_OK_20260427` 返回正确输出 |
| 2026-04-27 17:41 CST | Codex | 密码找回限流 | PASS | 连续 4 次 `forgot-password`，前三次 200，第 4 次 429 `Too Many Requests` |
| 2026-04-27 17:46 CST | Codex | Server 重启恢复 | PASS | 停止旧 3008 进程后重启 `node --enable-source-maps dist/src/main`；`/api/v1/health` 200，Desktop 设备重新上线 |
| 2026-04-27 17:50 CST | Codex | LLM 限流预置首次尝试 | RETRY | 误用 B 的 userId 预置 Redis key，C 账号请求真实走到 DeepSeek 并新增 1 条 usage；非产品缺陷 |
| 2026-04-27 17:51 CST | Codex | LLM 限流复测 | PASS | 使用 C 的真实 userId 预置 Redis key 后，`llm-proxy` 返回限流错误且未新增 `ai_usage` |
| 2026-04-27 17:54 CST | 用户 + Codex | Desktop 打包版 UI AI smoke | PASS | 用户确认通过；DB 看到用户消息 `请只回复：PACKAGED AI REGRESSION OK` 和 Bot 回复 `PACKAGED AI REGRESSION OK` |
| 2026-04-27 18:09 CST | Codex | 生产只读预检 | PASS | SSH `ubuntu@49.235.109.94` 成功；`/opt/linkchat`、`.env.production`、compose 项目存在；server/postgres/redis healthy；内部 health/metrics 200 |
| 2026-04-27 18:23 CST | Codex | 生产独立 Docker build | PASS | 当前 `HEAD d288541` 在生产机独立构建 `linkchat-server-regression:20260427` 成功，镜像 `sha256:18649f160eef...` |
| 2026-04-27 18:35 CST | Codex | 生产 Prisma CLI 修复验证 | PASS | 将 `prisma` 移入 server dependencies 后，测试镜像 `linkchat-server-regression:20260427-prisma` 内 `node_modules/.bin/prisma` 可用 |
| 2026-04-27 18:38 CST | Codex | 生产迁移前备份 | PASS | DB 备份 `/opt/linkchat/backups/linkingchat-regression-pre-migrate-20260427-183844.sql.gz` |
| 2026-04-27 18:47 CST | Codex | 生产迁移 SQL 修复验证 | PASS | 修正 `20260416000000_add_draft_type_enum` 使用 `"draftType"`；测试镜像 `linkchat-server-regression:20260427-migratefix` 构建成功 |
| 2026-04-27 18:49 CST | Codex | 生产迁移执行 | PASS | `prisma migrate deploy` 应用 `add_draft_type_enum`、`add_relationship_graph_and_jarvis_state`、`rename_relationship_tables`；迁移状态 up to date |
| 2026-04-27 18:55 CST | Codex | 生产源码发布备份与同步 | PASS | 代码备份 `/opt/linkchat/backups/code/linkchat-code-pre-current-main-20260427-185251.tar.gz`；当前源码同步到 `/opt/linkchat` |
| 2026-04-27 18:59 CST | Codex | 生产 server 发布 | PASS | `docker compose -f docker-compose.prod.yaml up -d --build server` 成功；新镜像 `sha256:7d62a734435b5629f4d5f562b35773eb15b5c990d5365ab4de464ebedc3a54d6` |
| 2026-04-27 19:00 CST | Codex | 生产发布后健康检查 | PARTIAL | 内部 health 200、metrics 200、容器 healthy、迁移 up to date；公网域名仍因 DNS/443 占用返回非 LinkChat 401 |
| 2026-04-27 19:01 CST | Codex | Server 修复后测试 | PASS | `pnpm --filter @linkingchat/server test` 通过：47 suites / 460 tests |
| 2026-04-28 09:00 CST | Codex | 生产 Nginx 统一代理接入 | PASS | 新增独立 `/etc/nginx/sites-available/linkchat-api` 并启用，只匹配 `linkchat-api.matrix-ai.com.cn`；未修改 `openclaw`/`sports`；Nginx 443 监听恢复 |
| 2026-04-28 09:02 CST | Codex | 生产 server 端口收敛 | PASS | `docker-compose.prod.yaml` server 端口恢复为 `127.0.0.1:3008:3008`；公网 `49.235.109.94:3008` 超时不可直连 |
| 2026-04-28 09:02 CST | Codex | 生产 HTTPS/API/WS smoke | PASS | HTTPS health 200、AI health 200、注册/登录/LLM token/真实 AI 回复通过，Socket.IO `/device` WebSocket 连接成功，`ai_usage` 写入 `deepseek-chat` prompt 16 / completion 8 |
| 2026-04-28 10:02 CST | 用户 + Codex | 生产 Desktop UI smoke | BLOCKED | 误点旧安装器后无法在 UI 内取消；随后启动 `win-unpacked` 出现多组 LinkingChat 进程、首个连接灯灰色、会话为空。生产库确认 `ice@test.com` 有 2 个打开会话/2 个 Bot，`/device` 心跳正常但未见 `/chat` 连接 |
| 2026-04-28 10:08 CST | Codex | 生产 Desktop 干净重启 | PASS | 已结束残留 LinkingChat 进程并只启动一个 `win-unpacked` 主进程；当前仅 1 个主进程，其余为 Electron 子进程 |
| 2026-04-28 10:20 CST | 用户 + Codex | 生产 Desktop renderer API 定位 | FIXED | DevTools 显示 renderer 请求 `localhost:3008`，生产 token 被本地服务拒绝并报 `AUTH_INVALID`；已修复 renderer 构建注入、单实例锁和安装器配置，重建 `win-unpacked` 后产物指向 `https://linkchat-api.matrix-ai.com.cn` |
| 2026-04-28 10:30 CST | 用户 + Codex | 生产 Desktop UI 复测 | PASS | 用户确认新 `win-unpacked` 打包版通过；G9 收口为 PASS |
| 2026-04-28 11:54 CST | Codex | 完整 Windows 安装器重建 | PASS | `pnpm --filter @linkingchat/desktop dist` 成功；生成 `LinkingChat Setup 0.0.1.exe`，构建日志确认 `oneClick=false` |
| 2026-04-28 11:58 CST | 用户 + Codex | 安装器 assisted 流程复测 | PARTIAL | 已出现标准向导、可取消、可选安装路径；但进入“正在安装”后无法取消，且没有显示详细进度或日志 |
| 2026-04-28 13:58 CST | 用户 + Codex | 打包版冷启动/退出/重登 | PASS | `win-unpacked` 冷启动自动进入主界面，生产 `/chat` 连接成功；退出后本地 auth store 变 `{}` 且生产 chat/device 断开；重登 `ice@test.com` 后 token、chat/device 和 heartbeat 恢复 |
| 2026-04-28 14:16 CST | 用户 + Codex | 打包版重复发送防护 | PASS | Bot 回复进行中 UI 不允许再次 Enter；生产库证据显示第二条相同内容是在第一条 Bot 回复已落库后才发送，未发现进行中重复提交 |
| 2026-04-28 14:56 CST | Codex | C15 登录/注册/消息限流 | PASS | 本地 3008：登录第 6 次 `429`；注册同一分钟总量到 5 后返回 `429`；群消息发送第 31 条 `429` |
| 2026-04-28 15:04 CST | Codex | 生产 PowerShell 真实命令 | PASS + BUG FOUND | 新生产测试账号向 `device-yehui-win32` 派发 PowerShell 只读命令，桌面返回 `LINKCHAT_POWERSHELL_20260428`；同时发现 `device:command:send` 可跨用户按已知 `deviceId` 派发，登记 `BUG-006` |
| 2026-04-28 15:07 CST | Codex | 命令派发授权修复验证 | PASS | 新增 `device.gateway.spec.ts`，覆盖非本人设备拒绝、无同用户 socket 不建命令、只向同用户目标 socket 派发；`pnpm --filter @linkingchat/server test -- device.gateway.spec.ts --runInBand` 与 `type-check` 通过；server 全量 Jest 在 3 分钟超时后停止，未作为本次热修复阻断项 |
| 2026-04-28 15:17 CST | Codex | 生产命令授权热修复发布 | PASS | 备份 `/opt/linkchat/backups/code/linkchat-code-pre-command-auth-20260428-151420.tar.gz`；重建并启动 `linkchat-server`，新镜像 `sha256:f3f33fd6cfbf440cd1a6dd80d8e8d8599f938b0bf5dfa154d13aca303aa99db2`，HTTPS health 200 |
| 2026-04-28 15:21 CST | Codex | 跨用户命令复测 | PASS | 新测试账号再次向 `device-yehui-win32` 派发 `SHOULD_NOT_RUN_20260428`，ack 返回 `DEVICE_NOT_AVAILABLE`；生产 DB 未产生该 payload 的 command；`ice@test.com` 设备仍 `ONLINE` |
| 2026-04-28 15:33 CST | 用户 + Codex | Profile/i18n 入口检查 | FIXED | 用户反馈当前打包版找不到个人资料设置；代码确认 `/profile` 路由存在但侧边栏无入口；已在 Desktop 侧边栏新增 Profile 图标入口，`type-check`、Jest、`electron-vite build` 通过；当前旧运行产物可用 DevTools `window.location.hash = '#/profile'` 临时跳转 |
| 2026-04-28 19:48 CST | 用户 + Codex | `win-unpacked` 双击启动复测 | FIXED | 用户反馈双击 `win-unpacked/LinkingChat.exe` 无法打开；本机发现 3 个无主窗口句柄的旧 `LinkingChat.exe` 残留进程仍持有单实例锁；清理后可启动。已增强 `second-instance` 逻辑：无窗口或窗口已销毁时重新创建窗口，并在 `closed` 时清空 `mainWindow`；重建 `dist:dir` 后启动成功，二次启动未新增进程 |

## 14. 问题清单

| ID | 级别 | 环境 | 问题 | 状态 | 处理 |
|----|------|------|------|------|------|
| OBS-001 | LOW | 本地自动化 | `pnpm install` 退出码 0，但 pnpm 元数据更新检查访问 npm registry 失败 | OPEN | 不影响 frozen install；记录网络波动 |
| OBS-002 | LOW | Server Jest | 全量测试通过后 Jest 报 worker 未优雅退出并被强制结束 | OPEN | 既有测试 teardown 风险；不阻断本轮回归 |
| OBS-003 | LOW | Prisma generate | Windows 上旧 server/dev 进程占用 `query_engine-windows.dll.node` 会导致 EPERM | OPEN | 已通过停止当前仓库 server/dev 进程解决 |
| OBS-004 | LOW | API 脚本 | 首次脚本误将 `GET /friends/requests` 当作数组，导致 accept URL 为空 | CLOSED | 修正为读取 `received[0].id` 后通过；非产品问题 |
| OBS-005 | LOW | 测试预期 | 默认 Bot 会话实际为 `DM` 类型，不是 `BOT` 类型 | OPEN | 产品设计可能如此；后续 UI 以 Bot 标识和置顶为准 |
| OBS-006 | HIGH | 生产部署预检 | 生产 Dockerfile 构建依赖实时访问 npm registry；本地两次失败，生产机可成功但下载很慢并有大量低速告警 | OPEN | 建议生产构建使用稳定 registry/mirror、预热 pnpm/corepack 缓存，或在 CI 中缓存 pnpm store |
| BLOCK-001 | HIGH | Desktop 开发版 | 需要用户确认窗口、登录 A 账号、Bot 回复和设备上线 | CLOSED | 用户确认通过，DB 看到 A 账号设备在线 |
| BUG-001 | HIGH | Desktop 命令执行 | OpenClaw `tool_result` 的 `text` 是工具名 `exec`，真实输出在 `output`，导致命令结果显示错误 | FIXED | 已改为 `chunk.output ?? chunk.text`；修复后真实命令输出正确 |
| OBS-007 | MEDIUM | Desktop/OpenClaw dev | 重启开发版时出现 OpenClaw 双启动/端口占用提示 | OPEN | 命令链路可通过 fallback 成功；后续应单独收敛 OpenClaw 进程启动逻辑 |
| OBS-008 | LOW | 测试操作 | LLM 限流首次预置 Redis key 时误用 B 的 userId，导致 C 账号真实发起 1 次低 token DeepSeek 请求 | CLOSED | 已用 C 的真实 userId 复测通过；记录额外 `ai_usage` 作为测试噪声 |
| BUG-002 | HIGH | 生产部署迁移 | 生产 server 镜像只有 production dependencies，缺少 `node_modules/.bin/prisma`，无法可靠执行 `prisma migrate deploy` | FIXED | 已将 `prisma` 移入 server dependencies；新生产镜像内 Prisma CLI 可用，迁移状态可检查 |
| BUG-003 | HIGH | 生产迁移 SQL | `20260416000000_add_draft_type_enum` 引用不存在的 `"draft_type"` 列；实际表为 `"draftType"`，会阻断生产迁移 | FIXED | 已修正 migration SQL，备份后生产迁移执行成功 |
| BLOCK-002 | BLOCKER | 生产公网入口 | `linkchat-api.matrix-ai.com.cn` 已解析到 `49.235.109.94`；新增独立 Nginx 站点 `linkchat-api` 只匹配该域名并代理到 `127.0.0.1:3008`，未修改 `openclaw`/`sports` 站点 | CLOSED | HTTPS health、AI health、注册/登录、真实 AI 回复、Socket.IO WebSocket 和 `ai_usage` 落库均通过 |
| OBS-009 | MEDIUM | 生产 SSH | SSH 认证可用，但多次出现 `Connection timed out during banner exchange` 或 `Connection closed`，需要多次重试 | OPEN | 建议检查 sshd `MaxStartups`、连接限制、安全组或服务器负载 |
| OBS-010 | MEDIUM | Desktop 安装器 | 旧安装器 `LinkingChat Setup 0.0.1.exe` 启动后用户无法取消或关闭，且没有路径选择/下一步等成熟安装流程 | OPEN | 建议改为 NSIS assisted installer：`oneClick=false`、允许选择安装目录、明确取消/上一步/下一步、安装前关闭旧进程 |
| BUG-004 | HIGH | Desktop 打包版 | 缺少单实例锁，可同时运行多组 `LinkingChat.exe`；旧实例可能持有旧 token/清理 auth store，导致新窗口 chat socket 灰灯、会话列表为空 | FIXED | 已在主进程加入 `app.requestSingleInstanceLock()`，第二实例聚焦已有窗口；token refresh 失败时只在 401/403 清理全局 auth store；用户复测通过 |
| BUG-005 | HIGH | Desktop 打包版 | renderer 生产构建未正确注入 API/WS 地址，聊天页请求 `localhost:3008`，导致生产 token 被本地服务拒绝并报 `AUTH_INVALID` | FIXED | 已改为显式 `__LINKINGCHAT_API_URL__`/`__LINKINGCHAT_WS_URL__` 构建常量，并重建 `win-unpacked`；产物中 renderer 指向 `https://linkchat-api.matrix-ai.com.cn`；用户复测通过 |
| OBS-011 | MEDIUM | Desktop 安装器 | assisted 向导已恢复，但安装执行页仍无法取消，且缺少详细进度/日志 | OPEN | electron-builder NSIS 模板默认 `ShowInstDetails nevershow` 且安装 section 使用 `SetDetailsPrint none`；建议后续改自定义 NSIS script 或评估 MSI/WiX，实现详细日志、明确进度和中途取消后的回滚/清理 |
| OBS-012 | LOW | Desktop 消息发送 | 当前防重复覆盖“发送/AI 回复进行中”场景；同一内容在 Bot 回复完成后仍可再次发送，会产生另一条消息 | OPEN | 当前行为可接受；若产品需要内容级幂等，后续应增加 client request id / idempotency key，并由服务端去重 |
| BUG-006 | BLOCKER | 生产命令 WebSocket | `device:command:send` 只按 `targetDeviceId` 房间广播，未验证设备归属和目标 socket 用户；任意已登录用户若知道 `deviceId`，可向他人在线 Desktop 派发 shell 命令 | FIXED | 已在 `DeviceGateway` 增加 `devicesService.findOneById(targetDeviceId, userId)` 校验，并只向 `userId` 与 `deviceId` 均匹配的 socket id 派发；新增单测；生产热修复后跨用户复测返回 `DEVICE_NOT_AVAILABLE`，DB 未写入 `SHOULD_NOT_RUN_20260428` 命令 |
| BUG-007 | MEDIUM | Desktop 导航 | `ProfilePage` 和 i18n 设置路由存在，但侧边栏没有 Profile/Settings 入口，用户无法从正常 UI 发现语言切换 | FIXED | 已在 `MainLayout` 侧边栏设备图标下方新增 Profile 图标入口；当前旧运行产物可用 DevTools `window.location.hash = '#/profile'` 跳转，下一次打包重建后直接可见 |
| BUG-008 | HIGH | Desktop 打包版 | 残留无窗口 `LinkingChat.exe` 进程仍持有单实例锁时，用户双击 `win-unpacked/LinkingChat.exe` 会被二次实例逻辑拦截，但旧实例没有窗口可聚焦，表现为无法打开程序 | FIXED | 已修复 `second-instance`：当 `mainWindow` 不存在或已销毁时重新 `createWindow()`，并在窗口 `closed` 时清空引用；`dist:dir` 重建后启动成功，重复启动未增加进程 |

## 15. 当前结论

```text
测试已完成一轮端到端回归。P0-1 至 P0-7 全部通过；P1-2/P1-3 已通过。生产侧已完成 server 构建、备份、迁移、发布、容器健康检查和 Nginx HTTPS 统一代理接入。`linkchat-api.matrix-ai.com.cn` 已通过公网 HTTPS health、AI health、注册/登录、真实 AI 回复、Socket.IO WebSocket、真实 PowerShell 桌面命令和 `ai_usage` 落库验证；生产 Desktop UI smoke、打包版冷启动、退出、重登和发送中防重复均已由用户确认。本轮发现并修复 1 个生产 BLOCKER：跨用户按 `deviceId` 派发桌面 shell 命令；生产热修复后跨用户复测已返回 `DEVICE_NOT_AVAILABLE` 且未落库命令。剩余遗留为 P1/P6 级：i18n UI 切换仍待人工确认；生产回滚路径已明确但未实际演练；安装器 assisted 向导页已通过，但安装执行页仍缺少可取消能力和详细进度/日志，需要后续自定义 NSIS 或 MSI/WiX 方案收敛。
```
