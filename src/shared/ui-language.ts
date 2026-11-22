export const UI_LANGUAGES = { ru: 'Русский', en: 'English' } as const;
export type UiLanguage = keyof typeof UI_LANGUAGES;
export const readUiLanguage = (value: unknown): UiLanguage => value === 'en' ? 'en' : 'ru';
