# Desktop — Windows NSIS 安装包部署指南

> 目标：构建 Windows 安装包 (.exe)，包含 OpenClaw sidecar，连接公网服务器
> 服务器：`https://linkchat-api.matrix-ai.com.cn` (已部署)
> 分发方式：直接给用户安装（不走 Microsoft Store）

---

## 什么是 NSIS？

NSIS (Nullsoft Scriptable Install System) 是 Windows 上最常用的安装包格式之一。
你在 Windows 上安装软件时看到的「下一步 → 同意协议 → 选择目录 → 安装 → 完成」
那种安装向导，就是 NSIS 打包出来的。electron-builder 默认用 NSIS 打包 Electron 应用。

最终产物是一个 `LinkingChat Setup x.x.x.exe` 文件，用户双击即可安装。

---

## 前置条件

| 条件 | 检查命令 | 预期输出 |
|------|---------|---------|
| Node.js 22+ | `node -v` | v22.x.x |
| pnpm 10 | `pnpm -v` | 10.x.x |
| Windows 10/11 | — | 当前开发机 |

---

## Step 1: 安装 electron-builder

```bash
cd apps/desktop
pnpm add -D electron-builder
```

安装完后确认：
```bash
npx electron-builder --version
```

---

## Step 2: 添加构建脚本

在 `apps/desktop/package.json` 的 `scripts` 中确认/添加：

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "dist": "electron-builder --win",
    "dist:dir": "electron-builder --win --dir"
  }
}
```

- `build` — 编译 TypeScript → dist/
- `dist` — 打包成 NSIS 安装包 (.exe)
- `dist:dir` — 打包成目录（不压缩，用于快速测试）

---

## Step 3: 准备 OpenClaw Sidecar

Sidecar 是随 Desktop 一起打包的 OpenClaw Gateway 本地进程。

### 3.1 创建 sidecar 目录

```bash
# 在项目根目录
mkdir -p apps/desktop/sidecar/win-x64
cd apps/desktop/sidecar/win-x64
```

### 3.2 安装 OpenClaw

```bash
cd apps/desktop/sidecar/win-x64
npm init -y
npm install openclaw@2026.4.2 --no-save
```

> **为什么锁定 2026.4.2？** v2026.4.5 有依赖缺失 bug，无法启动。

### 3.3 下载 Node.js 独立可执行文件

OpenClaw 需要 Node.js 运行。下载独立的 node.exe 放进 sidecar 目录：

1. 访问 https://nodejs.org/dist/v22.14.0/win-x64/
2. 下载 `node.exe`（约 50MB）
3. 放到 `apps/desktop/sidecar/win-x64/node.exe`

或者用命令下载：
```bash
cd apps/desktop/sidecar/win-x64
curl -o node.exe https://nodejs.org/dist/v22.14.0/win-x64/node.exe
```

### 3.4 验证目录结构

最终 `sidecar/win-x64/` 应包含：
```
sidecar/win-x64/
  ├── node.exe              # Node.js 22 运行时
  ├── node_modules/
  │   └── openclaw/         # OpenClaw 包
  └── package.json
```

验证 sidecar 可运行：
```bash
cd apps/desktop/sidecar/win-x64
.\node.exe node_modules\openclaw\cli.js --version
```

---

## Step 4: 准备图标

需要 `apps/desktop/build/icon.ico`，尺寸至少 256x256。

### 如果没有图标

临时方案：跳过图标，electron-builder 会用默认 Electron 图标。

正式方案：准备一张 512x512 的 PNG，用在线工具转换为 .ico：
- https://convertio.co/zh/png-ico/
- https://www.icoconverter.com/

放到 `apps/desktop/build/icon.ico`。

---

## Step 5: 确认 electron-builder.yaml

当前配置已就绪，位于 `apps/desktop/electron-builder.yaml`：

```yaml
appId: com.linkingchat.desktop
productName: LinkingChat
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.*'
  - '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
extraResources:
  - from: sidecar/${os}-${arch}    # ← OpenClaw sidecar
    to: openclaw-sidecar
    filter:
      - '**/*'
  - from: resources/hermes-env     # ← Hermes (可选)
    to: hermes-env
    filter:
      - '**/*'
win:
  target: nsis
  icon: build/icon.ico
```

**说明：**
- `extraResources` — 打包额外的文件到安装目录
- `sidecar/${os}-${arch}` — Windows 上解析为 `sidecar/win-x64`
- `files` 中的 `!` 前缀表示排除（不打包源码和配置文件）

---

## Step 6: 构建安装包

### 6.1 设置生产环境变量

```bash
# Windows CMD
set VITE_API_URL=https://linkchat-api.matrix-ai.com.cn
set VITE_WS_URL=https://linkchat-api.matrix-ai.com.cn

