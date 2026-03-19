import { describe, it, expect } from 'vitest';
import { applyProcessing, smoothSG, subtractBaseline } from '../lib/processing';
import type { ProcessingOptions } from '../types/spectrum';

const NO_OP: ProcessingOptions = { normalize: null, smooth: null, baseline: null, crop: null };

// ─── applyProcessing passthrough ─────────────────────────────────────────────

describe('applyProcessing — no-op', () => {
  it('returns original intensities unchanged when all opts are null', () => {
    const wav = [400, 500, 600];
    const int = [1, 2, 3];
    expect(applyProcessing(wav, int, NO_OP)).toEqual([1, 2, 3]);
  });

  it('handles empty arrays', () => {
    expect(applyProcessing([], [], NO_OP)).toEqual([]);
  });
});

// ─── Normalization ────────────────────────────────────────────────────────────

describe('normalize to max', () => {
  it('max value becomes 1.0', () => {
    const wav = [400, 500, 600];
    const int = [2, 10, 4];
    const result = applyProcessing(wav, int, { ...NO_OP, normalize: 'max' });
    expect(result[1]).toBeCloseTo(1.0);
    expect(result[0]).toBeCloseTo(0.2);
    expect(result[2]).toBeCloseTo(0.4);
  });

  it('all-zero input returns unchanged', () => {
    const result = applyProcessing([400, 500], [0, 0], { ...NO_OP, normalize: 'max' });
    expect(result).toEqual([0, 0]);
  });
});

describe('normalize by area', () => {
  it('integral of result is approximately 1 nm⁻¹', () => {
    const n = 101;
    const wav = Array.from({ length: n }, (_, i) => 400 + i);
    const int = Array.from({ length: n }, () => 2.0); // flat spectrum, area = 2 * 100 = 200
    const result = applyProcessing(wav, int, { ...NO_OP, normalize: 'area' });

    // trapezoidal integral of result should equal 1
    let area = 0;
    for (let i = 1; i < result.length; i++) {
      area += 0.5 * ((result[i]! + result[i - 1]!)) * (wav[i]! - wav[i - 1]!);
    }
    expect(area).toBeCloseTo(1.0, 3);
  });

  it('all-zero area input returns unchanged', () => {
    const result = applyProcessing([400, 500], [0, 0], { ...NO_OP, normalize: 'area' });
    expect(result).toEqual([0, 0]);
  });
});

describe('normalize at wavelength', () => {
  it('intensity at target wavelength becomes 1', () => {
    const wav = [400, 500, 600];
    const int = [5, 20, 8];
    const result = applyProcessing(wav, int, { ...NO_OP, normalize: { wavelength: 500 } });
    expect(result[1]).toBeCloseTo(1.0);
    expect(result[0]).toBeCloseTo(0.25);
    expect(result[2]).toBeCloseTo(0.4);
  });

  it('snaps to nearest wavelength when target is between points', () => {
    const wav = [400, 500, 600];
    const int = [5, 10, 8];
    // target 480 → nearest is 500
    const result = applyProcessing(wav, int, { ...NO_OP, normalize: { wavelength: 480 } });
    expect(result[1]).toBeCloseTo(1.0);
  });

  it('returns unchanged when reference intensity is zero', () => {
    const result = applyProcessing([400, 500], [0, 5], { ...NO_OP, normalize: { wavelength: 400 } });
    expect(result).toEqual([0, 5]);
  });
});

// ─── Savitzky-Golay Smoothing ─────────────────────────────────────────────────

describe('smoothSG', () => {
  it('returns array of same length', () => {
    const y = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.2));
    expect(smoothSG(y, 5, 2).length).toBe(50);
  });

  it('smooths noisy data (reduces variance in interior)', () => {
    // Known constant signal + noise: smoother should reduce variance
    const clean = Array.from({ length: 100 }, () => 5.0);
    const noisy = clean.map((v, i) => v + (i % 2 === 0 ? 0.5 : -0.5));
    const smoothed = smoothSG(noisy, 11, 2);
    // Interior points should be much closer to 5
    const interiorError = smoothed.slice(6, 94).map(v => Math.abs(v - 5.0));
    const maxErr = Math.max(...interiorError);
    expect(maxErr).toBeLessThan(0.2);
  });

  it('preserves a perfectly linear signal', () => {
    const y = Array.from({ length: 50 }, (_, i) => 2 * i + 1);
    const smoothed = smoothSG(y, 5, 2);
    // Interior points should remain linear
    for (let i = 3; i < 47; i++) {
      expect(smoothed[i]).toBeCloseTo(y[i]!, 1);
    }
  });

  it('applyProcessing chains smoothing correctly', () => {
    const wav = Array.from({ length: 60 }, (_, i) => 400 + i);
    const int = wav.map((_, i) => i % 2 === 0 ? 10 : 10.5); // small alternating noise
    const result = applyProcessing(wav, int, { ...NO_OP, smooth: { windowSize: 9, polyOrder: 2 } });
    // Interior should be smoothed toward ~10.25
    for (let i = 5; i < 55; i++) {
      expect(result[i]).toBeCloseTo(10.25, 0);
    }
  });
});

// ─── Baseline Subtraction ─────────────────────────────────────────────────────

describe('subtractBaseline', () => {
  it('removes a linear baseline (degree 1)', () => {
    const wav = Array.from({ length: 50 }, (_, i) => 400 + i * 10);
    // Pure linear baseline: y = 2x + 5 (where x is normalized). Residual should be ≈0
    const slope = 0.01;
    const int = wav.map(w => slope * w + 1.0);
    const result = subtractBaseline(wav, int, 1);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(0.0, 3);
    }
  });

  it('preserves a signal above a linear baseline', () => {
    const wav = [400, 500, 600, 700, 800];
    // Flat signal (1) on a rising baseline (0.01*w), Gaussian peak at 600
    const int = wav.map((w, i) => 1.0 * (i === 2 ? 5 : 1) + 0.005 * w);
    const result = subtractBaseline(wav, int, 1);
    // The peak at index 2 should remain the highest
    expect(result[2]).toBeGreaterThan(result[0]!);
    expect(result[2]).toBeGreaterThan(result[4]!);
  });

  it('returns same-length array', () => {
    const wav = [400, 500, 600];
    const int = [1, 2, 1];
    expect(subtractBaseline(wav, int, 2).length).toBe(3);
  });

  it('handles single-point edge case', () => {
    const result = subtractBaseline([500], [3], 1);
    expect(result.length).toBe(1);
  });
});

// ─── Processing chain order ───────────────────────────────────────────────────

describe('applyProcessing — chain order (baseline → smooth → normalize)', () => {
  it('applies all three in sequence without throwing', () => {
    const wav = Array.from({ length: 60 }, (_, i) => 400 + i * 5);
    const int = wav.map(w => Math.exp(-0.5 * Math.pow((w - 550) / 30, 2)) + 0.002 * w);
    const opts: ProcessingOptions = {
      baseline: { degree: 2 },
      smooth: { windowSize: 7, polyOrder: 2 },
      normalize: 'max',
      crop: null,
    };
    const result = applyProcessing(wav, int, opts);
    expect(result.length).toBe(wav.length);
    expect(Math.max(...result)).toBeCloseTo(1.0, 1);
  });
});
