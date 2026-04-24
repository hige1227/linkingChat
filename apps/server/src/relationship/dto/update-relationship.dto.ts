import { IsEnum, IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { RelationshipTier } from '@prisma/client';

export class UpdateRelationshipDto {
  @IsOptional()
  @IsEnum(RelationshipTier)
  tier?: RelationshipTier;

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