# Windows PowerShell
$env:VITE_API_URL="https://linkchat-api.matrix-ai.com.cn"
$env:VITE_WS_URL="https://linkchat-api.matrix-ai.com.cn"
```

> **为什么设这两个？** Renderer 进程的 API URL 在构建时通过 Vite `define` 注入。
> 设了环境变量 → 生产 URL；不设 → 默认 localhost:3008（开发用）。
> Main 进程用 `app.isPackaged` 判断，不需要环境变量。

### 6.2 编译代码

```bash
cd apps/desktop
pnpm build
```

输出：`apps/desktop/dist/` 目录下生成编译后的代码。

如果报错，检查：
- TypeScript 错误 → `pnpm type-check` 看详细信息
- 依赖缺失 → `pnpm install`

### 6.3 打包安装程序

```bash
cd apps/desktop
pnpm dist
```

输出文件：
```
apps/desktop/dist/
  LinkingChat Setup x.x.x.exe     # ← 这是最终安装包，给用户这个文件
  LinkingChat Setup x.x.x.exe.blockmap
  latest.yml
```

> **首次打包较慢**（下载 Electron 二进制 ~70MB），后续有缓存会快很多。

### 6.4 快速测试（不压缩）

如果只想测试打包结果，不生成安装包：
```bash
cd apps/desktop
pnpm dist:dir
```

输出在 `apps/desktop/dist/win-unpacked/`，直接运行 `LinkingChat.exe` 测试。

---

## Step 7: 验证清单

### 安装测试

| 测试项 | 操作 | 预期结果 |
|--------|------|---------|
| 安装 | 双击 Setup.exe | 出现安装向导，安装成功 |
| 桌面图标 | 查看桌面 | 出现 LinkingChat 图标 |
| 启动 | 双击桌面图标 | 应用启动，显示登录页 |
| SmartScreen | 首次安装 | 可能出现蓝色警告（未签名），点"仍要运行" |

### 功能测试

| 测试项 | 操作 | 预期结果 |
|--------|------|---------|
| 连接服务器 | 查看登录页 | 能加载（非 localhost） |
| 登录 | 输入账号密码 | 登录成功 |
| 发消息 (DM) | 给联系人发文字 | 对方收到 |
| 发消息 (群聊) | 在群组发文字 | 群成员收到 |
| Bot 对话 | 给 Jarvis 发消息 | 流式回复正常 |
| OpenClaw | Bot 对话时观察进程 | 本地 OpenClaw Gateway 启动 |
| 远程控制 | 手机发命令到 Desktop | 命令执行并返回结果 |

### 确认连接的是生产服务器

打开 DevTools (Ctrl+Shift+I)，Console 中输入：
```javascript
window.api.getAgentType()
```
应返回当前 agent 类型。

在 Network 标签中过滤 `linkchat-api`，确认请求发往 `https://linkchat-api.matrix-ai.com.cn`。

---

## 安装包大小参考

| 内容 | 大小 |
|------|------|
| Electron 运行时 | ~70MB |
| App 代码 | ~5MB |
| OpenClaw sidecar (node.exe + openclaw) | ~80MB |
| **安装包总计** | **~155MB** |

---

## 常见问题

### Q: SmartScreen 蓝色警告怎么办？

未签名的 exe 会触发 Windows SmartScreen 警告。解决方式：

| 方案 | 费用 | 说明 |
|------|------|------|
| 不处理 | 0 | 用户点"仍要运行"即可，第一次警告 |
| 代码签名证书 | ~500-2000 元/年 | 消除警告，增加用户信任 |
| Microsoft Store | 0 (上架费) | Store 分发自动签名 |

toB 场景下 SmartScreen 警告不是问题，客户可以接受。

### Q: 安装后 OpenClaw 没启动？

检查：
1. 安装目录下 `resources/openclaw-sidecar/` 是否存在
2. 里面是否有 `node.exe` 和 `node_modules/openclaw/`
3. 查看 logs 目录下的日志文件

### Q: 想同时支持 Hermes？

1. 准备 `apps/desktop/resources/hermes-env/` 目录（Python standalone + hermes）
2. `electron-builder.yaml` 已配置 `extraResources` 会自动打包
3. 用户在 Desktop 设置中切换 Agent 类型

### Q: 如何更新？

1. 修改代码 → 重新 `pnpm build && pnpm dist`
2. 生成新的 Setup.exe
3. 分发给用户覆盖安装（NSIS 默认覆盖安装，不需要卸载旧版）

---

## 开发环境恢复

打包测试完成后，回到开发模式不需要改任何配置：

```bash
cd apps/desktop
pnpm dev
```

`app.isPackaged = false` → 自动连接 localhost:3008。
