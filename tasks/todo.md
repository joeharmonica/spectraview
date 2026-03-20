# SpectraView Task List

## Phase 1 MVP

### Setup
- [x] Create directory structure
- [x] Write package.json, vite.config.ts, tsconfig.json, tailwind config
- [x] Install dependencies

### Types
- [x] `src/types/spectrum.ts` — Spectrum interface

### Parsers
- [x] `src/parsers/cary3500.ts` — Multi-XY paired columns
- [x] `src/parsers/rf6000_2d.ts` — 2D fluorescence with metadata header
- [x] `src/parsers/rf6000_3d.ts` — 3D EEM matrix format
- [x] `src/parsers/r1f.ts` — JSON-embedded spectra
- [x] `src/parsers/index.ts` — Template detection engine

### Hooks
- [x] `src/hooks/useSpectra.ts` — useReducer state management

### Components
- [x] `src/components/DropZone.tsx` — Drag-and-drop file import
- [x] `src/components/SpectrumLibrary.tsx` — Left sidebar
- [x] `src/components/ChartWorkspace.tsx` — Plotly chart
- [x] `src/components/Toolbar.tsx` — View controls + export

### App Shell
- [x] `src/App.tsx` — Layout and wiring
- [x] `src/main.tsx` — Entry point
- [x] `index.html`

### Verification
- [x] `npm run dev` loads without errors (HTTP 200 confirmed)
- [ ] Drop Cary 3500 CSV → spectra appear
- [ ] Drop RF-6000 2D CSV → spectrum appears
- [ ] Drop RF-6000 3D CSV → spectra appear
- [ ] Drop R1F CSV → spectra appear
- [ ] Overlap/stacked view toggle works
- [ ] Export CSV downloads
- [ ] Export PNG downloads

## Review Notes
Phase 1 MVP built. Remaining verification items require real CSV sample files from instruments — to be confirmed by user.

---

## Phase 3 — Filter, Sort, Labels, Mapping Fix

### Phase 1 — Column Mapping Redesign (critical)
Problems: `ColumnMappingRequest` passes pre-computed headers/preview but "header rows" slider
re-slices already-stripped rows → inconsistent. No live mapped preview.

- [x] 1a. Update `ColumnMappingRequest` in `types/spectrum.ts`:
      Replace `headers`/`preview` with `rawRows: string[][]` + `suggestedHeaderRows: number`
- [x] 1b. Update `buildMappingRequest` in `parsers/index.ts`:
      Pass raw rows; detect suggestedHeaderRows by counting leading non-numeric rows
- [x] 1c. Rewrite `ColumnMappingModal.tsx`:
      Left: raw rows table (headers highlighted). Right: live mapped preview (Wavelength nm / Intensity a.u.)
      Dynamic dropdowns from selected header row. Show parsed point count.

### Phase 2 — Sort + Enhanced Filter in Library
- [x] 2a. Add sort state: `'name-asc' | 'name-desc' | 'format' | 'wav-asc' | 'wav-desc'`
- [x] 2b. Add sort dropdown UI next to search
- [x] 2c. Apply sort after filter, show wavelength range per row on hover

### Phase 3 — Chart Labels (Peak Annotations)
- [x] 3a. Add `showLabels: boolean` prop to `ChartWorkspace`; add Plotly annotations at peak
- [x] 3b. Add Labels toggle button to `Toolbar`
- [x] 3c. Wire `labelsVisible` through `App.tsx`

### Phase 4 — Tests
- [x] 4a. Install vitest + happy-dom
- [x] 4b. Parser tests: all 4 sample files → correct format/spectra count/wavelength range
- [x] 4c. Mapping tests: parseFileWithMapping → correct spectra/name/filtering
- [x] 4d. Run tests — 25/25 passing. Fixed: RF6000 3D format detection (EX Wavelength/EM Wavelength header)

---

## Phase 4 — Medium Value Features (2026-03-19)

### Feature 9 — Spectrum Duplication
- [x] `useSpectra.ts`: DUPLICATE_SPECTRUM action → clone with new id, color, name "(copy)"
- [x] `SpectrumLibrary.tsx`: onDuplicate prop + duplicate button (hover)
- [x] `App.tsx`: wire duplicateSpectrum

### Feature 7 — Wavelength Range Crop
- [x] `types/spectrum.ts`: add `crop: { minWl: number; maxWl: number } | null` to ProcessingOptions
- [x] `lib/processing.ts`: cropToRange(), apply first in applyProcessing()
- [x] `components/AnalysisPanel.tsx`: Crop section

### Feature 8 — Spectral Integration (AUC)
- [x] `lib/processing.ts`: integrateTrapezoid(wavelengths, intensities, wlMin, wlMax)
- [x] `components/AnalysisPanel.tsx`: Integration section + results table; add selectedSpectra prop
- [x] `App.tsx`: pass selectedSpectra to AnalysisPanel

