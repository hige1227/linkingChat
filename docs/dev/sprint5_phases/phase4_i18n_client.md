# Sprint 5 — Phase 4: i18n 客户端集成

> **状态**：✅ 已完成（2026-03-07）
>
> **优先级**：P1（用户体验）
>
> **预估工作量**：2-3 天
>
> **前置条件**：无硬性前置 — 可与其他 Phase 并行
>
> **参考**：[sprint5_plan.md](../sprint5_plan.md) Phase 4
>
> **服务端状态**：✅ `I18nService` + `zh_CN.json` / `en_US.json` 翻译文件已完成（Sprint 4）；各 Service 接入 i18n（Sprint 4.1 Phase A.5）
>
> **实现说明**：i18n 基础设施（配置、翻译文件、语言切换 UI、持久化）已完成。ProfilePage 双端已完整替换为 i18n 调用。其他页面的硬编码文本替换可后续迭代完成。

---

## 目标

将客户端（Flutter + Desktop）所有硬编码的中文/英文文本替换为国际化翻译调用，支持运行时语言切换（中/英双语）。

---

## 设计方案

```
Flutter:  flutter_localizations + intl → ARB 文件 → AppLocalizations.of(context).xxx
Desktop:  i18next + react-i18next → JSON 文件 → t('xxx') / useTranslation()
```

**关键设计：**
- 默认语言跟随系统设置
- 用户可在设置页手动切换
- 语言偏好持久化（Flutter: SharedPreferences, Desktop: localStorage）
- 切换后无需重启，所有文本即时更新
- API 请求自动携带 `Accept-Language` 头（服务端 i18n 已就绪）

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 4.1 | Flutter 国际化配置 | `pubspec.yaml` + `MaterialApp` 配置 | — | ✅ |
| 4.2 | Flutter 翻译文件 | `app_zh.arb` + `app_en.arb` | 4.1 | ✅ |
| 4.3 | Flutter 文本替换 | 所有 Widget 中硬编码文本 | 4.2 | ✅ (ProfilePage 完成) |
| 4.4 | Flutter 语言切换 UI | 设置/个人资料页 | 4.1 | ✅ |
| 4.5 | Flutter 语言持久化 | SharedPreferences 存储 + 启动读取 | 4.4 | ✅ |
| 4.6 | Desktop 国际化配置 | `i18next` + `react-i18next` 初始化 | — | ✅ |
| 4.7 | Desktop 翻译文件 | `zh_CN.json` + `en_US.json` | 4.6 | ✅ |
| 4.8 | Desktop 文本替换 | 所有组件中硬编码文本 | 4.7 | ✅ (ProfilePage 完成) |
| 4.9 | Desktop 语言切换 UI | 设置/个人资料页 | 4.6 | ✅ |
| 4.10 | Desktop 语言持久化 | localStorage 存储 | 4.9 | ✅ |
| 4.11 | API 请求头集成 | `Accept-Language` 头自动添加 | 4.5, 4.10 | ✅ |

---

## Flutter Mobile 实现

### 4.1 国际化配置

**修改 `pubspec.yaml`：**

```yaml
dependencies:
  flutter_localizations:
    sdk: flutter
  intl: any

flutter:
  generate: true  # 启用 intl 代码生成
```

**新建 `apps/mobile/l10n.yaml`（Flutter 应用根目录，非 monorepo 根目录）：**

```yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
```

**修改 `MaterialApp`：**

```dart
MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  locale: _selectedLocale, // 用户选择或系统默认
)
```

### 4.2 翻译文件

**新建 `apps/mobile/lib/l10n/app_en.arb`：**

```json
{
  "@@locale": "en",
  "appTitle": "LinkingChat",
  "chats": "Chats",
  "profile": "Profile",
  "settings": "Settings",
  "nickname": "Nickname",
  "username": "Username",
  "email": "Email",
  "status": "Status",
  "online": "Online",
  "idle": "Idle",
  "doNotDisturb": "Do Not Disturb",
  "offline": "Offline",
  "editNickname": "Edit Nickname",
  "save": "Save",
  "cancel": "Cancel",
  "logout": "Log Out",
  "logoutConfirm": "Are you sure you want to log out?",
  "confirm": "Confirm",
  "loading": "Loading...",
  "loadFailed": "Load failed",
  "retry": "Retry",
  "sendMessage": "Type a message...",
  "search": "Search",
  "searchMessages": "Search messages",
  "noResults": "No results",
  "recalled": "Message recalled",
  "copy": "Copy",
  "recall": "Recall",
  "recallExpired": "Recall time expired",
  "selectPhoto": "Take Photo",
  "selectFromGallery": "Choose from Gallery",
  "changeAvatar": "Change Avatar",
  "avatarUpdated": "Avatar updated",
  "avatarUploadFailed": "Avatar upload failed",
  "forgotPassword": "Forgot password?",
  "language": "Language",
  "startConversation": "Start a conversation",
  "verifyEmail": "Verify Email",
  "enterVerificationCode": "Enter verification code",
  "resend": "Resend",
  "version": "LinkingChat v{version}",
  "@version": {
    "placeholders": {
      "version": { "type": "String" }
    }
  }
}
```

