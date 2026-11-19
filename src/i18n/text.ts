import type { UiLanguage } from '../shared/ui-language.js';
import { english } from './en.js';

export type Text = ((message: string, ...values: Array<string | number>) => string) & { language: UiLanguage };
export function textFor(language: UiLanguage): Text {
  return Object.assign((message: string, ...values: Array<string | number>) => {
    const template = language === 'en' && Object.hasOwn(english, message) ? english[message] : message;
    return values.length ? template.replace(/\{(\d+)\}/g, (key, index) => String(values[Number(index)] ?? key)) : template;
  }, { language });
}
