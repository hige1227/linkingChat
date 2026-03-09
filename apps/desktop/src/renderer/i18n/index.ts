import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh_CN from './zh_CN.json';
import en_US from './en_US.json';

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh_CN },
    en: { translation: en_US },
  },
  lng: localStorage.getItem('locale') || (navigator.language.startsWith('zh') ? 'zh' : 'en'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
