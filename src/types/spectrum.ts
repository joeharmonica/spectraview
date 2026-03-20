export type SpectrumFormat = 'cary3500' | 'rf6000_2d' | 'rf6000_3d' | 'r1f' | 'unknown';

export type ViewMode = 'overlap' | 'stacked' | 'heatmap';

export interface ProcessingOptions {
  normalize: 'max' | 'area' | { wavelength: number } | null;
  smooth: { windowSize: number; polyOrder: number } | null;
  baseline: { degree: number } | null;
  crop: { minWl: number; maxWl: number } | null;
}

export const DEFAULT_PROCESSING: ProcessingOptions = {
  normalize: null,
  smooth: null,
  baseline: null,
  crop: null,
};

export interface Spectrum {
  id: string;
  name: string;
  filename: string;
  format: SpectrumFormat;
  wavelengths: number[];
  intensities: number[];
  metadata?: Record<string, string>;
  color: string;
  processing: ProcessingOptions;
  tags?: string[];
  /** User-defined chart label. When set, shown on the chart instead of `name`. */
  label?: string;
}

/** A peak selected by the user in the Peak Table to be highlighted on the chart. */
export interface HighlightedPeak {
  /** Stable key: `${spectrumId}_${wavelength.toFixed(3)}` */
  key: string;
  spectrumId: string;
  wavelength: number;
  color: string;
  /** Display name used in the annotation */
  spectrumLabel: string;
}

/** Returned by parseFile when format is unknown and user needs to map columns */
export interface ColumnMappingRequest {
  file: File;
  filename: string;
  /** First 30 raw rows for display and live preview computation */
  rawRows: string[][];
  /** Detected number of leading header rows (non-numeric) */
  suggestedHeaderRows: number;
  suggestedWavCol: number;
  /** All non-wavelength numeric columns — each becomes one spectrum */
  suggestedIntCols: number[];
}
