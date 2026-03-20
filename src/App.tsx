import { useRef, useCallback, useState, useEffect } from 'react';
import { useSpectra } from './hooks/useSpectra';
import { DropZone } from './components/DropZone';
import { SpectrumLibrary } from './components/SpectrumLibrary';
import { ChartWorkspace } from './components/ChartWorkspace';
import { Toolbar } from './components/Toolbar';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ColumnMappingModal } from './components/ColumnMappingModal';
import { PeakTableModal } from './components/PeakTableModal';
import { Tutorial } from './components/Tutorial';
import { CalibrationPage } from './components/CalibrationPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { parseFile } from './parsers';
import type { Spectrum, ColumnMappingRequest, ProcessingOptions, HighlightedPeak } from './types/spectrum';
import { DEFAULT_PROCESSING } from './types/spectrum';

// @ts-ignore — plotly.js-dist-min shares runtime with plotly.js but ships no .d.ts
import * as _PlotlyRaw from 'plotly.js-dist-min';
const PlotlyLib: any = (_PlotlyRaw as any).default ?? _PlotlyRaw; // eslint-disable-line @typescript-eslint/no-explicit-any

const MIN_PANEL = 180;
const MAX_PANEL = 520;

/** Attaches mousemove/mouseup listeners to resize a panel by dragging. */
function startPanelDrag(
  e: React.MouseEvent,
  setter: React.Dispatch<React.SetStateAction<number>>,
  sign: 1 | -1,
) {
  e.preventDefault();
  let lastX = e.clientX;
  const onMove = (ev: MouseEvent) => {
    const dx = (ev.clientX - lastX) * sign;
    lastX = ev.clientX;
    setter(w => Math.max(MIN_PANEL, Math.min(MAX_PANEL, w + dx)));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/** Thin drag handle between panels. Hidden on mobile (panels become overlays). */
function DragHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 flex-shrink-0 bg-slate-200 hover:bg-blue-300 cursor-col-resize transition-colors hidden md:block"
      title="Drag to resize panel"
    />
  );
}

