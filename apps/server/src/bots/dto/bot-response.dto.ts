/**
 * Bot API 响应格式（用于文档和类型参考，非运行时验证）
 */
export interface BotResponseDto {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  type: 'REMOTE_EXEC' | 'SOCIAL_MEDIA' | 'CUSTOM';
  agentConfig: Record<string, unknown>;
  isPinned: boolean;
  isDeletable: boolean;
  ownerId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}
