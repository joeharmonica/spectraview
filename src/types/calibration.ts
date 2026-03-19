export type ModelType = 'pls' | 'pcr' | 'mlr' | 'ridge' | 'lasso';

export type FeatureStrategy =
  | { type: 'full_spectrum' }
  | { type: 'wavelength_range'; minWl: number; maxWl: number }  // legacy — prefer wavelength_ranges
  | { type: 'wavelength_ranges'; ranges: Array<{ minWl: number; maxWl: number }> }
  | { type: 'specific_wavelengths'; wavelengths: number[] }
  | { type: 'peak_heights'; minProminence: number };

export interface SampleLabel {
  spectrumId: string;
  yValue: number | null; // null = exclude
  split: 'train' | 'test';
}

export interface ModelConfig {
  model: ModelType;
  features: FeatureStrategy;
  nComponents: number;   // PLS / PCR
  lambda: number;        // Ridge / Lasso
  autoScale: boolean;
  cvFolds: number;       // 0 = no CV
  compareAll: boolean;   // run all 5 models and include comparison table
}

export const DEFAULT_CONFIG: ModelConfig = {
  model: 'pls',
  features: { type: 'full_spectrum' },
  nComponents: 3,
  lambda: 1,
  autoScale: true,
  cvFolds: 5,
  compareAll: false,
};

export interface PredictionRow {
  spectrumId: string;
  spectrumLabel: string;
  split: 'train' | 'test';
  yTrue: number;
  yPred: number;
  residual: number;
}

export interface CoefficientRow {
  label: string;  // wavelength (nm) or "PC 1" etc.
  value: number;
}

export interface ModelComparisonRow {
  model: ModelType;
  label: string;
  trainR2: number;
  trainRMSE: number;
  testR2: number | null;
  testRMSE: number | null;
  cvRMSE: number | null;
}

export interface CalibrationResults {
  model: ModelType;
  nComponents: number;
  trainR2: number;
  trainRMSE: number;
  trainMAE: number;
  testR2: number | null;
  testRMSE: number | null;
  testMAE: number | null;
  cvRMSE: number | null;
  predictions: PredictionRow[];
  coefficients: CoefficientRow[];
  featureLabels: string[];
  /** Auto-generated human-readable quality summary */
  summary: string;
  /** Populated when config.compareAll = true */
  comparison: ModelComparisonRow[] | null;
}
