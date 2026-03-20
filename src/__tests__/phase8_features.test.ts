/**
 * Tests for Phase 8 features:
 * - F5: Spectrum grouping (type field)
 * - F6: CSV round-trip export format + spectraview_export parser
 * - detectFormat detects 'spectraview' format
 */

import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { detectFormat } from '../parsers/index';
import { parseSpectraViewExport } from '../parsers/spectraview_export';
import type { Spectrum } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';

// ─── F6: SpectraView round-trip export format detection ────────────────────

describe('detectFormat — spectraview', () => {
  it('detects ##SpectraView header as spectraview', () => {
    const rows = [
      ['##SpectraView', 'v1'],
      ['#Name', 'Sample A', 'Sample B'],
      ['Wavelength (nm)', 'Sample A', 'Sample B'],
      ['300', '0.1', '0.2'],
    ];
    expect(detectFormat(rows)).toBe('spectraview');
  });

  it('does not detect normal CSV as spectraview', () => {
    const rows = [
      ['Wavelength (nm)', 'Sample A'],
      ['300', '0.1'],
    ];
    expect(detectFormat(rows)).not.toBe('spectraview');
  });
});

// ─── F6: parseSpectraViewExport ────────────────────────────────────────────

function makeExportRows(opts: {
  names: string[];
  labels?: string[];
  yValues?: string[];
  groups?: string[];
  data: { wl: number; vals: number[] }[];
}): string[][] {
  const { names, labels, yValues, groups, data } = opts;
  const rows: string[][] = [];
  rows.push(['##SpectraView', 'v1']);
  rows.push(['#Name', ...names]);
  if (labels) rows.push(['#Label', ...labels]);
  if (yValues) rows.push(['#YValue', ...yValues]);
  if (groups) rows.push(['#Group', ...groups]);
  rows.push(['Wavelength (nm)', ...names]);
  data.forEach(d => rows.push([String(d.wl), ...d.vals.map(String)]));
  return rows;
}

describe('parseSpectraViewExport', () => {
  it('parses two spectra with basic names', () => {
    const rows = makeExportRows({
      names: ['Alpha', 'Beta'],
      data: [
        { wl: 300, vals: [0.1, 0.2] },
        { wl: 310, vals: [0.15, 0.25] },
      ],
    });
    const spectra = parseSpectraViewExport(rows, 'test.csv');
    expect(spectra).toHaveLength(2);
    expect(spectra[0]!.name).toBe('Alpha');
    expect(spectra[1]!.name).toBe('Beta');
    expect(spectra[0]!.wavelengths).toEqual([300, 310]);
    expect(spectra[0]!.intensities).toEqual([0.1, 0.15]);
  });

  it('restores label, yValue, and group', () => {
    const rows = makeExportRows({
      names: ['Sample A', 'Sample B'],
      labels: ['Label A', ''],
      yValues: ['1.5', ''],
      groups: ['Group 1', 'Group 2'],
      data: [{ wl: 300, vals: [0.1, 0.2] }],
    });
    const spectra = parseSpectraViewExport(rows, 'test.csv');
    expect(spectra[0]!.label).toBe('Label A');
    expect(spectra[1]!.label).toBeUndefined();
    expect(spectra[0]!.yValue).toBe(1.5);
    expect(spectra[1]!.yValue).toBeUndefined();
    expect(spectra[0]!.group).toBe('Group 1');
    expect(spectra[1]!.group).toBe('Group 2');
  });

  it('empty label/yValue/group fields become undefined', () => {
    const rows = makeExportRows({
      names: ['X'],
      labels: [''],
      yValues: [''],
      groups: [''],
      data: [{ wl: 400, vals: [0.5] }],
    });
    const spectra = parseSpectraViewExport(rows, 'test.csv');
    expect(spectra[0]!.label).toBeUndefined();
    expect(spectra[0]!.yValue).toBeUndefined();
    expect(spectra[0]!.group).toBeUndefined();
  });

  it('correctly sets format to spectraview', () => {
    const rows = makeExportRows({
      names: ['S1'],
      data: [{ wl: 300, vals: [0.1] }],
    });
    const spectra = parseSpectraViewExport(rows, 'out.csv');
    expect(spectra[0]!.format).toBe('spectraview');
  });

  it('handles missing optional metadata rows gracefully', () => {
    // Only ##SpectraView header, no #Label/#YValue/#Group rows
    const rows = makeExportRows({
      names: ['Only'],
      data: [{ wl: 300, vals: [0.5] }, { wl: 310, vals: [0.6] }],
    });
    const spectra = parseSpectraViewExport(rows, 'test.csv');
    expect(spectra).toHaveLength(1);
    expect(spectra[0]!.wavelengths).toHaveLength(2);
  });

  it('skips columns with no valid data', () => {
    const rows = makeExportRows({
      names: ['Good', 'Bad'],
      data: [{ wl: 300, vals: [0.1, NaN] }],
    });
    // Replace NaN with 'bad' in raw rows
    rows[rows.length - 1]![2] = 'bad';
    const spectra = parseSpectraViewExport(rows, 'test.csv');
    // 'Good' has data, 'Bad' has no valid rows
    expect(spectra.find(s => s.name === 'Good')).toBeDefined();
    const bad = spectra.find(s => s.name === 'Bad');
    // Bad column has no numeric data, should be excluded
    expect(bad).toBeUndefined();
  });
});

