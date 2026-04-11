# 阅读页 HTML 模板

> 可复用的手机阅读页模板：双主题 + 三字体 + 纯色背景 + 持久化设置。

---

## 使用方法

1. 复制下方「完整模板」代码
2. 替换 `<!-- 内容区 -->` 之间的部分为你的正文
3. 用到的组件样式见「组件速查」一节

---

## 完整模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>页面标题</title>
<style>
/* ========================================
   主题变量
   ======================================== */

/* 古风宣纸（默认） */
:root {
  --bg: #f6f1e7;
  --bg-card: #ede6d6;
  --text: #3a2e1e;
  --text-muted: #7a6b5d;
  --accent: #8b2500;
  --gold: #9a7b2e;
  --code-bg: #e8dcc8;
  --code-text: #5a4a30;
  --note-bg: #f0e8d8;
  --note-border: rgba(139,37,0,0.2);
  --note-text: #6b4e30;
  --pitfall-bg: #f5e6e0;
  --pitfall-border: rgba(139,37,0,0.3);
  --pitfall-text: #8b2500;
  --dialogue-bg: rgba(154,123,46,0.07);
  --dialogue-border: #9a7b2e;
  --speaker-color: #7a5a10;
  --hero-from: #e8dcc8;
  --hero-to: #f6f1e7;
  --divider-color: #b8a88a;
  --table-header-bg: #ddd4c2;
  --table-border: rgba(58,46,30,0.1);
  --footer-border: rgba(58,46,30,0.1);
  --char-color: #8b2500;
  --inline-text: #4a6a2e;
  --hero-text: #3a2e1e;
  --settings-bg: rgba(246,241,231,0.95);
  --settings-border: rgba(58,46,30,0.15);
  --btn-bg: #ede6d6;
  --btn-active: #8b2500;
  --btn-active-text: #f6f1e7;
}

/* 水墨淡雅 */
[data-theme="ink"] {
  --bg: #f0f0ee;
  --bg-card: #e4e4e2;
  --text: #2c2c2c;
  --text-muted: #8a8a88;
  --accent: #4a6a7a;
  --gold: #4a6a7a;
  --code-bg: #dddddd;
  --code-text: #3c3c3c;
  --note-bg: #e4e8ec;
  --note-border: rgba(74,106,122,0.25);
  --note-text: #3a5a6a;
  --pitfall-bg: #eae2e0;
  --pitfall-border: rgba(122,60,60,0.25);
  --pitfall-text: #7a3c3c;
  --dialogue-bg: rgba(74,106,122,0.06);
  --dialogue-border: #5f7a8a;
  --speaker-color: #3a5a6a;
  --hero-from: #dfe3e6;
  --hero-to: #f0f0ee;
  --divider-color: #aaa;
  --table-header-bg: #d8d8d6;
  --table-border: rgba(44,44,44,0.08);
  --footer-border: rgba(44,44,44,0.08);
  --char-color: #3a6a5a;
  --inline-text: #3a5a6a;
  --hero-text: #2c2c2c;
  --settings-bg: rgba(240,240,238,0.95);
  --settings-border: rgba(44,44,44,0.12);
  --btn-bg: #e4e4e2;
  --btn-active: #4a6a7a;
  --btn-active-text: #f0f0ee;
}

/* ========================================
   字体
   ======================================== */

/* 宋体 */
[data-font="song"] body,
[data-font="song"] p,
[data-font="song"] .dialogue,
[data-font="song"] .note,
[data-font="song"] .pitfall,
[data-font="song"] td {
  font-family: 'Noto Serif SC', 'Source Han Serif SC', 'STSongti-SC', 'SimSun', serif;
}

/* 楷体 */
[data-font="kai"] body,
[data-font="kai"] p,
[data-font="kai"] .dialogue,
[data-font="kai"] .note,
[data-font="kai"] .pitfall,
[data-font="kai"] td {
  font-family: 'STKaiti', 'Kaiti SC', 'KaiTi', 'AR PL UKai CN', serif;
}

