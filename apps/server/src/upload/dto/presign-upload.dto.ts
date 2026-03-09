import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum UploadCategory {
  IMAGE = 'image',
  FILE = 'file',
  VOICE = 'voice',
  AVATAR = 'avatar',
}

export class PresignUploadDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsEnum(UploadCategory)
  category: UploadCategory;
}
