import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AiGatewayController } from './ai-gateway.controller';
import { AiGatewayService } from './ai-gateway.service';
import { AiGatewayGuard } from './guards/ai-gateway.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AiGatewayController],
  providers: [AiGatewayService, AiGatewayGuard],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
