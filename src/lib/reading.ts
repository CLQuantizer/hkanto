export const BASE_LANG = ['en', 'fr', 'it', 'zhcn', 'zhtw', 'es', 'de'] as const;
export type BaseLang = (typeof BASE_LANG)[number];
export type SentenceTranslations = Partial<Record<BaseLang, string>>;

export const LANGUAGE_LABELS: Record<BaseLang, string> = {
	en: 'English',
	fr: 'Français',
	it: 'Italiano',
	zhcn: '简体中文',
	zhtw: '繁體中文',
	es: 'Español',
	de: 'Deutsch'
};

export const LANGUAGE_LOCALES: Record<BaseLang, string> = {
	en: 'en', fr: 'fr', it: 'it', zhcn: 'zh-CN', zhtw: 'zh-TW', es: 'es', de: 'de'
};

export function isBaseLang(value: unknown): value is BaseLang {
	return typeof value === 'string' && BASE_LANG.some((language) => language === value);
}
