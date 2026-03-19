import Papa from 'papaparse';
import type { Spectrum, ColumnMappingRequest } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';
import { parseCary3500 } from './cary3500';
import { parseRF6000_2D } from './rf6000_2d';
import { parseRF6000_3D } from './rf6000_3d';
import { parseR1F } from './r1f';

export interface ParseResult {
  spectra: Spectrum[];
  mappingRequest?: ColumnMappingRequest;
}

const PALETTE = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#0ea5e9', '#d946ef', '#22c55e', '#eab308', '#a855f7',
  '#f43f5e', '#06b6d4', '#fb923c', '#818cf8', '#a3e635',
];

let colorIndex = 0;

export function nextColor(): string {
  const color = PALETTE[colorIndex % PALETTE.length]!;
  colorIndex++;
  return color;
}

/** True when a cell label identifies the EX/EM matrix axis (RF-6000 3D format) */
export function isExEmAxisLabel(cell: string): boolean {
  const s = cell.trim().toLowerCase();
  return s === '' || s === 'ex' || s === 'em/ex' || (s.includes('ex') && s.includes('em'));
}

export function detectFormat(rows: string[][]): 'cary3500' | 'rf6000_2d' | 'rf6000_3d' | 'r1f' | 'unknown' {
  if (rows.length === 0) return 'unknown';

  const header = rows[0].map(h => h.trim().toLowerCase());

  // R1F: has a "spectrum" column with JSON data
  if (header.includes('spectrum')) return 'r1f';

  // RF-6000 3D: matrix header where col 0 is empty/EX and rest are numeric excitation wavelengths
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const second = (rows[i]?.[1] ?? '').trim();
    const isNumericHeader = second !== '' && !isNaN(parseFloat(second));
    const numericCols = rows[i]?.slice(1).filter(c => !isNaN(parseFloat(c.trim()))).length ?? 0;
    if (isExEmAxisLabel(rows[i]?.[0] ?? '') && isNumericHeader && numericCols > 5) {
      return 'rf6000_3d';
    }
  }

  // RF-6000 2D: large metadata header block before "Wavelength/Intensity" header pair
  const metadataLines = rows.slice(0, 40).filter(row => {
    const first = (row[0] ?? '').trim();
    return first.startsWith('[') || (first !== '' && row.length >= 2);
  });
  const hasWavelengthHeader = rows.slice(0, 50).some(row =>
    (row[0] ?? '').trim().toLowerCase().includes('wavelength') &&
    (row[1] ?? '').trim().toLowerCase().includes('intens')
  );
  if (metadataLines.length > 5 && hasWavelengthHeader) return 'rf6000_2d';

  // Cary 3500: row 1 has paired Wavelength/%T headers
  if (rows.length > 1) {
    const row1 = rows[1];
    const wavCount = row1.filter(h => h.trim().toLowerCase().includes('wavelength')).length;
    if (wavCount >= 2) return 'cary3500';
    if (wavCount === 1 && row1.length >= 2) return 'cary3500';
  }

  return 'unknown';
}

/** Build a ColumnMappingRequest for unknown-format files */
function buildMappingRequest(file: File, rows: string[][]): ColumnMappingRequest {
  // Take up to 30 non-empty rows as raw rows for the modal
  const rawRows = rows.filter(r => r.some(c => c.trim() !== '')).slice(0, 30);

  // Detect how many leading rows are non-numeric (header rows)
  let suggestedHeaderRows = 0;
  for (const row of rawRows) {
    const firstCell = (row[0] ?? '').trim();
    if (firstCell === '' || isNaN(parseFloat(firstCell))) {
      suggestedHeaderRows++;
    } else {
      break;
    }
  }

  const maxCols = rawRows.reduce((m, r) => Math.max(m, r.length), 0);
  const dataRows = rawRows.slice(suggestedHeaderRows);

  // Best guess for wavelength / intensity columns (first two all-numeric columns in data rows)
  let suggestedWavCol = 0;
  let suggestedIntCol = 1;
  if (dataRows.length > 0) {
    const numericCols: number[] = [];
    for (let col = 0; col < maxCols; col++) {
      const allNumeric = dataRows.every(row => {
        const val = (row[col] ?? '').trim();
        return val === '' || !isNaN(parseFloat(val));
      });
      if (allNumeric) numericCols.push(col);
    }
    if (numericCols.length >= 1) suggestedWavCol = numericCols[0]!;
    if (numericCols.length >= 2) suggestedIntCol = numericCols[1]!;
  }

  return { file, filename: file.name, rawRows, suggestedHeaderRows, suggestedWavCol, suggestedIntCol };
}

/** Parse a file with explicit column mapping chosen by the user */
export function parseFileWithMapping(
  rows: string[][],
  filename: string,
  wavCol: number,
  intCol: number,
  headerRows: number,
): Spectrum[] {
  const dataRows = rows.slice(headerRows);
  const wavelengths: number[] = [];
  const intensities: number[] = [];

  for (const row of dataRows) {
    const w = parseFloat((row[wavCol] ?? '').trim());
    const i = parseFloat((row[intCol] ?? '').trim());
    if (!isNaN(w) && !isNaN(i)) {
      wavelengths.push(w);
      intensities.push(i);
    }
  }

  if (wavelengths.length === 0) return [];

  return [{
    id: crypto.randomUUID(),
    color: nextColor(),
    name: filename.replace(/\.[^.]+$/, ''),
    filename,
    format: 'unknown',
    wavelengths,
    intensities,
    processing: { ...DEFAULT_PROCESSING },
  }];
}

function finalize(partials: Omit<Spectrum, 'id' | 'color'>[]): Spectrum[] {
  return partials.map(p => ({
    ...p,
    id: crypto.randomUUID(),
    color: nextColor(),
    processing: p.processing ?? { ...DEFAULT_PROCESSING },
  }));
}

export async function parseFile(file: File): Promise<ParseResult> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const rows = result.data as string[][];
  const format = detectFormat(rows);

  if (format === 'unknown') {
    return { spectra: [], mappingRequest: buildMappingRequest(file, rows) };
  }

  let partials: Omit<Spectrum, 'id' | 'color'>[];
  switch (format) {
    case 'cary3500':  partials = parseCary3500(rows, file.name); break;
    case 'rf6000_2d': partials = parseRF6000_2D(rows, file.name); break;
    case 'rf6000_3d': partials = parseRF6000_3D(rows, file.name); break;
    case 'r1f':       partials = parseR1F(rows, file.name); break;
  }

  return { spectra: finalize(partials) };
}
