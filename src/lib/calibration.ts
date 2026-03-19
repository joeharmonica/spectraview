import type { Spectrum } from '../types/spectrum';
import type {
  ModelConfig, ModelType, FeatureStrategy, SampleLabel,
  CalibrationResults, PredictionRow, CoefficientRow,
} from '../types/calibration';
import { applyProcessing, findPeaks } from './processing';

// ─── Matrix helpers ────────────────────────────────────────────────────────────

function transpose(A: number[][]): number[][] {
  const rows = A.length, cols = A[0]!.length;
  return Array.from({ length: cols }, (_, j) =>
    Array.from({ length: rows }, (__, i) => A[i]![j]!));
}

function matMul(A: number[][], B: number[][]): number[][] {
  const n = A.length, m = B[0]!.length, k = B.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (__, j) =>
      Array.from({ length: k }, (___, l) => A[i]![l]! * B[l]![j]!).reduce((a, b) => a + b, 0)));
}

/** Gaussian elimination with partial pivoting */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[maxRow]![col]!)) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow]!, M[col]!];
    const pivot = M[col]![col]!;
    if (Math.abs(pivot) < 1e-12) continue;
    for (let row = col + 1; row < n; row++) {
      const f = M[row]![col]! / pivot;
      for (let j = col; j <= n; j++) M[row]![j]! -= f * M[col]![j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i]![n]!;
    for (let j = i + 1; j < n; j++) s -= M[i]![j]! * x[j]!;
    x[i] = s / M[i]![i]!;
  }
  return x;
}

function vecNorm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function vecDot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i]!, 0);
}

function colMean(X: number[][], j: number): number {
  return X.reduce((s, row) => s + row[j]!, 0) / X.length;
}

function colStd(X: number[][], j: number, mean: number): number {
  const variance = X.reduce((s, row) => s + (row[j]! - mean) ** 2, 0) / X.length;
  return Math.sqrt(variance) || 1;
}

// ─── Scaling ───────────────────────────────────────────────────────────────────

function scaleX(X: number[][], autoScale: boolean): { Xsc: number[][]; means: number[]; stds: number[] } {
  const p = X[0]!.length;
  const means = Array.from({ length: p }, (_, j) => autoScale ? colMean(X, j) : 0);
  const stds  = Array.from({ length: p }, (_, j) => autoScale ? colStd(X, j, means[j]!) : 1);
  const Xsc = X.map(row => row.map((v, j) => (v - means[j]!) / stds[j]!));
  return { Xsc, means, stds };
}

function applyScale(row: number[], means: number[], stds: number[]): number[] {
  return row.map((v, j) => (v - means[j]!) / stds[j]!);
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export function rSquared(yTrue: number[], yPred: number[]): number {
  const mean = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
  const ss_tot = yTrue.reduce((s, v) => s + (v - mean) ** 2, 0);
  const ss_res = yTrue.reduce((s, v, i) => s + (v - yPred[i]!) ** 2, 0);
  return ss_tot === 0 ? 0 : 1 - ss_res / ss_tot;
}

export function rmse(yTrue: number[], yPred: number[]): number {
  return Math.sqrt(yTrue.reduce((s, v, i) => s + (v - yPred[i]!) ** 2, 0) / yTrue.length);
}

export function mae(yTrue: number[], yPred: number[]): number {
  return yTrue.reduce((s, v, i) => s + Math.abs(v - yPred[i]!), 0) / yTrue.length;
}

// ─── MLR ──────────────────────────────────────────────────────────────────────

function fitMLR(X: number[][], y: number[]): number[] {
  const XT = transpose(X);
  const XTX = matMul(XT, X);
  const XTy = XT.map(row => vecDot(row, y));
  return solveLinear(XTX, XTy);
}

// ─── Ridge ────────────────────────────────────────────────────────────────────

function fitRidge(X: number[][], y: number[], lambda: number): number[] {
  const XT = transpose(X);
  const XTX = matMul(XT, X);
  const p = XTX.length;
  for (let i = 0; i < p; i++) XTX[i]![i]! += lambda;
  const XTy = XT.map(row => vecDot(row, y));
  return solveLinear(XTX, XTy);
}

// ─── Lasso (coordinate descent) ───────────────────────────────────────────────

function softThreshold(z: number, gamma: number): number {
  if (z > gamma) return z - gamma;
  if (z < -gamma) return z + gamma;
  return 0;
}

function fitLasso(X: number[][], y: number[], lambda: number, maxIter = 500): number[] {
  const n = X.length, p = X[0]!.length;
  const beta = new Array<number>(p).fill(0);
  // Precompute column norms squared
  const xNorm2 = Array.from({ length: p }, (_, j) =>
    X.reduce((s, row) => s + row[j]! ** 2, 0) / n);

  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;
    for (let j = 0; j < p; j++) {
      const oldBeta = beta[j]!;
      // Partial residual
      const rho = X.reduce((s, row, i) => {
        const pred = row.reduce((ps, v, l) => ps + v * beta[l]!, 0) - row[j]! * oldBeta;
        return s + row[j]! * (y[i]! - pred);
      }, 0) / n;
      const norm2 = xNorm2[j]!;
      beta[j] = norm2 > 0 ? softThreshold(rho, lambda) / norm2 : 0;
      maxChange = Math.max(maxChange, Math.abs(beta[j]! - oldBeta));
    }
    if (maxChange < 1e-6) break;
  }
  return beta;
}

