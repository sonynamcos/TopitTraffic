// DAT binary parser for traffic signal controllers
// Ported from topit-signal-tool-v10.jsx

const DAT = {
  FILE_SIZE: 0x39c0,          // 14,784 bytes (standard)
  TIMEPLAN_BASE: 0x0000,
  ENTRY_SIZE: 20,
  ENTRIES_PER_PLAN: 8,
  PLAN_SIZE: 160,             // 8 * 20
  LSU_ACTIVE_FLAGS: 0x0cda,
  FLASH_START: 0x0ce4,
  FLASH_END: 0x0ce6,
  RING_A: 0x0e2a,
  RING_B: 0x108a,
  STEP_SIZE: 19,
  MAX_STEPS: 32,
  LSU_TYPES: 0x2f6a,
  MFR_NAME: 0x395a,           // 20 bytes ASCII
  MFR_DATE: 0x3974,           // uint16
};

const LSU_TYPES_MAP = {
  0x44: '차량4색',
  0x33: '차량3색',
  0x88: '보행2색',
};

export function readDat(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  const data = { dayPlans: [], ringA: [], ringB: [], lsuTypes: [], lsuActive: [], flash: {} };

  // Timing plans: 10 plans x 8 entries x 20 bytes
  for (let p = 0; p < 10; p++) {
    const entries = [];
    for (let e = 0; e < 8; e++) {
      const off = DAT.TIMEPLAN_BASE + p * DAT.PLAN_SIZE + e * DAT.ENTRY_SIZE;
      const splits = [];
      for (let ph = 0; ph < 8; ph++) {
        splits.push([u8[off + 4 + ph * 2], u8[off + 5 + ph * 2]]);
      }
      entries.push({
        hour: u8[off],
        min: u8[off + 1],
        cycle: u8[off + 2],
        offset: u8[off + 3],
        splits,
      });
    }
    data.dayPlans.push(entries);
  }

  // Ring A & B steps
  const readRing = (base) => {
    const steps = [];
    for (let s = 0; s < 32; s++) {
      const off = base + s * DAT.STEP_SIZE;
      const lsu = new Uint8Array(16);
      for (let i = 0; i < 16; i++) lsu[i] = u8[off + i];
      steps.push({ lsu, min: u8[off + 16], max: u8[off + 17], eop: u8[off + 18] });
    }
    return steps;
  };
  data.ringA = readRing(DAT.RING_A);
  data.ringB = readRing(DAT.RING_B);

  // LSU active flags & types
  for (let i = 0; i < 8; i++) data.lsuActive.push(u8[DAT.LSU_ACTIVE_FLAGS + i] === 1);
  for (let i = 0; i < 8; i++) {
    data.lsuTypes.push({
      t1: u8[DAT.LSU_TYPES + i * 2],
      t2: u8[DAT.LSU_TYPES + i * 2 + 1],
      label: LSU_TYPES_MAP[u8[DAT.LSU_TYPES + i * 2]] || `0x${u8[DAT.LSU_TYPES + i * 2].toString(16)}`,
    });
  }

  // Flash times
  data.flash = { start: u8[DAT.FLASH_START], end: u8[DAT.FLASH_END] };

  // Manufacturer
  let name = '';
  for (let i = DAT.MFR_NAME; i < DAT.MFR_NAME + 20 && u8[i]; i++) {
    name += String.fromCharCode(u8[i]);
  }
  data.mfr = { name, year: dv.getUint16(DAT.MFR_DATE) };

  return data;
}

