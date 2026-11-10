import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  chunk,
  finishJob,
  markSource,
  requiredEnv,
  restFactory,
  startJob,
} from '../lib/supabase.ts';

export const NUMBAT_URL =
  'https://crowding.data.tfl.gov.uk/NUMBAT/NBT16-25_AnnualisedBoarders_Outputs.xlsx';
export const NUMBAT_DATASET = 'tfl-numbat';
const NUMBAT_FILE = path.join(os.tmpdir(), 'ldt-numbat-2016-2025.xlsx');

const LINE_ID_BY_CODE: Readonly<Record<string, string>> = {
  BAK: 'bakerloo',
  CEN: 'central',
  DIS: 'district',
  // HAM representa H&C + Circle em conjunto; não é atribuído a uma linha só.
  JUB: 'jubilee',
  MET: 'metropolitan',
  NOR: 'northern',
  PIC: 'piccadilly',
  VIC: 'victoria',
  WAC: 'waterloo-city',
  ELL: 'windrush',
  GOB: 'suffragette',
  NLL: 'mildmay',
  URL: 'liberty',
  WAG: 'weaver',
  WEL: 'lioness',
  EZL: 'elizabeth',
  DLR: 'dlr',
};

export interface NumbatIngestReport {
  sourceDataset: string;
  lines: number;
  rowsRead: number;
  rowsUpserted: number;
  years: number[];
  jobId: number | null;
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText
      .map((part) => part.text)
      .join('')
      .trim();
  }
  return '';
}

async function downloadNumbat(refresh: boolean): Promise<string> {
  if (!refresh && fs.existsSync(NUMBAT_FILE) && fs.statSync(NUMBAT_FILE).size > 5_000) {
    return NUMBAT_FILE;
  }
  const response = await fetch(NUMBAT_URL);
  if (!response.ok) throw new Error(`Download NUMBAT falhou: ${response.status}`);
  await fsp.writeFile(NUMBAT_FILE, Buffer.from(await response.arrayBuffer()));
  return NUMBAT_FILE;
}

export async function runNumbatIngest(
  options: { refresh?: boolean } = {},
): Promise<NumbatIngestReport> {
  const { url, key } = requiredEnv();
  const rest = restFactory(url, key);
  const file = await downloadNumbat(Boolean(options.refresh));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const worksheet = workbook.getWorksheet('multi-year') ?? workbook.worksheets[0];
  if (!worksheet) throw new Error('XLSX NUMBAT sem sheets.');

  const header = worksheet.getRow(3);
  const years: Array<{ column: number; year: number }> = [];
  for (let column = 4; column <= 13; column += 1) {
    const year = cellNumber(header.getCell(column).value);
    if (year !== null) years.push({ column, year: Math.trunc(year) });
  }

  const rows: Array<{
    source_dataset: string;
    mode: string;
    line_code: string;
    line_name: string;
    line_id: string | null;
    year: number;
    boardings: number;
    fetched_at: string;
  }> = [];
  let lines = 0;
  const fetchedAt = new Date().toISOString();

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 4) return;
    const mode = cellText(row.getCell(1).value);
    const lineCode = cellText(row.getCell(2).value);
    const lineName = cellText(row.getCell(3).value);
    if (!lineCode || !lineName) return;
    lines += 1;
    for (const { column, year } of years) {
      const value = cellNumber(row.getCell(column).value);
      if (value === null || value < 0) continue;
      rows.push({
        source_dataset: NUMBAT_DATASET,
        mode,
        line_code: lineCode,
        line_name: lineName,
        line_id: LINE_ID_BY_CODE[lineCode] ?? null,
        year,
        boardings: Math.round(value),
        fetched_at: fetchedAt,
      });
    }
  });

  const jobId = await startJob(rest, 'ingest-numbat');
  try {
    let upserted = 0;
    for (const batch of chunk(rows, 500)) {
      await rest('line_annual_boardings?on_conflict=source_dataset,line_code,year', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      });
      upserted += batch.length;
    }
    await finishJob(rest, jobId, {
      status: 'success',
      recordsRead: rows.length,
      recordsUpserted: upserted,
      metadata: { dataset: NUMBAT_DATASET, lines, years: years.map((entry) => entry.year) },
    });
    await markSource(rest, NUMBAT_DATASET, 'ok');

    return {
      sourceDataset: NUMBAT_DATASET,
      lines,
      rowsRead: rows.length,
      rowsUpserted: upserted,
      years: years.map((entry) => entry.year),
      jobId,
    };
  } catch (error) {
    await markSource(rest, NUMBAT_DATASET, 'error');
    await finishJob(rest, jobId, {
      status: 'failed',
      recordsRead: rows.length,
      recordsUpserted: 0,
      error,
    });
    throw error;
  }
}
