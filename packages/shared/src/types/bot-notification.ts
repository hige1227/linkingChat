/**
 * BOT_NOTIFICATION 消息元数据接口
 *
 * 当 Message.type === 'BOT_NOTIFICATION' 时，
 * Message.metadata 应符合此接口定义。
 * 客户端据此渲染通知卡片。
 */
export interface BotNotificationMetadata {
  /** 卡片类型，决定渲染样式（颜色、图标） */
  cardType: 'task_complete' | 'error' | 'info' | 'action_required';

  /** 卡片标题（必填） */
  title: string;

  /** 卡片描述文本（可选） */
  description?: string;

  /** 触发此通知的来源 Bot ID */
  sourceBotId?: string;

  /** 触发此通知的来源 Bot 名称（冗余存储，避免额外查询） */
  sourceBotName?: string;

  /** 操作按钮列表（最多 3 个） */
  actions?: BotNotificationAction[];

  /** 任务执行耗时（毫秒），cardType=task_complete 时展示 */
  executionTimeMs?: number;

  /** 通知产生的时间戳 (ISO 8601) */
  timestamp: string;
}

export interface BotNotificationAction {
  /** 按钮显示文本 */
  label: string;
  /** 按钮动作类型 */
  action: 'view_result' | 'retry' | 'navigate';
  /** 动作附带的载荷数据 */
  payload?: Record<string, unknown>;
}
