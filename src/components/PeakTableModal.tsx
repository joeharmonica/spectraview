import { useState, useMemo, useEffect } from 'react';
import type { Spectrum } from '../types/spectrum';
import { applyProcessing, findPeaks } from '../lib/processing';

interface Props {
  spectra: Spectrum[];
  onClose: () => void;
}

export function PeakTableModal({ spectra, onClose }: Props) {
  const [prominence, setProminence] = useState(5);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const rows = useMemo(() => {
    const result: { spectrumName: string; color: string; wavelength: number; intensity: number }[] = [];
    for (const s of spectra) {
      const displayY = applyProcessing(s.wavelengths, s.intensities, s.processing);
      const peaks = findPeaks(s.wavelengths, displayY, prominence / 100);
      for (const p of peaks) {
        result.push({ spectrumName: s.name, color: s.color, wavelength: p.wavelength, intensity: p.intensity });
      }
    }
    return result;
  }, [spectra, prominence]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Peak Table</h2>
            <p className="text-sm text-slate-500 mt-0.5">{spectra.length} spectrum{spectra.length !== 1 ? 'a' : ''} · {rows.length} peaks found</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-slate-100 flex-shrink-0 flex items-center gap-4">
          <label className="text-xs font-medium text-slate-500">Min prominence</label>
          <input
            type="range" min={1} max={30} step={1}
            value={prominence}
            onChange={e => setProminence(Number(e.target.value))}
            className="w-32 accent-blue-500"
          />
          <span className="text-xs text-slate-600 font-mono w-10">{prominence}%</span>
          <span className="text-xs text-slate-400">of max intensity</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No peaks found. Try lowering the minimum prominence.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Spectrum</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-500">λ (nm)</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Intensity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2 text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: r.color }}
                        />
                        <span className="truncate max-w-[240px]" title={r.spectrumName}>{r.spectrumName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">{r.wavelength.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">{r.intensity.toExponential(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0 flex justify-end">
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
