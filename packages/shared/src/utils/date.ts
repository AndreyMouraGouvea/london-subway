const LONDON_TZ = 'Europe/London';

type DateInput = string | number | Date | null | undefined;

const dateTimeFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: LONDON_TZ,
  dateStyle: 'medium',
  timeStyle: 'medium',
});

const timeFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: LONDON_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Datas TfL com ano 0001 são placeholders e devem virar null. */
export function parseTfLDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('0001-01-01')) return null;
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

export function formatLondonDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

export function formatLondonTime(value: DateInput): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : '—';
}

/** Idade em segundos, nunca negativa. */
export function ageInSeconds(value: DateInput, now = Date.now()): number | null {
  const date = toDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now - date.getTime()) / 1000));
}

/** Texto curto em português, sem dependências externas. */
export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'sem data';
  if (seconds < 5) return 'agora';
  if (seconds < 60) return `há ${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
