# OpenClaw 镖局风云录

> 以武侠江湖喻 OpenClaw 技术架构，轻松破壁，过目不忘。
>
> 基于 OpenClaw v2026.4.2 参考手册改编 | 2026-04-08

---

## 楔子：江湖传言

> *"天下武功，唯快不破。天下 AI Agent，唯 OpenClaw 镖局最稳。"*
>
> ——《江湖快报》头条

在遥远的硅谷大陆，有一座名为 **OpenClaw** 的镖局。它不做普通押镖生意——它押的是**指令与智慧**。

镖局的主人叫 **Gateway（网关真人）**，江湖人称"千手总机"。他不亲自干活，但他掌管着镖局的一切调度：谁进谁出、谁生谁灭、谁的令牌有效、谁的签名造假。

今天，我们要讲的是镖局里一天发生的故事。

---

## 第一章：山门验身（WS 握手）

### 1.1 挑战令

卯时三刻，天刚蒙蒙亮。一个背着长剑的年轻人——**LinkChat 客户端**——来到镖局门前。

他刚站定，山门自动弹出一道 **挑战令（connect.challenge）**：

> *"来者何人？报上你的 nonce（随机暗号）和时间戳，否则不开门！"*

年轻人一看，暗号是 `xK9m2...`，时间戳 `1737264000000`。

> **技术映射**: Gateway 在 WS 连接建立后，主动下发 `connect.challenge` 事件，包含 `nonce` 和 `ts`。客户端必须用设备私钥签名这个 nonce，证明"我是我"。

### 1.2 亮牌进门

年轻人掏出腰牌，双手递上：

- **身份铭牌**（client）：姓名 `cli`（客户端 ID），籍贯 `windows`（平台），门派 `operator`（角色）
- **权限腰牌**（scopes）：`operator.read`（可看）、`operator.write`（可写）
- **祖传密钥**（device）：公钥、签名、暗号（nonce，必须和山门下发的完全一致）

山门护卫仔细查验：

1. nonce 对不对？—— **必须一字不差**（`DEVICE_AUTH_NONCE_MISMATCH` 报错就打回去）
2. 签名真不真？—— 用公钥验签（`DEVICE_AUTH_SIGNATURE_INVALID` 就是伪造的）
3. 身份一致吗？—— 设备 ID 和公钥绑定的身份要匹配（`DEVICE_AUTH_DEVICE_ID_MISMATCH` 冒充就完了）

查验通过！山门大开，传来一声浑厚的回应：

> *"hello-ok！协议版本 3，心跳每 15 秒一次（tickIntervalMs: 15000）。进来吧！"*

年轻人喜滋滋地跨过门槛。

> **技术映射**: 握手成功后 Gateway 返回 `hello-ok`，包含 `protocol` 版本和 `policy.tickIntervalMs`。客户端需按此间隔发送传输层 tick 保活。
>
> **踩坑提醒**: 如果镖局挂牌 `--auth none`（不验令牌），你还是得亮出 device identity（空 token 签名），不然照样被轰走。这叫"不查令牌但查身份"。

### 1.3 五种腰牌（Operator Scopes）

镖局发五种腰牌，权限从低到高：

| 腰牌 | 江湖权限 |
|------|---------|
| `operator.read` | 只看不摸（查健康、查状态、读历史） |
| `operator.write` | 能发话能催活（发消息、触发 Agent） |
| `operator.admin` | 掌柜级（改配置、重置 Session、删数据） |
| `operator.approvals` | 盖章审批（审批危险命令执行） |
| `operator.pairing` | 令牌管理（轮换/撤销设备 Token） |

---

## 第二章：会客室（Session）

### 2.1 分房

年轻人进了镖局，被领到一间 **会客室（Session）**。

会客室有讲究：

- 每个人有自己的房间（`session.dmScope: "per-channel-peer"`）——你跟镖局聊的话，别人听不到
- 房间号由规则生成：`agent:main:main`（主聊天）、`agent:main:wechat:group:42`（群聊第 42 号房）

> **技术映射**: Session Key 格式为 `agent:<agentId>:<scopeKey>`。DM 默认 `main`，群组 `channel:group:<id>`。

### 2.2 每日打扫（Session Reset）