/* 系统默认 */
[data-font="default"] body,
[data-font="default"] p,
[data-font="default"] .dialogue,
[data-font="default"] .note,
[data-font="default"] .pitfall,
[data-font="default"] td {
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif;
}

/* ========================================
   全局
   ======================================== */

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  line-height: 1.9;
  padding: 0 0 80px 0;
  max-width: 100vw;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

/* ========================================
   Hero 顶部标题区
   ======================================== */

.hero {
  background: linear-gradient(160deg, var(--hero-from) 0%, var(--hero-to) 100%);
  padding: 52px 24px 40px;
  text-align: center;
  border-bottom: 1px solid var(--footer-border);
}
.hero h1 {
  font-family: 'STKaiti', 'Kaiti SC', 'KaiTi', serif;
  font-size: 1.85em;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 8px;
  letter-spacing: 2px;
}
.hero .subtitle {
  color: var(--text-muted);
  font-size: 0.92em;
}

/* ========================================
   正文区
   ======================================== */

.content {
  padding: 0 22px;
  max-width: 680px;
  margin: 0 auto;
}

/* ========================================
   章节
   ======================================== */

.chapter { margin-top: 36px; }

.chapter-title {
  font-family: 'STKaiti', 'Kaiti SC', 'KaiTi', serif;
  font-weight: 700;
  font-size: 1.35em;
  color: var(--accent);
  margin-bottom: 16px;
  padding-left: 14px;
  border-left: 3px solid var(--accent);
  letter-spacing: 1px;
}
.chapter-num {
  color: var(--gold);
  font-size: 0.72em;
  display: block;
  margin-bottom: 4px;
  letter-spacing: 2px;
}

/* ========================================
   段落
   ======================================== */

p {
  margin-bottom: 16px;
  text-align: justify;
  font-size: 1.02em;
}

/* ========================================
   对话
   ======================================== */

.dialogue {
  margin: 16px 0;
  padding: 12px 16px;
  border-left: 2px solid var(--dialogue-border);
  background: var(--dialogue-bg);
  border-radius: 0 6px 6px 0;
}
.dialogue .speaker {
  color: var(--speaker-color);
  font-weight: 600;
  margin-right: 4px;
}

/* ========================================
   注释（技术映射）
   ======================================== */

.note {
  margin: 14px 0;
  padding: 12px 14px;
  background: var(--note-bg);
  border-radius: 6px;
  font-size: 0.88em;
  color: var(--note-text);
  line-height: 1.7;
  border: 1px solid var(--note-border);
}
.note::before { content: '「注」'; font-weight: 600; margin-right: 4px; }

/* ========================================
   警告/踩坑
   ======================================== */

.pitfall {
  margin: 14px 0;
  padding: 12px 14px;
  background: var(--pitfall-bg);
  border-radius: 6px;
  font-size: 0.88em;
  color: var(--pitfall-text);
  line-height: 1.7;
  border: 1px solid var(--pitfall-border);
}
.pitfall::before { content: '「坑」'; font-weight: 600; margin-right: 4px; }

/* ========================================
   行内代码
   ======================================== */

code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.86em;
  color: var(--code-text);
  font-family: 'Menlo', 'Consolas', 'Courier New', monospace;
}

/* ========================================
   分隔线
   ======================================== */

.divider {
  text-align: center;
  margin: 40px 0;
  color: var(--divider-color);
  font-size: 0.85em;
  letter-spacing: 10px;
}

/* ========================================
   引语/名言
   ======================================== */

.quote {
  text-align: center;
  margin: 28px 0;
  padding: 16px;
  color: var(--accent);
  font-style: italic;
  font-size: 1.05em;
}

/* ========================================
   表格
   ======================================== */

.ref-table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
  font-size: 0.9em;
}
.ref-table th {
  background: var(--table-header-bg);
  color: var(--text);
  padding: 9px 10px;
  text-align: left;
  font-weight: 600;
}
.ref-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--table-border);
}
.ref-table tr:last-child td { border-bottom: none; }

