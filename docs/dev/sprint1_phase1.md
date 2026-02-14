> **状态：✅ 已完成** | 完成日期：2026-02-14

# Sprint 1 — Phase 1：Server（认证 + 设备管理 + WebSocket Gateway）

> **负责人**：后端开发者
>
> **前置条件**：Phase 0 共享类型定义已完成（`@linkingchat/shared` + `@linkingchat/ws-protocol` 可正常 import）
>
> **产出**：完整的 NestJS 服务端 — JWT RS256 认证 + 设备 REST CRUD + WebSocket /device 命名空间 + 命令转发
>
> **参考**：[sprint-1-plan.md](../dev-plan/sprint-1-plan.md) | [websocket-protocol.md](../dev-plan/websocket-protocol.md) | [database-schema.md](../dev-plan/database-schema.md)

---

## 任务清单

| # | 任务 | 产出文件 | 依赖 |
|---|------|---------|------|
| 1.1 | PrismaModule (@Global) | `src/prisma/prisma.module.ts`, `prisma.service.ts` | Prisma schema 已 migrate |
| 1.2 | Auth 模块 — 注册 | `src/auth/auth.service.ts`, `auth.controller.ts` | 1.1 |
| 1.3 | Auth 模块 — 登录 | `src/auth/auth.service.ts` | 1.2 |
| 1.4 | Auth 模块 — 刷新令牌 | `src/auth/auth.service.ts` | 1.3 |
| 1.5 | JWT Strategy (RS256) | `src/auth/strategies/jwt.strategy.ts`, `guards/jwt-auth.guard.ts` | 1.2 |
| 1.6 | Devices 模块 | `src/devices/devices.controller.ts`, `devices.service.ts` | 1.1, 1.5 |
| 1.7 | Commands Service | `src/devices/commands.service.ts` | 1.1 |
| 1.8 | Redis IO Adapter | `src/gateway/adapters/redis-io.adapter.ts`, `main.ts` 修改 | Docker Redis 已运行 |
| 1.9 | WS Auth Middleware | `src/gateway/middleware/ws-auth.middleware.ts` | 1.5 |
| 1.10 | Device Gateway (/device 命名空间) | `src/gateway/device.gateway.ts` | 1.6, 1.7, 1.8, 1.9 |
| 1.11 | E2E 测试 | `test/device-gateway.e2e-spec.ts` | 1.10 |

---

## 1.1 PrismaModule (@Global)

将 Prisma Client 封装为 NestJS 全局模块，所有业务模块通过依赖注入获取数据库访问能力。

```typescript
// apps/server/src/prisma/prisma.service.ts

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// apps/server/src/prisma/prisma.module.ts

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

**要点**：
- `@Global()` 装饰器使 PrismaService 在任何模块中都无需 import PrismaModule 即可注入
- `onModuleInit` 在应用启动时建立数据库连接
- `onModuleDestroy` 在应用关闭时断开连接，NestJS 会自动调用（需在 `main.ts` 中启用 `app.enableShutdownHooks()`）

---

## 1.2 Auth 模块 — 注册

`POST /api/v1/auth/register` — 创建用户，使用 argon2 哈希密码，返回 JWT RS256 令牌对。

### DTO

```typescript
// apps/server/src/auth/dto/register.dto.ts

import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username can only contain letters, numbers, and underscores' })
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName: string;
}
```

### Service

```typescript
// apps/server/src/auth/auth.service.ts — register 方法

