import { useReducer, useEffect } from 'react';
import type { Spectrum, ViewMode, ProcessingOptions } from '../types/spectrum';
import { saveSpectra, removeSpectrumFromDB, loadAllSpectra, clearDB } from '../lib/db';
import { nextColor } from '../parsers';

interface State {
  spectra: Spectrum[];
  selectedIds: Set<string>;
  viewMode: ViewMode;
  stackOffset: number;
  dbLoaded: boolean;
}

type Action =
  | { type: 'ADD_SPECTRA'; payload: Spectrum[] }
  | { type: 'TOGGLE_SELECT'; id: string }
  | { type: 'SELECT_ALL' }
  | { type: 'SELECT_NONE' }
  | { type: 'INVERT_SELECT' }
  | { type: 'REMOVE_SPECTRUM'; id: string }
  | { type: 'REMOVE_SELECTED' }
  | { type: 'CLEAR_ALL' }
  | { type: 'DUPLICATE_SPECTRUM'; id: string }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SET_STACK_OFFSET'; offset: number }
  | { type: 'UPDATE_PROCESSING'; id: string; processing: ProcessingOptions }
  | { type: 'UPDATE_PROCESSING_BULK'; ids: string[]; processing: ProcessingOptions }
  | { type: 'SET_SPECTRUM_COLOR'; id: string; color: string }
  | { type: 'RENAME_SPECTRUM'; id: string; name: string }
  | { type: 'SET_SPECTRUM_LABEL'; id: string; label: string }
  | { type: 'SET_SPECTRUM_Y_VALUE'; id: string; yValue: number | undefined }
  | { type: 'SET_SPECTRUM_GROUP'; id: string; group: string | undefined }
  | { type: 'RESTORE_FROM_DB'; spectra: Spectrum[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_SPECTRA': {
      const newSpectra = [...state.spectra, ...action.payload];
      const newSelectedIds = new Set(state.selectedIds);
      action.payload.forEach(s => newSelectedIds.add(s.id));
      return { ...state, spectra: newSpectra, selectedIds: newSelectedIds };
    }
    case 'TOGGLE_SELECT': {
      const ids = new Set(state.selectedIds);
      if (ids.has(action.id)) ids.delete(action.id);
      else ids.add(action.id);
      return { ...state, selectedIds: ids };
    }
    case 'SELECT_ALL':
      return { ...state, selectedIds: new Set(state.spectra.map(s => s.id)) };
    case 'SELECT_NONE':
      return { ...state, selectedIds: new Set() };
    case 'INVERT_SELECT': {
      const inverted = new Set(state.spectra.filter(s => !state.selectedIds.has(s.id)).map(s => s.id));
      return { ...state, selectedIds: inverted };
    }
    case 'REMOVE_SELECTED':
      return {
        ...state,
        spectra: state.spectra.filter(s => !state.selectedIds.has(s.id)),
        selectedIds: new Set(),
      };
    case 'CLEAR_ALL':
      return { ...state, spectra: [], selectedIds: new Set() };
    case 'REMOVE_SPECTRUM': {
      const ids = new Set(state.selectedIds);
      ids.delete(action.id);
      return {
        ...state,
        spectra: state.spectra.filter(s => s.id !== action.id),
        selectedIds: ids,
      };
    }
    case 'DUPLICATE_SPECTRUM': {
      const src = state.spectra.find(s => s.id === action.id);
      if (!src) return state;
      const copy: Spectrum = {
        ...src,
        id: crypto.randomUUID(),
        color: nextColor(),
        name: `${src.name} (copy)`,
      };
      const idx = state.spectra.findIndex(s => s.id === action.id);
      const newSpectra = [...state.spectra];
      newSpectra.splice(idx + 1, 0, copy);
      const newSelectedIds = new Set(state.selectedIds);
      newSelectedIds.add(copy.id);
      return { ...state, spectra: newSpectra, selectedIds: newSelectedIds };
    }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode };
    case 'SET_STACK_OFFSET':
      return { ...state, stackOffset: action.offset };
    case 'UPDATE_PROCESSING':
      return {
        ...state,
        spectra: state.spectra.map(s =>
          s.id === action.id ? { ...s, processing: action.processing } : s
        ),
      };
    case 'UPDATE_PROCESSING_BULK':
      return {
        ...state,
        spectra: state.spectra.map(s =>
          action.ids.includes(s.id) ? { ...s, processing: action.processing } : s
        ),
      };
    case 'SET_SPECTRUM_COLOR':
      return {
        ...state,
        spectra: state.spectra.map(s =>
          s.id === action.id ? { ...s, color: action.color } : s
        ),
      };
    case 'RENAME_SPECTRUM':
      return {
        ...state,
        spectra: state.spectra.map(s =>
          s.id === action.id ? { ...s, name: action.name } : s
        ),
      };
    case 'SET_SPECTRUM_LABEL':
      return {
        ...state,
        spectra: state.spectra.map(s =>
          s.id === action.id ? { ...s, label: action.label || undefined } : s
        ),
      };
    case 'SET_SPECTRUM_Y_VALUE':
      return {
        ...state,
        spectra: state.spectra.map(s =>
          s.id === action.id ? { ...s, yValue: action.yValue } : s
        ),
      };
    case 'SET_SPECTRUM_GROUP':
      return {
        ...state,
        spectra: state.spectra.map(s =>
          s.id === action.id ? { ...s, group: action.group || undefined } : s
        ),
      };
    case 'RESTORE_FROM_DB':
      return {
        ...state,
        spectra: action.spectra,
        selectedIds: new Set(action.spectra.map(s => s.id)),
        dbLoaded: true,
      };
    default:
      return state;
  }
}