镖局有个规矩：**每天凌晨 4 点（atHour: 4），所有会客室自动打扫**。

打扫 = Session 重置。昨天的对话记录归档，新的一天从零开始。就像客栈每天换床单。

如果你嫌凌晨 4 点太早，还可以加一条 **空闲打扫（idleMinutes: 120）**——房间 2 小时没人说话，也自动打扫。两条规矩，**谁先触发听谁的**。

> **技术映射**: `session.reset.mode="daily"` + `session.reset.atHour=4`。同时配 `idleMinutes` 时先到先触发。

### 2.3 房间满了怎么办？（Maintenance）

会客室不是无限的。镖局有个 **管房婆（Session Maintenance）**：

- 超过 30 天没住的房间（`pruneAfter: "30d"`），直接拆除
- 房间总数超过 500 间（`maxEntries: 500`），老的先拆
- 记录簿（sessions.json）超过 10MB（`rotateBytes: "10mb"`），自动归档轮转

管房婆有两种脾气：

| 模式 | 行为 |
|------|------|
| `"warn"` | 好言相劝："先生，您的房间快过期了" |
| `"enforce"` | 不废话，直接执行 |

> **LinkChat 建议**: 用 `enforce` 模式，别给过期 Session 留情面。

---

## 第三章：镖局管家（Agent 执行循环）

### 3.1 管家上岗

会客室里坐着镖局的 **管家（Agent）**。他不是一个人——他是一整套办事流程。

当你发一条消息（`chat.send`），管家立刻进入 **六步循环**：

```
收到指令 → 翻阅档案(context组装) → 请示大脑(LLM推理) → 查工具箱(工具执行) → 写回信(流式回复) → 归档(持久化)
```

这六步走完，叫一个 **Agentic Loop（循环）**。每个会客室同时只能走一个循环——管家不搞多线程，一个房间一次只办一件事。

> **技术映射**: `chat.send` 是异步的——Gateway 验证参数后立即返回 `{ runId, acceptedAt }`，不等执行完。真正的回复通过 event 流推送。单个 session 内 Agent 串行执行（`maxConcurrent: 8` 是跨 session 的上限）。

### 3.2 管家的案头书（引导文件）

管家桌上常年摆着几本必读书：

| 书名 | 用途 | 什么时候翻 |
|------|------|-----------|
| `AGENTS.md` | 操作手册 + 行为规矩 | 每轮必读 |
| `SOUL.md` | 性格设定（温和/暴躁/毒舌） | 每轮必读 |
| `TOOLS.md` | 工具使用说明 | 每轮必读 |
| `IDENTITY.md` | 名片——"我是谁" | 每轮必读 |
| `USER.md` | 老板的偏好档案 | 每轮必读 |
| `MEMORY.md` | 长期记忆本 | 有的话就读 |
| `BOOTSTRAP.md` | 入职培训手册 | 仅新管家第一次上岗 |

> **技术映射**: 引导文件注入每轮 context。`bootstrapMaxChars: 20000` 单文件上限，`bootstrapTotalMaxChars: 150000` 总上限。子 Agent 只读 `AGENTS.md` + `TOOLS.md`，没资格翻老板的 `USER.md`。

### 3.3 管家的日记本（Memory）

管家还有一本 **日记本（MEMORY.md）**，记着历次服务的要点：

- 今天老板说喜欢简洁回复
- 上次讨论的方案是 B
- 老板的猫叫"橘座"

每次老板进会客室，管家自动翻开日记本看一遍。日记本用的是 **纯 Markdown**——没有隐藏的魔法，就是白纸黑字。

日记旁边还有 **每日便签**（`memory/YYYY-MM-DD.md`）：今天和昨天的便签自动展示，三天前的就收进抽屉。

如果管家想找旧笔记，他有个 **检索术（memory_search）**——混合向量搜索 + 关键词搜索，连中文都能查（trigram 分词，专为 CJK 优化）。

> **技术映射**: 记忆是磁盘上的 Markdown 文件。索引存在 `~/.openclaw/memory/<agentId>.sqlite`（SQLite FTS5 + BM25）。块大小 ~400 tokens，重叠 80 tokens。

---

