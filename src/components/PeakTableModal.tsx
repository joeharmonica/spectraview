import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Spectrum, HighlightedPeak } from '../types/spectrum';
import { applyProcessing, findPeaks } from '../lib/processing';

interface Props {
  spectra: Spectrum[];
  onClose: () => void;
  onHighlightChange: (peaks: HighlightedPeak[]) => void;
}

type FilterMode = 'prominence' | 'minIntensity';

interface PeakRow {
  spectrumId: string;
  spectrumLabel: string; // label ?? name
  color: string;
  wavelength: number;
  intensity: number;
}

export function PeakTableModal({ spectra, onClose, onHighlightChange }: Props) {
  const [prominence, setProminence] = useState(5);
  const [filterMode, setFilterMode] = useState<FilterMode>('prominence');
  const [minIntensity, setMinIntensity] = useState(0);
  const [highlighted, setHighlighted] = useState<HighlightedPeak[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Propagate highlight changes to parent
  useEffect(() => {
    onHighlightChange(highlighted);
  }, [highlighted, onHighlightChange]);

  const rows = useMemo<PeakRow[]>(() => {
    const result: PeakRow[] = [];
    for (const s of spectra) {
      const displayY = applyProcessing(s.wavelengths, s.intensities, s.processing);
      // Use 0 prominence to get all local maxima, then filter by intensity if needed
      const peaks = findPeaks(
        s.wavelengths, displayY,
        filterMode === 'prominence' ? prominence / 100 : 0,
      );
      const filtered = filterMode === 'minIntensity'
        ? peaks.filter(p => p.intensity >= minIntensity)
        : peaks;
      const label = s.label || s.name;
      for (const p of filtered) {
        result.push({ spectrumId: s.id, spectrumLabel: label, color: s.color, wavelength: p.wavelength, intensity: p.intensity });
      }
    }
    return result;
  }, [spectra, prominence, filterMode, minIntensity]);

  const peakKey = (row: PeakRow) => `${row.spectrumId}_${row.wavelength.toFixed(3)}`;

  const isHighlighted = useCallback((row: PeakRow) =>
    highlighted.some(p => p.key === peakKey(row)), [highlighted]);

  const toggleHighlight = useCallback((row: PeakRow) => {
    const key = peakKey(row);
    setHighlighted(prev => {
      const idx = prev.findIndex(p => p.key === key);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, { key, spectrumId: row.spectrumId, wavelength: row.wavelength, color: row.color, spectrumLabel: row.spectrumLabel }];
    });
  }, []);

  const clearHighlights = () => setHighlighted([]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Peak Table</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {spectra.length} spectrum{spectra.length !== 1 ? 'a' : ''} · {rows.length} peaks found
              {highlighted.length > 0 && (
                <span className="ml-2 text-indigo-500">{highlighted.length} marked on chart</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-slate-100 flex-shrink-0 space-y-2.5">
          {/* Filter mode toggle */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500 w-16">Filter by</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              <button
                onClick={() => setFilterMode('prominence')}
                className={`px-3 py-1 text-xs font-medium transition-colors
                  ${filterMode === 'prominence' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Prominence
              </button>
              <button
                onClick={() => setFilterMode('minIntensity')}
                className={`px-3 py-1 text-xs font-medium transition-colors border-l border-slate-200
                  ${filterMode === 'minIntensity' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Min intensity
              </button>
            </div>
          </div>

          {/* Prominence slider */}
          {filterMode === 'prominence' && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500 w-16">Threshold</span>
              <input
                type="range" min={0} max={100} step={1}
                value={prominence}
                onChange={e => setProminence(Number(e.target.value))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-xs text-slate-600 font-mono w-12 text-right">{prominence}% max</span>
            </div>
          )}

          {/* Min intensity input */}
          {filterMode === 'minIntensity' && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500 w-16">Cutoff</span>
              <input
                type="number"
                value={minIntensity}
                onChange={e => setMinIntensity(Number(e.target.value))}
                className="w-40 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                placeholder="0"
              />
              <span className="text-xs text-slate-400">absolute intensity</span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No peaks found. {filterMode === 'prominence' ? 'Try lowering the prominence threshold.' : 'Try lowering the minimum intensity.'}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Spectrum</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-500">λ (nm)</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Intensity</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-slate-500" title="Mark peak on chart">Chart</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const active = isHighlighted(r);
                  return (
                    <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/50 ${active ? 'bg-indigo-50/40' : ''}`}>
                      <td className="px-4 py-2 text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="truncate max-w-[200px]" title={r.spectrumLabel}>{r.spectrumLabel}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-slate-700">{r.wavelength.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-700">{r.intensity.toExponential(4)}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggleHighlight(r)}
                          title={active ? 'Remove marker from chart' : 'Mark this peak on the chart'}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors
                            ${active ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:text-indigo-400 hover:bg-indigo-50'}`}
                        >
                          <svg className="w-3.5 h-3.5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0 flex items-center justify-between">
          <div>
            {highlighted.length > 0 && (
              <button
                onClick={clearHighlights}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear {highlighted.length} marker{highlighted.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
