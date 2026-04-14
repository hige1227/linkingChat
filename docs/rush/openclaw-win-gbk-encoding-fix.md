# OpenClaw Windows GBK 编码修复 — 排坑记录

> **日期**: 2026-04-12
> **问题**: Windows 中文系统上 OpenClaw `exec` 工具输出中文文件名乱码
> **影响版本**: OpenClaw v2026.4.2 (全局 npm 安装)
> **修复文件**: `%APPDATA%\npm\node_modules\openclaw\dist\model-runtime-D4KJqIwp.js`

---

## 1. 问题现象

Desktop Bot DM 中让 Agent 执行 `dir` 命令，中文文件名显示为乱码：
- 第一次尝试：菱形方块（U+FFFD replacement character）
- 第二次尝试：希伯来/拉丁字符（如 `ָ` `Ź`）

```
| context engnerring ָ | 5.91 MB | 2025/12/24 |   ← "指南" 变成 ָ
| Ź | 124 KB | 2026/4/11 |                        ← 完全乱码
```

## 2. 根因分析

### 2.1 编码链路

```
PowerShell 输出 (GBK/CP936)
  → child.stdout (raw Buffer: GBK 字节)
    → createChildAdapter: chunk.toString()  ← 🔴 UTF-8 解码 GBK 字节 = 乱码
      → handleStdout: decodeWinBuffer(已是损坏字符串) ← 无效修复
        → 最终显示乱码
```

Windows 中文系统的默认代码页是 **936 (GBK)**。PowerShell 5.1 的 stdout 管道输出使用系统代码页编码。Node.js 的 `Buffer.toString()` 默认按 **UTF-8** 解码，遇到 GBK 字节就产生替换字符（菱形方块）。

### 2.2 为什么修了两轮才好

**第一轮（无效）**：在 `handleStdout` 里加了 `decodeWinBuffer` 做 GBK 解码
- 问题：数据在更上游的 `createChildAdapter` 已经被 `.toString()` 损坏了
- `decodeWinBuffer` 收到的是已损坏的字符串，不是原始 GBK Buffer
- `Buffer.isBuffer(data)` 返回 false，`Buffer.from(string)` 无法还原原始字节
- 教训：**修复编码必须在数据还是 raw bytes 的层进行**

**第二轮（有效）**：
1. 在 `createChildAdapter` 层去掉 `.toString()`，让 raw Buffer 透传
2. 将 `decodeWinBuffer` 的 `chcp` 动态检测改为硬编码 `new TextDecoder("gbk")`

### 2.3 `chcp` 动态检测为什么不可靠

原方案用 `spawnSync("cmd.exe", ["/d", "/s", "/c", "chcp"])` 检测代码页。本地测试正常（返回 936），但 Gateway 进程上下文中可能因环境差异失败，导致 `cached = null` 回退到 `buf.toString()`（UTF-8），等同于没修。

硬编码 `"gbk"` 跳过了检测，直接创建 GBK 解码器。

## 3. 最终修复方案

### 修改 1: `createChildAdapter` — 保留 raw Buffer（约第 740-749 行）

```javascript
// ===== 修改前 =====
const onStdout = (listener) => {
    child.stdout.on("data", (chunk) => {
        listener(chunk.toString());  // ← GBK 字节被 UTF-8 解码，损坏
    });
};
const onStderr = (listener) => {
    child.stderr.on("data", (chunk) => {
        listener(chunk.toString());  // ← 同样的问题
    });
};

// ===== 修改后 =====
const onStdout = (listener) => {
    child.stdout.on("data", (chunk) => {
        listener(chunk);  // ← 透传 raw Buffer
    });
};
const onStderr = (listener) => {
    child.stderr.on("data", (chunk) => {
        listener(chunk);  // ← 透传 raw Buffer
    });
};
```

### 修改 2: `decodeWinBuffer` — 硬编码 GBK 解码（约第 1548 行）

```javascript
// ===== 修改前 (chcp 动态检测) =====
const decodeWinBuffer = (() => {
    if (process.platform !== "win32") return (buf) => buf.toString();
    let cached;
    try {
        const r = require("child_process").spawnSync("cmd.exe",
            ["/d","/s","/c","chcp"],
            {windowsHide:true,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
        const m = (r.stdout||"").match(/([0-9]{3,5})/);
        cached = {936:"gbk",...}[m?parseInt(m[1]):0] || null;
    } catch(e) { cached = null; }
    if (!cached) return (buf) => buf.toString();
    const decoder = new TextDecoder(cached);
    return (buf) => decoder.decode(Buffer.isBuffer(buf)?buf:Buffer.from(buf));
})();

// ===== 修改后 (硬编码) =====
const decodeWinBuffer = (() => {
    if (process.platform !== "win32") return (buf) => buf.toString();
    const decoder = new TextDecoder("gbk");
    return (buf) => decoder.decode(Buffer.isBuffer(buf)?buf:Buffer.from(buf));
})();
```

## 4. 验证方法

```bash
# 1. 修改文件后，必须重启 Gateway
taskkill //PID <gateway_pid> //T //F

# 2. Desktop App 自动重连并 spawn 新 Gateway

# 3. Bot DM 中执行含中文的命令，如：
#    "列出桌面上的文件"
#    "dir C:\Users\你的用户名\Desktop"
```

## 5. 教训总结

| 教训 | 说明 |
|---|---|
| **编码修复必须在 raw bytes 层** | 字符串一旦被错误编码解码，就无法还原。必须在 Buffer 还未被 `.toString()` 转换时就做正确的解码 |
| **不要信任中间层** | `createChildAdapter` 和 `handleStdout` 分属不同抽象层。编码处理放在消费层（下游）看似合理，但如果生产层（上游）已经损坏了数据，下游再怎么修都没用 |
| **动态检测不如硬编码可靠** | `chcp` 检测在本地 REPL 可能正常，但在 Gateway 进程环境中可能因 sandbox、环境变量、权限等差异失败。对于已知场景（Windows 中文 = GBK），硬编码更稳 |
| **修改 npm 全局包后必须重启进程** | Node.js 进程加载模块后缓存在内存中。修改磁盘文件不影响已运行的进程。必须 kill + 重启 |
| **验证修复时确认是新进程** | 用 `Get-CimInstance Win32_Process` 检查 PID 是否变了，确认加载的是新代码 |
| **sed 在 Windows 上处理 tab 缩进文件不稳定** | 用 Python 脚本做行号级替换更可靠 |

## 6. 后续安装注意事项

每次 `npm update -g openclaw` 或重装 OpenClaw，都会覆盖这两个修改。需要重新应用。

建议维护一个 patch 脚本，见项目根目录（待创建）。

## 7. 对其他 Windows 系统的影响

- **代码页 936 (简体中文 GBK)**：硬编码 `gbk`，适用
- **代码页 950 (繁体中文 Big5)**：需改为 `big5`
- **代码页 932 (日文 Shift_JIS)**：需改为 `shift_jis`
- **代码页 949 (韩文 EUC-KR)**：需改为 `euc-kr`
- **代码页 65001 (UTF-8)**：无需修改，原代码正常工作
- **非 Windows**：`process.platform !== "win32"` 直接走 `buf.toString()`，不受影响
