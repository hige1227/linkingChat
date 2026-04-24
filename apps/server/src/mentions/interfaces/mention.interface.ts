/** 解析后的原始 @mention */
export interface ParsedMention {
  /** 提取的名称（不含 @ 符号） */
  name: string;
  /** 完整匹配文本（含 @ 符号） */
  fullMatch: string;
  /** 在原文中的起始位置 */
  startIndex: number;
}

/** 验证后的有效 @mention */
export interface ValidMention {
  /** 类型：bot、ai 或 user（群成员） */
  type: 'bot' | 'ai' | 'user';
  /** 名称 */
  name: string;
  /** 完整匹配文本 */
  fullMatch: string;
  /** Bot ID（仅 type='bot' 时） */
  botId?: string;
  /** 关联的用户 ID（type='bot' 或 type='user' 时） */
  userId?: string;
}
