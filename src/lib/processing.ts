import type { ProcessingOptions } from '../types/spectrum';

/** Apply all processing options in order: crop → baseline → smooth → normalize */
export function applyProcessing(
  wavelengths: number[],
  intensities: number[],
  opts: ProcessingOptions,
): number[] {
  let wl = wavelengths;
  let y = intensities;

  if (opts.crop !== null) {
    const cropped = cropToRange(wl, y, opts.crop.minWl, opts.crop.maxWl);
    wl = cropped.wavelengths;
    y = cropped.intensities;
  }

  if (opts.baseline !== null) {
    y = subtractBaseline(wl, y, opts.baseline.degree);
  }

  if (opts.smooth !== null) {
    const w = ensureOdd(Math.max(5, Math.min(51, opts.smooth.windowSize)));
    const p = Math.max(2, Math.min(opts.smooth.polyOrder, w - 1));
    y = smoothSG(y, w, p);
  }

  if (opts.normalize !== null) {
    y = normalizeIntensities(wl, y, opts.normalize);
  }

  return y;
}

/** Crop wavelengths+intensities to [minWl, maxWl] range */
export function cropToRange(
  wavelengths: number[],
  intensities: number[],
  minWl: number,
  maxWl: number,
): { wavelengths: number[]; intensities: number[] } {
  const wl: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < wavelengths.length; i++) {
    const w = wavelengths[i]!;
    if (w >= minWl && w <= maxWl) {
      wl.push(w);
      y.push(intensities[i]!);
    }
  }
  return { wavelengths: wl, intensities: y };
}

export interface Peak {
  wavelength: number;
  intensity: number;
  index: number;
}

/**
 * Find local maxima with minimum prominence (fraction of max intensity).
 * Returns peaks sorted by intensity descending.
 */
export function findPeaks(
  wavelengths: number[],
  intensities: number[],
  minProminenceFraction = 0.05,
): Peak[] {
  if (intensities.length < 3) return [];
  const maxVal = intensities.reduce((a, b) => (b > a ? b : a), -Infinity);
  const threshold = maxVal * minProminenceFraction;
  const peaks: Peak[] = [];
  for (let i = 1; i < intensities.length - 1; i++) {
    const v = intensities[i]!;
    if (v > intensities[i - 1]! && v > intensities[i + 1]! && v >= threshold) {
      peaks.push({ wavelength: wavelengths[i]!, intensity: v, index: i });
    }
  }
  return peaks.sort((a, b) => b.intensity - a.intensity);
}

/**
 * Trapezoidal integration between wlMin and wlMax.
 * Returns 0 if no data points fall in range.
 */
