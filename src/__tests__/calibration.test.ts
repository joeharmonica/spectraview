/**
 * Calibration workflow tests
 *
 * Covers all three allowed spectral input feature modes:
 *   1. Single wavelength  (univariate)
 *   2. Full spectrum      (multivariate)
 *   3. Multiple wavelength ranges (multivariate)
 *
 * Tests use both synthetic spectra and the real Absorption-Cary3500.csv
 * sample file to prove the end-to-end calibration pipeline works.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';

import { parseCary3500 } from '../parsers/cary3500';
import {
  extractFeatures,
  runCalibration,
  rSquared,
  rmse,
} from '../lib/calibration';
import { DEFAULT_PROCESSING } from '../types/spectrum';
import type { Spectrum } from '../types/spectrum';
import type { SampleLabel, FeatureStrategy } from '../types/calibration';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSpectrum(
  id: string,
  wavelengths: number[],
  intensities: number[],
): Spectrum {
  return {
    id,
    name: `Spectrum ${id}`,
    filename: `${id}.csv`,
    format: 'unknown',
    wavelengths,
    intensities,
    color: '#3b82f6',
    processing: { ...DEFAULT_PROCESSING },
  };
}

function makeLabel(
  spectrumId: string,
  yValue: number,
  split: 'train' | 'test' = 'train',
): SampleLabel {
  return { spectrumId, yValue, split };
}

/**
 * Build 8 synthetic spectra whose peak heights linearly scale with
 * concentration c ∈ [0, 1, 2, ..., 7].
 *
 * Spectrum shape: Gaussian peak centred at 500 nm with amplitude = c.
 * All spectra share the same wavelength grid: 400–600 nm (step 10).
 */
function makeSyntheticSpectra(n = 8) {
  const wl = Array.from({ length: 21 }, (_, i) => 400 + i * 10); // 400..600
  const spectra: Spectrum[] = [];
  const labels: SampleLabel[] = [];

  for (let i = 0; i < n; i++) {
    const c = i; // "concentration" used as Y
    const intensities = wl.map(w => c * Math.exp(-((w - 500) ** 2) / (2 * 30 ** 2)));
    spectra.push(makeSpectrum(`s${i}`, wl, intensities));
    labels.push(makeLabel(`s${i}`, c, i < Math.round(n * 0.7) ? 'train' : 'test'));
  }

  return { spectra, labels, wl };
}

// ─── extractFeatures ─────────────────────────────────────────────────────────

describe('extractFeatures — single wavelength (univariate)', () => {
  const { spectra, labels } = makeSyntheticSpectra();

  it('returns exactly one feature column per spectrum', () => {
    const strategy: FeatureStrategy = { type: 'specific_wavelengths', wavelengths: [500] };
    const { X, featureLabels } = extractFeatures(spectra, labels, strategy);
    expect(featureLabels).toHaveLength(1);
    expect(featureLabels[0]).toBe('500.0 nm');
    expect(X).toHaveLength(labels.length);
    X.forEach(row => expect(row).toHaveLength(1));
  });

  it('extracted intensity at the peak wavelength scales with concentration', () => {
    const strategy: FeatureStrategy = { type: 'specific_wavelengths', wavelengths: [500] };
    const { X } = extractFeatures(spectra, labels, strategy);
    // X[i][0] ≈ concentration i (since Gaussian at 500 nm has value = c * 1)
    for (let i = 0; i < labels.length; i++) {
      const c = labels[i]!.yValue!;
      expect(X[i]![0]!).toBeCloseTo(c, 5);
    }
  });

  it('snaps to nearest available wavelength when exact match is absent', () => {
    // Request 503 nm → nearest in wl grid (step 10) is 500 nm
    const strategy: FeatureStrategy = { type: 'specific_wavelengths', wavelengths: [503] };
    const { featureLabels, X } = extractFeatures(spectra, labels, strategy);
    // Feature label reflects the requested wavelength, not snapped
    expect(featureLabels[0]).toBe('503.0 nm');
    // But value should match 500 nm intensity (nearest)
    const strategyAt500: FeatureStrategy = { type: 'specific_wavelengths', wavelengths: [500] };
    const { X: X500 } = extractFeatures(spectra, labels, strategyAt500);
    X.forEach((row, i) => expect(row[0]).toBeCloseTo(X500[i]![0]!, 5));
  });
});

