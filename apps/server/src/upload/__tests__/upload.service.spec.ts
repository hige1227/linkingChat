// apps/server/src/upload/__tests__/upload.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UploadService } from '../upload.service';
import { MetricsService } from '../../metrics/metrics.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('UploadService', () => {
  let service: UploadService;
  let minioClient: any;

  const mockMinioClient = {
    putObject: jest.fn(),
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn(),
    presignedPutObject: jest.fn(),
    statObject: jest.fn(),
    removeObject: jest.fn(),
  };

  const mockMetricsService = {
    httpRequestDuration: { observe: jest.fn(), labels: jest.fn().mockReturnThis() },
    httpRequestsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
    wsConnectionsActive: { inc: jest.fn(), dec: jest.fn(), labels: jest.fn().mockReturnThis() },
    wsMessagesTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
    messagesSentTotal: { inc: jest.fn() },
    messagesRecalledTotal: { inc: jest.fn() },
    llmRequestsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
    llmLatencySeconds: { observe: jest.fn(), labels: jest.fn().mockReturnThis() },
    uploadsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        UploadService,
        {
          provide: 'MINIO_CLIENT',
          useValue: mockMinioClient,
        },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get(UploadService);
    minioClient = module.get('MINIO_CLIENT');

    jest.clearAllMocks();
    mockMinioClient.bucketExists.mockResolvedValue(true);
  });

  // ── uploadImage (legacy) ──────────────────────────────

  describe('uploadImage', () => {
    const mockFile = {
      buffer: Buffer.from('test image data'),
      mimetype: 'image/jpeg',
      size: 1024 * 100, // 100KB
      originalname: 'test.jpg',
    } as Express.Multer.File;

    it('should upload image successfully', async () => {
      mockMinioClient.putObject.mockResolvedValue(undefined);

      const result = await service.uploadImage(mockFile, 'avatars');

      expect(result).toMatch(/^http:\/\/localhost:9008\/avatars\//);
      expect(result).toMatch(/\.jpg$/);
      expect(minioClient.putObject).toHaveBeenCalledWith(
        'avatars',
        expect.stringMatching(/\.jpg$/),
        mockFile.buffer,
        mockFile.size,
        expect.objectContaining({
          'Content-Type': 'image/jpeg',
        }),
      );
    });

    it('should generate unique filenames', async () => {
      mockMinioClient.putObject.mockResolvedValue(undefined);

      const result1 = await service.uploadImage(mockFile, 'avatars');
      const result2 = await service.uploadImage(mockFile, 'avatars');

      expect(result1).not.toBe(result2);
    });

    it('should reject non-image files', async () => {
      const invalidFile = {
        ...mockFile,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(service.uploadImage(invalidFile, 'avatars'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject files larger than 10MB', async () => {
      const largeFile = {
        ...mockFile,
        size: 11 * 1024 * 1024, // 11MB
      } as Express.Multer.File;

      await expect(service.uploadImage(largeFile, 'avatars'))
        .rejects.toThrow(BadRequestException);
    });

    it('should create bucket if not exists', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);
      mockMinioClient.putObject.mockResolvedValue(undefined);

      await service.uploadImage(mockFile, 'new-bucket');

      expect(minioClient.makeBucket).toHaveBeenCalledWith('new-bucket');
    });

    it('should map MIME types to correct extensions', async () => {
      mockMinioClient.putObject.mockResolvedValue(undefined);

      const pngFile = { ...mockFile, mimetype: 'image/png' } as Express.Multer.File;
      const gifFile = { ...mockFile, mimetype: 'image/gif' } as Express.Multer.File;
      const webpFile = { ...mockFile, mimetype: 'image/webp' } as Express.Multer.File;

      const pngResult = await service.uploadImage(pngFile, 'avatars');
      const gifResult = await service.uploadImage(gifFile, 'avatars');
      const webpResult = await service.uploadImage(webpFile, 'avatars');

      expect(pngResult).toMatch(/\.png$/);
      expect(gifResult).toMatch(/\.gif$/);
      expect(webpResult).toMatch(/\.webp$/);
    });
  });

  // ── presignUpload ─────────────────────────────────────

  describe('presignUpload', () => {
    const mockPresignedUrl = 'https://s3.example.com/presigned-url';

    beforeEach(() => {
      mockMinioClient.presignedPutObject.mockResolvedValue(mockPresignedUrl);
    });

    it('should return uploadUrl and fileKey for image', async () => {
      const result = await service.presignUpload('photo.jpg', 'image/jpeg', 'image');

      expect(result.uploadUrl).toBe(mockPresignedUrl);
      expect(result.fileKey).toMatch(/^image\/\d+-[a-f0-9]+\.jpg$/);
      expect(minioClient.presignedPutObject).toHaveBeenCalledWith(
        'attachments',
        expect.any(String),
        300, // 5 minutes
      );
    });

    it('should use avatars bucket for avatar category', async () => {
      const result = await service.presignUpload('avatar.png', 'image/png', 'avatar');

      expect(result.fileKey).toMatch(/^avatars\/\d+-[a-f0-9]+\.png$/);
      expect(minioClient.presignedPutObject).toHaveBeenCalledWith(
        'avatars',
        expect.any(String),
        300,
      );
    });

    it('should allow any MIME type for file category', async () => {
      const result = await service.presignUpload('doc.pdf', 'application/pdf', 'file');

      expect(result.uploadUrl).toBe(mockPresignedUrl);
      expect(result.fileKey).toMatch(/^file\/\d+-[a-f0-9]+\.pdf$/);
    });

    it('should reject invalid image MIME type', async () => {
      await expect(
        service.presignUpload('test.pdf', 'application/pdf', 'image'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid voice MIME type', async () => {
      await expect(
        service.presignUpload('test.jpg', 'image/jpeg', 'voice'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid voice MIME type', async () => {
      const result = await service.presignUpload('recording.webm', 'audio/webm', 'voice');

      expect(result.fileKey).toMatch(/^voice\/\d+-[a-f0-9]+\.webm$/);
    });

    it('should reject invalid avatar MIME type', async () => {
      await expect(
        service.presignUpload('avatar.gif', 'image/gif', 'avatar'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── confirmUpload ─────────────────────────────────────

  describe('confirmUpload', () => {
    it('should confirm file exists and return metadata', async () => {
      mockMinioClient.statObject.mockResolvedValue({
        size: 1024,
        metaData: { 'content-type': 'image/jpeg' },
      });

      const result = await service.confirmUpload('image/test.jpg', 'attachments');

      expect(result.url).toMatch(/\/attachments\/image\/test\.jpg$/);
      expect(result.fileKey).toBe('image/test.jpg');
      expect(result.size).toBe(1024);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockMinioClient.statObject.mockRejectedValue(new Error('Not Found'));

      await expect(
        service.confirmUpload('nonexistent.jpg'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject oversized image file', async () => {
      mockMinioClient.statObject.mockResolvedValue({
        size: 11 * 1024 * 1024, // 11MB > MAX_IMAGE_SIZE (10MB)
        metaData: { 'content-type': 'image/jpeg' },
      });
      mockMinioClient.removeObject.mockResolvedValue(undefined);

      await expect(
        service.confirmUpload('image/large.jpg'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject oversized voice file', async () => {
      mockMinioClient.statObject.mockResolvedValue({
        size: 6 * 1024 * 1024, // 6MB > MAX_VOICE_SIZE (5MB)
        metaData: { 'content-type': 'audio/webm' },
      });
      mockMinioClient.removeObject.mockResolvedValue(undefined);

      await expect(
        service.confirmUpload('voice/large.webm'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use default bucket when not specified', async () => {
      mockMinioClient.statObject.mockResolvedValue({
        size: 100,
        metaData: { 'content-type': 'application/pdf' },
      });

      await service.confirmUpload('file/doc.pdf');

      expect(minioClient.statObject).toHaveBeenCalledWith('attachments', 'file/doc.pdf');
    });
  });

  // ── deleteFile ────────────────────────────────────────

  describe('deleteFile', () => {
    it('should delete file from S3', async () => {
      mockMinioClient.removeObject.mockResolvedValue(undefined);

      await service.deleteFile('image/test.jpg', 'attachments');

      expect(minioClient.removeObject).toHaveBeenCalledWith('attachments', 'image/test.jpg');
    });

    it('should not throw on delete failure (logs error)', async () => {
      mockMinioClient.removeObject.mockRejectedValue(new Error('Network Error'));

      await expect(
        service.deleteFile('image/test.jpg'),
      ).resolves.not.toThrow();
    });
  });

  // ── uploadBuffer ──────────────────────────────────────

  describe('uploadBuffer', () => {
    it('should upload buffer and return URL', async () => {
      mockMinioClient.putObject.mockResolvedValue(undefined);
      const buffer = Buffer.from('test data');

      const result = await service.uploadBuffer(
        buffer,
        'thumbnails/thumb.jpg',
        'image/jpeg',
        'attachments',
      );

      expect(result).toMatch(/\/attachments\/thumbnails\/thumb\.jpg$/);
      expect(minioClient.putObject).toHaveBeenCalledWith(
        'attachments',
        'thumbnails/thumb.jpg',
        buffer,
        buffer.length,
        { 'Content-Type': 'image/jpeg' },
      );
    });

    it('should create bucket if not exists', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);
      mockMinioClient.putObject.mockResolvedValue(undefined);
      const buffer = Buffer.from('test');

      await service.uploadBuffer(buffer, 'test.jpg', 'image/jpeg', 'new-bucket');

      expect(minioClient.makeBucket).toHaveBeenCalledWith('new-bucket');
    });
  });
});