import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AuthService {
  private readonly jwtPrivateKey: string;
  private readonly jwtPublicKey: string;
  private readonly refreshPrivateKey: string;
  private readonly refreshPublicKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    // RS256 密钥从环境变量读取 (base64 编码)
    this.jwtPrivateKey = Buffer.from(
      process.env.AUTH_JWT_PRIVATE_KEY!, 'base64',
    ).toString('utf-8');
    this.jwtPublicKey = Buffer.from(
      process.env.AUTH_JWT_PUBLIC_KEY!, 'base64',
    ).toString('utf-8');
    this.refreshPrivateKey = Buffer.from(
      process.env.AUTH_REFRESH_PRIVATE_KEY!, 'base64',
    ).toString('utf-8');
    this.refreshPublicKey = Buffer.from(
      process.env.AUTH_REFRESH_PUBLIC_KEY!, 'base64',
    ).toString('utf-8');
  }

  async register(dto: RegisterDto) {
    // 1. 检查用户是否已存在
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (existing) {
      throw new ConflictException(
        existing.email === dto.email
          ? 'Email already registered'
          : 'Username already taken',
      );
    }

    // 2. argon2 哈希密码
    const hashedPassword = await argon2.hash(dto.password);

    // 3. 创建用户
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashedPassword,
        displayName: dto.displayName,
      },
    });

    // 4. 生成 token pair
    const tokens = await this.generateTokenPair(user.id, user.username);

    // 5. 存储 refresh token
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
      },
      ...tokens,
    };
  }

  // --- Token 生成 ---

  private async generateTokenPair(userId: string, username: string) {
    const payload = { sub: userId, username };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        algorithm: 'RS256',
        privateKey: this.jwtPrivateKey,
        expiresIn: process.env.AUTH_JWT_TOKEN_EXPIRES_IN || '15m',
      }),
      this.jwtService.signAsync(
        { sub: userId, type: 'refresh' },
        {
          algorithm: 'RS256',
          privateKey: this.refreshPrivateKey,
          expiresIn: process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN || '30d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, token: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
  }
}
```

### Controller

```typescript
// apps/server/src/auth/auth.controller.ts

import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
```

**响应格式**：

```json
{
  "user": {
    "id": "clxyz...",
    "email": "user@example.com",
    "username": "john",
    "displayName": "John"
  },
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

---

## 1.3 Auth 模块 — 登录

`POST /api/v1/auth/login` — 验证邮箱 + 密码，返回 JWT RS256 令牌对。

### DTO

```typescript
// apps/server/src/auth/dto/login.dto.ts

import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

### Service 方法

```typescript
// apps/server/src/auth/auth.service.ts — login 方法

import { UnauthorizedException } from '@nestjs/common';

async login(dto: LoginDto) {
  // 1. 查找用户
  const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });

  if (!user) {
    throw new UnauthorizedException('Invalid email or password');
  }

  // 2. 验证密码 (argon2)
  const isPasswordValid = await argon2.verify(user.password, dto.password);

  if (!isPasswordValid) {
    throw new UnauthorizedException('Invalid email or password');
  }

  // 3. 生成 token pair
  const tokens = await this.generateTokenPair(user.id, user.username);

  // 4. 存储 refresh token
  await this.storeRefreshToken(user.id, tokens.refreshToken);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
    },
    ...tokens,
  };
}
```

### Controller 方法

```typescript
// apps/server/src/auth/auth.controller.ts — login

@Post('login')
@HttpCode(HttpStatus.OK)
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

**安全要点**：
- 登录失败时统一返回 `Invalid email or password`，不泄露用户是否存在
- argon2 的 `verify` 是时间恒定比较，防止时序攻击

---

## 1.4 Auth 模块 — 刷新令牌

`POST /api/v1/auth/refresh` — 使用 refresh token 换取新的令牌对（Token Rotation 策略）。

### DTO

```typescript
// apps/server/src/auth/dto/refresh.dto.ts

import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
```

### Service 方法

```typescript
// apps/server/src/auth/auth.service.ts — refresh 方法

async refresh(dto: RefreshDto) {
  // 1. 验证 refresh token 签名 (RS256 公钥)
  let payload: { sub: string; type: string };
  try {
    payload = await this.jwtService.verifyAsync(dto.refreshToken, {
      algorithms: ['RS256'],
      publicKey: this.refreshPublicKey,
    });
  } catch {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  if (payload.type !== 'refresh') {
    throw new UnauthorizedException('Invalid token type');
  }

  // 2. 检查 refresh token 是否存在于数据库（未被撤销）
  const storedToken = await this.prisma.refreshToken.findUnique({
    where: { token: dto.refreshToken },
  });

  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw new UnauthorizedException('Refresh token revoked or expired');
  }

  // 3. 查找用户
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    throw new UnauthorizedException('User not found');
  }

  // 4. Token Rotation: 删除旧 refresh token，生成新 pair
  await this.prisma.refreshToken.delete({
    where: { id: storedToken.id },
  });

  const tokens = await this.generateTokenPair(user.id, user.username);
  await this.storeRefreshToken(user.id, tokens.refreshToken);

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}
```