// ─── F5: Spectrum type supports group field ────────────────────────────────

describe('Spectrum.group field', () => {
  it('Spectrum interface accepts group field', () => {
    const s: Spectrum = {
      id: '1',
      name: 'Test',
      filename: 'test.csv',
      format: 'unknown',
      wavelengths: [300],
      intensities: [0.5],
      color: '#ff0000',
      processing: { ...DEFAULT_PROCESSING },
      group: 'Group A',
    };
    expect(s.group).toBe('Group A');
  });

  it('group field is optional', () => {
    const s: Spectrum = {
      id: '2',
      name: 'Test2',
      filename: 'test.csv',
      format: 'unknown',
      wavelengths: [300],
      intensities: [0.5],
      color: '#00ff00',
      processing: { ...DEFAULT_PROCESSING },
    };
    expect(s.group).toBeUndefined();
  });
});

// ─── F6: Export CSV round-trip (integration) ──────────────────────────────

describe('CSV round-trip integration', () => {
  it('builds a valid SpectraView export CSV string and re-parses it', () => {
    // Simulate what Toolbar.exportCSV produces
    const names = ['Alpha', 'Beta'];
    const labels = ['My Label', ''];
    const yValues = ['2.5', ''];
    const groups = ['G1', 'G2'];
    const wavelengths = [300, 310, 320];
    const alphaData = [0.1, 0.2, 0.3];
    const betaData = [0.4, 0.5, 0.6];

    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines: string[] = [
      ['##SpectraView', 'v1'].join(','),
      ['#Name', ...names.map(q)].join(','),
      ['#Label', ...labels.map(q)].join(','),
      ['#YValue', ...yValues.map(q)].join(','),
      ['#Group', ...groups.map(q)].join(','),
      ['Wavelength (nm)', ...names.map(q)].join(','),
      ...wavelengths.map((w, i) => `${w},${alphaData[i]},${betaData[i]}`),
    ];

    const csvText = lines.join('\n');
    const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });
    const rows = parsed.data as string[][];

    expect(detectFormat(rows)).toBe('spectraview');

    const spectra = parseSpectraViewExport(rows, 'roundtrip.csv');
    expect(spectra).toHaveLength(2);
    expect(spectra[0]!.name).toBe('Alpha');
    expect(spectra[0]!.label).toBe('My Label');
    expect(spectra[0]!.yValue).toBe(2.5);
    expect(spectra[0]!.group).toBe('G1');
    expect(spectra[1]!.name).toBe('Beta');
    expect(spectra[1]!.label).toBeUndefined();
    expect(spectra[1]!.yValue).toBeUndefined();
    expect(spectra[1]!.group).toBe('G2');
    expect(spectra[0]!.wavelengths).toEqual([300, 310, 320]);
    expect(spectra[0]!.intensities).toEqual([0.1, 0.2, 0.3]);
    expect(spectra[1]!.intensities).toEqual([0.4, 0.5, 0.6]);
  });
});