## 第四章：流式传书（Event 流）

### 4.1 三道飞鸽

管家办事时，会放出三种 **飞鸽（Event Stream）** 向你汇报：

| 飞鸽颜色 | 携带内容 | 何时放飞 |
|---------|---------|---------|
| 🟢 **青鸽**（Lifecycle） | "开始干活了" / "干完了" / "出错了" | 开始、结束、报错 |
| 🔵 **蓝鸽**（Assistant） | 回信内容（一段一段发，不是一次性写完） | 流式文本 |
| 🟡 **金鸽**（Tool） | "我要用工具了" / "工具执行中" / "工具结果出来了" | 工具调用全流程 |

> **技术映射**: 三种事件流 —— `lifecycle`（phase: start/end/error）、`assistant`（流式 delta）、`tool`（start/update/end）。

### 4.2 青鸽的秘密

**青鸽**是所有飞鸽中最重要的。它告诉你管家什么时候**真正干完了**。

注意——不是蓝鸽送完信就算完！蓝鸽送信可能送好几轮（管家写完一段又写一段）。只有青鸽带着 **`phase: "end"`** 飞回来，才表示整件事办完了。

> **踩坑**: LinkChat 曾经犯过这个错——把蓝鸽的"信送完了"当成"事办完了"，结果管家还在后台磨墨，客户端已经告诉用户"已完成"了。
>
> **正确做法**: 监听 lifecycle event `phase=end` 作为完成信号。

### 4.3 蓝鸽的怪癖（Delta 编码）

蓝鸽送信有个怪癖——它不送"新增的文字"，而是每次送 **整封信的最新版本**。

第一次：*"你好"*
第二次：*"你好，我是"* （不是"我是"）
第三次：*"你好，我是镖局管家"*

客户端要自己做 **差分（Delta）**：只展示新增的部分。

更怪的是——管家有时会写好几封信（多段回复）。当新一段开始时，信的内容会**突然缩短**。客户端需要用 `startsWith` 检测：如果新信不是旧信的开头，说明管家另起了一段。

> **技术映射**: Gateway 发送累积全文。多段回复时文本重置。客户端做 delta 编码 + startsWith 段重置检测。这是 `openclaw-ws-client.ts` 的核心逻辑。

---

## 第五章：藏经阁（Compaction）

### 5.1 阁楼满了

午后，管家正在处理第 47 个请求。突然，他感觉脑子里（context）塞不下了——

**200,000 token 的脑袋**（contextTokens），已经被对话历史、引导文件、工具结果占得满满当当。

触发条件：

```
当前 context > contextWindow(200000) - 预留空间(reserveTokens: 16384)
```

这时，**藏经阁主（Compaction）** 出场了。

### 5.2 压缩大法

藏经阁主的工作流程：

1. **先提醒管家存笔记**：*"喂，你的记忆要存一下，不然压缩完就忘了"*
   - 管家默默执行一个静默 turn，把重要内容写入 MEMORY.md
   - 这叫 **Memory Flush**（记忆刷新）

2. **开始压缩**：
   - 把旧对话请出主厅，替换成一份 **压缩摘要**
   - 保留最近 20,000 token 的对话（`keepRecentTokens: 20000`）
   - 压缩后的结构：`[摘要] + [保留的近期对话]`

3. **重注入关键章节**：
   - 有些东西不能丢——比如 AGENTS.md 里的"Session Startup"和"Red Lines"章节
   - 压缩后把这些章节重新注入 context
   - 这叫 `postCompactionSections`

4. **特别关照**：重要的标识符（ticket ID、host:port、部署 ID）不能被摘要吞掉
   - 通过 `identifierPolicy: "strict"` 保护

> **技术映射**: Compaction 默认开启。触发公式 `contextTokens > contextWindow - reserveTokens`。压缩前自动 memory flush。`reserveTokensFloor: 20000` 最低强制值。

### 5.3 每日整理 vs 随时清理

镖局还有个 **清洁工（Context Pruning）**，跟藏经阁主不同：