### Controller 方法

```typescript
// apps/server/src/auth/auth.controller.ts — refresh

@Post('refresh')
@HttpCode(HttpStatus.OK)
async refresh(@Body() dto: RefreshDto) {
  return this.authService.refresh(dto);
}
```

**Token Rotation 安全策略**：每次使用 refresh token 后立即删除旧 token 并生成新 token。如果旧 token 被重放（泄露场景），数据库中已不存在，请求会被拒绝。

---

## 1.5 JWT Strategy (RS256)

使用 `passport-jwt` 提取并验证 Bearer token，通过 RS256 公钥验证签名。

### Strategy

```typescript
// apps/server/src/auth/strategies/jwt.strategy.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const publicKey = Buffer.from(
      process.env.AUTH_JWT_PUBLIC_KEY!, 'base64',
    ).toString('utf-8');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKey: publicKey,
    });
  }

  async validate(payload: { sub: string; username: string }) {
    if (!payload.sub) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, username: payload.username };
  }
}
```

### Guard

```typescript
// apps/server/src/auth/guards/jwt-auth.guard.ts

import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### CurrentUser Decorator

```typescript
// apps/server/src/auth/decorators/current-user.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

### Auth Module 注册

```typescript
// apps/server/src/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // RS256 密钥在 AuthService 中手动传入
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
```

**使用方式**：任何需要认证的路由只需添加 `@UseGuards(JwtAuthGuard)`，然后用 `@CurrentUser()` 获取用户信息。

```typescript
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@CurrentUser() user: { userId: string; username: string }) {
  return user;
}
```

---

## 1.6 Devices 模块

设备管理 REST CRUD，所有端点需 JWT 认证。用户只能操作自己的设备。

### Service

```typescript
// apps/server/src/devices/devices.service.ts

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneById(id: string, userId: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    if (device.userId !== userId) throw new ForbiddenException();
    return device;
  }

  async update(id: string, userId: string, data: { name?: string }) {
    const device = await this.findOneById(id, userId);
    return this.prisma.device.update({
      where: { id: device.id },
      data,
    });
  }

  async remove(id: string, userId: string) {
    const device = await this.findOneById(id, userId);
    await this.prisma.device.delete({ where: { id: device.id } });
    return { deleted: true };
  }

  /** 由 Device Gateway 调用，设备上线时 upsert */
  async upsertDevice(
    userId: string,
    payload: { deviceId: string; name: string; platform: string },
  ) {
    return this.prisma.device.upsert({
      where: { id: payload.deviceId },
      create: {
        id: payload.deviceId,
        name: payload.name,
        platform: payload.platform,
        status: 'ONLINE',
        lastSeenAt: new Date(),
        userId,
      },
      update: {
        name: payload.name,
        platform: payload.platform,
        status: 'ONLINE',
        lastSeenAt: new Date(),
      },
    });
  }

  /** 设备下线 */
  async setOffline(deviceId: string) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'OFFLINE',
        lastSeenAt: new Date(),
      },
    });
  }
}
```

### Controller

```typescript
// apps/server/src/devices/devices.controller.ts

import {
  Controller, Get, Patch, Delete, Param, Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DevicesService } from './devices.service';

@Controller('api/v1/devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  /** GET /api/v1/devices — 当前用户的设备列表 */
  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.devicesService.findAllByUser(userId);
  }

  /** GET /api/v1/devices/:id — 单个设备详情 */
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.devicesService.findOneById(id, userId);
  }

  /** PATCH /api/v1/devices/:id — 更新设备名称 */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { name?: string },
  ) {
    return this.devicesService.update(id, userId, body);
  }

  /** DELETE /api/v1/devices/:id — 删除设备 */
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.devicesService.remove(id, userId);
  }
}
```

### Module

```typescript
// apps/server/src/devices/devices.module.ts

import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { CommandsService } from './commands.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, CommandsService],
  exports: [DevicesService, CommandsService],
})
export class DevicesModule {}
```

