import { useState, useEffect, useRef } from 'react';

interface Step {
  targetId: string | null;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    targetId: null,
    title: 'Welcome to SpectraView',
    body: 'SpectraView runs entirely in your browser — nothing is uploaded or shared. Load, visualise, process, and calibrate spectral data from common lab instruments. Use the arrow keys or the buttons below to move through this tour.',
  },
  {
    targetId: 'tutorial-library',
    title: 'Spectrum Library',
    body: 'Drag files in or click "+ Add" to load CSV or Excel files. Check a row to plot that spectrum — uncheck to hide it. Double-click a name to rename it, or click the colour swatch to change the line colour. Drag the panel\'s right edge to resize it.',
  },
  {
    targetId: 'tutorial-library',
    title: 'Search & Multi-Term Filter',
    body: 'Type in the search box to filter spectra by name instantly. Click "T+" to enable multi-term mode — separate words with spaces and all terms must match. Format chips let you show only spectra from a specific instrument.',
  },
  {
    targetId: 'tutorial-library',
    title: 'Custom Labels & Y Values',
    body: 'Click the "+ label" pill on any row to set a display name shown in the chart legend. Click the "+ Y value" pill to store a reference value (e.g. concentration) that auto-fills Step 1 of the Calibration wizard.',
  },
  {
    targetId: 'tutorial-library',
    title: 'Table View — Sort, Resize & Group',
    body: 'Click the grid icon in the library header to switch to table view. Click a column header to sort, and drag its right edge to resize. Type a group name in the Group cell to cluster rows — click the group header to collapse or expand it.',
  },
  {
    targetId: 'tutorial-view-mode',
    title: 'View Modes',
    body: 'Switch between Overlap (shared Y-axis), Stacked (vertically offset — drag the slider to adjust spacing), and Heatmap (EEM colour map for 3D fluorescence data). Hover the heatmap to preview an emission slice in the resizable panel below.',
  },
  {
    targetId: 'tutorial-chart-controls',
    title: 'Chart Controls & Zoom Persistence',
    body: 'Use Zoom (drag a box) or Pan (drag to scroll) — both support scroll-wheel zoom. Your zoom is preserved when you select spectra or edit values in the library. Click Reset (⤢) to fit all data back into view.',
  },
  {
    targetId: 'tutorial-peaks-btn',
    title: 'Peak Table',
    body: 'Opens a table of local maxima for all plotted spectra. Filter by prominence (relative to each spectrum\'s max) or minimum intensity. Bookmark any peak to mark it on the chart with a dotted line.',
  },
  {
    targetId: 'tutorial-labels-btn',
    title: 'Peak Annotations',
    body: 'Toggle wavelength callout labels on each spectrum\'s highest peak. Labels show the custom name and peak wavelength in nm — handy for export-ready charts.',
  },
  {
    targetId: 'tutorial-annotations-btn',
    title: 'Draw & Annotations',
    body: 'Open the Annotations panel to place vertical lines, horizontal lines, or text labels on the chart. Enable "Drawing" mode, then click anywhere on the chart to instantly drop a vertical marker at that wavelength. Edit the label or delete any annotation from the list below.',
  },
  {
    targetId: 'tutorial-analysis-btn',
    title: 'Analysis Panel',
    body: 'Apply non-destructive processing in sequence: Crop → Smooth (Savitzky-Golay) → Baseline subtraction → Normalise → Integrate (AUC). Each step only affects the chart view — your original data is never modified.',
  },
  {
    targetId: 'tutorial-csv-btn',
    title: 'CSV Export & Round-Trip Import',
    body: 'Export processed intensities as a CSV. SpectraView embeds each spectrum\'s name, label, Y value, and group so re-importing the file fully restores everything. Data is also auto-saved to your browser and reloaded on your next visit.',
  },
  {
    targetId: null,
    title: 'Calibration & Modelling',
    body: 'Build a model to predict concentration, pH, or any measurable property from spectral data. The 3-step wizard guides you through defining features, picking algorithms (PCR, PLS-R, Ridge, and more), and reviewing results with metrics and interactive plots.',
  },
  {
    targetId: null,
    title: 'Spectral Input Features (X)',
    body: 'Choose how to represent each spectrum: a single wavelength (great for Beer-Lambert), the full spectrum, or one or more custom nm ranges. Click "+ Add range" to focus on known absorption bands.',
  },
  {
    targetId: null,
    title: 'Model Results & Comparison',
    body: 'Run multiple models at once to compare them side by side. The Overview tab ranks models by test R² and highlights the best performer. Each model tab shows a predictions table, % error chart, and full residuals. Download an HTML report covering all models.',
  },
  {
    targetId: null,
    title: "You're all set!",
    body: 'Click the ? button in the top bar any time to replay this tour. Hover ? icons throughout the app for in-context tips. Use ← → arrow keys to navigate the tour, or Esc to close it at any time.',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function Tutorial({ isOpen, onClose }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = STEPS[stepIdx]!;
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  // Measure target element on each step change
  useEffect(() => {
    if (!isOpen) {
      setStepIdx(0);
      setRect(null);
      return;
    }
    if (!step.targetId) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.getElementById(step.targetId!);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r.width > 0 && r.height > 0 ? r : null);
      } else {
        setRect(null);
      }
    };
    // Small delay so panels can open/render before measuring
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [isOpen, stepIdx, step.targetId]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (!isLast) setStepIdx(i => i + 1); else onClose();
      }
      if (e.key === 'ArrowLeft' && !isFirst) setStepIdx(i => i - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isFirst, isLast, onClose]);

  if (!isOpen) return null;

  // Compute card position so it doesn't obscure the target
  const CARD_W = 400;
  const CARD_H = 280; // generous estimate
  const M = 16;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  let cardStyle: React.CSSProperties;
  if (rect) {
    // Prefer right side, then left, then below, then above
    let left: number;
    let top: number;
    if (rect.right + CARD_W + M <= vw) {
      left = rect.right + M;
      top = Math.max(M, Math.min(rect.top, vh - CARD_H - M));
    } else if (rect.left - CARD_W - M >= 0) {
      left = rect.left - CARD_W - M;
      top = Math.max(M, Math.min(rect.top, vh - CARD_H - M));
    } else if (rect.bottom + CARD_H + M <= vh) {
      left = Math.max(M, Math.min(rect.left + rect.width / 2 - CARD_W / 2, vw - CARD_W - M));
      top = rect.bottom + M;
    } else {
      left = Math.max(M, Math.min(rect.left + rect.width / 2 - CARD_W / 2, vw - CARD_W - M));
      top = Math.max(M, rect.top - CARD_H - M);
    }
    cardStyle = { left, top };
  } else {
    // Centered when no target
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  return (
    <div className="fixed inset-0 z-[9000] pointer-events-none">
      {/* Spotlight overlay */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.68)',
            borderRadius: 10,
            border: '2px solid rgba(255,255,255,0.3)',
            transition: 'all 0.25s ease',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/65" />
      )}

      {/* Tutorial card */}
      <div
        ref={cardRef}
        className="fixed bg-white rounded-2xl shadow-2xl pointer-events-auto"
        style={{ width: CARD_W, ...cardStyle, transition: 'top 0.25s ease, left 0.25s ease' }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <span className="text-xs text-slate-400 font-medium tracking-wide uppercase">
            Step {stepIdx + 1} of {STEPS.length}
          </span>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-slate-500 transition-colors"
            title="Exit tour"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1 px-6 pt-3 flex-wrap">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStepIdx(i)}
              className={`h-1.5 rounded-full transition-all duration-200
                ${i === stepIdx ? 'bg-blue-500 w-6' : i < stepIdx ? 'bg-blue-200 w-2.5' : 'bg-slate-200 w-2.5 hover:bg-slate-300'}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pt-4 pb-5">
          <h3 className="text-base font-semibold text-slate-800 mb-2">{step.title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed">{step.body}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 pb-5">
          <button
            onClick={() => setStepIdx(i => i - 1)}
            disabled={isFirst}
            className="text-sm text-slate-400 hover:text-slate-600 disabled:opacity-0 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={() => isLast ? onClose() : setStepIdx(i => i + 1)}
            className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {isLast ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
