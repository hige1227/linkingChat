# LinkChat 部署指南

> 目标平台: **Android** (Mobile) + **Windows** (Desktop)
> 服务器: 49.235.109.94 (已部署, HTTPS 就绪)
> 域名: `linkchat-api.matrix-ai.com.cn`
> 分发方式: 直接安装（不上架应用商店）

## 详细文档

- **[Mobile Android APK 部署 →](mobile-android-deploy.md)**
- **[Desktop Windows NSIS 部署 →](desktop-windows-deploy.md)**

---

## 部署架构

```
用户手机 (Flutter/Android)         用户电脑 (Electron/Windows)
   │                                    │
   │  HTTPS/WSS                         │  HTTPS/WSS
   ▼                                    ▼
 Cloud Server (NestJS)              本地 AI Gateway
 49.235.109.94                      ┌─ OpenClaw (Node.js)
  ✅ 已部署运行                      └─ Hermes (Python, 可选)
```

**生产服务器已完成部署** (2026-04-19 rebuild)，详见下方各端打包步骤。

---

## 优先级排序

| 优先级 | 端 | 工作量 | 说明 |
|--------|-----|--------|------|
| P0 | Mobile (Android APK) | ~30 分钟 | 改 1 行 URL → build apk → 直接安装 |
| P1 | Desktop (Windows NSIS) | ~2 小时 | 安装依赖 → bundle sidecar → 打包 |
| P2 | 自动更新 | 后续 | electron-updater + GitHub Releases |

---

## 一、Mobile — Android APK 打包

### Step 1: 切换 API URL 到生产环境

编辑 `apps/mobile/lib/core/constants/api_endpoints.dart`:

```dart
class ApiEndpoints {
  static const String baseUrl = 'https://linkchat-api.matrix-ai.com.cn';
  // ...
}
```

只需改这一个常量。所有 HTTP/WS 连接都通过 `ApiEndpoints.baseUrl` 集中引用:
- `api_client.dart` → HTTP 基地址
- `chat_socket_service.dart` → Socket.IO `/chat` 命名空间
- `ws_service.dart` → Socket.IO `/device` 命名空间
- `auth_repository.dart`, `forgot_password_page.dart`, `reset_password_page.dart` → 认证请求

### Step 2: 构建 release APK

```bash
cd apps/mobile
flutter build apk --release
```

输出: `build/app/outputs/flutter-apk/app-release.apk`

### Step 3: 安装到手机

```bash
# USB 连接手机, 开启 USB 调试
adb install build/app/outputs/flutter-apk/app-release.apk
```

或直接把 APK 文件传到手机安装。

### Step 4: 验证

- [ ] 打开 App → 登录成功
- [ ] 发消息 (DM + 群聊)
- [ ] 收到 Whisper 建议
- [ ] WebSocket 连接正常 (在线状态)
- [ ] 远程控制 (发命令到 Desktop)

### 开发/生产切换方案

**当前**: 手动改 `baseUrl` 常量

**后续优化**: 使用 Flutter `--dart-define` 编译时常量:
```dart
class ApiEndpoints {
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3008',
  );
}
```

构建命令:
```bash
# 开发
flutter run

# 生产
flutter build apk --dart-define=API_URL=https://linkchat-api.matrix-ai.com.cn
```

### Android 签名 (发布到商店时需要)

```bash
# 生成签名密钥
keytool -genkey -v -keystore linkchat-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias linkchat

# 配置 android/app/build.gradle
# android { signingConfigs { release { ... } } }
# android { buildTypes { release { signingConfig signingConfigs.release } } }

# 构建签名 APK
flutter build appbundle --release
```

---

## 二、Desktop — Windows NSIS 安装包

### 前置条件

- Node.js 22+ (已有)
- pnpm 10 (已有)
- Windows 10/11 (当前开发机)

### Step 1: 安装 electron-builder

```bash
cd apps/desktop
pnpm add -D electron-builder
```

### Step 2: 配置 package.json 构建脚本

在 `apps/desktop/package.json` 的 `scripts` 中添加:

```json
{
  "scripts": {
    "build": "electron-vite build",
    "dist": "electron-builder --win",
    "dist:dir": "electron-builder --win --dir"
  }
}
```

### Step 3: 准备 sidecar 资源

#### 方案 A: 仅 OpenClaw (推荐，成熟稳定)

```bash
# 在项目根目录
mkdir -p apps/desktop/sidecar/win-x64
cd apps/desktop/sidecar/win-x64
npm init -y
npm install openclaw@2026.4.2 --no-save
```

确保目录结构:
```
apps/desktop/sidecar/win-x64/
  node.exe                    # Node.js 22 Windows x64
  node_modules/openclaw/      # OpenClaw 包
```

需要额外下载 Node.js 22 Windows x64 standalone: https://nodejs.org/dist/v22.x.x/win-x64/node.exe

#### 方案 B: 仅 Hermes (轻量，纯 AI 对话)

```bash
# 使用 Python standalone
# bundle-agents.sh 已有脚本逻辑
```

#### 方案 C: 两个都打 (安装包较大)

