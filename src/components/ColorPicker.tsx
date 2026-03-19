import { useEffect, useRef } from 'react';

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#0ea5e9', '#d946ef', '#22c55e', '#eab308', '#a855f7',
  '#f43f5e', '#06b6d4', '#fb923c', '#64748b', '#000000',
];

interface Props {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
}

export function ColorPicker({ color, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-40 left-0 top-6 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-52"
    >
      <div className="grid grid-cols-5 gap-1.5 mb-2">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => { onChange(c); onClose(); }}
            className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110
              ${c === color ? 'border-slate-400 scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
        <input
          type="color"
          value={color}
          onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-slate-200"
          title="Custom color"
        />
        <input
          type="text"
          value={color}
          onChange={e => {
            const val = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(val)) onChange(val);
          }}
          className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-300"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}
