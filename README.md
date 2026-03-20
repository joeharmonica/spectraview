# SpectraView

A browser-based spectral analysis platform for loading, visualising, and processing UV-Vis, 2D/3D fluorescence, and custom XY spectra. All computation and storage runs entirely in your browser — no server, no sign-up, no data leaves your machine.

Built with React 19, TypeScript 5.8, Vite 8, Plotly.js, Tailwind CSS v4, and Dexie (IndexedDB).

---

## Features

### File Import

| Instrument / Format | Detection | Notes |
|---------------------|-----------|-------|
| Cary 3500 (UV-Vis) | Auto | Paired Wavelength/%T column layout; supports multiple spectra per file |
| Shimadzu RF-6000 2D | Auto | Large metadata header block + Wavelength/Intensity column pairs |
| Shimadzu RF-6000 3D EEM | Auto | Excitation–emission matrix; produces one emission spectrum per excitation wavelength |
| LabSolutions R1F | Auto | JSON-embedded spectrum data |
| Custom XY CSV/XLSX | Manual | Unknown formats trigger the **Column Mapping** dialog; supports one wavelength column + multiple intensity columns (one spectrum per column) |

- **Drag-and-drop** or click **+ Add** in the library sidebar to load `.csv` and `.xlsx` files
- Multiple files can be imported simultaneously
- All spectra (including processing settings and custom labels) are auto-saved to **IndexedDB** and restored on next visit

### Column Mapping Dialog

Shown automatically for unknown file formats:

- Two-panel preview: raw data table (left) with colour-coded column highlights; live mapped preview (right) showing the first 10 parsed rows
- Dropdowns to assign wavelength and intensity columns
- Adjustable header-row skip count (auto-detected)
- Shows total valid point count before confirming import
- Responsive: stacks vertically on small screens

---

### Spectrum Library (Left Panel)

- **Search** by spectrum name or filename
- **Sort** by name (A→Z / Z→A), format, or wavelength start (ascending / descending)
- **Format filter chips** appear when spectra from multiple instruments are loaded
- **Select all / Deselect all / Invert** — bulk selection controls
- **Remove selected / Clear all** — bulk delete
- **Duplicate** — clone a spectrum (hover to reveal the copy icon); the copy gets a new colour and "(copy)" suffix
- **Rename** — double-click a spectrum name to edit inline
- **Colour picker** — click the colour swatch to change the plot colour
- **Custom chart labels** — click the coloured pill on any row (dashed border = not set; solid = set) to assign a display name used in the chart legend, tooltips, and peak table instead of the filename
- **Y reference values** — click the teal **+ Y value** pill on any row to enter the known reference value (e.g. concentration, pH) for that spectrum. The value is stored with the spectrum and **auto-populates Step 1 of Calibration** so you never have to retype it. Displays as a teal `Y=…` badge; click the badge to edit.
- **Table view** — click the grid icon in the library header to toggle between list view (default) and a spreadsheet-like table view. Table columns: colour+checkbox, Name, Format, λ Range, Points, **Label** (editable), **Y Value** (editable). Click any Label or Y Value cell to edit it inline — changes apply immediately and persist. Switch back with the list icon.
- **Metadata viewer** — click the ℹ icon (hover to reveal) on RF-6000/Cary rows to expand an inline key-value panel showing instrument metadata (e.g. excitation wavelength, slit width)
- **Collapsible** — the "←" chevron hides the panel for more chart space; re-expand via the ">" bar on desktop or the ☰ hamburger button in the header on mobile

---

### View Modes

| Mode | Description |
|------|-------------|
| **Overlap** | All selected spectra on a shared Y-axis |
| **Stacked** | Spectra offset vertically; drag the **Offset** slider (0–100 %) to control spacing |
| **Heatmap** | EEM 2D colour map (Viridis scale) from 3D fluorescence data; requires ≥ 2 rf6000_3d spectra; hover over the heatmap to preview the emission slice in a height-adjustable panel below the chart; drag the top edge of the panel to resize it (64–400 px) |

---

### Chart Controls

All controls live in the top toolbar:

| Control | Description |
|---------|-------------|
| **Zoom** (default) | Drag to draw a zoom box; scroll wheel zooms in/out |
| **Pan** | Drag to scroll the chart; scroll wheel still zooms |
| **Reset** | Fits all loaded data back into view |
| **Download PNG** | Saves the chart as a 1200 × 800 px image at 2× resolution |

