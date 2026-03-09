// ========== 文件上传限制（Sprint 4 Phase 0） ==========

/** 图片最大大小：10 MB */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** 文件最大大小：50 MB */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** 语音最大大小：5 MB */
export const MAX_VOICE_SIZE = 5 * 1024 * 1024;

/** 头像最大大小：5 MB */
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

/** 预签名 URL 有效期：5 分钟 */
export const PRESIGN_EXPIRY_SECONDS = 5 * 60;

/** 允许的图片 MIME 类型 */
export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** 允许的语音 MIME 类型 */
export const ALLOWED_VOICE_MIMES = [
  'audio/webm',
  'audio/aac',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
] as const;

/** 允许的头像 MIME 类型 */
export const ALLOWED_AVATAR_MIMES = ['image/jpeg', 'image/png'] as const;

/** MIME 类型到文件扩展名映射 */
export const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'audio/webm': '.webm',
  'audio/aac': '.aac',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
};

/** S3 存储桶名称 */
export const BUCKET_ATTACHMENTS = 'attachments';
export const BUCKET_AVATARS = 'avatars';