const initialState: State = {
  spectra: [],
  selectedIds: new Set(),
  viewMode: 'overlap',
  stackOffset: 0.2,
  dbLoaded: false,
};

export function useSpectra() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load persisted spectra on mount
  useEffect(() => {
    loadAllSpectra().then(spectra => {
      if (spectra.length > 0) {
        dispatch({ type: 'RESTORE_FROM_DB', spectra });
      } else {
        dispatch({ type: 'RESTORE_FROM_DB', spectra: [] });
      }
    }).catch(() => {
      dispatch({ type: 'RESTORE_FROM_DB', spectra: [] });
    });
  }, []);

  // Persist changes to DB whenever spectra array changes (after initial load)
  useEffect(() => {
    if (!state.dbLoaded) return;
    if (state.spectra.length > 0) {
      void saveSpectra(state.spectra);
    }
  }, [state.spectra, state.dbLoaded]);

  const selectedSpectra = state.spectra.filter(s => state.selectedIds.has(s.id));

  return {
    spectra: state.spectra,
    selectedIds: state.selectedIds,
    selectedSpectra,
    viewMode: state.viewMode,
    stackOffset: state.stackOffset,
    dbLoaded: state.dbLoaded,

    addSpectra: (spectra: Spectrum[]) => dispatch({ type: 'ADD_SPECTRA', payload: spectra }),
    toggleSelect: (id: string) => dispatch({ type: 'TOGGLE_SELECT', id }),
    selectAll: () => dispatch({ type: 'SELECT_ALL' }),
    selectNone: () => dispatch({ type: 'SELECT_NONE' }),
    removeSpectrum: (id: string) => {
      dispatch({ type: 'REMOVE_SPECTRUM', id });
      void removeSpectrumFromDB(id);
    },
    setViewMode: (mode: ViewMode) => dispatch({ type: 'SET_VIEW_MODE', mode }),
    setStackOffset: (offset: number) => dispatch({ type: 'SET_STACK_OFFSET', offset }),
    updateProcessing: (id: string, processing: ProcessingOptions) =>
      dispatch({ type: 'UPDATE_PROCESSING', id, processing }),
    updateProcessingBulk: (ids: string[], processing: ProcessingOptions) =>
      dispatch({ type: 'UPDATE_PROCESSING_BULK', ids, processing }),
    setSpectrumColor: (id: string, color: string) =>
      dispatch({ type: 'SET_SPECTRUM_COLOR', id, color }),
    renameSpectrum: (id: string, name: string) =>
      dispatch({ type: 'RENAME_SPECTRUM', id, name }),
    setSpectrumLabel: (id: string, label: string) =>
      dispatch({ type: 'SET_SPECTRUM_LABEL', id, label }),
    setSpectrumYValue: (id: string, yValue: number | undefined) =>
      dispatch({ type: 'SET_SPECTRUM_Y_VALUE', id, yValue }),
    setSpectrumGroup: (id: string, group: string | undefined) =>
      dispatch({ type: 'SET_SPECTRUM_GROUP', id, group }),
    duplicateSpectrum: (id: string) =>
      dispatch({ type: 'DUPLICATE_SPECTRUM', id }),
    invertSelect: () =>
      dispatch({ type: 'INVERT_SELECT' }),
    removeSelected: (ids: string[]) => {
      dispatch({ type: 'REMOVE_SELECTED' });
      ids.forEach(id => void removeSpectrumFromDB(id));
    },
    clearAll: () => {
      dispatch({ type: 'CLEAR_ALL' });
      void clearDB();
    },
  };
}
