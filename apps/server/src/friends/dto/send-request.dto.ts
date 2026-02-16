import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class SendFriendRequestDto {
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