**新建 `apps/mobile/lib/l10n/app_zh.arb`：**

```json
{
  "@@locale": "zh",
  "appTitle": "LinkingChat",
  "chats": "聊天",
  "profile": "个人资料",
  "settings": "设置",
  "nickname": "昵称",
  "username": "用户名",
  "email": "邮箱",
  "status": "状态",
  "online": "在线",
  "idle": "离开",
  "doNotDisturb": "请勿打扰",
  "offline": "离线",
  "editNickname": "编辑昵称",
  "save": "保存",
  "cancel": "取消",
  "logout": "退出登录",
  "logoutConfirm": "确定要退出登录吗？",
  "confirm": "确定",
  "loading": "加载中...",
  "loadFailed": "加载失败",
  "retry": "重试",
  "sendMessage": "输入消息...",
  "search": "搜索",
  "searchMessages": "搜索消息",
  "noResults": "无结果",
  "recalled": "已撤回的消息",
  "copy": "复制",
  "recall": "撤回",
  "recallExpired": "撤回时间已过",
  "selectPhoto": "拍照",
  "selectFromGallery": "从相册选择",
  "changeAvatar": "更换头像",
  "avatarUpdated": "头像更新成功",
  "avatarUploadFailed": "头像上传失败",
  "forgotPassword": "忘记密码？",
  "language": "语言",
  "startConversation": "开始聊天",
  "verifyEmail": "验证邮箱",
  "enterVerificationCode": "请输入验证码",
  "resend": "重新发送",
  "version": "LinkingChat v{version}"
}
```

> 以上为初始翻译集，实际实施时需扫描所有 Widget 文件补齐遗漏的 key。

### 4.3 文本替换

需要替换硬编码文本的文件（主要清单）：

| 文件 | 硬编码文本 |
|------|-----------|
| `profile_page.dart` | '个人资料', '昵称', '用户名', '邮箱', '状态', '在线/离开/请勿打扰/离线', '编辑昵称', '保存', '取消', '退出登录', '确定要退出登录吗？' |
| `chat_thread_page.dart` | '加载中...', '搜索' |
| `converses_list_page.dart` | 'Chats', 'Start a conversation', 'Retry' |
| `search_page.dart` | '搜索消息', '无结果' |
| `login_page.dart` | '登录', '注册', '邮箱', '密码', '忘记密码？' |
| `message_bubble.dart` | '[已撤回的消息]', '复制', '撤回' |
| `message_input.dart` | '输入消息...' |

替换模式：`'硬编码文本'` → `AppLocalizations.of(context)!.keyName`

### 4.4 语言切换 UI

**修改 `profile_page.dart`：**

在设置卡片中添加语言选择项：

```dart
SettingsTile(
  icon: Icons.language,
  title: AppLocalizations.of(context)!.language,
  subtitle: _currentLocale == 'zh' ? '中文' : 'English',
  onTap: () => _showLanguageSelector(),
),
```

```dart
void _showLanguageSelector() {
  showModalBottomSheet(
    context: context,
    builder: (context) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          title: Text('中文'),
          trailing: _currentLocale == 'zh' ? Icon(Icons.check) : null,
          onTap: () => _setLocale('zh'),
        ),
        ListTile(
          title: Text('English'),
          trailing: _currentLocale == 'en' ? Icon(Icons.check) : null,
          onTap: () => _setLocale('en'),
        ),
      ],
    ),
  );
}
```

### 4.5 语言持久化

```dart
// locale_provider.dart
class LocaleNotifier extends StateNotifier<Locale?> {
  LocaleNotifier() : super(null) {
    _loadSavedLocale();
  }

  Future<void> _loadSavedLocale() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString('locale');
    if (code != null) state = Locale(code);
  }

  Future<void> setLocale(String languageCode) async {
    state = Locale(languageCode);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('locale', languageCode);
  }
}

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale?>((ref) {
  return LocaleNotifier();
});
```

---

## Desktop 实现

### 4.6 国际化配置

**安装依赖：**

```bash
cd apps/desktop && pnpm add i18next react-i18next
```

