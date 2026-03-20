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
    body: 'A browser-based platform for loading, visualising, processing, and calibrating spectral data. All computation and storage runs entirely in your browser — nothing leaves your machine. Use ← → or keyboard arrows to navigate, Esc to exit.',
  },
  {
    targetId: 'tutorial-library',
    title: 'Spectrum Library',
    body: 'Drag-and-drop or click "+ Add" to load CSV/XLSX files. Check a spectrum to plot it; uncheck to hide it. Search, filter by format, and sort by name or wavelength. Double-click a name to rename it. Click the colour swatch to change the plot colour. The "←" button collapses this panel for more chart space.',
  },
  {
    targetId: 'tutorial-library',
    title: 'Custom Chart Labels',
    body: 'Each row shows a coloured pill — the "+ label" pill (dashed border) or a filled pill if a label is already set. Click it to type a custom name. This label appears in the chart legend, tooltips, and peak table instead of the filename.',
  },
  {
    targetId: 'tutorial-view-mode',
    title: 'View Modes',
    body: 'Overlap: all spectra share one Y-axis. Stacked: spectra are offset vertically — drag the Offset slider to control spacing. Heatmap: builds an EEM 2D colour map (Viridis scale) from 3D fluorescence data; requires ≥ 2 rf6000_3d spectra. Hover on the heatmap to preview the emission slice below the chart.',
  },
  {
    targetId: 'tutorial-chart-controls',
    title: 'Chart Controls',
    body: 'Zoom (default): drag to draw a zoom box. Pan: drag to scroll the chart. Both support scroll-wheel zoom. Reset fits all loaded data back into view. Download saves the chart as a high-resolution PNG (1200 × 800 px, 2×). Double-click the chart to reset axes.',
  },
  {
    targetId: 'tutorial-peaks-btn',
    title: 'Peak Table',
    body: 'Detects local maxima across all selected spectra. Filter by prominence % (relative to each spectrum\'s maximum) or by absolute minimum intensity. Click the bookmark icon on any row to mark that peak on the chart with a labelled dotted line. Click "Clear markers" in the footer to remove all marks.',
  },
  {
    targetId: 'tutorial-labels-btn',
    title: 'Peak Annotations',
    body: 'Toggles name + wavelength callout labels at each spectrum\'s dominant peak directly on the chart. Labels show the custom label (or filename) alongside the peak wavelength in nm. Useful for quick slide-ready chart exports.',
  },
  {
    targetId: 'tutorial-analysis-btn',
    title: 'Analysis Panel',
    body: 'Non-destructive processing applied in order: (1) Crop — trim to a wavelength window. (2) Smooth — Savitzky-Golay filter with adjustable window and polynomial order. (3) Baseline — polynomial background subtraction. (4) Normalise — to maximum, unit area, or a reference wavelength. (5) Integrate — trapezoidal AUC. Hover the ? icons for detailed tips.',
  },
  {
    targetId: 'tutorial-csv-btn',
    title: 'Export & Data Persistence',
    body: 'CSV exports the processed intensities for all selected spectra (one file per spectrum). Your loaded spectra and processing settings are automatically saved to IndexedDB — they\'ll be here next time you open the app. Use "Clear all" in the library to reset.',
  },
  {
    targetId: null,
    title: 'Calibration & Modelling',
    body: 'Build quantitative spectral models to predict concentration, pH, or any measurable property. Click the Calibration button to open the 3-step wizard: (1) Define Variables — choose spectral features and enter known Y values. (2) Configure Model — pick one or more algorithms from the dropdown, tune parameters. (3) Review Results — metrics, plots, and downloadable report.',
  },
  {
    targetId: null,
    title: 'Spectral Input Features (X)',
    body: 'Three input modes: Single wavelength — intensity at one nm point, ideal for Beer-Lambert calibrations (univariate; shows Pearson r and slope). Full spectrum — all wavelengths, best with PLS-R or PCR. Multiple wavelength ranges — one or more nm windows concatenated as features; use "+ Add range" to focus on known absorption bands.',
  },
  {
    targetId: null,
    title: 'Model Results & Comparison',
    body: 'Select two or more models in the dropdown to run a comparison. Models run sequentially with a live progress bar. Results open with an Overview tab showing the ranked comparison table (★ best = highest test R²; ← your pick = your first selection) and R² chart. Each model gets its own tab with full results. Download a full HTML report covering all models.',
  },
  {
    targetId: null,
    title: "You're all set!",
    body: 'Click the ? button in the header any time to replay this tour. Hover the ? icons throughout the app for contextual tips on every feature. On smaller screens, use the ☰ button in the header to open the library drawer.',
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
