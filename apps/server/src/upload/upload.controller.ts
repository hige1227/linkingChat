// apps/server/src/upload/upload.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UploadService } from './upload.service';
import {
  PresignUploadDto,
  UploadCategory,
} from './dto/presign-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { PrismaService } from '../prisma/prisma.service';
import { BUCKET_ATTACHMENTS, BUCKET_AVATARS } from '@linkingchat/shared';

@Controller('upload')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { ttl: 60000, limit: 20 } }) // 20 uploads per minute
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /api/v1/upload/presign?filename=xxx&mimeType=xxx&category=image
   * Get a presigned PUT URL for client-direct-to-S3 upload.
   */
  @Get('presign')
  async presign(
    @Query('filename') filename: string,
    @Query('mimeType') mimeType: string,
    @Query('category') category: UploadCategory,
  ) {
    const dto = new PresignUploadDto();
    dto.filename = filename;
    dto.mimeType = mimeType;
    dto.category = category || UploadCategory.FILE;

    return this.uploadService.presignUpload(
      dto.filename,
      dto.mimeType,
      dto.category,
    );
  }

  /**
   * POST /api/v1/upload/confirm
   * Confirm upload completed and create an Attachment record.
   */
  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirm(
    @CurrentUser('userId') userId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    const bucket = dto.fileKey.startsWith('avatars/')
      ? BUCKET_AVATARS
      : BUCKET_ATTACHMENTS;

    // Verify the file exists in S3
    const result = await this.uploadService.confirmUpload(
      dto.fileKey,
      bucket,
    );

    return {
      url: result.url,
      fileKey: result.fileKey,
      filename: dto.filename,
      mimeType: result.mimeType,
      size: result.size,
      width: dto.width,
      height: dto.height,
      duration: dto.duration,
    };
  }
}
