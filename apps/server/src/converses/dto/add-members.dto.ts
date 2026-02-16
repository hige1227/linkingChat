import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class AddMembersDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(199)
  memberIds: string[];
}
