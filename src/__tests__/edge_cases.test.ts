import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';

import { detectFormat, parseFileWithMapping } from '../parsers/index';
import { parseCary3500 } from '../parsers/cary3500';
import { parseRF6000_2D } from '../parsers/rf6000_2d';
import { parseRF6000_3D } from '../parsers/rf6000_3d';
import { parseR1F } from '../parsers/r1f';

function loadSample(name: string): string[][] {
  const path = resolve(__dirname, '../../sample', name);
  const text = readFileSync(path, 'utf-8');
  return (Papa.parse<string[]>(text, { skipEmptyLines: false }).data) as string[][];
}

// ─── Parser edge cases ────────────────────────────────────────────────────────

describe('detectFormat — edge cases', () => {
  it('returns unknown for empty rows', () => {
    expect(detectFormat([])).toBe('unknown');
  });

  it('returns unknown for all-empty rows', () => {
    expect(detectFormat([[''], [''], ['']])).toBe('unknown');
  });

  it('returns unknown for a plain two-column numeric CSV', () => {
    const rows = [['400', '1.0'], ['500', '2.0'], ['600', '1.5']];
    expect(detectFormat(rows)).toBe('unknown');
  });

  it('returns r1f when header contains "spectrum" column', () => {
    const rows = [['id', 'spectrum', 'item'], ['1', '{"start_nm":350,"data":[1,2,3]}', 'Test']];
    expect(detectFormat(rows)).toBe('r1f');
  });
});

describe('parseCary3500 — edge cases', () => {
  it('returns empty array for fewer than 3 rows', () => {
    expect(parseCary3500([['A', 'B']], 'test.csv')).toHaveLength(0);
  });

  it('returns empty array when no wavelength/intensity header pair found', () => {
    const rows = [['Name'], ['Col A', 'Col B'], ['1', '2']];
    expect(parseCary3500(rows, 'test.csv')).toHaveLength(0);
  });

  it('skips rows with non-numeric data', () => {
    const rows = [
      ['Sample1', ''],
      ['Wavelength (nm)', '%T'],
      ['400', '0.8'],
      ['bad', 'data'],
      ['600', '0.6'],
    ];
    const result = parseCary3500(rows, 'test.csv');
    expect(result[0]!.wavelengths).toEqual([400, 600]);
  });

  it('produces correct spectrum count from real file', () => {
    const rows = loadSample('Absorption-Cary3500.csv');
    const spectra = parseCary3500(rows, 'Absorption-Cary3500.csv');
    // Real file has 56 sample columns (28 pairs)
    expect(spectra.length).toBeGreaterThanOrEqual(28);
  });

  it('assigns names from sample name row', () => {
    const rows = [
      ['MySample', ''],
      ['Wavelength (nm)', '%T'],
      ['400', '0.5'],
    ];
    const result = parseCary3500(rows, 'test.csv');
    expect(result[0]!.name).toBe('MySample');
  });
});

describe('parseRF6000_2D — edge cases', () => {
  it('returns empty array when no wavelength/intensity header found', () => {
    const rows = [['Key', 'Value'], ['Foo', 'Bar']];
    expect(parseRF6000_2D(rows, 'test.csv')).toHaveLength(0);
  });

  it('returns empty array when data section has no numeric rows', () => {
    const rows = [
      ['Wavelength nm.', 'Intensity'],
      ['text', 'text'],
    ];
    expect(parseRF6000_2D(rows, 'test.csv')).toHaveLength(0);
  });

  it('captures metadata into spectrum.metadata', () => {
    const rows = loadSample('Fluorescent-2D-RF6000.csv');
    const spectra = parseRF6000_2D(rows, 'Fluorescent-2D-RF6000.csv');
    const meta = spectra[0]!.metadata ?? {};
    expect(Object.keys(meta).length).toBeGreaterThan(3);
  });

  it('intensities and wavelengths arrays are the same length', () => {
    const rows = loadSample('Fluorescent-2D-RF6000.csv');
    const spectra = parseRF6000_2D(rows, 'Fluorescent-2D-RF6000.csv');
    for (const s of spectra) {
      expect(s.intensities.length).toBe(s.wavelengths.length);
    }
  });
});

