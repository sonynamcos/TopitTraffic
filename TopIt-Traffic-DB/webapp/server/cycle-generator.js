// Cycle table (주기표) Excel generator
// Uses 주기표양식.xlsx as template, fills in data via JSZip XML manipulation

import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateCycleImages } from './signal-drawer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../../주기표양식.xlsx');

// Phase columns in template: J, L, N, P, R, T (up to 6 phases)
const PH_COLS = ['J', 'L', 'N', 'P', 'R', 'T'];

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Set a cell value in the sheet XML
function setCell(xml, ref, value) {
  const isNum = typeof value === 'number';
  const pat = new RegExp('<c r="' + ref + '"([^/]*?)(?:/>|>([\\s\\S]*?)</c>)');
  const m = xml.match(pat);
  if (!m) return xml;

  const attrs = m[1].replace(/\s*t="[^"]*"/g, '');
  let nc;
  if (isNum) {
    nc = '<c r="' + ref + '"' + attrs + '><v>' + value + '</v></c>';
  } else {
    nc = '<c r="' + ref + '"' + attrs + ' t="inlineStr"><is><t>' + escXml(value) + '</t></is></c>';
  }
  return xml.replace(pat, nc);
}

/**
 * Generate a cycle table xlsx from parsed DAT data
 * @param {string} name - Intersection name
 * @param {Array} phases - Analyzed phases from analyzePhases()
 * @param {Array} periods - Extracted periods from extractPeriods()
 * @param {object} datInfo - Full DAT info from buildDatInfo()
 * @returns {Buffer} xlsx file buffer
 */