| | 藏经阁主（Compaction） | 清洁工（Context Pruning） |
|---|---|---|
| 整理什么 | 整个对话历史 | 只收拾**工具结果** |
| 写进磁盘吗 | 是（永久生效） | 否（只在内存里，下次请求又来了） |
| 触发时机 | 脑袋快炸时 | 5 分钟缓存过期后 |
| 工作方式 | 摘要压缩 | 头尾保留，中间删 |

清洁工的套路：

1. 工具执行完 → 结果存在 context 里
2. 等 **5 分钟**（cache TTL）
3. 软裁剪：保留头 1500 字 + 尾 1500 字，中间用 `...` 替代
4. 如果还是太大 → 硬清除：整段替换成 `"[Old tool result content cleared]"`

> **LinkChat 建议**: 开启 `contextPruning.mode: "cache-ttl"`，减少工具结果膨胀。特别适合 OpenClaw Agent 频繁执行 system.run 的场景。

---

## 第六章：巡夜保安（Heartbeat）

### 6.1 深夜巡逻

子时（午夜），镖局里所有人都睡了。只有 **巡夜保安（Heartbeat）** 还在走动。

保安不是 WS 传输层的 ping/pong——那只是"我还活着"的心跳。保安干的是 **真正的活儿**：

每 **30 分钟**（`heartbeat.every: "30m"`），保安：

1. 翻开 **巡逻清单**（`HEARTBEAT.md`）——上面写着"检查服务器状态"、"看看有没有未处理的工单"之类的待办
2. 执行一次完整的 Agent 循环（跟白天管家办事流程一样）
3. 有事就报告，没事就 `NO_REPLY`

保安可以配置：

| 配置 | 说明 |
|------|------|
| `target: "none"` | 默认。巡逻但不汇报（自言自语模式） |
| `target: "last"` | 向最后联系的人汇报 |
| `isolatedSession: true` | 每次用新房间，不继承白天对话 |
| `lightContext: true` | 只带巡逻清单，不带完整档案（省脑子） |

> **技术映射**: Heartbeat 是周期性 Agent turn，不是传输层心跳。由 `hello-ok.payload.policy.tickIntervalMs` 管的是 WS 保活，由 `agents.defaults.heartbeat.every` 管的是调度型心跳。两者完全独立。

### 6.2 NO_REPLY 秘术

有时候，保安巡逻发现一切正常，他会在日志里写一个词：**NO_REPLY**。

这可不是偷懒——这是一种 **协议约定**。看到 `NO_REPLY` 开头，投递系统就知道"这轮不需要告诉用户"，自动吞掉不外传。

管家白天也能用这个秘术——比如执行完一个后台工具，不需要回复用户时，就在心里默念 `NO_REPLY`。

> **技术映射**: Assistant 输出以 `NO_REPLY` 开头 → 投递层过滤此标记，用户看不到。2026.1.10 起也抑制部分流式输出，避免泄漏 `NO_REPLY` 前缀。

---

## 第七章：工具箱与审批（Exec 工具）

### 7.1 十八般武艺

管家除了动嘴皮子，还能动手。他的 **工具箱** 里最常用的一件叫 **system.run**——执行 Shell 命令。

使用时有讲究：

| 参数 | 武侠解释 |
|------|---------|
| `command` | 具体要执行的招式 |
| `workdir` | 在哪个擂台上比武 |
| `timeout` | 招式最长时间（默认 30 分钟，超过就强制收招） |
| `host` | 在哪里执行（`auto` / `sandbox` / `gateway` / `node`） |
| `security` | 安全等级 |
| `ask` | 是否需要请示 |

`host` 路由是精髓：

| 去向 | 含义 |
|------|------|
| `auto` | 有练功房（sandbox）就去练功房，没有就在正厅（gateway） |
| `sandbox` | 必须去练功房，练功房没开门就不干 |
| `gateway` | 直接在正厅动手 |
| `node` | 派去分舵（远程 Node）执行 |

### 7.2 盖章审批（Exec Approval）

有些招式太危险——比如 `rm -rf` 这种"毁天灭地"的招——管家不能自己说了算。

镖局有套 **双层审批**：

**第一层：工具策略**（openclaw.json 配置）

| security 值 | 行为 |
|------------|------|
| `"deny"` | 禁止所有宿主执行 |
| `"allowlist"` | 只有白名单里的招式能用 |
| `"full"` | 随便用 |

