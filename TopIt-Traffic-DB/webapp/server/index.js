import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { buildDatInfo, analyzePhases, extractPeriods } from './dat-parser.js';
import { generateCycleTable } from './cycle-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_ROOT = path.resolve(__dirname, '../../보령시_신호DB');

const app = express();
app.use(cors());
app.use(express.json());

// ── 헬퍼 ──

async function readJson(filepath) {
  const data = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(data);
}

async function writeJson(filepath, data) {
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function getIntersectionDir(id) {
  // id → master.json에서 name 찾아서 폴더명 결정
  return null; // findIntersectionDir에서 처리
}

async function findIntersectionDir(id) {
  const masterPath = path.join(DB_ROOT, 'master.json');
  const master = await readJson(masterPath);
  const entry = master.intersections.find(i => i.id === id);
  if (!entry) return null;

  const dirPath = path.join(DB_ROOT, '교차로', entry.name);
  try {
    await fs.access(dirPath);
    return { dirPath, entry };
  } catch {
    // 폴더명이 safe_dirname 처리된 경우 대비
    const dirs = await fs.readdir(path.join(DB_ROOT, '교차로'));
    for (const dir of dirs) {
      const infoPath = path.join(DB_ROOT, '교차로', dir, 'info.json');
      try {
        const info = await readJson(infoPath);
        if (info.id === id) {
          return { dirPath: path.join(DB_ROOT, '교차로', dir), entry };
        }
      } catch { /* skip */ }
    }
    return null;
  }
}

// ── API 엔드포인트 ──

// GET /api/intersections - 전체 교차로 목록 (검색/필터 지원)
app.get('/api/intersections', async (req, res) => {
  try {
    const master = await readJson(path.join(DB_ROOT, 'master.json'));
    let results = master.intersections;

    // 검색
    const q = req.query.q?.toLowerCase();
    if (q) {
      results = results.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
      );
    }

    // 필터: manufacturer
    if (req.query.manufacturer) {
      results = results.filter(i => i.manufacturer === req.query.manufacturer);
    }

    // 필터: status
    if (req.query.status) {
      results = results.filter(i => i.status === req.query.status);
    }

    // 필터: has_dat
    if (req.query.has_dat !== undefined) {
      const val = req.query.has_dat === 'true';
      results = results.filter(i => i.has_dat === val);
    }

    // 필터: has_cycle_table
    if (req.query.has_cycle_table !== undefined) {
      const val = req.query.has_cycle_table === 'true';
      results = results.filter(i => i.has_cycle_table === val);
    }

    res.json({
      total: results.length,
      intersections: results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intersection/:id - 교차로 상세 (info.json)
app.get('/api/intersection/:id', async (req, res) => {
  try {
    const found = await findIntersectionDir(req.params.id);
    if (!found) {
      return res.status(404).json({ error: '교차로를 찾을 수 없습니다.' });
    }

    const info = await readJson(path.join(found.dirPath, 'info.json'));

    // 기존 데이터에 valid 필드 없으면 동적 계산
    // Python: 단일값 저장 (sum == cycle), 구 JS: 이중값 저장 (sum == cycle*2)
    if (info.dat?.plans) {
      for (const plan of info.dat.plans) {
        if (plan.valid === undefined) {
          const sum = (plan.splits || []).reduce((a, b) => a + b, 0);
          plan.valid = sum === plan.cycle || sum === plan.cycle * 2;
        }
      }
    }

    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/file/:id/:type - DAT/주기표 파일 다운로드
app.get('/api/file/:id/:type', async (req, res) => {
  try {
    const found = await findIntersectionDir(req.params.id);
    if (!found) {
      return res.status(404).json({ error: '교차로를 찾을 수 없습니다.' });
    }

    const info = await readJson(path.join(found.dirPath, 'info.json'));
    let filename;

    if (req.params.type === 'dat') {
      filename = info.dat?.filename;
    } else if (req.params.type === 'cycle') {
      filename = info.cycle_table?.filename;
    }

    if (!filename) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    const filepath = path.join(found.dirPath, filename);
    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
    }

    res.download(filepath, filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/intersection/:id - info.json 업데이트
app.put('/api/intersection/:id', async (req, res) => {
  try {
    const found = await findIntersectionDir(req.params.id);
    if (!found) {
      return res.status(404).json({ error: '교차로를 찾을 수 없습니다.' });
    }

    const infoPath = path.join(found.dirPath, 'info.json');
    const existing = await readJson(infoPath);

    // 업데이트 가능 필드 + 변경 추적
    const updatable = ['alias', 'status', 'notes', 'routes', 'location', 'controller_model'];
    const changes = [];
    for (const key of updatable) {
      if (req.body[key] !== undefined) {
        const before = existing[key];
        const after = req.body[key];
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          changes.push({ field: key, before, after });
        }
        existing[key] = after;
      }
    }

    // 히스토리 추가 (변경 내용 포함)
    existing.history = existing.history || [];
    if (req.body._history_entry) {
      existing.history.unshift({
        date: new Date().toISOString().split('T')[0],
        ...req.body._history_entry,
        changes: changes.length > 0 ? changes : undefined,
      });
    } else if (changes.length > 0) {
      existing.history.unshift({
        date: new Date().toISOString().split('T')[0],
        action: `필드 수정: ${changes.map(c => c.field).join(', ')}`,
        by: 'web',
        changes,
      });
    }

    await writeJson(infoPath, existing);

    // master.json도 동기화
    await syncMaster(existing);

    res.json(existing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function syncMaster(updatedInfo) {
  const masterPath = path.join(DB_ROOT, 'master.json');
  const master = await readJson(masterPath);
  const idx = master.intersections.findIndex(i => i.id === updatedInfo.id);
  if (idx >= 0) {
    master.intersections[idx].status = updatedInfo.status;
    master.intersections[idx].route = updatedInfo.routes?.[0] || '';
    await writeJson(masterPath, master);
  }
}

// GET /api/routes - 요도 데이터
app.get('/api/routes', async (req, res) => {
  try {
    const routesPath = path.join(DB_ROOT, '요도', 'routes.json');
    try {
      const routes = await readJson(routesPath);
      res.json(routes);
    } catch {
      // 아직 routes.json 없으면 빈 그래프 반환
      res.json({ version: '2.0', format: 'graph', nodes: [], edges: [] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/routes - 요도 데이터 저장
app.put('/api/routes', async (req, res) => {
  try {
    const routesPath = path.join(DB_ROOT, '요도', 'routes.json');
    await writeJson(routesPath, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats - 통계
app.get('/api/stats', async (req, res) => {
  try {
    const master = await readJson(path.join(DB_ROOT, 'master.json'));
    const items = master.intersections;

    const manufacturers = {};
    const statuses = {};
    let hasDat = 0;
    let hasCycle = 0;
    let hasBoth = 0;

    for (const item of items) {
      manufacturers[item.manufacturer] = (manufacturers[item.manufacturer] || 0) + 1;
      statuses[item.status] = (statuses[item.status] || 0) + 1;
      if (item.has_dat) hasDat++;
      if (item.has_cycle_table) hasCycle++;
      if (item.has_dat && item.has_cycle_table) hasBoth++;
    }

    res.json({
      total: items.length,
      has_dat: hasDat,
      has_cycle_table: hasCycle,
      has_both: hasBoth,
      dat_coverage: items.length > 0 ? (hasDat / items.length * 100).toFixed(1) : 0,
      cycle_coverage: items.length > 0 ? (hasCycle / items.length * 100).toFixed(1) : 0,
      manufacturers,
      statuses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload/:id - 파일 업로드
const upload = multer({ dest: path.join(DB_ROOT, '_uploads') });

app.post('/api/upload/:id', upload.single('file'), async (req, res) => {
  try {
    const found = await findIntersectionDir(req.params.id);
    if (!found || !req.file) {
      return res.status(400).json({ error: '업로드 실패' });
    }

    // Fix multer latin1 → UTF-8 filename
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const fileType = req.body.type; // 'dat' or 'cycle'
    const info = await readJson(path.join(found.dirPath, 'info.json'));
    const ext = path.extname(req.file.originalname);
    let destName;

    if (fileType === 'dat') {
      destName = `${info.name}.dat`;
    } else {
      destName = `${info.name}_주기표${ext}`;
    }

    const destPath = path.join(found.dirPath, destName);
    await fs.rename(req.file.path, destPath);

    // info.json 업데이트
    if (fileType === 'dat') {
      info.dat = info.dat || {};
      info.dat.filename = destName;
    } else {
      info.cycle_table = info.cycle_table || {};
      info.cycle_table.filename = destName;
    }

    info.history = info.history || [];
    info.history.unshift({
      date: new Date().toISOString().split('T')[0],
      action: `${fileType === 'dat' ? 'DAT' : '주기표'} 파일 업로드: ${req.file.originalname}`,
      by: 'web',
    });

    await writeJson(path.join(found.dirPath, 'info.json'), info);
    await syncMaster(info);

    res.json({ ok: true, filename: destName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compare/:id1/:id2 - 두 교차로 DAT 비교
app.get('/api/compare/:id1/:id2', async (req, res) => {
  try {
    const [f1, f2] = await Promise.all([
      findIntersectionDir(req.params.id1),
      findIntersectionDir(req.params.id2),
    ]);

    if (!f1) return res.status(404).json({ error: `${req.params.id1}을(를) 찾을 수 없습니다.` });
    if (!f2) return res.status(404).json({ error: `${req.params.id2}을(를) 찾을 수 없습니다.` });

    const [info1, info2] = await Promise.all([
      readJson(path.join(f1.dirPath, 'info.json')),
      readJson(path.join(f2.dirPath, 'info.json')),
    ]);

    // Compute diffs
    const diffs = [];
    const fields = [
      ['manufacturer', '제조사'],
      ['type', '유형'],
      ['status', '상태'],
    ];
    for (const [key, label] of fields) {
      if (info1[key] !== info2[key]) {
        diffs.push({ field: label, a: info1[key] || '-', b: info2[key] || '-' });
      }
    }

    // DAT-level diffs
    const d1 = info1.dat || {};
    const d2 = info2.dat || {};
    const datFields = [
      ['format', '포맷'],
      ['phases', '현시 수'],
      ['phone', '전화번호'],
      ['date_modified', '수정일'],
    ];
    for (const [key, label] of datFields) {
      const v1 = d1[key] ?? '-';
      const v2 = d2[key] ?? '-';
      if (String(v1) !== String(v2)) {
        diffs.push({ field: `DAT ${label}`, a: String(v1), b: String(v2) });
      }
    }

    // Plan diffs
    const maxPlans = Math.max(d1.plans?.length || 0, d2.plans?.length || 0);
    const planDiffs = [];
    for (let i = 0; i < maxPlans; i++) {
      const p1 = d1.plans?.[i];
      const p2 = d2.plans?.[i];
      const diff = { plan: i };
      let hasDiff = false;

      if (!p1 || !p2) {
        diff.onlyIn = p1 ? 'a' : 'b';
        hasDiff = true;
      } else {
        if (p1.cycle !== p2.cycle) { diff.cycle = [p1.cycle, p2.cycle]; hasDiff = true; }
        if (p1.offset !== p2.offset) { diff.offset = [p1.offset, p2.offset]; hasDiff = true; }
        const maxSplits = Math.max(p1.splits?.length || 0, p2.splits?.length || 0);
        const splitDiffs = [];
        for (let j = 0; j < maxSplits; j++) {
          const s1 = p1.splits?.[j] ?? null;
          const s2 = p2.splits?.[j] ?? null;
          if (s1 !== s2) splitDiffs.push({ phase: j, a: s1, b: s2 });
        }
        if (splitDiffs.length) { diff.splits = splitDiffs; hasDiff = true; }
      }
      if (hasDiff) planDiffs.push(diff);
    }

    // LSU diffs
    const lsuDiffs = [];
    const maxLsu = Math.max(d1.lsu_types?.length || 0, d2.lsu_types?.length || 0);
    for (let i = 0; i < maxLsu; i++) {
      const t1 = d1.lsu_types?.[i] ?? '-';
      const t2 = d2.lsu_types?.[i] ?? '-';
      const a1 = d1.lsu_active?.[i] ?? false;
      const a2 = d2.lsu_active?.[i] ?? false;
      if (t1 !== t2 || a1 !== a2) {
        lsuDiffs.push({ index: i, type: [t1, t2], active: [a1, a2] });
      }
    }

    res.json({
      a: info1,
      b: info2,
      diffs,
      planDiffs,
      lsuDiffs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/replacements - 한진→서돌 교체 대상 목록
app.get('/api/replacements', async (req, res) => {
  try {
    const master = await readJson(path.join(DB_ROOT, 'master.json'));
    const targets = master.intersections.filter(i =>
      i.manufacturer === '한진이엔씨' || i.manufacturer === 'unknown'
    );

    // 각 교차로의 교체 상태 읽기
    const results = await Promise.all(targets.map(async (entry) => {
      try {
        const found = await findIntersectionDir(entry.id);
        if (!found) return { ...entry, replacement: null };
        const info = await readJson(path.join(found.dirPath, 'info.json'));
        return {
          ...entry,
          replacement: info.replacement || null,
          notes: info.notes || '',
        };
      } catch {
        return { ...entry, replacement: null };
      }
    }));

    // 통계
    const stats = {
      total: results.length,
      not_started: results.filter(r => !r.replacement?.status).length,
      in_progress: results.filter(r => r.replacement?.status === '진행중').length,
      completed: results.filter(r => r.replacement?.status === '완료').length,
    };

    res.json({ targets: results, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/intersection/:id/replacement - 교체 상태 업데이트
app.put('/api/intersection/:id/replacement', async (req, res) => {
  try {
    const found = await findIntersectionDir(req.params.id);
    if (!found) {
      return res.status(404).json({ error: '교차로를 찾을 수 없습니다.' });
    }

    const infoPath = path.join(found.dirPath, 'info.json');
    const info = await readJson(infoPath);

    info.replacement = {
      ...info.replacement,
      ...req.body,
      updated: new Date().toISOString().split('T')[0],
    };

    // 교체 완료 시 제조사 업데이트
    if (req.body.status === '완료') {
      info.manufacturer = '서돌전자';
    }

    // 히스토리 추가
    info.history = info.history || [];
    info.history.unshift({
      date: new Date().toISOString().split('T')[0],
      action: `교체 상태 변경: ${req.body.status || '업데이트'}`,
      by: 'web',
    });

    await writeJson(infoPath, info);
    await syncMaster(info);

    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dat-register - DAT 업로드 → 파싱 → DB 등록 → 주기표 자동 생성
app.post('/api/dat-register', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'DAT 파일이 필요합니다.' });
    }

    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({ error: '교차로명이 필요합니다.' });
    }

    // Fix multer latin1 → UTF-8 filename
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    // Read uploaded DAT file
    const datBuffer = await fs.readFile(req.file.path);
    const arrayBuf = datBuffer.buffer.slice(datBuffer.byteOffset, datBuffer.byteOffset + datBuffer.byteLength);

    // Parse DAT
    const datInfo = buildDatInfo(arrayBuf, `${name}.dat`);
    const manufacturer = datInfo.manufacturer_detected;
    const isHanjin = manufacturer === '한진이엔씨';

    const existingId = req.body.existingId?.trim();
    const masterPath = path.join(DB_ROOT, 'master.json');
    const master = await readJson(masterPath);
    const today = new Date().toISOString().split('T')[0];
    const dirPath = path.join(DB_ROOT, '교차로', name);
    const datFilename = `${name}.dat`;

    let useId;

    if (existingId && master.intersections.find(i => i.id === existingId)) {
      // ── 재업로드: 기존 교차로 업데이트 ──
      useId = existingId;

      await fs.mkdir(dirPath, { recursive: true });
      await fs.copyFile(req.file.path, path.join(dirPath, datFilename));

      // 기존 info.json 읽기
      const infoPath = path.join(dirPath, 'info.json');
      let info;
      try { info = await readJson(infoPath); } catch { info = {}; }

      // DAT 정보 업데이트
      info.manufacturer = manufacturer;
      info.dat = {
        filename: datFilename,
        original_filename: req.file.originalname,
        size: datBuffer.length,
        manufacturer_detected: manufacturer,
        phases: datInfo.phases,
        plans: datInfo.plans,
      };
      if (!info.history) info.history = [];
      info.history.unshift({ date: today, action: 'DAT 재업로드 (요도에서)', by: 'web' });

      // 주기표 재생성
      let cycleMessage = null;
      if (isHanjin) {
        cycleMessage = '한진은 주기표를 작성하지 못합니다.';
      } else {
        try {
          const phases = datInfo.analyzedPhases;
          const periods = datInfo.periods;
          if (phases.length > 0) {
            const xlsxBuf = await generateCycleTable(name, phases, periods, datInfo);
            const cycleFilename = `${name}_주기표.xlsx`;
            await fs.writeFile(path.join(dirPath, cycleFilename), xlsxBuf);
            info.cycle_table = { filename: cycleFilename };
            info.history.unshift({ date: today, action: '주기표 재생성', by: 'system' });
            cycleMessage = '주기표가 재생성되었습니다.';
          } else {
            cycleMessage = '현시 정보가 없어 주기표를 생성하지 못했습니다.';
          }
        } catch (e) {
          cycleMessage = `주기표 생성 실패: ${e.message}`;
          console.error('Cycle table generation error:', e);
        }
      }

      await writeJson(infoPath, info);

      // master.json 업데이트
      const idx = master.intersections.findIndex(i => i.id === existingId);
      if (idx >= 0) {
        master.intersections[idx].manufacturer = manufacturer;
        master.intersections[idx].has_dat = true;
        master.intersections[idx].has_cycle_table = !!info.cycle_table;
        master.intersections[idx].phases = datInfo.phases;
        master.intersections[idx].cycle = datInfo.plans?.[0]?.cycle || 0;
        await writeJson(masterPath, master);
      }

      try { await fs.unlink(req.file.path); } catch { /* ignore */ }

      res.json({
        ok: true,
        id: useId,
        name,
        manufacturer,
        isHanjin,
        phases: datInfo.phases,
        plans: datInfo.plans?.length || 0,
        cycleTable: !!info.cycle_table,
        cycleMessage,
      });

    } else {
      // ── 신규 등록 ──
      const maxNum = master.intersections.reduce((max, i) => {
        const num = parseInt(i.id);
        return !isNaN(num) ? Math.max(max, num) : max;
      }, 0);
      useId = String(maxNum + 1);

      await fs.mkdir(dirPath, { recursive: true });
      await fs.copyFile(req.file.path, path.join(dirPath, datFilename));

      const info = {
        id: useId,
        name,
        alias: [],
        type: '',
        manufacturer,
        controller_model: '',
        dat: {
          filename: datFilename,
          original_filename: req.file.originalname,
          size: datBuffer.length,
          manufacturer_detected: manufacturer,
          phases: datInfo.phases,
          plans: datInfo.plans,
        },
        cycle_table: null,
        location: { lat: null, lng: null, address: '' },
        routes: [],
        status: '정상',
        notes: '',
        history: [
          { date: today, action: `DAT 업로드 및 자동 등록 (요도에서)`, by: 'web' },
        ],
      };

      let cycleMessage = null;
      if (isHanjin) {
        cycleMessage = '한진은 주기표를 작성하지 못합니다.';
      } else {
        try {
          const phases = datInfo.analyzedPhases;
          const periods = datInfo.periods;
          if (phases.length > 0) {
            const xlsxBuf = await generateCycleTable(name, phases, periods, datInfo);
            const cycleFilename = `${name}_주기표.xlsx`;
            await fs.writeFile(path.join(dirPath, cycleFilename), xlsxBuf);
            info.cycle_table = { filename: cycleFilename };
            info.history.unshift({ date: today, action: '주기표 자동 생성', by: 'system' });
            cycleMessage = '주기표가 자동 생성되었습니다.';
          } else {
            cycleMessage = '현시 정보가 없어 주기표를 생성하지 못했습니다.';
          }
        } catch (e) {
          cycleMessage = `주기표 생성 실패: ${e.message}`;
          console.error('Cycle table generation error:', e);
        }
      }

      await writeJson(path.join(dirPath, 'info.json'), info);

      master.intersections.push({
        id: useId,
        name,
        manufacturer,
        route: '',
        has_dat: true,
        has_cycle_table: !!info.cycle_table,
        status: '정상',
        phases: datInfo.phases,
        cycle: datInfo.plans?.[0]?.cycle || 0,
      });
      master.total = master.intersections.length;
      await writeJson(masterPath, master);

      try { await fs.unlink(req.file.path); } catch { /* ignore */ }

      res.json({
        ok: true,
        id: useId,
        name,
        manufacturer,
        isHanjin,
        phases: datInfo.phases,
        plans: datInfo.plans?.length || 0,
        cycleTable: !!info.cycle_table,
        cycleMessage,
      });
    }
  } catch (err) {
    // Clean up temp file on error
    if (req.file?.path) {
      try { await fs.unlink(req.file.path); } catch { /* ignore */ }
    }
    res.status(500).json({ error: err.message });
  }
});

// ── 서버 시작 ──
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API 서버 시작: http://localhost:${PORT}`);
  console.log(`DB 경로: ${DB_ROOT}`);
});
