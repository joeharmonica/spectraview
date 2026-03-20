/**
 * Converts mouse client coordinates to Plotly data coordinates.
 *
 * Requires the Plotly graph div (the element returned by `onInitialized`) which
 * has `_fullLayout` attached after Plotly's first render.
 *
 * Returns null when:
 * - `_fullLayout` is not yet populated
 * - `p2c` (pixel-to-cartesian) axis methods are unavailable
 * - The cursor falls outside the plot area (i.e. in the margins)
 */
export function pixelToDataCoords(
  clientX: number,
  clientY: number,
  plotDiv: HTMLElement,
): { x: number; y: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fl = (plotDiv as any)._fullLayout;
  if (!fl?.xaxis?.p2c || !fl?.yaxis?.p2c) return null;

  const rect = plotDiv.getBoundingClientRect();
  const { l, t, r, b } = fl.margin as { l: number; t: number; r: number; b: number };
  const plotW = (fl.width as number) - l - r;
  const plotH = (fl.height as number) - t - b;

  const px = clientX - rect.left - l;
  const py = clientY - rect.top - t;

  if (px < 0 || py < 0 || px > plotW || py > plotH) return null;

  return {
    x: fl.xaxis.p2c(px) as number,
    y: fl.yaxis.p2c(py) as number,
  };
}
