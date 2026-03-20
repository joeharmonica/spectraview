import type { Spectrum } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';
import { nextColor } from './index';

/**
 * Parses a SpectraView round-trip CSV export.
 *
 * Format:
 *   ##SpectraView,v1
 *   #Name,"Sample A","Sample B"
 *   #Label,"Label A",""
 *   #YValue,"1.5",""
 *   #Group,"Group 1","Group 2"
 *   Wavelength (nm),"Sample A","Sample B"
 *   300.0,0.123,0.098
 *   ...
 */
export function parseSpectraViewExport(rows: string[][], filename: string): Spectrum[] {
  // Collect metadata from # prefixed rows
  const meta: Record<string, string[]> = {};
  let dataStartRow = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const first = (row[0] ?? '').trim();

    if (first === '##SpectraView') continue; // version row

    if (first.startsWith('#')) {
      const key = first.slice(1).toLowerCase();
      meta[key] = row.slice(1).map(v => v.trim());
      continue;
    }

    // First non-comment row: check if it's the header row (Wavelength...)
    if (first.toLowerCase().includes('wavelength') || !isNaN(parseFloat(first))) {
      dataStartRow = first.toLowerCase().includes('wavelength') ? i + 1 : i;
      break;
    }
  }

  if (dataStartRow < 0) return [];

  // Determine column count from name metadata or data row width
  const names = meta['name'] ?? [];
  const labels = meta['label'] ?? [];
  const yValues = meta['yvalue'] ?? [];
  const groups = meta['group'] ?? [];

  const colCount = names.length > 0 ? names.length : (rows[dataStartRow]?.length ?? 1) - 1;

  // Parse wavelength + intensity columns
  const spectraData: { wavelengths: number[]; intensities: number[] }[] = Array.from(
    { length: colCount }, () => ({ wavelengths: [], intensities: [] })
  );

  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c.trim() === '')) continue;
    const wl = parseFloat((row[0] ?? '').trim());
    if (isNaN(wl)) continue;
    for (let col = 0; col < colCount; col++) {
      const intensity = parseFloat((row[col + 1] ?? '').trim());
      if (!isNaN(intensity)) {
        spectraData[col]!.wavelengths.push(wl);
        spectraData[col]!.intensities.push(intensity);
      }
    }
  }

  return spectraData
    .map((sd, i) => {
      if (sd.wavelengths.length === 0) return null;
      const name = names[i] ?? `Spectrum ${i + 1}`;
      const label = labels[i] && labels[i] !== '' ? labels[i] : undefined;
      const yRaw = yValues[i] ?? '';
      const yValue = yRaw !== '' && !isNaN(parseFloat(yRaw)) ? parseFloat(yRaw) : undefined;
      const group = groups[i] && groups[i] !== '' ? groups[i] : undefined;

      const s: Spectrum = {
        id: crypto.randomUUID(),
        color: nextColor(),
        name,
        filename,
        format: 'spectraview',
        wavelengths: sd.wavelengths,
        intensities: sd.intensities,
        processing: { ...DEFAULT_PROCESSING },
        label,
        yValue,
        group,
      };
      return s;
    })
    .filter((s): s is Spectrum => s !== null);
}
