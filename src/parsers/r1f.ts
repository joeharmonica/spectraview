import type { Spectrum, SpectrumFormat } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';

interface R1FSpectrumField {
  norm?: number;
  start_nm?: number;
  data?: number[];
}

/**
 * R1F Portable Reader format:
 * CSV database export where each row is a sample record.
 * The "spectrum" column contains JSON: { norm, start_nm, data[] }
 * Wavelength array is reconstructed from start_nm + array index (1 nm steps).
 */
export function parseR1F(
  rows: string[][],
  filename: string,
): Omit<Spectrum, 'id' | 'color'>[] {
  if (rows.length < 2) return [];

  const header = rows[0].map(h => h.trim().toLowerCase());
  const spectrumColIndex = header.findIndex(h => h === 'spectrum');
  if (spectrumColIndex === -1) return [];

  // Find useful metadata columns
  const itemColIndex = header.findIndex(h => h === 'item' || h === 'sample' || h === 'name');
  const dateColIndex = header.findIndex(h => h.includes('date') || h.includes('time'));

  const results: Omit<Spectrum, 'id' | 'color'>[] = [];

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const rawJson = (row[spectrumColIndex] ?? '').trim();
    if (!rawJson) continue;

    let parsed: R1FSpectrumField;
    try {
      parsed = JSON.parse(rawJson) as R1FSpectrumField;
    } catch {
      continue;
    }

    const { start_nm, data } = parsed;
    if (!data || !Array.isArray(data) || data.length === 0) continue;
    const startNm = typeof start_nm === 'number' ? start_nm : 0;

    const wavelengths = data.map((_, i) => startNm + i);
    const intensities = data.map(v => (typeof v === 'number' ? v : 0));

    const itemName = itemColIndex !== -1 ? (row[itemColIndex] ?? '').trim() : '';
    const dateStr = dateColIndex !== -1 ? (row[dateColIndex] ?? '').trim() : '';
    const name = itemName || `Row ${rowIdx}`;

    const metadata: Record<string, string> = { source: 'R1F Portable Reader' };
    if (dateStr) metadata['date'] = dateStr;

    results.push({
      name,
      filename,
      format: 'r1f' as SpectrumFormat,
      wavelengths,
      intensities,
      metadata,
      processing: { ...DEFAULT_PROCESSING },
    });
  }

  return results;
}
