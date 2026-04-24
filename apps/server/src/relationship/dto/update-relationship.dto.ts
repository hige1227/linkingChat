import { IsEnum, IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';

export class UpdateRelationshipDto {
  @IsOptional()
  @IsEnum(['CORE', 'IMPORTANT', 'EXTENDED'])
  tier?: 'CORE' | 'IMPORTANT' | 'EXTENDED';

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isMuted?: boolean;

  @IsOptional()
  @IsBoolean()
  isUrgentReply?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  customSilenceDays?: number;
}
