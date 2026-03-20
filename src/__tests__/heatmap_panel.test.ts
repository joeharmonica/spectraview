import { describe, it, expect } from 'vitest';

// Mirror the constants used in ChartWorkspace for the bottom emission slice panel.
const MIN_BOTTOM = 64;
const MAX_BOTTOM = 400;
const DEFAULT_BOTTOM = 112; // matches former h-28 (7rem = 112 px)

/** Applies one drag delta to the current height, clamped to [MIN, MAX]. */
function applyDrag(current: number, dy: number): number {
  return Math.max(MIN_BOTTOM, Math.min(MAX_BOTTOM, current + dy));
}

// ─── Bottom panel height clamping ───────────────────────────────────────────

describe('bottom emission slice panel — height clamping', () => {
  it('default height is within [MIN_BOTTOM, MAX_BOTTOM]', () => {
    expect(DEFAULT_BOTTOM).toBeGreaterThanOrEqual(MIN_BOTTOM);
    expect(DEFAULT_BOTTOM).toBeLessThanOrEqual(MAX_BOTTOM);
  });

  it('clamps to MIN_BOTTOM when drag would exceed lower bound', () => {
    // Drag down (positive in raw clientY, so negative dy) past the minimum
    expect(applyDrag(DEFAULT_BOTTOM, -(DEFAULT_BOTTOM + 100))).toBe(MIN_BOTTOM);
  });

  it('clamps to MAX_BOTTOM when drag would exceed upper bound', () => {
    expect(applyDrag(DEFAULT_BOTTOM, MAX_BOTTOM * 2)).toBe(MAX_BOTTOM);
  });

  it('drag up (positive dy) increases height', () => {
    const next = applyDrag(DEFAULT_BOTTOM, 30);
    expect(next).toBe(DEFAULT_BOTTOM + 30);
    expect(next).toBeGreaterThan(DEFAULT_BOTTOM);
  });

  it('drag down (negative dy) decreases height', () => {
    const next = applyDrag(DEFAULT_BOTTOM, -20);
    expect(next).toBe(DEFAULT_BOTTOM - 20);
    expect(next).toBeLessThan(DEFAULT_BOTTOM);
  });

  it('zero delta leaves height unchanged', () => {
    expect(applyDrag(DEFAULT_BOTTOM, 0)).toBe(DEFAULT_BOTTOM);
  });

  it('multiple small deltas accumulate correctly', () => {
    let h = DEFAULT_BOTTOM;
    for (let i = 0; i < 5; i++) h = applyDrag(h, 10);
    expect(h).toBe(DEFAULT_BOTTOM + 50);
  });

  it('height stays at MIN_BOTTOM after repeated downward drags', () => {
    let h = MIN_BOTTOM;
    for (let i = 0; i < 10; i++) h = applyDrag(h, -50);
    expect(h).toBe(MIN_BOTTOM);
  });

  it('height stays at MAX_BOTTOM after repeated upward drags', () => {
    let h = MAX_BOTTOM;
    for (let i = 0; i < 10; i++) h = applyDrag(h, 50);
    expect(h).toBe(MAX_BOTTOM);
  });

  it('dy sign convention: moving mouse UP (clientY decreases) produces positive dy and grows panel', () => {
    // In startBottomDrag: dy = lastY - ev.clientY
    // If mouse moves up: ev.clientY < lastY → dy > 0 → height increases (taller panel)
    const lastY = 500;
    const newClientY = 480; // moved up 20 px
    const dy = lastY - newClientY; // = 20 (positive)
    expect(dy).toBeGreaterThan(0);
    expect(applyDrag(DEFAULT_BOTTOM, dy)).toBeGreaterThan(DEFAULT_BOTTOM);
  });

  it('dy sign convention: moving mouse DOWN (clientY increases) produces negative dy and shrinks panel', () => {
    // If mouse moves down: ev.clientY > lastY → dy < 0 → height decreases (shorter panel)
    const lastY = 500;
    const newClientY = 520; // moved down 20 px
    const dy = lastY - newClientY; // = -20 (negative)
    expect(dy).toBeLessThan(0);
    expect(applyDrag(DEFAULT_BOTTOM, dy)).toBeLessThan(DEFAULT_BOTTOM);
  });
});
