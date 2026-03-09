# Sprint 4 — Phase 2: 消息搜索

> **状态**：🔧 后端完成（搜索API + tsvector迁移 + ILIKE fallback + 测试通过）
>
> **优先级**：P6（第 6 个工作包）
>
> **预估工作量**：2-3 天
>
> **前置条件**：Phase 0 完成（有富媒体消息后搜索更有意义）
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 2

---

## 目标

基于 PostgreSQL 全文搜索实现消息检索，支持中文分词、关键词高亮、按会话过滤、跳转到消息位置。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 2.1 | PostgreSQL 全文搜索配置 | tsvector 列 + GIN 索引 | — | 🔜 |
| 2.2 | 中文分词支持 | zhparser 或 pg_jieba 扩展 | 2.1 | 🔜 |
| 2.3 | 搜索 API | GET `/api/v1/messages/search` | 2.1 | 🔜 |
| 2.4 | 搜索结果高亮 | ts_headline 函数 | 2.3 | 🔜 |
| 2.5 | Flutter 搜索 UI | 搜索页面 + 结果列表 | 2.3 | 🔜 |
| 2.6 | Desktop 搜索 UI | Ctrl+F 快捷键 + 搜索面板 | 2.3 | 🔜 |

---

## 后端实现

### Migration

```sql
-- 添加 tsvector 列和 GIN 索引
ALTER TABLE messages ADD COLUMN search_vector tsvector;
CREATE INDEX idx_messages_search ON messages USING GIN(search_vector);

-- 触发器: 消息插入/更新时自动更新 search_vector
CREATE FUNCTION messages_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_search_update
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_search_trigger();

-- 回填已有消息
UPDATE messages SET search_vector = to_tsvector('simple', COALESCE(content, ''));
```

### 搜索服务

```typescript
// messages.service.ts
async search(userId: string, query: string, converseId?: string, limit = 20, offset = 0) {
  return this.prisma.$queryRaw`
    SELECT m.*, ts_headline('simple', m.content, plainto_tsquery('simple', ${query})) as highlight
    FROM messages m
    JOIN converse_members cm ON cm."converseId" = m."converseId" AND cm."userId" = ${userId}
    WHERE m.search_vector @@ plainto_tsquery('simple', ${query})
      AND m."deletedAt" IS NULL
      ${converseId ? Prisma.sql`AND m."converseId" = ${converseId}` : Prisma.empty}
    ORDER BY ts_rank(m.search_vector, plainto_tsquery('simple', ${query})) DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
```

### 中文分词

PostgreSQL `simple` 配置不做真正的分词，只做 lowercase。对中文的效果：
- `plainto_tsquery('simple', '你好')` 会把"你好"整体作为一个 token
- 搜索"你好"能精确匹配包含"你好"的消息
- **但搜索"你"不能匹配"你好世界"**（因为整个中文段是一个 token）

| 方案 | 说明 | 复杂度 | 中文效果 |
|------|------|--------|---------|
| `simple` | 不分词，整段匹配 | 低（默认可用） | 需完整词匹配 |
| `simple` + `LIKE` fallback | 全文搜索优先，无结果时用 `LIKE '%keyword%'` | 低 | 子串匹配 |
| `zhparser` | 基于 SCWS 的中文分词 PG 扩展 | 中（需安装扩展） | 词级匹配 |
| `pg_jieba` | 基于 jieba 的 PG 扩展 | 中（需安装扩展） | 词级匹配 |

**建议**：MVP 阶段用 `simple` + `LIKE` fallback 组合方案 — 先走 tsvector 索引搜索，如果无结果则退化为 `LIKE '%keyword%'`（走顺序扫描，但对小数据集可接受）。后续根据数据量和搜索质量反馈再升级到 zhparser。

---

## 新增文件

```
apps/server/src/messages/dto/search-messages.dto.ts   # { query, converseId?, limit?, offset? }
apps/server/prisma/migrations/xxx_add_search_vector/   # migration SQL
apps/mobile/lib/features/search/pages/search_page.dart
apps/mobile/lib/features/search/providers/search_provider.dart
apps/desktop/src/renderer/components/chat/SearchPanel.tsx
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `messages.service.ts` | 新增 `search()` 方法 |
| `messages.controller.ts` | 新增 GET `/search` 端点 |
| `ChatThread.tsx` | 新增 Ctrl+F 快捷键 → 打开 SearchPanel |
| `chat.css` | SearchPanel 样式 |

---

## 新增 API 端点

| Method | Path | Query Params | 说明 |
|--------|------|-------------|------|
| GET | `/api/v1/messages/search` | `query`, `converseId?`, `limit?`, `offset?` | 消息搜索，返回 `{ results, total }` |

---

## 验收标准

- [ ] 搜索中文关键词能正确返回结果
- [ ] 搜索结果中关键词高亮
- [ ] 点击搜索结果可跳转到消息在聊天中的位置
- [ ] 仅搜索用户有权限访问的会话
- [ ] 空查询不返回结果（不是返回全部）
- [ ] `query` 参数验证：非空，长度 1-100 字符
- [ ] 搜索响应包含 `total` 字段用于分页
- [ ] Desktop: Ctrl+F 打开搜索面板
- [ ] `pnpm build && pnpm test` 通过