Double-clicking the chart resets the axes (Plotly built-in behaviour).

---

### Peak Table

Open via the **Peaks** button (requires ≥ 1 spectrum selected).

- Detects local maxima across all selected spectra
- **Filter by prominence** — slider from 0–100 % of each spectrum's maximum; higher values show only dominant peaks
- **Filter by minimum intensity** — set an absolute intensity cutoff instead
- **Mark peaks on chart** — click the bookmark icon on any row to place a labelled dotted vertical line on the chart at that wavelength; click again to toggle it off
- **Clear markers** — footer button removes all chart peak markers at once

---

### Peak Annotations (Labels Toggle)

The **Labels** button in the toolbar toggles name + wavelength callout annotations at each spectrum's dominant peak. The callout shows the custom label (or filename) and the peak wavelength in nm. Useful for quick slide-ready chart exports.

---

### Analysis Panel

Open via the **Analysis** button. Processing steps are applied **non-destructively** to the selected spectra in order — raw data is always preserved and re-processing from scratch is instant.

Processing order: **Crop → Smooth → Baseline → Normalise**

| Step | Control | Description |
|------|---------|-------------|
| 1 | **Crop Range** | Trim to a wavelength window (Min / Max nm). Applied first, before all other steps. |
| 2 | **Smooth (S-G)** | Savitzky-Golay filter — adjustable window size (5–51 pts, odd) and polynomial order (2–4). Reduces noise while preserving peak shape better than a moving average. |
| 3 | **Baseline** | Polynomial background subtraction (degree 1–5). Corrects slow-varying scattering or fluorescence background. Higher degree follows more complex baselines but risks overfitting. |
| 4 | **Normalise** | Rescale to: maximum (0–1), unit area, or a reference wavelength. |
| 5 | **Integrate (AUC)** | Trapezoidal area under the processed curve between two user-defined wavelengths. Results update live in a table for all selected spectra. |

In **Heatmap mode**, processing is applied row-by-row to each excitation slice before rendering.

Click **Apply to selected** to commit the settings. **Reset processing** returns the selected spectra to raw data.

Hover the **?** icons next to each section header for a detailed tooltip explaining the algorithm and when to use it.

---

### CSV Export

The **CSV** button downloads one `.csv` file per selected spectrum containing the **processed** `Wavelength (nm)` and `Intensity` values — i.e. after any crop, smooth, baseline, and normalisation are applied.

---

### Calibration & Modelling

Open via the **Calibration** button in the toolbar. A 3-step wizard builds quantitative spectral models that predict a continuous variable (concentration, pH, etc.) from spectral data.

#### Step 1 — Define Variables

Assign a known reference value (Y) to each spectrum. Spectra with no value are excluded from the model. Optionally mark each spectrum as **Train** or **Test** to evaluate generalisation on held-out data.

**Tip:** Y values entered in the Library panel (via the teal pill) are automatically pre-populated here, saving you from retyping them each time you build a calibration.

**Spectral Input Features (X) — three modes:**

| Mode | Description | Best for |
|------|-------------|----------|
| **Single wavelength** | Intensity at one nm point | Beer-Lambert univariate calibrations; shows Pearson *r* and sensitivity (slope) |
| **Full spectrum** | All wavelength points as feature vector | Exploiting whole-spectrum information with PLS-R or PCR |
| **Multiple wavelength ranges** | One or more `[min, max]` nm windows concatenated into one feature row | Focusing on known absorption bands; click **+ Add range** to add windows, ✕ to remove |

#### Step 2 — Configure Model

**Models to run** — a multi-select dropdown lets you choose any combination of the five algorithms. Select one model to run it individually; select two or more to run them sequentially and generate a ranked comparison.

**Single model selected:**

| Setting | Options |
|---------|---------|
| **Model** | PLS-R · PCR · MLR · Ridge (L2) · Lasso (L1) |
| **Components** | Number of latent variables for PLS-R / PCR; LOOCV chart guides selection |
| **λ (lambda)** | Regularisation strength for Ridge / Lasso |
| **Auto-scale** | Zero-mean, unit-variance standardisation (recommended) |
| **CV folds** | k-fold cross-validation (0 = off) |

**Multiple models selected (comparison mode):**