### Feature 6 — Peak Table Modal
- [x] `lib/processing.ts`: findPeaks(wavelengths, intensities, minProminence)
- [x] `components/PeakTableModal.tsx`: new modal
- [x] `components/Toolbar.tsx`: Peaks button
- [x] `App.tsx`: peakTableOpen state

### Tests
- [x] `src/__tests__/medium_features.test.ts` — 16 tests, all passing (86 total)

---

## Phase 5 — Low-Value / Polish Features (2026-03-19)

### Feature A — Export Processed CSV
- [x] `Toolbar.tsx`: import applyProcessing, export displayed values not raw intensities

### Feature B — Bulk Remove Selected + Clear All
- [x] `useSpectra.ts`: REMOVE_SELECTED + CLEAR_ALL actions (with DB sync)
- [x] `SpectrumLibrary.tsx`: "Remove N" button when >0 selected; "Clear all" in header
- [x] `App.tsx`: wire both actions

### Feature C — Metadata Viewer
- [x] `SpectrumLibrary.tsx`: ℹ icon per row → inline metadata key-value panel (hidden when no metadata)

### Feature D — Escape Key for Modals
- [x] `ColumnMappingModal.tsx`: Escape → onCancel
- [x] `PeakTableModal.tsx`: Escape → onClose

### Feature E — Invert Selection
- [x] `useSpectra.ts`: INVERT_SELECT action
- [x] `SpectrumLibrary.tsx`: "Invert" button in select controls row
- [x] `App.tsx`: wire invertSelect

### Tests
- [x] `src/__tests__/low_features.test.ts` — 12 tests, 98 total passing

### README
- [x] `README.md` created with full feature documentation

---

---

## Phase 6 — Adjustable Bottom Emission Slice Panel (2026-03-20)

- [x] Add `bottomHeight` state + `startBottomDrag` in `ChartWorkspace.tsx`
- [x] Add horizontal drag handle above emission slice panel (cursor-row-resize)
- [x] Replace fixed `h-28` with `style={{ height: bottomHeight }}` (64–400 px range)
- [x] Write tests in `src/__tests__/heatmap_panel.test.ts` (11 tests)
- [x] Update `README.md` — heatmap description + drag-to-resize section
- [x] `npm run test` — 142/142 passing
- [x] `npm run build` — TypeScript clean

## Phase 6 Review
Bottom emission slice panel is now height-adjustable via drag handle. Mirrors left/right panel resize pattern. All tests pass, build clean.

---

---

## Phase 7 — User Feedback Features (2026-03-20)

### Feature 1: % Error column in Predictions table + % Error chart
- [x] 1a. Add `% Error` column to predictions table (formula: residual/yTrue, fallback to yPred if yTrue=0)
- [x] 1b. Add % Error bar chart below residuals section in `ModelResultsPanel`

### Feature 2: Per-model parameter tuning (Step 2, multi-model mode)
- [x] 2a. Add `perModelParams` state in `CalibrationPage`, pass to `Step2Config`
- [x] 2b. Refactor `Step2Config`: single-model → unchanged; multi-model → per-model param sections with individual LOOCV charts
- [x] 2c. Update `runModel` to merge per-model overrides per iteration

### Feature 3: Response variable Y value pills in Library panel
- [x] 3a. Add `yValue?: number` to `Spectrum` interface (`types/spectrum.ts`)
- [x] 3b. Add `SET_SPECTRUM_Y_VALUE` action + reducer case + hook method (`hooks/useSpectra.ts`)
- [x] 3c. Add Y-value pill UI to `SpectrumRow` + `onYValueChange` prop on `SpectrumLibrary`
- [x] 3d. Wire `setSpectrumYValue` in `App.tsx`
- [x] 3e. Pre-populate calibration labels from `spectrum.yValue` in `CalibrationPage`

### Feature 4: Table view toggle in Library panel
- [x] 4a. Add `libraryView` state + toggle icon button in `SpectrumLibrary` header
- [x] 4b. Build `SpectrumTableView` sub-component (columns: Name, Format, λ Range, Points, Label, Y Value)
- [x] 4c. Inline-editable Label + Y Value cells in table view

### Verification
- [x] `npm run build` — TypeScript clean
- [x] `npm test` — 142/142 passing
- [ ] Manual: % Error column correct (including yTrue=0 case)
- [ ] Manual: multi-model step 2 shows per-model params
- [ ] Manual: Y value pill persists and pre-fills calibration
- [ ] Manual: table view toggle + inline editing works

---

## Phase 3 Review
All features implemented and verified:
- Column mapping redesigned with live two-panel preview (raw + mapped)
- Sort added to library (Name A/Z, Format, λ min asc/desc)
- Wavelength range shown on hover in library
- Labels toggle adds Plotly peak annotations to chart (amber button in toolbar)
- 3D RF6000 parser format detection fixed (was looking for "EX"/"em/ex" only, now matches "EX Wavelength/EM Wavelength")
- 25/25 vitest tests pass, TypeScript build clean

