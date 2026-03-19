import { useState, useMemo, useRef } from 'react';
import type { ProcessingOptions, Spectrum } from '../types/spectrum';
import type { ViewMode } from '../types/spectrum';
import { ensureOdd, applyProcessing, integrateTrapezoid } from '../lib/processing';

interface Props {
  selectedCount: number;
  selectedSpectra: Spectrum[];
  viewMode: ViewMode;
  onApply: (opts: ProcessingOptions) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * Help icon that shows a custom tooltip on hover.
 * Uses `position: fixed` so the bubble escapes the panel's overflow-y:auto container.
 */
function Tip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({
        left: Math.max(8, Math.min(window.innerWidth - 248, r.left + r.width / 2 - 120)),
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
          bg-slate-200 text-slate-500 text-[9px] font-bold cursor-help ml-1 select-none"
      >
        ?
      </span>
      {pos && (
        <div
          className="fixed w-60 bg-slate-800 text-white text-xs leading-relaxed
            rounded-xl px-3 py-2.5 shadow-xl pointer-events-none"
          style={{ left: pos.left, top: pos.top, transform: 'translateY(calc(-100% - 6px))', zIndex: 9999 }}
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800" />
        </div>
      )}
    </>
  );
}

export function AnalysisPanel({ selectedCount, selectedSpectra, viewMode, onApply, onReset, onClose }: Props) {
  const [normalize, setNormalize] = useState<'none' | 'max' | 'area' | 'wavelength'>('none');
  const [normWavelength, setNormWavelength] = useState(500);

  const [smoothEnabled, setSmoothEnabled] = useState(false);
  const [windowSize, setWindowSize] = useState(11);
  const [polyOrder, setPolyOrder] = useState(2);

  const [baselineEnabled, setBaselineEnabled] = useState(false);
  const [baselineDegree, setBaselineDegree] = useState(2);

  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropMin, setCropMin] = useState(300);
  const [cropMax, setCropMax] = useState(800);

  const [intMin, setIntMin] = useState(300);
  const [intMax, setIntMax] = useState(800);

  const isHeatmap = viewMode === 'heatmap';

  const handleApply = () => {
    const opts: ProcessingOptions = {
      normalize: normalize === 'none' ? null
        : normalize === 'wavelength' ? { wavelength: normWavelength }
        : normalize,
      smooth: smoothEnabled ? { windowSize: ensureOdd(windowSize), polyOrder } : null,
      baseline: baselineEnabled ? { degree: baselineDegree } : null,
      crop: cropEnabled ? { minWl: cropMin, maxWl: cropMax } : null,
    };
    onApply(opts);
  };

  // Compute integration results for currently selected spectra
  const integrationResults = useMemo(() => {
    if (selectedSpectra.length === 0) return [];
    return selectedSpectra.map(s => {
      const displayY = applyProcessing(s.wavelengths, s.intensities, s.processing);
      const auc = integrateTrapezoid(s.wavelengths, displayY, intMin, intMax);
      return { name: s.name, auc };
    });
  }, [selectedSpectra, intMin, intMax]);

