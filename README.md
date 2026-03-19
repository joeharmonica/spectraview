# SpectraView

Multi-equipment spectral analysis platform for visualising and processing UV-Vis, 2D/3D fluorescence, and custom XY spectra.

Built with React 18, TypeScript, Vite, Plotly.js, Tailwind CSS, and Dexie (IndexedDB).

---

## Features

### File Import

| Instrument / Format | Detection | Notes |
|---------------------|-----------|-------|
| Cary 3500 (UV-Vis) | Auto | Paired Wavelength/%T column layout; supports multiple spectra per file |
| Shimadzu RF-6000 2D | Auto | Large metadata header block + Wavelength/Intensity column pairs |
| Shimadzu RF-6000 3D EEM | Auto | Excitation–emission matrix; produces one emission spectrum per excitation wavelength |
| LabSolutions R1F | Auto | JSON-embedded spectrum data |
| Custom XY CSV/TXT | Manual | Unknown format triggers **Column Mapping** dialog |

- **Drag-and-drop** or click **+ Add** in the library sidebar to load files
- Multiple files can be imported simultaneously
- Session state is persisted to **IndexedDB** — spectra survive page refresh

### Column Mapping Dialog (Unknown Formats)

- Two-panel preview: raw data table on the left, live mapped preview on the right
- Header rows to skip (auto-detected, adjustable)
- Dropdown selectors for wavelength and intensity columns, colour-coded in the table
- Shows total valid (wavelength, intensity) point count before importing
- **Escape** key cancels the dialog

### Spectrum Library (Left Sidebar)

- **Search** by spectrum name or filename
- **Sort** by name (A→Z / Z→A), format, or wavelength range (ascending / descending)
- **Format filter chips** appear when spectra from multiple instruments are loaded
- **Select all / Deselect all / Invert selection** controls
- **Remove selected** — bulk-delete all checked spectra
- **Clear all** — wipe the entire library
- **Duplicate** — clone a spectrum (hover a row to reveal the copy icon); copy gets a new colour and "(copy)" suffix
- **Rename** — double-click a spectrum name to edit inline
- **Colour picker** — click the colour swatch to change a spectrum's chart colour
- **Metadata viewer** — spectra loaded from RF-6000/Cary files carry instrument metadata; click the ℹ icon (hover to reveal) to expand an inline key-value panel

### Chart

- **Overlap** and **Stacked** view modes
- Stacked offset slider (0–100 %)
- **Labels** toggle — annotates each spectrum's global peak on the chart (wavelength + name)
- Interactive zoom (scroll), pan, and Plotly toolbar (PNG export)
- Hover tooltip shows spectrum name, wavelength, and intensity

### Analysis Panel

Opened with the **Analysis** button in the toolbar. Settings are applied per-click to all selected spectra (non-destructive — raw data is preserved).

| Control | Description |
|---------|-------------|
| **Crop Range** | Restrict display to a wavelength window (Min / Max nm). Applied first in the processing chain. |
| **Normalize** | None · To maximum · By area (trapezoidal) · At wavelength (nearest point) |
| **Smooth (S-G)** | Savitzky-Golay smoothing; adjustable window size (5–51, odd) and polynomial order (2–4) |
| **Baseline** | Polynomial baseline subtraction (degree 1–5, fitted by least squares) |
| **Integrate (AUC)** | Trapezoidal area under the *processed* curve between two wavelengths; result table updates live for all selected spectra |

Processing order: **Crop → Baseline → Smooth → Normalize**

Click **Reset processing** to remove all processing from selected spectra.

### Peak Table

Click **Peaks** in the toolbar (requires at least one spectrum selected). Opens a modal listing every local maximum for each selected spectrum with:

- Minimum prominence threshold slider (1–30 % of max intensity)
- Columns: spectrum name (with colour swatch), wavelength (nm), intensity
- Peaks sorted by intensity descending per spectrum

### Export CSV

Click **Export CSV** in the toolbar to download one CSV per selected spectrum.
The exported file contains the **processed (displayed)** wavelength and intensity values — i.e. after crop, baseline, smoothing, and normalisation are applied.

---

## Sample Files

Reference data for testing parsers is in `sample/`:

| File | Format |
|------|--------|
| `sample/cary3500_sample.csv` | Cary 3500 UV-Vis |
| `sample/rf6000_2d_sample.csv` | RF-6000 2D fluorescence |
| `sample/rf6000_3d_sample.csv` | RF-6000 3D EEM |
| `sample/r1f_sample.csv` | LabSolutions R1F |

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
npm run test:ui   # Vitest UI
```

98 tests across 5 suites covering parsers, processing, edge cases, medium features, and low-level features.

### Build

```bash
npm run build
```

Output in `dist/`.

---

## Architecture

```
src/
├── types/spectrum.ts        # Spectrum, ProcessingOptions, ColumnMappingRequest
├── parsers/
│   ├── index.ts             # Format detection, colour palette, parseFile()
│   ├── cary3500.ts
│   ├── rf6000_2d.ts
│   ├── rf6000_3d.ts
│   └── r1f.ts
├── lib/
│   ├── processing.ts        # applyProcessing, cropToRange, smoothSG, subtractBaseline,
│   │                        # integrateTrapezoid, findPeaks
│   └── db.ts                # Dexie/IndexedDB persistence
├── hooks/
│   └── useSpectra.ts        # useReducer state + all dispatch actions
└── components/
    ├── App.tsx
    ├── DropZone.tsx
    ├── SpectrumLibrary.tsx
    ├── ChartWorkspace.tsx
    ├── Toolbar.tsx
    ├── AnalysisPanel.tsx
    ├── ColumnMappingModal.tsx
    ├── PeakTableModal.tsx
    ├── ColorPicker.tsx
    └── ErrorBoundary.tsx
```

### Processing pipeline (non-destructive)

Raw `wavelengths` and `intensities` are stored unchanged on each `Spectrum` object. `applyProcessing()` is called per render inside `ChartWorkspace` and `AnalysisPanel`, so toggling or changing options always operates on the original data.

### State management

All spectrum state lives in a single `useReducer` in `useSpectra`. Actions:

`ADD_SPECTRA` · `TOGGLE_SELECT` · `SELECT_ALL` · `SELECT_NONE` · `INVERT_SELECT` · `REMOVE_SPECTRUM` · `REMOVE_SELECTED` · `CLEAR_ALL` · `DUPLICATE_SPECTRUM` · `SET_VIEW_MODE` · `SET_STACK_OFFSET` · `UPDATE_PROCESSING` · `UPDATE_PROCESSING_BULK` · `SET_SPECTRUM_COLOR` · `RENAME_SPECTRUM` · `RESTORE_FROM_DB`
