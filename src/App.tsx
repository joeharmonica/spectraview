import { useRef, useCallback, useState } from 'react';
import { useSpectra } from './hooks/useSpectra';
import { DropZone } from './components/DropZone';
import { SpectrumLibrary } from './components/SpectrumLibrary';
import { ChartWorkspace } from './components/ChartWorkspace';
import { Toolbar } from './components/Toolbar';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ColumnMappingModal } from './components/ColumnMappingModal';
import { PeakTableModal } from './components/PeakTableModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { parseFile } from './parsers';
import type { Spectrum, ColumnMappingRequest, ProcessingOptions } from './types/spectrum';
import { DEFAULT_PROCESSING } from './types/spectrum';

export default function App() {
  const {
    spectra, selectedIds, selectedSpectra,
    viewMode, stackOffset, dbLoaded,
    addSpectra, toggleSelect, selectAll, selectNone,
    removeSpectrum, setViewMode, setStackOffset,
    updateProcessingBulk, setSpectrumColor, renameSpectrum, duplicateSpectrum,
    invertSelect, removeSelected, clearAll,
  } = useSpectra();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [peakTableOpen, setPeakTableOpen] = useState(false);
  const [pendingMappings, setPendingMappings] = useState<ColumnMappingRequest[]>([]);

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

  // Don't render until DB has been checked (avoids flash of empty state)
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
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-800 tracking-tight">SpectraView</span>
        </div>
        <span className="text-xs text-slate-400 border-l border-slate-200 pl-3">
          Multi-Equipment Spectral Analysis Platform
        </span>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {hasSpectra && (
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
          />
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
              onSetViewMode={setViewMode}
              onSetStackOffset={setStackOffset}
              onToggleAnalysis={() => setAnalysisOpen(o => !o)}
              onToggleLabels={() => setLabelsVisible(v => !v)}
              onTogglePeakTable={() => setPeakTableOpen(o => !o)}
            />
          )}

          <div className="flex-1 flex min-h-0">
            {hasSpectra ? (
              <ErrorBoundary onReset={() => window.location.reload()}>
                <ChartWorkspace
                  spectra={selectedSpectra}
                  viewMode={viewMode}
                  stackOffset={stackOffset}
                  showLabels={labelsVisible}
                />
              </ErrorBoundary>
            ) : (
              <div className="flex-1 p-8">
                <DropZone onSpectraLoaded={handleSpectraLoaded} onFilesDropped={processFiles} />
              </div>
            )}

            {/* Analysis panel (slide in from right) */}
            {hasSpectra && analysisOpen && (
              <AnalysisPanel
                selectedCount={selectedIds.size}
                selectedSpectra={selectedSpectra}
                onApply={handleApplyAnalysis}
                onReset={handleResetAnalysis}
                onClose={() => setAnalysisOpen(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Peak Table Modal */}
      {peakTableOpen && selectedSpectra.length > 0 && (
        <PeakTableModal
          spectra={selectedSpectra}
          onClose={() => setPeakTableOpen(false)}
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

      {/* Hidden file input for "Add more" */}
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
