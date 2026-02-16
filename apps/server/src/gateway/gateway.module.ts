import { Global, Module } from '@nestjs/common';
import { DeviceGateway } from './device.gateway';
import { ChatGateway } from './chat.gateway';
import { BroadcastService } from './broadcast.service';
import { PresenceService } from './presence.service';
import { DevicesModule } from '../devices/devices.module';
import { ConversesModule } from '../converses/converses.module';
import { FriendsModule } from '../friends/friends.module';

@Global()
@Module({
  imports: [DevicesModule, ConversesModule, FriendsModule],
  providers: [DeviceGateway, ChatGateway, BroadcastService, PresenceService],
  exports: [BroadcastService, PresenceService],
})
export class GatewayModule {}
