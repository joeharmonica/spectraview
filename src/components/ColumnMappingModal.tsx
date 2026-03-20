import { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import type { ColumnMappingRequest, Spectrum } from '../types/spectrum';
import { parseFileWithMapping } from '../parsers';

interface Props {
  request: ColumnMappingRequest;
  onConfirm: (spectra: Spectrum[]) => void;
  onCancel: () => void;
}

export function ColumnMappingModal({ request, onConfirm, onCancel }: Props) {
  const { rawRows, suggestedHeaderRows, suggestedWavCol, suggestedIntCols } = request;

  const [headerRows, setHeaderRows] = useState(suggestedHeaderRows);
  const [wavCol, setWavCol] = useState(suggestedWavCol);
  const [intCols, setIntCols] = useState<number[]>(suggestedIntCols);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const maxCols = useMemo(() => rawRows.reduce((m, r) => Math.max(m, r.length), 0), [rawRows]);

  // Column headers derived from the last header row, or generic labels
  const columnHeaders = useMemo((): string[] => {
    if (headerRows > 0) {
      const lastHeaderRow = rawRows[headerRows - 1] ?? [];
      return Array.from({ length: maxCols }, (_, i) => {
        const label = lastHeaderRow[i]?.trim();
        return label && label.length > 0 ? label : `Col ${i + 1}`;
      });
    }
    return Array.from({ length: maxCols }, (_, i) => `Col ${i + 1}`);
  }, [rawRows, headerRows, maxCols]);

  const dataRows = useMemo(() => rawRows.slice(headerRows), [rawRows, headerRows]);

  // When wavCol changes, remove it from intCols if present
  const handleWavColChange = (col: number) => {
    setWavCol(col);
    setIntCols(prev => prev.filter(c => c !== col));
  };

  const toggleIntCol = (col: number) => {
    if (col === wavCol) return;
    setIntCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col].sort((a, b) => a - b)
    );
  };

  const selectAllIntCols = () =>
    setIntCols(Array.from({ length: maxCols }, (_, i) => i).filter(i => i !== wavCol));

  const clearIntCols = () => setIntCols([]);

  // Preview uses the first selected intensity column
  const previewIntCol = intCols[0] ?? -1;

  const mappedPreview = useMemo(() => {
    if (previewIntCol < 0) return [];
    const pairs: { wav: number; int: number }[] = [];
    for (const row of dataRows) {
      const w = parseFloat((row[wavCol] ?? '').trim());
      const i = parseFloat((row[previewIntCol] ?? '').trim());
      if (!isNaN(w) && !isNaN(i)) pairs.push({ wav: w, int: i });
      if (pairs.length >= 10) break;
    }
    return pairs;
  }, [dataRows, wavCol, previewIntCol]);

  // Count valid points for first selected column
  const totalValidPoints = useMemo(() => {
    if (previewIntCol < 0) return 0;
    let count = 0;
    for (const row of dataRows) {
      const w = parseFloat((row[wavCol] ?? '').trim());
      const i = parseFloat((row[previewIntCol] ?? '').trim());
      if (!isNaN(w) && !isNaN(i)) count++;
    }
    return count;
  }, [dataRows, wavCol, previewIntCol]);

  const handleImport = async () => {
    setError(null);
    if (intCols.length === 0) {
      setError('Select at least one intensity column.');
      return;
    }
    const text = await request.file.text();
    const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
    const rows = result.data as string[][];
    const spectra = parseFileWithMapping(rows, request.filename, wavCol, intCols, headerRows);
    if (spectra.length === 0) {
      setError('No numeric data found. Adjust column selection or header row count.');
      return;
    }
    onConfirm(spectra);
  };

  const colStyle = (colIdx: number, isHeader: boolean) => {
    if (colIdx === wavCol)
      return isHeader ? 'bg-blue-100 text-blue-800 font-semibold' : 'bg-blue-50 text-blue-800 font-medium';
    if (intCols.includes(colIdx))
      return isHeader ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'bg-emerald-50 text-emerald-800 font-medium';
    return isHeader ? 'bg-slate-50 text-slate-500' : 'text-slate-500';
  };

  const importLabel = intCols.length > 1
    ? `Import (${intCols.length} spectra · ${totalValidPoints} pts)`
    : totalValidPoints > 0 ? `Import (${totalValidPoints} pts)` : 'Import';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-800">Map Columns</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Unknown format: <span className="font-medium text-slate-700">{request.filename}</span>.
            Select which columns contain wavelength and intensity data.
          </p>
        </div>

        {/* Controls */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex-shrink-0 space-y-3">

          {/* Row 1: Wavelength + Header rows */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400 mr-1.5" />
                Wavelength column
              </label>
              <select
                value={wavCol}
                onChange={e => handleWavColChange(Number(e.target.value))}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {columnHeaders.map((h, i) => (
                  <option key={i} value={i}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Header rows to skip</label>
              <input
                type="number"
                min={0}
                max={rawRows.length - 1}
                value={headerRows}
                onChange={e => {
                  const v = Math.max(0, Math.min(rawRows.length - 1, parseInt(e.target.value) || 0));
                  setHeaderRows(v);
                }}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

          {/* Row 2: Intensity columns multi-selector */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-xs font-medium text-slate-500">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 mr-1.5" />
                Intensity columns
                <span className="ml-1.5 text-slate-400 font-normal">
                  ({intCols.length} selected — one spectrum per column)
                </span>
              </label>
              <button
                onClick={selectAllIntCols}
                className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
              >All</button>
              <span className="text-slate-200">·</span>
              <button
                onClick={clearIntCols}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >None</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
              {columnHeaders.map((h, i) => {
                if (i === wavCol) return null;
                const selected = intCols.includes(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleIntCol(i)}
                    className={`px-2 py-0.5 rounded-md text-xs font-medium border transition-colors truncate max-w-[120px]
                      ${selected
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                      }`}
                    title={h}
                  >
                    {selected && <span className="mr-1">✓</span>}{h}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Two-panel preview */}
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">

          {/* Left: raw rows table */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-slate-100">
            <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50 border-b border-slate-100 flex-shrink-0">
              Raw data preview — {headerRows > 0 ? `${headerRows} header row${headerRows !== 1 ? 's' : ''} (muted)` : 'no headers detected'}
            </p>
            <div className="flex-1 overflow-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-slate-300 bg-slate-50 border-b border-slate-100 w-8 sticky top-0">#</th>
                    {columnHeaders.map((h, i) => (
                      <th key={i} className={`px-2 py-1 text-left border-b border-slate-100 sticky top-0 ${colStyle(i, true)}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Header rows — muted */}
                  {rawRows.slice(0, headerRows).map((row, ri) => (
                    <tr key={`h${ri}`} className="opacity-40">
                      <td className="px-2 py-0.5 text-slate-300">{ri + 1}</td>
                      {columnHeaders.map((_, ci) => (
                        <td key={ci} className="px-2 py-0.5 text-slate-400 italic truncate max-w-[100px]">
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Data rows */}
                  {dataRows.slice(0, 15).map((row, ri) => (
                    <tr key={`d${ri}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-2 py-0.5 text-slate-300">{headerRows + ri + 1}</td>
                      {columnHeaders.map((_, ci) => (
                        <td key={ci} className={`px-2 py-0.5 truncate max-w-[100px] ${colStyle(ci, false)}`}>
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: mapped preview */}
          <div className="w-full sm:w-60 flex-shrink-0 flex flex-col border-t sm:border-t-0 sm:border-l border-slate-100">
            <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50 border-b border-slate-100 flex-shrink-0">
              Mapped preview
              {totalValidPoints > 0 && (
                <span className="ml-1 font-medium text-emerald-600">· {totalValidPoints} pts</span>
              )}
              {intCols.length > 1 && (
                <span className="ml-1 text-slate-400">· {intCols.length} spectra</span>
              )}
            </p>
            <div className="flex-1 overflow-auto">
              {mappedPreview.length === 0 ? (
                <div className="p-4 text-xs text-slate-400 text-center mt-6">
                  {intCols.length === 0
                    ? 'Select at least one\nintensity column.'
                    : 'No valid pairs found.\nCheck column selection.'}
                </div>
              ) : (
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-3 py-1.5 text-left bg-blue-50 text-blue-700 border-b border-slate-100 sticky top-0">
                        Wavelength (nm)
                      </th>
                      <th className="px-3 py-1.5 text-left bg-emerald-50 text-emerald-700 border-b border-slate-100 sticky top-0 truncate max-w-[100px]"
                          title={columnHeaders[previewIntCol]}>
                        {columnHeaders[previewIntCol] ?? 'Intensity'} (a.u.)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedPreview.map((pair, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-3 py-1 text-blue-800 font-mono">{pair.wav.toFixed(2)}</td>
                        <td className="px-3 py-1 text-emerald-800 font-mono">{pair.int.toExponential(3)}</td>
                      </tr>
                    ))}
                    {totalValidPoints > 10 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-1 text-slate-400 text-center italic text-xs">
                          …{totalValidPoints - 10} more rows
                        </td>
                      </tr>
                    )}
                    {intCols.length > 1 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-slate-400 text-center italic text-xs border-t border-slate-100">
                          +{intCols.length - 1} more spectrum{intCols.length > 2 ? 'a' : ''}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 flex-shrink-0 flex items-center justify-between flex-wrap gap-2">
          {error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : (
            <p className="text-xs text-slate-400">
              Blue = wavelength · Green = selected intensity · Muted = header rows
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleImport()}
              disabled={intCols.length === 0 || totalValidPoints === 0}
              className="px-4 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {importLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
