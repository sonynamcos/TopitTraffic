/**
 * parse-dat.js - Parse a TopIT signal controller .dat file
 *
 * Usage: node parse-dat.js <path-to-dat-file>
 *
 * Outputs:
 *   1. LSU types (pedestrian 0x88, 3-color vehicle 0x33, 4-color vehicle 0x44)
 *   2. Ring A step data with EOP flags, min/max, and all 8 LSU signal codes
 *   3. Ring B step data (same format)
 *   4. Phase boundary analysis (steps with EOP=1)
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
//  DAT file format constants (from topit-signal-tool-v10.jsx)
// ═══════════════════════════════════════════════════════════════
const DAT = {
    FILE_SIZE: 0x39C0,
    TIMEPLAN_BASE: 0x0000,
    ENTRY_SIZE: 20,
    ENTRIES_PER_PLAN: 8,
    PLAN_SIZE: 160,
    LSU_ACTIVE_FLAGS: 0x0CDA,
    FLASH_START: 0x0CE4,
    FLASH_END: 0x0CE6,
    RING_A: 0x0E2A,
    RING_B: 0x108A,
    STEP_SIZE: 19,       // 16 bytes LSU + 1 min + 1 max + 1 eop
    MAX_STEPS: 32,
    LSU_TYPES: 0x2F6A,   // 8 entries x 2 bytes each
    LSU_CONST: 0x2F7A,
    MFR_NAME: 0x395A,
    MFR_DATE: 0x3974,
};

// Signal code lookup
const STEP_CODES = {
    0x00: { label: '적색 (Red)',           short: 'R'  },
    0x01: { label: '좌녹/보행녹 (LG/PG)',   short: 'LG' },
    0x02: { label: '황색 (Yellow)',         short: 'Y'  },
    0x05: { label: '녹점/보행점 (GF/PF)',   short: 'GF' },
    0x10: { label: '직녹 (Straight G)',     short: 'G'  },
    0x20: { label: '황색 (Yellow)',         short: 'Y'  },
    0x30: { label: '적점 (Red Flash)',      short: 'RF' },
    0x80: { label: '소등 (Off)',            short: '--' },
};

const LSU_TYPES_MAP = {
    0x44: '차량4색 (4-color Vehicle)',
    0x33: '차량3색 (3-color Vehicle)',
    0x88: '보행2색 (Pedestrian)',
};

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════
function hex(v) {
    return '0x' + v.toString(16).toUpperCase().padStart(2, '0');
}

function codeLabel(code, lsuType) {
    if (code === 0x00) return '  R   ';
    if (code === 0x01) {
        return lsuType === 0x88 ? ' PedG ' : '  LG  ';
    }
    if (code === 0x02) return '  Y   ';
    if (code === 0x05) {
        return lsuType === 0x88 ? ' PedF ' : '  GF  ';
    }
    if (code === 0x10) return '  G   ';
    if (code === 0x20) return '  Y   ';
    if (code === 0x30) return '  RF  ';
    if (code === 0x80) return '  --  ';
    return hex(code).padStart(6);
}

function padCenter(str, width) {
    const s = String(str);
    const pad = width - s.length;
    if (pad <= 0) return s;
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + s + ' '.repeat(pad - left);
}

// ═══════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════
const filePath = process.argv[2] || path.join(__dirname, '진죽사거리.dat');

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const buf = fs.readFileSync(filePath);
const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

console.log(`\nFile: ${path.basename(filePath)}`);
console.log(`Size: ${buf.length} bytes (expected: ${DAT.FILE_SIZE} = 0x${DAT.FILE_SIZE.toString(16).toUpperCase()})`);
console.log('='.repeat(120));

// ── 1. LSU Types ─────────────────────────────────────────────
console.log('\n[1] LSU TYPES (offset 0x' + DAT.LSU_TYPES.toString(16).toUpperCase() + ')');
console.log('-'.repeat(80));

const lsuTypes = [];   // t1 values for the 8 LSUs
const lsuTypesRaw = [];

for (let i = 0; i < 8; i++) {
    const t1 = u8[DAT.LSU_TYPES + i * 2];
    const t2 = u8[DAT.LSU_TYPES + i * 2 + 1];
    lsuTypes.push(t1);
    lsuTypesRaw.push({ t1, t2 });
    const typeName = LSU_TYPES_MAP[t1] || (t1 ? `Unknown (${hex(t1)})` : 'Not configured');
    console.log(`  LSU ${i + 1}: t1=${hex(t1)}  t2=${hex(t2)}  => ${typeName}`);
}

// ── LSU Active flags ─────────────────────────────────────────
console.log('\n[1b] LSU ACTIVE FLAGS (offset 0x' + DAT.LSU_ACTIVE_FLAGS.toString(16).toUpperCase() + ')');
console.log('-'.repeat(80));

for (let i = 0; i < 8; i++) {
    const active = u8[DAT.LSU_ACTIVE_FLAGS + i];
    console.log(`  LSU ${i + 1}: ${active === 1 ? 'ACTIVE' : 'inactive'} (raw=${hex(active)})`);
}

// ── Flash schedule ───────────────────────────────────────────
console.log(`\n[1c] FLASH SCHEDULE: start=${u8[DAT.FLASH_START]}h  end=${u8[DAT.FLASH_END]}h`);

// ── Manufacturer info ────────────────────────────────────────
let mfrName = '';
for (let i = DAT.MFR_NAME; i < DAT.MFR_NAME + 20 && u8[i]; i++) {
    mfrName += String.fromCharCode(u8[i]);
}
const mfrYear = (u8[DAT.MFR_DATE] << 8) | u8[DAT.MFR_DATE + 1];
console.log(`[1d] MANUFACTURER: "${mfrName}"  Year: ${mfrYear}`);

// ═══════════════════════════════════════════════════════════════
//  Read ring data
// ═══════════════════════════════════════════════════════════════
function readRing(base) {
    const steps = [];
    for (let s = 0; s < 32; s++) {
        const off = base + s * DAT.STEP_SIZE;
        const lsu = [];
        for (let i = 0; i < 16; i++) {
            lsu.push(u8[off + i]);
        }
        steps.push({
            lsu,
            min: u8[off + 16],
            max: u8[off + 17],
            eop: u8[off + 18],
        });
    }
    return steps;
}

const ringA = readRing(DAT.RING_A);
const ringB = readRing(DAT.RING_B);

// ═══════════════════════════════════════════════════════════════
//  Print ring table
// ═══════════════════════════════════════════════════════════════
function printRing(name, steps) {
    console.log(`\n${'='.repeat(120)}`);
    console.log(`[${name}] (base offset: 0x${(name === '2. RING A' ? DAT.RING_A : DAT.RING_B).toString(16).toUpperCase()})`);
    console.log(`${'='.repeat(120)}`);

    // Header row 1: LSU numbers
    let hdr = 'Step | EOP | Min | Max |';
    for (let l = 0; l < 8; l++) {
        const typeShort = lsuTypes[l] === 0x88 ? 'PED' : lsuTypes[l] === 0x33 ? 'V3' : lsuTypes[l] === 0x44 ? 'V4' : '??';
        hdr += padCenter(`L${l + 1}(${typeShort})`, 7) + '|';
    }
    // Also show LSU 9-16 if any have data
    let hasExtra = false;
    for (const step of steps) {
        for (let l = 8; l < 16; l++) {
            if (step.lsu[l] !== 0) { hasExtra = true; break; }
        }
        if (hasExtra) break;
    }
    if (hasExtra) {
        for (let l = 8; l < 16; l++) {
            hdr += padCenter(`L${l + 1}`, 7) + '|';
        }
    }

    console.log('-'.repeat(hdr.length));
    console.log(hdr);
    console.log('-'.repeat(hdr.length));

    // Find the last non-empty step
    let lastStep = 0;
    for (let s = 31; s >= 0; s--) {
        const step = steps[s];
        const hasData = step.lsu.some(v => v !== 0) || step.min !== 0 || step.max !== 0 || step.eop !== 0;
        if (hasData) { lastStep = s; break; }
    }

    for (let s = 0; s <= Math.max(lastStep, 0); s++) {
        const step = steps[s];
        const eopFlag = step.eop === 1 ? ' *1* ' : '  0  ';
        let row = `${String(s).padStart(4)} | ${eopFlag} | ${String(step.min).padStart(3)} | ${String(step.max).padStart(3)} |`;

        for (let l = 0; l < 8; l++) {
            const code = step.lsu[l];
            row += codeLabel(code, lsuTypes[l]) + '|';
        }
        if (hasExtra) {
            for (let l = 8; l < 16; l++) {
                const code = step.lsu[l];
                row += (code === 0 ? '  R   ' : hex(code).padStart(6)) + '|';
            }
        }

        if (step.eop === 1) {
            row += '  <<< EOP (Phase boundary)';
        }
        console.log(row);
    }
    console.log('-'.repeat(hdr.length));
}

printRing('2. RING A', ringA);
printRing('3. RING B', ringB);

// ═══════════════════════════════════════════════════════════════
//  4. Phase boundary analysis
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(120)}`);
console.log('[4] PHASE BOUNDARY ANALYSIS');
console.log('='.repeat(120));

let phaseNum = 1;
let phaseStart = 0;

for (let s = 0; s < 32; s++) {
    const stepA = ringA[s];
    const stepB = ringB[s];
    const hasDataA = stepA.lsu.some(v => v !== 0) || stepA.min !== 0 || stepA.max !== 0 || stepA.eop !== 0;
    const hasDataB = stepB.lsu.some(v => v !== 0) || stepB.min !== 0 || stepB.max !== 0 || stepB.eop !== 0;

    if (!hasDataA && !hasDataB) break;

    if (stepA.eop === 1 || stepB.eop === 1) {
        const stepCount = s - phaseStart + 1;
        console.log(`\n  Phase ${phaseNum}: Steps ${phaseStart}-${s} (${stepCount} steps, EOP at step ${s})`);

        // Analyze what signals are active in this phase
        const lsuMovements = [];
        for (let l = 0; l < 8; l++) {
            let hasStraight = false, hasLeft = false, hasPedGreen = false, hasPedFlash = false, hasYellow = false;
            const isPed = lsuTypes[l] === 0x88;

            for (let j = phaseStart; j <= s; j++) {
                const cA = ringA[j].lsu[l];
                const cB = ringB[j].lsu[l];

                if (cA === 0x10 || cB === 0x10) hasStraight = true;
                if (cA === 0x01 || cB === 0x01) {
                    if (isPed) hasPedGreen = true;
                    else hasLeft = true;
                }
                if (cA === 0x05 || cB === 0x05) {
                    if (isPed) hasPedFlash = true;
                }
                if (cA === 0x20 || cB === 0x20) hasYellow = true;
            }

            let movement = '';
            if (hasPedGreen || hasPedFlash) movement = 'Pedestrian (보행)';
            else if (hasStraight && hasLeft) movement = 'Straight+Left (직좌)';
            else if (hasStraight) movement = 'Straight (직진)';
            else if (hasLeft) movement = 'Left turn (좌회전)';
            else if (hasYellow) movement = 'Yellow only (황색만)';

            if (movement) {
                lsuMovements.push(`    LSU ${l + 1} [${LSU_TYPES_MAP[lsuTypes[l]] || hex(lsuTypes[l])}]: ${movement}`);
            }
        }
        lsuMovements.forEach(m => console.log(m));

        // Show if phase has pedestrian pattern (4 steps) or vehicle-only (2-3 steps)
        if (stepCount >= 4) {
            console.log(`    => Pattern: Pedestrian phase (${stepCount} steps: pedWait + pedGreen + pedFlash + EOP/yellow)`);
        } else if (stepCount === 3) {
            console.log(`    => Pattern: Vehicle phase (${stepCount} steps: green + green + EOP/yellow)`);
        } else {
            console.log(`    => Pattern: ${stepCount}-step phase`);
        }

        phaseNum++;
        phaseStart = s + 1;
    }
}

// ═══════════════════════════════════════════════════════════════
//  5. Bug analysis - isPed detection issue
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(120)}`);
console.log('[5] PEDESTRIAN DETECTION BUG ANALYSIS');
console.log('='.repeat(120));

console.log(`
In topit-signal-tool-v10.jsx line 497, the isPed function is:

    const isPed = (lIdx) => { const t = data.lsuTypes?.[lIdx * 2]; return t === 0x88; };

PROBLEM: data.lsuTypes is an array of objects: [{t1, t2}, {t1, t2}, ...]
  - data.lsuTypes[0] = {t1: ${hex(lsuTypesRaw[0].t1)}, t2: ${hex(lsuTypesRaw[0].t2)}}
  - data.lsuTypes[1] = {t1: ${hex(lsuTypesRaw[1].t1)}, t2: ${hex(lsuTypesRaw[1].t2)}}
  - data.lsuTypes[2] = {t1: ${hex(lsuTypesRaw[2].t1)}, t2: ${hex(lsuTypesRaw[2].t2)}}
  - data.lsuTypes[3] = {t1: ${hex(lsuTypesRaw[3].t1)}, t2: ${hex(lsuTypesRaw[3].t2)}}

When isPed(lIdx) is called with lIdx=0, it does:
    data.lsuTypes[0 * 2] = data.lsuTypes[0] = {t1: ${hex(lsuTypesRaw[0].t1)}, t2: ${hex(lsuTypesRaw[0].t2)}}  (an object, not 0x88)
    => RESULT: false (object !== 0x88)

When isPed(lIdx) is called with lIdx=1, it does:
    data.lsuTypes[1 * 2] = data.lsuTypes[2] = {t1: ${hex(lsuTypesRaw[2].t1)}, t2: ${hex(lsuTypesRaw[2].t2)}}  (an object, not 0x88)
    => RESULT: false

For lIdx >= 4, data.lsuTypes[lIdx*2] is UNDEFINED (array only has 8 elements).
    => RESULT: false

FIX: The line should be:
    const isPed = (lIdx) => { return data.lsuTypes?.[lIdx]?.t1 === 0x88; };
`);

// Identify which LSUs are actually pedestrian
console.log('Pedestrian LSUs in this file:');
for (let i = 0; i < 8; i++) {
    if (lsuTypes[i] === 0x88) {
        console.log(`  LSU ${i + 1} IS pedestrian (t1=0x88)`);
        // Check if it ever gets 0x01 or 0x05 in Ring A or Ring B
        let hasSignal = false;
        for (let s = 0; s < 32; s++) {
            const cA = ringA[s].lsu[i];
            const cB = ringB[s].lsu[i];
            if (cA !== 0 || cB !== 0) {
                hasSignal = true;
                console.log(`    Step ${s}: RingA=${hex(cA)} (${STEP_CODES[cA]?.label || '?'})  RingB=${hex(cB)} (${STEP_CODES[cB]?.label || '?'})`);
            }
        }
        if (!hasSignal) {
            console.log(`    WARNING: No signal codes found for this pedestrian LSU in any step!`);
        }
    }
}

// ── Raw hex dump of LSU types region ─────────────────────────
console.log(`\n[6] RAW HEX DUMP - LSU TYPES region (0x${DAT.LSU_TYPES.toString(16).toUpperCase()}, 32 bytes):`);
let hexDump = '  ';
for (let i = 0; i < 32; i++) {
    hexDump += hex(u8[DAT.LSU_TYPES + i]) + ' ';
    if ((i + 1) % 16 === 0) hexDump += '\n  ';
}
console.log(hexDump);

// ── Raw hex dump around Ring A step 0 ────────────────────────
console.log(`[7] RAW HEX DUMP - Ring A first 4 steps (0x${DAT.RING_A.toString(16).toUpperCase()}):`);
for (let s = 0; s < 4; s++) {
    const off = DAT.RING_A + s * DAT.STEP_SIZE;
    let line = `  Step ${s} [${hex(off)}]: `;
    for (let i = 0; i < DAT.STEP_SIZE; i++) {
        line += hex(u8[off + i]) + ' ';
    }
    line += `  | LSU: ${Array.from({length:8}, (_, i) => hex(u8[off+i])).join(' ')}  min=${u8[off+16]} max=${u8[off+17]} eop=${u8[off+18]}`;
    console.log(line);
}

console.log('\nDone.');
