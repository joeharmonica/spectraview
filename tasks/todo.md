# SpectraView Task List

---

## Phase 10 — Click-to-Draw Fix, Cursor Readout, Tutorial Polish (2026-03-20)

### Fix 1 — Click anywhere to draw (not just on trace points)
**Root cause:** `handleClick` required `event.points?.length > 0` which only fires when clicking on a Plotly trace. Clicks on empty chart area produced an empty `points` array and were silently ignored.
**Fix:** Render a transparent overlay `<div>` covering the exact plot area when in annotate mode. On click, convert pixel position to data coordinates via `pixelToDataCoords` (uses Plotly's `_fullLayout.xaxis.p2c` / `yaxis.p2c`). Extracted as testable utility in `src/lib/chartUtils.ts`.
- [x] src/lib/chartUtils.ts: new `pixelToDataCoords` helper
- [x] ChartWorkspace.tsx: add `chartDivRef`, overlay div, `handleOverlayClick`; update `onAnnotationAdd` signature to `(x, y)`
- [x] App.tsx: update `handleAnnotationAddFromChart` to accept `y?: number`

### Feature 2 — Live cursor x,y readout on chart
**Implementation:** `cursorReadoutRef` div (always rendered, `display: none` initially). `handleMouseMove` on wrapper div calls `pixelToDataCoords` and writes directly to the div's `textContent` — zero React re-renders on every mousemove event. `handleMouseLeave` hides it.
- [x] ChartWorkspace.tsx: `cursorReadoutRef`, `viewModeRef`, `handleMouseMove`, `handleMouseLeave`, readout div (top-right corner)

### Feature 3 — Tutorial paragraph readability
**Implementation:** Rewrote all 16 step `body` strings — shorter sentences, friendlier tone, ≤ 4 sentences per step.
- [x] Tutorial.tsx: rewrite all STEPS body strings

### Verification
- [x] npm run build — TypeScript clean
- [x] npm test — 174/174 passing (10 new tests in chartUtils.test.ts)

---

## Phase 9 — Bug Fixes & Enhancements (2026-03-20)

### Fix 1 — Revert annotate-mode dragmode change (crosshair)
**Root cause:** `dragmode: annotateMode ? 'select' : dragMode` overrides the user's chosen Zoom/Pan mode when the annotations panel is open, breaking the chart interaction. The `cursor: crosshair` style also fires on the wrong element.
**Fix:** Always pass `dragMode` to Plotly. Remove cursor override from `<Plot>` style. Click-to-annotate still works via `onClick` regardless of drag mode.
- [x] ChartWorkspace.tsx: revert dragmode line, remove cursor style

### Fix 2 — Grouping in list view
**Root cause:** Group headers with collapse/expand only exist in `SpectrumTableView`. The default list view renders a flat `<ul>` ignoring the `group` field.
**Fix:** In the list-view branch of SpectrumLibrary, compute group buckets from `filtered` and render collapsible group header items before each group's rows. Ungrouped spectra render without a header. Uses existing `SpectrumRow` unchanged.
- [x] SpectrumLibrary.tsx: new ListViewGrouped component, group headers with collapse/expand

### Fix 3 — Crop range reflected in chart x-axis
**Root cause:** `ChartWorkspace` useMemo computes `displayIntensities` (cropped length) but still passes the full `s.wavelengths` array as `x` to the Plotly trace. When crop is active the array lengths diverge, causing the spectrum to plot incorrectly across the full original x range.
**Fix:** Add `displayWavelengths` to the processed useMemo — filter `s.wavelengths` to `[minWl, maxWl]` when `s.processing.crop` is set. Use `displayWavelengths` as trace `x`.
- [x] ChartWorkspace.tsx: compute displayWavelengths, use in traces and peak annotations

### Fix 4 — Excel (xls/xlsx) file import
- [x] `npm install xlsx` (SheetJS 0.18.5)
- [x] parsers/index.ts: excelToRows() + isExcel branch in parseFile
- [x] DropZone.tsx: accept `.csv,.xlsx,.xls`, regex filter updated
- [x] App.tsx: hidden file input accept updated

### Verification
- [x] npm run build — TypeScript clean
- [x] npm test — 164/164 passing (11 new tests in phase9_fixes.test.ts)

---

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

---

## Phase 8 — 8 New Features (2026-03-20)

### F1 — Library panel expands to 50% width
- [x] App.tsx: getMaxPanel() returns `Math.max(400, Math.round(window.innerWidth * 0.5))`

### F2 — Multi-term search in library
- [x] SpectrumLibrary.tsx: `multiTerm` toggle (T+ button), split search by whitespace, AND logic

### F3 — Table header: sort & filter
- [x] SpectrumLibrary.tsx: ThResize component with clickable sort headers wired to sortKey state
- [x] Format chips visible in both list and table view mode

### F4 — Table column resizing
- [x] SpectrumLibrary.tsx: colWidths state + colgroup + drag handle on each th right border

### F5 — Grouping with expand/collapse
- [x] types/spectrum.ts: added `group?: string`
- [x] useSpectra.ts: SET_SPECTRUM_GROUP action + setSpectrumGroup hook method
- [x] SpectrumLibrary.tsx: Group column (editable inline) + group header rows + collapsedGroups state
- [x] App.tsx: wired setSpectrumGroup → onGroupChange prop

### F6 — CSV round-trip export/import
- [x] types/spectrum.ts: added 'spectraview' to SpectrumFormat
- [x] parsers/spectraview_export.ts: new parser detecting ##SpectraView,v1 header
- [x] parsers/index.ts: detects 'spectraview' format first in detectFormat
- [x] Toolbar.tsx: exportCSV writes ##SpectraView header + #Name/#Label/#YValue/#Group rows

### F7 — Annotations / draw lines on chart
- [x] types/spectrum.ts: added UserAnnotation interface (vline/hline/text + label/color/lineStyle)
- [x] App.tsx: userAnnotations state, annotateMode, annotationsOpen, all handlers
- [x] ChartWorkspace.tsx: userAnnotations prop, onClick annotate mode, renders as Plotly shapes
- [x] components/AnnotationsPanel.tsx: panel with add form, color/style pickers, list with delete

### F8 — Preserve zoom on library changes
- [x] App.tsx: resetKey state, handleResetAxes increments resetKey + calls Plotly.relayout
- [x] ChartWorkspace.tsx: zoomRef captures onRelayout events, applies stored range to layout

### Verification
- [x] npm run build — TypeScript clean, no errors
- [x] npm test — 153/153 passing (11 new tests added in phase8_features.test.ts)

---

## Phase 3 Review
All features implemented and verified:
- Column mapping redesigned with live two-panel preview (raw + mapped)
- Sort added to library (Name A/Z, Format, λ min asc/desc)
- Wavelength range shown on hover in library
- Labels toggle adds Plotly peak annotations to chart (amber button in toolbar)
- 3D RF6000 parser format detection fixed (was looking for "EX"/"em/ex" only, now matches "EX Wavelength/EM Wavelength")
- 25/25 vitest tests pass, TypeScript build clean