---

## 1.7 Commands Service

命令记录的创建与状态更新。供 Device Gateway 调用。

```typescript
// apps/server/src/devices/commands.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CommandStatus } from '@prisma/client';

@Injectable()
export class CommandsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 创建命令记录（发送命令时） */
  async create(data: {
    type: string;
    payload: Record<string, unknown>;
    deviceId: string;
    issuerId: string;
  }) {
    return this.prisma.command.create({
      data: {
        type: data.type,
        payload: data.payload,
        deviceId: data.deviceId,
        issuerId: data.issuerId,
        status: 'PENDING',
      },
    });
  }

  /** 更新命令状态（执行完成时） */
  async complete(
    commandId: string,
    result: {
      status: CommandStatus;
      data?: Record<string, unknown>;
    },
  ) {
    const command = await this.prisma.command.findUnique({
      where: { id: commandId },
    });

    if (!command) {
      throw new NotFoundException(`Command ${commandId} not found`);
    }

    return this.prisma.command.update({
      where: { id: commandId },
      data: {
        status: result.status,
        result: result.data ?? null,
        completedAt: new Date(),
      },
    });
  }

  /** 查询用户的命令历史（游标分页） */
  async findByUser(
    issuerId: string,
    cursor?: string,
    take = 20,
  ) {
    const commands = await this.prisma.command.findMany({
      where: { issuerId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const hasMore = commands.length > take;
    if (hasMore) commands.pop();

    return {
      data: commands,
      nextCursor: hasMore ? commands[commands.length - 1].id : null,
    };
  }
}
```

---

## 1.8 Redis IO Adapter

使用 `@socket.io/redis-adapter` 实现 Socket.IO 多实例水平扩展。所有 NestJS 实例通过 Redis Pub/Sub 同步房间事件。

### Adapter 类

```typescript
// apps/server/src/gateway/adapters/redis-io.adapter.ts

import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6387';

    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();

    await Promise.all([
      new Promise<void>((resolve) => pubClient.on('connect', resolve)),
      new Promise<void>((resolve) => subClient.on('connect', resolve)),
    ]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    console.log('[RedisIoAdapter] Connected to Redis');
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingInterval: 25000,
      pingTimeout: 60000,
      maxHttpBufferSize: 1e6, // 1MB
    });

    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

### main.ts 集成

```typescript
// apps/server/src/main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './gateway/adapters/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 启用优雅关闭（触发 onModuleDestroy）
  app.enableShutdownHooks();

  // Redis IO Adapter
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = process.env.APP_PORT || 3008;
  await app.listen(port);
  console.log(`[Server] Listening on port ${port}`);
}

bootstrap();
```

**要点**：
- `connectToRedis()` 在 `app.listen()` 之前调用，确保 Redis 连接就绪
- `createIOServer` 合并默认配置（CORS、transport、ping 参数）
- 水平扩展时多个 NestJS 实例共享同一 Redis，房间消息自动同步

---

## 1.9 WS Auth Middleware

Socket.IO 中间件，在 handshake 阶段验证 JWT。验证失败时 `next(new Error(...))` 会自动断开连接。

```typescript
// apps/server/src/gateway/middleware/ws-auth.middleware.ts

import { Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  username: string;
}

/**
 * Socket.IO 中间件工厂
 * 用 RS256 公钥验证 handshake.auth.token
 */
