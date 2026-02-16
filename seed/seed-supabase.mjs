/**
 * 데이터 시딩 스크립트: 보령시_신호DB → Supabase
 *
 * 실행: node seed/seed-supabase.mjs
 *
 * 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수
 *       또는 .env.local 파일 (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
 */

import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dependency)
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
  console.error('Set them in .env.local or environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Path to existing DB
const DB_ROOT = path.resolve(__dirname, '..', 'TopIt-Traffic-DB', '보령시_신호DB');

async function readJson(filepath) {
  const data = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(data);
}

async function main() {
  console.log('=== 보령시 신호DB → Supabase 시딩 시작 ===');
  console.log(`DB 경로: ${DB_ROOT}`);

  // 1. Read master.json
  const masterPath = path.join(DB_ROOT, 'master.json');
  const master = await readJson(masterPath);
  console.log(`master.json: ${master.intersections.length}개 교차로`);

  // 2. Process each intersection
  const rows = [];
  const historyRows = [];
  let successCount = 0;
  let errorCount = 0;

  for (const entry of master.intersections) {
    try {
      // Try to read info.json
      const dirPath = path.join(DB_ROOT, '교차로', entry.name);
      let info;
      try {
        info = await readJson(path.join(dirPath, 'info.json'));
      } catch {
        // Fallback: use master entry only
        info = entry;
      }

      const numId = parseInt(entry.id);
      if (isNaN(numId)) {
        console.warn(`  [SKIP] 비정상 ID: ${entry.id} (${entry.name})`);
        errorCount++;
        continue;
      }

      const row = {
        id: numId,
        name: info.name || entry.name,
        alias: info.alias || [],
        type: info.type || '',
        manufacturer: info.manufacturer || entry.manufacturer || 'unknown',
        status: info.status || entry.status || '미확인',
        notes: info.notes || '',
        has_dat: info.has_dat ?? entry.has_dat ?? false,
        has_cycle_table: info.has_cycle_table ?? entry.has_cycle_table ?? false,
        dat_phases: info.dat?.phases || entry.phases || null,
        dat_cycle: info.dat?.plans?.[0]?.cycle || entry.cycle || null,
        dat: info.dat || null,
        cycle_table: info.cycle_table || null,
        replacement: info.replacement || null,
        classification: info._classification || null,
        lat: info.location?.lat || null,
        lng: info.location?.lng || null,
        address: info.location?.address || '',
        routes: info.routes || [],
        controller_model: info.controller_model || '',
      };

      // Validate plans
      if (row.dat?.plans) {
        for (const plan of row.dat.plans) {
          if (plan.valid === undefined) {
            const sum = (plan.splits || []).reduce((a, b) => a + b, 0);
            plan.valid = sum === plan.cycle || sum === plan.cycle * 2;
          }
        }
      }

      rows.push(row);

      // Process history
      if (info.history?.length > 0) {
        for (const h of info.history) {
          historyRows.push({
            intersection_id: numId,
            date: h.date || new Date().toISOString().split('T')[0],
            action: h.action || '',
            by: h.by || 'system',
            changes: h.changes || null,
          });
        }
      }

      successCount++;
    } catch (e) {
      console.warn(`  [ERROR] ${entry.name}: ${e.message}`);
      errorCount++;
    }
  }

  console.log(`\n파싱 완료: ${successCount}개 성공, ${errorCount}개 오류`);

  // 3. Reset sequence and upsert intersections
  console.log('\n교차로 데이터 삽입 중...');

  // Insert in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('intersections')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`  배치 ${i}~${i + batch.length} 오류: ${error.message}`);
    } else {
      console.log(`  배치 ${i}~${i + batch.length} 완료`);
    }
  }

  // Reset serial sequence to max+1
  const maxId = rows.reduce((max, r) => Math.max(max, r.id), 0);
  try {
    const { error: rpcErr } = await supabase.rpc('setval_intersections_id', { val: maxId });
    if (rpcErr) throw rpcErr;
  } catch {
    console.log(`  시퀀스 리셋은 수동으로 실행하세요: SELECT setval('intersections_id_seq', ${maxId});`);
  }

  // 4. Insert history
  if (historyRows.length > 0) {
    console.log(`\n히스토리 ${historyRows.length}건 삽입 중...`);
    for (let i = 0; i < historyRows.length; i += BATCH_SIZE) {
      const batch = historyRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('intersection_history')
        .insert(batch);

      if (error) {
        console.error(`  히스토리 배치 ${i} 오류: ${error.message}`);
      }
    }
    console.log('  히스토리 삽입 완료');
  }

  // 5. Seed route diagram
  console.log('\n요도 데이터 삽입 중...');
  try {
    const routesPath = path.join(DB_ROOT, '요도', 'routes.json');
    const routes = await readJson(routesPath);

    if (routes.nodes) {
      const { error } = await supabase
        .from('route_diagram')
        .upsert({
          id: 1,
          nodes: routes.nodes || [],
          edges: routes.edges || [],
        });

      if (error) {
        console.error(`  요도 오류: ${error.message}`);
      } else {
        console.log(`  요도: ${routes.nodes.length}개 노드, ${routes.edges.length}개 간선`);
      }
    }
  } catch (e) {
    console.log(`  요도 파일 없음 또는 오류: ${e.message}`);
  }

  console.log('\n=== 시딩 완료 ===');
  console.log(`총 ${successCount}개 교차로, ${historyRows.length}개 히스토리`);
  console.log('\n다음 단계:');
  console.log('  1. Supabase SQL Editor에서 시퀀스 리셋:');
  console.log(`     SELECT setval('intersections_id_seq', ${maxId});`);
  console.log('  2. DAT/주기표 파일 업로드: node seed/upload-files.mjs');
}

main().catch(e => {
  console.error('시딩 실패:', e);
  process.exit(1);
});
