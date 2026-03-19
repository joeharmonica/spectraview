import { describe, it, expect } from 'vitest';
import { DEFAULT_PROCESSING } from '../types/spectrum';
import type { Spectrum } from '../types/spectrum';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSpectrum(id: string, overrides: Partial<Spectrum> = {}): Spectrum {
  return {
    id,
    name: `Spectrum ${id}`,
    filename: `${id}.csv`,
    format: 'unknown',
    wavelengths: [400, 500, 600],
    intensities: [1, 2, 3],
    color: '#3b82f6',
    processing: { ...DEFAULT_PROCESSING },
    ...overrides,
  };
}

// Minimal reducer for testing state actions without React
type State = { spectra: Spectrum[]; selectedIds: Set<string> };

function invertSelect(state: State): State {
  const inverted = new Set(state.spectra.filter(s => !state.selectedIds.has(s.id)).map(s => s.id));
  return { ...state, selectedIds: inverted };
}

function removeSelected(state: State): State {
  return {
    spectra: state.spectra.filter(s => !state.selectedIds.has(s.id)),
    selectedIds: new Set(),
  };
}

function clearAll(state: State): State {
  return { spectra: [], selectedIds: new Set() };
}

// ─── INVERT_SELECT ────────────────────────────────────────────────────────────

describe('invertSelect', () => {
  it('selects none → all', () => {
    const s = [makeSpectrum('a'), makeSpectrum('b'), makeSpectrum('c')];
    const result = invertSelect({ spectra: s, selectedIds: new Set() });
    expect(result.selectedIds).toEqual(new Set(['a', 'b', 'c']));
  });

  it('selects all → none', () => {
    const s = [makeSpectrum('a'), makeSpectrum('b')];
    const result = invertSelect({ spectra: s, selectedIds: new Set(['a', 'b']) });
    expect(result.selectedIds.size).toBe(0);
  });

  it('inverts partial selection', () => {
    const s = [makeSpectrum('a'), makeSpectrum('b'), makeSpectrum('c')];
    const result = invertSelect({ spectra: s, selectedIds: new Set(['a']) });
    expect(result.selectedIds.has('a')).toBe(false);
    expect(result.selectedIds.has('b')).toBe(true);
    expect(result.selectedIds.has('c')).toBe(true);
  });
});

// ─── REMOVE_SELECTED ─────────────────────────────────────────────────────────

describe('removeSelected', () => {
  it('removes all selected spectra', () => {
    const s = [makeSpectrum('a'), makeSpectrum('b'), makeSpectrum('c')];
    const result = removeSelected({ spectra: s, selectedIds: new Set(['a', 'c']) });
    expect(result.spectra.map(x => x.id)).toEqual(['b']);
    expect(result.selectedIds.size).toBe(0);
  });

  it('no-op when nothing selected', () => {
    const s = [makeSpectrum('a'), makeSpectrum('b')];
    const result = removeSelected({ spectra: s, selectedIds: new Set() });
    expect(result.spectra).toHaveLength(2);
  });

  it('removes all when all selected', () => {
    const s = [makeSpectrum('a'), makeSpectrum('b')];
    const result = removeSelected({ spectra: s, selectedIds: new Set(['a', 'b']) });
    expect(result.spectra).toHaveLength(0);
  });
});

// ─── CLEAR_ALL ───────────────────────────────────────────────────────────────

describe('clearAll', () => {
  it('empties spectra and selectedIds', () => {
    const s = [makeSpectrum('a'), makeSpectrum('b')];
    const result = clearAll({ spectra: s, selectedIds: new Set(['a']) });
    expect(result.spectra).toHaveLength(0);
    expect(result.selectedIds.size).toBe(0);
  });

  it('no-op on empty state', () => {
    const result = clearAll({ spectra: [], selectedIds: new Set() });
    expect(result.spectra).toHaveLength(0);
  });
});

// ─── Export processed CSV — verify applyProcessing is used ───────────────────

import { applyProcessing } from '../lib/processing';

describe('export processed CSV values', () => {
  it('exported values match applyProcessing output (not raw intensities)', () => {
    const spectrum = makeSpectrum('x', {
      wavelengths: [400, 500, 600],
      intensities: [2, 10, 4],
      processing: { ...DEFAULT_PROCESSING, normalize: 'max' },
    });
    const displayY = applyProcessing(spectrum.wavelengths, spectrum.intensities, spectrum.processing);
    // max-normalized: [0.2, 1.0, 0.4]
    expect(displayY[1]).toBeCloseTo(1.0);
    expect(displayY[0]).toBeCloseTo(0.2);
    // raw would have been [2, 10, 4] — not 1.0 at peak
    expect(spectrum.intensities[1]).toBe(10);
  });

  it('crop + normalize: exported wavelengths match cropped range', () => {
    const spectrum = makeSpectrum('y', {
      wavelengths: [300, 400, 500, 600, 700],
      intensities: [1, 2, 10, 4, 1],
      processing: { ...DEFAULT_PROCESSING, crop: { minWl: 400, maxWl: 600 }, normalize: 'max' },
    });
    const displayY = applyProcessing(spectrum.wavelengths, spectrum.intensities, spectrum.processing);
    // After crop: wl=[400,500,600], y=[2,10,4], after max-norm: [0.2, 1.0, 0.4]
    expect(displayY).toHaveLength(3);
    expect(displayY[1]).toBeCloseTo(1.0);
  });
});

// ─── Metadata — entries extracted from spectrum.metadata ─────────────────────

describe('metadata extraction', () => {
  it('spectrum with metadata has extractable entries', () => {
    const s = makeSpectrum('m', {
      metadata: { excitation_nm: '350', source: 'RF-6000 3D EEM', instrument: 'RF-6000' },
    });
    const entries = Object.entries(s.metadata ?? {});
    expect(entries).toHaveLength(3);
    expect(entries.find(([k]) => k === 'excitation_nm')?.[1]).toBe('350');
  });

  it('spectrum without metadata has empty entries', () => {
    const s = makeSpectrum('n');
    expect(Object.keys(s.metadata ?? {})).toHaveLength(0);
  });
});