export async function generateCycleTable(name, phases, periods, datInfo) {
  // Load template
  const templateBuf = await fs.readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuf);

  let sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');

  const nPh = Math.min(phases.length, 6);
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}`;

  // Header info
  sheetXml = setCell(sheetXml, 'D4', name);
  sheetXml = setCell(sheetXml, 'R4', dateStr);

  // OPTION row (14-15): fixed values
  for (let i = 0; i < nPh; i++) {
    sheetXml = setCell(sheetXml, PH_COLS[i] + '14', i === 0 ? 20 : 10);
    sheetXml = setCell(sheetXml, PH_COLS[i] + '15', i === 0 ? 20 : 10);
  }

  // MIN. GREEN row (16-17): minimum split across all periods
  for (let i = 0; i < nPh; i++) {
    let minV = 999999;
    for (const p of periods) {
      const pv = p.ph[i] || 0;
      if (pv > 0 && pv < minV) minV = pv;
    }
    const v = minV >= 999999 ? 0 : minV;
    sheetXml = setCell(sheetXml, PH_COLS[i] + '16', v);
    sheetXml = setCell(sheetXml, PH_COLS[i] + '17', v);
  }

  // MAX row (18-19): maximum split across all periods
  for (let i = 0; i < nPh; i++) {
    let mx = 0;
    for (const p of periods) {
      const pv = p.ph[i] || 0;
      if (pv > mx) mx = pv;
    }
    sheetXml = setCell(sheetXml, PH_COLS[i] + '18', mx);
    sheetXml = setCell(sheetXml, PH_COLS[i] + '19', mx);
  }

  // YELLOW row (20-21)
  for (let i = 0; i < nPh; i++) {
    const yv = phases[i] ? phases[i].yellow || 3 : 3;
    sheetXml = setCell(sheetXml, PH_COLS[i] + '20', yv);
    sheetXml = setCell(sheetXml, PH_COLS[i] + '21', yv);
  }

  // BEF. PED. row (22-23)
  for (let i = 0; i < nPh; i++) {
    const pw = phases[i] ? phases[i].pedWait || 0 : 0;
    if (pw > 0) {
      sheetXml = setCell(sheetXml, PH_COLS[i] + '22', pw);
      sheetXml = setCell(sheetXml, PH_COLS[i] + '23', pw);
    }
  }

  // WALK row (24-25)
  for (let i = 0; i < nPh; i++) {
    const pg = phases[i] ? phases[i].pedGreen || 0 : 0;
    if (pg > 0) {
      sheetXml = setCell(sheetXml, PH_COLS[i] + '24', pg);
      sheetXml = setCell(sheetXml, PH_COLS[i] + '25', pg);
    }
  }

  // WALK CLEAR row (26-27)
  for (let i = 0; i < nPh; i++) {
    const pf = phases[i] ? phases[i].pedFlash || 0 : 0;
    if (pf > 0) {
      sheetXml = setCell(sheetXml, PH_COLS[i] + '26', pf);
      sheetXml = setCell(sheetXml, PH_COLS[i] + '27', pf);
    }
  }

  // PLAN TABLE: deduplicate levels
  const levelKeys = [];
  const levelList = [];
  for (const p of periods) {
    let cycle = 0;
    for (let j = 0; j < p.ph.length; j++) cycle += (p.ph[j] || 0);
    const sp = p.ph.filter(v => v > 0);
    const key = cycle + '_' + sp.join(',');
    if (!levelKeys.includes(key)) {
      levelKeys.push(key);
      levelList.push({ cycle: cycle || p.cycle, offset: p.offset || 0, splits: sp });
    }
  }

  // TIME PLAN levels (rows 33,35,41,47,53,59)
  const levelRows = [33, 35, 41, 47, 53, 59];
  for (let li = 0; li < levelList.length && li < 6; li++) {
    const lv = levelList[li];
    const rr = levelRows[li];
    sheetXml = setCell(sheetXml, 'B' + rr, lv.cycle);
    sheetXml = setCell(sheetXml, 'C' + rr, li + 1);
    sheetXml = setCell(sheetXml, 'D' + rr, lv.offset);
    sheetXml = setCell(sheetXml, 'E' + rr, lv.splits.join(','));
    const rrB = li === 0 ? 34 : rr + 1;
    sheetXml = setCell(sheetXml, 'E' + rrB, lv.splits.join(','));
  }

  // TOD PLAN entries (rows 33+)
  for (let pi = 0; pi < periods.length && pi < 16; pi++) {
    const p = periods[pi];
    let cycle = 0;
    for (let j = 0; j < p.ph.length; j++) cycle += (p.ph[j] || 0);
    const sp = p.ph.filter(v => v > 0);
    const key = (cycle || p.cycle) + '_' + sp.join(',');
    const lvIdx = levelKeys.indexOf(key);
    const rr = 33 + pi;
    sheetXml = setCell(sheetXml, 'J' + rr, p.time || '00:00');
    sheetXml = setCell(sheetXml, 'K' + rr, lvIdx + 1);
    sheetXml = setCell(sheetXml, 'L' + rr, lvIdx + 1);
  }

  // ── Image embedding (교차로 도식 + 현시도) ──
  const imgList = generateCycleImages(phases);

  if (imgList.length > 0) {
    // 1) Add PNG files to xl/media/
    for (const im of imgList) {
      zip.file('xl/media/' + im.name, im.buf);
    }

    // 2) Add png type to [Content_Types].xml
    let ctXml = await zip.file('[Content_Types].xml').async('string');
    if (!ctXml.includes('Extension="png"')) {
      ctXml = ctXml.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="png" ContentType="image/png"/>');
    }
    if (!ctXml.includes('drawing+xml')) {
      ctXml = ctXml.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
    }
    zip.file('[Content_Types].xml', ctXml);

    // 3) Parse column widths and row heights for EMU calculations
    let defaultColW = 8.43, defaultRowH = 15;
    const fmtM = sheetXml.match(/<sheetFormatPr[^>]*>/);
    if (fmtM) {
      const dcwM = fmtM[0].match(/defaultColWidth="([^"]+)"/);
      if (dcwM) defaultColW = parseFloat(dcwM[1]);
      const drhM = fmtM[0].match(/defaultRowHeight="([^"]+)"/);
      if (drhM) defaultRowH = parseFloat(drhM[1]);
    }
    const colWidths = {}, rowHeights = {};
    const colReg = /<col\s+[^>]*?\/>/g;
    let colM;
    while ((colM = colReg.exec(sheetXml)) !== null) {
      const mnM = colM[0].match(/min="(\d+)"/), mxM = colM[0].match(/max="(\d+)"/), cwM = colM[0].match(/width="([^"]+)"/);
      if (mnM && mxM && cwM) {
        for (let cc = parseInt(mnM[1]); cc <= parseInt(mxM[1]); cc++) colWidths[cc] = parseFloat(cwM[1]);
      }
    }
    const rowReg = /<row\s+[^>]*?>/g;
    let rowM;
    while ((rowM = rowReg.exec(sheetXml)) !== null) {
      const rrM = rowM[0].match(/r="(\d+)"/), htM = rowM[0].match(/ht="([^"]+)"/);
      if (rrM && htM) rowHeights[parseInt(rrM[1])] = parseFloat(htM[1]);
    }

    const colEMU = (c1) => { const w = colWidths[c1] || defaultColW; return Math.round((w * 7 + 5) * 9525); };
    const rowEMU = (r1) => { const h = rowHeights[r1] || defaultRowH; return Math.round(h * 12700); };

    // 4) Build drawing1.xml
    let drawXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    drawXml += '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n';

    for (let di = 0; di < imgList.length; di++) {
      const im = imgList[di];
      const rId = 'rId' + (di + 1);

      let rngW = 0, rngH = 0;
      for (let c = im.fromCol + 1; c <= im.toCol; c++) rngW += colEMU(c);
      for (let r = im.fromRow + 1; r <= im.toRow; r++) rngH += rowEMU(r);

      const fitRatio = im.fit || 0.85;
      const asp = im.aspect || (5 / 4);
      const fitW = Math.round(rngW * fitRatio), fitH = Math.round(rngH * fitRatio);
      let imgW, imgH;
      if (fitW / fitH > asp) { imgH = fitH; imgW = Math.round(imgH * asp); }
      else { imgW = fitW; imgH = Math.round(imgW / asp); }

      // Horizontal centering
      let centerX = Math.round((rngW - imgW) / 2);
      let aCol = im.fromCol, colOff = centerX;
      for (let cx = im.fromCol + 1; cx <= im.toCol && colOff >= colEMU(cx); cx++) {
        colOff -= colEMU(cx); aCol++;
      }

      // Vertical centering
      let aRow = im.anchorRow !== undefined ? im.anchorRow : im.fromRow;
      let rowOff;
      if (im.anchorRow !== undefined) {
        const cellH = rowEMU(im.anchorRow + 1);
        rowOff = Math.max(0, Math.round((cellH - imgH) / 2));
      } else {
        let centerY = Math.round((rngH - imgH) / 2);
        rowOff = centerY;
        for (let ry = im.fromRow + 1; ry <= im.toRow && rowOff >= rowEMU(ry); ry++) {
          rowOff -= rowEMU(ry); aRow++;
        }
      }

      drawXml += '<xdr:oneCellAnchor>';
      drawXml += '<xdr:from><xdr:col>' + aCol + '</xdr:col><xdr:colOff>' + colOff + '</xdr:colOff><xdr:row>' + aRow + '</xdr:row><xdr:rowOff>' + rowOff + '</xdr:rowOff></xdr:from>';
      drawXml += '<xdr:ext cx="' + imgW + '" cy="' + imgH + '"/>';
      drawXml += '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + (di + 2) + '" name="Img' + (di + 1) + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>';
      drawXml += '<xdr:blipFill><a:blip r:embed="' + rId + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>';
      drawXml += '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>';
      drawXml += '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor>\n';
    }
    drawXml += '</xdr:wsDr>';
    zip.file('xl/drawings/drawing1.xml', drawXml);

    // 5) drawing1.xml.rels
    let drawRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    drawRels += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n';
    for (let ri = 0; ri < imgList.length; ri++) {
      drawRels += '<Relationship Id="rId' + (ri + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + imgList[ri].name + '"/>\n';
    }
    drawRels += '</Relationships>';
    zip.file('xl/drawings/_rels/drawing1.xml.rels', drawRels);

    // 6) sheet1.xml.rels
    const sheetRelsPath = 'xl/worksheets/_rels/sheet1.xml.rels';
    const sheetRelsFile = zip.file(sheetRelsPath);
    let sheetRels;
    if (sheetRelsFile) {
      sheetRels = await sheetRelsFile.async('string');
      if (!sheetRels.includes('drawing1.xml')) {
        sheetRels = sheetRels.replace('</Relationships>', '<Relationship Id="rIdDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
      }
    } else {
      sheetRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
    }
    zip.file(sheetRelsPath, sheetRels);

    // 7) Add <drawing> reference to sheet1.xml
    if (!sheetXml.includes('<drawing ') && !sheetXml.includes('<drawing>')) {
      if (!sheetXml.includes('xmlns:r=')) {
        sheetXml = sheetXml.replace(/<worksheet([^>]*)>/, '<worksheet$1 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
      }
      sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rIdDrawing"/></worksheet>');
    }
  }

  // Save modified sheet
  zip.file('xl/worksheets/sheet1.xml', sheetXml);

  // Generate output buffer
  const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
  return outBuf;
}
