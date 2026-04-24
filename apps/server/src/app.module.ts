import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { GatewayModule } from './gateway/gateway.module';
import { FriendsModule } from './friends/friends.module';
import { ConversesModule } from './converses/converses.module';
import { MessagesModule } from './messages/messages.module';
import { UsersModule } from './users/users.module';
import { BotsModule } from './bots/bots.module';
import { AiModule } from './ai/ai.module';
import { AiGatewayModule } from './ai/ai-gateway.module';
import { OpenclawModule } from './openclaw/openclaw.module';
import { AgentsModule } from './agents/agents.module';
import { MentionsModule } from './mentions/mentions.module';
import { ProfileModule } from './profile/profile.module';
import { UploadModule } from './upload/upload.module';
import { MetricsModule } from './metrics/metrics.module';
import { I18nModule } from './i18n/i18n.module';
import { MailModule } from './mail/mail.module';
import { AppConfigModule } from './config/config.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JarvisModule } from './jarvis/jarvis.module';
import { RelationshipModule } from './relationship/relationship.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    // Global rate limiting: 100 requests per 60 seconds per IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    DevicesModule,
    GatewayModule,
    FriendsModule,
    ConversesModule,
    MessagesModule,
    UsersModule,
    BotsModule,
    AiModule,
    AiGatewayModule,
    ScheduleModule.forRoot(),
    OpenclawModule,
    AgentsModule,
    MentionsModule,
    UploadModule,
    ProfileModule,
    MetricsModule,
    I18nModule,
    MailModule,
    AppConfigModule,
    JarvisModule,
    RelationshipModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Enable ThrottlerGuard globally for all REST endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global logging + metrics interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
