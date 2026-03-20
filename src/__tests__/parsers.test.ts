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
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return result.data as string[][];
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------
describe('detectFormat', () => {
  it('detects Absorption-Cary3500.csv as cary3500', () => {
    const rows = loadSample('Absorption-Cary3500.csv');
    expect(detectFormat(rows)).toBe('cary3500');
  });

  it('detects Fluorescent-2D-RF6000.csv as rf6000_2d', () => {
    const rows = loadSample('Fluorescent-2D-RF6000.csv');
    expect(detectFormat(rows)).toBe('rf6000_2d');
  });

  it('detects Fluorescent-3D-RF6000.csv as rf6000_3d', () => {
    const rows = loadSample('Fluorescent-3D-RF6000.csv');
    expect(detectFormat(rows)).toBe('rf6000_3d');
  });

  it('detects Fluorescent-R1F.csv as r1f', () => {
    const rows = loadSample('Fluorescent-R1F.csv');
    expect(detectFormat(rows)).toBe('r1f');
  });
});

// ---------------------------------------------------------------------------
// Cary 3500 parser
// ---------------------------------------------------------------------------
describe('parseCary3500', () => {
  let rows: string[][];
  let spectra: ReturnType<typeof parseCary3500>;

  beforeAll(() => {
    rows = loadSample('Absorption-Cary3500.csv');
    spectra = parseCary3500(rows, 'Absorption-Cary3500.csv');
  });

  it('parses multiple spectra', () => {
    expect(spectra.length).toBeGreaterThan(10);
  });

  it('every spectrum has wavelengths and intensities', () => {
    for (const s of spectra) {
      expect(s.wavelengths.length).toBeGreaterThan(0);
      expect(s.intensities.length).toBe(s.wavelengths.length);
    }
  });

  it('wavelengths are numeric and in a plausible UV-Vis range', () => {
    for (const s of spectra) {
      const min = Math.min(...s.wavelengths);
      const max = Math.max(...s.wavelengths);
      expect(min).toBeGreaterThanOrEqual(150);
      expect(max).toBeLessThanOrEqual(1100);
    }
  });

  it('all spectra have format cary3500', () => {
    for (const s of spectra) {
      expect(s.format).toBe('cary3500');
    }
  });
});

