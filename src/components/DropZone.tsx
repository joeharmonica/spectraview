import { useRef, useState, useCallback } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import type { Spectrum } from '../types/spectrum';

interface Props {
  onSpectraLoaded: (spectra: Spectrum[]) => void;
  onFilesDropped?: (files: File[]) => Promise<void>;
}

export function DropZone({ onFilesDropped }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: File[]) => {
    const csvFiles = files.filter(f => f.name.endsWith('.csv') || f.name.endsWith('.xlsx'));
    if (csvFiles.length === 0) {
      setError('Please drop CSV files.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      if (onFilesDropped) await onFilesDropped(csvFiles);
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoading(false);
    }
  }, [onFilesDropped]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    void processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    void processFiles(Array.from(e.target.files ?? []));
  };

  return (
    <div
      className={`flex flex-col items-center justify-center h-full border-2 border-dashed rounded-xl
        transition-colors cursor-pointer select-none
        ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50'}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".csv,.xlsx" multiple className="hidden" onChange={onFileChange} />

      {isLoading ? (
        <div className="flex flex-col items-center gap-3 text-blue-500">
          <div className="w-10 h-10 border-4 border-blue-300 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm font-medium">Parsing files…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-slate-400 pointer-events-none">
          <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-500">Drop spectra files here</p>
            <p className="text-sm mt-1">or click to browse</p>
            <p className="text-xs mt-2 text-slate-300">Supports CSV from Cary 3500, RF-6000 (2D/3D), R1F</p>
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-1 pointer-events-auto">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
