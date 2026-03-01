// apps/server/src/profile/dto/update-profile.dto.ts
import { IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '昵称长度必须至少 1 个字符' })
  @MaxLength(64, { message: '昵称长度不能超过 64 个字符' })
  displayName?: string;

  @IsOptional()
  @IsEnum(UserStatus, { message: '状态必须是有效的用户状态' })
  status?: UserStatus;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