// ─── PLS-NIPALS (PLS1) ────────────────────────────────────────────────────────

interface PLSModel {
  W: number[][];  // p × K weight matrix
  P: number[][];  // p × K X-loadings
  bVec: number[]; // K inner regression coefficients
  yMean: number;
  means: number[];
  stds: number[];
  nComp: number;
}

function fitPLS(X: number[][], y: number[], nComp: number, autoScale: boolean): PLSModel {
  const { Xsc, means, stds } = scaleX(X, autoScale);
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  let Xc = Xsc.map(row => [...row]);
  let yc = y.map(v => v - yMean);

  const W: number[][] = [];
  const P: number[][] = [];
  const bVec: number[] = [];

  const K = Math.min(nComp, Math.min(X.length - 1, X[0]!.length));
  for (let k = 0; k < K; k++) {
    // Compute w = X'y / ||X'y||
    const XT = transpose(Xc);
    let w = XT.map(col => vecDot(col, yc));
    const wn = vecNorm(w);
    if (wn < 1e-12) break;
    w = w.map(v => v / wn);

    // Scores: t = Xw
    const t = Xc.map(row => vecDot(row, w));
    const tt = vecDot(t, t);
    if (tt < 1e-12) break;

    // X-loadings: p = X't/t't
    const p = XT.map(col => vecDot(col, t) / tt);

    // Inner regression: b = y't/t't
    const b = vecDot(yc, t) / tt;

    // Deflate
    Xc = Xc.map((row, i) => row.map((v, j) => v - t[i]! * p[j]!));
    yc = yc.map((v, i) => v - b * t[i]!);

    W.push(w);
    P.push(p);
    bVec.push(b);
  }

  return { W, P, bVec, yMean, means, stds, nComp: W.length };
}

function predictPLS(model: PLSModel, Xnew: number[][]): number[] {
  return Xnew.map(row => {
    const xc = applyScale(row, model.means, model.stds);
    let xd = [...xc];
    let pred = model.yMean;
    for (let k = 0; k < model.nComp; k++) {
      const t = vecDot(xd, model.W[k]!);
      pred += model.bVec[k]! * t;
      xd = xd.map((v, j) => v - t * model.P[k]![j]!);
    }
    return pred;
  });
}