Each model gets its **own parameter card** for individual tuning:
- **PLS-R / PCR** — separate *Components* slider and LOOCV chart per model
- **Ridge / Lasso** — separate *λ* slider per model
- **MLR** — no tunable parameters (noted in its card)
- **Auto-scale** and **CV folds** remain shared across all models

#### Step 3 — Review Results

**Single model (one model selected):**
- **Summary banner** — auto-generated natural-language assessment of fit quality, overfitting risk (train–test R² gap > 0.15), and top influential wavelengths. Colour-coded: green (R² ≥ 0.90), amber (0.70–0.89), red (< 0.70).
- **Metric cards** — Train R², RMSE, MAE; Test R², RMSE, MAE (when test split exists); CV RMSE (when cross-validation enabled). Univariate mode additionally shows **Pearson *r*** and **Sensitivity (slope)**.
- **Predicted vs Actual scatter** — train (blue) and test (green) points against the 1:1 line.
- **Residuals chart** — bar chart of True − Predicted; bars exceeding 2× train RMSE are flagged red.
- **Percentage Errors chart** — bar chart of `residual ÷ |true value| × 100 %`; uses predicted value as denominator when true value is zero. Bars exceeding ±10 % are flagged red.
- **Predictions table** — full per-sample breakdown including **% Error column**; residuals and % errors flagged red when out of range.
- **Coefficients chart** — positive (blue) / negative (red) wavelength regression coefficients (shown for MLR, Ridge, Lasso when ≤ 100 features).
- **Downloads** — Results CSV · Coefficients CSV · HTML Report.

