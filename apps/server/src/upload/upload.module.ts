// apps/server/src/upload/upload.module.ts
import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

const MinioClientProvider: Provider = {
  provide: 'MINIO_CLIENT',
  useFactory: (configService: ConfigService) => {
    // Support both MINIO_* (explicit) and AWS_S3_* (.env.example) env vars
    const s3Endpoint = configService.get('AWS_S3_ENDPOINT', 'http://localhost:9008');
    let parsedHost = 'localhost';
    let parsedPort = 9008;
    try {
      const url = new URL(s3Endpoint);
      parsedHost = url.hostname;
      parsedPort = parseInt(url.port, 10) || 9008;
    } catch {
      // fallback to defaults
    }

    return new MinioClient({
      endPoint: configService.get('MINIO_ENDPOINT') || parsedHost,
      port: parseInt(configService.get('MINIO_PORT') || String(parsedPort), 10),
      useSSL: configService.get('MINIO_USE_SSL') === 'true',
      accessKey: configService.get('MINIO_ACCESS_KEY') || configService.get('ACCESS_KEY_ID', 'minioadmin'),
      secretKey: configService.get('MINIO_SECRET_KEY') || configService.get('SECRET_ACCESS_KEY', 'minioadmin'),
    });
  },
  inject: [ConfigService],
};

@Module({
  providers: [UploadService, MinioClientProvider],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
