import { runtimeMode } from './app-info.js';
import type { AppInfo } from './app-info.js';

export const MAX_LOG_ENTRIES = 300;
export const MAX_LOG_FILE_BYTES = 192 * 1024;
export const LOG_AREAS = { startup: 'Запуск', network: 'Подключение', library: 'Медиатека', playback: 'Воспроизведение', app: 'Интерфейс' } as const;
export const LOG_LEVELS = { info: 'Инфо', warn: 'Сбой', error: 'Ошибка' } as const;
const FIELDS = { ms: 'Время', tracks: 'Треков', added: 'Добавлено', duplicates: 'Дубликатов', failed: 'Ошибок', code: 'Код' } as const;

type Source = 'main' | 'renderer';
export type LogArea = keyof typeof LOG_AREAS;
export type LogLevel = keyof typeof LOG_LEVELS;
type Field = keyof typeof FIELDS;
type EventDefinition = readonly [Source, LogArea, LogLevel, string, ...Field[]];

// Static messages and allowlisted numeric fields: no paths, URLs, IDs, tags or raw error strings.
export const LOG_EVENTS = {
  'desktop.start': ['main', 'startup', 'info', 'Запуск настольного Luma'],
  'desktop.protocol': ['main', 'startup', 'info', 'Подключён локальный протокол'],
  'desktop.ready': ['main', 'startup', 'info', 'Окно Luma загружено', 'ms'],
  'desktop.failed': ['main', 'startup', 'error', 'Не удалось запустить настольный Luma'],
  'desktop.pageFailed': ['main', 'startup', 'error', 'Ошибка загрузки окна', 'code'],
  'desktop.rendererExited': ['main', 'app', 'error', 'Процесс интерфейса завершился неожиданно', 'code'],
  'desktop.stopped': ['main', 'startup', 'info', 'Выход из приложения'],
  'renderer.start': ['renderer', 'startup', 'info', 'Интерфейс Luma загружен', 'ms'],
  'renderer.error': ['renderer', 'app', 'error', 'Необработанная ошибка интерфейса'],
  'renderer.rejection': ['renderer', 'app', 'error', 'Необработанная ошибка фоновой операции'],
  'network.online': ['renderer', 'network', 'info', 'Устройство в сети'],
  'network.offline': ['renderer', 'network', 'warn', 'Устройство вне сети'],
  'vk.browserOpened': ['main', 'network', 'info', 'Страница VK передана браузеру; вход проверяет VK'],
  'vk.browserFailed': ['main', 'network', 'warn', 'Не удалось открыть браузер для VK'],
  'vk.websiteOpening': ['main', 'network', 'info', 'Открывается официальный сайт VK Музыки'],
  'vk.websiteOpened': ['main', 'network', 'info', 'Страница VK загружена; вход и доступ проверяет VK'],
  'vk.websiteFailed': ['main', 'network', 'warn', 'Не удалось загрузить страницу VK', 'code'],
  'vk.loading': ['renderer', 'network', 'info', 'Загружается виджет VK'],
  'vk.loaded': ['renderer', 'network', 'info', 'Фрейм VK загружен; доступ к трекам проверяет VK', 'ms'],
  'vk.frameError': ['renderer', 'network', 'warn', 'Браузер сообщил об ошибке виджета VK', 'ms'],
  'vk.timeout': ['renderer', 'network', 'warn', 'Виджет VK не ответил вовремя', 'ms'],
  'vk.failed': ['main', 'network', 'warn', 'Не удалось загрузить фрейм VK', 'code'],
  'vk.cover': ['main', 'network', 'info', 'Получена обложка плейлиста VK', 'ms'],
  'vk.noCover': ['main', 'network', 'info', 'Публичная обложка VK недоступна, используется запасная', 'ms'],
  'library.opening': ['renderer', 'library', 'info', 'Открывается локальная медиатека'],
  'library.opened': ['renderer', 'library', 'info', 'Медиатека загружена', 'tracks', 'ms'],
  'library.failed': ['renderer', 'library', 'error', 'Не удалось открыть медиатеку', 'ms'],
  'library.storage': ['renderer', 'library', 'warn', 'Хранилище медиатеки недоступно, работает временный режим'],
  'library.import': ['renderer', 'library', 'info', 'Начат импорт аудио'],
  'library.imported': ['renderer', 'library', 'info', 'Импорт аудио завершён', 'added', 'duplicates', 'failed', 'ms'],
  'library.partial': ['renderer', 'library', 'warn', 'Часть файлов не добавлена или доступна только в этой сессии', 'added', 'duplicates', 'failed', 'ms'],
  'library.importFailed': ['renderer', 'library', 'error', 'Не удалось добавить аудио', 'failed', 'ms'],
  'library.cancelled': ['renderer', 'library', 'info', 'Импорт отменён'],
  'library.coverStorage': ['renderer', 'library', 'warn', 'Хранилище обложек недоступно'],
  'audio.loading': ['renderer', 'playback', 'info', 'Загружается локальное аудио'],
  'audio.ready': ['renderer', 'playback', 'info', 'Метаданные аудио прочитаны', 'ms'],
  'audio.play': ['renderer', 'playback', 'info', 'Воспроизведение запущено'],
  'audio.pause': ['renderer', 'playback', 'info', 'Воспроизведение приостановлено'],
  'audio.error': ['renderer', 'playback', 'error', 'Не удалось прочитать или воспроизвести аудио', 'code'],
  'audio.blocked': ['renderer', 'playback', 'warn', 'Для старта воспроизведения нужно действие пользователя'],
  'audio.graphUnavailable': ['renderer', 'playback', 'warn', 'Обработка звука недоступна, используется обычное воспроизведение'],
} as const satisfies Record<string, EventDefinition>;

