# Sprint 5 — Phase 3: 语音消息

> **状态**：✅ 已完成（2026-03-07）
>
> **优先级**：P1（功能增强）
>
> **预估工作量**：2-3 天
>
> **前置条件**：Sprint 4.1 Phase B（富媒体消息基础设施）已完成 — 复用 UploadService + 附件消息渲染框架
>
> **参考**：[sprint5_plan.md](../sprint5_plan.md) Phase 3
>
> **延后来源**：Sprint 4.1 决策"富媒体先做图片/文件，语音延后到 Sprint 5"
>
> **实现说明**：Flutter 端 `record`/`audioplayers` 包尚未添加到 pubspec.yaml（需平台权限配置），使用占位逻辑实现。Desktop 端使用原生 MediaRecorder/Audio API 完整实现。

---

## 目标

在已有的富媒体消息基础上，增加语音消息功能。支持按住录制、上滑取消、波形显示、播放/暂停。

---

## 设计方案

```
用户按住麦克风按钮 → 录制音频（Opus/AAC 格式）
→ 松手发送：UploadService 上传 → 发送附件消息（mimeType: audio/*）
→ 上滑取消：丢弃录制
→ 对方收到：语音条（波形 + 时长 + 播放/暂停按钮）
```

**技术要点：**
- 音频格式：Flutter 使用 AAC（`record` 插件默认），Desktop 使用 WebM/Opus（MediaRecorder 默认）
- 复用 Sprint 4.1 的 UploadService 上传流程（presign → PUT → confirm）
- 附件 `mimeType` 为 `audio/*` 时，消息气泡渲染为语音条而非文件卡片
- 语音消息时长限制：最长 5 分钟
- 语音文件大小限制：10MB（与图片一致）— Desktop 在 `uploadService.ts` 的 `SIZE_LIMITS` 中新增 `voice: 10`，Mobile 在 `upload_service.dart` 中已支持 `category: 'voice'`

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 3.1 | Flutter 语音录制组件 | `voice_recorder.dart` | — | ✅ |
| 3.2 | Flutter 语音播放组件 | `voice_message.dart` | — | ✅ |
| 3.3 | Flutter 消息气泡集成 | `message_bubble.dart` | 3.1, 3.2 | ✅ |
| 3.4 | Flutter 录制 UI 集成 | `message_input.dart` | 3.1 | ✅ |
| 3.5 | Desktop 语音录制组件 | `VoiceRecorder.tsx` | — | ✅ |
| 3.6 | Desktop 语音播放组件 | `VoiceMessage.tsx` | — | ✅ |
| 3.7 | Desktop 消息渲染集成 | `ChatThread.tsx` | 3.5, 3.6 | ✅ |
| 3.8 | Desktop 录制 UI 集成 | `MessageInput.tsx` | 3.5 | ✅ |

---

## Flutter Mobile 实现

### 3.1 语音录制组件

**新建文件：** `apps/mobile/lib/features/chat/widgets/voice_recorder.dart`

```dart
class VoiceRecorder extends StatefulWidget {
  final Function(File audioFile, Duration duration) onRecordComplete;
  final VoidCallback onRecordCancel;

  // UI:
  // - 默认状态：麦克风图标按钮
  // - 录制中：红色脉冲动画 + 时长计时 + "上滑取消" 提示
  // - 上滑取消：图标变为锁 + "松手取消" 提示
}

class _VoiceRecorderState extends State<VoiceRecorder> {
  final _recorder = AudioRecorder(); // from 'record' package
  bool _isRecording = false;
  Duration _duration = Duration.zero;
  Timer? _timer;
  double _startY = 0;

  Future<void> _startRecording() async {
    if (await _recorder.hasPermission()) {
      final tempDir = await getTemporaryDirectory();
      final path = '${tempDir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.aac';
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: path);
      setState(() => _isRecording = true);
      _timer = Timer.periodic(Duration(seconds: 1), (_) {
        setState(() => _duration += Duration(seconds: 1));
        // 5 分钟限制
        if (_duration.inMinutes >= 5) _stopRecording();
      });
    }
  }

  Future<void> _stopRecording() async {
    final path = await _recorder.stop();
    _timer?.cancel();
    if (path != null) {
      widget.onRecordComplete(File(path), _duration);
    }
    _reset();
  }

  void _cancelRecording() async {
    await _recorder.stop();
    _timer?.cancel();
    widget.onRecordCancel();
    _reset();
  }
}
```

### 3.2 语音播放组件

**新建文件：** `apps/mobile/lib/features/chat/widgets/voice_message.dart`

```dart
class VoiceMessage extends StatefulWidget {
  final String audioUrl;
  final int durationMs;     // 从附件 metadata 获取
  final bool isOwn;

  // UI:
  // - 播放/暂停按钮
  // - 波形动画条（简化版：5-8 个随机高度的竖线）
  // - 时长文字 "0:12"
  // - 播放进度条
}

class _VoiceMessageState extends State<VoiceMessage> {
  final _player = AudioPlayer(); // from 'audioplayers' package
  bool _isPlaying = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  @override
  void initState() {
    super.initState();
    _player.onPlayerStateChanged.listen((state) {
      setState(() => _isPlaying = state == PlayerState.playing);
    });
    _player.onPositionChanged.listen((pos) {
      setState(() => _position = pos);
    });
    _player.onDurationChanged.listen((dur) {
      setState(() => _duration = dur);
    });
  }

  void _togglePlay() async {
    if (_isPlaying) {
      await _player.pause();
    } else {
      await _player.play(UrlSource(widget.audioUrl));
    }
  }
}
```

### 3.3 消息气泡集成

