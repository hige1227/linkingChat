// apps/server/src/upload/upload.service.ts
import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import * as crypto from 'crypto';
import { MetricsService } from '../metrics/metrics.service';
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VOICE_MIMES,
  ALLOWED_AVATAR_MIMES,
  MAX_IMAGE_SIZE,
  MAX_FILE_SIZE,
  MAX_VOICE_SIZE,
  MAX_AVATAR_SIZE,
  PRESIGN_EXPIRY_SECONDS,
  MIME_TO_EXT,
  BUCKET_ATTACHMENTS,
  BUCKET_AVATARS,
} from '@linkingchat/shared';

export interface PresignResult {
  uploadUrl: string;
  fileKey: string;
}

export interface ConfirmResult {
  url: string;
  fileKey: string;
  size: number;
  mimeType: string;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @Inject('MINIO_CLIENT') private readonly minioClient: MinioClient,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Generate a presigned PUT URL for client-direct-to-S3 upload.
   */
  async presignUpload(
    filename: string,
    mimeType: string,
    category: 'image' | 'file' | 'voice' | 'avatar',
  ): Promise<PresignResult> {
    // Validate MIME type for specific categories
    this.validateMimeType(mimeType, category);

    const bucket =
      category === 'avatar' ? BUCKET_AVATARS : BUCKET_ATTACHMENTS;
    await this.ensureBucket(bucket);

    // Generate unique file key
    const ext = MIME_TO_EXT[mimeType] || this.getExtFromFilename(filename);
    const hash = crypto.randomBytes(16).toString('hex');
    const prefix = category === 'avatar' ? 'avatars' : category;
    const fileKey = `${prefix}/${Date.now()}-${hash}${ext}`;

    // Generate presigned PUT URL
    const uploadUrl = await this.minioClient.presignedPutObject(
      bucket,
      fileKey,
      PRESIGN_EXPIRY_SECONDS,
    );

    return { uploadUrl, fileKey };
  }

  /**
   * Confirm that an upload completed — verify the object exists in S3.
   */
  async confirmUpload(
    fileKey: string,
    bucket: string = BUCKET_ATTACHMENTS,
  ): Promise<ConfirmResult> {
    try {
      const stat = await this.minioClient.statObject(bucket, fileKey);

      // Validate file size based on category
      const category = this.getCategoryFromKey(fileKey);
      const maxSize = this.getMaxSize(category);
      if (stat.size > maxSize) {
        // Delete the oversized file
        await this.deleteFile(fileKey, bucket).catch(() => {});
        throw new BadRequestException(
          `File size ${stat.size} exceeds maximum ${maxSize} bytes for ${category}`,
        );
      }

      const url = this.getFileUrl(bucket, fileKey);

      // Prometheus: increment upload counter
      this.metricsService.uploadsTotal.labels(category, 'success').inc();

      return {
        url,
        fileKey,
        size: stat.size,
        mimeType: stat.metaData?.['content-type'] || 'application/octet-stream',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        this.metricsService.uploadsTotal.labels(this.getCategoryFromKey(fileKey), 'rejected').inc();
        throw error;
      }
      this.metricsService.uploadsTotal.labels(this.getCategoryFromKey(fileKey), 'error').inc();
      throw new NotFoundException(
        `File not found in storage: ${fileKey}`,
      );
    }
  }

