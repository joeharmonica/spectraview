import type { Spectrum, SpectrumFormat } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';

/**
 * RF-6000 2D Fluorescence format:
 * Lines 1–35: metadata sections ([Software Information], [Data Information], etc.)
 * After metadata: a line with sample name, then "Wavelength nm.,Intensity" header, then data
 */
export function parseRF6000_2D(rows: string[][], filename: string): Omit<Spectrum, 'id' | 'color'>[] {
  // Collect metadata key-value pairs
  const metadata: Record<string, string> = {};
  let dataStartRow = -1;
  let sampleName = '';

  for (let i = 0; i < rows.length; i++) {
    const first = (rows[i]?.[0] ?? '').trim();
    const second = (rows[i]?.[1] ?? '').trim();

    // Detect data header row
    if (first.toLowerCase().includes('wavelength') && second.toLowerCase().includes('intens')) {
      dataStartRow = i + 1;
      break;
    }

    // Capture metadata key-value pairs
    if (first && second) {
      metadata[first] = second;
    } else if (first && !second) {
      // Could be a sample name line just before the data header
      sampleName = first;
    }
  }

  if (dataStartRow === -1) return [];

  const name = sampleName || metadata['Data Name'] || metadata['Sample Name'] || filename.replace(/\.[^.]+$/, '');

  const wavelengths: number[] = [];
  const intensities: number[] = [];

  for (let i = dataStartRow; i < rows.length; i++) {
    const wRaw = (rows[i]?.[0] ?? '').trim();
    const iRaw = (rows[i]?.[1] ?? '').trim();
    if (!wRaw || !iRaw) continue;
    const w = parseFloat(wRaw);
    const intensity = parseFloat(iRaw);
    if (!isNaN(w) && !isNaN(intensity)) {
      wavelengths.push(w);
      intensities.push(intensity);
    }
  }

  if (wavelengths.length === 0) return [];

  return [{
    name,
    filename,
    format: 'rf6000_2d' as SpectrumFormat,
    wavelengths,
    intensities,
    metadata,
    processing: { ...DEFAULT_PROCESSING },
  }];
}
