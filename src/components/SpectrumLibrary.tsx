import { useState, useRef, useMemo } from 'react';
import type { Spectrum, SpectrumFormat } from '../types/spectrum';
import { ColorPicker } from './ColorPicker';

type FormatFilter = 'all' | SpectrumFormat;
type SortKey = 'name-asc' | 'name-desc' | 'format' | 'wav-asc' | 'wav-desc';

interface Props {
  spectra: Spectrum[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onInvertSelect: () => void;
  onRemove: (id: string) => void;
  onRemoveSelected: () => void;
  onClearAll: () => void;
  onDuplicate: (id: string) => void;
  onAddMore: () => void;
  onRename: (id: string, name: string) => void;
  onColorChange: (id: string, color: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onCollapse: () => void;
}

export function SpectrumLibrary({
  spectra, selectedIds,
  onToggleSelect, onSelectAll, onSelectNone, onInvertSelect,
  onRemove, onRemoveSelected, onClearAll, onDuplicate,
  onAddMore, onRename, onColorChange, onLabelChange, onCollapse,
}: Props) {
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [labelingId, setLabelingId] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');

  const presentFormats = useMemo(() => [...new Set(spectra.map(s => s.format))], [spectra]);

  const filtered = useMemo(() =>
    spectra
      .filter(s => {
        if (formatFilter !== 'all' && s.format !== formatFilter) return false;
        if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
            !s.filename.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sortKey) {
          case 'name-asc':  return a.name.localeCompare(b.name);
          case 'name-desc': return b.name.localeCompare(a.name);
          case 'format':    return a.format.localeCompare(b.format) || a.name.localeCompare(b.name);
          case 'wav-asc':   return (a.wavelengths[0] ?? 0) - (b.wavelengths[0] ?? 0);
          case 'wav-desc':  return (b.wavelengths[0] ?? 0) - (a.wavelengths[0] ?? 0);
          default: return 0;
        }
      }),
    [spectra, search, formatFilter, sortKey],
  );

  const allSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.id));

  const startRename = (s: Spectrum) => {
    setRenamingId(s.id);
    setRenameValue(s.name);
  };

  const commitRename = (id: string) => {
    if (renameValue.trim()) onRename(id, renameValue.trim());
    setRenamingId(null);
  };

  const startLabel = (s: Spectrum) => {
    setRenamingId(null); // close any open rename
    setLabelingId(s.id);
    setLabelValue(s.label ?? '');
  };

  const commitLabel = (id: string) => {
    onLabelChange(id, labelValue.trim());
    setLabelingId(null);
  };

  return (
    <aside id="tutorial-library" className="w-full h-full bg-white border-r border-slate-200 flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-200 flex items-center gap-2">
        {/* Collapse button */}
        <button
          onClick={onCollapse}
          title="Collapse library panel"
          className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-sm font-semibold text-slate-700 flex-1 truncate">
          Library <span className="text-slate-400 font-normal">({spectra.length})</span>
        </h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          {spectra.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              title="Clear all spectra"
            >
              Clear all
            </button>
          )}
          <button onClick={onAddMore} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            + Add
          </button>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="px-3 py-2 border-b border-slate-100 flex gap-1.5">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg
              focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              ×
            </button>
          )}
        </div>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          title="Sort order"
          className="text-xs border border-slate-200 rounded-lg px-1.5 py-1.5 text-slate-500
            focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white cursor-pointer"
        >
          <option value="name-asc">Name A→Z</option>
          <option value="name-desc">Name Z→A</option>
          <option value="format">Format</option>
          <option value="wav-asc">λ min↑</option>
          <option value="wav-desc">λ min↓</option>
        </select>
      </div>

      {/* Format filter chips */}
      {presentFormats.length > 1 && (
        <div className="px-3 py-2 border-b border-slate-100 flex gap-1 flex-wrap">
          <FormatChip label="All" active={formatFilter === 'all'} onClick={() => setFormatFilter('all')} />
          {presentFormats.map(f => (
            <FormatChip key={f} label={formatBadge(f)} active={formatFilter === f}
              onClick={() => setFormatFilter(f)} />
          ))}
        </div>
      )}

      {/* Select controls */}
      {filtered.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap gap-x-3 gap-y-1 items-center">
          <button
            onClick={allSelected ? onSelectNone : onSelectAll}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <button onClick={onInvertSelect} className="text-xs text-slate-500 hover:text-slate-700">
            Invert
          </button>
          {selectedIds.size > 0 && (
            <>
              <span className="text-slate-200">|</span>
              <button
                onClick={onRemoveSelected}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Remove {selectedIds.size}
              </button>
            </>
          )}
          <span className="text-xs text-slate-400 ml-auto">{selectedIds.size} selected</span>
        </div>
      )}

      {/* Spectrum list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center mt-8 px-4">
            {spectra.length === 0 ? 'No spectra loaded yet.' : 'No results match your search.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(spectrum => (
              <SpectrumRow
                key={spectrum.id}
                spectrum={spectrum}
                isSelected={selectedIds.has(spectrum.id)}
                isRenaming={renamingId === spectrum.id}
                renameValue={renameValue}
                isLabeling={labelingId === spectrum.id}
                labelValue={labelValue}
                showColorPicker={colorPickerId === spectrum.id}
                onToggle={() => onToggleSelect(spectrum.id)}
                onRemove={() => onRemove(spectrum.id)}
                onDuplicate={() => onDuplicate(spectrum.id)}
                onColorSwatchClick={() => setColorPickerId(colorPickerId === spectrum.id ? null : spectrum.id)}
                onColorChange={color => { onColorChange(spectrum.id, color); setColorPickerId(null); }}
                onColorPickerClose={() => setColorPickerId(null)}
                onNameClick={() => startRename(spectrum)}
                onRenameChange={setRenameValue}
                onRenameCommit={() => commitRename(spectrum.id)}
                onLabelClick={() => startLabel(spectrum)}
                onLabelChange={setLabelValue}
                onLabelCommit={() => commitLabel(spectrum.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function SpectrumRow({
  spectrum, isSelected, isRenaming, renameValue, isLabeling, labelValue, showColorPicker,
  onToggle, onRemove, onDuplicate, onColorSwatchClick, onColorChange, onColorPickerClose,
  onNameClick, onRenameChange, onRenameCommit, onLabelClick, onLabelChange, onLabelCommit,
}: {
  spectrum: Spectrum;
  isSelected: boolean;
  isRenaming: boolean;
  renameValue: string;
  isLabeling: boolean;
  labelValue: string;
  showColorPicker: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onColorSwatchClick: () => void;
  onColorChange: (c: string) => void;
  onColorPickerClose: () => void;
  onNameClick: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onLabelClick: () => void;
  onLabelChange: (v: string) => void;
  onLabelCommit: () => void;
}) {
  const renameRef = useRef<HTMLInputElement>(null);
  const [metaOpen, setMetaOpen] = useState(false);

  const hasProcessing = spectrum.processing.normalize !== null ||
    spectrum.processing.smooth !== null ||
    spectrum.processing.baseline !== null ||
    spectrum.processing.crop !== null;

  const metaEntries = Object.entries(spectrum.metadata ?? {});

  return (
    <li className={`group hover:bg-slate-50 ${isSelected ? 'bg-blue-50/50' : ''}`}>
    <div className="flex items-center gap-2 px-3 py-2">
      {/* Color swatch (clickable for color picker) */}
      <div className="relative flex-shrink-0">
        <button
          onClick={onColorSwatchClick}
          className="w-3.5 h-3.5 rounded-full ring-2 ring-white hover:ring-slate-300 transition-all"
          style={{ backgroundColor: spectrum.color }}
          title="Change color"
        />
        {showColorPicker && (
          <ColorPicker
            color={spectrum.color}
            onChange={onColorChange}
            onClose={onColorPickerClose}
          />
        )}
      </div>

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="flex-shrink-0 accent-blue-500"
      />

      {/* Name + filename */}
      <div className="flex-1 min-w-0" onClick={!isRenaming ? onToggle : undefined}>
        {isRenaming ? (
          <input
            ref={renameRef}
            autoFocus
            type="text"
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={e => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCommit(); }}
            className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 focus:outline-none"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <p
            className="text-xs font-medium text-slate-700 truncate cursor-pointer hover:text-blue-600"
            onDoubleClick={e => { e.stopPropagation(); onNameClick(); }}
            title="Double-click to rename"
          >
            {spectrum.name}
          </p>
        )}
        <p className="text-xs text-slate-400 truncate">
          {spectrum.filename}
        </p>
        {/* Chart label pill — always visible for discoverability */}
        {isLabeling ? (
          <input
            autoFocus
            type="text"
            value={labelValue}
            placeholder="Chart label (blank = use name)"
            onChange={e => onLabelChange(e.target.value)}
            onBlur={onLabelCommit}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') onLabelCommit(); }}
            onClick={e => e.stopPropagation()}
            className="w-full text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none mt-1"
          />
        ) : spectrum.label ? (
          <button
            onClick={e => { e.stopPropagation(); onLabelClick(); }}
            title="Chart label — click to edit"
            className="inline-flex items-center max-w-full px-2 py-0.5 rounded-full text-white text-xs font-medium mt-1 truncate hover:opacity-80 transition-opacity"
            style={{ backgroundColor: spectrum.color }}
          >
            <span className="truncate">{spectrum.label}</span>
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onLabelClick(); }}
            title="Add a custom label shown on the chart"
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium mt-1 border border-dashed text-slate-400 hover:text-slate-600 transition-colors"
            style={{ borderColor: spectrum.color }}
          >
            + label
          </button>
        )}
        {spectrum.wavelengths.length > 0 && (
          <p className="text-xs text-slate-300 hidden group-hover:block">
            {spectrum.wavelengths[0]?.toFixed(0)}–{spectrum.wavelengths[spectrum.wavelengths.length - 1]?.toFixed(0)} nm
            · {spectrum.wavelengths.length} pts
          </p>
        )}
      </div>

      {/* Processing badge */}
      {hasProcessing && (
        <span className="text-xs text-violet-500 flex-shrink-0 font-mono" title="Processing applied">★</span>
      )}

      {/* Format badge (on hover) */}
      <span className="text-xs text-slate-300 flex-shrink-0 hidden group-hover:inline">
        {formatBadge(spectrum.format)}
      </span>

      {/* Duplicate */}
      <button
        onClick={e => { e.stopPropagation(); onDuplicate(); }}
        className="flex-shrink-0 text-slate-300 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Duplicate"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="flex-shrink-0 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Info / metadata toggle */}
      {metaEntries.length > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setMetaOpen(o => !o); }}
          className={`flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100
            ${metaOpen ? 'text-blue-500' : 'text-slate-300 hover:text-slate-500'}`}
          title="Show metadata"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}
    </div>

    {/* Inline metadata panel */}
    {metaOpen && metaEntries.length > 0 && (
      <div className="px-3 pb-2 text-xs">
        <dl className="bg-slate-50 rounded-lg p-2 space-y-0.5">
          {metaEntries.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <dt className="text-slate-400 font-medium shrink-0 capitalize">{k.replace(/_/g, ' ')}:</dt>
              <dd className="text-slate-600 truncate" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    )}
    </li>
  );
}

function FormatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors
        ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
    >
      {label}
    </button>
  );
}

function formatBadge(format: SpectrumFormat | 'all'): string {
  switch (format) {
    case 'cary3500': return 'UV-Vis';
    case 'rf6000_2d': return '2D-F';
    case 'rf6000_3d': return '3D-F';
    case 'r1f': return 'R1F';
    default: return 'XY';
  }
}
