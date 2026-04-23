import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class LlmMessageDto {
  @IsString()
  role: 'system' | 'user' | 'assistant';

  @IsString()
  content: string;
}

export class LlmProxyDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LlmMessageDto)
  messages: LlmMessageDto[];

  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  max_tokens?: number;
}
