import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GatewayManagerService } from './gateway-manager.service';
import { OpenclawController } from './openclaw.controller';

@Module({
  imports: [ConfigModule],
  controllers: [OpenclawController],
  providers: [GatewayManagerService],
  exports: [GatewayManagerService],
})
export class OpenclawModule {}
