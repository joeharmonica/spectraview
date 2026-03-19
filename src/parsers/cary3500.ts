import type { Spectrum, SpectrumFormat } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';

/**
 * Cary 3500 UV-Vis format:
 * Row 0: sample names (one name per pair, e.g. "Sample1,,Sample2,,")
 * Row 1: column headers as paired "Wavelength (nm), %T" repeated per sample
 * Rows 2+: data rows with wavelength values repeated per pair
 */
export function parseCary3500(rows: string[][], filename: string): Omit<Spectrum, 'id' | 'color'>[] {
  if (rows.length < 3) return [];

  const nameRow = rows[0];
  const headerRow = rows[1];

  // Find all column pairs: Wavelength col index and corresponding Intensity col index
  const pairs: Array<{ wavCol: number; intCol: number; name: string }> = [];

  for (let col = 0; col < headerRow.length - 1; col++) {
    const header = (headerRow[col] ?? '').trim().toLowerCase();
    if (header.includes('wavelength')) {
      const intHeader = (headerRow[col + 1] ?? '').trim().toLowerCase();
      if (intHeader && !intHeader.includes('wavelength')) {
        // Sample name: look at the name row at this column position
        const rawName = (nameRow[col] ?? '').trim() || (nameRow[col + 1] ?? '').trim();
        const name = rawName || `Spectrum ${pairs.length + 1}`;
        pairs.push({ wavCol: col, intCol: col + 1, name });
      }
    }
  }

  if (pairs.length === 0) return [];

  const dataRows = rows.slice(2);

  return pairs.map(({ wavCol, intCol, name }) => {
    const wavelengths: number[] = [];
    const intensities: number[] = [];

    for (const row of dataRows) {
      const wRaw = (row[wavCol] ?? '').trim();
      const iRaw = (row[intCol] ?? '').trim();
      if (!wRaw || !iRaw) continue;
      const w = parseFloat(wRaw);
      const i = parseFloat(iRaw);
      if (!isNaN(w) && !isNaN(i)) {
        wavelengths.push(w);
        intensities.push(i);
      }
    }

    return {
      name,
      filename,
      format: 'cary3500' as SpectrumFormat,
      wavelengths,
      intensities,
      metadata: { source: 'Cary 3500 UV-Vis' },
      processing: { ...DEFAULT_PROCESSING },
    };
  });
}
