// Server-side signal diagram drawing
// Ported from topit-signal-tool-v10.jsx for Node.js canvas

import { createCanvas } from 'canvas';

// Arrow sprite definitions
const ARROWS = {
  S_UP:         { w:30,h:70, lw:2.5, paths:[[15,66,15,13]],            heads:[[15,2,7,13,23,13]] },
  S_DOWN:       { w:30,h:70, lw:2.5, paths:[[15,4,15,57]],            heads:[[15,68,7,57,23,57]] },
  L_UP_LEFT:    { w:30,h:70, lw:2.5, paths:[[22,66,22,28,12,28]],     heads:[[2,28,12,21,12,35]] },
  L_DOWN_RIGHT: { w:30,h:70, lw:2.5, paths:[[8,4,8,42,18,42]],       heads:[[28,42,18,35,18,49]] },
  P_VERT:       { w:30,h:70, lw:1.5, dash:true, paths:[[15,12,15,58]], heads:[[15,3,9,12,21,12],[15,67,9,58,21,58]] },
  S_LEFT:       { w:70,h:30, lw:2.5, paths:[[66,15,13,15]],           heads:[[2,15,13,7,13,23]] },
  S_RIGHT:      { w:70,h:30, lw:2.5, paths:[[4,15,57,15]],            heads:[[68,15,57,7,57,23]] },
  L_LEFT_DOWN:  { w:70,h:30, lw:2.5, paths:[[66,8,28,8,28,18]],      heads:[[28,28,21,18,35,18]] },
  L_RIGHT_UP:   { w:70,h:30, lw:2.5, paths:[[4,22,42,22,42,12]],     heads:[[42,2,35,12,49,12]] },
  P_HORIZ:      { w:70,h:30, lw:1.5, dash:true, paths:[[12,15,58,15]], heads:[[3,15,12,9,12,21],[67,15,58,9,58,21]] },
};

// Default LSU configuration
const DEFAULT_LSU = [
  { lsu: 1, dir: '북', type: '차량', pos: 'top' },
  { lsu: 2, dir: '동', type: '보행', pos: 'right-ped' },
  { lsu: 3, dir: '동', type: '차량', pos: 'right' },
  { lsu: 4, dir: '남', type: '보행', pos: 'bottom-ped' },
  { lsu: 5, dir: '남', type: '차량', pos: 'bottom' },
  { lsu: 6, dir: '서', type: '보행', pos: 'left-ped' },
  { lsu: 7, dir: '서', type: '차량', pos: 'left' },
  { lsu: 8, dir: '북', type: '보행', pos: 'top-ped' },
];

const LSU_DIR = { 1: 'N', 3: 'E', 5: 'S', 7: 'W' };

