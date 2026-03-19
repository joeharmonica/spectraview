import { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { Data, Layout, Config, Annotations } from 'plotly.js';
import type { Spectrum, ViewMode } from '../types/spectrum';
import { applyProcessing } from '../lib/processing';

interface Props {
  spectra: Spectrum[];
  viewMode: ViewMode;
  stackOffset: number;
  showLabels: boolean;
}

export function ChartWorkspace({ spectra, viewMode, stackOffset, showLabels }: Props) {
  // Memoize expensive processing (baseline, smoothing, normalization) — only reruns when
  // spectrum data or processing options actually change, not on every parent render.
  const processed = useMemo(() =>
    spectra.map(s => ({
      ...s,
      displayIntensities: applyProcessing(s.wavelengths, s.intensities, s.processing),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spectra],
  );

  const { traces, annotations } = useMemo(() => {
    if (processed.length === 0) return { traces: [], annotations: [] };

    const yMaxAll = processed.reduce((max, s) => {
      const sMax = s.displayIntensities.reduce((a, b) => (b > a ? b : a), -Infinity);
      return sMax > max ? sMax : max;
    }, 0);

    const t: Data[] = processed.map((s, i) => {
      const yOffset = viewMode === 'stacked' ? i * stackOffset * yMaxAll : 0;
      return {
        x: s.wavelengths,
        y: s.displayIntensities.map(v => v + yOffset),
        type: 'scatter',
        mode: 'lines',
        name: s.name,
        line: { color: s.color, width: 1.5 },
        hovertemplate: `<b>${s.name}</b><br>λ: %{x:.1f} nm<br>I: %{y:.4f}<extra></extra>`,
      } as Data;
    });

    const ann: Partial<Annotations>[] = showLabels
      ? processed.map((s, i) => {
          const yOffset = viewMode === 'stacked' ? i * stackOffset * yMaxAll : 0;
          let peakIdx = 0;
          let peakVal = -Infinity;
          s.displayIntensities.forEach((v, idx) => {
            if (v > peakVal) { peakVal = v; peakIdx = idx; }
          });
          const peakX = s.wavelengths[peakIdx] ?? 0;
          const peakY = (s.displayIntensities[peakIdx] ?? 0) + yOffset;
          return {
            x: peakX, y: peakY,
            xref: 'x' as const, yref: 'y' as const,
            text: `<b>${s.name}</b><br>${peakX.toFixed(1)} nm`,
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

  if (spectra.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
        Select spectra from the library to plot
      </div>
    );
  }

  const layout: Partial<Layout> = {
    autosize: true,
    margin: { t: 20, r: 20, b: 60, l: 70 },
    paper_bgcolor: 'white',
    plot_bgcolor: '#f8fafc',
    xaxis: {
      title: { text: 'Wavelength (nm)', font: { size: 12 } },
      gridcolor: '#e2e8f0',
      showgrid: true,
      zeroline: false,
    },
    yaxis: {
      title: { text: 'Intensity', font: { size: 12 } },
      gridcolor: '#e2e8f0',
      showgrid: true,
      zeroline: false,
    },
    legend: {
      x: 1.01, xanchor: 'left', y: 1,
      bgcolor: 'rgba(255,255,255,0.8)',
      bordercolor: '#e2e8f0', borderwidth: 1,
      font: { size: 11 },
    },
    hovermode: 'closest',
    annotations,
  };

  const config: Partial<Config> = {
    scrollZoom: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
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
    <div className="flex-1 min-h-0 relative">
      <div className="absolute inset-0">
        <Plot
          data={traces}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
