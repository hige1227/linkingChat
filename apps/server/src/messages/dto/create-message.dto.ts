import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  VOICE = 'VOICE',
  SYSTEM = 'SYSTEM',
  BOT_NOTIFICATION = 'BOT_NOTIFICATION',
}

export class AttachmentInput {
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  @IsOptional()
  size?: number;

  @IsNumber()
  @IsOptional()
  width?: number;

  @IsNumber()
  @IsOptional()
  height?: number;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;
}

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  converseId: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  content?: string;

  @IsEnum(MessageType)
  @IsOptional()
  type?: MessageType = MessageType.TEXT;

  @IsString()
  @IsOptional()
  replyToId?: string;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentInput)
  @IsOptional()
  attachments?: AttachmentInput[];

  /** When true, skip server-side bot AI dispatch (Desktop handles it locally via OpenClaw) */
  @IsOptional()
  skipBotDispatch?: boolean;

}