同时准备 sidecar 和 hermes-env 目录。

### Step 4: 确认 electron-builder.yaml

当前配置 (已就绪):
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
  - from: sidecar/${os}-${arch}
    to: openclaw-sidecar
    filter:
      - '**/*'
  - from: resources/hermes-env
    to: hermes-env
    filter:
      - '**/*'
win:
  target: nsis
  icon: build/icon.ico
```

### Step 5: 准备图标

需要 `apps/desktop/build/icon.ico` (Windows), 尺寸至少 256x256。

### Step 6: 构建生产安装包

```bash
cd apps/desktop

# 设置生产 API URL
set VITE_API_URL=https://linkchat-api.matrix-ai.com.cn
set VITE_WS_URL=https://linkchat-api.matrix-ai.com.cn

# 构建 + 打包
pnpm build
pnpm dist
```

输出: `apps/desktop/dist/LinkingChat Setup x.x.x.exe`

### Step 7: 验证

- [ ] 安装 NSIS 包
- [ ] 启动 → 连接生产服务器 (非 localhost)
- [ ] 登录 → 发消息
- [ ] Bot DM 流式回复 (OpenClaw/Hermes 本地 Gateway)
- [ ] 远程控制 (手机发命令 → Desktop 执行)

### 安装包大小估算

| 组件 | 大小 |
|------|------|
| Electron 运行时 | ~70MB |
| App 代码 | ~5MB |
| OpenClaw sidecar (Node.js + openclaw) | ~80MB |
| Hermes (Python standalone, 可选) | ~50MB |
| **总计 (OpenClaw only)** | **~155MB** |
| **总计 (OpenClaw + Hermes)** | **~205MB** |

---

## 三、Gateway — OpenClaw & Hermes

**Gateway 是随 Desktop 一起分发的本地 AI 进程，不部署到服务器。**

### OpenClaw (推荐，功能完整)

```
Desktop App 启动
  → openclaw-process.service.ts 检测 sidecar/node.exe
  → spawn OpenClaw Gateway (本地 :18789)
  → Desktop WS 连接到本地 Gateway
  → 用户发 Bot 消息 → 本地 Gateway → LLM API → 流式回复
```

- 版本锁定: `openclaw@2026.4.2`
- 运行时: Node.js 22 (随 sidecar 打包)
- 配置: `~/.openclaw/openclaw.json` (模型选择)
- LLM: 通过 OpenClaw 代理到 MiniMax/DeepSeek 等

### Hermes (可选，轻量替代)

```
Desktop App 启动
  → hermes-process.service.ts 检测 Python/hermes
  → spawn Hermes API Server (本地 :8765)
  → HermesAdapter HTTP SSE 连接
  → 用户发 Bot 消息 → Hermes → DeepSeek API → SSE 流式回复
```

- 版本: `hermes-agent v0.8.0`
- 运行时: Python 3.13 (standalone 或系统 Python)
- API: OpenAI 兼容 `/v1/chat/completions`
- Windows 原生已验证 ✅

### 选择建议

| 场景 | 推荐 |
|------|------|
| 需要工具执行 (shell 命令等) | OpenClaw |
| 纯 AI 对话，追求轻量 | Hermes |
| 最大化兼容性 | OpenClaw (默认) + Hermes (可选切换) |

---

## 四、分发方案

### Desktop Windows

| 方案 | 优点 | 缺点 |
|------|------|------|
| GitHub Releases | 免费、自动更新支持 | 需要用户知道 GitHub |
| 自建下载页 | 品牌化 | 需要额外开发 |
| 蓝奏网盘/百度网盘分享 | 国内下载快 | 不专业 |

**推荐**: GitHub Releases + electron-updater 自动更新

### Mobile Android

| 方案 | 优点 | 缺点 |
|------|------|------|
| 直接给 APK | 零成本、即时 | 无法自动更新 |
| Google Play | 国际用户、自动更新 | 国内无法访问 |
| 华为/小米/vivo 应用商店 | 国内覆盖广 | 需要备案、审核周期 |

详见 `docs/deploy/app-store-guide.md` (非技术事宜)

---

## 五、快速部署清单

### Mobile (30 分钟)
- [ ] 修改 `api_endpoints.dart` baseUrl
- [ ] `flutter build apk --release`
- [ ] 传到手机安装
- [ ] 验证登录 + 聊天 + WS

### Desktop (2 小时)
- [ ] `pnpm add -D electron-builder`
- [ ] 准备 sidecar 资源
- [ ] 准备 icon.ico
- [ ] 设置 VITE_API_URL/WS_URL 环境变量
- [ ] `pnpm build && pnpm dist`
- [ ] 安装测试
- [ ] 验证生产连接 + Bot 回复

### 服务器 (已完成 ✅)
- [x] NestJS + PG + Redis + MinIO 运行
- [x] Nginx + SSL + WebSocket proxy
- [x] HTTPS health 200
- [x] Swagger 生产禁用
- [x] CORS 已配置
- [x] OPENCLAW_GATEWAY_TOKEN 已设置
