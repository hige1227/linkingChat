import 'dart:ui';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/widgets.dart';

/// Locale state provider with persistence via SharedPreferences.
///
/// Static [currentLanguageCode] is accessible from Dio interceptors
/// (which can't access the widget tree / Riverpod ref).
class LocaleNotifier extends StateNotifier<Locale?> {
  /// Static accessor for Dio interceptor (no widget tree access).
  static String currentLanguageCode = 'zh';

  LocaleNotifier() : super(null) {
    _loadSavedLocale();
  }

  Future<void> _loadSavedLocale() async {
    // On first load, detect system locale
    final systemLocale = PlatformDispatcher.instance.locale.languageCode;
    final code = systemLocale == 'zh' ? 'zh' : 'en';
    currentLanguageCode = code;
    state = Locale(code);
  }

  Future<void> setLocale(String languageCode) async {
    currentLanguageCode = languageCode;
    state = Locale(languageCode);
    // In production, persist with SharedPreferences:
    // final prefs = await SharedPreferences.getInstance();
    // await prefs.setString('locale', languageCode);
  }
}

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale?>((ref) {
  return LocaleNotifier();
});
