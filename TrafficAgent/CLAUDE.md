# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrafficAgent is a **Korean traffic signal controller DB management tool** built as a single-file React JSX application (`topit-signal-tool-v10.jsx`). It runs as a browser-based Claude Artifact — there is no build system, package.json, or Node.js runtime. All UI, logic, and styling live in one ~1400-line JSX file.

The tool reads/writes binary `.DAT` files from traffic signal controllers, generates Ring A/B signal maps, provides a real-time canvas simulation, and exports formatted Excel cycle tables (주기표).

## How to Run

This is a React Artifact — paste the JSX into Claude's Artifact runner or any React sandbox. There is no `npm start`, build step, or local dev server.

External dependency loaded at runtime via CDN:
- **JSZip 3.10.1** (`cdnjs.cloudflare.com`) — for .xlsx template manipulation

## Architecture

### Single-File Structure

`topit-signal-tool-v10.jsx` exports `default function App()` — one React component containing everything:

| Section | Lines (approx) | Purpose |
|---------|----------------|---------|
| Constants (`DAT`, `STEP_CODES`, `DEFAULT_LSU`) | 1–40 | Binary format offsets, signal codes, LSU mapping |
| `generateSignalMap(phases, lsuConfig)` | 42–81 | Converts phase definitions → Ring A/B signal step arrays |
| `readDat(buffer)` / `writeDat(template, model)` | 86–107 | Binary .DAT file parse/serialize |
| `App()` component | 118–1405 | All state, UI tabs, event handlers |
| `exportExcel()` | ~307–356 | JSZip-based .xlsx export from embedded base64 template |
| Canvas simulation `useEffect` | ~477–1045 | Traffic intersection animation with vehicles & pedestrians |
| `TMPL_B64` constant | ~1300+ | Base64-encoded Excel template (`주기표양식.xlsx`) |

### Five UI Tabs

1. **📝 DB작성 (converter)** — Upload .DAT / manually define phases and LSU config
2. **📡 시그널맵 (signalmap)** — View Ring A/B signal matrix with hex codes
3. **📅 DAY PLAN (dayplan)** — Manage 10 time plans × 8 periods per plan
4. **🚦 시뮬레이션 (simulation)** — Real-time canvas-based intersection simulator
5. **✅ 검증 (validate)** — Phase coverage analysis and data integrity checks

### Core Data Model

- **`phases[]`** — Array of phase objects, each with `lsus` (LSU→movement map), `pedWait`, `pedGreen`, `pedFlash`, `yellow` timing values
- **`lsuConfig[]`** — 8 Lane Signal Units mapped to directions (북/동/남/서) and types (차량/보행)
- **Movement types**: `"직진"` (straight), `"좌회전"` (left turn), `"직좌"` (straight+left), `"보행"` (pedestrian)
- **Ring assignment**: 직진/보행 → Ring A, 좌회전 → Ring B, 직좌 → both

### DAT Binary Format

Total file size: `0x39c0` (14,784 bytes). Key offsets defined in the `DAT` constant:
- `TIMEPLAN_BASE` (0x0000) — Time plan data
- `RING_A` (0x0e2a) — Ring A signal map (32 steps × 19 bytes)
- `RING_B` (0x108a) — Ring B signal map
- `LSU_TYPES` (0x2f6a) — LSU type definitions

### Excel Export

Uses JSZip to open the embedded `.xlsx` template (base64 in `TMPL_B64`), modify `xl/worksheets/sheet1.xml` cell values via string replacement, and trigger a browser download.

## Key Reference: Project Briefing

`클로드코드_브리핑_주기표_현시도_자동생성.md` contains detailed specifications for the next development task: **automatic signal diagram (현시도) image generation and insertion into the Excel export**. This includes:
- Arrow drawing rules per direction/movement type
- XLSX XML structure for image insertion (drawings, rels, content types)
- Cell-to-column/row index mapping for image placement
- Three diagram types: Phase diagram (all movements), Ring A (straight+ped), Ring B (left turn)

## Language

All UI text, variable names in data models, and documentation are in **Korean**. Code structure and function names use English. Comments may be in either language.