| ask 值 | 行为 |
|--------|------|
| `"off"` | 不问 |
| `"on-miss"` | 白名单里没有的才问 |
| `"always"` | 每次都问 |

**第二层：宿主审批**（exec-approvals.json）

就算配置说"可以用"，宿主层面还能再加一道关卡。

**两层都放行，才算真正通过。**

> **踩坑**: 默认情况下，`gateway` / `node` 宿主 exec **接近无审批模式**。想真正启用审批，两层都要收紧。OpenClaw Agent 内置了这个安全机制——查询类命令直接执行，危险操作先问用户。这就是 LinkChat 可以不接入 DraftService 的原因。

### 7.3 练功房（沙箱）

镖局还有专门的 **练功房（Sandbox）**：

- 可以用 **Docker**（本地隔离容器）
- 可以用 **SSH**（远程隔离机器）
- 可以用 **OpenShell**（托管沙箱）

模式有三种：

| 模式 | 谁进练功房 |
|------|----------|
| `"off"` | 谁都不进 |
| `"non-main"` | 非主会客室的才进 |
| `"all"` | 全都进去练 |

范围也有讲究：

| 范围 | 分配策略 |
|------|---------|
| `"agent"` | 每个管家一间房 |
| `"session"` | 每个会客室一间房 |
| `"shared"` | 所有人共用一间大房 |

---

## 第八章：分身术（子 Agent）

### 8.1 管家分身

遇到复杂任务，管家可以 **拔一根毫毛，变出分身（Subagent）**：

```
管家（主 Agent, 深度 0）
├── 分身甲（子 Agent, 深度 1）
│   ├── 分身甲的分身（子子 Agent, 深度 2）
│   └── ...
└── 分身乙（子 Agent, 深度 1）
```

规则：
- 默认嵌套 **1 层**，配置 `maxSpawnDepth: 2` 后最大 **2 层**
- 分身只读 `AGENTS.md` + `TOOLS.md`（没资格看老板的 `USER.md`）
- 分身可以设超时（`runTimeoutSeconds`），时间到了自动消失
- 分身可以用 `cleanup: "delete"` 设置"干完就消失"（不留档案）

> **技术映射**: `sessions_spawn` 工具创建子 Agent。Session Key 格式 `agent:<id>:subagent:<uuid>`。默认 `maxSpawnDepth: 1`（子 Agent 不能再生子 Agent），最大可配 2。

---

## 第九章：模型与大脑

### 9.1 请哪尊大神？

管家的"大脑"是外部请来的 **高人（LLM Model）**。镖局和好多位高人有合作：

| 高人 | 专长 | 身价 |
|------|------|------|
| MiniMax-M2.7 | 推理强、中文好、价格适中 | 输入 $0.3/MTok，输出 $1.2/MTok |
| kimi-k2.5 | 超大 context（256K）、代码强 | — |
| DeepSeek | 便宜好用 | 低 |
| Claude Opus | 顶级推理 | 贵 |

请人的优先级：

```
1. 主力高人（model.primary）
2. 候补高人列表（model.fallbacks[]，按顺序）
3. 同一高人换个请帖（auth profile 轮换）
```

### 9.2 高人请假（故障转移）

高人也是人，也会请假（rate limit / 429）。镖局有套 **指数退避** 策略：

| 请假次数 | 冷却时间 |
|---------|---------|
| 第 1 次 | 1 分钟 |
| 第 2 次 | 5 分钟 |
| 第 3 次 | 25 分钟 |
| 第 4 次+ | 1 小时（封顶） |

如果是"余额不足"（insufficient credits），初始冷却 **5 小时**，翻倍增长，封顶 24 小时。

只有 rate-limit 类错误才会轮换/降级。如果是参数错误、认证失败——直接报错，不瞎折腾。

> **技术映射**: API Key 轮换优先级 `OPENCLAW_LIVE_<PROVIDER>_KEY` > `<PROVIDER>_API_KEYS` (逗号) > `<PROVIDER>_API_KEY` > `<PROVIDER>_API_KEY_*` (编号)。仅在 429/rate_limit/quota 错误时轮换。

### 9.3 MiniMax 高人的规矩