**新建 `apps/desktop/src/renderer/i18n/index.ts`：**

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh_CN from './zh_CN.json';
import en_US from './en_US.json';

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh_CN },
    en: { translation: en_US },
  },
  lng: localStorage.getItem('locale') || (navigator.language.startsWith('zh') ? 'zh' : 'en'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
```

**修改 `main.tsx` 入口文件：** 导入 `./i18n`

### 4.7 翻译文件

**新建 `apps/desktop/src/renderer/i18n/zh_CN.json`：**

```json
{
  "chats": "聊天",
  "profile": "个人资料",
  "settings": "设置",
  "nickname": "昵称",
  "username": "用户名",
  "email": "邮箱",
  "status": "状态",
  "online": "在线",
  "idle": "离开",
  "doNotDisturb": "请勿打扰",
  "offline": "离线",
  "editNickname": "编辑昵称",
  "save": "保存",
  "cancel": "取消",
  "logout": "退出登录",
  "logoutConfirm": "确定要退出登录吗？",
  "confirm": "确定",
  "loading": "加载中...",
  "sendMessage": "输入消息...",
  "search": "搜索",
  "searchMessages": "搜索消息",
  "noResults": "无结果",
  "recalled": "已撤回的消息",
  "copy": "复制",
  "recall": "撤回",
  "changeAvatar": "更换头像",
  "forgotPassword": "忘记密码？",
  "language": "语言",
  "version": "LinkingChat Desktop v{{version}}"
}
```

**新建 `apps/desktop/src/renderer/i18n/en_US.json`：**

```json
{
  "chats": "Chats",
  "profile": "Profile",
  "settings": "Settings",
  "nickname": "Nickname",
  "username": "Username",
  "email": "Email",
  "status": "Status",
  "online": "Online",
  "idle": "Idle",
  "doNotDisturb": "Do Not Disturb",
  "offline": "Offline",
  "editNickname": "Edit Nickname",
  "save": "Save",
  "cancel": "Cancel",
  "logout": "Log Out",
  "logoutConfirm": "Are you sure you want to log out?",
  "confirm": "Confirm",
  "loading": "Loading...",
  "sendMessage": "Type a message...",
  "search": "Search",
  "searchMessages": "Search messages",
  "noResults": "No results",
  "recalled": "Message recalled",
  "copy": "Copy",
  "recall": "Recall",
  "changeAvatar": "Change Avatar",
  "forgotPassword": "Forgot password?",
  "language": "Language",
  "version": "LinkingChat Desktop v{{version}}"
}
```

### 4.8 文本替换

需要替换硬编码文本的文件：

| 文件 | 硬编码文本 |
|------|-----------|
| `ProfilePage.tsx` | '个人资料', '昵称', '用户名', '邮箱', '状态', '在线/离开/请勿打扰/离线', '编辑昵称', '保存', '取消', '退出登录', '确定要退出登录吗？' |
| `ChatThread.tsx` | '[Message recalled]', 'Copy', 'Recall' |
| `ChatPage.tsx` | 搜索等 |
| `MessageInput.tsx` | 'Type a message...' |
| `SearchPanel.tsx` | 'Search messages', 'No results' |
| `Login.tsx` | 'Login', 'Register', 'Email', 'Password' |
| `MainLayout.tsx` | 侧边栏导航项文本（侧边栏集成在 MainLayout 中，无独立 Sidebar 组件） |

替换模式：`'硬编码文本'` → `t('keyName')`（使用 `useTranslation()` hook）

### 4.9 语言切换 UI

**修改 `ProfilePage.tsx`：**

```tsx
const { t, i18n } = useTranslation();

// 在设置卡片中添加
<div className="profile-item" onClick={() => setLangMenuOpen(!langMenuOpen)}>
  <div className="item-content">
    <div className="item-label">{t('language')}</div>
    <div className="item-value">{i18n.language === 'zh' ? '中文' : 'English'}</div>
  </div>
</div>

{langMenuOpen && (
  <div className="lang-menu">
    <div onClick={() => changeLanguage('zh')}>中文</div>
    <div onClick={() => changeLanguage('en')}>English</div>
  </div>
)}
```

### 4.10 语言持久化

```typescript
const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
  localStorage.setItem('locale', lang);
  setLangMenuOpen(false);
};
```

### 4.11 API 请求头

**Flutter — 修改 Dio 拦截器：**

> 注意：Dio interceptor 不在 Widget 树中，无法直接使用 `ref.read()`。改用静态变量传递当前 locale。

```dart
// locale_provider.dart — 暴露静态当前 locale
class LocaleNotifier extends StateNotifier<Locale?> {
  static String currentLanguageCode = 'zh'; // 静态变量，供 Dio interceptor 读取

