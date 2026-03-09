import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from '../mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendVerificationEmail', () => {
    it('should attempt to send verification email', async () => {
      // Mock the transporter
      const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test' });
      (service as any).transporter = { sendMail: sendMailMock };

      await service.sendVerificationEmail('test@example.com', '123456');

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('验证'),
        }),
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should attempt to send reset email', async () => {
      const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test' });
      (service as any).transporter = { sendMail: sendMailMock };

      await service.sendPasswordResetEmail('test@example.com', '654321');

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('重置'),
        }),
      );
    });
  });
});