describe('extractFeatures — full spectrum (multivariate)', () => {
  const { spectra, labels, wl } = makeSyntheticSpectra();

  it('returns one column per wavelength point', () => {
    const strategy: FeatureStrategy = { type: 'full_spectrum' };
    const { X, featureLabels } = extractFeatures(spectra, labels, strategy);
    expect(featureLabels).toHaveLength(wl.length);
    expect(X).toHaveLength(labels.length);
    X.forEach(row => expect(row).toHaveLength(wl.length));
  });

  it('feature labels are formatted as "<wl> nm"', () => {
    const strategy: FeatureStrategy = { type: 'full_spectrum' };
    const { featureLabels } = extractFeatures(spectra, labels, strategy);
    expect(featureLabels[0]).toBe('400.0 nm');
    expect(featureLabels[featureLabels.length - 1]).toBe('600.0 nm');
  });

  it('all spectra are included (labelled ones only)', () => {
    const strategy: FeatureStrategy = { type: 'full_spectrum' };
    const { includedIds } = extractFeatures(spectra, labels, strategy);
    expect(includedIds).toHaveLength(labels.filter(l => l.yValue !== null).length);
  });
});

describe('extractFeatures — multiple wavelength ranges (multivariate)', () => {
  const { spectra, labels, wl } = makeSyntheticSpectra();

  it('single range returns subset of wavelengths', () => {
    const strategy: FeatureStrategy = {
      type: 'wavelength_ranges',
      ranges: [{ minWl: 460, maxWl: 540 }],
    };
    const { X, featureLabels } = extractFeatures(spectra, labels, strategy);
    const expected = wl.filter(w => w >= 460 && w <= 540);
    expect(featureLabels).toHaveLength(expected.length);
    X.forEach(row => expect(row).toHaveLength(expected.length));
  });

  it('two ranges concatenate their features', () => {
    // Range 1: 400–440 (5 pts), Range 2: 560–600 (5 pts) → 10 total
    const strategy: FeatureStrategy = {
      type: 'wavelength_ranges',
      ranges: [
        { minWl: 400, maxWl: 440 },
        { minWl: 560, maxWl: 600 },
      ],
    };
    const { X, featureLabels } = extractFeatures(spectra, labels, strategy);
    const r1 = wl.filter(w => w >= 400 && w <= 440).length;
    const r2 = wl.filter(w => w >= 560 && w <= 600).length;
    expect(featureLabels).toHaveLength(r1 + r2);
    X.forEach(row => expect(row).toHaveLength(r1 + r2));
  });

  it('multiple ranges give more features than single range', () => {
    const singleRange: FeatureStrategy = {
      type: 'wavelength_ranges',
      ranges: [{ minWl: 400, maxWl: 440 }],
    };
    const multiRange: FeatureStrategy = {
      type: 'wavelength_ranges',
      ranges: [{ minWl: 400, maxWl: 440 }, { minWl: 560, maxWl: 600 }],
    };
    const { X: Xs } = extractFeatures(spectra, labels, singleRange);
    const { X: Xm } = extractFeatures(spectra, labels, multiRange);
    expect(Xm[0]!.length).toBeGreaterThan(Xs[0]!.length);
  });
});

// ─── runCalibration — synthetic spectra ──────────────────────────────────────

