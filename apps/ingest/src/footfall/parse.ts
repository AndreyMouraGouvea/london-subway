/**
 * Parsing e resolução de nomes do dataset de footfall da TfL.
 *
 * O CSV usa nomes de estação, não IDs. A resolução é determinística:
 * 1. alias explícito para variantes conhecidas (NR/EL/LO/DLR, Hammersmith, etc.);
 * 2. correspondência única pelo nome normalizado;
 * 3. filtro por sufixo de modo (NR, EL, LO, DLR);
 * 4. heurística documentada (Tubo > DLR > rail, mais linhas, sem parênteses).
 * Nomes sem correspondência são reportados e nunca inventados.
 */

export interface CanonicalStation {
  id: string;
  name: string;
  displayName: string;
  stopType: string | null;
  modes: string[];
  lineIds: string[];
}

export interface FootfallCsvRow {
  travelDate: string;
  stationName: string;
  entries: number | null;
  exits: number | null;
}

export type ResolutionVia = 'alias' | 'unique' | 'suffix' | 'heuristic' | 'unmatched';

export interface StationResolution {
  stationId: string | null;
  via: ResolutionVia;
  candidates: string[];
}

export interface FootfallParseResult {
  rows: FootfallCsvRow[];
  skipped: number;
}

const MODE_TOKENS = new Set([
  'underground',
  'dlr',
  'rail',
  'tram',
  'elizabeth',
  'overground',
  'station',
  'nr',
  'el',
  'lo',
  'sr',
  'tfl',
  'hex',
  'london',
  'ell',
  'bucks',
  'berks',
  'met',
  'line',
  'lu',
]);

/**
 * Variantes que não são resolvíveis só pela normalização. As chaves usam
 * `rawKey()` (minúsculas, sem acentos/apóstrofos, `&` → `and`, `.` removido).
 */
export const STATION_ALIASES: Readonly<Record<string, string>> = {
  // Dois pares de estações com o mesmo nome, separados por linha.
  'hammersmith c and h': '940GZZLUHSC',
  'hammersmith d and p': '940GZZLUHSD',
  'edgware road b': '940GZZLUERB',
  'edgware road c and h': '940GZZLUERC',
  // Variantes de nome que a normalização base não consegue alinhar.
  'kensington olympia': '940GZZLUKOY',
  'w silvertown': '940GZZDLWSV',
  'liverpool st nr': '910GLIVST',
  'canary wharf elizabeth line': '910GCANWHRF',
  'custom house elizabeth line': '910GCUSTMHS',
  'woolwich elizabeth line': '910GWOLWXR',
  'heathrow t2 and 3 tfl rail hex': '910GHTRWAPT',
  'heathrow t4 tfl rail hex': '910GHTRWTM4',
  'heathrow t5 tfl rail hex': '910GHTRWTM5',
  'bank and monument': '940GZZLUBNK',
  'bank monument': '940GZZLUBNK',
  'heathrow terminals 123 lu': '940GZZLUHRC',
  'heathrow terminals 123': '940GZZLUHRC',
  'norwood jn': '910GNORWDJ',
};

/** Minúsculas, sem acentos/apóstrofos, `&` → `and`, pontuação → espaço. */
export function rawKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\./g, ' ')
    .replace(/\brd\b/g, 'road')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Chave base: remove parênteses e tokens de modo/sufixo. */
export function baseKey(value: string): string {
  const withoutParentheses = value.replace(/\([^)]*\)/g, ' ');
  return rawKey(withoutParentheses)
    .split(/\s+/)
    .filter((token) => token && !MODE_TOKENS.has(token))
    .join(' ')
    .trim();
}

/** Converte `YYYYMMDD` para `YYYY-MM-DD`, validando o calendário. */
export function parseTravelDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{8}$/.test(trimmed)) return null;
  const year = Number(trimmed.slice(0, 4));
  const month = Number(trimmed.slice(4, 6));
  const day = Number(trimmed.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}

/** Contagens vazias/inválidas ficam `null`; zero é um valor real. */
export function parseCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

/** CSV com suporte a campos entre aspas (nomes podem conter vírgulas). */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

/**
 * Lê o CSV completo. As linhas inválidas são contadas e ignoradas, nunca
 * substituídas por valores fictícios.
 */