/* ========================================
   角色高亮
   ======================================== */

.char {
  color: var(--char-color);
  font-weight: 600;
}

/* ========================================
   行内强调文字（模拟终端输出等）
   ======================================== */

.inline-text {
  color: var(--inline-text);
}

/* ========================================
   底部
   ======================================== */

.footer {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
  font-size: 0.85em;
  border-top: 1px solid var(--footer-border);
  margin-top: 40px;
}

/* ========================================
   设置面板
   ======================================== */

.settings-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 1px solid var(--settings-border);
  color: var(--text-muted);
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 100;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  transition: transform 0.2s;
}
.settings-toggle:active { transform: scale(0.92); }

.settings-panel {
  position: fixed;
  bottom: 74px;
  right: 16px;
  width: 260px;
  background: var(--settings-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--settings-border);
  border-radius: 12px;
  padding: 16px;
  z-index: 99;
  box-shadow: 0 4px 24px rgba(0,0,0,0.1);
  display: none;
}
.settings-panel.open { display: block; }
.settings-panel .label {
  font-size: 0.78em;
  color: var(--text-muted);
  margin-bottom: 6px;
  margin-top: 12px;
  letter-spacing: 1px;
}
.settings-panel .label:first-child { margin-top: 0; }
.settings-panel .btn-group {
  display: flex;
  gap: 6px;
}
.settings-panel .btn {
  flex: 1;
  padding: 8px 6px;
  border: 1px solid var(--settings-border);
  border-radius: 6px;
  background: var(--btn-bg);
  color: var(--text);
  font-size: 0.85em;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.settings-panel .btn.active {
  background: var(--btn-active);
  color: var(--btn-active-text);
  border-color: var(--btn-active);
}

/* ===== 字号 ===== */
[data-size="small"] .content { font-size: 14px; }
[data-size="medium"] .content { font-size: 16.5px; }
[data-size="large"] .content { font-size: 20px; }
</style>
</head>
<body data-font="kai">

<!-- 设置按钮 -->
<button class="settings-toggle" onclick="toggleSettings()" aria-label="设置">⚙</button>

<!-- 设置面板 -->
<div class="settings-panel" id="settingsPanel">
  <div class="label">主题</div>
  <div class="btn-group">
    <div class="btn active" data-theme-btn="paper" onclick="setTheme('paper')">古风宣纸</div>
    <div class="btn" data-theme-btn="ink" onclick="setTheme('ink')">水墨淡雅</div>
  </div>
  <div class="label">正文字体</div>
  <div class="btn-group">
    <div class="btn" data-font-btn="song" onclick="setFont('song')">宋体</div>
    <div class="btn active" data-font-btn="kai" onclick="setFont('kai')">楷体</div>
    <div class="btn" data-font-btn="default" onclick="setFont('default')">默认</div>
  </div>
  <div class="label">字号</div>
  <div class="btn-group">
    <div class="btn" data-size-btn="small" onclick="setSize('small')">小</div>
    <div class="btn active" data-size-btn="medium" onclick="setSize('medium')">中</div>
    <div class="btn" data-size-btn="large" onclick="setSize('large')">大</div>
  </div>
</div>

<!-- 设置逻辑（勿动） -->
<script>
(function(){
  var s=localStorage.getItem('oc-theme');
  var f=localStorage.getItem('oc-font');
  var z=localStorage.getItem('oc-size');
  if(s) setTheme(s,false);
  if(f) setFont(f,false);
  if(z) setSize(z,false);
  function setTheme(t,save){
    document.documentElement.setAttribute('data-theme',t==='ink'?'ink':'');
    document.querySelectorAll('[data-theme-btn]').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-theme-btn')===t);});
    if(save!==false)localStorage.setItem('oc-theme',t);
  }
  function setFont(f,save){
    document.body.setAttribute('data-font',f);
    document.querySelectorAll('[data-font-btn]').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-font-btn')===f);});
    if(save!==false)localStorage.setItem('oc-font',f);
  }
  function setSize(z,save){
    document.body.setAttribute('data-size',z||'medium');
    document.querySelectorAll('[data-size-btn]').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-size-btn')===z);});
    if(save!==false)localStorage.setItem('oc-size',z);
  }
  window.setTheme=setTheme;
  window.setFont=setFont;
  window.setSize=setSize;
})();
function toggleSettings(){
  document.getElementById('settingsPanel').classList.toggle('open');
}
document.addEventListener('click',function(e){
  var p=document.getElementById('settingsPanel');
  var t=document.querySelector('.settings-toggle');
  if(!p.contains(e.target)&&!t.contains(e.target))p.classList.remove('open');
});
</script>

<!-- Hero -->
<div class="hero">
  <h1>页面标题</h1>
  <div class="subtitle">副标题</div>
</div>

<!-- 内容区 -->
<div class="content">

<!-- ★★★ 在这里写正文 ★★★ -->

</div>

<!-- 底部 -->
<div class="footer">
  <p>页面标题 | 其他信息</p>
</div>

</body>
</html>
```

---

## 组件速查

以下是在 `<!-- 内容区 -->` 中可用的 HTML 组件：

### 章节标题

```html
<div class="chapter">
  <span class="chapter-num">第一章</span>
  <div class="chapter-title">章节名</div>
  <!-- 段落内容 -->
</div>
```

### 段落

```html
<p>普通段落文字。</p>
```

### 对话

```html
<div class="dialogue">
  <span class="speaker">角色名：</span>说的内容
</div>
```

### 技术注释

```html
<div class="note">
  注释内容，支持 <code>code</code>
</div>
```

### 踩坑警告

```html
<div class="pitfall">
  警告内容
</div>
```

### 引语/名言

```html
<div class="quote">
  "名言内容"<br>
  <span style="font-size:0.8em;color:var(--text-muted)">—— 来源</span>
</div>
```

### 分隔线

```html
<div class="divider">✦ ✦ ✦</div>
```

### 表格

```html
<table class="ref-table">
  <tr><th>列1</th><th>列2</th><th>列3</th></tr>
  <tr><td>值1</td><td>值2</td><td>值3</td></tr>
</table>
```

### 行内代码

```html
<code>variable_name</code>
```

### 角色首次出现高亮

```html
<span class="char">角色名</span>
```

### 行内强调文字（模拟终端输出）

```html
<span class="inline-text">终端输出文字</span>
```

---

## 主题色彩对照

| CSS 变量 | 古风宣纸 | 水墨淡雅 | 用途 |
|---------|---------|---------|------|
| `--bg` | `#f6f1e7` 米黄 | `#f0f0ee` 冷灰 | 页面背景 |
| `--text` | `#3a2e1e` 深棕 | `#2c2c2c` 墨黑 | 正文文字 |
| `--accent` | `#8b2500` 朱红 | `#4a6a7a` 青瓷 | 标题、强调、角色高亮 |
| `--gold` | `#9a7b2e` 暗金 | `#4a6a7a` 青瓷 | 章节编号、对话边框 |
| `--code-bg` | `#e8dcc8` 浅棕 | `#dddddd` 浅灰 | 代码背景 |
| `--note-bg` | `#f0e8d8` 暖米 | `#e4e8ec` 冷蓝灰 | 注释背景 |
| `--pitfall-bg` | `#f5e6e0` 暖粉 | `#eae2e0` 冷粉 | 警告背景 |
| `--btn-active` | `#8b2500` 朱红 | `#4a6a7a` 青瓷 | 设置按钮激活色 |

---

## 注意事项

- 标题字体**固定楷体加粗**，不受正文字体切换影响
- 设置持久化到 `localStorage`（key: `oc-theme`, `oc-font`, `oc-size`），刷新不丢失
- 手机适配：`max-width: 680px` 居中，`overflow-x: hidden` 禁止横滚
- `data-font` 和 `data-size` 属性加在 `<body>` 上，`data-theme` 加在 `<html>` 上（`:root` 生效）
- 已移除 `maximum-scale=1.0`，手机可双指缩放
