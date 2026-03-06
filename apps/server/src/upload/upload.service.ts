// apps/server/src/upload/upload.service.ts
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import * as crypto from 'crypto';

/** Map validated MIME types to safe extensions */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

@Injectable()
export class UploadService {
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB
  private readonly allowedMimeTypes = Object.keys(MIME_TO_EXT);

  constructor(
    @Inject('MINIO_CLIENT') private readonly minioClient: MinioClient,
    private readonly configService: ConfigService,
  ) {}

  async uploadImage(file: Express.Multer.File, bucket: string): Promise<string> {
    // Validate file type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('只支持 JPEG, PNG, GIF, WebP 格式的图片');
    }

    // Validate file size
    if (file.size > this.maxFileSize) {
      throw new BadRequestException('图片大小不能超过 5MB');
    }

    // Ensure bucket exists
    await this.ensureBucket(bucket);

    // Generate unique filename — derive extension from validated MIME type, not client filename
    const fileName = this.generateFileName(file.mimetype);

    // Upload to MinIO
    const metaData = {
      'Content-Type': file.mimetype,
    };
    await this.minioClient.putObject(
      bucket,
      fileName,
      file.buffer,
      file.size,
      metaData,
    );

    // Return URL
    const endpoint = this.configService.get('MINIO_ENDPOINT') || 'localhost';
    const port = this.configService.get('MINIO_PORT') || 9008;
    const useSSL = this.configService.get('MINIO_USE_SSL') === 'true';

    const protocol = useSSL ? 'https' : 'http';
    return `${protocol}://${endpoint}:${port}/${bucket}/${fileName}`;
  }

  private async ensureBucket(bucket: string): Promise<void> {
    const exists = await this.minioClient.bucketExists(bucket);
    if (!exists) {
      await this.minioClient.makeBucket(bucket);
    }
  }

  /**
   * Generate safe filename from validated MIME type (not client filename).
   * Extension is derived from MIME_TO_EXT map to prevent path traversal / extension injection.
   */
  generateFileName(mimeType: string): string {
    const ext = MIME_TO_EXT[mimeType] || '.bin';
    const hash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${timestamp}-${hash}${ext}`;
  }
}
