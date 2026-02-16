/**
 * 파일 업로드 스크립트: DAT/주기표 파일 → Supabase Storage
 *
 * 실행: node seed/upload-files.mjs
 *
 * 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수
 *
 * Supabase Storage 버킷 사전 생성 필요:
 *   - dat-files (public)
 *   - cycle-tables (public)
 */

import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
async function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, '..', '.env.local');
    const content = await fs.readFile(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* no .env.local */ }
}

await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DB_ROOT = path.resolve(__dirname, '..', 'TopIt-Traffic-DB', '보령시_신호DB');

async function readJson(filepath) {
  const data = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(data);
}

async function main() {
  console.log('=== 파일 업로드 시작 ===');
  console.log(`DB 경로: ${DB_ROOT}`);

  const masterPath = path.join(DB_ROOT, 'master.json');
  const master = await readJson(masterPath);

  let datCount = 0, cycleCount = 0, errorCount = 0;

  for (const entry of master.intersections) {
    const dirPath = path.join(DB_ROOT, '교차로', entry.name);
    const numId = parseInt(entry.id);
    if (isNaN(numId)) continue;

    let info;
    try {
      info = await readJson(path.join(dirPath, 'info.json'));
    } catch {
      continue;
    }

    // Upload DAT file (ASCII-safe path: {id}/data.dat)
    if (info.dat?.filename) {
      const datPath = path.join(dirPath, info.dat.filename);
      try {
        const datBuf = await fs.readFile(datPath);
        const storagePath = `${numId}/data.dat`;

        const { error } = await supabase.storage
          .from('dat-files')
          .upload(storagePath, datBuf, {
            contentType: 'application/octet-stream',
            upsert: true,
          });

        if (error) {
          console.warn(`  [DAT ERROR] ${entry.name}: ${error.message}`);
          errorCount++;
        } else {
          datCount++;
        }
      } catch (e) {
        // File not found, skip
      }
    }

    // Upload cycle table (ASCII-safe path: {id}/cycle.xlsx)
    if (info.cycle_table?.filename) {
      const cyclePath = path.join(dirPath, info.cycle_table.filename);
      try {
        const cycleBuf = await fs.readFile(cyclePath);
        const storagePath = `${numId}/cycle.xlsx`;

        const { error } = await supabase.storage
          .from('cycle-tables')
          .upload(storagePath, cycleBuf, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            upsert: true,
          });

        if (error) {
          console.warn(`  [CYCLE ERROR] ${entry.name}: ${error.message}`);
          errorCount++;
        } else {
          cycleCount++;
        }
      } catch (e) {
        // File not found, skip
      }
    }

    // Progress
    if ((datCount + cycleCount) % 20 === 0) {
      process.stdout.write(`\r  DAT: ${datCount} / 주기표: ${cycleCount} / 오류: ${errorCount}`);
    }
  }

  console.log(`\n\n=== 업로드 완료 ===`);
  console.log(`DAT 파일: ${datCount}개`);
  console.log(`주기표: ${cycleCount}개`);
  console.log(`오류: ${errorCount}개`);
}

main().catch(e => {
  console.error('업로드 실패:', e);
  process.exit(1);
});
