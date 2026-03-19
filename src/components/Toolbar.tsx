import type { Spectrum, ViewMode } from '../types/spectrum';
import { applyProcessing } from '../lib/processing';

interface Props {
  viewMode: ViewMode;
  stackOffset: number;
  selectedSpectra: Spectrum[];
  analysisOpen: boolean;
  labelsVisible: boolean;
  peakTableOpen: boolean;
  onSetViewMode: (mode: ViewMode) => void;
  onSetStackOffset: (offset: number) => void;
  onToggleAnalysis: () => void;
  onToggleLabels: () => void;
  onTogglePeakTable: () => void;
}

export function Toolbar({
  viewMode, stackOffset, selectedSpectra,
  analysisOpen, labelsVisible, peakTableOpen,
  onSetViewMode, onSetStackOffset, onToggleAnalysis, onToggleLabels, onTogglePeakTable,
}: Props) {
  const exportCSV = () => {
    if (selectedSpectra.length === 0) return;
    selectedSpectra.forEach(spectrum => {
      const displayY = applyProcessing(spectrum.wavelengths, spectrum.intensities, spectrum.processing);
      // After crop, displayY may be shorter than wavelengths — need cropped wavelengths too
      const { wavelengths: wl } = spectrum.processing.crop
        ? { wavelengths: spectrum.wavelengths.filter(w => w >= spectrum.processing.crop!.minWl && w <= spectrum.processing.crop!.maxWl) }
        : { wavelengths: spectrum.wavelengths };
      const lines = ['Wavelength (nm),Intensity (processed)'];
      wl.forEach((w, i) => { lines.push(`${w},${displayY[i] ?? ''}`); });
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${spectrum.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-200 bg-white flex-shrink-0">
      {/* View mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-slate-200">
        <button
          onClick={() => onSetViewMode('overlap')}
          className={`px-3 py-1 text-xs font-medium transition-colors
            ${viewMode === 'overlap' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          Overlap
        </button>
        <button
          onClick={() => onSetViewMode('stacked')}
          className={`px-3 py-1 text-xs font-medium transition-colors border-l border-slate-200
            ${viewMode === 'stacked' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          Stacked
        </button>
      </div>

      {/* Stack offset slider */}
      {viewMode === 'stacked' && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Offset</label>
          <input
            type="range" min="0" max="1" step="0.05"
            value={stackOffset}
            onChange={e => onSetStackOffset(parseFloat(e.target.value))}
            className="w-24 accent-blue-500"
          />
          <span className="text-xs text-slate-400 w-8">{(stackOffset * 100).toFixed(0)}%</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Peaks table */}
      <button
        onClick={onTogglePeakTable}
        disabled={selectedSpectra.length === 0}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
          ${peakTableOpen
            ? 'bg-teal-500 border-teal-500 text-white'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        title="View peak table for selected spectra"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 10h18M3 14h18M10 6l2-2 2 2M10 18l2 2 2-2" />
        </svg>
        Peaks
      </button>

      {/* Labels toggle */}
      <button
        onClick={onToggleLabels}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
          ${labelsVisible
            ? 'bg-amber-500 border-amber-500 text-white'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        title="Toggle peak labels on chart"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        Labels
      </button>

      {/* Analysis toggle */}
      <button
        onClick={onToggleAnalysis}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
          ${analysisOpen
            ? 'bg-violet-500 border-violet-500 text-white'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Analysis
      </button>

      {/* Export CSV */}
      <button
        onClick={exportCSV}
        disabled={selectedSpectra.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200
          text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        Export CSV
      </button>

      <span className="text-xs text-slate-400">{selectedSpectra.length} selected</span>
    </div>
  );
}
