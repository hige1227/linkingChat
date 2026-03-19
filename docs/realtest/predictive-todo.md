# Predictive Action 待优化项

## 执行反馈 + 结果记录（方案 B）

**问题**：用户点 Run 后卡片直接消失，没有任何反馈，也没有历史记录。

**方案**：执行结果变成聊天消息
1. 点 Run → 卡片显示 "Running..." + spinner，其他 action 禁用
2. Desktop Worker 实际执行命令
3. 执行结果由 Bot 作为一条消息发到对话中（永久保留在聊天记录里）
4. 卡片显示 "Done ✓" 后 30s 自动消失（消息即永久记录）
5. 失败时显示 "Failed ✗" + 错误信息，保留可重试

**涉及改动**：
- 前端（Desktop + Mobile）：卡片状态机 idle → executing → success/failed
- 后端：`ai:predictive:result` WS 事件，Bot 发消息到对话
- Desktop Worker：接收并执行命令，回传结果

**优先级**：P1（功能完善阶段）
