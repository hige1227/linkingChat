export interface AttachmentResponse {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailUrl: string | null;
}

export class MessageResponseDto {
  id: string;
  content: string;
  type: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  converseId: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
  attachments?: AttachmentResponse[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