  /**
   * Delete a file from S3 (used when recalling messages with attachments).
   */
  async deleteFile(
    fileKey: string,
    bucket: string = BUCKET_ATTACHMENTS,
  ): Promise<void> {
    try {
      await this.minioClient.removeObject(bucket, fileKey);
      this.logger.log(`Deleted file: ${bucket}/${fileKey}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete ${bucket}/${fileKey}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Upload a buffer directly (used for avatar processing, thumbnails, etc.)
   */
  async uploadBuffer(
    buffer: Buffer,
    fileKey: string,
    mimeType: string,
    bucket: string = BUCKET_ATTACHMENTS,
  ): Promise<string> {
    await this.ensureBucket(bucket);
    await this.minioClient.putObject(bucket, fileKey, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
    return this.getFileUrl(bucket, fileKey);
  }

  /**
   * Legacy method — upload image from Multer file (used by ProfileController).
   */
  async uploadImage(
    file: Express.Multer.File,
    bucket: string,
  ): Promise<string> {
    if (
      !(ALLOWED_IMAGE_MIMES as readonly string[]).includes(file.mimetype)
    ) {
      throw new BadRequestException(
        'Only JPEG, PNG, GIF, WebP images are supported',
      );
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new BadRequestException(
        `Image size exceeds maximum ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
      );
    }

    await this.ensureBucket(bucket);

    const ext = MIME_TO_EXT[file.mimetype] || '.bin';
    const hash = crypto.randomBytes(16).toString('hex');
    const fileName = `${Date.now()}-${hash}${ext}`;

    await this.minioClient.putObject(bucket, fileName, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    return this.getFileUrl(bucket, fileName);
  }

  // ── Private helpers ──────────────────────────────────────

  private async ensureBucket(bucket: string): Promise<void> {
    const exists = await this.minioClient.bucketExists(bucket);
    if (!exists) {
      await this.minioClient.makeBucket(bucket);
      this.logger.log(`Created bucket: ${bucket}`);
    }
  }

  private getFileUrl(bucket: string, fileKey: string): string {
    const endpoint =
      this.configService.get('MINIO_ENDPOINT') || 'localhost';
    const port = this.configService.get('MINIO_PORT') || '9008';
    const useSSL = this.configService.get('MINIO_USE_SSL') === 'true';
    const protocol = useSSL ? 'https' : 'http';

    // In production, use a CDN or public URL
    const publicUrl = this.configService.get('S3_PUBLIC_URL');
    if (publicUrl) {
      return `${publicUrl}/${bucket}/${fileKey}`;
    }

    return `${protocol}://${endpoint}:${port}/${bucket}/${fileKey}`;
  }

  private validateMimeType(
    mimeType: string,
    category: 'image' | 'file' | 'voice' | 'avatar',
  ): void {
    switch (category) {
      case 'image':
        if (
          !(ALLOWED_IMAGE_MIMES as readonly string[]).includes(mimeType)
        ) {
          throw new BadRequestException(
            `Invalid image type: ${mimeType}. Allowed: ${ALLOWED_IMAGE_MIMES.join(', ')}`,
          );
        }
        break;
      case 'voice':
        if (
          !(ALLOWED_VOICE_MIMES as readonly string[]).includes(mimeType)
        ) {
          throw new BadRequestException(
            `Invalid voice type: ${mimeType}. Allowed: ${ALLOWED_VOICE_MIMES.join(', ')}`,
          );
        }
        break;
      case 'avatar':
        if (
          !(ALLOWED_AVATAR_MIMES as readonly string[]).includes(mimeType)
        ) {
          throw new BadRequestException(
            `Invalid avatar type: ${mimeType}. Allowed: ${ALLOWED_AVATAR_MIMES.join(', ')}`,
          );
        }
        break;
      case 'file':
        // All MIME types allowed for generic files
        break;
    }
  }

  private getMaxSize(
    category: 'image' | 'file' | 'voice' | 'avatar',
  ): number {
    switch (category) {
      case 'image':
        return MAX_IMAGE_SIZE;
      case 'voice':
        return MAX_VOICE_SIZE;
      case 'avatar':
        return MAX_AVATAR_SIZE;
      case 'file':
      default:
        return MAX_FILE_SIZE;
    }
  }

  private getCategoryFromKey(
    fileKey: string,
  ): 'image' | 'file' | 'voice' | 'avatar' {
    if (fileKey.startsWith('avatars/')) return 'avatar';
    if (fileKey.startsWith('image/')) return 'image';
    if (fileKey.startsWith('voice/')) return 'voice';
    return 'file';
  }

  private getExtFromFilename(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.substring(lastDot).toLowerCase();
  }
}
