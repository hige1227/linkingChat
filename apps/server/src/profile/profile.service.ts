// apps/server/src/profile/profile.service.ts
import { Injectable } from '@nestjs/common';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        lastSeenAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // 验证 displayName 长度（1-64 字符）
    if (dto.displayName !== undefined) {
      if (dto.displayName.length < 1 || dto.displayName.length > 64) {
        throw new BadRequestException('昵称长度必须在 1-64 个字符之间');
      }
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: dto,
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          status: true,
        },
      });

      return updated;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('用户名已被占用');
      }
      throw error;
    }
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
  }
}