export function createWsAuthMiddleware() {
  const publicKey = Buffer.from(
    process.env.AUTH_JWT_PUBLIC_KEY!,
    'base64',
  ).toString('utf-8');

  return (socket: Socket, next: (err?: Error) => void) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('AUTH_MISSING: No token provided'));
      }

      // RS256 公钥验证
      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
      }) as JwtPayload;

      if (!payload.sub) {
        return next(new Error('AUTH_INVALID: Invalid token payload'));
      }

      // 将用户信息挂载到 socket.data
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      socket.data.deviceType = socket.handshake.auth?.deviceType || 'web';
      socket.data.deviceId = socket.handshake.auth?.deviceId;

      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new Error('AUTH_EXPIRED: Token expired'));
      }
      return next(new Error('AUTH_INVALID: Token verification failed'));
    }
  };
}
```

**要点**：
- 使用原生 `jsonwebtoken` 而非 NestJS JwtService，因为中间件在 NestJS DI 上下文之外
- 三种错误码：`AUTH_MISSING`（未携带 token）、`AUTH_EXPIRED`（过期）、`AUTH_INVALID`（签名无效）
- `socket.data` 是 Socket.IO 提供的每连接数据存储，类型安全由 `SocketData` 接口保证

---

## 1.10 Device Gateway (/device 命名空间)

核心 WebSocket 网关。处理设备注册、命令转发、结果回报。

```typescript
// apps/server/src/gateway/device.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { createWsAuthMiddleware } from './middleware/ws-auth.middleware';
import { DevicesService } from '../devices/devices.service';
import { CommandsService } from '../devices/commands.service';

import type { TypedSocket } from '@linkingchat/ws-protocol';
import type {
  DeviceRegisterPayload,
  DeviceCommandPayload,
  DeviceResultPayload,
} from '@linkingchat/ws-protocol';
import type { WsEnvelope, WsResponse } from '@linkingchat/ws-protocol';

// --- 危险命令黑名单 ---
const DANGEROUS_PATTERNS: RegExp[] = [
  /^rm\s+(-rf?|--recursive)\s+\//,     // rm -rf /
  /^rm\s+-rf?\s+~/,                     // rm -rf ~
  /^format\s/i,                          // format C:
  /^mkfs\./,                             // mkfs.ext4
  /^dd\s+if=/,                           // dd if=/dev/zero of=/dev/sda
  /^:\(\)\{.*\|.*&\s*\}\s*;/,           // fork bomb
  /shutdown|reboot|halt|poweroff/i,      // system power control
  /^chmod\s+(-R\s+)?777\s+\//,          // chmod 777 /
  /^chown\s+(-R\s+)?.*\s+\//,           // chown -R ... /
  />\s*\/dev\/sd[a-z]/,                  // write to raw disk
  /\|\s*bash\s*$/,                       // piped to bash (curl | bash)
  /curl.*\|\s*sh/i,                      // curl | sh
];