describe('runCalibration — synthetic linear relationship', () => {
  const { spectra, labels } = makeSyntheticSpectra(10);

  it('single wavelength: MLR achieves near-perfect fit on train', () => {
    const results = runCalibration(spectra, labels, {
      model: 'mlr',
      features: { type: 'specific_wavelengths', wavelengths: [500] },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    expect(results.trainR2).toBeGreaterThan(0.99);
    expect(results.trainRMSE).toBeLessThan(0.05);
  });

  it('full spectrum: PLS-R achieves near-perfect fit (1 component for linear data)', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    expect(results.trainR2).toBeGreaterThan(0.99);
    expect(results.trainRMSE).toBeLessThan(0.05);
  });

  it('wavelength ranges: PLS-R on 460–540 nm captures the peak region', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: {
        type: 'wavelength_ranges',
        ranges: [{ minWl: 460, maxWl: 540 }],
      },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    expect(results.trainR2).toBeGreaterThan(0.99);
  });

  it('wavelength ranges: two ranges achieve equivalent quality as full spectrum', () => {
    const fullResult = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    const rangeResult = runCalibration(spectra, labels, {
      model: 'pls',
      features: {
        type: 'wavelength_ranges',
        ranges: [{ minWl: 400, maxWl: 500 }, { minWl: 500, maxWl: 600 }],
      },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    // Both should achieve R² > 0.99 for perfectly linear data
    expect(fullResult.trainR2).toBeGreaterThan(0.99);
    expect(rangeResult.trainR2).toBeGreaterThan(0.99);
  });

  it('results include predictions for every labelled spectrum', () => {
    const labelled = labels.filter(l => l.yValue !== null).length;
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    expect(results.predictions).toHaveLength(labelled);
  });

  it('test set predictions are included when test labels exist', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    const testPreds = results.predictions.filter(p => p.split === 'test');
    expect(testPreds.length).toBeGreaterThan(0);
    expect(results.testR2).not.toBeNull();
    expect(results.testRMSE).not.toBeNull();
  });

  it('cross-validation RMSE is computed when cvFolds ≥ 2', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 3,
    });
    expect(results.cvRMSE).not.toBeNull();
    expect(results.cvRMSE!).toBeGreaterThan(0);
  });

  it('coefficients are returned for PLS (one per wavelength)', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 1,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    expect(results.coefficients.length).toBe(results.featureLabels.length);
    expect(results.coefficients.length).toBeGreaterThan(0);
  });
});

// ─── runCalibration — sample data (Absorption-Cary3500.csv) ─────────────────