MiniMax-M2.7 有几个怪脾气：

1. **名字大小写敏感**——必须写 `MiniMax-M2.7`（大写 M），写成 `minimax-m2.7` 它不理你
2. **Context Window 是 200,000**——不是 204,800，别四舍五入
3. **API 端点分国内外**——国际 `api.minimax.io`，中国 `api.minimaxi.com`（多了个 `i`）
4. **推荐用 Anthropic 格式**（`api: "anthropic-messages"`），不是 OpenAI 格式

> **踩坑**: Provider 未配置时报错 "Unknown model: minimax/MiniMax-M2.7"。必须配 provider 或设置 `MINIMAX_API_KEY`。

---

## 第十章：驿站管理（进程管理）

### 10.1 健康巡检

镖局门口挂着一块 **健康牌（Health Endpoint）**：

```
✓ Gateway 运行中
✓ WS 连接数: 3
✓ 活跃 Session: 12
✓ 最近心跳: 30 秒前
```

路过的人可以随时查看（`health` RPC 方法，需要 `operator.read` 权限）。

还有个 **通道健康监控**：

- 每 5 分钟检查一次通道是否活着
- 30 分钟没收到事件就判定"通道卡住了"
- 每小时最多自动重启 10 次（防止死循环）

### 10.2 传送保活（WS Tick）

年轻人（LinkChat 客户端）进门时被告知：**每 15 秒报一次到**（`tickIntervalMs: 15000`）。

这不是聊天——只是举手喊一声"我还在"。如果超过一段时间没报到，山门就当你走了，自动断连。

> **注意**: 这个 tick 是 **传输层保活**，跟第六章的巡夜保安（调度型 Heartbeat）完全两回事。一个是"门卫看你还在不在"，一个是"保安主动去巡逻"。

### 10.3 热更新

镖局的规矩可以 **不关门就改**（热重载）：

| 改什么 | 需要关门吗 |
|--------|-----------|
| Agent 配置、模型、技能、工具 | 不用（热生效） |
| Gateway 端口、认证、TLS | 需要（重启） |

三种模式：

| 模式 | 行为 |
|------|------|
| `"hybrid"`（默认） | 安全变更即时生效，关键变更自动重启 |
| `"hot"` | 只热更新，需要重启时仅打日志 |
| `"restart"` | 任何变更都重启 |

---

## 第十一章：秘籍与技能（Skills）

### 11.1 武功秘籍的放置

管家的武功秘籍（技能文件）放在好几个地方，优先级从高到低：

| 优先级 | 位置 | 谁能用 |
|--------|------|--------|
| 1（最高） | 工作区 `skills/` 目录 | 只有这个 Agent |
| 2 | 项目 `.agents/skills/` | 项目内的 Agent |
| 3 | 个人目录 `~/.agents/skills/` | 所有工作区的个人 Agent |
| 4 | OpenClaw 目录 `~/.openclaw/skills/` | 本地所有 Agent |
| 5 | 内置技能 | npm 包自带 |
| 6（最低） | 自定义共享目录 | 手动配置的额外目录 |

### 11.2 秘籍格式

每本秘籍开头都有个 **扉页（SKILL.md frontmatter）**：

```markdown
---
name: image-lab
description: Generate or edit images
user-invocable: true          # 暴露为斜杠命令
disable-model-invocation: false  # Agent 可以主动使用
---

技能指令内容...
```

关键字段：

| 字段 | 含义 |
|------|------|
| `user-invocable: true` | 用户可以通过 `/image-lab` 直接调用 |
| `disable-model-invocation: true` | 不注入模型提示（Agent 不会主动使用） |
| `command-dispatch: "tool"` | 直接分发到工具，绕过 Agent 思考 |
| `metadata.openclaw.requires.bins` | 要求 PATH 中存在指定二进制文件 |
| `metadata.openclaw.requires.env` | 要求存在指定环境变量 |

---

## 第十二章：门派暗号（认证深度）

### 12.1 三种入场方式

| 方式 | 说明 |
|------|------|
| **Gateway Token** | 一句口令（`OPENCLAW_GATEWAY_TOKEN`），所有人用同一句 |
| **设备配对** | 首次连接颁发专属腰牌（`deviceToken`），下次凭牌入场 |
| **开放模式**（`--auth none`） | 不验口令，但必须亮身份（device identity + 空签名） |