function plsCoefficients(model: PLSModel): number[] {
  // β = W*(P'W)^{-1}*bVec (then unscaled)
  // For display: return W_star * bVec as the combined coefficient
  const K = model.nComp;
  const p = model.W[0]!.length;

  // β ≈ sum_k(b_k * w_k) (approximate but numerically safe for display)
  // β ≈ sum_k(b_k * w_k) (approximate but numerically safe for display)
  const beta = new Array<number>(p).fill(0);
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < p; j++) {
      beta[j] += model.bVec[k]! * model.W[k]![j]!;
    }
  }
  // Unscale: beta_orig = beta / std
  return beta.map((v, j) => model.stds[j]! > 0 ? v / model.stds[j]! : v);
}


// ─── PCR ──────────────────────────────────────────────────────────────────────

interface PCRModel {
  V: number[][];  // p × K eigenvectors (loadings)
  b: number[];    // K regression coefficients
  yMean: number;
  means: number[];
  stds: number[];
}

/** Power iteration for top K eigenvectors of X'X */
function powerPCA(Xc: number[][], K: number): number[][] {
  const p = Xc[0]!.length;
  const XTX = matMul(transpose(Xc), Xc);
  const vectors: number[][] = [];

  let A = XTX.map(row => [...row]);
  for (let k = 0; k < K; k++) {
    // Random init
    let v = Array.from({ length: p }, () => Math.random() - 0.5);
    const vn = vecNorm(v);
    v = v.map(x => x / vn);

    for (let iter = 0; iter < 200; iter++) {
      let vNew = A.map(row => vecDot(row, v));
      // Deflate against previous vectors (Gram-Schmidt)
      for (const prev of vectors) {
        const proj = vecDot(vNew, prev);
        vNew = vNew.map((x, i) => x - proj * prev[i]!);
      }
      const norm = vecNorm(vNew);
      if (norm < 1e-12) break;
      const vNewN = vNew.map(x => x / norm);
      const diff = vecNorm(vNewN.map((x, i) => x - v[i]!));
      v = vNewN;
      if (diff < 1e-8) break;
    }
    vectors.push(v);

    // Deflate A: A = A - λ*v*v', λ = v'Av
    const lam = vecDot(v, A.map(row => vecDot(row, v)));
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        A[i]![j]! -= lam * v[i]! * v[j]!;
      }
    }
  }
  return vectors; // K × p
}

function fitPCR(X: number[][], y: number[], nComp: number, autoScale: boolean): PCRModel {
  const { Xsc, means, stds } = scaleX(X, autoScale);
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  const yc = y.map(v => v - yMean);

  const K = Math.min(nComp, Math.min(X.length - 1, X[0]!.length));
  const eigvecs = powerPCA(Xsc, K);
  // Scores: T = Xsc * V' (n × K)
  const T = Xsc.map(row => eigvecs.map(v => vecDot(row, v)));
  // Regress yc on T: b = (T'T)^{-1} T'yc
  const TT = matMul(transpose(T), T);
  const TTy = transpose(T).map(col => vecDot(col, yc));
  const b = solveLinear(TT, TTy);

  return { V: eigvecs, b, yMean, means, stds };
}

function predictPCR(model: PCRModel, Xnew: number[][]): number[] {
  return Xnew.map(row => {
    const xc = applyScale(row, model.means, model.stds);
    const scores = model.V.map(v => vecDot(xc, v));
    return model.yMean + vecDot(scores, model.b);
  });
}

// ─── Feature extraction ────────────────────────────────────────────────────────