  return (
    <div id="tutorial-analysis-panel" className="w-full h-full flex-shrink-0 bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">Analysis</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Heatmap context banner */}
      {isHeatmap && (
        <div className="mx-3 mt-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-600 flex-shrink-0">
          In heatmap mode, processing is applied to each excitation slice (row) individually before rendering.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Wavelength Crop */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center">
              Crop Range
              <Tip text="Trim data to a specific wavelength window. Applied first, before all other processing. Useful to remove noisy edges." />
            </h3>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={cropEnabled}
                onChange={e => setCropEnabled(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-xs text-slate-500">Enable</span>
            </label>
          </div>
          {cropEnabled && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-12">Min (nm)</label>
                <input
                  type="number"
                  value={cropMin}
                  onChange={e => setCropMin(Number(e.target.value))}
                  className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-12">Max (nm)</label>
                <input
                  type="number"
                  value={cropMax}
                  onChange={e => setCropMax(Number(e.target.value))}
                  className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
            </div>
          )}
        </section>

        {/* Normalization */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center">
            Normalize
            <Tip text="Rescale intensities to a common reference so spectra with different absolute intensities can be compared. Applied last, after smoothing and baseline." />
          </h3>
          <div className="space-y-1.5">
            {(['none', 'max', 'area', 'wavelength'] as const).map(opt => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="normalize"
                  value={opt}
                  checked={normalize === opt}
                  onChange={() => setNormalize(opt)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-slate-700 capitalize">
                  {opt === 'none' ? 'None'
                    : opt === 'max' ? 'To maximum (0–1 scale)'
                    : opt === 'area' ? 'By area (unit-area)'
                    : 'At wavelength'}
                </span>
              </label>
            ))}
          </div>
          {normalize === 'wavelength' && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-slate-500 w-16">Target (nm)</label>
              <input
                type="number"
                value={normWavelength}
                onChange={e => setNormWavelength(Number(e.target.value))}
                className="w-24 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>
          )}
        </section>

        {/* Smoothing */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center">
              Smooth (S-G)
              <Tip text="Savitzky-Golay filter: fits a local polynomial to a sliding window and replaces each point with the fitted value. Reduces noise while preserving peak shape better than a simple moving average. Larger window = more smoothing." />
            </h3>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={smoothEnabled}
                onChange={e => setSmoothEnabled(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-xs text-slate-500">Enable</span>
            </label>
          </div>
          {smoothEnabled && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Window size</span>
                  <span>{ensureOdd(windowSize)} pts</span>
                </div>
                <input
                  type="range" min={5} max={51} step={2}
                  value={ensureOdd(windowSize)}
                  onChange={e => setWindowSize(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Polynomial order</span>
                  <span>{polyOrder}</span>
                </div>
                <input
                  type="range" min={2} max={4} step={1}
                  value={polyOrder}
                  onChange={e => setPolyOrder(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          )}
        </section>

        {/* Baseline correction */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center">
              Baseline
              <Tip text="Fit a polynomial to the spectrum and subtract it. Corrects slow-varying background (e.g. scattering, fluorescence background). Higher degree follows more complex baselines but risks over-fitting." />
            </h3>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={baselineEnabled}
                onChange={e => setBaselineEnabled(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-xs text-slate-500">Enable</span>
            </label>
          </div>
          {baselineEnabled && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Polynomial degree</span>
                <span>{baselineDegree}</span>
              </div>
              <input
                type="range" min={1} max={5} step={1}
                value={baselineDegree}
                onChange={e => setBaselineDegree(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          )}
        </section>

        {/* Integration */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center">
            Integrate (AUC)
            <Tip text={isHeatmap
              ? "Trapezoidal integration over the emission axis for each excitation slice. Results show each slice's area under the curve."
              : "Trapezoidal rule: sums the area under the spectrum between the two wavelengths. Useful for comparing total signal intensity across samples."} />
          </h3>
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 w-12">From (nm)</label>
              <input
                type="number"
                value={intMin}
                onChange={e => setIntMin(Number(e.target.value))}
                className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 w-12">To (nm)</label>
              <input
                type="number"
                value={intMax}
                onChange={e => setIntMax(Number(e.target.value))}
                className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>
          </div>
          {integrationResults.length > 0 && (
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-2 py-1.5 text-left text-slate-500 font-medium">Spectrum</th>
                    <th className="px-2 py-1.5 text-right text-slate-500 font-medium">AUC</th>
                  </tr>
                </thead>
                <tbody>
                  {integrationResults.map((r, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="px-2 py-1 text-slate-600 truncate max-w-[120px]" title={r.name}>{r.name}</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-700">{r.auc.toExponential(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {integrationResults.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Select spectra to integrate</p>
          )}
        </section>

      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 space-y-2 flex-shrink-0">
        <p className="text-xs text-slate-400 text-center">
          {selectedCount} spectrum{selectedCount !== 1 ? 'a' : ''} selected
        </p>
        <button
          onClick={handleApply}
          disabled={selectedCount === 0}
          className="w-full py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Apply to selected
        </button>
        <button
          onClick={onReset}
          disabled={selectedCount === 0}
          className="w-full py-1.5 text-sm text-slate-500 hover:bg-slate-50 rounded-lg
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Reset processing
        </button>
      </div>
    </div>
  );
}