export default function App() {
  const {
    spectra, selectedIds, selectedSpectra,
    viewMode, stackOffset, dbLoaded,
    addSpectra, toggleSelect, selectAll, selectNone,
    removeSpectrum, setViewMode, setStackOffset,
    updateProcessingBulk, setSpectrumColor, renameSpectrum, duplicateSpectrum,
    invertSelect, removeSelected, clearAll, setSpectrumLabel, setSpectrumYValue,
  } = useSpectra();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const plotDivRef = useRef<HTMLElement | null>(null);

  // Track whether we're in "small" (< md / 768px) layout
  const [isSmall, setIsSmall] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsSmall(e.matches);
      if (e.matches) {
        setLibraryOpen(false);
        setAnalysisOpen(false);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [peakTableOpen, setPeakTableOpen] = useState(false);
  const [pendingMappings, setPendingMappings] = useState<ColumnMappingRequest[]>([]);
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(288);
  const [highlightedPeaks, setHighlightedPeaks] = useState<HighlightedPeak[]>([]);
  // Default open on md+, collapsed on small screens
  const [libraryOpen, setLibraryOpen] = useState(() => window.innerWidth >= 1024);
  const [dragMode, setDragMode] = useState<'zoom' | 'pan'>('zoom');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);

  const handleResetAxes = useCallback(() => {
    if (plotDivRef.current) {
      PlotlyLib.relayout(plotDivRef.current, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    }
  }, []);

  const handleDownloadPNG = useCallback(() => {
    if (plotDivRef.current) {
      PlotlyLib.downloadImage(plotDivRef.current, {
        format: 'png',
        filename: 'spectraview_export',
        width: 1200,
        height: 800,
        scale: 2,
      });
    }
  }, []);

  const handleSpectraLoaded = useCallback((newSpectra: Spectrum[]) => {
    addSpectra(newSpectra);
  }, [addSpectra]);

  const processFiles = useCallback(async (files: File[]) => {
    const results = await Promise.all(files.map(parseFile));
    const allSpectra: Spectrum[] = [];
    const allMappings: ColumnMappingRequest[] = [];
    results.forEach(r => {
      allSpectra.push(...r.spectra);
      if (r.mappingRequest) allMappings.push(r.mappingRequest);
    });
    if (allSpectra.length > 0) addSpectra(allSpectra);
    if (allMappings.length > 0) setPendingMappings(prev => [...prev, ...allMappings]);
  }, [addSpectra]);

  const handleAddMore = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) await processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const handleMappingConfirm = useCallback((newSpectra: Spectrum[]) => {
    addSpectra(newSpectra);
    setPendingMappings(prev => prev.slice(1));
  }, [addSpectra]);

  const handleMappingCancel = useCallback(() => {
    setPendingMappings(prev => prev.slice(1));
  }, []);

  const handleApplyAnalysis = useCallback((opts: ProcessingOptions) => {
    updateProcessingBulk([...selectedIds], opts);
  }, [selectedIds, updateProcessingBulk]);

  const handleResetAnalysis = useCallback(() => {
    updateProcessingBulk([...selectedIds], { ...DEFAULT_PROCESSING });
  }, [selectedIds, updateProcessingBulk]);

  const hasSpectra = spectra.length > 0;
  const currentMapping = pendingMappings[0];

  if (!dbLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 min-w-0">
        {/* Mobile library toggle */}
        {hasSpectra && isSmall && (
          <button
            onClick={() => setLibraryOpen(o => !o)}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
            title="Toggle library"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 flex-shrink-0 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-800 tracking-tight">SpectraView</span>
        </div>
        <span className="text-xs text-slate-400 border-l border-slate-200 pl-3 hidden sm:block truncate">
          Multi-Equipment Spectral Analysis Platform
        </span>
        <div className="flex-1" />
        {/* Tutorial button */}
        <button
          onClick={() => setTutorialOpen(true)}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700
            flex items-center justify-center text-sm font-semibold transition-colors"
          title="Start guided tour"
        >
          ?
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0 min-w-0">

        {/* Left panel (resizable on desktop, drawer overlay on mobile) */}
        {hasSpectra && (
          <>
            {/* Backdrop for mobile drawers */}
            {isSmall && libraryOpen && (
              <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={() => setLibraryOpen(false)}
              />
            )}
            {libraryOpen ? (
              <>
                <div
                  className={
                    isSmall
                      ? 'fixed inset-y-0 left-0 z-50 w-72 flex-shrink-0 shadow-2xl'
                      : 'flex-shrink-0 min-h-0'
                  }
                  style={isSmall ? undefined : { width: leftWidth }}
                >
                  <SpectrumLibrary
                    spectra={spectra}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onSelectAll={selectAll}
                    onSelectNone={selectNone}
                    onInvertSelect={invertSelect}
                    onRemove={removeSpectrum}
                    onRemoveSelected={() => removeSelected([...selectedIds])}
                    onClearAll={clearAll}
                    onDuplicate={duplicateSpectrum}
                    onAddMore={handleAddMore}
                    onRename={renameSpectrum}
                    onColorChange={setSpectrumColor}
                    onLabelChange={setSpectrumLabel}
                    onYValueChange={setSpectrumYValue}
                    onCollapse={() => setLibraryOpen(false)}
                  />
                </div>
                {!isSmall && <DragHandle onMouseDown={e => startPanelDrag(e, setLeftWidth, 1)} />}
              </>
            ) : (
              /* Collapsed library — thin bar, hidden on mobile (header button used instead) */
              <div className="hidden md:flex flex-shrink-0 w-8 flex-col items-center pt-3 gap-2 bg-white border-r border-slate-200">
                <button
                  onClick={() => setLibraryOpen(true)}
                  className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Expand library"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <span
                  className="text-[10px] text-slate-300 font-medium select-none"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  Library
                </span>
              </div>
            )}
          </>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {hasSpectra && (
            <Toolbar
              viewMode={viewMode}
              stackOffset={stackOffset}
              selectedSpectra={selectedSpectra}
              analysisOpen={analysisOpen}
              labelsVisible={labelsVisible}
              peakTableOpen={peakTableOpen}
              dragMode={dragMode}
              onSetViewMode={setViewMode}
              onSetStackOffset={setStackOffset}
              onToggleAnalysis={() => setAnalysisOpen(o => !o)}
              onToggleLabels={() => setLabelsVisible(v => !v)}
              onTogglePeakTable={() => setPeakTableOpen(o => !o)}
              onSetDragMode={setDragMode}
              onResetAxes={handleResetAxes}
              onDownloadPNG={handleDownloadPNG}
              onOpenCalibration={() => setCalibrationOpen(true)}
            />
          )}

          <div className="flex-1 flex min-h-0 min-w-0">
            {hasSpectra ? (
              <ErrorBoundary onReset={() => window.location.reload()}>
                <ChartWorkspace
                  spectra={selectedSpectra}
                  viewMode={viewMode}
                  stackOffset={stackOffset}
                  showLabels={labelsVisible}
                  highlightedPeaks={highlightedPeaks}
                  dragMode={dragMode}
                  onPlotInit={div => { plotDivRef.current = div; }}
                />
              </ErrorBoundary>
            ) : (
              <div className="flex-1 p-4 sm:p-8">
                <DropZone onSpectraLoaded={handleSpectraLoaded} onFilesDropped={processFiles} />
              </div>
            )}

            {/* Analysis panel — fixed drawer on mobile, resizable sidebar on desktop */}
            {hasSpectra && analysisOpen && (
              <>
                {isSmall && (
                  <div
                    className="fixed inset-0 bg-black/40 z-40"
                    onClick={() => setAnalysisOpen(false)}
                  />
                )}
                {!isSmall && <DragHandle onMouseDown={e => startPanelDrag(e, setRightWidth, -1)} />}
                <div
                  className={
                    isSmall
                      ? 'fixed inset-y-0 right-0 z-50 w-80 flex-shrink-0 shadow-2xl'
                      : 'flex-shrink-0 min-h-0'
                  }
                  style={isSmall ? undefined : { width: rightWidth }}
                >
                  <AnalysisPanel
                    selectedCount={selectedIds.size}
                    selectedSpectra={selectedSpectra}
                    viewMode={viewMode}
                    onApply={handleApplyAnalysis}
                    onReset={handleResetAnalysis}
                    onClose={() => setAnalysisOpen(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Calibration page */}
      {calibrationOpen && (
        <CalibrationPage
          spectra={selectedSpectra}
          onClose={() => setCalibrationOpen(false)}
        />
      )}

      {/* Tutorial overlay */}
      <Tutorial isOpen={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      {/* Peak Table Modal */}
      {peakTableOpen && selectedSpectra.length > 0 && (
        <PeakTableModal
          spectra={selectedSpectra}
          onClose={() => setPeakTableOpen(false)}
          onHighlightChange={setHighlightedPeaks}
        />
      )}

      {/* Column Mapping Modal */}
      {currentMapping && (
        <ColumnMappingModal
          request={currentMapping}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