export function extractFeatures(
  spectra: Spectrum[],
  labels: SampleLabel[],
  strategy: FeatureStrategy,
): { X: number[][]; featureLabels: string[]; includedIds: string[] } {
  const included = labels.filter(l => l.yValue !== null);
  const spectraMap = new Map(spectra.map(s => [s.id, s]));

  if (strategy.type === 'full_spectrum' || strategy.type === 'wavelength_range') {
    // Use processed intensities interpolated to a common wavelength grid
    const rows: number[][] = [];
    let featureWavelengths: number[] = [];

    for (const label of included) {
      const s = spectraMap.get(label.spectrumId);
      if (!s) continue;
      const y = applyProcessing(s.wavelengths, s.intensities, s.processing);
      let wl = s.wavelengths;
      let ys = y;
      if (strategy.type === 'wavelength_range') {
        const inRange = wl.map((w, i) => ({ w, y: ys[i]! })).filter(p => p.w >= strategy.minWl && p.w <= strategy.maxWl);
        wl = inRange.map(p => p.w);
        ys = inRange.map(p => p.y);
      }
      if (featureWavelengths.length === 0) featureWavelengths = wl;
      rows.push(ys);
    }
    return {
      X: rows,
      featureLabels: featureWavelengths.map(w => w.toFixed(1) + ' nm'),
      includedIds: included.map(l => l.spectrumId),
    };
  }

  if (strategy.type === 'wavelength_ranges') {
    // Concatenate intensities from multiple wavelength windows into one feature row
    const rows: number[][] = [];
    let featureLabels: string[] = [];

    for (const label of included) {
      const s = spectraMap.get(label.spectrumId);
      if (!s) continue;
      const y = applyProcessing(s.wavelengths, s.intensities, s.processing);
      const rowValues: number[] = [];
      const thisLabels: string[] = [];
      for (const range of strategy.ranges) {
        const inRange = s.wavelengths
          .map((w, i) => ({ w, y: y[i]! }))
          .filter(p => p.w >= range.minWl && p.w <= range.maxWl);
        rowValues.push(...inRange.map(p => p.y));
        thisLabels.push(...inRange.map(p => p.w.toFixed(1) + ' nm'));
      }
      if (featureLabels.length === 0) featureLabels = thisLabels;
      rows.push(rowValues);
    }
    return {
      X: rows,
      featureLabels,
      includedIds: included.map(l => l.spectrumId),
    };
  }

  if (strategy.type === 'specific_wavelengths') {
    const targets = strategy.wavelengths;
    const rows: number[][] = [];
    for (const label of included) {
      const s = spectraMap.get(label.spectrumId);
      if (!s) { rows.push(targets.map(() => 0)); continue; }
      const y = applyProcessing(s.wavelengths, s.intensities, s.processing);
      const row = targets.map(wt => {
        let best = 0, bestD = Infinity;
        s.wavelengths.forEach((w, i) => { const d = Math.abs(w - wt); if (d < bestD) { bestD = d; best = i; } });
        return y[best] ?? 0;
      });
      rows.push(row);
    }
    return {
      X: rows,
      featureLabels: targets.map(w => w.toFixed(1) + ' nm'),
      includedIds: included.map(l => l.spectrumId),
    };
  }

  // peak_heights
  {
    // Collect all peak wavelengths across all spectra, then build common feature set
    const allPeakWls = new Set<string>();
    const spectraPeaks = new Map<string, Map<string, number>>();

    for (const label of included) {
      const s = spectraMap.get(label.spectrumId);
      if (!s) continue;
      const y = applyProcessing(s.wavelengths, s.intensities, s.processing);
      const peaks = findPeaks(s.wavelengths, y, strategy.minProminence / 100);
      const peakMap = new Map<string, number>();
      for (const p of peaks) {
        const key = p.wavelength.toFixed(1);
        allPeakWls.add(key);
        peakMap.set(key, p.intensity);
      }
      spectraPeaks.set(label.spectrumId, peakMap);
    }

    const sortedWls = [...allPeakWls].sort((a, b) => parseFloat(a) - parseFloat(b));
    const rows: number[][] = included.map(label => {
      const pm = spectraPeaks.get(label.spectrumId) ?? new Map();
      return sortedWls.map(wl => pm.get(wl) ?? 0);
    });
    return {
      X: rows,
      featureLabels: sortedWls.map(w => w + ' nm'),
      includedIds: included.map(l => l.spectrumId),
    };
  }
}

// ─── Cross-validation ─────────────────────────────────────────────────────────

