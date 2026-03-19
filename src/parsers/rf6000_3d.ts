import type { Spectrum, SpectrumFormat } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';
import { isExEmAxisLabel } from './index';

/**
 * RF-6000 3D EEM format:
 * Metadata header block (same as 2D), then a matrix:
 *   Matrix header row: col 0 = "EX Wavelength/EM Wavelength", cols 1+ = EMISSION wavelengths (x-axis)
 *   Data rows: col 0 = EXCITATION wavelength (identifies each spectrum), cols 1+ = intensities
 *
 * Produces one emission spectrum per excitation wavelength.
 */
export function parseRF6000_3D(rows: string[][], filename: string): Omit<Spectrum, 'id' | 'color'>[] {
  const metadata: Record<string, string> = {};
  let matrixHeaderRow = -1;

  for (let i = 0; i < rows.length; i++) {
    const firstRaw = (rows[i]?.[0] ?? '').trim();
    const secondRaw = (rows[i]?.[1] ?? '').trim();
    const isNumericHeader = secondRaw !== '' && !isNaN(parseFloat(secondRaw));

    if (isExEmAxisLabel(firstRaw) && isNumericHeader) {
      matrixHeaderRow = i;
      break;
    }
    if (firstRaw && secondRaw) {
      metadata[firstRaw] = secondRaw;
    }
  }

  if (matrixHeaderRow === -1) return [];

  const headerRow = rows[matrixHeaderRow];
  // Cols 1+ of the header row are EMISSION wavelengths (these become the x-axis of each spectrum)
  const emWavelengths: number[] = [];
  for (let col = 1; col < headerRow.length; col++) {
    const val = parseFloat((headerRow[col] ?? '').trim());
    if (!isNaN(val)) emWavelengths.push(val);
  }

  if (emWavelengths.length === 0) return [];

  // Each data row: col 0 = excitation wavelength, cols 1+ = intensities at each emission wavelength
  const spectra: Omit<Spectrum, 'id' | 'color'>[] = [];

  for (let i = matrixHeaderRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const exRaw = (row?.[0] ?? '').trim();
    if (!exRaw) continue;
    const exLambda = parseFloat(exRaw);
    if (isNaN(exLambda)) continue;

    const intensities: number[] = [];
    for (let col = 1; col <= emWavelengths.length; col++) {
      const val = parseFloat((row?.[col] ?? '0').trim());
      intensities.push(isNaN(val) ? 0 : val);
    }

    spectra.push({
      name: `Ex ${exLambda} nm — ${filename.replace(/\.[^.]+$/, '')}`,
      filename,
      format: 'rf6000_3d' as SpectrumFormat,
      wavelengths: [...emWavelengths],
      intensities,
      metadata: { ...metadata, excitation_nm: String(exLambda), source: 'RF-6000 3D EEM' },
      processing: { ...DEFAULT_PROCESSING },
    });
  }

  return spectra;
}
