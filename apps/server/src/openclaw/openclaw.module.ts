import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { GatewayManagerService } from './gateway-manager.service';
import { OpenclawController } from './openclaw.controller';

@Module({
  imports: [JwtModule.register({}), ConfigModule],
  controllers: [OpenclawController],
  providers: [GatewayManagerService],
  exports: [GatewayManagerService],
})
export class OpenclawModule {}