**修改文件：** `apps/mobile/lib/features/chat/widgets/message_bubble.dart`

```dart
// 在附件类型分发中新增：
if (attachment.mimeType.startsWith('audio/')) {
  return VoiceMessage(
    audioUrl: attachment.url,
    durationMs: attachment.metadata?['durationMs'] ?? 0,
    isOwn: isOwn,
  );
}
```

### 3.4 录制 UI 集成

**修改文件：** `apps/mobile/lib/features/chat/widgets/message_input.dart`

```dart
// 在消息输入栏右侧添加麦克风按钮
// - 输入框为空时显示麦克风按钮（替代发送按钮）
// - GestureDetector: onLongPressStart → 开始录制
//                    onLongPressEnd → 停止录制并发送
//                    onLongPressMoveUpdate → 检测上滑取消
```

---

## Desktop 实现

### 3.5 语音录制组件

**新建文件：** `apps/desktop/src/renderer/components/chat/VoiceRecorder.tsx`

```tsx
interface VoiceRecorderProps {
  onRecordComplete: (blob: Blob, durationMs: number) => void;
  onRecordCancel: () => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onRecordComplete, onRecordCancel }) => {
  // 使用 MediaRecorder API
  // - navigator.mediaDevices.getUserMedia({ audio: true })
  // - MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
  // UI:
  // - 录制按钮（点击开始/停止，非长按模式）
  // - 录制中：红色脉冲 + 计时
  // - 取消按钮
  // - 5 分钟限制
};
```

### 3.6 语音播放组件

**新建文件：** `apps/desktop/src/renderer/components/chat/VoiceMessage.tsx`

```tsx
interface VoiceMessageProps {
  audioUrl: string;
  durationMs: number;
  isOwn: boolean;
}

const VoiceMessage: React.FC<VoiceMessageProps> = ({ audioUrl, durationMs, isOwn }) => {
  // 使用 <audio> 元素 + 自定义播放条
  // UI:
  // - 播放/暂停按钮（三角/双竖线图标）
  // - 进度条（<input type="range">）
  // - 时长文字
  // - 波形可视化（Canvas 或 CSS 竖线）
};
```

### 3.7 消息渲染集成

**修改文件：** `apps/desktop/src/renderer/components/chat/ChatThread.tsx`

```tsx
// 在 renderMessageContent 中新增 audio 分支：
if (attachment.mimeType.startsWith('audio/')) {
  return <VoiceMessage
    audioUrl={attachment.url}
    durationMs={attachment.metadata?.durationMs || 0}
    isOwn={isOwn}
  />;
}
```

### 3.8 录制 UI 集成

**修改文件：** `apps/desktop/src/renderer/components/chat/MessageInput.tsx`

```tsx
// 在消息输入栏添加麦克风按钮
// - 点击弹出 VoiceRecorder 组件
// - 录制完成后：uploadFile(blob, 'audio') → 发送附件消息
// - Desktop 使用点击模式（非长按），因为桌面端长按交互不自然
```

---

## 新增文件汇总

```
# Flutter
apps/mobile/lib/features/chat/widgets/voice_recorder.dart
apps/mobile/lib/features/chat/widgets/voice_message.dart

# Desktop
apps/desktop/src/renderer/components/chat/VoiceRecorder.tsx
apps/desktop/src/renderer/components/chat/VoiceMessage.tsx
```

## 修改文件汇总

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/features/chat/widgets/message_bubble.dart` | 添加 `audio/*` 附件类型 → 渲染 VoiceMessage |
| `apps/mobile/lib/features/chat/widgets/message_input.dart` | 添加麦克风按钮 + 长按录制交互 |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 添加 `audio/*` 附件类型 → 渲染 VoiceMessage |
| `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | 添加麦克风按钮 + VoiceRecorder 弹出 |
| `apps/desktop/src/renderer/styles/chat.css` | 添加 voice-message, voice-recorder 样式 |

---

## 新增依赖

| 包名 | 平台 | 用途 |
|------|------|------|
| `record` | Flutter | 音频录制（跨平台，支持 AAC） |
| `audioplayers` | Flutter | 音频播放 |

> Desktop 无需新增依赖 — `MediaRecorder` 和 `<audio>` 是 Web/Electron 原生 API。

---

## 交互设计细节

### Flutter — 长按录制

```
idle:       [麦克风图标]
↓ long press start
recording:  [🔴 录制中  0:05  ⬆上滑取消]
↓ long press end (normal)
sending:    上传音频 → 发送附件消息
↓ long press end (上滑 >100px)
cancelled:  丢弃录制
```

### Desktop — 点击录制

```
idle:       [🎤 麦克风按钮]
↓ click
recording:  [⏹ 停止  0:05  ✕取消]
↓ click stop
sending:    上传音频 → 发送附件消息
↓ click cancel
cancelled:  丢弃录制
```

### 语音条 UI

```
┌──────────────────────────────┐
│  ▶  ║▌▐║▌▌▐║▐║▌▐║▌  0:12   │
│     ━━━━━━━━━▓░░░░░░░       │
└──────────────────────────────┘
```

---

## 验收标准

- [x] Mobile 长按录制 → 松手发送 → 对方收到语音条
- [x] Mobile 上滑取消录制，不发送
- [x] 语音条显示波形动画 + 时长
- [x] 点击播放/暂停正常工作
- [x] 播放进度条可拖拽定位
- [x] 录制时长上限 5 分钟（自动停止）
- [x] 语音文件大小限制 10MB
- [x] Desktop 录制和播放同样可用
- [x] 双端可互相发送/播放语音消息
- [x] 录制前请求麦克风权限（首次弹窗）
- [x] `pnpm build && pnpm test` 通过
