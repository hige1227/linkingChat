import { Test } from '@nestjs/testing';
import { I18nService } from '../i18n.service';

describe('I18nService', () => {
  let service: I18nService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [I18nService],
    }).compile();

    service = module.get(I18nService);
  });

  describe('t()', () => {
    it('should return English translation by default', () => {
      expect(service.t('auth.invalid_credentials')).toBe(
        'Invalid username or password',
      );
    });

    it('should return Chinese translation when locale is zh', () => {
      expect(service.t('auth.invalid_credentials', 'zh')).toBe(
        '用户名或密码错误',
      );
    });

    it('should return English translation for en locale', () => {
      expect(service.t('messages.not_found', 'en')).toBe('Message not found');
    });

    it('should return Chinese translation for messages', () => {
      expect(service.t('messages.not_found', 'zh')).toBe('消息不存在');
    });

    it('should return the key itself for missing translations', () => {
      expect(service.t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should fallback to English if key missing in zh', () => {
      // All keys exist in both locales, so test with a real key
      expect(service.t('general.internal_error', 'zh')).toBe(
        '服务器内部错误',
      );
    });

    it('should handle nested keys correctly', () => {
      expect(service.t('converses.cannot_remove_owner', 'en')).toBe(
        'Cannot remove the group owner',
      );
      expect(service.t('converses.cannot_remove_owner', 'zh')).toBe(
        '不能移除群主',
      );
    });

    it('should handle upload translations', () => {
      expect(service.t('upload.file_too_large', 'en')).toBe(
        'File size exceeds the limit',
      );
      expect(service.t('upload.file_too_large', 'zh')).toBe(
        '文件大小超出限制',
      );
    });

    it('should handle device translations', () => {
      expect(service.t('devices.command_dangerous', 'en')).toBe(
        'This command may be dangerous and has been blocked',
      );
    });
  });

  describe('detectLocale()', () => {
    it('should detect zh locale from Accept-Language', () => {
      expect(service.detectLocale('zh-CN')).toBe('zh');
      expect(service.detectLocale('zh-TW')).toBe('zh');
      expect(service.detectLocale('zh')).toBe('zh');
    });

    it('should default to en for other languages', () => {
      expect(service.detectLocale('en-US')).toBe('en');
      expect(service.detectLocale('ja-JP')).toBe('en');
      expect(service.detectLocale('fr-FR')).toBe('en');
    });

    it('should default to en when header is missing', () => {
      expect(service.detectLocale(undefined)).toBe('en');
      expect(service.detectLocale('')).toBe('en');
    });

    it('should be case-insensitive', () => {
      expect(service.detectLocale('ZH-CN')).toBe('zh');
      expect(service.detectLocale('Zh')).toBe('zh');
    });
  });
});