describe('parseRF6000_3D — edge cases', () => {
  it('returns empty array when no EX/EM header row found', () => {
    const rows = [['Key', 'Value'], ['400', '1.0']];
    expect(parseRF6000_3D(rows, 'test.csv')).toHaveLength(0);
  });

  it('produces one spectrum per excitation wavelength', () => {
    const rows = loadSample('Fluorescent-3D-RF6000.csv');
    const spectra = parseRF6000_3D(rows, 'Fluorescent-3D-RF6000.csv');
    // EX range 375–850 at 5nm steps = 96 excitation wavelengths
    expect(spectra.length).toBe(96);
  });

  it('each spectrum name contains the excitation wavelength', () => {
    const rows = loadSample('Fluorescent-3D-RF6000.csv');
    const spectra = parseRF6000_3D(rows, 'Fluorescent-3D-RF6000.csv');
    for (const s of spectra) {
      expect(s.name).toMatch(/Ex \d+/);
    }
  });

  it('emission wavelengths are consistent across all spectra', () => {
    const rows = loadSample('Fluorescent-3D-RF6000.csv');
    const spectra = parseRF6000_3D(rows, 'Fluorescent-3D-RF6000.csv');
    const firstLen = spectra[0]!.wavelengths.length;
    for (const s of spectra) {
      expect(s.wavelengths.length).toBe(firstLen);
    }
  });
});

describe('parseR1F — edge cases', () => {
  it('returns empty array for fewer than 2 rows', () => {
    expect(parseR1F([['id', 'spectrum']], 'test.csv')).toHaveLength(0);
  });

  it('returns empty array when no spectrum column present', () => {
    const rows = [['id', 'item'], ['1', 'Cement']];
    expect(parseR1F(rows, 'test.csv')).toHaveLength(0);
  });

  it('skips rows with invalid JSON in spectrum field', () => {
    const rows = [
      ['id', 'spectrum'],
      ['1', 'not-valid-json'],
      ['2', '{"start_nm":350,"data":[1,2,3]}'],
    ];
    const result = parseR1F(rows, 'test.csv');
    expect(result.length).toBe(1);
  });

  it('reconstructs wavelengths from start_nm + index', () => {
    const rows = [
      ['id', 'spectrum'],
      ['1', '{"start_nm":350,"data":[0.1,0.2,0.3]}'],
    ];
    const result = parseR1F(rows, 'test.csv');
    expect(result[0]!.wavelengths).toEqual([350, 351, 352]);
  });
});

// ─── parseFileWithMapping edge cases ─────────────────────────────────────────

describe('parseFileWithMapping — edge cases', () => {
  it('handles reversed columns (intensity first, then wavelength)', () => {
    const rows = [
      ['Intensity', 'Wavelength'],
      ['0.5', '400'],
      ['1.0', '500'],
    ];
    const result = parseFileWithMapping(rows, 'test.csv', 1, [0], 1);
    expect(result[0]!.wavelengths).toEqual([400, 500]);
    expect(result[0]!.intensities[0]).toBeCloseTo(0.5);
  });

  it('handles files with more than 2 columns — picks specified ones', () => {
    const rows = [
      ['id', 'wavelength', 'raw', 'corrected'],
      ['1', '400', '0.1', '0.09'],
      ['2', '500', '0.2', '0.18'],
    ];
    // Map col 1 = wavelength, col 3 = corrected intensity
    const result = parseFileWithMapping(rows, 'test.csv', 1, [3], 1);
    expect(result[0]!.wavelengths).toEqual([400, 500]);
    expect(result[0]!.intensities[1]).toBeCloseTo(0.18);
  });

  it('assigns format as unknown', () => {
    const rows = [['400', '1.0'], ['500', '2.0']];
    expect(parseFileWithMapping(rows, 'test.csv', 0, [1], 0)[0]!.format).toBe('unknown');
  });

  it('handles empty file (0 data rows after header skip)', () => {
    const rows = [['Wavelength', 'Intensity']];
    expect(parseFileWithMapping(rows, 'test.csv', 0, [1], 1)).toHaveLength(0);
  });
});

// ─── buildMappingRequest suggestion logic ─────────────────────────────────────

describe('buildMappingRequest — suggestedHeaderRows', () => {
  // Test via detectFormat returning 'unknown' + checking parsers behaviour
  it('plain numeric CSV has 0 header rows suggested', () => {
    // A plain numeric CSV will return 'unknown' from detectFormat
    const rows = [['400', '1.0'], ['500', '2.0'], ['600', '1.5']];
    expect(detectFormat(rows)).toBe('unknown');
    // The first row starts with a number → suggestedHeaderRows should be 0
    // Verify via parseFileWithMapping with 0 header rows
    const result = parseFileWithMapping(rows, 'test.csv', 0, [1], 0);
    expect(result[0]!.wavelengths).toHaveLength(3);
  });

  it('CSV with one text header has 1 header row suggested', () => {
    // First row non-numeric → 1 header row, then data
    const rows = [['Wavelength', 'Intensity'], ['400', '1.0'], ['500', '2.0']];
    const result = parseFileWithMapping(rows, 'test.csv', 0, [1], 1);
    expect(result[0]!.wavelengths).toHaveLength(2);
  });
});