function kFoldCV(X: number[][], y: number[], config: ModelConfig, folds: number): number {
  const n = X.length;
  const foldSize = Math.floor(n / folds);
  let totalSE = 0, totalN = 0;

  for (let f = 0; f < folds; f++) {
    const testStart = f * foldSize;
    const testEnd = f === folds - 1 ? n : testStart + foldSize;
    const Xtrain = [...X.slice(0, testStart), ...X.slice(testEnd)];
    const ytrain = [...y.slice(0, testStart), ...y.slice(testEnd)];
    const Xtest = X.slice(testStart, testEnd);
    const ytest = y.slice(testStart, testEnd);

    if (Xtrain.length < 2) continue;
    try {
      const preds = fitAndPredict(Xtrain, ytrain, Xtest, config);
      for (let i = 0; i < ytest.length; i++) {
        totalSE += (ytest[i]! - preds[i]!) ** 2;
        totalN++;
      }
    } catch { /* skip degenerate fold */ }
  }
  return totalN > 0 ? Math.sqrt(totalSE / totalN) : NaN;
}

function fitAndPredict(
  Xtrain: number[][], ytrain: number[],
  Xtest: number[][], config: ModelConfig,
): number[] {
  const { model, nComponents, lambda, autoScale } = config;
  const yMean = ytrain.reduce((a, b) => a + b, 0) / ytrain.length;

  const { Xsc: XtrSc, means, stds } = scaleX(Xtrain, autoScale);
  const yc = ytrain.map(v => v - yMean);
  const XteSc = Xtest.map(row => applyScale(row, means, stds));

  if (model === 'pls') {
    const m = fitPLS(Xtrain, ytrain, nComponents, autoScale);
    return predictPLS(m, Xtest);
  }
  if (model === 'pcr') {
    const m = fitPCR(Xtrain, ytrain, nComponents, autoScale);
    return predictPCR(m, Xtest);
  }
  if (model === 'mlr') {
    const coef = fitMLR(XtrSc, yc);
    return XteSc.map(row => vecDot(row, coef) + yMean);
  }
  if (model === 'ridge') {
    const coef = fitRidge(XtrSc, yc, lambda);
    return XteSc.map(row => vecDot(row, coef) + yMean);
  }
  // lasso
  const coef = fitLasso(XtrSc, yc, lambda);
  return XteSc.map(row => vecDot(row, coef) + yMean);
}

// ─── LOOCV RMSE for component selection ───────────────────────────────────────

