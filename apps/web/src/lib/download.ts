export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: readonly string[],
): string {
  const header = columns.map(escapeCsvValue).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/csv;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
