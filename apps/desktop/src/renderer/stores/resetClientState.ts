import { resetChatSocket } from '../hooks/useChatSocket';
import { resetAiStore } from './aiStore';
import { resetChatStore } from './chatStore';
import { resetFriendsStore } from './friendsStore';

export function resetClientState(): void {
  resetChatSocket();
  resetChatStore();
  resetAiStore();
  resetFriendsStore();
}