// ---------------------------------------------------------------------------
// RF-6000 2D parser
// ---------------------------------------------------------------------------
describe('parseRF6000_2D', () => {
  let rows: string[][];
  let spectra: ReturnType<typeof parseRF6000_2D>;

  beforeAll(() => {
    rows = loadSample('Fluorescent-2D-RF6000.csv');
    spectra = parseRF6000_2D(rows, 'Fluorescent-2D-RF6000.csv');
  });

  it('parses at least one spectrum', () => {
    expect(spectra.length).toBeGreaterThanOrEqual(1);
  });

  it('spectrum has wavelengths and intensities', () => {
    const s = spectra[0]!;
    expect(s.wavelengths.length).toBeGreaterThan(0);
    expect(s.intensities.length).toBe(s.wavelengths.length);
  });

  it('wavelengths are in fluorescence emission range (600–800 nm based on file)', () => {
    const s = spectra[0]!;
    const min = Math.min(...s.wavelengths);
    const max = Math.max(...s.wavelengths);
    expect(min).toBeGreaterThanOrEqual(400);
    expect(max).toBeLessThanOrEqual(1000);
  });

  it('format is rf6000_2d', () => {
    expect(spectra[0]!.format).toBe('rf6000_2d');
  });

  it('metadata is populated', () => {
    expect(spectra[0]!.metadata).toBeDefined();
    expect(Object.keys(spectra[0]!.metadata ?? {}).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// RF-6000 3D parser
// ---------------------------------------------------------------------------
describe('parseRF6000_3D', () => {
  let rows: string[][];
  let spectra: ReturnType<typeof parseRF6000_3D>;

  beforeAll(() => {
    rows = loadSample('Fluorescent-3D-RF6000.csv');
    spectra = parseRF6000_3D(rows, 'Fluorescent-3D-RF6000.csv');
  });

  it('parses multiple emission spectra (one per excitation wavelength)', () => {
    expect(spectra.length).toBeGreaterThan(5);
  });

  it('every spectrum has wavelengths and intensities', () => {
    for (const s of spectra) {
      expect(s.wavelengths.length).toBeGreaterThan(0);
      expect(s.intensities.length).toBe(s.wavelengths.length);
    }
  });

  it('format is rf6000_3d', () => {
    for (const s of spectra) {
      expect(s.format).toBe('rf6000_3d');
    }
  });
});

// ---------------------------------------------------------------------------
// R1F parser
// ---------------------------------------------------------------------------
describe('parseR1F', () => {
  let rows: string[][];
  let spectra: ReturnType<typeof parseR1F>;

  beforeAll(() => {
    rows = loadSample('Fluorescent-R1F.csv');
    spectra = parseR1F(rows, 'Fluorescent-R1F.csv');
  });

  it('parses at least one spectrum', () => {
    expect(spectra.length).toBeGreaterThanOrEqual(1);
  });

  it('spectrum has wavelengths and intensities', () => {
    const s = spectra[0]!;
    expect(s.wavelengths.length).toBeGreaterThan(0);
    expect(s.intensities.length).toBe(s.wavelengths.length);
  });

  it('wavelengths start from ~350 nm', () => {
    const s = spectra[0]!;
    const min = Math.min(...s.wavelengths);
    expect(min).toBeGreaterThanOrEqual(300);
    expect(min).toBeLessThanOrEqual(400);
  });

  it('format is r1f', () => {
    expect(spectra[0]!.format).toBe('r1f');
  });
});

// ---------------------------------------------------------------------------
// Column mapping — parseFileWithMapping
// ---------------------------------------------------------------------------
describe('parseFileWithMapping', () => {
  it('parses two-column numeric CSV correctly', () => {
    const rows = [
      ['Wavelength', 'Intensity'],
      ['400', '0.123'],
      ['500', '0.456'],
      ['600', '0.789'],
    ];
    const spectra = parseFileWithMapping(rows, 'test.csv', 0, [1], 1);
    expect(spectra.length).toBe(1);
    const s = spectra[0]!;
    expect(s.wavelengths).toEqual([400, 500, 600]);
    expect(s.intensities[0]).toBeCloseTo(0.123);
    expect(s.intensities[2]).toBeCloseTo(0.789);
  });

  it('skips non-numeric rows', () => {
    const rows = [
      ['400', '0.1'],
      ['bad', 'data'],
      ['500', '0.2'],
    ];
    const spectra = parseFileWithMapping(rows, 'test.csv', 0, [1], 0);
    expect(spectra[0]!.wavelengths).toEqual([400, 500]);
  });

  it('returns empty array when no valid data found', () => {
    const rows = [
      ['Name', 'Value'],
      ['text', 'text'],
    ];
    const spectra = parseFileWithMapping(rows, 'test.csv', 0, [1], 0);
    expect(spectra).toHaveLength(0);
  });

  it('respects headerRows skip count', () => {
    const rows = [
      ['Header A', 'Header B'],
      ['Note', 'Info'],
      ['400', '1.0'],
      ['500', '2.0'],
    ];
    const spectra = parseFileWithMapping(rows, 'test.csv', 0, [1], 2);
    expect(spectra[0]!.wavelengths).toEqual([400, 500]);
  });

  it('strips file extension from spectrum name', () => {
    const rows = [['400', '1.0'], ['500', '2.0']];
    const spectra = parseFileWithMapping(rows, 'my_sample.csv', 0, [1], 0);
    expect(spectra[0]!.name).toBe('my_sample');
  });

  it('returns one spectrum per intensity column', () => {
    const rows = [
      ['Wavelength', 'Sample_A', 'Sample_B', 'Sample_C'],
      ['400', '1.0', '2.0', '3.0'],
      ['500', '1.5', '2.5', '3.5'],
    ];
    const spectra = parseFileWithMapping(rows, 'batch.csv', 0, [1, 2, 3], 1);
    expect(spectra).toHaveLength(3);
    expect(spectra[0]!.name).toBe('Sample_A');
    expect(spectra[1]!.name).toBe('Sample_B');
    expect(spectra[2]!.name).toBe('Sample_C');
    expect(spectra[0]!.wavelengths).toEqual([400, 500]);
    expect(spectra[1]!.intensities[0]).toBeCloseTo(2.0);
  });

  it('skips columns with no valid data and returns only populated spectra', () => {
    const rows = [
      ['Wavelength', 'Good', 'Empty'],
      ['400', '1.0', ''],
      ['500', '2.0', ''],
    ];
    const spectra = parseFileWithMapping(rows, 'test.csv', 0, [1, 2], 1);
    expect(spectra).toHaveLength(1);
    expect(spectra[0]!.name).toBe('Good');
  });

  it('uses filename as name for single-column import without header', () => {
    const rows = [['400', '1.0'], ['500', '2.0']];
    const spectra = parseFileWithMapping(rows, 'run1.csv', 0, [1], 0);
    expect(spectra[0]!.name).toBe('run1');
  });
});