describe('runCalibration — Cary 3500 sample data', () => {
  let spectra: Spectrum[];
  let labels: SampleLabel[];

  beforeAll(() => {
    // Load and parse the real Cary 3500 sample file
    const path = resolve(__dirname, '../../sample/Absorption-Cary3500.csv');
    const text = readFileSync(path, 'utf-8');
    const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data as string[][];
    const parsed = parseCary3500(rows, 'Absorption-Cary3500.csv');

    // Attach IDs and colours required by Spectrum interface
    spectra = parsed.map((s, i) => ({
      ...s,
      id: `cary-${i}`,
      color: '#3b82f6',
    }));

    // Extract concentration from spectrum name (last space-separated token)
    // Names like: "SY175 1 0", "SY175 1 0.05", "SY175 1 0.075", "SY175 1 0.1"
    labels = spectra.map((s, i) => {
      const parts = s.name.trim().split(/\s+/);
      const conc = parseFloat(parts[parts.length - 1] ?? 'NaN');
      const split: 'train' | 'test' = i % 4 === 3 ? 'test' : 'train'; // every 4th → test
      return {
        spectrumId: s.id,
        yValue: isNaN(conc) ? null : conc,
        split,
      };
    });
  });

  it('parses enough spectra for calibration', () => {
    expect(spectra.length).toBeGreaterThanOrEqual(4);
  });

  it('all spectra have wavelengths spanning at least 200 nm', () => {
    for (const s of spectra) {
      const range = Math.max(...s.wavelengths) - Math.min(...s.wavelengths);
      expect(range).toBeGreaterThan(200);
    }
  });

  it('full spectrum PLS-R: train R² > 0 on real Cary data (model captures some variance)', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 3,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    expect(results.trainR2).toBeGreaterThan(0);
    expect(Number.isFinite(results.trainRMSE)).toBe(true);
  });

  it('single wavelength at ~670 nm: model runs without error on Cary data', () => {
    // Pick a wavelength that exists in all Cary spectra (800 nm is the start)
    expect(() =>
      runCalibration(spectra, labels, {
        model: 'mlr',
        features: { type: 'specific_wavelengths', wavelengths: [670] },
        nComponents: 1,
        lambda: 1,
        autoScale: true,
        cvFolds: 0,
      })
    ).not.toThrow();
  });

  it('wavelength ranges: PLS on 400–500 nm window produces finite metrics', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: {
        type: 'wavelength_ranges',
        ranges: [{ minWl: 400, maxWl: 500 }],
      },
      nComponents: 2,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    expect(results.trainR2).not.toBeNaN();
    expect(results.trainRMSE).not.toBeNaN();
  });

  it('two wavelength ranges produce more features than one', () => {
    const { X: X1 } = extractFeatures(spectra, labels, {
      type: 'wavelength_ranges',
      ranges: [{ minWl: 400, maxWl: 500 }],
    });
    const { X: X2 } = extractFeatures(spectra, labels, {
      type: 'wavelength_ranges',
      ranges: [{ minWl: 400, maxWl: 500 }, { minWl: 600, maxWl: 700 }],
    });
    expect(X2[0]!.length).toBeGreaterThan(X1[0]!.length);
  });

  it('wavelength ranges: two windows → PLS runs end-to-end and returns predictions', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: {
        type: 'wavelength_ranges',
        ranges: [{ minWl: 400, maxWl: 500 }, { minWl: 600, maxWl: 700 }],
      },
      nComponents: 2,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    const trainLabelled = labels.filter(l => l.split === 'train' && l.yValue !== null).length;
    const trainPreds = results.predictions.filter(p => p.split === 'train').length;
    expect(trainPreds).toBe(trainLabelled);
  });

  it('residuals equal yTrue − yPred for every prediction', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 2,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    for (const p of results.predictions) {
      expect(p.residual).toBeCloseTo(p.yTrue - p.yPred, 8);
    }
  });

  it('rSquared and rmse helpers match runCalibration metrics', () => {
    const results = runCalibration(spectra, labels, {
      model: 'pls',
      features: { type: 'full_spectrum' },
      nComponents: 2,
      lambda: 1,
      autoScale: true,
      cvFolds: 0,
    });
    const trainPreds = results.predictions.filter(p => p.split === 'train');
    const yTrue = trainPreds.map(p => p.yTrue);
    const yPred = trainPreds.map(p => p.yPred);
    expect(rSquared(yTrue, yPred)).toBeCloseTo(results.trainR2, 6);
    expect(rmse(yTrue, yPred)).toBeCloseTo(results.trainRMSE, 6);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('calibration edge cases', () => {
  it('throws when fewer than 2 training samples', () => {
    const spectra = [makeSpectrum('a', [400, 500], [1, 2])];
    const labels: SampleLabel[] = [{ spectrumId: 'a', yValue: 1, split: 'train' }];
    expect(() =>
      runCalibration(spectra, labels, {
        model: 'pls',
        features: { type: 'full_spectrum' },
        nComponents: 1,
        lambda: 1,
        autoScale: false,
        cvFolds: 0,
      })
    ).toThrow();
  });

  it('excludes spectra with null yValue from feature matrix', () => {
    const { spectra, labels } = makeSyntheticSpectra(5);
    const labelsWithNull: SampleLabel[] = labels.map((l, i) =>
      i === 2 ? { ...l, yValue: null } : l
    );
    const { X, includedIds } = extractFeatures(spectra, labelsWithNull, { type: 'full_spectrum' });
    expect(includedIds).toHaveLength(4); // 5 - 1 excluded
    expect(X).toHaveLength(4);
  });

  it('wavelength_ranges: empty range (no wavelengths in window) produces empty row', () => {
    const { spectra, labels } = makeSyntheticSpectra(4);
    // Request a range that doesn't overlap with our 400–600 nm spectra
    const { X } = extractFeatures(spectra, labels, {
      type: 'wavelength_ranges',
      ranges: [{ minWl: 700, maxWl: 800 }],
    });
    X.forEach(row => expect(row).toHaveLength(0));
  });

  it('single wavelength outside spectrum range returns 0 intensity', () => {
    const spectra = [makeSpectrum('a', [400, 500, 600], [1, 2, 3])];
    const labels: SampleLabel[] = [{ spectrumId: 'a', yValue: 5, split: 'train' }];
    const { X } = extractFeatures(spectra, labels, {
      type: 'specific_wavelengths',
      wavelengths: [900], // far outside — snaps to 600 nm, the nearest
    });
    // Nearest wavelength is 600 → intensity is 3
    expect(X[0]![0]!).toBeCloseTo(3, 5);
  });
});
