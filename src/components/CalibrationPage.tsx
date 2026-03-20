import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import _PlotImport from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = ((_PlotImport as any).default ?? _PlotImport) as typeof _PlotImport;

import type { Spectrum } from '../types/spectrum';
import type { SampleLabel, ModelConfig, CalibrationResults, ModelType, FeatureStrategy } from '../types/calibration';
import { DEFAULT_CONFIG } from '../types/calibration';
import {
  runCalibration, loocvRmseByComponent,
  downloadResultsCsv, downloadCoefficientsCsv, downloadReport,
  extractFeatures, generateSummary, MODEL_LABELS, MODEL_NAMES,
} from '../lib/calibration';

// @ts-ignore
import * as _PlotlyRaw from 'plotly.js-dist-min';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PlotlyLib: any = (_PlotlyRaw as any).default ?? _PlotlyRaw;

const fmt = (v: number | null, d = 4) => v === null ? '—' : isNaN(v) ? 'err' : v.toFixed(d);

interface Props {
  spectra: Spectrum[];
  onClose: () => void;
}

// ─── Shared tooltip component ──────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const show = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({
        left: Math.max(8, Math.min(window.innerWidth - 256, r.left + r.width / 2 - 120)),
        top: r.top - 6,
      });
    }
  };
  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full
          bg-slate-200 text-slate-500 text-[9px] font-bold cursor-help ml-1.5 select-none flex-shrink-0"
      >?</span>
      {pos && (
        <div
          className="fixed w-60 bg-slate-800 text-white text-xs leading-relaxed
            rounded-xl px-3 py-2.5 shadow-xl pointer-events-none z-[9999]"
          style={{ left: pos.left, top: pos.top, transform: 'translateY(calc(-100% - 6px))' }}
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800" />
        </div>
      )}
    </>
  );
}

// ─── Section banner ────────────────────────────────────────────────────────────

function SectionBanner({ text, color = 'slate' }: { text: string; color?: 'blue' | 'amber' | 'violet' | 'slate' | 'emerald' }) {
  const cls = {
    blue:    'bg-blue-50 border-blue-100 text-blue-700',
    amber:   'bg-amber-50 border-amber-100 text-amber-700',
    violet:  'bg-violet-50 border-violet-100 text-violet-700',
    slate:   'bg-slate-50 border-slate-200 text-slate-500',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  }[color];
  return (
    <div className={`border rounded-lg px-3 py-2 text-xs leading-relaxed mb-3 ${cls}`}>{text}</div>
  );
}

// ─── Step 1: Variables & Labels ────────────────────────────────────────────────

