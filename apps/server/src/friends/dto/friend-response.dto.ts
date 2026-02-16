export class FriendResponseDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'ONLINE' | 'IDLE' | 'DND' | 'OFFLINE';
  converseId?: string;
}
