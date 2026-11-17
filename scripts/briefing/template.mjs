/**
 * Templates do briefing da Vidrey's Report.
 *
 * O HTML é autossuficiente: fontes embutidas em base64, CSS de impressão
 * A4 landscape e uma <section class="slide"> por página. O PDF é produzido
 * pelo Chromium/Edge a partir deste ficheiro (ver scripts/generate-briefing.mjs).
 */

export const BRAND = {
  name: "Vidrey's Report",
  wordmark: "VIDREY'S REPORT",
  tagline: 'Independent Audit for Brands',
  subject: 'London Digital Twin',
  disclaimer:
    "Independent report prepared by Vidrey's Report. Not affiliated with, endorsed or sponsored by Transport for London.",
};

const STATUS_LABELS = {
  normal: 'Good service',
  attention: 'Attention',
  severe: 'Severe',
  closure: 'Closure',
  unknown: 'No information',
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

const SOURCE_STATUS_LABELS = {
  ok: 'OK',
  not_synced: 'Not synced',
  error: 'Error',
};

const LICENCE_LABELS = {
  'TfL Colour Standard — uso sujeito às regras da TfL':
    'TfL Colour Standard — subject to TfL brand rules',
};

const sourceStatusChip = (status) =>
  `<span class="chip ${status === 'ok' ? 'normal' : status === 'error' ? 'severe' : 'unknown'}">${esc(
    SOURCE_STATUS_LABELS[status] ?? status,
  )}</span>`;

const licenceLabel = (value) => {
  if (!value) return '—';
  const key = String(value).trim();
  return LICENCE_LABELS[key] ?? key;
};

const MAP_PAPER = '#F7F9FC';
const MAP_CONTEXT = '#D5DCE5';
const MAP_FALLBACK = '#7A879C';

function mercatorY(lat) {
  const radians = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function geometrySegments(geometry) {
  return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
}

/**
 * Desenha a rede (ou uma linha) como SVG vetorial. Sem tiles e sem MapLibre:
 * o resultado imprime bem e não depende de rede no momento da impressão.
 */
function renderMap(
  model,
  {
    focusLineId = null,
    width = 1000,
    height = 820,
    labelCount = 6,
    labelSize = 16,
    contextWidth = 2.4,
    focusWidth = 4,
    stationRadius = 4,
    interchangeRadius = 6,
  } = {},
) {
  const { paths, stations, lines } = model.mapData;
  const colorById = new Map(lines.map((line) => [line.id, line.colorHex ?? MAP_FALLBACK]));
  const focusPaths = focusLineId ? paths.filter((path) => path.lineId === focusLineId) : paths;
  const boundsPaths = focusPaths.length > 0 ? focusPaths : paths;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const projected = new Map();

  for (const path of boundsPaths) {
    const segments = [];
    for (const segment of geometrySegments(path.geometry)) {
      const points = [];
      for (const point of segment) {
        const lon = point[0];
        const lat = point[1];
        if (typeof lon !== 'number' || typeof lat !== 'number') continue;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const x = (lon * Math.PI) / 180;
        const y = mercatorY(lat);
        points.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (points.length > 1) segments.push(points);
    }
    projected.set(`${path.lineId}|${path.direction}|${path.branchId}`, segments);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = 0;
    maxX = 1;
    minY = 0;
    maxY = 1;
  }

  const padding = width * 0.025;
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanY * scale) / 2 + maxY * scale;
  const project = (lon, lat) => [
    ((lon * Math.PI) / 180) * scale + offsetX,
    offsetY - mercatorY(lat) * scale,
  ];

  const pathMarkup = [];
  for (const path of paths) {
    const segments = projected.get(`${path.lineId}|${path.direction}|${path.branchId}`);
    if (!segments) continue;
    let lastX = Number.POSITIVE_INFINITY;
    let lastY = Number.POSITIVE_INFINITY;
    const parts = [];
    for (const segment of segments) {
      segment.forEach((point, index) => {
        const x = point[0];
        const y = point[1];
        if (x === undefined || y === undefined) return;
        const px = x * scale + offsetX;
        const py = offsetY - y * scale;
        if (index > 0 && Math.abs(px - lastX) + Math.abs(py - lastY) < 0.6) return;
        parts.push(
          `${parts.length === 0 || index === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`,
        );
        lastX = px;
        lastY = py;
      });
    }
    if (parts.length === 0) continue;
    const focused = Boolean(focusLineId && path.lineId === focusLineId);
    pathMarkup.push(
      `<path d="${parts.join(' ')}" fill="none" stroke="${
        focused
          ? (colorById.get(path.lineId) ?? MAP_FALLBACK)
          : focusLineId
            ? MAP_CONTEXT
            : (colorById.get(path.lineId) ?? MAP_FALLBACK)
      }" stroke-width="${focused ? focusWidth : contextWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${
        focused ? 1 : focusLineId ? 0.75 : 0.9
      }" />`,
    );
  }

  const focusStations = focusLineId
    ? stations.filter((station) => station.lineIds.includes(focusLineId))
    : stations;
  const stationMarkup = focusStations.map((station) => {
    const [x, y] = project(station.lon, station.lat);
    const interchange = station.lineIds.length > 1;
    const radius = focusLineId
      ? interchange
        ? stationRadius * 1.25
        : stationRadius
      : interchange
        ? interchangeRadius * 0.65
        : interchangeRadius * 0.45;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${
      focusLineId ? '#14202E' : '#FFFFFF'
    }" stroke="${focusLineId ? '#FFFFFF' : '#8A99AB'}" stroke-width="${focusLineId ? 1.6 : 1}" />`;
  });

  const candidates = [...focusStations]
    .filter((station) => !focusLineId || station.lineIds.length > 1)
    .sort(
      (left, right) =>
        right.lineIds.length - left.lineIds.length || left.name.localeCompare(right.name),
    );
  const placed = [];
  const anchors = [];
  const labels = [];
  for (const station of candidates) {
    if (labels.length >= labelCount) break;
    const [x, y] = project(station.lon, station.lat);
    if (x < 8 || x > width - 8 || y < labelSize || y > height - 8) continue;
    if (anchors.some((anchor) => Math.hypot(anchor.x - x, anchor.y - y) < labelSize * 4)) continue;
    const boxWidth = station.name.length * labelSize * 0.54 + 6;
    for (const anchor of ['start', 'end']) {
      const left = anchor === 'start' ? x + 6 : x - 6 - boxWidth;
      const box = { x1: left, y1: y - labelSize, x2: left + boxWidth, y2: y + 4 };
      if (box.x1 < 2 || box.x2 > width - 2) continue;
      const overlap = placed.some(
        (item) => box.x1 < item.x2 && box.x2 > item.x1 && box.y1 < item.y2 && box.y2 > item.y1,
      );
      if (overlap) continue;
      placed.push(box);
      anchors.push({ x, y });
      labels.push(
        `<text x="${(x + (anchor === 'start' ? 6 : -6)).toFixed(1)}" y="${(y + labelSize * 0.3).toFixed(1)}" text-anchor="${anchor}" font-size="${labelSize}" fill="#243447" paint-order="stroke" stroke="${MAP_PAPER}" stroke-width="${Math.max(3, labelSize * 0.22)}" stroke-linejoin="round">${esc(
          station.name,
        )}</text>`,
      );
      break;
    }
  }

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${
    focusLineId
      ? `Mapa da linha ${esc(model.lineNameById.get(focusLineId) ?? focusLineId)}`
      : 'Mapa da rede'
  }"><rect width="${width}" height="${height}" fill="${MAP_PAPER}" /><g>${pathMarkup.join('')}</g><g>${stationMarkup.join(
    '',
  )}</g><g font-family="Inter, Segoe UI, sans-serif">${labels.join('')}</g></svg>`;
}

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ESCAPES[character]);

export const int = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? '—'
    : Number(value).toLocaleString('en-GB');

export const compact = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value));
};

export const pct = (value) =>
  value === null || value === undefined ? '—' : `${Math.round(Number(value) * 100)}%`;

export const truncate = (value, max) => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export const londonDate = (iso, options = {}) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...options,
      }).format(new Date(iso))
    : '—';

export const londonTime = (iso, options = {}) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        ...options,
      }).format(new Date(iso))
    : '—';

export const londonDateTime = (iso) => `${londonDate(iso)}, ${londonTime(iso)}`;

const statusChip = (band) =>
  `<span class="chip ${esc(band)}">${esc(STATUS_LABELS[band] ?? band ?? '—')}</span>`;

const dot = (colorHex) =>
  `<span class="dot" style="background:${esc(colorHex ?? '#7A879C')}"></span>`;

const stat = (label, value, hint = '') => `
  <div class="stat">
    <p class="label">${esc(label)}</p>
    <p class="value">${esc(value)}</p>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
  </div>`;

const slideShell = ({ section, title, lede = '', body, page, total, generatedStamp }) => `
<section class="slide">
  <header class="s-head">
    <div class="brandline">
      <span class="brand-name">${esc(BRAND.name)}</span>
      <span class="brand-sep">·</span>
      <span class="brand-tag">${esc(BRAND.tagline)}</span>
    </div>
    <div class="subject">${esc(BRAND.subject)}</div>
  </header>
  <p class="kicker">${esc(section)}</p>
  <h2>${esc(title)}</h2>
  ${lede ? `<p class="lede">${lede}</p>` : ''}
  <div class="slide-body">${body}</div>
  <footer class="s-foot">
    <span>${esc(BRAND.name)} · ${esc(BRAND.tagline)}</span>
    <span>Not affiliated with Transport for London · ${esc(generatedStamp)}</span>
    <span class="page-no">${String(page).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
  </footer>
</section>`;

function cover(model) {
  return `
<section class="slide cover">
  <div class="cover-inner">
    <div class="cover-head">
      <div class="cover-rule"></div>
      <p class="wordmark">${esc(BRAND.wordmark)}</p>
      <p class="tagline">${esc(BRAND.tagline)}</p>
    </div>

    <div class="cover-body">
      <p class="cover-kicker">Data summary &amp; independent audit</p>
      <h1>London Digital Twin</h1>
      <p class="cover-sub">
        Operational digital twin of London's metro and rail network, built on Transport for London
        open data. Coverage, freshness, integrity and configuration review.
      </p>
    </div>

    <div class="cover-meta">
      <div>
        <span>Prepared</span>
        <strong>${esc(model.generatedStamp)}</strong>
      </div>
      <div>
        <span>Coverage</span>
        <strong>${esc(model.network.summary.linesTotal)} lines · ${esc(model.network.summary.stationsTotal)} stations · 6 datasets</strong>
      </div>
      <div>
        <span>Evidence</span>
        <strong>TfL Unified API · TfL Open Data</strong>
      </div>
    </div>

    <p class="cover-disclaimer">${esc(BRAND.disclaimer)}</p>
  </div>
</section>`;
}

function scope(model) {
  const body = `
    <div class="cols cols-2">
      <div class="card">
        <h3>In scope</h3>
        <ul class="tight">
          <li>Network inventory and topology: lines, stations, line–station links and geometries.</li>
          <li>Live line status, active disruptions and affected stations.</li>
          <li>Stored mobility datasets: footfall, annual counts, NUMBAT, link flows, train loadings and RODS.</li>
          <li>Freshness, source health, scheduled ingestion and retention.</li>
          <li>Referential integrity, public-read policies and API consistency.</li>
        </ul>
      </div>
      <div class="card">
        <h3>Out of scope</h3>
        <ul class="tight">
          <li>PTAL and any accessibility metric that is not explicitly published.</li>
          <li>Real-time occupancy or crowding — only historical profiles exist.</li>
          <li>Fares, ticketing and revenue.</li>
          <li>Ground-truth validation of TfL source values.</li>
        </ul>
      </div>
    </div>

    <div class="callout" style="margin-top:5mm">
      <strong>Method.</strong> Public API responses were sampled and row counts were read from the
      RLS-public tables. Freshness comes from the response metadata (<span class="mono">ageSeconds</span>,
      <span class="mono">fetchedAt</span>, <span class="mono">isStale</span>). Every figure in this deck
      carries the timestamp of the evidence that produced it; unavailable values are marked “—”, never estimated.
    </div>

    <table style="margin-top:5mm">
      <thead>
        <tr><th>Evidence base</th><th>Endpoint</th><th class="num">Sample</th></tr>
      </thead>
      <tbody>
        <tr><td>Live network status</td><td class="mono">/network/status</td><td class="num">${int(model.network.summary.linesTotal)} lines</td></tr>
        <tr><td>Hourly history (24 h)</td><td class="mono">/dashboard/history?hours=24</td><td class="num">${int(model.history.coverage.buckets)} buckets</td></tr>
        <tr><td>Topology and resilience</td><td class="mono">/analytics/network</td><td class="num">${int(model.analytics.graph.stations)} stations</td></tr>
        <tr><td>Dataset inventory</td><td class="mono">RLS-public tables (count)</td><td class="num">${int(model.counts.footfallRows)} footfall rows</td></tr>
        <tr><td>Source and job health</td><td class="mono">/data-health</td><td class="num">${int(model.health.sources.length)} sources</td></tr>
      </tbody>
    </table>`;
  return slideShell({
    section: '02 · Scope and method',
    title: 'What was audited, and how',
    lede: 'A read-only review of the public API and the stored datasets behind it. No writes, no synthetic data and no inferred accessibility.',
    body,
    page: 2,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function networkSlide(model) {
  const summary = model.network.summary;
  const modes = model.lineModes;
  const body = `
    <div class="stats cols-6">
      ${stat('Lines', int(summary.linesTotal), 'all with geometry')}
      ${stat('Stations', int(summary.stationsTotal), `${int(model.counts.stations)} stored`)}
      ${stat('Line–station links', int(model.counts.lineStations), 'referential join')}
      ${stat('Line geometries', int(model.counts.linePaths), 'inbound + outbound')}
      ${stat('Station entrances', int(model.counts.entrances), 'NaPTAN points')}
      ${stat('Modes', int(modes.length), 'all services')}
    </div>

    <div class="cols cols-2" style="margin-top:6mm">
      <div>
        <h3 class="block-title">Stored network inventory</h3>
        <table>
          <thead><tr><th>Element</th><th class="num">Records</th><th>Note</th></tr></thead>
          <tbody>
            <tr><td>Lines</td><td class="num">${int(model.counts.lines)}</td><td>${int(summary.stationsTotal)} stations in service</td></tr>
            <tr><td>Stations</td><td class="num">${int(model.counts.stations)}</td><td>canonical NaPTAN identifiers</td></tr>
            <tr><td>Line–station links</td><td class="num">${int(model.counts.lineStations)}</td><td>${int(model.counts.lines)} lines × station service</td></tr>
            <tr><td>Line paths</td><td class="num">${int(model.counts.linePaths)}</td><td>GeoJSON geometries</td></tr>
            <tr><td>Station entrances</td><td class="num">${int(model.counts.entrances)}</td><td>point locations</td></tr>
            <tr><td>Status snapshots</td><td class="num">${int(model.counts.statusSnapshots)}</td><td>line status history</td></tr>
            <tr><td>Disruption records</td><td class="num">${int(model.counts.disruptionsRows)}</td><td>${int(model.disruptions.active)} active now</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <h3 class="block-title">Lines by mode</h3>
        <table>
          <thead><tr><th>Mode</th><th class="num">Lines</th><th>Share</th></tr></thead>
          <tbody>
            ${modes
              .map(
                (row) => `<tr>
                  <td>${esc(row.label)}</td>
                  <td class="num">${int(row.lines)}</td>
                  <td class="num">${pct(row.share)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
        <div class="callout" style="margin-top:5mm">
          <strong>Integrity.</strong> ${int(model.counts.lineStations)} line–station links reference
          ${int(model.counts.stations)} distinct stations and ${int(model.counts.lines)} lines; no station
          is present without a line.
        </div>
      </div>
    </div>`;
  return slideShell({
    section: '03 · Network',
    title: 'Network at a glance',
    lede: 'A complete inventory of what the digital twin models, measured from the stored tables rather than from the UI.',
    body,
    page: 3,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function networkMapSlide(model) {
  const legend = model.mapData.lines
    .map(
      (line) =>
        `<li><span class="dot" style="background:${esc(line.colorHex ?? MAP_FALLBACK)}"></span>${esc(line.name)}</li>`,
    )
    .join('');
  const body = `
    <div class="map-layout">
      <div class="map-frame">
        ${renderMap(model, { width: 1000, height: 820, labelCount: 0 })}
      </div>
      <div>
        <h3 class="block-title">Lines (${int(model.mapData.lines.length)})</h3>
        <ul class="map-legend">${legend}</ul>
        <div class="callout" style="margin-top:4mm">
          Vector geometry from the stored TfL line paths; stations are canonical NaPTAN points.
          Labels are omitted at this scale for legibility — major hubs are named on the resilience
          slide.
        </div>
      </div>
    </div>`;
  return slideShell({
    section: '04 · Network map',
    title: 'The network as stored',
    lede: 'Every line geometry and station in the dataset, drawn from the same API response that feeds the CCO.',
    body,
    page: 4,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function principalLinesSlide(model) {
  const cards = model.boardings.main
    .map((row) => {
      const line = model.mapData.lines.find((item) => item.id === row.lineId);
      if (!line) return '';
      return `<figure class="mini-map">
        <div class="mini-canvas">
          ${renderMap(model, {
            focusLineId: line.id,
            width: 640,
            height: 480,
            labelCount: 1,
            labelSize: 30,
            contextWidth: 4,
            focusWidth: 7,
            stationRadius: 5,
            interchangeRadius: 8,
          })}
        </div>
        <figcaption>
          <span class="dot" style="background:${esc(line.colorHex ?? MAP_FALLBACK)}"></span>
          <span class="mini-name">${esc(line.name)}</span>
          <span class="mini-meta">${int(line.stationCount)} stations · ${compact(row.latestBoardings)} boardings</span>
        </figcaption>
      </figure>`;
    })
    .join('');
  const body = `
    <div class="mini-grid">${cards}</div>
    <p class="table-note">
      The six lines with the highest ${model.boardings.latestYear ?? '—'} boardings. The rest of the
      network remains in light grey for geographic context.
    </p>`;
  return slideShell({
    section: '05 · Principal lines',
    title: 'Where demand concentrates',
    lede: 'One map per principal line, ranked by annual boardings and drawn against the full network.',
    body,
    page: 5,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function liveOperations(model) {
  const summary = model.network.summary;
  const fresh = model.freshness;
  const body = `
    <div class="stats cols-6">
      ${stat('Good service', int(summary.normal), `${int(summary.linesTotal)} lines tracked`)}
      ${stat('Attention', int(summary.attention), 'minor impact')}
      ${stat('Severe', int(summary.severe), 'significant impact')}
      ${stat('Closure', int(summary.closure), 'line closed')}
      ${stat('Active alerts', int(summary.disruptionsActive), 'current snapshot')}
      ${stat('Stations affected', int(summary.stationsAffected), 'derived from alerts')}
    </div>

    <div class="cols cols-2" style="margin-top:6mm">
      <div class="card">
        <h3>Data freshness</h3>
        <p class="hero">${esc(fresh.ageLabel)}</p>
        <table class="plain">
          <tbody>
            <tr><td>Status captured</td><td class="num">${esc(fresh.capturedLabel)}</td></tr>
            <tr><td>Fetched at</td><td class="num">${esc(fresh.fetchedLabel)}</td></tr>
            <tr><td>Source state</td><td class="num">${esc(fresh.sourceState)}</td></tr>
            <tr><td>Cache TTL expired</td><td class="num">${fresh.isStale ? 'Yes' : 'No'}</td></tr>
          </tbody>
        </table>
        <p class="table-note">
          Line status is synced every 2 minutes; the API cache TTL is 60 seconds, so a snapshot can be
          flagged as stale while still current.
        </p>
      </div>
      <div>
        <h3 class="block-title">Most affected lines</h3>
        <table>
          <thead><tr><th>Line</th><th>Status</th><th class="num">Alerts</th></tr></thead>
          <tbody>
            ${model.dashboard.topLines
              .map(
                (row) => `<tr>
                  <td>${esc(row.lineName ?? row.lineId)}</td>
                  <td>${model.lineStatusById.get(row.lineId) ?? statusChip('unknown')}</td>
                  <td class="num">${int(row.disruptionCount)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
        <div class="callout" style="margin-top:5mm">
          ${int(summary.stationsAffected)} stations are affected by an active disruption at the time of
          this report. Status is refreshed every 2 minutes by the scheduled sync.
        </div>
      </div>
    </div>`;
  return slideShell({
    section: '06 · Live operations',
    title: 'Operating state at generation time',
    lede: 'Line status and disruption counts are a point-in-time snapshot; the age of that snapshot is shown explicitly.',
    body,
    page: 6,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function lineTable(model) {
  const rows = model.network.lines
    .map(
      (line) => `<tr>
        <td>${dot(line.colorHex)}${esc(line.name)}</td>
        <td>${esc(MODE_LABELS[line.mode] ?? line.mode)}</td>
        <td>${statusChip(line.status?.band ?? 'unknown')}</td>
        <td class="num">${int(line.disruptionCount)}</td>
        <td class="num">${int(line.stationCount)}</td>
        <td class="num">${esc(londonTime(line.status?.capturedAt ?? line.updatedAt))}</td>
      </tr>`,
    )
    .join('');
  const body = `
    <table class="lines">
      <thead>
        <tr><th>Line</th><th>Mode</th><th>Status</th><th class="num">Alerts</th><th class="num">Stations</th><th class="num">Updated</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="table-note">
      Status bands are derived from TfL severity levels. “Stations” is the service count per line, not a
      unique count — interchanges appear under more than one line.
    </p>`;
  return slideShell({
    section: '07 · Line status',
    title: 'Line-by-line status',
    lede: 'All 20 lines, with the status band and alert count recorded in the current snapshot.',
    body,
    page: 7,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function disruptions(model) {
  const bands = model.disruptionBands;
  const rows = model.disruptions.top
    .map(
      (alert) => `<tr>
        <td>${esc(model.lineNameById.get(alert.lineId) ?? alert.lineId ?? 'Network')}</td>
        <td>${statusChip(alert.band)}</td>
        <td>${esc(alert.categoryDescription ?? alert.category ?? '—')}</td>
        <td>${esc(truncate(alert.description ?? alert.summary ?? 'No description', 96))}</td>
        <td class="num">${esc(londonTime(alert.lastSeenAt))}</td>
      </tr>`,
    )
    .join('');
  const body = `
    <div class="stats cols-6">
      ${stat('Active alerts', int(model.disruptions.active), `${int(model.disruptions.unique)} unique`)}
      ${stat('Severe', int(bands.severe ?? 0), 'significant impact')}
      ${stat('Attention', int(bands.attention ?? 0), 'minor impact')}
      ${stat('Closure', int(bands.closure ?? 0), 'line closed')}
      ${stat('Unknown', int(bands.unknown ?? 0), 'no severity reported')}
      ${stat('Recorded', int(model.counts.disruptionsRows), 'since first sync')}
    </div>

    <table class="disruptions" style="margin-top:6mm">
      <thead>
        <tr><th>Line</th><th>Band</th><th>Category</th><th>Description</th><th class="num">Last seen</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="table-note">
      Showing the highest-severity unique active alerts; duplicate records for the same alert are
      collapsed, and descriptions are truncated for layout.
    </p>`;
  return slideShell({
    section: '08 · Disruptions',
    title: 'Active disruptions',
    lede: 'What is currently interrupting service, ordered by severity and then by recency.',
    body,
    page: 8,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function history(model) {
  const coverage = model.history.coverage;
  const rows = model.history.recent
    .map(
      (point) => `<tr>
        <td class="mono">${esc(londonTime(point.bucketStart))}</td>
        <td class="num">${int(point.samples)}</td>
        <td class="num">${int(point.normal)}</td>
        <td class="num">${int(point.attention)}</td>
        <td class="num">${int(point.severe)}</td>
        <td class="num">${int(point.closure)}</td>
        <td class="num">${int(point.disruptionsActive)}</td>
      </tr>`,
    )
    .join('');
  const topLines = model.history.topDisrupted
    .map(
      (row) => `<tr>
        <td>${esc(row.lineName ?? row.lineId)}</td>
        <td class="num">${int(row.disruptedBuckets)}/${int(row.totalBuckets)}</td>
        <td class="num">${pct(row.disruptionRate)}</td>
      </tr>`,
    )
    .join('');
  const body = `
    <div class="stats cols-4">
      ${stat('Hourly buckets', int(coverage.buckets), 'last 24 hours')}
      ${stat('Samples', int(coverage.samples), '≈1 every 2 minutes')}
      ${stat('Coverage from', londonDate(coverage.firstBucket), londonTime(coverage.firstBucket))}
      ${stat('Coverage to', londonDate(coverage.lastBucket), londonTime(coverage.lastBucket))}
    </div>

    <div class="cols cols-history" style="margin-top:6mm">
      <div>
        <h3 class="block-title">Recent hourly snapshots</h3>
        <table>
          <thead>
            <tr><th>Hour</th><th class="num">Samples</th><th class="num">Good</th><th class="num">Attention</th><th class="num">Severe</th><th class="num">Closure</th><th class="num">Alerts</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div>
        <h3 class="block-title">Most disrupted lines</h3>
        <table>
          <thead><tr><th>Line</th><th class="num">Buckets</th><th class="num">Rate</th></tr></thead>
          <tbody>${topLines}</tbody>
        </table>
        <div class="callout" style="margin-top:5mm">
          Disruption rate is the share of observed hourly buckets in which the line was not in
          “Good service”. It measures persistence, not severity.
        </div>
      </div>
    </div>`;
  return slideShell({
    section: '09 · History',
    title: 'The last 24 hours',
    lede: 'Hourly aggregation of every captured status snapshot, with the disruption rate per line.',
    body,
    page: 9,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function mobility(model) {
  const footfall = model.footfall;
  const annual = model.annual;
  const topFootfall = footfall.topStations
    .slice(0, 5)
    .map(
      (row) => `<tr>
        <td>${esc(row.name)}</td>
        <td class="num">${compact(row.entries)}</td>
        <td class="num">${compact(row.exits)}</td>
        <td class="num">${compact(row.total)}</td>
      </tr>`,
    )
    .join('');
  const topAnnual = annual.topStations
    .slice(0, 3)
    .map(
      (row) => `<tr>
        <td>${esc(row.name)}</td>
        <td class="num">${compact(row.annualEntriesExits)}</td>
      </tr>`,
    )
    .join('');
  const body = `
    <div class="stats cols-6">
      ${stat('Footfall records', int(model.counts.footfallRows), 'daily, per station')}
      ${stat('Stations with data', int(footfall.stationsWithData), 'in the 30-day window')}
      ${stat('Entries', compact(footfall.totalEntries), `${londonDate(footfall.firstDate)}–${londonDate(footfall.lastDate)}`)}
      ${stat('Exits', compact(footfall.totalExits), 'same window')}
      ${stat('Latest footfall', londonDate(footfall.latestDate, { year: undefined }), `2026 · ${model.footfallLagDays ?? '—'} days before this report`)}
      ${stat('Annual counts 2025', int(annual.stationCount), 'stations with data')}
    </div>

    <div class="cols cols-2" style="margin-top:6mm">
      <div>
        <h3 class="block-title">Footfall — top stations, 30-day window</h3>
        <table>
          <thead><tr><th>Station</th><th class="num">Entries</th><th class="num">Exits</th><th class="num">Total</th></tr></thead>
          <tbody>${topFootfall}</tbody>
        </table>
        <p class="table-note">
          Window ${esc(londonDate(footfall.firstDate))} to ${esc(londonDate(footfall.lastDate))}.
          Footfall is historical daily entries and exits, not live occupancy.
        </p>
      </div>
      <div>
        <h3 class="block-title">Annual entries and exits — 2025</h3>
        <table>
          <thead><tr><th>Station</th><th class="num">Annual</th></tr></thead>
          <tbody>${topAnnual}</tbody>
        </table>
        <div class="callout" style="margin-top:5mm">
          <strong>${compact(annual.totalAnnualEntriesExits)}</strong> annual entries and exits across
          ${int(annual.stationCount)} stations. The dataset is published annually; it is not a live demand signal.
        </div>
      </div>
    </div>`;
  return slideShell({
    section: '10 · Mobility',
    title: 'Footfall and annual demand',
    lede: 'Two published datasets describe how the network is used; both are historical and carry an explicit vintage.',
    body,
    page: 10,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function capacity(model) {
  const inventory = [
    [
      'Footfall 2025–2026',
      'Daily',
      model.counts.footfallRows,
      `Latest ${londonDate(model.footfall.latestDate)}`,
    ],
    ['Annual station counts', 'Annual', model.counts.annualRows, '2025'],
    [
      'NUMBAT boardings',
      'Annual',
      model.counts.numbatRows,
      model.boardings.years.length
        ? `${model.boardings.years[0]}–${model.boardings.years.at(-1)}`
        : '—',
    ],
    ['Station link flows', 'Interval', model.counts.linkFlowRows, '2017'],
    ['Train loadings', 'Interval', model.counts.trainLoadingRows, '2017'],
    ['RODS profiles', 'Interval', model.counts.rodsRows, '2017'],
  ]
    .map(
      ([dataset, granularity, rows, vintage]) => `<tr>
        <td>${esc(dataset)}</td>
        <td>${esc(granularity)}</td>
        <td class="num">${int(rows)}</td>
        <td>${esc(vintage)}</td>
      </tr>`,
    )
    .join('');
  const topBoardings = model.boardings.top
    .map(
      (row) => `<tr>
        <td>${esc(row.lineName)}</td>
        <td class="num">${compact(row.latestBoardings)}</td>
      </tr>`,
    )
    .join('');
  const body = `
    <div class="stats cols-4">
      ${stat('Stored records', compact(model.counts.totalRows), 'six historical datasets')}
      ${stat('NUMBAT years', int(model.boardings.years.length), model.boardings.years.length ? `${model.boardings.years[0]}–${model.boardings.years.at(-1)}` : '—')}
      ${stat('2025 boardings', compact(model.boardings.totalLatest), `${int(model.boardings.linesCount)} lines`)}
      ${stat('Historical datasets', '4 of 6', 'link flows, loadings, RODS, crowding')}
    </div>

    <div class="cols cols-capacity" style="margin-top:6mm">
      <div>
        <h3 class="block-title">Dataset inventory</h3>
        <table>
          <thead><tr><th>Dataset</th><th>Granularity</th><th class="num">Records</th><th>Vintage</th></tr></thead>
          <tbody>${inventory}</tbody>
        </table>
        <p class="table-note">
          Counts are exact row counts read at generation time. “Vintage” is the source year, not the
          ingestion date.
        </p>
      </div>
      <div>
        <h3 class="block-title">Top lines by 2025 boardings</h3>
        <table>
          <thead><tr><th>Line</th><th class="num">Boardings</th></tr></thead>
          <tbody>${topBoardings}</tbody>
        </table>
        <div class="callout" style="margin-top:5mm">
          Four of the six datasets describe 2017 conditions and are presented next to live status.
          Their vintage must stay visible wherever they are shown.
        </div>
      </div>
    </div>`;
  return slideShell({
    section: '11 · Capacity and demand',
    title: 'Capacity, loadings and boardings',
    lede: 'What the platform stores about demand and crowding, with the vintage of each source stated explicitly.',
    body,
    page: 11,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function topology(model) {
  const graph = model.analytics.graph;
  const accessibility = model.analytics.accessibility;
  const critical = model.analytics.criticalStations
    .slice(0, 6)
    .map(
      (station) => `<tr>
        <td>${esc(station.name)}</td>
        <td class="num">${int(station.degree)}</td>
        <td>${station.articulation ? 'Yes' : 'No'}</td>
      </tr>`,
    )
    .join('');
  const impact = model.analytics.lineImpact
    .slice(0, 5)
    .map(
      (row) => `<tr>
        <td>${esc(row.lineName)}</td>
        <td class="num">${int(row.stationsServed)}</td>
        <td class="num">${int(row.isolatedStations)}</td>
        <td class="num">${int(row.stationsOutsideLargest)}</td>
      </tr>`,
    )
    .join('');
  const body = `
    <div class="stats cols-6">
      ${stat('Undirected links', int(graph.undirectedLinks), 'station pairs')}
      ${stat('Transfer links', int(graph.transferLinks), 'within hubs')}
      ${stat('Components', int(graph.components), 'baseline graph')}
      ${stat('Largest component', int(graph.largestComponent), 'of ' + int(graph.stations) + ' stations')}
      ${stat('Isolated stations', int(graph.isolatedStations), 'no link')}
      ${stat('Interchanges', int(accessibility.interchanges), 'multi-line stations')}
    </div>

    <div class="cols cols-2" style="margin-top:6mm">
      <div>
        <h3 class="block-title">Critical stations</h3>
        <table>
          <thead><tr><th>Station</th><th class="num">Degree</th><th>Articulation</th></tr></thead>
          <tbody>${critical}</tbody>
        </table>
        <p class="table-note">
          Articulation points disconnect the graph when removed. Degree counts distinct station neighbours.
        </p>
      </div>
      <div>
        <h3 class="block-title">Line-failure impact</h3>
        <table>
          <thead><tr><th>Line</th><th class="num">Stations</th><th class="num">Isolated</th><th class="num">Outside largest</th></tr></thead>
          <tbody>${impact}</tbody>
        </table>
      </div>
    </div>

    <div class="callout warn" style="margin-top:5mm">
      <strong>Accessibility gap.</strong> ${int(accessibility.withLifts)} stations report lifts,
      ${int(accessibility.withToilets)} toilets and ${int(accessibility.withWifi)} WiFi, but
      <strong>${int(accessibility.stepFreeKnown)} of ${int(accessibility.totalStations)}</strong>
      stations have a confirmed step-free value. The model must not infer step-free access from lifts.
    </div>`;
  return slideShell({
    section: '12 · Resilience',
    title: 'Topology and single points of failure',
    lede: 'Graph measurements computed from the stored network, not from a routing engine.',
    body,
    page: 12,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function health(model) {
  const sources = model.health.sources
    .map(
      (source) => `<tr>
        <td>${esc(source.name)}</td>
        <td>${sourceStatusChip(source.status)}</td>
        <td class="num">${source.lastSuccessAt ? esc(londonDate(source.lastSuccessAt)) : '—'}</td>
      </tr>`,
    )
    .join('');
  const jobs = model.health.jobs
    .slice(0, 7)
    .map(
      (job) => `<tr>
        <td>${esc(job.jobName)}</td>
        <td>${job.status === 'success' ? '<span class="chip normal">Success</span>' : `<span class="chip attention">${esc(job.status)}</span>`}</td>
        <td class="num">${job.durationMs === null ? '—' : `${int(job.durationMs)} ms`}</td>
        <td class="num">${int(job.recordsUpserted)}</td>
      </tr>`,
    )
    .join('');
  const body = `
    <div class="stats cols-5">
      ${stat('Sources', int(model.health.sources.length), 'registered')}
      ${stat('OK', int(model.sourceSummary.ok), 'last attempt succeeded')}
      ${stat('Not synced', int(model.sourceSummary.notSynced), 'no ingestion yet')}
      ${stat('Errors', int(model.sourceSummary.error), 'last attempt failed')}
      ${stat('Recent jobs', int(model.health.jobs.length), `${int(model.jobSummary.success)} success`)}
    </div>

    <div class="cols cols-health" style="margin-top:6mm">
      <div>
        <h3 class="block-title">Registered sources</h3>
        <table>
          <thead><tr><th>Source</th><th>Status</th><th class="num">Last success</th></tr></thead>
          <tbody>${sources}</tbody>
        </table>
      </div>
      <div>
        <h3 class="block-title">Recent sync jobs</h3>
        <table>
          <thead><tr><th>Job</th><th>Status</th><th class="num">Duration</th><th class="num">Upserted</th></tr></thead>
          <tbody>${jobs}</tbody>
        </table>
        <h3 class="block-title" style="margin-top:5mm">Retention</h3>
        <table class="plain">
          <tbody>
            <tr><td>Status snapshots</td><td class="num">${int(model.health.retention.statusSnapshotsDays)} days</td></tr>
            <tr><td>Sync jobs</td><td class="num">${int(model.health.retention.syncJobsDays)} days</td></tr>
            <tr><td>Arrival predictions</td><td class="num">${int(model.health.retention.arrivalPredictionsHours)} hours</td></tr>
            <tr><td>Stale cache</td><td class="num">${int(model.health.retention.cacheStaleHours)} hours</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
  return slideShell({
    section: '13 · Data health',
    title: 'Sources, jobs and retention',
    lede: 'Operational evidence that the data keeps arriving, and what happens when it does not.',
    body,
    page: 13,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function architecture(model) {
  const body = `
    <div class="cols cols-2">
      <div class="card">
        <h3>Frontend</h3>
        <ul class="tight">
          <li>React 18, Vite, TypeScript, Tailwind and MapLibre GL JS.</li>
          <li>Static build on GitHub Pages under <span class="mono">/london-subway/</span>.</li>
          <li>SPA fallback through <span class="mono">404.html</span>; assets built from <span class="mono">BASE_URL</span>.</li>
          <li>Consumes only the project API — never TfL directly.</li>
        </ul>
      </div>
      <div class="card">
        <h3>API</h3>
        <ul class="tight">
          <li>Supabase Edge Function (Deno + Hono), shared <span class="mono">packages/api-core</span>.</li>
          <li>Read-only public endpoints with envelope metadata on every response.</li>
          <li>Exact-match CORS allowlist, case-insensitive host comparison.</li>
          <li>Cache TTLs per endpoint; stale data is labelled, not hidden.</li>
        </ul>
      </div>
      <div class="card">
        <h3>Data</h3>
        <ul class="tight">
          <li>PostgreSQL with PostGIS; 12 versioned migrations.</li>
          <li>Row-level security: public read on data tables, no public writes.</li>
          <li>Realtime channel for status changes; 60 s client polling as fallback.</li>
          <li>${int(model.counts.totalRows)} stored records across six datasets.</li>
        </ul>
      </div>
      <div class="card">
        <h3>Automation</h3>
        <ul class="tight">
          <li>pg_cron: status every 2 minutes, disruptions every 5 minutes.</li>
          <li>Reference refresh at 03:15; cleanup and retention at 03:45.</li>
          <li>Every run writes a job record with duration and record counts.</li>
          <li>No manual sync button by design; the UI only invalidates queries.</li>
        </ul>
      </div>
    </div>

    <div class="callout" style="margin-top:6mm">
      <strong>Release path.</strong> Frontend: <span class="mono">push main → GitHub Actions → Pages</span>.
      API: <span class="mono">npm run supabase:deploy -- --no-verify-jwt</span>. The two deploy
      independently; a frontend push does not redeploy the Edge Function.
    </div>
    <p class="table-note">
      Source: repository configuration, migrations and production responses sampled for this report.
    </p>`;
  return slideShell({
    section: '14 · Architecture',
    title: 'How the platform is assembled',
    lede: 'A compact view of the stack, the deployment boundaries and the automation that keeps data moving.',
    body,
    page: 14,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function findings(model) {
  const column = (tone, title, items) => `
    <div class="find-col ${tone}">
      <h3>${esc(title)}</h3>
      ${items
        .map(
          (item) => `
        <div class="find">
          <p class="find-title">${esc(item.title)}</p>
          <p class="find-body">${esc(item.body)}</p>
          <p class="find-evidence">Evidence: ${esc(item.evidence)}</p>
        </div>`,
        )
        .join('')}
    </div>`;
  const body = `
    <div class="cols cols-3 findings">
      ${column('strength', 'Strengths', model.findings.strengths)}
      ${column('risk', 'Risks', model.findings.risks)}
      ${column('recommendation', 'Recommendations', model.findings.recommendations)}
    </div>
    <p class="table-note">
      Findings are limited to what this read-only review observed. Configuration statements are marked
      as such; they are not inferred from API responses.
    </p>`;
  return slideShell({
    section: '15 · Findings',
    title: 'Audit findings',
    lede: 'Three strengths, three risks and three actions, each tied to the evidence that produced it.',
    body,
    page: 15,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

function sources(model) {
  const rows = model.health.sources
    .map(
      (source) => `<tr>
        <td>${esc(source.name)}</td>
        <td>${esc(source.publisher)}</td>
        <td>${esc(licenceLabel(source.license))}</td>
        <td class="num">${source.lastSuccessAt ? esc(londonDate(source.lastSuccessAt)) : '—'}</td>
      </tr>`,
    )
    .join('');
  const body = `
    <table class="sources">
      <thead><tr><th>Source</th><th>Publisher</th><th>Licence</th><th class="num">Last success</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="cols cols-2" style="margin-top:5mm">
      <div class="card">
        <h3>Report provenance</h3>
        <table class="plain">
          <tbody>
            <tr><td>Generated</td><td class="num">${esc(model.generatedStamp)}</td></tr>
            <tr><td>API base</td><td class="num mono">${esc(model.apiBase)}</td></tr>
            <tr><td>Counts read at</td><td class="num">${esc(model.countsStamp)}</td></tr>
            <tr><td>Slides</td><td class="num">${int(model.totalSlides)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="disclaimer">
        <p class="disclaimer-title">Independence</p>
        <p>${esc(BRAND.disclaimer)}</p>
        <p>
          Data is supplied by Transport for London under the Open Government Licence v3.0, and borough
          boundaries by the Office for National Statistics under OGL. Historical datasets retain their
          source vintage. No guarantee of real-time accuracy is made beyond the timestamps shown.
        </p>
        <p class="prepared">Prepared by ${esc(BRAND.name)} — ${esc(BRAND.tagline)}.</p>
      </div>
    </div>`;
  return slideShell({
    section: '16 · Sources',
    title: 'Sources, licences and disclaimer',
    lede: 'Every dataset used in this report, its publisher and the licence it is published under.',
    body,
    page: 16,
    total: model.totalSlides,
    generatedStamp: model.generatedStamp,
  });
}

const CSS = `
  @page { size: 297mm 210mm; margin: 0; }

  * { box-sizing: border-box; }

  :root {
    --navy-950: #0a1523;
    --navy-900: #0e1b2c;
    --navy-700: #1b3049;
    --brass-500: #c9a227;
    --brass-300: #e3c766;
    --ink: #14202e;
    --muted: #5a6b7c;
    --soft: #8494a6;
    --rule: #d8dee6;
    --paper: #ffffff;
    --tint: #f5f7fa;
    --ok: #2e7d5b;
    --attention: #b07a12;
    --severe: #b3261e;
    --closure: #7a1f1f;
    --unknown: #6b7280;
  }

  html, body { margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    font-size: 10.2pt;
    line-height: 1.45;
    color: var(--ink);
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-feature-settings: 'cv02' 1, 'cv03' 1, 'cv04' 1;
  }

  .slide {
    position: relative;
    width: 297mm;
    height: 210mm;
    padding: 13mm 16mm 13mm;
    overflow: hidden;
    background: #fff;
    break-after: page;
    page-break-after: always;
  }

  .slide:last-child { break-after: auto; page-break-after: auto; }

  @media screen {
    body {
      background: #e8ecf1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 12px 0;
    }
    .slide { box-shadow: 0 10px 30px rgba(10, 21, 35, 0.18); }
  }

  @media print {
    body { background: #fff; display: block; padding: 0; }
    .slide { box-shadow: none; }
  }

  /* Cover */
  .cover { padding: 0; color: #fff; background: var(--navy-950); }
  .cover-inner {
    position: absolute;
    inset: 0;
    padding: 20mm 22mm 16mm;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(120mm 80mm at 88% 12%, rgba(201, 162, 39, 0.14), transparent 70%),
      linear-gradient(180deg, #0a1523 0%, #0e1b2c 100%);
  }
  .cover-rule { width: 32mm; height: 1.1mm; background: var(--brass-500); margin-bottom: 6mm; }
  .wordmark { margin: 0; font-size: 16.5pt; font-weight: 700; letter-spacing: 0.3em; }
  .tagline {
    margin: 2mm 0 0;
    font-size: 8.6pt;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--brass-300);
  }
  .cover-body { margin-top: auto; margin-bottom: auto; }
  .cover-kicker {
    margin: 0;
    font-size: 7.9pt;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--brass-500);
    font-weight: 600;
  }
  .cover h1 {
    margin: 3mm 0 0;
    font-size: 42pt;
    line-height: 1.05;
    letter-spacing: -0.02em;
    font-weight: 700;
    color: #fff;
  }
  .cover-sub {
    margin: 4mm 0 0;
    max-width: 176mm;
    font-size: 11.4pt;
    line-height: 1.5;
    color: #b9c5d4;
  }
  .cover-meta {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6mm;
    border-top: 0.25mm solid rgba(255, 255, 255, 0.18);
    padding-top: 5mm;
  }
  .cover-meta span {
    display: block;
    font-size: 6.8pt;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7f90a4;
  }
  .cover-meta strong {
    display: block;
    margin-top: 1.2mm;
    font-size: 9.1pt;
    font-weight: 500;
    color: #e9eef4;
  }
  .cover-disclaimer { margin: 5mm 0 0; font-size: 6.8pt; color: #6c7c90; }

  /* Slide chrome */
  .s-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6mm;
    padding-bottom: 2.6mm;
    border-bottom: 0.55mm solid var(--brass-500);
    font-size: 7pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--soft);
  }
  .brandline { display: flex; align-items: baseline; gap: 1.6mm; }
  .brand-name { font-weight: 700; letter-spacing: 0.2em; color: var(--navy-900); }
  .brand-tag { letter-spacing: 0.14em; }
  .brand-sep { color: var(--brass-500); }
  .subject { font-weight: 600; letter-spacing: 0.16em; color: var(--navy-700); }

  .kicker {
    margin: 5mm 0 1mm;
    font-size: 7.3pt;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass-500);
  }

  h2 {
    margin: 0 0 2mm;
    font-size: 21pt;
    line-height: 1.12;
    letter-spacing: -0.015em;
    font-weight: 700;
    color: var(--navy-950);
  }

  h3 { margin: 0 0 2mm; font-size: 9.5pt; font-weight: 600; color: var(--navy-900); }
  .block-title {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 1.6mm;
  }

  .lede { margin: 0 0 4mm; max-width: 236mm; font-size: 9.2pt; color: var(--muted); }

  .s-foot {
    position: absolute;
    left: 16mm;
    right: 16mm;
    bottom: 7mm;
    display: flex;
    justify-content: space-between;
    gap: 4mm;
    border-top: 0.2mm solid var(--rule);
    padding-top: 2mm;
    font-size: 6.7pt;
    letter-spacing: 0.04em;
    color: var(--soft);
  }
  .page-no { font-weight: 600; color: var(--navy-700); letter-spacing: 0.1em; }

  /* Stats */
  .stats { display: grid; gap: 2.6mm; }
  .stats.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .stats.cols-5 { grid-template-columns: repeat(5, 1fr); }
  .stats.cols-6 { grid-template-columns: repeat(6, 1fr); }
  .stat {
    border: 0.2mm solid var(--rule);
    border-top: 0.75mm solid var(--brass-500);
    padding: 2.8mm 3mm 2.6mm;
    background: #fff;
  }
  .stat .label {
    margin: 0;
    font-size: 6.6pt;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }
  .stat .value {
    margin: 1mm 0 0;
    font-size: 18pt;
    line-height: 1.1;
    font-weight: 700;
    color: var(--navy-950);
    font-variant-numeric: tabular-nums;
  }
  .stat .hint { margin: 0.9mm 0 0; font-size: 6.5pt; color: var(--soft); }

  /* Layout */
  .cols { display: grid; gap: 6mm; }
  .cols-2 { grid-template-columns: 1fr 1fr; }
  .cols-3 { grid-template-columns: repeat(3, 1fr); }
  .cols-history { grid-template-columns: 1.55fr 1fr; }
  .cols-capacity { grid-template-columns: 1.45fr 1fr; }
  .cols-health { grid-template-columns: 1.35fr 1fr; }

  /* Maps */
  .map-layout {
    display: grid;
    grid-template-columns: 150mm 1fr;
    gap: 6mm;
    align-items: start;
  }
  .map-frame {
    border: 0.2mm solid var(--rule);
    background: #fff;
    padding: 2mm;
  }
  .map-frame svg { display: block; width: 100%; height: 112mm; }
  .map-legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1.1mm;
    font-size: 7pt;
    color: #243447;
  }
  .map-legend li { display: flex; align-items: center; }

  .mini-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4mm;
  }
  .mini-map {
    margin: 0;
    border: 0.2mm solid var(--rule);
    background: #fff;
    break-inside: avoid;
  }
  .mini-canvas { padding: 1.5mm; }
  .mini-canvas svg { display: block; width: 100%; height: 39mm; }
  .mini-map figcaption {
    display: flex;
    align-items: center;
    gap: 1.4mm;
    padding: 1.8mm 2.2mm;
    border-top: 0.2mm solid var(--rule);
    font-size: 7pt;
  }
  .mini-name { font-weight: 600; }
  .mini-meta {
    margin-left: auto;
    font-size: 5.9pt;
    color: var(--muted);
    white-space: nowrap;
  }

  .card {
    border: 0.2mm solid var(--rule);
    padding: 4mm;
    background: #fff;
  }

  .callout {
    border-left: 0.9mm solid var(--brass-500);
    background: var(--tint);
    padding: 3mm 4mm;
    font-size: 8.4pt;
    color: #243447;
  }
  .callout.warn { border-left-color: var(--severe); }
  .callout strong { color: var(--navy-950); }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 8.1pt; }
  th {
    text-align: left;
    padding: 1.5mm 1.8mm;
    font-size: 6.6pt;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--tint);
    border-bottom: 0.3mm solid var(--navy-900);
  }
  td {
    padding: 1.25mm 1.8mm;
    border-bottom: 0.2mm solid var(--rule);
    vertical-align: top;
    color: #243447;
  }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-family: 'Cascadia Mono', 'SFMono-Regular', Consolas, monospace; font-size: 0.92em; }

  table.plain td { border-bottom: 0.2mm solid var(--rule); }
  table.plain td:first-child { color: var(--muted); }

  /* 20 linhas cabem à justa: padding ligeiramente mais compacto. */
  .lines { font-size: 7.9pt; }
  .lines th { padding: 1.05mm 1.8mm; }
  .lines td { padding: 0.85mm 1.8mm; }

  .table-note { margin: 2mm 0 0; font-size: 7.1pt; color: var(--soft); }

  /* Chips and dots */
  .chip {
    display: inline-block;
    padding: 0.6mm 1.7mm;
    border-radius: 0.8mm;
    font-size: 6.3pt;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .chip.normal { color: #1e5b42; background: #e4f1ea; }
  .chip.attention { color: #7a5306; background: #f8ecd2; }
  .chip.severe { color: #8c1d17; background: #f7dedb; }
  .chip.closure { color: #5c1414; background: #efd3d3; }
  .chip.unknown { color: #4b5563; background: #eceff3; }

  .dot {
    display: inline-block;
    width: 2.1mm;
    height: 2.1mm;
    border-radius: 50%;
    margin-right: 1.6mm;
    vertical-align: middle;
  }

  .hero {
    margin: 0 0 2mm;
    font-size: 28pt;
    line-height: 1;
    font-weight: 700;
    color: var(--navy-950);
    font-variant-numeric: tabular-nums;
  }

  ul.tight { margin: 0; padding-left: 4mm; }
  ul.tight li { margin: 1.1mm 0; font-size: 8.5pt; line-height: 1.4; }

  /* Findings */
  .find-col { border-top: 0.9mm solid var(--rule); padding-top: 3mm; }
  .find-col.strength { border-top-color: var(--ok); }
  .find-col.risk { border-top-color: var(--severe); }
  .find-col.recommendation { border-top-color: var(--brass-500); }
  .find-col h3 { font-size: 7.6pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
  .find { padding: 2.8mm 0; border-bottom: 0.2mm solid var(--rule); }
  .find:last-child { border-bottom: 0; }
  .find-title { margin: 0; font-size: 8.9pt; font-weight: 700; color: var(--navy-950); line-height: 1.3; }
  .find-body { margin: 1mm 0 0; font-size: 7.8pt; line-height: 1.42; color: #2c3c4e; }
  .find-evidence {
    margin: 1.4mm 0 0;
    font-size: 6.5pt;
    line-height: 1.4;
    letter-spacing: 0.02em;
    color: var(--soft);
  }

  /* Sources */
  .sources td, .sources th { font-size: 7.3pt; }
  .disclaimer { font-size: 7.2pt; line-height: 1.45; color: var(--muted); }
  .disclaimer p { margin: 0 0 1.6mm; }
  .disclaimer-title {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--severe);
  }
  .disclaimer .prepared { color: var(--navy-700); font-weight: 600; }
`;

export function renderDeck(model) {
  const slides = [
    cover(model),
    scope(model),
    networkSlide(model),
    networkMapSlide(model),
    principalLinesSlide(model),
    liveOperations(model),
    lineTable(model),
    disruptions(model),
    history(model),
    mobility(model),
    capacity(model),
    topology(model),
    health(model),
    architecture(model),
    findings(model),
    sources(model),
  ];

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(BRAND.name)} — London Digital Twin · Data Summary</title>
  <meta name="author" content="${esc(BRAND.name)}" />
  <meta name="description" content="Data summary and independent audit of the London Digital Twin, prepared by ${esc(BRAND.name)} — ${esc(BRAND.tagline)}." />
  <style>
    ${model.fontsCss}
    ${CSS}
  </style>
</head>
<body>
${slides.join('\n')}
</body>
</html>
`;
}