export function parseFootfallCsv(text: string): FootfallParseResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.shift();
  if (!header) throw new Error('CSV vazio.');
  const columns = parseCsvLine(header).map((column) => column.trim());
  const expected = ['TravelDate', 'DayOfWeek', 'Station', 'EntryTapCount', 'ExitTapCount'];
  if (expected.some((column) => !columns.includes(column))) {
    throw new Error(`Cabeçalho inesperado: ${columns.join(', ')}`);
  }
  const index = Object.fromEntries(columns.map((column, position) => [column, position]));
  const travelDateIndex = index.TravelDate ?? 0;
  const stationIndex = index.Station ?? 0;
  const entryIndex = index.EntryTapCount ?? 0;
  const exitIndex = index.ExitTapCount ?? 0;
  const rows: FootfallCsvRow[] = [];
  let skipped = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const travelDate = parseTravelDate(fields[travelDateIndex] ?? '');
    const stationName = fields[stationIndex]?.trim();
    if (!travelDate || !stationName) {
      skipped += 1;
      continue;
    }
    rows.push({
      travelDate,
      stationName,
      entries: parseCount(fields[entryIndex]),
      exits: parseCount(fields[exitIndex]),
    });
  }

  return { rows, skipped };
}

export interface StationIndex {
  byBase: Map<string, CanonicalStation[]>;
}

export function buildStationIndex(stations: readonly CanonicalStation[]): StationIndex {
  const byBase = new Map<string, CanonicalStation[]>();
  for (const station of stations) {
    const keys = new Set([baseKey(station.name), baseKey(station.displayName)]);
    for (const key of keys) {
      if (!key) continue;
      const list = byBase.get(key) ?? [];
      if (!list.some((candidate) => candidate.id === station.id)) list.push(station);
      byBase.set(key, list);
    }
  }
  return { byBase };
}

function scoreStation(station: CanonicalStation): number {
  let score = 0;
  if (station.modes.includes('tube')) score += 100;
  if (station.lineIds.includes('dlr')) score += 50;
  if (station.lineIds.includes('elizabeth')) score += 20;
  if (station.stopType === 'NaptanMetroStation') score += 10;
  if (!station.displayName.includes('(')) score += 5;
  score += station.lineIds.length;
  return score;
}

function chooseBest(candidates: readonly CanonicalStation[]): CanonicalStation | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const diff = scoreStation(b) - scoreStation(a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  })[0]!;
}

export function resolveStationName(rawName: string, index: StationIndex): StationResolution {
  const key = rawKey(rawName);
  const alias = STATION_ALIASES[key];
  if (alias) {
    return { stationId: alias, via: 'alias', candidates: [alias] };
  }

  const base = baseKey(rawName);
  const candidates = index.byBase.get(base) ?? [];
  const ids = candidates.map((candidate) => candidate.id);
  if (candidates.length === 1) {
    return { stationId: candidates[0]!.id, via: 'unique', candidates: ids };
  }
  if (candidates.length === 0) {
    return { stationId: null, via: 'unmatched', candidates: [] };
  }

  const tokens = key.split(' ');
  let filtered = [...candidates];
  if (tokens.includes('nr') || tokens.includes('sr')) {
    filtered = filtered.filter((candidate) => candidate.stopType === 'NaptanRailStation');
  } else if (tokens.includes('el') || tokens.includes('elizabeth')) {
    filtered = filtered.filter((candidate) => candidate.lineIds.includes('elizabeth'));
  } else if (tokens.includes('lo')) {
    filtered = filtered.filter((candidate) => candidate.modes.includes('overground'));
  } else if (tokens.includes('dlr')) {
    filtered = filtered.filter((candidate) => candidate.lineIds.includes('dlr'));
  } else if (tokens.includes('tfl') || tokens.includes('hex')) {
    filtered = filtered.filter(
      (candidate) =>
        candidate.modes.includes('national-rail') || candidate.lineIds.includes('elizabeth'),
    );
  }

  if (filtered.length === 1) {
    return { stationId: filtered[0]!.id, via: 'suffix', candidates: ids };
  }

  const best = chooseBest(filtered.length > 0 ? filtered : candidates);
  return {
    stationId: best?.id ?? null,
    via: best ? 'heuristic' : 'unmatched',
    candidates: ids,
  };
}