**Comparison mode (two or more models selected):**
- Models run sequentially with a live progress bar showing the current model and percentage.
- **Overview tab** — ranked comparison table (click a row to jump to that model's tab) and R² bar chart. ★ marks the best model ranked by test R² (or train R² if no test split). ← your pick marks the first model you selected when it is not the top-ranked.
- **Per-model tabs** — each tab shows the full individual result set: summary banner, metric cards, scatter plot, residuals, percentage errors chart, predictions table (with % Error column), and coefficient chart.
- **HTML Report** — covers all models: comparison table with anchor links + a dedicated metrics and predictions section per model.

---

### Interactive Tutorial

Click the **?** button in the top-right header to start a 13-step guided tour. The card is 400 px wide with larger text (title 16 px, body 14 px) to comfortably fit longer descriptions. Steps that spotlight a UI element dim the rest of the screen; steps without a target appear centred.

1. Welcome & data persistence
2. Spectrum Library — loading, selecting, renaming, colours
3. Custom chart labels
4. View modes — Overlap, Stacked, Heatmap + hover preview
5. Chart controls — Zoom, Pan, Reset, Download
6. Peak table — detection, filtering, chart markers
7. Peak annotations toggle
8. Analysis panel — all five processing steps
9. CSV export & auto-save
10. Calibration & Modelling — 3-step wizard, Compare all models option
11. Spectral Input Features (X) — univariate, full spectrum, multiple ranges
12. Model results & comparison — sequential runs, progress bar, per-model tabs, section banners
13. Wrap-up tips

Navigate with ← → buttons, keyboard arrow keys, or click any progress dot to jump to a step. Press **Esc** to exit.

---

### Responsive Layout

| Breakpoint | Behaviour |
|------------|-----------|
| **≥ 1024 px** (desktop) | Library panel open by default; both side panels resizable by dragging the divider handle |
| **768–1023 px** (tablet) | Library starts collapsed; panels open as fixed overlays with a dark backdrop |
| **< 768 px** (mobile) | Library and Analysis open as full-width drawers; toolbar shows icon-only buttons; ☰ hamburger in the header opens the library drawer |

---

## Sample Files

Reference data for testing parsers is in `sample/`:

| File | Format |
|------|--------|
| `sample/Absorption-Cary3500.csv` | Cary 3500 UV-Vis |
| `sample/Fluorescent-2D-RF6000.csv` | RF-6000 2D fluorescence |
| `sample/Fluorescent-3D-RF6000.csv` | RF-6000 3D EEM |
| `sample/Fluorescent-R1F.csv` | LabSolutions R1F |

---

## Development

### Prerequisites

Node.js ≥ 18, npm ≥ 9.

### Install

```bash
npm install
```

### Dev server

```bash
npm run dev
```

Opens at `http://localhost:5173`.

### Type check

```bash
npx tsc --noEmit
```

### Tests

```bash
npm test          # run once
npm run test:ui   # Vitest browser UI
```

142 tests across 7 suites covering parsers, processing, calibration, edge cases, medium features, low-level features, and heatmap panel behaviour.

### Build

```bash
npm run build    # TypeScript check + Vite bundle → dist/
npm run preview  # Serve dist/ locally
```

---

## Architecture

```
src/
├── types/
│   ├── spectrum.ts           # Spectrum, ViewMode, ProcessingOptions, HighlightedPeak
│   └── calibration.ts        # ModelType, FeatureStrategy, ModelConfig, CalibrationResults,
│                             # SampleLabel, PredictionRow, CoefficientRow, ModelComparisonRow
├── parsers/
│   ├── index.ts              # Format detection, colour palette, parseFile()
│   ├── cary3500.ts
│   ├── rf6000_2d.ts
│   ├── rf6000_3d.ts
│   └── r1f.ts
├── lib/
│   ├── processing.ts         # applyProcessing, cropToRange, smoothSG, subtractBaseline,
│   │                         # integrateTrapezoid, findPeaks, ensureOdd
│   ├── calibration.ts        # extractFeatures, runCalibration (PLS/PCR/MLR/Ridge/Lasso),
│   │                         # generateSummary, generateReportHtml
│   └── db.ts                 # Dexie/IndexedDB persistence
├── hooks/
│   └── useSpectra.ts         # useReducer state + IndexedDB sync + all dispatch actions
└── components/
    ├── App.tsx                # Root layout, state orchestration, responsive breakpoints
    ├── DropZone.tsx           # Drag-and-drop file upload landing page
    ├── SpectrumLibrary.tsx    # Left panel — file list, search, labels, colour picker
    ├── Toolbar.tsx            # Top bar — view modes, chart controls, action buttons
    ├── ChartWorkspace.tsx     # Plotly chart (overlap, stacked, heatmap + hover preview)
    ├── AnalysisPanel.tsx      # Right panel — processing controls + AUC table
    ├── CalibrationPage.tsx    # 3-step calibration wizard (variables, model config, results)
    ├── PeakTableModal.tsx     # Peak detection, filter, and chart marker management
    ├── ColumnMappingModal.tsx # Column assignment dialog for unknown CSV/XLSX files
    ├── Tutorial.tsx           # Interactive 13-step guided tour with spotlight overlay
    ├── ColorPicker.tsx        # Inline colour picker for spectrum colours
    └── ErrorBoundary.tsx      # Chart error recovery UI
```

### Processing pipeline (non-destructive)

Raw `wavelengths` and `intensities` are stored unchanged on each `Spectrum` object. `applyProcessing()` is called per render inside `ChartWorkspace` and `AnalysisPanel`, so toggling or adjusting options always operates on the original data with zero data loss.

### State management

All spectrum state lives in a single `useReducer` in `useSpectra`. Actions:

`ADD_SPECTRA` · `TOGGLE_SELECT` · `SELECT_ALL` · `SELECT_NONE` · `INVERT_SELECT` · `REMOVE_SPECTRUM` · `REMOVE_SELECTED` · `CLEAR_ALL` · `DUPLICATE_SPECTRUM` · `SET_VIEW_MODE` · `SET_STACK_OFFSET` · `UPDATE_PROCESSING` · `UPDATE_PROCESSING_BULK` · `SET_SPECTRUM_COLOR` · `RENAME_SPECTRUM` · `SET_SPECTRUM_LABEL` · `SET_SPECTRUM_Y_VALUE` · `RESTORE_FROM_DB`

### Drag-to-resize panels

Both side panels are resizable on desktop via `startPanelDrag()` in `App.tsx` — attaches `mousemove`/`mouseup` listeners to `document` with an incremental delta approach, clamped between 180 px and 520 px. Drag handles are hidden on mobile where panels become fixed overlays.

The bottom emission slice panel (heatmap view only) is resizable via `startBottomDrag()` in `ChartWorkspace.tsx` — same incremental delta pattern, but vertical (`clientY`). Dragging the 4 px handle upward grows the panel; downward shrinks it. Clamped between 64 px (minimum readable) and 400 px. Default height is 112 px.