export function integrateTrapezoid(
  wavelengths: number[],
  intensities: number[],
  wlMin: number,
  wlMax: number,
): number {
  let area = 0;
  let prev: { w: number; y: number } | null = null;
  for (let i = 0; i < wavelengths.length; i++) {
    const w = wavelengths[i]!;
    if (w < wlMin || w > wlMax) {
      prev = null;
      continue;
    }
    const cur = { w, y: intensities[i]! };
    if (prev !== null) {
      area += 0.5 * (cur.y + prev.y) * Math.abs(cur.w - prev.w);
    }
    prev = cur;
  }
  return area;
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeIntensities(
  wavelengths: number[],
  y: number[],
  mode: NonNullable<ProcessingOptions['normalize']>,
): number[] {
  if (mode === 'max') {
    const max = y.reduce((a, b) => (b > a ? b : a), -Infinity);
    if (max === 0 || !isFinite(max)) return y;
    return y.map(v => v / max);
  }

  if (mode === 'area') {
    // Trapezoidal integration
    let area = 0;
    for (let i = 1; i < y.length; i++) {
      area += 0.5 * ((y[i]! + y[i - 1]!)) * Math.abs(wavelengths[i]! - wavelengths[i - 1]!);
    }
    if (area === 0) return y;
    return y.map(v => v / area);
  }

  // Normalize by intensity at nearest wavelength
  const targetWl = (mode as { wavelength: number }).wavelength;
  const idx = nearestIndex(wavelengths, targetWl);
  const refVal = y[idx];
  if (!refVal || refVal === 0) return y;
  return y.map(v => v / refVal);
}

// ─── Savitzky-Golay smoothing ─────────────────────────────────────────────────

export function smoothSG(y: number[], windowSize: number, polyOrder: number): number[] {
  const half = Math.floor(windowSize / 2);
  const coeffs = sgCoefficients(windowSize, polyOrder);
  const result = [...y];

  for (let i = half; i < y.length - half; i++) {
    let sum = 0;
    for (let j = -half; j <= half; j++) {
      sum += coeffs[j + half]! * y[i + j]!;
    }
    result[i] = sum;
  }
  // Leave edges unchanged (mirroring is overkill for scientific display)
  return result;
}

/** Compute SG convolution coefficients using Gram polynomial approach */
function sgCoefficients(windowSize: number, polyOrder: number): number[] {
  const half = Math.floor(windowSize / 2);
  const n = windowSize;

  // Build Vandermonde matrix A (n × (polyOrder+1))
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    const x = i - half;
    for (let j = 0; j <= polyOrder; j++) {
      row.push(Math.pow(x, j));
    }
    A.push(row);
  }

  // Compute A^T A
  const AT = transpose(A);
  const ATA = matMul(AT, A);

  // e1 = unit vector for the constant term in polynomial space [1, 0, 0, …]
  // Solving ATA * c = e1 extracts the coefficient that gives the fitted value at x=0 (center)
  const e1 = Array.from({ length: polyOrder + 1 }, (_, i) => (i === 0 ? 1 : 0));
  const c = solveLinear(ATA, e1);

  // The smoothing coefficients are A * c
  return A.map(row => row.reduce((sum, v, j) => sum + v * (c[j] ?? 0), 0));
}

function transpose(M: number[][]): number[][] {
  const rows = M.length, cols = M[0]!.length;
  return Array.from({ length: cols }, (_, j) => Array.from({ length: rows }, (__, i) => M[i]![j]!));
}

function matMul(A: number[][], B: number[][]): number[][] {
  const n = A.length, m = B[0]!.length, k = B.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (__, j) =>
      Array.from({ length: k }, (___, l) => A[i]![l]! * B[l]![j]!).reduce((a, b) => a + b, 0)
    )
  );
}

/** Simple Gaussian elimination with partial pivoting */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  // Augment [A|b]
  const M = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[maxRow]![col]!)) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow]!, M[col]!];

    const pivot = M[col]![col]!;
    if (Math.abs(pivot) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = M[row]![col]! / pivot;
      for (let j = col; j <= n; j++) {
        M[row]![j]! -= factor * M[col]![j]!;
      }
    }
  }

  // Back substitution
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i]![n]!;
    for (let j = i + 1; j < n; j++) sum -= M[i]![j]! * x[j]!;
    x[i] = sum / M[i]![i]!;
  }
  return x;
}

// ─── Baseline correction ──────────────────────────────────────────────────────

export function subtractBaseline(wavelengths: number[], y: number[], degree: number): number[] {
  // Fit polynomial of given degree to the data using least squares, then subtract
  const n = wavelengths.length;
  const d = Math.min(degree, 5);

  // Normalize x to [-1, 1] for numerical stability
  const xMin = wavelengths[0]!;
  const xMax = wavelengths[n - 1]!;
  const xRange = xMax - xMin || 1;
  const xNorm = wavelengths.map(x => 2 * (x - xMin) / xRange - 1);

  // Build Vandermonde matrix
  const V: number[][] = xNorm.map(x => Array.from({ length: d + 1 }, (_, j) => Math.pow(x, j)));
  const VT = transpose(V);
  const VTV = matMul(VT, V);
  const VTy = VT.map(row => row.reduce((sum, v, i) => sum + v * y[i]!, 0));

  const coeffs = solveLinear(VTV, VTy);
  const baseline = V.map(row => row.reduce((sum, v, j) => sum + v * (coeffs[j] ?? 0), 0));

  return y.map((v, i) => v - baseline[i]!);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function nearestIndex(arr: number[], target: number): number {
  let best = 0;
  let bestDist = Math.abs(arr[0]! - target);
  for (let i = 1; i < arr.length; i++) {
    const d = Math.abs(arr[i]! - target);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

export function ensureOdd(n: number): number {
  return n % 2 === 0 ? n + 1 : n;
}
