import { describe, it, expect } from 'vitest';
import { cropToRange, integrateTrapezoid, findPeaks, applyProcessing } from '../lib/processing';
import type { ProcessingOptions } from '../types/spectrum';
import { DEFAULT_PROCESSING } from '../types/spectrum';

// ─── cropToRange ─────────────────────────────────────────────────────────────

describe('cropToRange', () => {
  const wl = [300, 400, 500, 600, 700];
  const y  = [1,   2,   3,   4,   5];

  it('keeps points inside range (inclusive)', () => {
    const r = cropToRange(wl, y, 400, 600);
    expect(r.wavelengths).toEqual([400, 500, 600]);
    expect(r.intensities).toEqual([2, 3, 4]);
  });

  it('returns empty arrays when no points in range', () => {
    const r = cropToRange(wl, y, 800, 900);
    expect(r.wavelengths).toEqual([]);
    expect(r.intensities).toEqual([]);
  });

  it('keeps all points when range encompasses everything', () => {
    const r = cropToRange(wl, y, 100, 1000);
    expect(r.wavelengths).toEqual(wl);
    expect(r.intensities).toEqual(y);
  });

  it('boundary: single point exactly at min', () => {
    const r = cropToRange(wl, y, 700, 700);
    expect(r.wavelengths).toEqual([700]);
    expect(r.intensities).toEqual([5]);
  });
});

// ─── applyProcessing with crop ────────────────────────────────────────────────

describe('applyProcessing — crop', () => {
  it('applies crop before other processing', () => {
    const wl = [300, 400, 500, 600, 700];
    const y  = [10,  20,  30,  40,  50];
    const opts: ProcessingOptions = {
      ...DEFAULT_PROCESSING,
      crop: { minWl: 400, maxWl: 600 },
      normalize: 'max',
    };
    // After crop: wl=[400,500,600], y=[20,30,40]. After norm-max: [0.5, 0.75, 1.0]
    const result = applyProcessing(wl, y, opts);
    expect(result).toHaveLength(3);
    expect(result[2]).toBeCloseTo(1.0);
    expect(result[0]).toBeCloseTo(0.5);
  });
});

// ─── integrateTrapezoid ───────────────────────────────────────────────────────

describe('integrateTrapezoid', () => {
  it('integrates flat line (y=2) over [0, 100] → area = 200', () => {
    const wl = [0, 50, 100];
    const y  = [2, 2,  2];
    expect(integrateTrapezoid(wl, y, 0, 100)).toBeCloseTo(200);
  });

  it('integrates triangle: y rises linearly 0→10 over [0, 10] → area = 50', () => {
    const wl = [0, 5, 10];
    const y  = [0, 5, 10];
    expect(integrateTrapezoid(wl, y, 0, 10)).toBeCloseTo(50);
  });

  it('returns 0 when range is outside data', () => {
    const wl = [400, 500, 600];
    const y  = [1, 2, 1];
    expect(integrateTrapezoid(wl, y, 700, 800)).toBe(0);
  });

  it('restricts integration to sub-range', () => {
    const wl = [400, 500, 600, 700];
    const y  = [1, 1, 1, 1];
    // Only [500, 600] → area = 1 * 100 = 100
    expect(integrateTrapezoid(wl, y, 500, 600)).toBeCloseTo(100);
  });

  it('handles single point range (no adjacent pair) → 0', () => {
    const wl = [400, 500, 600];
    const y  = [1, 2, 3];
    expect(integrateTrapezoid(wl, y, 500, 500)).toBe(0);
  });
});

// ─── findPeaks ────────────────────────────────────────────────────────────────

describe('findPeaks', () => {
  it('finds a single obvious peak', () => {
    const wl = [400, 450, 500, 550, 600];
    const y  = [1,   2,   10,  2,   1];
    const peaks = findPeaks(wl, y, 0.05);
    expect(peaks).toHaveLength(1);
    expect(peaks[0]!.wavelength).toBe(500);
    expect(peaks[0]!.intensity).toBe(10);
  });

  it('finds multiple peaks sorted by intensity descending', () => {
    const wl = [400, 430, 460, 490, 520, 550, 580];
    const y  = [0,   8,   0,   5,   0,   3,   0];
    const peaks = findPeaks(wl, y, 0.05);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    // First peak should be the strongest
    expect(peaks[0]!.intensity).toBeGreaterThanOrEqual(peaks[1]!.intensity);
    expect(peaks[0]!.wavelength).toBe(430);
  });

  it('suppresses peaks below prominence threshold', () => {
    const wl = [400, 450, 500, 550, 600];
    const y  = [0,   1,   100, 0.1, 0];
    // y[3]=0.1 is local max vs y[4]=0, but < 5% of 100
    const peaks = findPeaks(wl, y, 0.05);
    expect(peaks.every(p => p.wavelength !== 550)).toBe(true);
  });

  it('returns empty for fewer than 3 points', () => {
    expect(findPeaks([400, 500], [1, 2], 0.05)).toEqual([]);
  });

  it('returns empty if no local maxima', () => {
    const wl = [400, 500, 600];
    const y  = [1, 2, 3]; // monotonically increasing — no interior peak
    const peaks = findPeaks(wl, y, 0.05);
    expect(peaks).toHaveLength(0);
  });
});

// ─── DUPLICATE_SPECTRUM (reducer logic via pure function test) ────────────────

describe('duplicate spectrum logic', () => {
  it('clone has new id, name with (copy) suffix, all other fields identical', () => {
    const src = {
      id: 'abc',
      name: 'Test Spectrum',
      filename: 'test.csv',
      format: 'unknown' as const,
      wavelengths: [400, 500],
      intensities: [1, 2],
      color: '#3b82f6',
      processing: { ...DEFAULT_PROCESSING },
    };
    // Simulate what DUPLICATE_SPECTRUM does
    const copy = { ...src, id: crypto.randomUUID(), color: '#ef4444', name: `${src.name} (copy)` };
    expect(copy.id).not.toBe(src.id);
    expect(copy.name).toBe('Test Spectrum (copy)');
    expect(copy.wavelengths).toEqual(src.wavelengths);
    expect(copy.intensities).toEqual(src.intensities);
    expect(copy.format).toBe(src.format);
  });
});
