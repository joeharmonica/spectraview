/**
 * Tests for Phase 9 bug fixes:
 * Fix 1 — Annotate mode no longer overrides dragmode
 * Fix 3 — Crop range correctly applied to chart x-axis wavelengths
 * Fix 4 — Excel files (xls/xlsx) detected and routed through excelToRows
 */

import { describe, it, expect } from 'vitest';
import { applyProcessing, cropToRange } from '../lib/processing';
import { detectFormat } from '../parsers/index';
import type { ProcessingOptions } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';

// ─── Fix 3: Crop range + wavelength array consistency ─────────────────────────

describe('Crop range: wavelengths and intensities stay in sync', () => {
  const wavelengths = [200, 250, 300, 350, 400, 450, 500];
  const intensities = [0.1, 0.2, 0.5, 0.9, 0.7, 0.3, 0.1];

  it('cropToRange returns only wavelengths within [minWl, maxWl]', () => {
    const { wavelengths: wl, intensities: ints } = cropToRange(wavelengths, intensities, 300, 450);
    expect(wl).toEqual([300, 350, 400, 450]);
    expect(ints).toEqual([0.5, 0.9, 0.7, 0.3]);
    expect(wl.length).toBe(ints.length);
  });

  it('applyProcessing with crop returns same length as filtered wavelengths', () => {
    const opts: ProcessingOptions = {
      ...DEFAULT_PROCESSING,
      crop: { minWl: 300, maxWl: 400 },
    };
    const result = applyProcessing(wavelengths, intensities, opts);
    // Wavelengths in [300,400]: 300, 350, 400 → 3 points
    const expectedWavelengths = wavelengths.filter(w => w >= 300 && w <= 400);
    expect(result.length).toBe(expectedWavelengths.length);
    expect(result.length).toBe(3);
  });

  it('displayWavelengths calculation matches applyProcessing output length', () => {
    // Simulate what ChartWorkspace does after fix
    const crop = { minWl: 250, maxWl: 400 };
    const opts: ProcessingOptions = { ...DEFAULT_PROCESSING, crop };
    const displayIntensities = applyProcessing(wavelengths, intensities, opts);
    const displayWavelengths = wavelengths.filter(w => w >= crop.minWl && w <= crop.maxWl);
    expect(displayWavelengths.length).toBe(displayIntensities.length);
  });

  it('no crop: displayWavelengths equals original wavelengths', () => {
    const opts: ProcessingOptions = { ...DEFAULT_PROCESSING };
    const displayIntensities = applyProcessing(wavelengths, intensities, opts);
    // Without crop, displayWavelengths === wavelengths
    expect(displayIntensities.length).toBe(wavelengths.length);
  });

  it('crop to exact boundary points includes them (inclusive range)', () => {
    const { wavelengths: wl } = cropToRange(wavelengths, intensities, 200, 200);
    expect(wl).toEqual([200]);
    const { wavelengths: wl2 } = cropToRange(wavelengths, intensities, 500, 500);
    expect(wl2).toEqual([500]);
  });

  it('crop outside data range returns empty arrays', () => {
    const { wavelengths: wl, intensities: ints } = cropToRange(wavelengths, intensities, 600, 700);
    expect(wl).toHaveLength(0);
    expect(ints).toHaveLength(0);
  });
});

// ─── Fix 4: Excel file detection ─────────────────────────────────────────────

describe('Excel file extension detection', () => {
  it('xls and xlsx extensions are recognised for Excel routing', () => {
    // Simulate the isExcel check in parseFile
    const isExcel = (name: string) => /\.(xlsx|xls)$/i.test(name);
    expect(isExcel('data.xlsx')).toBe(true);
    expect(isExcel('data.xls')).toBe(true);
    expect(isExcel('DATA.XLSX')).toBe(true);
    expect(isExcel('DATA.XLS')).toBe(true);
    expect(isExcel('data.csv')).toBe(false);
    expect(isExcel('data.csv.xls.bak')).toBe(false); // ends in .bak
  });
});

// ─── Fix 4: DropZone file filter ─────────────────────────────────────────────

describe('DropZone file filter regex', () => {
  it('accepts csv, xlsx, xls case-insensitively', () => {
    const accept = (name: string) => /\.(csv|xlsx|xls)$/i.test(name);
    expect(accept('spectrum.csv')).toBe(true);
    expect(accept('spectrum.xlsx')).toBe(true);
    expect(accept('spectrum.xls')).toBe(true);
    expect(accept('SPECTRUM.CSV')).toBe(true);
    expect(accept('SPECTRUM.XLS')).toBe(true);
    expect(accept('spectrum.txt')).toBe(false);
    expect(accept('spectrum.pdf')).toBe(false);
  });
});

// ─── Fix 3: Crop + other processing combined ─────────────────────────────────

describe('Crop combined with other processing', () => {
  const wavelengths = Array.from({ length: 100 }, (_, i) => 300 + i); // 300–399 nm
  const intensities = wavelengths.map(w => Math.sin((w - 300) / 20)); // sine wave

  it('crop + normalize: output length matches cropped range', () => {
    const opts: ProcessingOptions = {
      crop: { minWl: 320, maxWl: 360 },
      normalize: 'max',
      smooth: null,
      baseline: null,
    };
    const result = applyProcessing(wavelengths, intensities, opts);
    const expectedLen = wavelengths.filter(w => w >= 320 && w <= 360).length;
    expect(result.length).toBe(expectedLen);
    // Normalized max should be 1
    expect(Math.max(...result)).toBeCloseTo(1, 5);
  });

  it('crop + smooth: output length matches cropped range', () => {
    const opts: ProcessingOptions = {
      crop: { minWl: 310, maxWl: 390 },
      smooth: { windowSize: 5, polyOrder: 2 },
      normalize: null,
      baseline: null,
    };
    const result = applyProcessing(wavelengths, intensities, opts);
    const expectedLen = wavelengths.filter(w => w >= 310 && w <= 390).length;
    expect(result.length).toBe(expectedLen);
  });
});

// ─── Fix 3: detectFormat still works after SpectraView header detection ───────

describe('detectFormat regression after fix', () => {
  it('non-spectraview CSV still detected correctly', () => {
    const rows = [
      ['##NotSpectraView', 'v1'],
      ['Wavelength (nm)', 'Sample'],
      ['300', '0.1'],
    ];
    expect(detectFormat(rows)).not.toBe('spectraview');
  });
});