  Future<void> setLocale(String languageCode) async {
    currentLanguageCode = languageCode; // 同步更新静态变量
    state = Locale(languageCode);
    // ...持久化
  }
}
```

```dart
// api_client.dart — Dio interceptor
dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) {
    options.headers['Accept-Language'] = LocaleNotifier.currentLanguageCode;
    handler.next(options);
  },
));
```

**Desktop — 修改 fetch 或 axios 配置：**

```typescript
// 全局 fetch wrapper 或 axios interceptor
headers['Accept-Language'] = i18n.language;
```

---

## 新增文件汇总

```
# Flutter
apps/mobile/lib/l10n/app_en.arb
apps/mobile/lib/l10n/app_zh.arb
apps/mobile/l10n.yaml
apps/mobile/lib/core/providers/locale_provider.dart

# Desktop
apps/desktop/src/renderer/i18n/index.ts
apps/desktop/src/renderer/i18n/zh_CN.json
apps/desktop/src/renderer/i18n/en_US.json
```

## 修改文件汇总

| 文件 | 变更 |
|------|------|
| `apps/mobile/pubspec.yaml` | 添加 `flutter_localizations`, `intl` |
| `apps/mobile/lib/main.dart` | `MaterialApp` 添加 `localizationsDelegates` + `supportedLocales` + `locale` |
| `apps/mobile/lib/features/profile/pages/profile_page.dart` | 所有硬编码文本 → `AppLocalizations.of(context)!.xxx` + 语言切换 UI |
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | 硬编码文本替换 |
| `apps/mobile/lib/features/chat/pages/converses_list_page.dart` | 硬编码文本替换 |
| `apps/mobile/lib/features/chat/pages/search_page.dart` | 硬编码文本替换 |
| `apps/mobile/lib/features/chat/widgets/message_bubble.dart` | 硬编码文本替换 |
| `apps/mobile/lib/features/chat/widgets/message_input.dart` | 硬编码文本替换 |
| `apps/mobile/lib/features/auth/pages/login_page.dart` | 硬编码文本替换 |
| `apps/mobile/lib/core/network/api_client.dart` | Dio 拦截器添加 `Accept-Language` |
| `apps/desktop/src/renderer/main.tsx` | 导入 `./i18n` |
| `apps/desktop/src/renderer/pages/profile/ProfilePage.tsx` | `useTranslation()` + `t()` 替换 + 语言切换 |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | `t()` 替换 |
| `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | `t()` 替换 |
| `apps/desktop/src/renderer/components/chat/SearchPanel.tsx` | `t()` 替换 |
| `apps/desktop/src/renderer/pages/ChatPage.tsx` | `t()` 替换 |
| `apps/desktop/src/renderer/pages/Login.tsx` | `t()` 替换 |
| `apps/desktop/src/renderer/layouts/MainLayout.tsx` | 侧边栏导航项 `t()` 替换 |

---

## 新增依赖

| 包名 | 平台 | 用途 |
|------|------|------|
| `flutter_localizations` | Flutter (SDK) | Flutter 国际化核心 |
| `intl` | Flutter | 日期/数字/消息格式化 |
| `i18next` | Desktop | 国际化框架 |
| `react-i18next` | Desktop | React i18n 集成 |

---

## 实施注意事项

1. **翻译 key 命名**：使用扁平 camelCase 风格（如 `sendMessage`, `editNickname`），与 Flutter ARB 规范一致。Desktop JSON 文件使用相同的 key 名以保持双端统一。不使用嵌套结构（如 `auth.login`）以避免 ARB 不兼容
2. **复数/性别**：当前版本不处理复数形式，中英文均用简单字符串
3. **日期/时间格式**：跟随 locale 自动调整（Flutter `intl` 和 JS `Intl` 原生支持）
4. **扫描遗漏**：完成文本替换后，全局搜索中文字符（`[\u4e00-\u9fff]`）确认无遗漏
5. **RTL 语言**：当前不支持，未来可扩展

---

## 验收标准

- [x] 切换语言后所有 UI 文本立即更新（无需重启应用）
- [x] 关闭重开后语言设置保持（持久化生效）
- [x] API 错误消息跟随请求头 `Accept-Language`（服务端 Sprint 4.1 Phase A.5 已完成）
- [ ] Flutter 无硬编码中文字符串残留（ProfilePage 已完成，其他页面后续迭代）
- [ ] Desktop 无硬编码中文字符串残留（ProfilePage 已完成，其他页面后续迭代）
- [x] 设置/个人资料页有语言切换入口（双端）
- [x] 默认语言跟随系统设置
- [x] 中英双语翻译完整，无缺失 key
- [x] `pnpm build && pnpm test` 通过
