import { Injectable } from '@nestjs/common';
import * as zhCN from './zh_CN.json';
import * as enUS from './en_US.json';

type Locale = 'zh' | 'en';

const translations: Record<Locale, Record<string, any>> = {
  zh: zhCN,
  en: enUS,
};

@Injectable()
export class I18nService {
  /**
   * Translate a key path (e.g., 'auth.invalid_credentials') to the localized string.
   * Falls back to English if the key is not found in the requested locale.
   */
  t(key: string, locale: Locale = 'en'): string {
    const parts = key.split('.');
    let result: any = translations[locale];

    for (const part of parts) {
      if (result == null || typeof result !== 'object') {
        break;
      }
      result = result[part];
    }

    if (typeof result === 'string') {
      return result;
    }

    // Fallback to English
    if (locale !== 'en') {
      let fallback: any = translations.en;
      for (const part of parts) {
        if (fallback == null || typeof fallback !== 'object') {
          break;
        }
        fallback = fallback[part];
      }
      if (typeof fallback === 'string') {
        return fallback;
      }
    }

    // Return the key itself as last resort
    return key;
  }

  /**
   * Detect locale from Accept-Language header value.
   */
  detectLocale(acceptLanguage?: string): Locale {
    if (!acceptLanguage) return 'en';
    if (acceptLanguage.toLowerCase().startsWith('zh')) return 'zh';
    return 'en';
  }
}