export type LogEvent = keyof typeof LOG_EVENTS;
export type RendererLogEvent = { [K in LogEvent]: typeof LOG_EVENTS[K][0] extends 'renderer' ? K : never }[LogEvent];
export type MainLogEvent = Exclude<LogEvent, RendererLogEvent>;
export type LogValues = Partial<Record<Field, number>>;
export interface LogEntry { at: number; event: LogEvent; values: LogValues }
export interface DiagnosticEnvironment extends AppInfo {
  system: string;
  runtime: string;
  online: boolean;
}
export type LogStorage = 'file' | 'browser' | 'session';
export interface DiagnosticSnapshot { entries: LogEntry[]; environment: DiagnosticEnvironment; storage: LogStorage }
export interface DiagnosticsBridge {
  record(event: RendererLogEvent, values?: LogValues): void;
  snapshot(): Promise<DiagnosticSnapshot>;
  clear(): Promise<DiagnosticSnapshot>;
  saveReport(): Promise<boolean>;
  onChange(callback: () => void): () => void;
}

export function logEntry(event: unknown, values: unknown, source?: Source, at = Date.now()): LogEntry | undefined {
  if (typeof event !== 'string' || !Object.hasOwn(LOG_EVENTS, event) || !Number.isFinite(at) || at < 0 || at > 8.64e15) return;
  const key = event as LogEvent;
  const definition: EventDefinition = LOG_EVENTS[key];
  if (source && source !== definition[0]) return;
  const clean: LogValues = {};
  if (values && typeof values === 'object') {
    for (const field of definition.slice(4) as Field[]) {
      if (!Object.hasOwn(values, field)) continue;
      const value = (values as LogValues)[field];
      if (typeof value === 'number' && Number.isFinite(value) && value >= (field === 'code' ? -2147483648 : 0) && value <= 2147483647) clean[field] = Math.round(value);
    }
  }
  return { at: Math.floor(at), event: key, values: clean };
}

export const appendLog = (entries: LogEntry[], entry: LogEntry) => [...entries.slice(-(MAX_LOG_ENTRIES - 1)), entry];

export function readLog(raw: string | null, source?: Source): LogEntry[] {
  if (!raw || raw.length > MAX_LOG_FILE_BYTES) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.slice(-MAX_LOG_ENTRIES).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const { event, at, values } = item as Partial<LogEntry>;
      const entry = typeof at === 'number' && logEntry(event, values, source, at);
      return entry ? [entry] : [];
    });
  } catch { return []; }
}

export function displayValues({ values }: LogEntry): string[] {
  return (Object.keys(FIELDS) as Field[]).flatMap((key) => {
    const value = values[key];
    return value === undefined ? [] : [`${FIELDS[key]}: ${value}${key === 'ms' ? ' мс' : ''}`];
  });
}

export const reportFilename = () => `Luma-diagnostics-${new Date().toISOString().slice(0, 10)}.log`;

export function diagnosticsReport({ entries, environment }: DiagnosticSnapshot): string {
  const info = [
    `Luma Player ${environment.version} · ${runtimeMode[environment.mode]}`,
    `Система: ${environment.system}`, `Среда: ${environment.runtime}`,
    `Сеть: ${environment.online ? 'устройство в сети' : 'устройство вне сети'}`, `Записей: ${entries.length}`, '',
  ];
  const lines = entries.map((entry) => {
    const [, area, level, message] = LOG_EVENTS[entry.event];
    const values = displayValues(entry);
    return `${new Date(entry.at).toISOString()} [${LOG_LEVELS[level]}] ${LOG_AREAS[area]} (${entry.event}) — ${message}${values.length ? ` · ${values.join(' · ')}` : ''}`;
  });
  return [...info, ...lines, ''].join('\n');
}
