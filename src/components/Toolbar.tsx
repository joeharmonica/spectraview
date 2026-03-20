import type { Spectrum, ViewMode } from '../types/spectrum';
import { applyProcessing } from '../lib/processing';

interface Props {
  viewMode: ViewMode;
  stackOffset: number;
  selectedSpectra: Spectrum[];
  analysisOpen: boolean;
  labelsVisible: boolean;
  peakTableOpen: boolean;
  annotationsOpen: boolean;
  dragMode: 'zoom' | 'pan';
  onSetViewMode: (mode: ViewMode) => void;
  onSetStackOffset: (offset: number) => void;
  onToggleAnalysis: () => void;
  onToggleLabels: () => void;
  onTogglePeakTable: () => void;
  onToggleAnnotations: () => void;
  onSetDragMode: (mode: 'zoom' | 'pan') => void;
  onResetAxes: () => void;
  onDownloadPNG: () => void;
  onOpenCalibration: () => void;
}

export function Toolbar({
  viewMode, stackOffset, selectedSpectra,
  analysisOpen, labelsVisible, peakTableOpen, annotationsOpen, dragMode,
  onSetViewMode, onSetStackOffset, onToggleAnalysis, onToggleLabels, onTogglePeakTable,
  onToggleAnnotations, onSetDragMode, onResetAxes, onDownloadPNG, onOpenCalibration,
}: Props) {
  const canHeatmap = selectedSpectra.length >= 2
    && selectedSpectra.every(s => s.format === 'rf6000_3d');

  const exportCSV = () => {
    if (selectedSpectra.length === 0) return;

    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

    // Build per-spectrum data (cropped wavelengths + processed intensities)
    const cols = selectedSpectra.map(s => {
      const intensities = applyProcessing(s.wavelengths, s.intensities, s.processing);
      const wavelengths = s.processing.crop
        ? s.wavelengths.filter(w => w >= s.processing.crop!.minWl && w <= s.processing.crop!.maxWl)
        : s.wavelengths;
      return { name: s.name, label: s.label, yValue: s.yValue, group: s.group, wavelengths, intensities };
    });

    const hasLabel = cols.some(c => c.label);
    const hasYValue = cols.some(c => c.yValue !== undefined);
    const hasGroup = cols.some(c => c.group);

    const lines: string[] = [];

    // SpectraView round-trip header
    lines.push(['##SpectraView', 'v1'].join(','));
    lines.push(['#Name', ...cols.map(c => q(c.name))].join(','));
    if (hasLabel) lines.push(['#Label', ...cols.map(c => q(c.label ?? ''))].join(','));
    if (hasYValue) lines.push(['#YValue', ...cols.map(c => c.yValue !== undefined ? q(String(c.yValue)) : '""')].join(','));
    if (hasGroup) lines.push(['#Group', ...cols.map(c => q(c.group ?? ''))].join(','));

    // Data header
    lines.push(['Wavelength (nm)', ...cols.map(c => q(c.name))].join(','));

    // Data rows
    const maxLen = Math.max(...cols.map(c => c.wavelengths.length));
    for (let i = 0; i < maxLen; i++) {
      const row = [
        cols[0]!.wavelengths[i] ?? '',
        ...cols.map(c => c.intensities[i] ?? ''),
      ].join(',');
      lines.push(row);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = cols.length === 1 ? cols[0]!.name.replace(/[^a-z0-9]/gi, '_') : 'spectra_export';
    a.download = `${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 border-b border-slate-200 bg-white flex-shrink-0">

      {/* View mode toggle */}
      <div id="tutorial-view-mode" className="flex rounded-lg overflow-hidden border border-slate-200">
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
        <button
          onClick={() => onSetViewMode('heatmap')}
          disabled={!canHeatmap}
          title={!canHeatmap ? 'Select ≥ 2 rf6000_3d spectra to enable heatmap' : undefined}
          className={`px-3 py-1 text-xs font-medium transition-colors border-l border-slate-200
            disabled:opacity-40 disabled:cursor-not-allowed
            ${viewMode === 'heatmap' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          Heatmap
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

      {/* ── Chart controls ── */}
      <div id="tutorial-chart-controls" className="flex items-center gap-0.5 border border-slate-200 rounded-lg overflow-hidden">
        {/* Zoom / Pan toggle */}
        <button
          onClick={() => onSetDragMode(dragMode === 'zoom' ? 'pan' : 'zoom')}
          title={dragMode === 'zoom' ? 'Mode: Zoom — drag to zoom in. Click to switch to Pan.' : 'Mode: Pan — drag to pan. Click to switch to Zoom.'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors
            ${dragMode === 'pan' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          {dragMode === 'zoom' ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 013 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
            </svg>
          )}
          {dragMode === 'zoom' ? 'Zoom' : 'Pan'}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200" />

        {/* Reset axes */}
        <button
          onClick={onResetAxes}
          title="Reset axes — fit all data into view"
          className="p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200" />

        {/* Download PNG */}
        <button
          onClick={onDownloadPNG}
          title="Download chart as PNG (1200 × 800 px, 2×)"
          className="p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-slate-200" />

      {/* Peaks table */}
      <button
        id="tutorial-peaks-btn"
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
        <span className="hidden sm:inline">Peaks</span>
      </button>

      {/* Labels toggle */}
      <button
        id="tutorial-labels-btn"
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
        <span className="hidden sm:inline">Labels</span>
      </button>

      {/* Annotations toggle */}
      <button
        id="tutorial-annotations-btn"
        onClick={onToggleAnnotations}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
          ${annotationsOpen
            ? 'bg-rose-500 border-rose-500 text-white'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        title="Toggle annotations panel — draw lines and labels on the chart"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span className="hidden sm:inline">Draw</span>
      </button>

      {/* Analysis toggle */}
      <button
        id="tutorial-analysis-btn"
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
        <span className="hidden sm:inline">Analysis</span>
      </button>

      {/* Export CSV */}
      <button
        id="tutorial-csv-btn"
        onClick={exportCSV}
        disabled={selectedSpectra.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200
          text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Export processed spectra as CSV"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        <span className="hidden sm:inline">CSV</span>
      </button>

      {/* Calibrate */}
      <button
        id="tutorial-calibration-btn"
        onClick={onOpenCalibration}
        disabled={selectedSpectra.length < 3}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200
          text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={selectedSpectra.length < 3 ? 'Select ≥ 3 spectra to open calibration' : 'Build a calibration / predictive model'}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        <span className="hidden sm:inline">Calibrate</span>
      </button>

      <span className="text-xs text-slate-400 hidden sm:inline">{selectedSpectra.length} selected</span>
    </div>
  );
}
