import { useState } from 'react';
import type { UserAnnotation } from '../types/spectrum';

interface Props {
  annotations: UserAnnotation[];
  annotateMode: boolean;
  onToggleAnnotateMode: () => void;
  onAdd: (ann: Omit<UserAnnotation, 'id'>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<UserAnnotation>) => void;
  onClose: () => void;
}

const LINE_STYLES: UserAnnotation['lineStyle'][] = ['solid', 'dash', 'dot'];
const PRESET_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'];

export function AnnotationsPanel({
  annotations, annotateMode, onToggleAnnotateMode,
  onAdd, onRemove, onUpdate, onClose,
}: Props) {
  const [newX, setNewX] = useState('');
  const [newType, setNewType] = useState<UserAnnotation['type']>('vline');
  const [newY, setNewY] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#ef4444');
  const [newLineStyle, setNewLineStyle] = useState<UserAnnotation['lineStyle']>('solid');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const handleAdd = () => {
    const x = parseFloat(newX);
    if (isNaN(x) && newType !== 'hline') return;
    const y = newType !== 'vline' ? parseFloat(newY) : undefined;
    onAdd({
      type: newType,
      x: isNaN(x) ? 0 : x,
      y: y !== undefined && !isNaN(y) ? y : undefined,
      label: newLabel.trim() || undefined,
      color: newColor,
      lineStyle: newLineStyle,
    });
    setNewX('');
    setNewY('');
    setNewLabel('');
  };

  const startEditLabel = (ann: UserAnnotation) => {
    setEditingId(ann.id);
    setEditLabel(ann.label ?? '');
  };

  const commitEditLabel = (id: string) => {
    onUpdate(id, { label: editLabel.trim() || undefined });
    setEditingId(null);
  };

  return (
    <aside className="w-full h-full bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-200 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-700 flex-1">Annotations</h2>
        {/* Draw mode toggle */}
        <button
          onClick={onToggleAnnotateMode}
          title={annotateMode ? 'Click mode: active — click chart to add vline' : 'Enable click-to-draw mode'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors
            ${annotateMode
              ? 'bg-rose-500 text-white'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          {annotateMode ? 'Drawing…' : 'Draw'}
        </button>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Add annotation form */}
      <div className="px-3 py-2 border-b border-slate-100 space-y-2">
        <p className="text-xs font-medium text-slate-500">Add annotation</p>

        {/* Type selector */}
        <div className="flex gap-1">
          {(['vline', 'hline', 'text'] as const).map(t => (
            <button
              key={t}
              onClick={() => setNewType(t)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors
                ${newType === t ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {t === 'vline' ? 'V-Line' : t === 'hline' ? 'H-Line' : 'Text'}
            </button>
          ))}
        </div>

        {/* Position inputs */}
        <div className="flex gap-1.5">
          {newType !== 'hline' && (
            <input
              type="number"
              placeholder="X (nm)"
              value={newX}
              onChange={e => setNewX(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          )}
          {newType !== 'vline' && (
            <input
              type="number"
              placeholder="Y"
              value={newY}
              onChange={e => setNewY(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          )}
        </div>

        {/* Label */}
        <input
          type="text"
          placeholder="Label (optional)"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
        />

        {/* Color + line style */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-4 h-4 rounded-full transition-all ${newColor === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-1 ml-auto">
            {LINE_STYLES.map(s => (
              <button
                key={s}
                onClick={() => setNewLineStyle(s)}
                className={`px-1.5 py-0.5 text-xs rounded transition-colors
                  ${newLineStyle === s ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
              >
                {s === 'solid' ? '—' : s === 'dash' ? '- -' : '···'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={newType !== 'hline' && newX === ''}
          className="w-full py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>

        {annotateMode && (
          <p className="text-xs text-rose-500 text-center">
            Click anywhere on the chart to add a vertical line
          </p>
        )}
      </div>

      {/* Existing annotations list */}
      <div className="flex-1 overflow-y-auto">
        {annotations.length === 0 ? (
          <p className="text-xs text-slate-400 text-center mt-8 px-4">No annotations yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {annotations.map(ann => (
              <li key={ann.id} className="group flex items-start gap-2 px-3 py-2 hover:bg-slate-50">
                {/* Color + type indicator */}
                <div className="flex-shrink-0 mt-0.5 flex flex-col items-center gap-0.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ann.color }} />
                  <span className="text-[9px] text-slate-400 font-mono">{ann.type}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Position */}
                  <p className="text-xs font-mono text-slate-600">
                    {ann.type === 'vline' && `x = ${ann.x.toFixed(2)} nm`}
                    {ann.type === 'hline' && `y = ${ann.y?.toFixed(4) ?? '?'}`}
                    {ann.type === 'text' && `(${ann.x.toFixed(1)}, ${ann.y?.toFixed(4) ?? '?'})`}
                  </p>
                  {/* Label edit */}
                  {editingId === ann.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onBlur={() => commitEditLabel(ann.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEditLabel(ann.id); }}
                      className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 mt-0.5 focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startEditLabel(ann)}
                      className={`text-xs mt-0.5 text-left ${ann.label ? 'text-slate-600' : 'text-slate-300 italic'} hover:text-blue-500`}
                    >
                      {ann.label || 'add label…'}
                    </button>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => onRemove(ann.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                  title="Delete annotation"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