function drawArrow(ctx, def, x, y, w, h) {
  const sx = w / def.w, sy = h / def.h;
  const tx = (px) => x + px * sx, ty = (py) => y + py * sy;
  ctx.save();
  ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
  ctx.lineWidth = def.lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(def.dash ? [4, 3] : []);
  for (const p of def.paths) {
    ctx.beginPath(); ctx.moveTo(tx(p[0]), ty(p[1]));
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(tx(p[i]), ty(p[i + 1]));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const t of def.heads) {
    ctx.beginPath(); ctx.moveTo(tx(t[0]), ty(t[1])); ctx.lineTo(tx(t[2]), ty(t[3])); ctx.lineTo(tx(t[4]), ty(t[5])); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Determine active roads from phases
export function getActiveRoads(phases) {
  const roads = new Set();
  const signals = new Set();
  const oppositeDir = { N: 'S', S: 'N', E: 'W', W: 'E' };
  for (const ph of phases) {
    if (!ph.lsus) continue;
    for (const [lsu, mov] of Object.entries(ph.lsus)) {
      const d = LSU_DIR[Number(lsu)];
      if (!d) continue;
      signals.add(d);
      if (mov === '직진' || mov === '직좌') roads.add(d);
    }
  }
  signals.forEach(d => roads.add(oppositeDir[d]));
  return roads.size > 0 ? roads : new Set(['N', 'S', 'E', 'W']);
}

// Draw intersection diagram → returns PNG Buffer
export function drawIntersection(activeRoads) {
  const Z = 200;
  const c = createCanvas(Z, Z);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Z, Z);

  const N = activeRoads.has('N'), S = activeRoads.has('S');
  const E = activeRoads.has('E'), W = activeRoads.has('W');
  const M = Z / 2, R = Z * 0.14, G = Z * 0.04;

  ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  if (N) { ctx.beginPath(); ctx.moveTo(M-R,0); ctx.lineTo(M-R,M-R); ctx.stroke(); ctx.beginPath(); ctx.moveTo(M+R,0); ctx.lineTo(M+R,M-R); ctx.stroke(); }
  if (S) { ctx.beginPath(); ctx.moveTo(M-R,M+R); ctx.lineTo(M-R,Z); ctx.stroke(); ctx.beginPath(); ctx.moveTo(M+R,M+R); ctx.lineTo(M+R,Z); ctx.stroke(); }
  if (E) { ctx.beginPath(); ctx.moveTo(M+R,M-R); ctx.lineTo(Z,M-R); ctx.stroke(); ctx.beginPath(); ctx.moveTo(M+R,M+R); ctx.lineTo(Z,M+R); ctx.stroke(); }
  if (W) { ctx.beginPath(); ctx.moveTo(0,M-R); ctx.lineTo(M-R,M-R); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,M+R); ctx.lineTo(M-R,M+R); ctx.stroke(); }

  if (!N) { ctx.beginPath(); ctx.moveTo(M-R,M-R); ctx.lineTo(M+R,M-R); ctx.stroke(); }
  if (!S) { ctx.beginPath(); ctx.moveTo(M-R,M+R); ctx.lineTo(M+R,M+R); ctx.stroke(); }
  if (!E) { ctx.beginPath(); ctx.moveTo(M+R,M-R); ctx.lineTo(M+R,M+R); ctx.stroke(); }
  if (!W) { ctx.beginPath(); ctx.moveTo(M-R,M-R); ctx.lineTo(M-R,M+R); ctx.stroke(); }

  ctx.lineWidth = 0.8;
  if (N) { ctx.beginPath(); ctx.moveTo(M,2); ctx.lineTo(M,M-R-G); ctx.stroke(); }
  if (S) { ctx.beginPath(); ctx.moveTo(M,M+R+G); ctx.lineTo(M,Z-2); ctx.stroke(); }
  if (E) { ctx.beginPath(); ctx.moveTo(M+R+G,M); ctx.lineTo(Z-2,M); ctx.stroke(); }
  if (W) { ctx.beginPath(); ctx.moveTo(2,M); ctx.lineTo(M-R-G,M); ctx.stroke(); }

  ctx.setLineDash([5,5]); ctx.lineWidth = 0.6; const HR = R/2;
  if (N) { ctx.beginPath(); ctx.moveTo(M-HR,2); ctx.lineTo(M-HR,M-R-G); ctx.stroke(); ctx.beginPath(); ctx.moveTo(M+HR,2); ctx.lineTo(M+HR,M-R-G); ctx.stroke(); }
  if (S) { ctx.beginPath(); ctx.moveTo(M-HR,M+R+G); ctx.lineTo(M-HR,Z-2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(M+HR,M+R+G); ctx.lineTo(M+HR,Z-2); ctx.stroke(); }
  if (E) { ctx.beginPath(); ctx.moveTo(M+R+G,M-HR); ctx.lineTo(Z-2,M-HR); ctx.stroke(); ctx.beginPath(); ctx.moveTo(M+R+G,M+HR); ctx.lineTo(Z-2,M+HR); ctx.stroke(); }
  if (W) { ctx.beginPath(); ctx.moveTo(2,M-HR); ctx.lineTo(M-R-G,M-HR); ctx.stroke(); ctx.beginPath(); ctx.moveTo(2,M+HR); ctx.lineTo(M-R-G,M+HR); ctx.stroke(); }
  ctx.setLineDash([]);

  ctx.fillStyle = '#999'; const CW = Z*0.04, CL = R*2-4;
  const drawCW = (x,y,w,h,vert) => { const n=6; for(let i=0;i<n;i++){ if(vert) ctx.fillRect(x+i*(w/n),y,w/n*0.5,h); else ctx.fillRect(x,y+i*(h/n),w,h/n*0.5); }};
  if (N) drawCW(M-R+2, M-R-CW-3, CL, CW, true);
  if (S) drawCW(M-R+2, M+R+3, CL, CW, true);
  if (E) drawCW(M+R+3, M-R+2, CW, CL, false);
  if (W) drawCW(M-R-CW-3, M-R+2, CW, CL, false);

  ctx.fillStyle = '#666'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (N) ctx.fillText('N', M, 12);
  if (S) ctx.fillText('S', M, Z-12);
  if (E) ctx.fillText('E', Z-12, M);
  if (W) ctx.fillText('W', 12, M);

  return c.toBuffer('image/png');
}

// Draw phase arrows diagram → returns PNG Buffer
export function drawPhaseArrows(phase, lsuConfig, mode) {
  const W = 100, H = 80;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

  const lsus = phase.lsus || {};
  const dirMap = {};
  for (const lc of lsuConfig) dirMap[lc.lsu] = lc;

  const straights = [], lefts = [];
  let pedCount = 0;
  for (const k in lsus) {
    const move = lsus[k]; if (!move || move === '—') continue;
    const cfg = dirMap[Number(k)]; if (!cfg) continue;
    if (cfg.type === '차량') {
      const s = move === '직진' || move === '직좌', l = move === '좌회전' || move === '직좌';
      if (mode === 'all') { if (s) straights.push(cfg.dir); if (l) lefts.push(cfg.dir); }
      else if (mode === 'ringA') { if (s) straights.push(cfg.dir); }
      else if (mode === 'ringB') { if (l) lefts.push(cfg.dir); }
    }
    if (cfg.type === '보행' && move === '보행' && mode !== 'ringB') pedCount++;
  }

  const allD = straights.concat(lefts);
  const isV = allD.some(d => d === '북' || d === '남') || !allD.some(d => d === '동' || d === '서');

  const SK = { '북':'S_UP','남':'S_DOWN','동':'S_RIGHT','서':'S_LEFT' };
  const LK = { '북':'L_UP_LEFT','남':'L_DOWN_RIGHT','동':'L_RIGHT_UP','서':'L_LEFT_DOWN' };

  // 배치 순서: 도로 물리 배치 기준 (중앙선쪽 → 인도쪽)
  // 북/동 기준: 좌회전 → 직진 → 보행
  // 남/서 기준(뒤집힘): 보행 → 직진 → 좌회전
  // 예외: 보행 2개일 때 → 보행 + 직진 + 보행
  const items = [];
  const pedKey = isV ? 'P_VERT' : 'P_HORIZ';

  if (pedCount >= 2) {
    items.push(pedKey);
    straights.forEach(d => items.push(SK[d]));
    items.push(pedKey);
  } else {
    const rev = isV ? allD.some(d => d === '남') : allD.some(d => d === '서');
    if (rev) {
      for (let p = 0; p < pedCount; p++) items.push(pedKey);
      straights.forEach(d => items.push(SK[d]));
      lefts.forEach(d => items.push(LK[d]));
    } else {
      lefts.forEach(d => items.push(LK[d]));
      straights.forEach(d => items.push(SK[d]));
      for (let p = 0; p < pedCount; p++) items.push(pedKey);
    }
  }

  const n = items.length;
  if (n === 0) return c.toBuffer('image/png');

  const PX = W * 0.12, PY = H * 0.12;
  const IW = W - PX * 2, IH = H - PY * 2;

  if (isV) {
    const slotW = IW / n;
    for (let i = 0; i < n; i++) {
      const def = ARROWS[items[i]];
      const scale = Math.min(slotW / def.w, IH / def.h);
      const dw = def.w * scale, dh = def.h * scale;
      drawArrow(ctx, def, PX + slotW * i + (slotW - dw) / 2, PY + (IH - dh) / 2, dw, dh);
    }
  } else {
    const slotH = IH / n;
    for (let i = 0; i < n; i++) {
      const def = ARROWS[items[i]];
      const scale = Math.min(IW / def.w, slotH / def.h);
      const dw = def.w * scale, dh = def.h * scale;
      drawArrow(ctx, def, PX + (IW - dw) / 2, PY + slotH * i + (slotH - dh) / 2, dw, dh);
    }
  }

  return c.toBuffer('image/png');
}

// Generate all images for cycle table
export function generateCycleImages(phases, lsuConfig) {
  lsuConfig = lsuConfig || DEFAULT_LSU;
  const activeRoads = getActiveRoads(phases);
  const nPh = Math.min(phases.length, 6);

  const images = [];
  let imgIdx = 0;

  // Intersection diagram (rows 5-6, cols 2-9)
  const crossBuf = drawIntersection(activeRoads);
  imgIdx++;
  images.push({
    name: 'image' + imgIdx + '.png',
    buf: crossBuf,
    fromCol: 2, toCol: 9, fromRow: 5, toRow: 6,
    fit: 0.80, aspect: 1,
  });

  // Phase columns (0-based): J=9, L=11, N=13, P=15, R=17, T=19
  const phColIdx = [9, 11, 13, 15, 17, 19];

  for (let pi = 0; pi < nPh; pi++) {
    const ph = phases[pi];

    // Full phase (all) — rows 5-7
    const bufAll = drawPhaseArrows(ph, lsuConfig, 'all');
    imgIdx++;
    images.push({
      name: 'image' + imgIdx + '.png', buf: bufAll,
      fromCol: phColIdx[pi], toCol: phColIdx[pi] + 2,
      fromRow: 5, toRow: 7, fit: 0.70,
    });

    // Ring A — rows 7-9
    const bufA = drawPhaseArrows(ph, lsuConfig, 'ringA');
    imgIdx++;
    images.push({
      name: 'image' + imgIdx + '.png', buf: bufA,
      fromCol: phColIdx[pi], toCol: phColIdx[pi] + 2,
      fromRow: 7, toRow: 9, fit: 0.50, anchorRow: 8,
    });

    // Ring B — rows 9-11
    const bufB = drawPhaseArrows(ph, lsuConfig, 'ringB');
    imgIdx++;
    images.push({
      name: 'image' + imgIdx + '.png', buf: bufB,
      fromCol: phColIdx[pi], toCol: phColIdx[pi] + 2,
      fromRow: 9, toRow: 11, fit: 0.50, anchorRow: 9,
    });
  }

  return images;
}