function isDangerousCommand(action: string): boolean {
  const trimmed = action.trim();
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// --- Gateway ---

@WebSocketGateway({ namespace: '/device' })
export class DeviceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DeviceGateway.name);

  @WebSocketServer()
  namespace: Namespace;

  // 记录 socketId → deviceId 映射，用于断开连接时查找
  private socketDeviceMap = new Map<string, string>();

  constructor(
    private readonly devicesService: DevicesService,
    private readonly commandsService: CommandsService,
  ) {}

  /** 注册 WS Auth 中间件 */
  afterInit(namespace: Namespace) {
    namespace.use(createWsAuthMiddleware());
    this.logger.log('Device Gateway initialized with RS256 auth middleware');
  }

  /** 连接成功：加入用户房间 */
  async handleConnection(client: TypedSocket) {
    const userId = client.data.userId;
    client.join(`u-${userId}`);
    this.logger.log(
      `Client connected: ${client.id} | userId=${userId} | deviceType=${client.data.deviceType}`,
    );
  }

  /** 断开连接：设备下线 + 广播状态变更 */
  async handleDisconnect(client: TypedSocket) {
    const userId = client.data.userId;
    const deviceId = this.socketDeviceMap.get(client.id);

    if (deviceId) {
      try {
        const device = await this.devicesService.setOffline(deviceId);
        this.socketDeviceMap.delete(client.id);

        // 广播设备下线状态给用户的所有客户端
        this.namespace.to(`u-${userId}`).emit('device:status:changed', {
          deviceId: device.id,
          name: device.name,
          platform: device.platform as 'darwin' | 'win32' | 'linux',
          online: false,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error(`Failed to set device offline: ${deviceId}`, error);
      }
    }

    this.logger.log(`Client disconnected: ${client.id} | userId=${userId}`);
  }

  /**
   * device:heartbeat — 桌面端心跳
   *
   * fire-and-forget，无 ack。Sprint 1 仅记录日志 + 更新 lastSeenAt。
   */
  @SubscribeMessage('device:heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() data: { deviceId: string },
  ): Promise<void> {
    await this.devicesService.updateLastSeen(data.deviceId);
    this.logger.debug(`Heartbeat: device=${data.deviceId}`);
  }

  /**
   * device:command:cancel — 取消命令（Sprint 1 仅标记状态，不中断执行）
   */
  @SubscribeMessage('device:command:cancel')
  async handleCommandCancel(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() data: { commandId: string },
  ): Promise<WsResponse> {
    try {
      await this.commandsService.complete(data.commandId, {
        status: 'CANCELLED',
        data: null,
      });
      return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      return {
        success: false,
        error: { code: 'CANCEL_FAILED', message: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * device:register — 设备上线注册
   *
   * Desktop 客户端连接后立即发送此事件，携带设备信息。
   * 服务端 upsert 设备记录，加入设备房间，广播状态变更。
   */
  @SubscribeMessage('device:register')
  async handleRegister(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() data: DeviceRegisterPayload,
  ): Promise<WsResponse> {
    const userId = client.data.userId;

    try {
      // 1. Upsert device to DB
      const device = await this.devicesService.upsertDevice(userId, {
        deviceId: data.deviceId,
        name: data.name,
        platform: data.platform,
      });

      // 2. Join device room
      client.join(`d-${data.deviceId}`);
      this.socketDeviceMap.set(client.id, data.deviceId);
      client.data.deviceId = data.deviceId;

      // 3. Broadcast status changed to all user's clients
      this.namespace.to(`u-${userId}`).emit('device:status:changed', {
        deviceId: device.id,
        name: device.name,
        platform: device.platform as 'darwin' | 'win32' | 'linux',
        online: true,
        lastSeenAt: device.lastSeenAt?.toISOString() ?? new Date().toISOString(),
      });

      this.logger.log(
        `Device registered: ${data.deviceId} (${data.platform}) for user ${userId}`,
      );

      return {
        success: true,
        data: { deviceId: device.id },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Device register failed: ${error.message}`);
      return {
        success: false,
        error: { code: 'REGISTER_FAILED', message: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * device:command:send — 手机端发送命令
   *
   * 流程：黑名单检查 → 创建命令记录 → 转发给目标设备 → ACK 给发送者
   */
  @SubscribeMessage('device:command:send')
  async handleCommandSend(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() envelope: WsEnvelope<DeviceCommandPayload>,
  ): Promise<WsResponse> {
    const userId = client.data.userId;
    const payload = envelope.data;

    try {
      // 1. 危险命令黑名单检查
      if (payload.type === 'shell' && isDangerousCommand(payload.action)) {
        this.logger.warn(
          `Dangerous command blocked: "${payload.action}" from user ${userId}`,
        );
        return {
          requestId: envelope.requestId,
          success: false,
          error: {
            code: 'COMMAND_DANGEROUS',
            message: `Command blocked by safety filter: "${payload.action}"`,
          },
          timestamp: new Date().toISOString(),
        };
      }

      // 2. 创建命令记录
      const command = await this.commandsService.create({
        type: payload.type,
        payload: {
          action: payload.action,
          args: payload.args,
          timeout: payload.timeout,
        },
        deviceId: payload.targetDeviceId,
        issuerId: userId,
      });

      // 3. 转发命令到目标设备
      const commandToExecute: DeviceCommandPayload = {
        commandId: command.id,
        targetDeviceId: payload.targetDeviceId,
        type: payload.type as 'shell' | 'file' | 'automation',
        action: payload.action,
        args: payload.args,
        timeout: payload.timeout ?? 30000,
      };

      this.namespace
        .to(`d-${payload.targetDeviceId}`)
        .emit('device:command:execute', commandToExecute);

      // 3.5 通知发送者命令已被接收并转发
      this.namespace
        .to(`u-${userId}`)
        .emit('device:command:ack', { commandId: command.id, status: 'dispatched' });

      this.logger.log(
        `Command dispatched: ${command.id} → device ${payload.targetDeviceId}`,
      );

      // 4. ACK 给发送者
      return {
        requestId: envelope.requestId,
        success: true,
        data: { commandId: command.id, status: 'dispatched' },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Command send failed: ${error.message}`);
      return {
        requestId: envelope.requestId,
        success: false,
        error: { code: 'COMMAND_FAILED', message: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * device:result:complete — 桌面端回报执行结果
   *
   * 流程：更新命令状态 → 转发结果给命令发起者
   */
  @SubscribeMessage('device:result:complete')
  async handleResultComplete(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() envelope: WsEnvelope<DeviceResultPayload>,
  ): Promise<void> {
    const result = envelope.data;

    try {
      // 1. 更新命令记录
      const command = await this.commandsService.complete(result.commandId, {
        status: result.status === 'success' ? 'COMPLETED' : 'FAILED',
        data: {
          output: result.data?.output,
          exitCode: result.data?.exitCode,
          executionTimeMs: result.executionTimeMs,
          error: result.error,
        },
      });

      // 2. 转发结果给命令发起者（通过 u-{issuerId} 房间）
      this.namespace
        .to(`u-${command.issuerId}`)
        .emit('device:result:delivered', result);

      this.logger.log(
        `Result delivered: command=${result.commandId} status=${result.status} → user ${command.issuerId}`,
      );
    } catch (error) {
      this.logger.error(
        `Result complete failed: commandId=${result.commandId} error=${error.message}`,
      );
    }
  }
}
```

### Gateway Module

```typescript
// apps/server/src/gateway/gateway.module.ts

import { Module } from '@nestjs/common';
import { DeviceGateway } from './device.gateway';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DevicesModule],
  providers: [DeviceGateway],
})
export class GatewayModule {}
```

### App Module 集成

```typescript
// apps/server/src/app.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    DevicesModule,
    GatewayModule,
  ],
})
export class AppModule {}
```

---

## 1.11 E2E 测试

验证完整的 WebSocket 命令流程：注册用户 → 获取 JWT → WS 连接 → 设备注册 → 发送命令 → 接收结果。

```typescript
// apps/server/test/device-gateway.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket as ClientSocket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisIoAdapter } from '../src/gateway/adapters/redis-io.adapter';

describe('Device Gateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  // Token and user info
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const redisIoAdapter = new RedisIoAdapter(app);
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);

    await app.init();
    await app.listen(0); // random port
    const address = app.getHttpServer().address();
    baseUrl = `http://localhost:${address.port}`;

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.command.deleteMany();
    await prisma.device.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  // --- Step 1: Register user ---
  it('POST /api/v1/auth/register → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'test@linkingchat.com',
        username: 'testuser',
        password: 'Test1234!',
        displayName: 'Test User',
      })
      .expect(201);

    accessToken = res.body.accessToken;
    userId = res.body.user.id;
    expect(accessToken).toBeDefined();
    expect(userId).toBeDefined();
  });

  // --- Step 2: Login ---
  it('POST /api/v1/auth/login → JWT pair', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'test@linkingchat.com',
        password: 'Test1234!',
      })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    accessToken = res.body.accessToken; // use fresh token
  });

  // --- Step 3-6: WebSocket flow ---
  describe('WebSocket command flow', () => {
    let desktopSocket: ClientSocket;
    let mobileSocket: ClientSocket;

    const deviceId = 'test-device-001';

    function createSocket(token: string, deviceType: string, extraAuth?: Record<string, unknown>) {
      return io(`${baseUrl}/device`, {
        auth: { token, deviceType, ...extraAuth },
        transports: ['websocket'],
        autoConnect: false,
      });
    }

    beforeAll((done) => {
      desktopSocket = createSocket(accessToken, 'desktop', { deviceId });
      mobileSocket = createSocket(accessToken, 'mobile');

      let connected = 0;
      const onConnect = () => {
        connected++;
        if (connected === 2) done();
      };

      desktopSocket.on('connect', onConnect);
      mobileSocket.on('connect', onConnect);

      desktopSocket.connect();
      mobileSocket.connect();
    });

    afterAll(() => {
      desktopSocket?.disconnect();
      mobileSocket?.disconnect();
    });

    it('WS connect with JWT → success', () => {
      expect(desktopSocket.connected).toBe(true);
      expect(mobileSocket.connected).toBe(true);
    });

    it('device:register → device appears in DB', (done) => {
      desktopSocket.emit(
        'device:register',
        {
          deviceId,
          name: 'Test Desktop',
          platform: 'win32',
        },
        async (ack: { success: boolean; data?: { deviceId: string } }) => {
          expect(ack.success).toBe(true);

          // Verify device in DB
          const device = await prisma.device.findUnique({
            where: { id: deviceId },
          });
          expect(device).toBeDefined();
          expect(device!.status).toBe('ONLINE');
          expect(device!.userId).toBe(userId);
          done();
        },
      );
    });

    it('device:command:send → device:command:execute received by target', (done) => {
      // Desktop listens for command
      desktopSocket.once('device:command:execute', (data) => {
        expect(data.action).toBe('echo hello');
        expect(data.type).toBe('shell');
        expect(data.targetDeviceId).toBe(deviceId);
        done();
      });

      // Mobile sends command
      mobileSocket.emit(
        'device:command:send',
        {
          requestId: 'req-001',
          timestamp: new Date().toISOString(),
          data: {
            commandId: '',  // server generates
            targetDeviceId: deviceId,
            type: 'shell',
            action: 'echo hello',
          },
        },
        (ack: { success: boolean; data?: { commandId: string } }) => {
          expect(ack.success).toBe(true);
          expect(ack.data?.commandId).toBeDefined();
        },
      );
    });

    it('device:result:complete → device:result:delivered received by issuer', (done) => {
      let savedCommandId: string;

      // Mobile listens for result
      mobileSocket.once('device:result:delivered', (data) => {
        expect(data.commandId).toBe(savedCommandId);
        expect(data.status).toBe('success');
        expect(data.data?.output).toBe('hello\n');
        done();
      });

      // Send command first, then complete it
      mobileSocket.emit(
        'device:command:send',
        {
          requestId: 'req-002',
          timestamp: new Date().toISOString(),
          data: {
            commandId: '',
            targetDeviceId: deviceId,
            type: 'shell',
            action: 'echo test',
          },
        },
        (ack: { success: boolean; data?: { commandId: string } }) => {
          savedCommandId = ack.data!.commandId;

          // Desktop completes the command
          desktopSocket.emit('device:result:complete', {
            requestId: 'req-result-002',
            timestamp: new Date().toISOString(),
            data: {
              commandId: savedCommandId,
              status: 'success',
              data: { output: 'hello\n', exitCode: 0 },
              executionTimeMs: 42,
            },
          });
        },
      );
    });

    it('dangerous commands are rejected', (done) => {
      mobileSocket.emit(
        'device:command:send',
        {
          requestId: 'req-danger',
          timestamp: new Date().toISOString(),
          data: {
            commandId: '',
            targetDeviceId: deviceId,
            type: 'shell',
            action: 'rm -rf /',
          },
        },
        (ack: { success: boolean; error?: { code: string } }) => {
          expect(ack.success).toBe(false);
          expect(ack.error?.code).toBe('COMMAND_DANGEROUS');
          done();
        },
      );
    });
  });
});
```

---

## 完成标准

- [x] `POST /api/v1/auth/register` → 201，返回 user + JWT pair
- [x] `POST /api/v1/auth/login` → 200，返回 JWT pair（RS256 签名）
- [x] `POST /api/v1/auth/refresh` → 200，Token Rotation 生效
- [x] WS 连接 `/device` 命名空间（携带 JWT）→ 连接成功
- [x] WS 未携带 / 过期 JWT → 连接拒绝（`AUTH_MISSING` / `AUTH_EXPIRED`）
- [x] `device:register` → 设备记录出现在 DB，状态 ONLINE
- [x] `device:command:send` → 目标设备收到 `device:command:execute`
- [x] `device:result:complete` → 命令发起者收到 `device:result:delivered`
- [x] 危险命令（`rm -rf /`、`shutdown` 等）→ 被黑名单拦截，返回 `COMMAND_DANGEROUS`
- [x] 设备断开连接 → DB 状态更新为 OFFLINE，广播 `device:status:changed`
- [x] E2E 测试全部通过
