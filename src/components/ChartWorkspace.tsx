import { useMemo, useState, useCallback, useRef } from 'react';
import _PlotImport from 'react-plotly.js';
import type { Data, Layout, Config, Annotations, Shape } from 'plotly.js';
import { pixelToDataCoords } from '../lib/chartUtils';

// Vite 8 (rolldown) pre-bundles react-plotly.js via __commonJSMin and does
//   export default require_react_plotly()
// which returns the CJS exports *object* {__esModule:true, default: PlotComponent},
// not the component itself. Unwrap .default to get the actual React class.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = ((_PlotImport as any).default ?? _PlotImport) as typeof _PlotImport;

if (typeof Plot !== 'function') {
  console.error(
    '[SpectraView][ChartWorkspace] Plot component is invalid after CJS unwrap.',
    'Got:', typeof Plot, Plot,
    '\nExpected a React class/function from react-plotly.js.',
  );
}

const MIN_BOTTOM = 64;
const MAX_BOTTOM = 400;

// Plotly layout margins — must stay in sync with `layout.margin` below
const PLOT_MARGIN = { l: 70, t: 20, r: 20, b: 60 } as const;

import type { Spectrum, ViewMode, HighlightedPeak, UserAnnotation } from '../types/spectrum';
import { applyProcessing } from '../lib/processing';

interface Props {
  spectra: Spectrum[];
  viewMode: ViewMode;
  stackOffset: number;
  showLabels: boolean;
  highlightedPeaks?: HighlightedPeak[];
  userAnnotations?: UserAnnotation[];
  /** Drag mode controlled by parent (Toolbar) */
  dragMode: 'zoom' | 'pan';
  /** Annotate mode — clicking on chart adds a vertical line annotation */
  annotateMode?: boolean;
  /** Called when user clicks chart in annotate mode with the clicked x and y values */
  onAnnotationAdd?: (x: number, y: number) => void;
  /** Incremented by parent when "Reset Axes" is clicked — clears stored zoom */
  resetKey?: number;
  /** Called once the Plotly graphDiv is ready — parent uses it for reset/download */
  onPlotInit: (div: HTMLElement) => void;
}