### 12.2 签名载荷

签名内容包含你的"出身"：

- v3（推荐）：绑定 `platform` + `deviceFamily`
- v2（兼容）：只绑基本信息

签错了会得到各种花式拒绝：

| 错误码 | 江湖翻译 |
|--------|---------|
| `DEVICE_AUTH_NONCE_REQUIRED` | "你暗号呢？" |
| `DEVICE_AUTH_NONCE_MISMATCH` | "暗号不对，你是卧底吧？" |
| `DEVICE_AUTH_SIGNATURE_INVALID` | "签名造假！拿下！" |
| `DEVICE_AUTH_SIGNATURE_EXPIRED` | "签名过期了，重新签" |
| `DEVICE_AUTH_DEVICE_ID_MISMATCH` | "身份对不上，冒牌的？" |
| `DEVICE_AUTH_PUBLIC_KEY_INVALID` | "公钥格式都不对，你是来砸场子的？" |

每个错误还附带 `recommendedNextStep`——"建议你先去做 X 再来"。

---

## 尾声：江湖速查表

### 一个完整的交互流程

```
1. 客户端 → 山门挑战（WS connect, challenge-response）
2. 验证通过 → 分配会客室（Session）
3. 客户端发消息（chat.send）
4. 管家收到 → 翻引导文件 + 日记本 → 请示大脑（LLM）
5. 大脑回复 → 管家查工具箱 → 如需执行：
   a. 安全检查（security + ask）
   b. 审批流程（exec-approval，两层关卡）
   c. 选择执行地点（host: auto/sandbox/gateway/node）
   d. 执行并返回结果
6. 管家写回信 → 蓝鸽飞出（流式 delta）
7. 青鸽报完（lifecycle phase=end）→ 交互结束
8. 如果 context 快满 → 藏经阁主压缩 + 清洁工裁剪
9. 深夜 → 巡夜保安按 HEARTBEAT.md 巡逻
10. 凌晨 4 点 → 管房婆打扫会客室（Session reset）
```

### OpenClaw 角色-概念速查

| 武侠角色 | OpenClaw 概念 | 一句话 |
|---------|-------------|--------|
| 山门总机 | Gateway | 管连接、验证、调度 |
| 会客室 | Session | 对话隔离单元 |
| 管家 | Agent | 执行循环 |
| 大脑/高人 | LLM Model | 推理引擎 |
| 工具箱 | Tools (system.run 等) | 执行能力 |
| 练功房 | Sandbox | 安全隔离 |
| 藏经阁主 | Compaction | 压缩旧对话 |
| 清洁工 | Context Pruning | 清理工具结果 |
| 巡夜保安 | Heartbeat | 定时巡逻 Agent turn |
| 日记本 | Memory (MEMORY.md) | 长期记忆 |
| 管房婆 | Session Maintenance | 清理过期 Session |
| 飞鸽 | Event Stream | lifecycle / assistant / tool |
| 分身 | Subagent | 子 Agent 任务 |
| 秘籍 | Skills | 自定义技能扩展 |
| 盖章窗口 | Exec Approval | 危险操作审批 |
| 门卫点名 | WS Tick | 传输层保活 |

---

> *江湖路远，OpenClaw 常伴。*
>
> *——全文完——*

---

## 附录：LinkChat 集成对照

| 故事情节 | LinkChat 代码位置 |
|---------|-----------------|
| 山门验身 | `openclaw-ws-client.ts` — `connect()` 方法 |
| 蓝鸽 delta | `openclaw-ws-client.ts` — `handleAssistantEvent()` |
| 青鸽完成信号 | `openclaw-ws-client.ts` — `handleLifecycleEvent()` |
| 进程 Spawn | `openclaw-process.service.ts` — 全局路径探测 |
| 孤儿防护 | `openclaw-process.service.ts` — `killSync` on Windows |
| Bot DM 消息路由 | Desktop `MessageInput` → REST → `chat.send` |
| 群聊 @ai | Server `handleMentions` → `MentionService` → `SupervisorAgent` |
