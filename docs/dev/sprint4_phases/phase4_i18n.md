# Sprint 4 — Phase 4: i18n 国际化

> **状态**：✅ 服务端完成（I18nService + zh_CN/en_US + Accept-Language 检测 + 13 tests）
>
> **优先级**：P7（第 7 个工作包）
>
> **预估工作量**：2-3 天
>
> **前置条件**：线 A 功能全部稳定后统一做多语言
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 4

---

## 目标

支持中文和英文双语，所有用户可见的文本均可切换语言。包括 Server 错误信息、Flutter UI、Desktop UI、Bot 消息。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 4.1 | 服务端 i18n | nestjs-i18n 或自建 | — | 🔜 |
| 4.2 | Flutter i18n | flutter_localizations + intl | — | 🔜 |
| 4.3 | Desktop i18n | i18next + react-i18next | — | 🔜 |
| 4.4 | 中文语言包 | zh_CN.json / zh_CN.arb | 4.1-4.3 | 🔜 |
| 4.5 | 英文语言包 | en_US.json / en_US.arb | 4.1-4.3 | 🔜 |
| 4.6 | 语言切换 UI | 设置页面 | 4.2, 4.3 | 🔜 |
| 4.7 | Bot 消息多语言 | 欢迎消息、通知卡片 | 4.1 | 🔜 |
| 4.8 | 系统消息多语言 | "XX 加入了群组" 等 | 4.1 | 🔜 |

---

## 目录结构

```
# Flutter
apps/mobile/lib/l10n/
  ├── app_zh.arb          # 中文
  └── app_en.arb          # 英文

# Desktop (React)
apps/desktop/src/renderer/i18n/
  ├── index.ts            # i18next 初始化
  ├── zh_CN.json
  └── en_US.json

# Server
apps/server/src/i18n/
  ├── zh_CN.json          # API 错误信息
  └── en_US.json
```

---

## 实现要点

### Server: Accept-Language 请求头

```typescript
// 中间件读取 Accept-Language，设置当前语言
@Injectable()
export class I18nMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const lang = req.headers['accept-language']?.startsWith('zh') ? 'zh' : 'en';
    req['lang'] = lang;
    next();
  }
}
```

### Flutter: MaterialApp 配置

```dart
MaterialApp(
  localizationsDelegates: [
    AppLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ],
  supportedLocales: [Locale('zh'), Locale('en')],
  locale: settingsProvider.locale,
)
```

### Desktop: react-i18next

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './zh_CN.json';
import en from './en_US.json';

i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: 'zh',
  fallbackLng: 'en',
});
```

---

## 新增文件

```
apps/mobile/lib/l10n/app_zh.arb
apps/mobile/lib/l10n/app_en.arb
apps/desktop/src/renderer/i18n/index.ts
apps/desktop/src/renderer/i18n/zh_CN.json
apps/desktop/src/renderer/i18n/en_US.json
apps/server/src/i18n/zh_CN.json
apps/server/src/i18n/en_US.json
apps/server/src/common/middleware/i18n.middleware.ts
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/mobile/pubspec.yaml` | 添加 flutter_localizations + intl |
| `apps/mobile/lib/main.dart` | 配置 localizationsDelegates |
| `apps/desktop/package.json` | 添加 i18next + react-i18next |
| `apps/desktop/src/renderer/App.tsx` | 包裹 I18nextProvider |
| 所有含硬编码中文的 Flutter Widget | 替换为 `AppLocalizations.of(context).xxx` |
| 所有含硬编码中文的 React 组件 | 替换为 `t('xxx')` |
| `apps/server/src/app.module.ts` | 注册 I18nMiddleware |

---

## 验收标准

- [ ] 切换语言后所有 UI 文本立即更新（无需重启）
- [ ] API 错误信息跟随请求头 Accept-Language
- [ ] Bot 欢迎消息根据用户语言偏好发送
- [ ] NotificationCard 文本多语言
- [ ] 没有硬编码的中文字符串残留（grep 验证）
- [ ] Flutter 和 Desktop 设置页面有语言切换入口
- [ ] `pnpm build && pnpm test` 通过
- [ ] `flutter analyze` 无 issue
