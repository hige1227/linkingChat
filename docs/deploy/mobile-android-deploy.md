# Mobile — Android APK 部署指南

> 目标：构建可直接安装的 APK，连接公网服务器
> 服务器：`https://linkchat-api.matrix-ai.com.cn` (已部署)
> 分发方式：直接给用户安装（不走应用商店）

---

## 前置条件

| 条件 | 检查命令 | 预期输出 |
|------|---------|---------|
| Flutter SDK | `flutter --version` | Flutter 3.x |
| Android SDK | `flutter doctor` | Android toolchain ✅ |
| 代理 (pub.dev) | 需要能访问 pub.dev | — |

---

## Step 1: 切换 API URL 到生产环境

### 1.1 修改唯一一处 URL

文件：`apps/mobile/lib/core/constants/api_endpoints.dart`

```dart
class ApiEndpoints {
  static const String baseUrl = 'https://linkchat-api.matrix-ai.com.cn';
  // ... 其余不变
}
```

**只需改这一行。** 以下文件都通过 `ApiEndpoints.baseUrl` 引用，无需修改：
- `api_client.dart` — HTTP 基地址
- `chat_socket_service.dart` — Socket.IO `/chat`
- `ws_service.dart` — Socket.IO `/device`
- `auth_repository.dart` — 登录注册
- `forgot_password_page.dart` — 忘记密码
- `reset_password_page.dart` — 重置密码

### 1.2 (可选) 更好的方案：编译时常量

以后可以用 `--dart-define` 避免手动改代码：

```dart
class ApiEndpoints {
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3008',
  );
}
```

这样开发时自动用 localhost，生产构建时：
```bash
flutter build apk --dart-define=API_URL=https://linkchat-api.matrix-ai.com.cn
```

---

## Step 2: 安装依赖

```bash
cd apps/mobile
flutter pub get
```

如果 pub.dev 连不上，设置代理：
```bash
# Windows CMD
set HTTP_PROXY=http://127.0.0.1:7890
set HTTPS_PROXY=http://127.0.0.1:7890

# Windows PowerShell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"

# 然后重试
flutter pub get
```

把 `7890` 换成你代理软件的实际端口（Clash 默认 7890）。

---

## Step 3: 构建 Release APK

```bash
cd apps/mobile
flutter build apk --release
```

构建过程约 3-5 分钟。输出文件：

```
apps/mobile/build/app/outputs/flutter-apk/app-release.apk
```

### 常见构建问题

| 错误 | 原因 | 解决 |
|------|------|------|
| `pub.dev 连接失败` | 网络问题 | 设置代理 |
| `Android SDK not found` | 缺少 Android SDK | 运行 `flutter doctor` 按提示安装 |
| `Gradle 下载失败` | Gradle 被墙 | 在 `android/gradle.properties` 加代理配置 |
| `minSdkVersion` 错误 | SDK 版本不匹配 | 检查 `android/app/build.gradle` 的 minSdkVersion |

### Gradle 代理配置 (如需要)

文件：`apps/mobile/android/gradle.properties`

```properties
systemProp.http.proxyHost=127.0.0.1
systemProp.http.proxyPort=7890
systemProp.https.proxyHost=127.0.0.1
systemProp.https.proxyPort=7890
```

---

## Step 4: 安装到手机

### 方式 A：USB 数据线

1. 手机开启「开发者模式」和「USB 调试」
2. USB 连接电脑
3. 运行：

```bash
adb install build/app/outputs/flutter-apk/app-release.apk
```

### 方式 B：直接传输

1. 把 `app-release.apk` 通过微信/QQ/邮件发给手机
2. 手机上打开文件，点击安装
3. 如果提示「未知来源」，去 设置→安全→允许安装未知来源应用

### 方式 C：扫码下载

把 APK 上传到任意网盘/文件托管服务，生成下载链接，手机扫码下载安装。

---

## Step 5: 验证清单

安装后逐项测试：

| 测试项 | 操作 | 预期结果 |
|--------|------|---------|
| 注册 | 输入邮箱+密码注册 | 注册成功，自动登录 |
| 登录 | 输入已有账号密码 | 登录成功，进入聊天列表 |
| 发消息 (DM) | 给联系人发文字 | 对方收到消息 |
| 发消息 (群聊) | 在群组发文字 | 群成员收到 |
| 在线状态 | 观察 contacts | 在线的联系人显示绿点 |
| 接收消息 | 让别人给你发消息 | 实时收到（WebSocket 正常） |
| 远程控制 | Devices 页面发命令 | Desktop 执行并返回结果 |

---

## 切回开发环境

测试完生产环境后，改回本地开发：

```dart
// apps/mobile/lib/core/constants/api_endpoints.dart
static const String baseUrl = 'http://localhost:3008';
```

然后 `flutter run` 即可。
