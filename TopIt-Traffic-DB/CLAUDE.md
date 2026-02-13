# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

보령시 교통신호제어기 통합관리 시스템 - Traffic signal controller DB management for Boryeong City.
Converts chaotic DAT files + Excel cycle tables into organized per-intersection folders with a web management UI.

**Core principle: 1 intersection = 1 folder = 1 DAT + 1 cycle table + 1 info.json**

## Architecture

```
TopIt-Traffic-DB/
├── scripts/              # Phase 1: Python classification pipeline
│   ├── classify.py       # Main orchestrator (entry point)
│   ├── dat_parser.py     # Binary DAT file parser (SUHDOL/한진/LCsim)
│   ├── xlsx_parser.py    # Cycle table Excel parser
│   └── matcher.py        # DAT ↔ cycle table name matching
├── webapp/               # Phase 2-4: React + Express web app
│   ├── server/index.js   # Express API (port 3001), reads from 보령시_신호DB/
│   ├── src/              # React frontend (Vite)
│   │   ├── pages/Dashboard.jsx         # Stats overview
│   │   ├── pages/IntersectionList.jsx  # Searchable/filterable table
│   │   ├── pages/IntersectionDetail.jsx # DAT viewer, timing plans, LSU, edit
│   │   ├── pages/RouteDiagram.jsx      # Phase 3: SVG interactive route diagram
│   │   ├── pages/DatCompare.jsx        # Phase 4: Side-by-side DAT comparison
│   │   └── pages/ReplacementWorkflow.jsx # Phase 4: 한진→서돌 replacement tracker
│   └── src/api/client.js # API client utilities
├── 참조할dat/제어기DB/    # Source DAT files (~200 files)
├── 주기표엑셀/            # Source cycle table Excel files
├── 요도/                  # Route diagram Excel files
└── 보령시_신호DB/         # OUTPUT: organized intersection folders
    ├── master.json
    ├── 교차로/{name}/info.json + .dat + .xlsx
    ├── _원본/
    └── _미분류/
```

## Commands

```bash
# Phase 1: Run classification pipeline
pip install openpyxl xlrd
python scripts/classify.py

# Phase 2: Web app
cd webapp && npm install
npm run dev          # starts both Express (3001) + Vite (5173) via concurrently
npm run dev:server   # Express API only
npm run dev:client   # Vite React only
npm run build        # production build → webapp/dist/
```

## API Endpoints (Express, port 3001)

- `GET  /api/intersections?q=&manufacturer=&has_dat=&has_cycle_table=` - list/search
- `GET  /api/intersection/:id` - detail (info.json)
- `GET  /api/file/:id/dat` or `/cycle` - file download
- `PUT  /api/intersection/:id` - update status/notes
- `GET  /api/stats` - dashboard statistics
- `GET  /api/routes` / `PUT /api/routes` - route diagram data
- `POST /api/upload/:id` - file upload (multipart)
- `POST /api/dat-register` - DAT upload → parse → DB register → cycle table generate
- `GET  /api/compare/:id1/:id2` - DAT diff (Phase 4)
- `GET  /api/replacements` - 한진 replacement targets + stats (Phase 4)
- `PUT  /api/intersection/:id/replacement` - update replacement status (Phase 4)

## DAT File Binary Formats

### SUHDOL (서돌전자) - 14,784 bytes (0x39C0)
- Signature: "SUHDOL" at **0x391D** and **0x395A**
- Timing plans: offset 0x0000, 20 bytes per plan
  - Byte[2] = cycle time (single byte, seconds)
  - Byte[3] = offset value
  - Bytes[4-11] = 8 phase times (each pair duplicated, sum = 2× cycle)
- Date: **0x3936-0x3939** Big-Endian uint16 year + uint8 month + uint8 day
- Phone: **0x393B** ASCII "031-901-5120"
- LSU type: **0x2F6A** (0x44=차량4색, 0x33=차량3색, 0x88=보행2색)
- LSU active: **0x0CDA** (1=active, 0=inactive)

### SUHDOL Extended - 14,846 bytes (0x39FE)
- Same structure, signature shifted to 0x3955 (+62 bytes offset)

### 한진이엔씨 (Remote Data Ver)
- Header: "Remote Data Ver X.X.X.X" at offset 0x0000
- Versions: 3.5.2.0 (16,265B), 2.1 (16,245B), 0.0.1.x (6,321B)

### Plain Format - 14,784 bytes, no signature
- Same timing structure as SUHDOL but no metadata section

### LCsim - 61,472 bytes
- Large format for complex intersections

## Manufacturer Detection Priority
1. File size 14,784 → check for "SUHDOL" at 0x391D → 서돌전자
2. File size 14,846 → check for "SUHDOL" at 0x3955 → 서돌전자 extended
3. "Remote Data Ver" at 0x0000 → 한진이엔씨
4. File size 61,472 → LCsim
5. File size 14,784 + no signature → Plain (likely older 서돌)

## Duplicate Resolution (same intersection, multiple DATs)
1. Manufacturer: 서돌 > 한진 > unknown
2. Date: newest modification date wins
3. File size: 14,784B (standard) preferred
4. Filename: clean name > suffixed name (1), (2)

## Phase 5: DAT Upload + Cycle Table Auto-Generation

### Server-side files
- `server/dat-parser.js` - DAT binary parser (readDat, analyzePhases, extractPeriods, detectManufacturer, buildDatInfo)
- `server/signal-drawer.js` - Canvas signal diagram drawing (drawIntersection, drawPhaseArrows, generateCycleImages)
- `server/cycle-generator.js` - Cycle table xlsx generator using JSZip template manipulation

### Manufacturer detection (dat-parser.js)
- offset 0x395A contains "SUHDOL" → 서돌전자
- offset 0x395A is empty (all zeros) → 한진이엔씨
- 한진: cycle table generation skipped, shows warning message only

### Arrow ordering algorithm (signal-drawer.js)
Physical road layout order (center line → curb):
- 북/동 (rev=false): 좌회전 → 직진 → 보행
- 남/서 (rev=true): 보행 → 직진 → 좌회전
- Exception (pedCount >= 2): 보행 → 직진 → 보행
- `rev = isV ? allD.some(d==='남') : allD.some(d==='서')`
- Reference: TrafficAgent/topit-signal-tool-v10.jsx

### Template
- `주기표양식.xlsx` at project root - cycle table Excel template

## Key Conventions
- **Never modify original files** - always copy
- Source data uses Korean filenames with numeric prefixes (e.g., "47_신설사거리.dat")
- Cycle table Excels have intersection names as sheet names
- Range-named Excel files (e.g., "0~10.xls") contain multiple intersections across sheets
- info.json `_classification` field documents why a particular file was chosen
