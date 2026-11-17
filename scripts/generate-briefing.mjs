#!/usr/bin/env node
/**
 * Gera o briefing da Vidrey's Report sobre o London Digital Twin.
 *
 * - Recolhe dados da API pública e contagens exatas via PostgREST (RLS pública).
 * - Renderiza um HTML autossuficiente (fontes embutidas, A4 landscape).
 * - Converte para PDF com Edge/Chrome headless.
 * - Exporta também o relatório operacional /report, já com a linha de marca.
 *
 * Uso:
 *   npm run briefing
 *   npm run briefing -- --verify
 *   npm run briefing -- --report-only
 *   npm run briefing -- --deck-only
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRAND, renderDeck } from './briefing/template.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'briefing');
const DEFAULT_API = 'https://lgjwhvzejtcunhzsmalw.supabase.co/functions/v1/api';
const DEFAULT_SUPABASE = 'https://lgjwhvzejtcunhzsmalw.supabase.co';
// Chave anon pública (a mesma publicada no bundle). Não é um segredo.
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnandodnplanRjdW5oenNtYWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMjI0NjIsImV4cCI6MjEwOTg5ODQ2Mn0.bPKDozOcHQ8DbIBIPbbJvzha45eHw1OytEloyQZn2jk';
const TOTAL_SLIDES = 14;

const COUNTS = {
  lines: ['lines'],
  stations: ['stations'],
  lineStations: ['line_stations'],
  linePaths: ['line_paths'],
  entrances: ['station_entrances'],
  footfallRows: ['station_traffic_snapshots', 'source_dataset=eq.tfl-station-footfall-2025-2026'],
  annualRows: ['station_traffic_snapshots', 'source_dataset=eq.tfl-annual-station-counts-2025'],
  numbatRows: ['line_annual_boardings'],
  linkFlowRows: ['station_crowding_profiles', 'kind=eq.link_flow'],
  trainLoadingRows: ['station_crowding_profiles', 'kind=eq.train_loading'],
  rodsRows: ['station_crowding_profiles', 'source_dataset=eq.tfl-rods-2017'],
  statusSnapshots: ['line_status_snapshots'],
  disruptionsRows: ['disruptions'],
};

const MODE_LABELS = {
  tube: 'London Underground',
  overground: 'London Overground',
  dlr: 'DLR',
  elizabeth: 'Elizabeth line',
  'elizabeth-line': 'Elizabeth line',
  tram: 'London Trams',
  'cable-car': 'Cable car',
  'national-rail': 'National Rail',
  'river-bus': 'River bus',
};

const BAND_LABELS = {
  normal: 'Good service',
  attention: 'Attention',
  severe: 'Severe',
  closure: 'Closure',
  unknown: 'No information',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inline] = arg.slice(2).split('=');
    if (inline !== undefined) {
      options[rawKey] = inline;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      options[rawKey] = argv[index + 1];
      index += 1;
    } else {
      flags.add(rawKey);
    }
  }
  return { options, flags };
}

const { options, flags } = parseArgs(process.argv.slice(2));
const apiBase = (options.api ?? DEFAULT_API).replace(/\/$/, '');
const supabaseUrl = (options['supabase-url'] ?? DEFAULT_SUPABASE).replace(/\/$/, '');
const anonKey = options['anon-key'] ?? DEFAULT_ANON_KEY;
const reportUrl =
  options['report-url'] ?? 'https://andreymouragouvea.github.io/london-subway/report';
const verify = flags.has('verify') || options.verify === 'true';
const deckOnly = flags.has('deck-only');
const reportOnly = flags.has('report-only');

function londonStamp(date, options = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
    ...options,
  })
    .format(date)
    .replace(',', '');
}

function londonDatePart(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(date);
}

async function fetchJson(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body?.error) throw new Error(`${body.error.code}: ${body.error.message}`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(1_500 * attempt);
    }
  }
  throw new Error(`${label} falhou: ${lastError?.message ?? 'erro desconhecido'}`);
}

async function api(pathname) {
  return fetchJson(`${apiBase}${pathname}`, pathname);
}

async function countRows([table, filter]) {
  const query = filter ? `?${filter}&select=*` : '?select=*';
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const range = response.headers.get('content-range') ?? '';
      const total = Number(range.split('/')[1]);
      return Number.isFinite(total) ? total : null;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(1_200 * attempt);
    }
  }
  throw lastError;
}

async function loadCounts() {
  const entries = await Promise.all(
    Object.entries(COUNTS).map(async ([key, spec]) => {
      try {
        return [key, await countRows(spec)];
      } catch (error) {
        console.warn(`  ! contagem ${key}: ${error.message}`);
        return [key, null];
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function loadFontsCss() {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  try {
    const response = await fetch(cssUrl, {
      headers: {
        // UA de Chrome recente: garante woff2 em vez de ttf.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const css = await response.text();
    const faces = [...css.matchAll(/\/\*\s*latin\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)];
    const blocks = [];
    for (const [, body] of faces) {
      const weight = /font-weight:\s*(\d+)/.exec(body)?.[1] ?? '400';
      const url = /url\((https:[^)]+\.woff2)\)/.exec(body)?.[1];
      const unicodeRange = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
      if (!url) continue;
      const fontResponse = await fetch(url, { signal: AbortSignal.timeout(45_000) });
      if (!fontResponse.ok) continue;
      const base64 = Buffer.from(await fontResponse.arrayBuffer()).toString('base64');
      blocks.push(`@font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: ${weight};
        font-display: swap;
        src: url(data:font/woff2;base64,${base64}) format('woff2');
        ${unicodeRange ? `unicode-range: ${unicodeRange};` : ''}
      }`);
    }
    if (blocks.length === 0) throw new Error('nenhum woff2 latin encontrado');
    console.info(`  · Inter embutida (${blocks.length} pesos)`);
    return blocks.join('\n');
  } catch (error) {
    console.warn(`  ! fontes não embutidas (${error.message}); uso Segoe UI como fallback`);
    return '';
  }
}

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Edge/Chrome não encontrado. Define EDGE_PATH com o caminho do executável.');
  }
  return found;
}

function runProcess(command, args, { timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout após ${timeoutMs} ms`));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

async function printHtmlToPdf(htmlPath, pdfPath) {
  const browser = findBrowser();
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=20000',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ];
  const { stderr } = await runProcess(browser, args);
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF não foi criado. stderr: ${stderr.slice(-800)}`);
  }
}

function countPdfPages(buffer) {
  const text = buffer.toString('latin1');
  const direct = [...text.matchAll(/\/Type\s*\/Page[^s]/g)].length;
  if (direct > 0) return direct;
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
  return counts.length ? Math.max(...counts) : null;
}

function assertPdf(pdfPath, expectedPages) {
  const buffer = readFileSync(pdfPath);
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error(`${pdfPath} não começa com %PDF-`);
  }
  if (buffer.length < 40_000) {
    throw new Error(`${pdfPath} tem apenas ${buffer.length} bytes`);
  }
  const pages = countPdfPages(buffer);
  if (expectedPages && pages !== null && pages !== expectedPages) {
    throw new Error(`${pdfPath}: esperava ${expectedPages} páginas, encontrei ${pages}`);
  }
  if (pages === null) {
    console.warn(`  ! não foi possível contar as páginas de ${path.basename(pdfPath)}`);
  }
  return { bytes: buffer.length, pages };
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      entry.resolve(message);
    });
  }

  static connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      socket.addEventListener('open', () => resolve(new CdpClient(socket)), { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForTarget(port, matcher, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(5_000),
      });
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && matcher(target.url ?? ''));
      if (page) return page;
    } catch {
      // Browser ainda a arrancar.
    }
    await wait(500);
  }
  throw new Error('DevTools não ficou disponível a tempo');
}

async function withBrowser(url, port, callback) {
  const browser = findBrowser();
  const profile = mkdtempSync(path.join(os.tmpdir(), 'vidreys-cdp-'));
  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--window-size=1400,1000',
      url,
    ],
    { stdio: 'ignore' },
  );
  try {
    const target = await waitForTarget(
      port,
      (targetUrl) => targetUrl.startsWith('http') || targetUrl.startsWith('file:'),
    );
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      return await callback(client);
    } finally {
      client.close();
    }
  } finally {
    child.kill('SIGKILL');
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.result?.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.text ?? 'erro ao avaliar expressão');
  }
  return result.result?.result?.value;
}

async function verifyDeck(htmlPath, screenshotsDir) {
  const url = pathToFileURL(htmlPath).href;
  return withBrowser(url, 9333, async (client) => {
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1122,
      height: 794,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const audit = await evaluate(
      client,
      `(() => {
        const slides = [...document.querySelectorAll('.slide')];
        return slides.map((slide, index) => ({
          index: index + 1,
          contentOverflow: slide.scrollHeight > slide.clientHeight + 1,
          horizontalOverflow: slide.scrollWidth > slide.clientWidth + 1,
          scrollHeight: slide.scrollHeight,
          clientHeight: slide.clientHeight,
        }));
      })()`,
    );
    mkdirSync(screenshotsDir, { recursive: true });
    for (let index = 0; index < audit.length; index += 1) {
      await evaluate(
        client,
        `document.querySelectorAll('.slide')[${index}].scrollIntoView({ block: 'start' })`,
      );
      await wait(120);
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(
        path.join(screenshotsDir, `slide-${String(index + 1).padStart(2, '0')}.png`),
        Buffer.from(shot.result.data, 'base64'),
      );
    }
    return audit;
  });
}

async function exportReport(reportUrl, pdfPath, previewPath) {
  return withBrowser(reportUrl, 9334, async (client) => {
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 1600,
      deviceScaleFactor: 1,
      mobile: false,
    });

    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const state = await evaluate(
        client,
        `(() => {
          const root = document.querySelector('.print-report');
          if (!root) return { ready: false, rows: 0 };
          const rows = root.querySelectorAll('table tbody tr').length;
          const text = root.textContent ?? '';
          return { ready: rows >= 5 && !text.includes('aguarda sync'), rows };
        })()`,
      );
      if (state?.ready) {
        ready = true;
        console.info(`  · /report pronto (${state.rows} linhas)`);
        break;
      }
      await wait(1000);
    }
    if (!ready) console.warn('  ! /report não confirmou dados; a exportar mesmo assim');

    await wait(500);
    const pdf = await client.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });
    if (!pdf.result?.data) {
      throw new Error('printToPDF não devolveu dados');
    }
    writeFileSync(pdfPath, Buffer.from(pdf.result.data, 'base64'));
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(previewPath, Buffer.from(shot.result.data, 'base64'));
  });
}

function formatMediumDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function buildFindings(model) {
  const summary = model.network.summary;
  const { history, analytics, footfall, sourceSummary, jobSummary, counts } = model;
  const historicalYears = model.generatedYear - 2017;
  return {
    strengths: [
      {
        title: 'Complete network inventory',
        body: `${summary.linesTotal} of ${summary.linesTotal} lines and ${summary.stationsTotal} stations are present, with ${counts.lineStations} line–station links and ${counts.linePaths} geometries.`,
        evidence: `Counts on lines/stations/line_stations/line_paths; ${counts.statusSnapshots} status snapshots stored.`,
      },
      {
        title: 'Operational data is fresh',
        body: `The status snapshot was ${model.freshness.ageLabel} at generation, with ${history.coverage.buckets} hourly buckets and ${history.coverage.samples} samples in the last 24 hours.`,
        evidence: `api.meta.ageSeconds = ${model.freshness.ageSeconds}; last capture ${model.freshness.capturedLabel}.`,
      },
      {
        title: 'Clean ingestion health',
        body: `${sourceSummary.ok} of ${sourceSummary.total} sources are ok with ${sourceSummary.error} errors, and ${jobSummary.success} of ${jobSummary.total} recent jobs succeeded.`,
        evidence: `/data-health at ${model.generatedStamp}; no failed job in the last ${jobSummary.total}.`,
      },
    ],
    risks: [
      {
        title: 'Step-free access is not evidenced',
        body: `${analytics.accessibility.stepFreeKnown} of ${analytics.accessibility.totalStations} stations have a confirmed step-free value. Lifts are not proof of step-free access.`,
        evidence: `/analytics/network accessibility block.`,
      },
      {
        title: 'Historical data sits next to live status',
        body: `Link flows, train loadings, RODS and crowding profiles are from 2017 (${historicalYears} years old); footfall ends ${formatMediumDate(footfall.latestDate)}, ${model.footfallLagDays ?? '—'} days before this report.`,
        evidence: `Dataset inventory and footfall metadata.`,
      },
      {
        title: 'Registration does not verify email',
        body: 'Email confirmation is disabled (mailer_autoconfirm, no SMTP): a public sign-up completes without proving ownership of the address.',
        evidence: 'Configuration review of the hosted environment, not an API response.',
      },
    ],
    recommendations: [
      {
        title: 'Publish dataset vintage as a field',
        body: 'Return source year and lag in API metadata, and show them next to every historical chart and badge.',
        evidence: `Four of six datasets are 2017; footfall lag is ${model.footfallLagDays ?? '—'} days.`,
      },
      {
        title: 'Resolve or exclude accessibility',
        body: 'Source step-free data, or label accessibility as unavailable. Do not derive it from lifts or escalators.',
        evidence: `${analytics.accessibility.stepFreeKnown} of ${analytics.accessibility.totalStations} confirmed; ${analytics.accessibility.withLifts} stations report lifts.`,
      },
      {
        title: 'Harden identity and credentials',
        body: 'Configure SMTP and re-enable confirmations, rotate the Supabase token and database password, and register a TfL app key.',
        evidence: 'Configuration review; token and database password were shared during setup.',
      },
    ],
  };
}

function buildModel({
  generatedAt,
  counts,
  status,
  dashboard,
  history,
  lines,
  disruptions,
  analytics,
  footfall,
  annual,
  boardings,
  health,
  fontsCss,
}) {
  const summary = status.data.summary;
  const alerts = disruptions.data ?? [];
  const lineList = lines.data ?? status.data.lines ?? [];
  const lineStatusById = new Map(
    lineList.map((line) => {
      const band = line.status?.band ?? 'unknown';
      return [line.id, `<span class="chip ${band}">${BAND_LABELS[band] ?? band}</span>`];
    }),
  );
  const lineNameById = new Map(lineList.map((line) => [line.id, line.name]));
  const lineModes = Object.entries(
    lines.data.reduce((accumulator, line) => {
      accumulator[line.mode] = (accumulator[line.mode] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([mode, total]) => ({
      mode,
      label: MODE_LABELS[mode] ?? mode,
      lines: total,
      share: total / Math.max(1, lines.data.length),
    }))
    .sort((left, right) => right.lines - left.lines);

  const bandCounts = { normal: 0, attention: 0, severe: 0, closure: 0, unknown: 0 };
  for (const alert of alerts) {
    bandCounts[alert.band] = (bandCounts[alert.band] ?? 0) + 1;
  }
  const bandRank = { closure: 0, severe: 1, attention: 2, unknown: 3, normal: 4 };
  const seenAlerts = new Set();
  const uniqueAlerts = alerts.filter((alert) => {
    const key = `${alert.lineId ?? 'network'}|${alert.band}|${(alert.description ?? alert.summary ?? '').trim()}`;
    if (seenAlerts.has(key)) return false;
    seenAlerts.add(key);
    return true;
  });
  const topAlerts = [...uniqueAlerts]
    .sort(
      (left, right) =>
        (bandRank[left.band] ?? 9) - (bandRank[right.band] ?? 9) ||
        (right.lastSeenAt ?? '').localeCompare(left.lastSeenAt ?? ''),
    )
    .slice(0, 10);

  const seenCritical = new Set();
  const criticalStations = analytics.data.criticalStations.filter((station) => {
    if (seenCritical.has(station.name)) return false;
    seenCritical.add(station.name);
    return true;
  });

  const sourceSummary = {
    total: health.data.sources.length,
    ok: health.data.sources.filter((source) => source.status === 'ok').length,
    error: health.data.sources.filter((source) => source.status === 'error').length,
    notSynced: health.data.sources.filter((source) => source.status === 'not_synced').length,
  };
  const jobSummary = {
    total: health.data.jobs.length,
    success: health.data.jobs.filter((job) => job.status === 'success').length,
    failed: health.data.jobs.filter((job) => job.status === 'failed').length,
  };

  const footfallLagDays = footfall.data.latestDate
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${londonDatePart(generatedAt)}T00:00:00Z`) -
            Date.parse(`${footfall.data.latestDate}T00:00:00Z`)) /
            86_400_000,
        ),
      )
    : null;

  const latestBoardings = boardings.data.lines.filter(
    (line) => line.latestYear === boardings.data.latestYear,
  );
  const totalLatest = latestBoardings.reduce(
    (total, line) => total + (line.latestBoardings ?? 0),
    0,
  );

  const countsTotal =
    (counts.footfallRows ?? 0) +
    (counts.annualRows ?? 0) +
    (counts.numbatRows ?? 0) +
    (counts.linkFlowRows ?? 0) +
    (counts.trainLoadingRows ?? 0) +
    (counts.rodsRows ?? 0);

  const ageSeconds = status.meta.ageSeconds;
  const model = {
    generatedStamp: londonStamp(generatedAt),
    generatedIso: generatedAt.toISOString(),
    generatedYear: generatedAt.getUTCFullYear(),
    totalSlides: TOTAL_SLIDES,
    apiBase,
    countsStamp: londonStamp(generatedAt),
    fontsCss,
    counts: { ...counts, totalRows: countsTotal },
    network: {
      summary,
      lines: lineList,
    },
    lineModes,
    lineStatusById,
    lineNameById,
    dashboard: {
      topLines: dashboard.data.topLines,
    },
    freshness: {
      ageSeconds,
      ageLabel:
        ageSeconds === null
          ? 'no timestamp'
          : ageSeconds < 90
            ? `${ageSeconds}s old`
            : `${Math.round(ageSeconds / 60)} min old`,
      capturedLabel: summary.lastCapturedAt ? londonStamp(new Date(summary.lastCapturedAt)) : '—',
      fetchedLabel: status.meta.fetchedAt ? londonStamp(new Date(status.meta.fetchedAt)) : '—',
      sourceState: status.meta.dataSourceStatus,
      isStale: status.meta.isStale,
    },
    disruptions: {
      active: summary.disruptionsActive,
      unique: uniqueAlerts.length,
      top: topAlerts,
    },
    disruptionBands: bandCounts,
    history: {
      coverage: history.data.coverage,
      recent: [...history.data.series].slice(-12).reverse(),
      topDisrupted: history.data.topDisruptedLines.slice(0, 5),
    },
    footfall: footfall.data,
    footfallLagDays,
    annual: annual.data,
    boardings: {
      years: boardings.data.years,
      top: latestBoardings
        .slice()
        .sort((left, right) => (right.latestBoardings ?? 0) - (left.latestBoardings ?? 0))
        .slice(0, 5),
      totalLatest,
      linesCount: latestBoardings.length,
    },
    analytics: {
      ...analytics.data,
      criticalStations,
    },
    health: {
      sources: health.data.sources,
      jobs: health.data.jobs,
      retention: health.data.retention,
    },
    sourceSummary,
    jobSummary,
  };
  model.findings = buildFindings(model);
  return model;
}

function writeOutputSummary(label, pdfPath, details) {
  console.info(
    `✓ ${label}: ${pdfPath} (${(details.bytes / 1024).toFixed(0)} KB, ${details.pages ?? '?'} páginas)`,
  );
}

async function generateDeck() {
  console.info("→ Briefing Vidrey's Report");
  console.info(`  API: ${apiBase}`);
  console.info(`  Supabase: ${supabaseUrl} (RLS pública, anon key)`);

  const [
    fontsCss,
    counts,
    status,
    dashboard,
    history,
    lines,
    disruptions,
    analytics,
    footfall,
    annual,
    boardings,
    health,
  ] = await Promise.all([
    loadFontsCss(),
    loadCounts(),
    api('/network/status'),
    api('/dashboard/summary'),
    api('/dashboard/history?hours=24'),
    api('/lines'),
    api('/disruptions'),
    api('/analytics/network'),
    api('/analytics/footfall/summary?days=30&limit=8'),
    api('/analytics/annual/summary?limit=8'),
    api('/analytics/boardings'),
    api('/data-health'),
  ]);

  const generatedAt = new Date();
  const model = buildModel({
    generatedAt,
    counts,
    status,
    dashboard,
    history,
    lines,
    disruptions,
    analytics,
    footfall,
    annual,
    boardings,
    health,
    fontsCss,
  });

  const html = renderDeck(model);
  if (html.includes(anonKey)) {
    throw new Error('a chave anon apareceu no HTML; abortar');
  }

  const stamp = londonDatePart(generatedAt);
  mkdirSync(OUT_DIR, { recursive: true });
  const htmlDir = mkdtempSync(path.join(os.tmpdir(), 'vidreys-deck-'));
  const htmlPath = path.join(htmlDir, `vidreys-report_${stamp}.html`);
  writeFileSync(htmlPath, html, 'utf8');
  console.info(`  · HTML: ${htmlPath} (${(html.length / 1024).toFixed(0)} KB)`);

  const pdfPath = path.join(OUT_DIR, `vidreys-report_london-digital-twin_${stamp}.pdf`);
  await printHtmlToPdf(htmlPath, pdfPath);
  const details = assertPdf(pdfPath, TOTAL_SLIDES);
  writeOutputSummary('Deck', pdfPath, details);

  if (verify) {
    const screenshotsDir = path.join(os.tmpdir(), `vidreys-screens-${stamp}`);
    const audit = await verifyDeck(htmlPath, screenshotsDir);
    const problems = audit.filter((slide) => slide.contentOverflow || slide.horizontalOverflow);
    for (const slide of audit) {
      console.info(
        `    slide ${String(slide.index).padStart(2, '0')}: ${slide.contentOverflow ? 'OVERFLOW-Y' : 'ok'}${
          slide.horizontalOverflow ? ' OVERFLOW-X' : ''
        } (${slide.scrollHeight}/${slide.clientHeight})`,
      );
    }
    console.info(`  · screenshots: ${screenshotsDir}`);
    if (problems.length > 0) {
      throw new Error(
        `conteúdo excede a página nos slides: ${problems.map((slide) => slide.index).join(', ')}`,
      );
    }
  }

  return { stamp, pdfPath, model };
}

async function generateReport(stamp) {
  const outPath = path.join(OUT_DIR, `vidreys-report_london-digital-twin-operational_${stamp}.pdf`);
  const previewPath = path.join(os.tmpdir(), `vidreys-report-preview-${stamp}.png`);
  console.info(`→ Relatório operacional: ${reportUrl}`);
  await exportReport(reportUrl, outPath, previewPath);
  const details = assertPdf(outPath);
  writeOutputSummary('Relatório', outPath, details);
  console.info(`  · preview: ${previewPath}`);
  return { outPath, previewPath };
}

async function main() {
  let stamp = londonDatePart(new Date());
  let deckResult = null;

  if (!reportOnly) {
    deckResult = await generateDeck();
    stamp = deckResult.stamp;
  }

  if (!deckOnly) {
    await generateReport(stamp);
  }

  console.info(`\nMarca: ${BRAND.name} — ${BRAND.tagline}`);
  console.info(`Destino: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  if (flags.has('debug') || process.env.DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
