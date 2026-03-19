import { useState, useMemo } from 'react';
import type { ProcessingOptions, Spectrum } from '../types/spectrum';
import { ensureOdd, applyProcessing, integrateTrapezoid } from '../lib/processing';

interface Props {
  selectedCount: number;
  selectedSpectra: Spectrum[];
  onApply: (opts: ProcessingOptions) => void;
  onReset: () => void;
  onClose: () => void;
}

export function AnalysisPanel({ selectedCount, selectedSpectra, onApply, onReset, onClose }: Props) {
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
    <div className="w-72 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Analysis</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Wavelength Crop */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Crop Range</h3>
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
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Normalize</h3>
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
                  {opt === 'none' ? 'None' : opt === 'max' ? 'To maximum' : opt === 'area' ? 'By area' : 'At wavelength'}
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
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Smooth (S-G)</h3>
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
                  <span>{ensureOdd(windowSize)}</span>
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
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Baseline</h3>
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
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Integrate (AUC)</h3>
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
      <div className="px-4 py-3 border-t border-slate-200 space-y-2">
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