function Step1Labels({
  spectra, labels, yLabel, features,
  onLabelsChange, onYLabelChange, onFeaturesChange,
}: {
  spectra: Spectrum[];
  labels: SampleLabel[];
  yLabel: string;
  features: FeatureStrategy;
  onLabelsChange: (l: SampleLabel[]) => void;
  onYLabelChange: (s: string) => void;
  onFeaturesChange: (f: FeatureStrategy) => void;
}) {
  const update = (id: string, patch: Partial<SampleLabel>) =>
    onLabelsChange(labels.map(l => l.spectrumId === id ? { ...l, ...patch } : l));

  const setAllSplit = (split: 'train' | 'test') =>
    onLabelsChange(labels.map(l => ({ ...l, split })));

  const randomSplit = (fraction: number) => {
    const shuffled = [...labels].sort(() => Math.random() - 0.5);
    const trainN = Math.round(fraction * shuffled.length);
    onLabelsChange(shuffled.map((l, i) => ({ ...l, split: i < trainN ? 'train' : 'test' })));
  };

  const singleWl = features.type === 'specific_wavelengths' && features.wavelengths.length === 1
    ? features.wavelengths[0]!
    : null;

  const trainCount = labels.filter(l => l.split === 'train' && l.yValue !== null).length;
  const testCount  = labels.filter(l => l.split === 'test'  && l.yValue !== null).length;
  const labelled   = labels.filter(l => l.yValue !== null).length;

  const errors: string[] = [];
  if (trainCount < 2) errors.push('Need at least 2 training samples with Y values.');
  if (labelled > 1) {
    const ys = labels.filter(l => l.yValue !== null).map(l => l.yValue!);
    if (new Set(ys).size === 1) errors.push('All Y values are identical — cannot build a model.');
  }

  type XMode = 'univariate' | 'full' | 'range';
  const currentMode: XMode =
    features.type === 'full_spectrum' ? 'full'
    : features.type === 'wavelength_range' || features.type === 'wavelength_ranges' ? 'range'
    : features.type === 'specific_wavelengths' && features.wavelengths.length <= 1 ? 'univariate'
    : 'full';

  const setMode = (mode: XMode) => {
    if (mode === 'univariate') onFeaturesChange({ type: 'specific_wavelengths', wavelengths: singleWl !== null ? [singleWl] : [] });
    else if (mode === 'full') onFeaturesChange({ type: 'full_spectrum' });
    else onFeaturesChange({ type: 'wavelength_ranges', ranges: [{ minWl: 300, maxWl: 800 }] });
  };

  const isMultivariate = currentMode !== 'univariate';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7">

      {/* ── Response variable name ── */}
      <section className="bg-slate-50 rounded-xl p-4 space-y-1">
        <div className="flex items-center gap-1">
          <label className="text-xs font-semibold text-slate-600">Response variable name (Y)</label>
          <Tip text="The name of the quantity you are modelling — e.g. Concentration (mg/L), pH, Turbidity. Used as the axis label in charts and in the download report." />
        </div>
        <input
          type="text"
          value={yLabel}
          onChange={e => onYLabelChange(e.target.value)}
          placeholder="e.g. Concentration (mg/L)"
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-full max-w-xs focus:outline-none focus:ring-1 focus:ring-violet-300"
        />
        <p className="text-xs text-slate-400">Appears on chart axes and in the downloaded report.</p>
      </section>

      {/* ── X variable selection ── */}
      <section>
        <div className="flex items-center gap-1 mb-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">X — Spectral input features</h3>
          <Tip text="What spectral data is used to predict Y. Univariate uses a single wavelength intensity (simple, interpretable). Multivariate uses many wavelengths together — requires PLS or PCR to handle correlated variables." />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Univariate */}
          <div
            onClick={() => setMode('univariate')}
            className={`cursor-pointer rounded-xl border-2 p-3 transition-colors
              ${currentMode === 'univariate' ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${currentMode === 'univariate' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`} />
              <span className="text-sm font-semibold text-slate-700">Single wavelength</span>
              <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">Univariate</span>
            </div>
            <p className="text-xs text-slate-400 ml-5">Intensity at one nm point. Best for simple linear calibrations (e.g. Beer-Lambert at 675 nm).</p>
            {currentMode === 'univariate' && (
              <div className="flex items-center gap-2 mt-2 ml-5">
                <label className="text-xs text-slate-500 flex-shrink-0">Wavelength (nm)</label>
                <input
                  type="number"
                  value={singleWl ?? ''}
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    onFeaturesChange({ type: 'specific_wavelengths', wavelengths: isNaN(v) ? [] : [v] });
                  }}
                  placeholder="e.g. 675"
                  className="w-24 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
            )}
          </div>

          {/* Full spectrum */}
          <div
            onClick={() => setMode('full')}
            className={`cursor-pointer rounded-xl border-2 p-3 transition-colors
              ${currentMode === 'full' ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${currentMode === 'full' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`} />
              <span className="text-sm font-semibold text-slate-700">Full spectrum</span>
              <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-medium">Multivariate</span>
            </div>
            <p className="text-xs text-slate-400 ml-5">All wavelength intensities. Recommended with PLS-R or PCR to handle collinear variables.</p>
          </div>

          {/* Multiple wavelength ranges */}
          <div
            onClick={() => setMode('range')}
            className={`cursor-pointer rounded-xl border-2 p-3 transition-colors sm:col-span-2
              ${currentMode === 'range' ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${currentMode === 'range' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`} />
              <span className="text-sm font-semibold text-slate-700">Multiple wavelength ranges</span>
              <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-medium">Multivariate</span>
            </div>
            <p className="text-xs text-slate-400 ml-5">Intensities within one or more nm windows. Add ranges to focus on multiple known absorption bands simultaneously.</p>
            {currentMode === 'range' && features.type === 'wavelength_ranges' && (
              <div className="mt-3 ml-5 space-y-2" onClick={e => e.stopPropagation()}>
                {features.ranges.map((range, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 w-4 text-right">{idx + 1}.</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">From</span>
                      <input
                        type="number"
                        value={range.minWl}
                        onChange={e => {
                          const updated = features.ranges.map((r, i) =>
                            i === idx ? { ...r, minWl: Number(e.target.value) } : r);
                          onFeaturesChange({ ...features, ranges: updated });
                        }}
                        className="w-20 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">To</span>
                      <input
                        type="number"
                        value={range.maxWl}
                        onChange={e => {
                          const updated = features.ranges.map((r, i) =>
                            i === idx ? { ...r, maxWl: Number(e.target.value) } : r);
                          onFeaturesChange({ ...features, ranges: updated });
                        }}
                        className="w-20 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                    <span className="text-xs text-slate-400">nm</span>
                    {features.ranges.length > 1 && (
                      <button
                        onClick={() => onFeaturesChange({
                          ...features,
                          ranges: features.ranges.filter((_, i) => i !== idx),
                        })}
                        className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded transition-colors"
                        title="Remove this range"
                      >✕</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => onFeaturesChange({
                    ...features,
                    ranges: [...features.ranges, { minWl: 300, maxWl: 800 }],
                  })}
                  className="mt-1 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                >
                  + Add range
                </button>
              </div>
            )}
          </div>
        </div>

        {isMultivariate && (
          <p className="text-xs text-slate-400 mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            Multivariate mode — recommend <strong>PLS-R</strong> or <strong>PCR</strong> in Step 2 to handle collinear spectral variables.
          </p>
        )}
      </section>

      {/* ── Y value table ── */}
      <section>
        <div className="flex flex-wrap gap-2 items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Y — Reference values</h3>
            <Tip text="The known measurement for each sample — e.g. concentration from a lab reference method, pH from a meter. Leave blank to exclude that spectrum from the model entirely." />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => randomSplit(0.7)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Random 70/30 split
            </button>
            <button onClick={() => setAllSplit('train')}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              All → Train
            </button>
            <button onClick={() => setAllSplit('test')}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              All → Test
            </button>
          </div>
        </div>

        {errors.map((e, i) => (
          <div key={i} className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">{e}</div>
        ))}

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-semibold text-slate-500">Spectrum</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500 w-40">
                  <span className="flex items-center gap-1">
                    {yLabel || 'Y value'}
                    <Tip text="Type the known reference value for this sample. Leave blank to exclude it from training and testing." />
                  </span>
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500 w-44">
                  <span className="flex items-center gap-1">
                    Split
                    <Tip text="Train: used to fit the model. Test: held out to evaluate predictions on unseen samples. Use at least 2 training samples." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {spectra.map(s => {
                const label = labels.find(l => l.spectrumId === s.id)!;
                return (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-slate-700 font-medium truncate max-w-[160px]" title={s.name}>
                          {s.name}
                        </span>
                        {s.label && (
                          <span
                            className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-white text-[10px] font-medium"
                            style={{ backgroundColor: s.color }}
                          >
                            {s.label}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        placeholder="blank = exclude"
                        value={label.yValue ?? ''}
                        onChange={e => update(s.id, { yValue: e.target.value === '' ? null : parseFloat(e.target.value) })}
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex rounded-lg overflow-hidden border border-slate-200 w-fit">
                        {(['train', 'test'] as const).map(sp => (
                          <button
                            key={sp}
                            onClick={() => update(s.id, { split: sp })}
                            className={`px-3 py-1 text-xs font-medium capitalize transition-colors
                              ${label.split === sp
                                ? sp === 'train' ? 'bg-blue-500 text-white' : 'bg-teal-500 text-white'
                                : 'text-slate-400 hover:bg-slate-50'}`}
                          >
                            {sp}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400 text-right mt-2">
          {labelled} labelled — <span className="text-blue-500">{trainCount} train</span> · <span className="text-teal-500">{testCount} test</span>
        </p>
      </section>
    </div>
  );
}

// ─── Step 2: Model Configuration ──────────────────────────────────────────────

function Step2Config({
  spectra, labels, features, config, onChange, selectedModels, onModelsChange,
}: {
  spectra: Spectrum[];
  labels: SampleLabel[];
  features: FeatureStrategy;
  config: ModelConfig;
  onChange: (c: ModelConfig) => void;
  selectedModels: ModelType[];
  onModelsChange: (m: ModelType[]) => void;
}) {
  const set = (patch: Partial<ModelConfig>) => onChange({ ...config, ...patch });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const toggleModel = (key: ModelType) => {
    if (selectedModels.includes(key)) {
      if (selectedModels.length === 1) return; // keep at least one
      onModelsChange(selectedModels.filter(m => m !== key));
    } else {
      onModelsChange([...selectedModels, key]);
    }
  };

  const trainSpectra = useMemo(() => {
    const trainIds = new Set(labels.filter(l => l.split === 'train' && l.yValue !== null).map(l => l.spectrumId));
    return spectra.filter(s => trainIds.has(s.id));
  }, [spectra, labels]);

  const isMultivariate = !(features.type === 'specific_wavelengths' && features.wavelengths.length <= 1);
  const showComponents = selectedModels.includes('pls') || selectedModels.includes('pcr');
  const showLambda = selectedModels.includes('ridge') || selectedModels.includes('lasso');
  // Use the first pls/pcr model for LOOCV (most relevant for component tuning)
  const loocvModel = selectedModels.find(m => m === 'pls' || m === 'pcr') ?? null;

  const loocvData = useMemo(() => {
    if (!loocvModel) return null;
    if (trainSpectra.length < 3) return null;
    try {
      const trainLabels = labels.filter(l => l.split === 'train' && l.yValue !== null);
      const { X } = extractFeatures(spectra, trainLabels, features);
      const y = trainLabels.map(l => l.yValue!);
      const maxComp = Math.min(10, trainSpectra.length - 1, X[0]?.length ?? 1);
      if (maxComp < 2) return null;
      return loocvRmseByComponent(X, y, maxComp, loocvModel, config.autoScale);
    } catch { return null; }
  }, [loocvModel, features, config.autoScale, trainSpectra.length, spectra, labels]);

  const maxComp = Math.max(1, Math.min(15, trainSpectra.length - 1));

  const models: { key: ModelType; label: string; when: string; recommended?: boolean; multivariateOnly?: boolean }[] = [
    {
      key: 'pls', label: 'PLS-R',
      when: 'Best for spectral data: handles many correlated wavelengths, works with fewer samples than variables. Extracts latent factors that explain both X and Y variance simultaneously.',
      recommended: true,
    },
    {
      key: 'pcr', label: 'PCR',
      when: 'Principal Component Regression. First compresses X into principal components (PCA), then regresses Y on the scores. Good when X structure matters but may not capture Y-relevant variation as directly as PLS.',
      multivariateOnly: true,
    },
    {
      key: 'mlr', label: 'MLR',
      when: 'Multiple Linear Regression (ordinary least squares). Requires more samples than variables — works well with specific wavelengths or peak heights, but will fail on full-spectrum with few samples.',
    },
    {
      key: 'ridge', label: 'Ridge',
      when: 'L2-regularised regression. Shrinks all coefficients toward zero, handling collinear predictors. Good for spectral data when features outnumber samples. Tune λ with cross-validation.',
    },
    {
      key: 'lasso', label: 'Lasso',
      when: 'L1-regularised regression. Produces sparse coefficients (many set to exactly zero), effectively selecting the most important wavelengths. Useful for identifying key spectral features.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7">

      {/* Model selection */}
      <section>
        <div className="flex items-center gap-1 mb-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Models to run</h3>
          <Tip text="Select one or more models. With multiple models selected, all run sequentially and results appear in a ranked comparison view. PLS-R is the standard choice for spectroscopy." />
        </div>

        {/* Multi-select dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-xl px-3 py-2.5 bg-white hover:border-slate-300 transition-colors text-left"
          >
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {selectedModels.length === 0 ? (
                <span className="text-sm text-slate-400">Select at least one model…</span>
              ) : selectedModels.map(key => {
                const m = models.find(x => x.key === key)!;
                return (
                  <span key={key} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                    {m.label}
                    <span
                      role="button"
                      onClick={e => { e.stopPropagation(); toggleModel(key); }}
                      className="hover:text-blue-900 cursor-pointer leading-none"
                      aria-label={`Remove ${m.label}`}
                    >×</span>
                  </span>
                );
              })}
            </div>
            <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
                <span className="text-xs text-slate-500 font-medium">
                  {selectedModels.length} of {models.length} selected
                  {selectedModels.length > 1 && <span className="ml-1.5 text-violet-500">— comparison mode</span>}
                </span>
                <div className="flex gap-3">
                  <button type="button" onClick={() => onModelsChange(models.filter(m => !(m.multivariateOnly && !isMultivariate)).map(m => m.key))} className="text-xs text-blue-500 hover:text-blue-700">All</button>
                  <button type="button" onClick={() => onModelsChange([models[0]!.key])} className="text-xs text-slate-400 hover:text-slate-600">Reset</button>
                </div>
              </div>
              {models.map(m => {
                const disabled = m.multivariateOnly && !isMultivariate;
                const checked = selectedModels.includes(m.key);
                return (
                  <label
                    key={m.key}
                    className={`flex items-start gap-3 px-3 py-2.5 border-b border-slate-50 last:border-0 transition-colors
                      ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}
                      ${checked && !disabled ? 'bg-blue-50/50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => !disabled && toggleModel(m.key)}
                      className="mt-0.5 accent-blue-500 flex-shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="text-sm text-slate-700 font-semibold">{m.label}</span>
                      {m.recommended && <span className="ml-2 text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">Recommended</span>}
                      {m.multivariateOnly && !isMultivariate && <span className="ml-2 text-xs bg-slate-100 text-slate-400 rounded-full px-2 py-0.5">Requires multivariate X</span>}
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{m.when}</p>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {selectedModels.length > 1 && (
          <p className="text-xs text-slate-400 mt-2">
            {selectedModels.length} models will run sequentially — results include a ranked comparison table.
          </p>
        )}
      </section>

      {/* Parameters */}
      <section>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Parameters</h3>
        <div className="space-y-5">

          {showComponents && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-sm text-slate-700 font-medium">Number of components</span>
                <Tip text="Latent variables (PLS) or principal components (PCR) to use. Too few = underfitting; too many = overfitting. Use the LOOCV chart below to pick the elbow — the point where RMSE stops decreasing meaningfully." />
              </div>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={maxComp}
                  value={Math.min(config.nComponents, maxComp)}
                  onChange={e => set({ nComponents: Number(e.target.value) })}
                  className="flex-1 accent-blue-500" />
                <span className="text-sm font-semibold text-slate-700 w-6 text-right">{Math.min(config.nComponents, maxComp)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Max {maxComp} components for this dataset ({trainSpectra.length} training samples)</p>

              {loocvData && loocvData.length > 1 && (
                <div className="mt-3 border border-slate-100 rounded-xl p-3 bg-slate-50">
                  <p className="text-xs text-slate-500 mb-2 font-medium">
                    LOOCV RMSE by number of components
                    <span className="text-slate-400 font-normal ml-1">— the selected component (red dot) is highlighted</span>
                  </p>
                  <Plot
                    key={Math.min(config.nComponents, maxComp)}
                    data={[{
                      x: loocvData.map((_, i) => i + 1),
                      y: loocvData,
                      type: 'scatter', mode: 'lines+markers',
                      line: { color: '#3b82f6', width: 2 },
                      marker: {
                        size: loocvData.map((_, i) => i + 1 === Math.min(config.nComponents, maxComp) ? 11 : 8),
                        color: loocvData.map((_, i) => i + 1 === Math.min(config.nComponents, maxComp) ? '#ef4444' : '#3b82f6'),
                        line: {
                          color: loocvData.map((_, i) => i + 1 === Math.min(config.nComponents, maxComp) ? '#b91c1c' : '#1d4ed8'),
                          width: 1.5,
                        },
                      },
                    } as Data]}
                    layout={{
                      height: 240, margin: { t: 12, r: 16, b: 40, l: 56 },
                      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                      xaxis: { title: { text: 'Components', font: { size: 11 } }, tickfont: { size: 11 }, dtick: 1, gridcolor: '#f1f5f9' },
                      yaxis: { title: { text: 'LOOCV RMSE', font: { size: 11 } }, tickfont: { size: 11 }, gridcolor: '#f1f5f9' },
                      showlegend: false,
                    } as Partial<Layout>}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }}
                    useResizeHandler
                  />
                </div>
              )}
            </div>
          )}

          {showLambda && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-sm text-slate-700 font-medium">Regularisation strength (λ)</span>
                <Tip text="Controls how much the model is penalised for large coefficients. Higher λ = more regularisation, simpler model. Too low = overfitting; too high = underfitting. Start at λ=1 and use cross-validation RMSE to tune." />
              </div>
              <div className="flex items-center gap-3">
                <input type="range" min={-3} max={3} step={0.25}
                  value={Math.log10(config.lambda)}
                  onChange={e => set({ lambda: Math.pow(10, Number(e.target.value)) })}
                  className="flex-1 accent-blue-500" />
                <span className="text-sm font-semibold text-slate-700 w-16 text-right font-mono">{config.lambda.toExponential(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-300 mt-0.5">
                <span>0.001 (less)</span><span>1</span><span>1000 (more)</span>
              </div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.autoScale}
                onChange={e => set({ autoScale: e.target.checked })}
                className="accent-blue-500" />
              <span className="text-sm text-slate-700">Auto-scale X (mean-centre + unit-variance)</span>
              <Tip text="Subtracts the mean and divides by the standard deviation of each feature across training samples. Strongly recommended when wavelengths have very different intensity ranges. Usually required for Ridge and Lasso." />
            </label>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <label className="text-sm text-slate-700">Cross-validation</label>
                <Tip text="k-fold CV randomly splits the training set into k groups. Each group is held out once while the model is trained on the remaining groups. The average error across folds estimates how well the model generalises. Use this to tune hyperparameters (n components, λ)." />
              </div>
              <select value={config.cvFolds}
                onChange={e => set({ cvFolds: Number(e.target.value) })}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white">
                <option value={0}>None</option>
                <option value={3}>3-fold</option>
                <option value={5}>5-fold (recommended)</option>
                <option value={10}>10-fold</option>
              </select>
            </div>
            {config.cvFolds > 0 && (
              <p className="text-xs text-slate-400 mt-1">CV RMSE is computed on the training set and shown in Results.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Step 3: Results ───────────────────────────────────────────────────────────

/** Renders the full results for one model: metrics, summary, scatter, residuals, coefficients, predictions. */
function ModelResultsPanel({
  results, yLabel, spectra, plotDivRef,
}: {
  results: CalibrationResults;
  yLabel: string;
  spectra: Spectrum[];
  plotDivRef?: React.MutableRefObject<HTMLElement | null>;
}) {
  const spectraMap = useMemo(() => new Map(spectra.map(s => [s.id, s])), [spectra]);
  const trainPreds = results.predictions.filter(p => p.split === 'train');
  const testPreds  = results.predictions.filter(p => p.split === 'test');
  const allTrue = results.predictions.map(p => p.yTrue);
  const min1to1 = Math.min(...allTrue);
  const max1to1 = Math.max(...allTrue);

  const showCoefficients = results.model !== 'pcr' && results.coefficients.length <= 100;
  const isUnivariate = results.featureLabels.length === 1;
  const slope = isUnivariate ? (results.coefficients[0]?.value ?? null) : null;
  const pearsonR = (slope !== null && results.trainR2 >= 0)
    ? Math.sqrt(Math.abs(results.trainR2)) * (slope >= 0 ? 1 : -1)
    : null;

  const summary = useMemo(() => generateSummary(results, yLabel), [results, yLabel]);

  const qualityColour =
    results.trainR2 >= 0.90 ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : results.trainR2 >= 0.70 ? 'bg-amber-50 border-amber-200 text-amber-900'
    : 'bg-red-50 border-red-200 text-red-900';

  const metricCards = [
    { label: 'Train R²', value: fmt(results.trainR2), tip: 'Proportion of variance explained on the training set. Closer to 1 is better, but high train R² with poor test R² indicates overfitting.' },
    { label: 'Train RMSE', value: fmt(results.trainRMSE), tip: 'Root Mean Square Error on the training set — in the same units as Y. Lower is better.' },
    { label: 'Train MAE', value: fmt(results.trainMAE), tip: 'Mean Absolute Error on training set. Less sensitive to outliers than RMSE.' },
    ...(pearsonR !== null ? [{ label: 'Pearson r', value: pearsonR.toFixed(4), tip: 'Pearson correlation coefficient. Indicates linear strength and direction between wavelength intensity and Y.' }] : []),
    ...(slope !== null ? [{ label: 'Sensitivity (slope)', value: slope.toExponential(3), tip: 'Change in predicted Y per unit intensity at the selected wavelength. Higher absolute value = more sensitive.' }] : []),
    { label: 'Test R²', value: fmt(results.testR2), tip: 'R² on the held-out test set. Key metric for real-world predictive performance.' },
    { label: 'Test RMSE', value: fmt(results.testRMSE), tip: 'RMSE on the test set. Compare to the range of Y values to assess practical accuracy.' },
    { label: 'Test MAE', value: fmt(results.testMAE), tip: 'Mean Absolute Error on the test set.' },
    ...(results.cvRMSE !== null ? [{
      label: `CV RMSE`,
      value: fmt(results.cvRMSE),
      tip: 'Cross-validation RMSE estimated on the training set via k-fold. More reliable than train RMSE for assessing generalisation.',
    }] : []),
  ];

  return (
    <div className="space-y-8">

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {metricCards.map(m => (
          <div key={m.label} className="bg-slate-50 rounded-xl p-3 relative">
            <p className="text-xs text-slate-400 flex items-center gap-0.5">
              {m.label}
              <Tip text={m.tip} />
            </p>
            <p className="text-lg font-semibold text-slate-800 mt-0.5 font-mono">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className={`border rounded-xl px-4 py-3 text-xs leading-relaxed ${qualityColour}`}>
        <span className="font-semibold mr-1">Summary:</span>{summary}
      </div>

      {/* Scatter */}
      <section>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Predicted vs Actual</h4>
        <SectionBanner
          color="blue"
          text="Points should cluster along the dashed 1:1 line — tighter scatter means better predictions. Outliers may indicate mislabelled or anomalous samples. Hover to identify spectra by name."
        />
        <Plot
          data={[
            {
              x: trainPreds.map(p => p.yTrue),
              y: trainPreds.map(p => p.yPred),
              text: trainPreds.map(p => { const s = spectraMap.get(p.spectrumId); return s?.label || s?.name || p.spectrumId; }),
              type: 'scatter', mode: 'markers', name: 'Train',
              marker: { color: '#3b82f6', size: 8 },
              hovertemplate: '<b>%{text}</b><br>True: %{x:.4f}<br>Pred: %{y:.4f}<extra>Train</extra>',
            } as Data,
            ...(testPreds.length > 0 ? [{
              x: testPreds.map(p => p.yTrue),
              y: testPreds.map(p => p.yPred),
              text: testPreds.map(p => { const s = spectraMap.get(p.spectrumId); return s?.label || s?.name || p.spectrumId; }),
              type: 'scatter', mode: 'markers', name: 'Test',
              marker: { color: '#10b981', size: 8, symbol: 'circle-open', line: { width: 2, color: '#10b981' } },
              hovertemplate: '<b>%{text}</b><br>True: %{x:.4f}<br>Pred: %{y:.4f}<extra>Test</extra>',
            } as Data] : []),
            {
              x: [min1to1, max1to1], y: [min1to1, max1to1],
              type: 'scatter', mode: 'lines', name: '1:1',
              line: { color: '#94a3b8', width: 1.5, dash: 'dash' },
              hoverinfo: 'skip',
            } as Data,
          ]}
          layout={{
            autosize: true, height: 360,
            margin: { t: 20, r: 20, b: 60, l: 70 },
            paper_bgcolor: 'white', plot_bgcolor: '#f8fafc',
            xaxis: { title: { text: `Actual ${yLabel}`, font: { size: 12 } }, gridcolor: '#e2e8f0' },
            yaxis: { title: { text: `Predicted ${yLabel}`, font: { size: 12 } }, gridcolor: '#e2e8f0' },
            legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(255,255,255,0.85)', bordercolor: '#e2e8f0', borderwidth: 1 },
          } as Partial<Layout>}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
          useResizeHandler
          onInitialized={(_, div) => { if (plotDivRef) plotDivRef.current = div; }}
        />
      </section>

      {/* Residuals */}
      <section>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Residuals (True − Predicted)</h4>
        <SectionBanner
          color="amber"
          text="Residuals should be small and randomly distributed around zero. Systematic trends or clusters suggest the model is missing a relationship in the data. Bars exceeding 2× training RMSE are flagged in red."
        />
        <Plot
          data={[{
            x: results.predictions.map(p => { const s = spectraMap.get(p.spectrumId); return s?.label || s?.name || p.spectrumId; }),
            y: results.predictions.map(p => p.residual),
            type: 'bar',
            marker: {
              color: results.predictions.map(p =>
                Math.abs(p.residual) > (results.trainRMSE ?? 0) * 2
                  ? '#ef4444'
                  : p.split === 'train' ? '#3b82f6' : '#10b981'
              ),
            },
            hovertemplate: '%{x}<br>Residual: %{y:.4f}<extra></extra>',
          } as Data]}
          layout={{
            autosize: true, height: 220,
            margin: { t: 10, r: 20, b: 80, l: 70 },
            paper_bgcolor: 'white', plot_bgcolor: '#f8fafc',
            xaxis: { tickangle: -35, tickfont: { size: 10 }, gridcolor: '#e2e8f0' },
            yaxis: { title: { text: 'Residual', font: { size: 11 } }, gridcolor: '#e2e8f0', zeroline: true, zerolinecolor: '#94a3b8' },
            showlegend: false,
          } as Partial<Layout>}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
          useResizeHandler
        />
        <p className="text-xs text-slate-400 mt-1">Blue = train · Green = test · Red = &gt;2× train RMSE</p>
      </section>

      {/* Coefficients */}
      {showCoefficients && results.coefficients.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {results.model === 'pls' ? 'PLS Regression Coefficients' : 'Regression Coefficients'}
          </h4>
          <SectionBanner
            color="violet"
            text="Wavelengths with large absolute coefficients drive predictions most. Blue bars indicate positive correlation with the response; red bars indicate inverse correlation. Key peaks near known absorption bands confirm the model is learning meaningful chemistry."
          />
          <Plot
            data={[{
              x: results.coefficients.map(c => c.label),
              y: results.coefficients.map(c => c.value),
              type: 'bar',
              marker: { color: results.coefficients.map(c => c.value >= 0 ? '#3b82f6' : '#ef4444') },
              hovertemplate: '%{x}<br>Coeff: %{y:.6f}<extra></extra>',
            } as Data]}
            layout={{
              autosize: true, height: 240,
              margin: { t: 10, r: 20, b: results.coefficients.length > 30 ? 40 : 60, l: 70 },
              paper_bgcolor: 'white', plot_bgcolor: '#f8fafc',
              xaxis: {
                tickangle: results.coefficients.length > 30 ? 0 : -35,
                tickfont: { size: results.coefficients.length > 30 ? 8 : 10 },
                gridcolor: '#e2e8f0',
                ...(results.coefficients.length > 30 ? { tickmode: 'auto', nticks: 10 } : {}),
              },
              yaxis: { title: { text: 'Coefficient', font: { size: 11 } }, gridcolor: '#e2e8f0', zeroline: true, zerolinecolor: '#94a3b8' },
              showlegend: false,
            } as Partial<Layout>}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
          />
        </section>
      )}

      {/* Predictions table */}
      <section>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Predictions</h4>
        <SectionBanner
          color="slate"
          text="Green-highlighted rows are test samples — held out from training to evaluate real-world generalisation. Residuals shown in red exceed 2× the training RMSE and may indicate outliers or mislabelled samples."
        />
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-semibold text-slate-500">Spectrum</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500">Split</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500">{yLabel} (true)</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500">{yLabel} (pred)</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500">Residual</th>
              </tr>
            </thead>
            <tbody>
              {results.predictions.map((p, i) => (
                <tr key={i} className={`border-b border-slate-50 ${p.split === 'test' ? 'bg-emerald-50/30' : ''}`}>
                  <td className="px-3 py-1.5 text-slate-700 truncate max-w-[200px]" title={p.spectrumLabel}>{p.spectrumLabel}</td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium
                      ${p.split === 'train' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'}`}>
                      {p.split}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-700">{p.yTrue}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-700">{p.yPred.toFixed(4)}</td>
                  <td className={`px-3 py-1.5 text-right font-mono
                    ${Math.abs(p.residual) > (results.trainRMSE ?? 0) * 2 ? 'text-red-500 font-semibold' : 'text-slate-700'}`}>
                    {p.residual.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Step3Results({
  results, yLabel, spectra, allModelResults,
}: {
  results: CalibrationResults;
  yLabel: string;
  spectra: Spectrum[];
  allModelResults: CalibrationResults[] | null;
}) {
  const isCompareMode = allModelResults !== null && allModelResults.length > 1;
  const [activeTab, setActiveTab] = useState<'overview' | ModelType>(isCompareMode ? 'overview' : results.model);
  const plotDivRef = useRef<HTMLElement | null>(null);


  const handleDownloadReport = async () => {
    let png = '';
    if (plotDivRef.current) {
      try { png = await PlotlyLib.toImage(plotDivRef.current, { format: 'png', width: 600, height: 420 }); }
      catch { /* skip */ }
    }
    downloadReport(results, yLabel, isCompareMode ? '' : png, allModelResults ?? undefined);
  };

  // Overview comparison banner text
  const comparisonBannerText = useMemo(() => {
    if (!results.comparison || results.comparison.length === 0) return '';
    const best = results.comparison[0]!;
    const hasTest = best.testR2 !== null;
    const metric = hasTest ? 'test R²' : 'train R²';
    const bestScore = (best.testR2 ?? best.trainR2);
    const currentRank = results.comparison.findIndex(r => r.model === results.model) + 1;
    let s = `${results.comparison.length} models trained with identical features and parameters. `;
    s += `${best.label} achieved the highest ${metric} (${bestScore.toFixed(4)})`;
    if (currentRank > 1) {
      const suffix = currentRank === 1 ? 'st' : currentRank === 2 ? 'nd' : currentRank === 3 ? 'rd' : 'th';
      const curScore = hasTest ? results.comparison[currentRank - 1]!.testR2! : results.comparison[currentRank - 1]!.trainR2;
      s += `, while the selected ${MODEL_LABELS[results.model]} ranked ${currentRank}${suffix} (${metric} = ${curScore.toFixed(4)})`;
    } else {
      s += ' — matching your selected model';
    }
    s += '. Use the model tabs to inspect individual scatter plots, residuals, and coefficients.';
    return s;
  }, [results.comparison, results.model]);

  const activeTabRes = isCompareMode && activeTab !== 'overview'
    ? allModelResults!.find(r => r.model === activeTab) ?? null
    : null;

  return (
    <div className="flex flex-col h-full">

      {/* Header + downloads */}
      <div className="flex-shrink-0 px-4 pt-5 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-4xl mx-auto">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              {isCompareMode ? 'Model Comparison Results' : (MODEL_NAMES[results.model] ?? results.model)}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Response: {yLabel}
              {!isCompareMode && ['pls', 'pcr'].includes(results.model) && ` · ${results.nComponents} component${results.nComponents !== 1 ? 's' : ''}`}
              {!isCompareMode && results.featureLabels.length === 1 && ` · univariate @ ${results.featureLabels[0]}`}
              {!isCompareMode && results.featureLabels.length > 1 && ` · ${results.featureLabels.length} features`}
              {isCompareMode && ` · ${results.featureLabels.length === 1 ? `univariate @ ${results.featureLabels[0]}` : `${results.featureLabels.length} features`}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Downloads: context-sensitive */}
            {!isCompareMode && (
              <>
                <button onClick={() => downloadResultsCsv(results)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Results CSV
                </button>
                {results.coefficients.length > 0 && (
                  <button onClick={() => downloadCoefficientsCsv(results)}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Coefficients CSV
                  </button>
                )}
              </>
            )}
            {activeTabRes && (
              <>
                <button onClick={() => downloadResultsCsv(activeTabRes)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Results CSV
                </button>
                {activeTabRes.coefficients.length > 0 && (
                  <button onClick={() => downloadCoefficientsCsv(activeTabRes)}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Coefficients CSV
                  </button>
                )}
              </>
            )}
            <button onClick={handleDownloadReport}
              className="px-3 py-1.5 text-xs bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {isCompareMode ? 'Report HTML (all models)' : 'Report HTML'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs — only in compare mode */}
      {isCompareMode && (
        <div className="flex-shrink-0 flex overflow-x-auto border-b border-slate-200 bg-slate-50/50 px-4 max-w-4xl mx-auto w-full">
          {/* Overview tab */}
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors -mb-px
              ${activeTab === 'overview'
                ? 'border-violet-500 text-violet-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Overview
          </button>
          {allModelResults!.map(r => {
            const row = results.comparison?.find(c => c.model === r.model);
            const score = row?.testR2 ?? row?.trainR2;
            const isBest = results.comparison && results.comparison[0]?.model === r.model;
            return (
              <button
                key={r.model}
                onClick={() => setActiveTab(r.model)}
                className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors -mb-px flex items-center gap-1
                  ${activeTab === r.model
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                {MODEL_LABELS[r.model]}
                {isBest && <span className="text-[9px] text-amber-500 font-bold">★</span>}
                {score != null && !isNaN(score) && (
                  <span className="text-[10px] text-slate-400">{score.toFixed(2)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Overview tab */}
          {isCompareMode && activeTab === 'overview' && results.comparison && (
            <div className="space-y-6">
              {/* Comparison banner */}
              <SectionBanner
                color="violet"
                text={comparisonBannerText}
              />

              {/* Comparison table + chart */}
              <section>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Model Comparison
                  <span className="ml-2 text-slate-400 font-normal normal-case">— ranked by test R² (or train R² if no test split)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2 text-left text-slate-500 font-semibold">Model</th>
                          <th className="px-3 py-2 text-right text-slate-500 font-semibold">Train R²</th>
                          <th className="px-3 py-2 text-right text-slate-500 font-semibold">Train RMSE</th>
                          {results.comparison[0]!.testR2 !== null && <th className="px-3 py-2 text-right text-slate-500 font-semibold">Test R²</th>}
                          {results.comparison[0]!.cvRMSE !== null && <th className="px-3 py-2 text-right text-slate-500 font-semibold">CV RMSE</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {results.comparison.map((row, i) => {
                          const isBest = i === 0 && !isNaN(row.trainR2);
                          const isCurrent = row.model === results.model;
                          return (
                            <tr
                              key={row.model}
                              onClick={() => setActiveTab(row.model)}
                              className={`border-b border-slate-50 cursor-pointer transition-colors
                                ${isBest ? 'bg-blue-50/60 hover:bg-blue-50' : 'hover:bg-slate-50'}
                                ${isCurrent ? 'ring-1 ring-inset ring-blue-300' : ''}`}
                            >
                              <td className="px-3 py-2 font-medium text-slate-700">
                                {row.label}
                                {isBest && (
                                  <span
                                    className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-semibold cursor-help"
                                    title={`Ranked 1st by ${results.comparison![0]!.testR2 !== null ? 'test R²' : 'train R²'} (highest = best). All models were trained with identical features and parameters.`}
                                  >★ best</span>
                                )}
                                {isCurrent && !isBest && (
                                  <span
                                    className="ml-1.5 text-[10px] text-slate-400 cursor-help"
                                    title="This was the model you selected in Step 2. It placed below the top-ranked model on this dataset."
                                  >← your pick</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(isNaN(row.trainR2) ? null : row.trainR2)}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(isNaN(row.trainRMSE) ? null : row.trainRMSE)}</td>
                              {results.comparison![0]!.testR2 !== null && (
                                <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(row.testR2)}</td>
                              )}
                              {results.comparison![0]!.cvRMSE !== null && (
                                <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(row.cvRMSE)}</td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-slate-400 px-3 py-2">Click a row to view that model's full results.</p>
                  </div>
                  {/* R² bar chart */}
                  <Plot
                    data={[{
                      y: results.comparison.map(r => r.label),
                      x: results.comparison.map(r => isNaN(r.trainR2) ? 0 : Math.max(0, r.testR2 ?? r.trainR2)),
                      type: 'bar', orientation: 'h',
                      marker: {
                        color: results.comparison.map((r, i) =>
                          i === 0 ? '#3b82f6' : r.model === results.model ? '#8b5cf6' : '#cbd5e1'),
                      },
                      hovertemplate: '%{y}: R² = %{x:.4f}<extra></extra>',
                    } as Data]}
                    layout={{
                      height: 200, margin: { t: 8, r: 20, b: 40, l: 60 },
                      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                      xaxis: { title: { text: results.comparison[0]?.testR2 !== null ? 'Test R²' : 'Train R²', font: { size: 10 } }, range: [0, 1], tickfont: { size: 10 }, gridcolor: '#f1f5f9' },
                      yaxis: { tickfont: { size: 10 }, automargin: true, gridcolor: '#f1f5f9' },
                      showlegend: false,
                    } as Partial<Layout>}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%' }}
                    useResizeHandler
                  />
                </div>
              </section>
            </div>
          )}

          {/* Individual model tab (compare mode) or single model view */}
          {(!isCompareMode || activeTab !== 'overview') && (
            <ModelResultsPanel
              results={isCompareMode ? (allModelResults!.find(r => r.model === activeTab) ?? results) : results}
              yLabel={yLabel}
              spectra={spectra}
              plotDivRef={!isCompareMode ? plotDivRef : undefined}
            />
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Stepper nav ───────────────────────────────────────────────────────────────

function Stepper({ step, canStep2, canStep3, onNav }: {
  step: 1 | 2 | 3;
  canStep2: boolean;
  canStep3: boolean;
  onNav: (s: 1 | 2 | 3) => void;
}) {
  const steps = [
    { n: 1 as const, label: 'Define Variables' },
    { n: 2 as const, label: 'Configure Model' },
    { n: 3 as const, label: 'Results' },
  ];
  return (
    <div className="flex items-center justify-center gap-0 px-6 py-3 border-b border-slate-100 bg-slate-50/50">
      {steps.map((s, i) => {
        const enabled = s.n === 1 || (s.n === 2 && canStep2) || (s.n === 3 && canStep3);
        return (
          <div key={s.n} className="flex items-center">
            <button
              onClick={() => enabled && onNav(s.n)}
              disabled={!enabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors
                ${step === s.n ? 'bg-white shadow-sm text-blue-600' : enabled ? 'text-slate-500 hover:bg-white/60' : 'text-slate-300 cursor-default'}`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                ${step === s.n ? 'bg-blue-500 text-white' : step > s.n ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-400'}`}>
                {step > s.n ? '✓' : s.n}
              </span>
              {s.label}
            </button>
            {i < steps.length - 1 && (
              <div className="w-12 h-px bg-slate-200 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main CalibrationPage ──────────────────────────────────────────────────────

export function CalibrationPage({ spectra, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [labels, setLabels] = useState<SampleLabel[]>(() =>
    spectra.map(s => ({ spectrumId: s.id, yValue: null, split: 'train' }))
  );
  const [features, setFeatures] = useState<FeatureStrategy>(DEFAULT_CONFIG.features);
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);
  const [selectedModels, setSelectedModels] = useState<ModelType[]>(['pls']);
  const [results, setResults] = useState<CalibrationResults | null>(null);
  const [allModelResults, setAllModelResults] = useState<CalibrationResults[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [yLabel, setYLabel] = useState('');

  const trainCount = labels.filter(l => l.split === 'train' && l.yValue !== null).length;
  const canStep2 = trainCount >= 2;
  const canStep3 = results !== null;

  const effectiveConfig: ModelConfig = {
    ...config,
    features,
    model: selectedModels[0] ?? 'pls',
    compareAll: selectedModels.length > 1,
  };

  const runModel = useCallback(async () => {
    setError('');
    setRunning(true);
    setAllModelResults(null);

    if (effectiveConfig.compareAll) {
      const modelsToRun: ModelType[] = selectedModels;
      const collected: CalibrationResults[] = [];

      try {
        for (let i = 0; i < modelsToRun.length; i++) {
          const m = modelsToRun[i]!;
          setProgress({ current: i + 1, total: modelsToRun.length, label: `Running ${MODEL_LABELS[m]}…` });
          // Yield to React to paint the progress update
          await new Promise(r => setTimeout(r, 20));
          try {
            const res = runCalibration(spectra, labels, { ...effectiveConfig, model: m, compareAll: false });
            collected.push(res);
          } catch {
            // Skip failed model — it won't appear in tabs
          }
        }

        if (collected.length === 0) throw new Error('All models failed to run. Check your data and try again.');

        // Build sorted comparison from collected results
        const comparison = [...collected]
          .sort((a, b) => {
            const aS = a.testR2 ?? a.trainR2;
            const bS = b.testR2 ?? b.trainR2;
            return (isNaN(bS) ? -1 : bS) - (isNaN(aS) ? -1 : aS);
          })
          .map(r => ({
            model: r.model,
            label: MODEL_LABELS[r.model],
            trainR2: r.trainR2,
            trainRMSE: r.trainRMSE,
            testR2: r.testR2,
            testRMSE: r.testRMSE,
            cvRMSE: r.cvRMSE,
          }));

        // Primary result = selected model (or first if not found), enriched with comparison
        const primaryIdx = collected.findIndex(r => r.model === effectiveConfig.model);
        const primary = collected[primaryIdx >= 0 ? primaryIdx : 0]!;
        const primaryWithComparison = { ...primary, comparison };

        setAllModelResults(collected);
        setResults(primaryWithComparison);
        setStep(3);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
        setProgress(null);
      }
    } else {
      try {
        setProgress({ current: 1, total: 1, label: `Running ${MODEL_LABELS[effectiveConfig.model]}…` });
        await new Promise(r => setTimeout(r, 30));
        const res = runCalibration(spectra, labels, effectiveConfig);
        setResults(res);
        setStep(3);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
        setProgress(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectra, labels, effectiveConfig, selectedModels]);

  const displayYLabel = yLabel.trim() || 'Y';

  return (
    <div className="fixed inset-0 z-[8000] bg-white flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-800">Calibration & Modelling</span>
        </div>
        <div className="flex-1" />
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors" title="Close">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Stepper */}
      <Stepper step={step} canStep2={canStep2} canStep3={canStep3} onNav={setStep} />

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 px-4 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Content — relative for progress overlay positioning */}
      <div className="flex-1 overflow-y-auto relative">

        {/* Progress overlay */}
        {running && progress && (
          <div className="absolute inset-0 bg-white/85 backdrop-blur-[2px] flex items-center justify-center z-10">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 px-8 py-7 w-80 text-center">
              <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm font-semibold text-slate-700 mb-1">{progress.label}</p>
              <p className="text-xs text-slate-400 mb-4">
                Step {progress.current} of {progress.total}
                {effectiveConfig.compareAll && ` · comparing all models`}
              </p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(progress.current / progress.total * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 font-mono">
                {Math.round(progress.current / progress.total * 100)}%
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <Step1Labels
            spectra={spectra}
            labels={labels}
            yLabel={yLabel}
            features={features}
            onLabelsChange={setLabels}
            onYLabelChange={setYLabel}
            onFeaturesChange={setFeatures}
          />
        )}
        {step === 2 && (
          <Step2Config
            spectra={spectra}
            labels={labels}
            features={features}
            config={config}
            onChange={setConfig}
            selectedModels={selectedModels}
            onModelsChange={setSelectedModels}
          />
        )}
        {step === 3 && results && (
          <Step3Results
            results={results}
            yLabel={displayYLabel}
            spectra={spectra}
            allModelResults={allModelResults}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-slate-200 px-5 py-3 flex items-center justify-between bg-white">
        <div>
          {step > 1 && !running && (
            <button
              onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {step === 3 && results && !running && (
            <button
              onClick={() => { setResults(null); setAllModelResults(null); setStep(2); }}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Reconfigure
            </button>
          )}
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              disabled={!canStep2}
              className="px-5 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={!canStep2 ? 'Enter Y values for at least 2 training samples first' : ''}
            >
              Next: Configure Model →
            </button>
          )}
          {step === 2 && (
            <button
              onClick={runModel}
              disabled={running || !canStep2}
              className="px-5 py-2 text-sm font-medium bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {running && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {running ? 'Running…' : `Run Model${effectiveConfig.compareAll ? 's →' : ' →'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