export function loocvRmseByComponent(
  X: number[][], y: number[], maxComp: number, model: 'pls' | 'pcr', autoScale: boolean,
): number[] {
  const n = X.length;
  const results: number[] = [];
  for (let k = 1; k <= maxComp; k++) {
    let se = 0;
    let valid = 0;
    for (let i = 0; i < n; i++) {
      const Xtr = [...X.slice(0, i), ...X.slice(i + 1)];
      const ytr = [...y.slice(0, i), ...y.slice(i + 1)];
      try {
        const preds = model === 'pls'
          ? predictPLS(fitPLS(Xtr, ytr, k, autoScale), [X[i]!])
          : predictPCR(fitPCR(Xtr, ytr, k, autoScale), [X[i]!]);
        se += (y[i]! - preds[0]!) ** 2;
        valid++;
      } catch { /* skip */ }
    }
    results.push(valid > 0 ? Math.sqrt(se / valid) : NaN);
  }
  return results;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runCalibration(
  spectra: Spectrum[],
  labels: SampleLabel[],
  config: ModelConfig,
): CalibrationResults {
  const spectraMap = new Map(spectra.map(s => [s.id, s]));
  const { X, featureLabels, includedIds } = extractFeatures(spectra, labels, config.features);
  const allLabels = labels.filter(l => l.yValue !== null);

  if (X.length < 2) throw new Error('Not enough labelled spectra (need ≥ 2).');

  const y = allLabels.map(l => l.yValue!);
  const splits = allLabels.map(l => l.split);

  const trainIdx = splits.map((s, i) => s === 'train' ? i : -1).filter(i => i >= 0);
  const testIdx  = splits.map((s, i) => s === 'test'  ? i : -1).filter(i => i >= 0);

  if (trainIdx.length < 2) throw new Error('Need at least 2 training samples.');

  const Xtrain = trainIdx.map(i => X[i]!);
  const ytrain = trainIdx.map(i => y[i]!);
  const Xtest  = testIdx.map(i => X[i]!);
  const ytest  = testIdx.map(i => y[i]!);

  // Fit model
  const trainPreds = fitAndPredict(Xtrain, ytrain, Xtrain, config);
  const testPreds  = testIdx.length > 0 ? fitAndPredict(Xtrain, ytrain, Xtest, config) : [];

  // Metrics
  const trainR2   = rSquared(ytrain, trainPreds);
  const trainRMSE = rmse(ytrain, trainPreds);
  const trainMAE  = mae(ytrain, trainPreds);
  const testR2    = testIdx.length > 0 ? rSquared(ytest, testPreds) : null;
  const testRMSE  = testIdx.length > 0 ? rmse(ytest, testPreds) : null;
  const testMAE   = testIdx.length > 0 ? mae(ytest, testPreds) : null;

  // CV
  let cvRMSE: number | null = null;
  if (config.cvFolds >= 2 && trainIdx.length >= config.cvFolds) {
    cvRMSE = kFoldCV(Xtrain, ytrain, config, config.cvFolds);
  }

  // Build predictions list
  const predictions: PredictionRow[] = [];
  trainIdx.forEach((gi, li) => {
    const s = spectraMap.get(includedIds[gi]!);
    const sl = allLabels[gi]!;
    predictions.push({
      spectrumId: includedIds[gi]!,
      spectrumLabel: s?.label || s?.name || includedIds[gi]!,
      split: sl.split,
      yTrue: sl.yValue!,
      yPred: trainPreds[li]!,
      residual: sl.yValue! - trainPreds[li]!,
    });
  });
  testIdx.forEach((gi, li) => {
    const s = spectraMap.get(includedIds[gi]!);
    const sl = allLabels[gi]!;
    predictions.push({
      spectrumId: includedIds[gi]!,
      spectrumLabel: s?.label || s?.name || includedIds[gi]!,
      split: sl.split,
      yTrue: sl.yValue!,
      yPred: testPreds[li]!,
      residual: sl.yValue! - testPreds[li]!,
    });
  });

  // Coefficients
  let coefficients: CoefficientRow[] = [];
  const { model, nComponents, lambda, autoScale } = config;
  if (model === 'pls') {
    const m = fitPLS(Xtrain, ytrain, nComponents, autoScale);
    const beta = plsCoefficients(m);
    coefficients = featureLabels.map((label, i) => ({ label, value: beta[i] ?? 0 }));
  } else if (model === 'pcr') {
    // Show explained variance per component (approximate via eigenvalue magnitude)
    coefficients = Array.from({ length: Math.min(nComponents, trainIdx.length - 1) }, (_, k) => ({
      label: `PC ${k + 1}`,
      value: 0, // placeholder — shown as component weight
    }));
  } else {
    // MLR / Ridge / Lasso: full coefficient vector
    const { Xsc, means: _means, stds } = scaleX(Xtrain, autoScale);
    const yMean = ytrain.reduce((a, b) => a + b, 0) / ytrain.length;
    const yc = ytrain.map(v => v - yMean);
    let coef: number[] = [];
    if (model === 'mlr') coef = fitMLR(Xsc, yc);
    else if (model === 'ridge') coef = fitRidge(Xsc, yc, lambda);
    else coef = fitLasso(Xsc, yc, lambda);
    // Unscale
    const coefOrig = coef.map((c, j) => stds[j]! > 0 ? c / stds[j]! : c);
    coefficients = featureLabels.map((label, i) => ({ label, value: coefOrig[i] ?? 0 }));
  }

  return {
    model,
    nComponents: config.nComponents,
    trainR2, trainRMSE, trainMAE,
    testR2, testRMSE, testMAE,
    cvRMSE,
    predictions,
    coefficients,
    featureLabels,
  };
}

// ─── CSV / Report generators ───────────────────────────────────────────────────

export function resultsToCsv(results: CalibrationResults): string {
  const lines = ['Spectrum,Split,Y True,Y Predicted,Residual'];
  for (const p of results.predictions) {
    lines.push(`"${p.spectrumLabel}",${p.split},${p.yTrue},${p.yPred.toFixed(6)},${p.residual.toFixed(6)}`);
  }
  return lines.join('\n');
}

export function coefficientsToCsv(results: CalibrationResults): string {
  const lines = ['Feature,Coefficient'];
  for (const c of results.coefficients) {
    lines.push(`"${c.label}",${c.value.toFixed(8)}`);
  }
  return lines.join('\n');
}

export function generateReportHtml(
  results: CalibrationResults,
  yLabel: string,
  scatterPng: string,
): string {
  const fmt = (v: number | null, d = 4) => v === null ? '—' : v.toFixed(d);
  const modelNames: Record<ModelType, string> = {
    pls: 'PLS-R (NIPALS)', pcr: 'PCR', mlr: 'MLR', ridge: 'Ridge', lasso: 'Lasso',
  };
  const rows = results.predictions.map(p =>
    `<tr><td>${p.spectrumLabel}</td><td>${p.split}</td><td>${p.yTrue}</td><td>${p.yPred.toFixed(4)}</td><td>${p.residual.toFixed(4)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>SpectraView Calibration Report</title>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1e293b}
h1{color:#3b82f6}h2{color:#475569;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left}
th{background:#f8fafc;font-weight:600}tr:nth-child(even){background:#f8fafc}
.metrics{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0}
.metric{background:#f1f5f9;border-radius:8px;padding:16px}.metric .label{font-size:12px;color:#64748b}
.metric .val{font-size:22px;font-weight:700;color:#1e293b}.badge{display:inline-block;background:#3b82f6;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px}
img{max-width:100%;border-radius:8px;margin:12px 0}
</style></head>
<body>
<h1>SpectraView Calibration Report</h1>
<p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
<p><strong>Model:</strong> <span class="badge">${modelNames[results.model]}</span> &nbsp;
   <strong>Components:</strong> ${results.nComponents} &nbsp;
   <strong>Response variable:</strong> ${yLabel}</p>

<h2>Metrics</h2>
<div class="metrics">
  <div class="metric"><div class="label">Train R²</div><div class="val">${fmt(results.trainR2)}</div></div>
  <div class="metric"><div class="label">Train RMSE</div><div class="val">${fmt(results.trainRMSE)}</div></div>
  <div class="metric"><div class="label">Train MAE</div><div class="val">${fmt(results.trainMAE)}</div></div>
  <div class="metric"><div class="label">Test R²</div><div class="val">${fmt(results.testR2)}</div></div>
  <div class="metric"><div class="label">Test RMSE</div><div class="val">${fmt(results.testRMSE)}</div></div>
  <div class="metric"><div class="label">Test MAE</div><div class="val">${fmt(results.testMAE)}</div></div>
  ${results.cvRMSE !== null ? `<div class="metric"><div class="label">CV RMSE</div><div class="val">${fmt(results.cvRMSE)}</div></div>` : ''}
</div>

<h2>Predicted vs Actual</h2>
<img src="${scatterPng}" alt="Scatter plot" />

<h2>Predictions</h2>
<table><thead><tr><th>Spectrum</th><th>Split</th><th>Y True</th><th>Y Predicted</th><th>Residual</th></tr></thead>
<tbody>${rows}</tbody></table>

</body></html>`;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function downloadResultsCsv(results: CalibrationResults) {
  downloadBlob(resultsToCsv(results), 'calibration_results.csv', 'text/csv');
}

export function downloadCoefficientsCsv(results: CalibrationResults) {
  downloadBlob(coefficientsToCsv(results), 'calibration_coefficients.csv', 'text/csv');
}

export function downloadReport(results: CalibrationResults, yLabel: string, scatterPng: string) {
  downloadBlob(generateReportHtml(results, yLabel, scatterPng), 'calibration_report.html', 'text/html');
}