export function analyzePhases(data) {
  const rA = data.ringA || [];
  const rB = data.ringB || [];
  const result = [];
  let start = 0;

  for (let s = 0; s < 32; s++) {
    if (rA[s]?.eop !== 1) continue;
    const cnt = s - start;

    const ph = { lsus: {}, green: 0, pedWait: 0, pedGreen: 0, pedFlash: 0, yellow: rA[s].min || 3 };

    const isPedType = (lIdx) => data.lsuTypes?.[lIdx]?.t1 === 0x88;
    const isPedPattern = (lIdx) => {
      let saw01 = false;
      for (let j = start; j < s; j++) {
        const cA = rA[j]?.lsu[lIdx] || 0;
        const cB = rB[j]?.lsu[lIdx] || 0;
        if (cA === 0x01 || cB === 0x01) saw01 = true;
        if ((cA === 0x05 || cB === 0x05) && saw01) return true;
      }
      return false;
    };

    for (let l = 0; l < 8; l++) {
      let hasSt = false, hasLeft = false, hasPedG = false, hasPedF = false;
      const ped = isPedType(l) || isPedPattern(l);
      for (let j = start; j < s; j++) {
        const cA = rA[j]?.lsu[l] || 0;
        const cB = rB[j]?.lsu[l] || 0;
        if (cA === 0x10 || cB === 0x10) hasSt = true;
        if (cA === 0x01 || cB === 0x01) {
          if (ped) hasPedG = true;
          else hasLeft = true;
        }
        if (cA === 0x05 || cB === 0x05) {
          if (ped) hasPedF = true;
        }
      }
      const n = l + 1;
      if (hasPedG || hasPedF) ph.lsus[n] = '보행';
      else if (hasSt && hasLeft) ph.lsus[n] = '직좌';
      else if (hasSt) ph.lsus[n] = '직진';
      else if (hasLeft) ph.lsus[n] = '좌회전';
    }

    // Timing analysis
    if (cnt === 4) {
      ph.pedWait = rA[start]?.min || 1;
      ph.pedGreen = rA[start + 1]?.min || 0;
      ph.pedFlash = rA[start + 2]?.min || 0;
    }

    result.push(ph);
    start = s + 1;
  }
  return result;
}

// Extract periods (timing plan entries) from parsed DAT data
export function extractPeriods(data) {
  const periods = [];
  if (!data.dayPlans?.length) return periods;

  for (let p = 0; p < data.dayPlans.length; p++) {
    const plan = data.dayPlans[p];
    for (const entry of plan) {
      if (entry.cycle === 0) continue;
      const ph = [];
      const rawSum = entry.splits.reduce((s, sp) => s + sp[0] + sp[1], 0);
      for (const sp of entry.splits) {
        ph.push(sp[0]); // single value only (matches Python parser)
      }
      periods.push({
        plan: p,
        time: `${String(entry.hour).padStart(2, '0')}:${String(entry.min).padStart(2, '0')}`,
        cycle: entry.cycle,
        offset: entry.offset,
        ph,
        rawSum, // total of all 8 bytes (for validation)
      });
    }
  }
  return periods;
}

// Detect manufacturer from raw buffer
export function detectManufacturer(buffer) {
  const u8 = new Uint8Array(buffer);
  let name = '';
  for (let i = DAT.MFR_NAME; i < DAT.MFR_NAME + 20 && u8[i]; i++) {
    name += String.fromCharCode(u8[i]);
  }

  if (name.includes('SUHDOL') || name.includes('suhdol') || name.includes('서돌')) {
    return '서돌전자';
  }

  if (!name.trim()) {
    return '한진이엔씨';
  }

  if (name.includes('삼화')) return '삼화전기';
  if (name.includes('LCsim') || name.includes('LCSIM')) return 'LCsim';

  return name.trim();
}

// Build summary info from parsed DAT
export function buildDatInfo(buffer, filename) {
  const data = readDat(buffer);
  const phases = analyzePhases(data);
  const periods = extractPeriods(data);
  const manufacturer = detectManufacturer(buffer);

  // Collect unique plans from periods
  const plans = [];
  const seenCycles = new Set();
  for (const p of periods) {
    const key = `${p.cycle}_${p.offset}`;
    if (!seenCycles.has(key)) {
      seenCycles.add(key);
      const splits = p.ph.filter(v => v > 0);
      plans.push({ cycle: p.cycle, offset: p.offset, splits, valid: p.rawSum === p.cycle * 2 });
    }
  }

  return {
    filename,
    size: buffer.byteLength,
    manufacturer_detected: manufacturer,
    phases: phases.length,
    plans,
    parsed: data,
    analyzedPhases: phases,
    periods,
    lsu_types: data.lsuTypes.map(t => t.label),
    lsu_active: data.lsuActive,
    flash: data.flash,
  };
}