export function ChartWorkspace({
  spectra, viewMode, stackOffset, showLabels,
  highlightedPeaks = [], userAnnotations = [], dragMode,
  annotateMode = false, onAnnotationAdd, resetKey = 0, onPlotInit,
}: Props) {
  const [hoveredEx, setHoveredEx] = useState<number | null>(null);
  const [bottomHeight, setBottomHeight] = useState(112); // default matches old h-28
  const bottomLastY = useRef(0);

  // Ref to the Plotly graph div — needed for pixel→data coordinate conversion
  const chartDivRef = useRef<HTMLElement | null>(null);
  // Ref to the cursor readout DOM node — updated directly to avoid re-renders on mousemove
  const cursorReadoutRef = useRef<HTMLDivElement>(null);
  // Mirror viewMode in a ref so the mousemove handler can read it without stale closures
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  // Zoom preservation: store current x/y ranges across re-renders
  type ZoomState = { x: [number, number]; y: [number, number] };
  const zoomRef = useRef<ZoomState | null>(null);
  const lastResetKey = useRef(resetKey);

  // When resetKey increments, clear stored zoom synchronously during render
  // (must happen before storedZoom is read below, so useEffect is too late)
  if (resetKey !== lastResetKey.current) {
    zoomRef.current = null;
    lastResetKey.current = resetKey;
  }

  const startBottomDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    bottomLastY.current = e.clientY;
    const onMove = (ev: MouseEvent) => {
      const dy = bottomLastY.current - ev.clientY; // drag up → dy > 0 → taller
      bottomLastY.current = ev.clientY;
      setBottomHeight(h => Math.max(MIN_BOTTOM, Math.min(MAX_BOTTOM, h + dy)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Memoize expensive processing — only reruns when spectrum data or processing options change
  const processed = useMemo(() =>
    spectra.map(s => {
      const displayIntensities = applyProcessing(s.wavelengths, s.intensities, s.processing);
      // When crop is active, the wavelength array must also be sliced to match the cropped intensities
      const displayWavelengths = s.processing.crop
        ? s.wavelengths.filter(w => w >= s.processing.crop!.minWl && w <= s.processing.crop!.maxWl)
        : s.wavelengths;
      return { ...s, displayWavelengths, displayIntensities };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spectra],
  );

  const { traces, annotations } = useMemo(() => {
    if (processed.length === 0) return { traces: [], annotations: [] };

    if (viewMode === 'heatmap' && processed.every(s => s.format === 'rf6000_3d')) {
      const sorted = [...processed].sort((a, b) =>
        parseFloat(a.metadata?.excitation_nm ?? '0') - parseFloat(b.metadata?.excitation_nm ?? '0')
      );
      const exWavelengths = sorted.map(s => parseFloat(s.metadata?.excitation_nm ?? '0'));
      const emWavelengths = sorted[0].wavelengths;
      const z = sorted.map(s => s.displayIntensities);

      return {
        traces: [{
          type: 'heatmap',
          x: emWavelengths,
          y: exWavelengths,
          z,
          colorscale: 'Viridis',
          showscale: true,
          colorbar: { title: { text: 'Intensity', side: 'right' }, thickness: 15 },
          hovertemplate: 'Em: %{x:.1f} nm<br>Ex: %{y:.1f} nm<br>I: %{z:.4f}<extra></extra>',
        } as Data],
        annotations: [],
      };
    }

    const yMaxAll = processed.reduce((max, s) => {
      const sMax = s.displayIntensities.reduce((a, b) => (b > a ? b : a), -Infinity);
      return sMax > max ? sMax : max;
    }, 0);

    const t: Data[] = processed.map((s, i) => {
      const yOffset = viewMode === 'stacked' ? i * stackOffset * yMaxAll : 0;
      const displayName = s.label || s.name;
      return {
        x: s.displayWavelengths,
        y: s.displayIntensities.map(v => v + yOffset),
        type: 'scatter',
        mode: 'lines',
        name: displayName,
        line: { color: s.color, width: 1.5 },
        hovertemplate: `<b>${displayName}</b><br>λ: %{x:.1f} nm<br>I: %{y:.4f}<extra></extra>`,
      } as Data;
    });

    const ann: Partial<Annotations>[] = showLabels
      ? processed.map((s, i) => {
          const yOffset = viewMode === 'stacked' ? i * stackOffset * yMaxAll : 0;
          const displayName = s.label || s.name;
          let peakIdx = 0;
          let peakVal = -Infinity;
          s.displayIntensities.forEach((v, idx) => {
            if (v > peakVal) { peakVal = v; peakIdx = idx; }
          });
          const peakX = s.displayWavelengths[peakIdx] ?? 0;
          const peakY = (s.displayIntensities[peakIdx] ?? 0) + yOffset;
          return {
            x: peakX, y: peakY,
            xref: 'x' as const, yref: 'y' as const,
            text: `<b>${displayName}</b><br>${peakX.toFixed(1)} nm`,
            showarrow: true, arrowhead: 2, arrowsize: 0.8, arrowwidth: 1,
            arrowcolor: s.color,
            font: { size: 10, color: s.color },
            bgcolor: 'rgba(255,255,255,0.85)',
            bordercolor: s.color, borderwidth: 1, borderpad: 3,
            ax: 0, ay: -36,
          } as Partial<Annotations>;
        })
      : [];

    return { traces: t, annotations: ann };
  }, [processed, viewMode, stackOffset, showLabels]);

  // Find the closest emission slice for the hovered excitation wavelength
  const hoveredSlice = useMemo(() => {
    if (viewMode !== 'heatmap' || hoveredEx === null || processed.length === 0) return null;
    const sorted = [...processed].sort((a, b) =>
      parseFloat(a.metadata?.excitation_nm ?? '0') - parseFloat(b.metadata?.excitation_nm ?? '0')
    );
    const slice = sorted.reduce((best, s) => {
      const d = Math.abs(parseFloat(s.metadata?.excitation_nm ?? '0') - hoveredEx);
      const bd = Math.abs(parseFloat(best.metadata?.excitation_nm ?? '0') - hoveredEx);
      return d < bd ? s : best;
    });
    return {
      exWl: parseFloat(slice.metadata?.excitation_nm ?? '0'),
      wavelengths: slice.wavelengths,
      intensities: slice.displayIntensities,
    };
  }, [hoveredEx, processed, viewMode]);

  const handleHover = useCallback((event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (viewMode === 'heatmap' && event.points?.length > 0) {
      const exWl = event.points[0].y as number;
      setHoveredEx(prev => prev === exWl ? prev : exWl);
    }
  }, [viewMode]);

  const handleUnhover = useCallback(() => {
    if (viewMode === 'heatmap') setHoveredEx(null);
  }, [viewMode]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRelayout = useCallback((event: any) => {
    // Capture zoom state when user pans/zooms
    if (event['xaxis.range[0]'] !== undefined && event['xaxis.range[1]'] !== undefined) {
      zoomRef.current = {
        x: [event['xaxis.range[0]'], event['xaxis.range[1]']],
        y: zoomRef.current?.y ?? [0, 1],
      };
    }
    if (event['yaxis.range[0]'] !== undefined && event['yaxis.range[1]'] !== undefined) {
      zoomRef.current = {
        x: zoomRef.current?.x ?? [0, 1],
        y: [event['yaxis.range[0]'], event['yaxis.range[1]']],
      };
    }
    // User reset zoom via Plotly UI (double-click etc.)
    if (event['xaxis.autorange'] === true || event['yaxis.autorange'] === true) {
      zoomRef.current = null;
    }
  }, []);

  // Handles clicks on the transparent overlay div in annotate mode.
  // Uses pixel→data conversion so any click on the chart area (not just on a trace) works.
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartDivRef.current || !onAnnotationAdd) return;
    const coords = pixelToDataCoords(e.clientX, e.clientY, chartDivRef.current);
    if (coords) onAnnotationAdd(coords.x, coords.y);
  }, [onAnnotationAdd]);

  // Updates the cursor readout via direct DOM write (no state → zero re-renders on mousemove).
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartDivRef.current || !cursorReadoutRef.current) return;
    const coords = pixelToDataCoords(e.clientX, e.clientY, chartDivRef.current);
    const el = cursorReadoutRef.current;
    if (coords) {
      const isHeatmap = viewModeRef.current === 'heatmap';
      el.textContent = isHeatmap
        ? `Em: ${coords.x.toFixed(1)} nm   Ex: ${coords.y.toFixed(1)} nm`
        : `λ: ${coords.x.toFixed(1)} nm   I: ${coords.y.toFixed(4)}`;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (cursorReadoutRef.current) cursorReadoutRef.current.style.display = 'none';
  }, []);

  if (spectra.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
        Select spectra from the library to plot
      </div>
    );
  }

  // Build xaxis / yaxis with stored zoom range if available
  const storedZoom = zoomRef.current;
  const xaxisRange = storedZoom ? { range: storedZoom.x, autorange: false as const } : { autorange: true as const };
  const yaxisRange = storedZoom ? { range: storedZoom.y, autorange: false as const } : { autorange: true as const };

  // Convert user annotations to Plotly shapes + annotation labels
  const userShapes: Partial<Shape>[] = userAnnotations.flatMap((ann): Partial<Shape>[] => {
    const dashStyle = ann.lineStyle as 'solid' | 'dash' | 'dot';
    if (ann.type === 'vline') {
      return [{
        type: 'line' as const,
        x0: ann.x, x1: ann.x,
        y0: 0, y1: 1,
        yref: 'paper' as const,
        line: { color: ann.color, width: 1.5, dash: dashStyle },
      } as Partial<Shape>];
    }
    if (ann.type === 'hline' && ann.y !== undefined) {
      return [{
        type: 'line' as const,
        x0: 0, x1: 1,
        xref: 'paper' as const,
        y0: ann.y, y1: ann.y,
        line: { color: ann.color, width: 1.5, dash: dashStyle },
      } as Partial<Shape>];
    }
    return [];
  });

  const userAnnotationLabels: Partial<Annotations>[] = userAnnotations
    .filter(ann => ann.label)
    .map(ann => ({
      x: ann.x,
      y: ann.y !== undefined ? ann.y : 1,
      xref: 'x' as const,
      yref: ann.y !== undefined ? 'y' as const : 'paper' as const,
      text: ann.label!,
      showarrow: false,
      font: { size: 10, color: ann.color },
      xanchor: 'center' as const,
      yanchor: 'bottom' as const,
      bgcolor: 'rgba(255,255,255,0.85)',
      bordercolor: ann.color,
      borderwidth: 1,
      borderpad: 2,
    }));

  const layout: Partial<Layout> = {
    autosize: true,
    margin: { t: PLOT_MARGIN.t, r: PLOT_MARGIN.r, b: PLOT_MARGIN.b, l: PLOT_MARGIN.l },
    paper_bgcolor: 'white',
    plot_bgcolor: '#f8fafc',
    dragmode: dragMode as Layout['dragmode'],
    xaxis: {
      title: { text: viewMode === 'heatmap' ? 'Emission Wavelength (nm)' : 'Wavelength (nm)', font: { size: 12 } },
      gridcolor: '#e2e8f0',
      showgrid: true,
      zeroline: false,
      ...xaxisRange,
    },
    yaxis: {
      title: { text: viewMode === 'heatmap' ? 'Excitation Wavelength (nm)' : 'Intensity', font: { size: 12 } },
      gridcolor: '#e2e8f0',
      showgrid: true,
      zeroline: false,
      ...yaxisRange,
    },
    showlegend: viewMode !== 'heatmap',
    legend: {
      x: 1.01, xanchor: 'left', y: 1,
      bgcolor: 'rgba(255,255,255,0.8)',
      bordercolor: '#e2e8f0', borderwidth: 1,
      font: { size: 11 },
    },
    hovermode: 'closest',
    annotations: [
      ...annotations,
      ...userAnnotationLabels,
      ...highlightedPeaks.map(p => ({
        x: p.wavelength,
        y: 1,
        xref: 'x' as const,
        yref: 'paper' as const,
        text: `${p.wavelength.toFixed(1)} nm`,
        showarrow: false,
        font: { size: 9, color: p.color },
        xanchor: 'center' as const,
        yanchor: 'bottom' as const,
        bgcolor: 'rgba(255,255,255,0.85)',
        bordercolor: p.color,
        borderwidth: 1,
        borderpad: 2,
      } as Partial<Annotations>)),
    ],
    shapes: [
      ...userShapes,
      ...highlightedPeaks.map(p => ({
        type: 'line' as const,
        x0: p.wavelength, x1: p.wavelength,
        y0: 0, y1: 1,
        yref: 'paper' as const,
        line: { color: p.color, width: 1.5, dash: 'dot' as const },
      } as Partial<Shape>)),
    ],
  };

  const config: Partial<Config> = {
    scrollZoom: true,
    displayModeBar: false,
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: {
      format: 'png',
      filename: 'spectraview_export',
      height: 800,
      width: 1200,
      scale: 2,
    },
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Main chart area */}
      <div className="flex-1 relative min-h-0">
        <div
          className="absolute inset-0"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <Plot
            data={traces}
            layout={layout}
            config={config}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
            onInitialized={(_, div) => { chartDivRef.current = div; onPlotInit(div); }}
            onHover={handleHover}
            onUnhover={handleUnhover}
            onRelayout={handleRelayout}
          />

          {/* Transparent click-capture overlay — only active in annotate mode.
              Covers the exact plot area (inside axes) so any click lands here. */}
          {annotateMode && (
            <div
              style={{
                position: 'absolute',
                left: PLOT_MARGIN.l,
                top: PLOT_MARGIN.t,
                right: PLOT_MARGIN.r,
                bottom: PLOT_MARGIN.b,
                cursor: 'crosshair',
                zIndex: 10,
              }}
              onClick={handleOverlayClick}
            />
          )}

          {/* Live cursor coordinate readout — updated via ref, no React re-renders */}
          <div
            ref={cursorReadoutRef}
            style={{
              position: 'absolute',
              top: PLOT_MARGIN.t + 6,
              right: PLOT_MARGIN.r + 6,
              display: 'none',
              pointerEvents: 'none',
              zIndex: 20,
            }}
            className="bg-white/90 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-500 shadow-sm select-none"
          />
        </div>
      </div>

      {/* Heatmap hover preview — shows the emission slice at the hovered excitation row */}
      {viewMode === 'heatmap' && (
        <>
          {/* Vertical drag handle — drag up to grow panel, drag down to shrink */}
          <div
            onMouseDown={startBottomDrag}
            className="flex-shrink-0 h-1 bg-slate-200 hover:bg-blue-300 cursor-row-resize transition-colors"
            title="Drag to resize emission slice panel"
          />
        <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-2 overflow-hidden" style={{ height: bottomHeight }}>
          {hoveredSlice ? (
            <div className="h-full flex flex-col gap-0.5">
              <span className="text-xs text-slate-400 flex-shrink-0">
                Emission at Ex = <span className="font-medium text-slate-600">{hoveredSlice.exWl.toFixed(1)} nm</span>
              </span>
              <svg className="flex-1 w-full overflow-visible" viewBox="0 0 100 32" preserveAspectRatio="none">
                <EmissionSlicePath
                  wavelengths={hoveredSlice.wavelengths}
                  intensities={hoveredSlice.intensities}
                />
              </svg>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-300 select-none">
              Hover over the heatmap to preview the emission slice
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}

/** Renders a single emission spectrum as a normalised SVG polyline (viewBox 100×32). */
function EmissionSlicePath({ wavelengths, intensities }: { wavelengths: number[]; intensities: number[] }) {
  if (wavelengths.length < 2) return null;
  const minX = wavelengths[0];
  const maxX = wavelengths[wavelengths.length - 1];
  const maxY = Math.max(...intensities);
  const minY = Math.min(0, Math.min(...intensities));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const points = wavelengths.map((wl, i) => {
    const px = ((wl - minX) / rangeX) * 100;
    const py = 30 - ((intensities[i] - minY) / rangeY) * 28;
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  }).join(' ');

  return (
    <>
      <line x1="0" y1="30" x2="100" y2="30" stroke="#e2e8f0" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="0.8"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <text x="0.5" y="31.5" fontSize="2.5" fill="#94a3b8">{minX.toFixed(0)} nm</text>
      <text x="99.5" y="31.5" fontSize="2.5" fill="#94a3b8" textAnchor="end">{maxX.toFixed(0)} nm</text>
    </>
  );
}
