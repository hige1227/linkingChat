import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsIn,
  MinLength,
  MaxLength,
  IsUrl,
} from 'class-validator';

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsIn(['REMOTE_EXEC', 'SOCIAL_MEDIA', 'CUSTOM'])
  type?: 'REMOTE_EXEC' | 'SOCIAL_MEDIA' | 'CUSTOM';

  @IsOptional()
  @IsObject()
  agentConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
