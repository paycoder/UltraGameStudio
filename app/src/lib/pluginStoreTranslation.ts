import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n';
import { translatePublicText } from '@/lib/publicTranslation';
import {
  subscribeTranslationSettings,
  translationSettingsCacheKey,
} from '@/lib/translationSettings';

const MAX_TRANSLATION_CACHE_SIZE = 400;
const HAN_RE = /[\u3400-\u9fff]/u;
const KANA_RE = /[\u3040-\u30ff]/u;
const HANGUL_RE = /[\uac00-\ud7af]/u;
const CYRILLIC_RE = /[\u0400-\u04ff]/u;
const ARABIC_RE = /[\u0600-\u06ff]/u;
const DEVANAGARI_RE = /[\u0900-\u097f]/u;
const ASCII_LETTER_RE = /[A-Za-z]/u;

const translationCache = new Map<string, string>();
const translationInFlight = new Map<string, Promise<string>>();

if (typeof window !== 'undefined') {
  subscribeTranslationSettings(() => {
    __resetPluginStoreTranslationCacheForTests();
  });
}

function translationKey(id: string, description: string, locale: Locale): string {
  return `${translationSettingsCacheKey()}\u0000${locale}\u0000${id}\u0000${description}`;
}

function rememberTranslation(key: string, value: string): void {
  if (!translationCache.has(key) && translationCache.size >= MAX_TRANSLATION_CACHE_SIZE) {
    const firstKey = translationCache.keys().next().value;
    if (typeof firstKey === 'string') translationCache.delete(firstKey);
  }
  translationCache.set(key, value);
}

export function shouldTranslatePluginDescription(
  description: string,
  locale: Locale,
): boolean {
  const source = description.trim();
  if (!source || !hasTranslatableText(source)) return false;

  switch (locale) {
    case 'en-US':
      return (
        HAN_RE.test(source) ||
        KANA_RE.test(source) ||
        HANGUL_RE.test(source) ||
        CYRILLIC_RE.test(source) ||
        ARABIC_RE.test(source) ||
        DEVANAGARI_RE.test(source)
      );
    case 'zh-CN':
      return !HAN_RE.test(source);
    case 'ja-JP':
      return !KANA_RE.test(source);
    case 'ko-KR':
      return !HANGUL_RE.test(source);
    case 'ru-RU':
      return !CYRILLIC_RE.test(source);
    case 'ar-SA':
      return !ARABIC_RE.test(source);
    case 'hi-IN':
      return !DEVANAGARI_RE.test(source);
    default:
      return true;
  }
}

function hasTranslatableText(source: string): boolean {
  return (
    ASCII_LETTER_RE.test(source) ||
    HAN_RE.test(source) ||
    KANA_RE.test(source) ||
    HANGUL_RE.test(source) ||
    CYRILLIC_RE.test(source) ||
    ARABIC_RE.test(source) ||
    DEVANAGARI_RE.test(source)
  );
}

function guessSourceLocale(description: string, target: Locale): Locale {
  if (KANA_RE.test(description)) return 'ja-JP';
  if (HANGUL_RE.test(description)) return 'ko-KR';
  if (HAN_RE.test(description)) return 'zh-CN';
  if (CYRILLIC_RE.test(description)) return 'ru-RU';
  if (ARABIC_RE.test(description)) return 'ar-SA';
  if (DEVANAGARI_RE.test(description)) return 'hi-IN';
  return target === 'en-US' ? DEFAULT_LOCALE : 'en-US';
}

export function cachedPluginDescriptionTranslation(
  id: string,
  description: string,
  locale: Locale,
): string | null {
  return translationCache.get(translationKey(id, description, locale)) ?? null;
}

export function translatePluginDescriptionCached(
  id: string,
  description: string,
  locale: Locale,
): Promise<string> {
  if (!shouldTranslatePluginDescription(description, locale)) {
    return Promise.resolve(description);
  }

  const key = translationKey(id, description, locale);
  const cached = translationCache.get(key);
  if (cached) return Promise.resolve(cached);

  const existing = translationInFlight.get(key);
  if (existing) return existing;

  const promise = translatePublicText(
    description,
    locale,
    guessSourceLocale(description, locale),
  )
    .then((translated) => {
      const next = translated.trim() || description;
      rememberTranslation(key, next);
      return next;
    })
    .catch(() => description)
    .finally(() => {
      translationInFlight.delete(key);
    });

  translationInFlight.set(key, promise);
  return promise;
}

export function __resetPluginStoreTranslationCacheForTests(): void {
  translationCache.clear();
  translationInFlight.clear();
}
