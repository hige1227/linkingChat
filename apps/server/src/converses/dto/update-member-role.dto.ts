import { IsEnum } from 'class-validator';

enum UpdateableGroupRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export class UpdateMemberRoleDto {
  @IsEnum(UpdateableGroupRole)
  role: 'ADMIN' | 'MEMBER';
}
