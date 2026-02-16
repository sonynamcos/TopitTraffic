import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

// DAT parser constants
const DAT_MFR_NAME = 0x395a;

function detectManufacturer(buffer) {
  const u8 = new Uint8Array(buffer);
  let name = '';
  for (let i = DAT_MFR_NAME; i < DAT_MFR_NAME + 20 && u8[i]; i++) {
    name += String.fromCharCode(u8[i]);
  }
  if (name.includes('SUHDOL') || name.includes('suhdol')) return '서돌전자';
  if (!name.trim()) return '한진이엔씨';
  if (name.includes('LCsim') || name.includes('LCSIM')) return 'LCsim';
  return name.trim() || 'unknown';
}

function parseDatPlans(buffer) {
  const u8 = new Uint8Array(buffer);
  const plans = [];
  const seenCycles = new Set();

  for (let p = 0; p < 10; p++) {
    for (let e = 0; e < 8; e++) {
      const off = p * 160 + e * 20;
      const cycle = u8[off + 2];
      const offset = u8[off + 3];
      if (cycle === 0) continue;

      const key = `${cycle}_${offset}`;
      if (seenCycles.has(key)) continue;
      seenCycles.add(key);

      const splits = [];
      let rawSum = 0;
      for (let ph = 0; ph < 8; ph++) {
        const v1 = u8[off + 4 + ph * 2];
        const v2 = u8[off + 5 + ph * 2];
        rawSum += v1 + v2;
        if (v1 > 0) splits.push(v1);
      }

      plans.push({ plan: p, cycle, offset, splits, valid: rawSum === cycle * 2 });
    }
  }
  return plans;
}

function countPhases(buffer) {
  const u8 = new Uint8Array(buffer);
  const RING_A = 0x0e2a;
  let count = 0;
  for (let s = 0; s < 32; s++) {
    const off = RING_A + s * 19;
    if (u8[off + 18] === 1) count++;
  }
  return count;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    );

    // Parse multipart form data manually
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Extract boundary from content-type
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    const boundary = boundaryMatch[1];
    const parts = parseMultipart(body, boundary);

    const filePart = parts.find(p => p.name === 'file');
    const namePart = parts.find(p => p.name === 'name');
    const existingIdPart = parts.find(p => p.name === 'existingId');

    if (!filePart || !namePart) {
      return res.status(400).json({ error: 'DAT 파일과 교차로명이 필요합니다.' });
    }

    const datBuffer = filePart.data;
    const name = namePart.data.toString('utf8').trim();
    const existingId = existingIdPart?.data.toString('utf8').trim();

    // Parse DAT
    const arrayBuf = datBuffer.buffer.slice(datBuffer.byteOffset, datBuffer.byteOffset + datBuffer.byteLength);
    const manufacturer = detectManufacturer(arrayBuf);
    const plans = parseDatPlans(arrayBuf);
    const phases = countPhases(arrayBuf);
    const isHanjin = manufacturer === '한진이엔씨';
    const today = new Date().toISOString().split('T')[0];
    const datFilename = `${name}.dat`;

    let useId;

    if (existingId) {
      // Re-upload: update existing intersection
      useId = parseInt(existingId);

      await supabase
        .from('intersections')
        .update({
          manufacturer,
          has_dat: true,
          dat_phases: phases,
          dat_cycle: plans[0]?.cycle || 0,
          dat: {
            filename: datFilename,
            original_filename: filePart.filename,
            size: datBuffer.length,
            manufacturer_detected: manufacturer,
            phases,
            plans,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', useId);

      await supabase.from('intersection_history').insert({
        intersection_id: useId,
        date: today,
        action: 'DAT 재업로드 (요도에서)',
        by: 'web',
      });

    } else {
      // New registration
      const { data: inserted, error: insertErr } = await supabase
        .from('intersections')
        .insert({
          name,
          manufacturer,
          has_dat: true,
          has_cycle_table: false,
          dat_phases: phases,
          dat_cycle: plans[0]?.cycle || 0,
          dat: {
            filename: datFilename,
            original_filename: filePart.filename,
            size: datBuffer.length,
            manufacturer_detected: manufacturer,
            phases,
            plans,
          },
          status: '정상',
        })
        .select('id')
        .single();

      if (insertErr) throw new Error(insertErr.message);
      useId = inserted.id;

      await supabase.from('intersection_history').insert({
        intersection_id: useId,
        date: today,
        action: 'DAT 업로드 및 자동 등록 (요도에서)',
        by: 'web',
      });
    }

    // Upload DAT file to storage (ASCII-safe path)
    await supabase.storage
      .from('dat-files')
      .upload(`${useId}/data.dat`, datBuffer, {
        contentType: 'application/octet-stream',
        upsert: true,
      });

    let cycleMessage = null;
    if (isHanjin) {
      cycleMessage = '한진은 주기표를 작성하지 못합니다.';
    } else {
      cycleMessage = '주기표 생성은 향후 지원 예정입니다.';
    }

    res.status(200).json({
      ok: true,
      id: String(useId),
      name,
      manufacturer,
      isHanjin,
      phases,
      plans: plans.length,
      cycleTable: false,
      cycleMessage,
    });
  } catch (err) {
    console.error('dat-register error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Simple multipart parser
function parseMultipart(body, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const endBuf = Buffer.from(`--${boundary}--`);

  let start = body.indexOf(boundaryBuf) + boundaryBuf.length;

  while (start < body.length) {
    const end = body.indexOf(boundaryBuf, start);
    if (end === -1) break;

    const partData = body.slice(start, end);
    const headerEnd = partData.indexOf('\r\n\r\n');
    if (headerEnd === -1) { start = end + boundaryBuf.length; continue; }

    const headerStr = partData.slice(0, headerEnd).toString('utf8');
    const data = partData.slice(headerEnd + 4, partData.length - 2); // trim trailing \r\n

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch?.[1],
        data,
      });
    }

    start = end + boundaryBuf.length;
  }

  return parts;
}
