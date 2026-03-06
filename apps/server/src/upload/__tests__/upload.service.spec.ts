// apps/server/src/upload/__tests__/upload.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UploadService } from '../upload.service';
import { BadRequestException } from '@nestjs/common';

describe('UploadService', () => {
  let service: UploadService;
  let minioClient: any;

  const mockMinioClient = {
    putObject: jest.fn(),
    bucketExists: jest.fn(),
    makeBucket: jest.fn(),
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
      ],
    }).compile();

    service = module.get(UploadService);
    minioClient = module.get('MINIO_CLIENT');

    jest.clearAllMocks();
  });

  describe('uploadImage', () => {
    const mockFile = {
      buffer: Buffer.from('test image data'),
      mimetype: 'image/jpeg',
      size: 1024 * 100, // 100KB
      originalname: 'test.jpg',
    } as Express.Multer.File;

    it('should upload image successfully', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      mockMinioClient.putObject.mockResolvedValue(undefined);

      const result = await service.uploadImage(mockFile, 'avatars');

      expect(result).toMatch(/^http:\/\/localhost:9008\/avatars\//);
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

    it('should reject non-image files', async () => {
      const invalidFile = {
        ...mockFile,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(service.uploadImage(invalidFile, 'avatars'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject files larger than 5MB', async () => {
      const largeFile = {
        ...mockFile,
        size: 6 * 1024 * 1024, // 6MB
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
  });

  describe('generateFileName', () => {
    it('should generate unique filename with extension derived from MIME type', () => {
      const filename1 = service.generateFileName('image/jpeg');
      const filename2 = service.generateFileName('image/jpeg');

      expect(filename1).toMatch(/\.jpg$/);
      expect(filename1).not.toBe(filename2);
    });

    it('should use .bin for unknown MIME types', () => {
      const filename = service.generateFileName('application/octet-stream');
      expect(filename).toMatch(/\.bin$/);
    });

    it('should map known image MIME types correctly', () => {
      expect(service.generateFileName('image/png')).toMatch(/\.png$/);
      expect(service.generateFileName('image/gif')).toMatch(/\.gif$/);
      expect(service.generateFileName('image/webp')).toMatch(/\.webp$/);
    });
  });
});
