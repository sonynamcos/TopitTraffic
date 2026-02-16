import { supabase } from '../lib/supabase';

// ── Intersections ──

export async function getIntersections(params = {}) {
  let query = supabase.from('intersections').select('id, name, manufacturer, status, has_dat, has_cycle_table, dat_phases, dat_cycle, routes, type');

  if (params.q) {
    const q = params.q.toLowerCase();
    query = query.or(`name.ilike.%${q}%,id.eq.${parseInt(q) || 0}`);
  }
  if (params.manufacturer) {
    query = query.eq('manufacturer', params.manufacturer);
  }
  if (params.has_dat !== undefined && params.has_dat !== '') {
    query = query.eq('has_dat', params.has_dat === 'true');
  }
  if (params.has_cycle_table !== undefined && params.has_cycle_table !== '') {
    query = query.eq('has_cycle_table', params.has_cycle_table === 'true');
  }

  const { data, error } = await query.order('id', { ascending: true });
  if (error) throw new Error(error.message);

  // Map to existing shape expected by components
  const intersections = data.map(row => ({
    id: String(row.id),
    name: row.name,
    manufacturer: row.manufacturer,
    status: row.status,
    has_dat: row.has_dat,
    has_cycle_table: row.has_cycle_table,
    phases: row.dat_phases,
    cycle: row.dat_cycle,
    routes: row.routes,
    type: row.type,
  }));

  return { total: intersections.length, intersections };
}

export async function getIntersection(id) {
  const { data, error } = await supabase
    .from('intersections')
    .select('*')
    .eq('id', parseInt(id))
    .single();
  if (error) throw new Error(error.message);

  // Fetch history
  const { data: history } = await supabase
    .from('intersection_history')
    .select('*')
    .eq('intersection_id', parseInt(id))
    .order('date', { ascending: false })
    .order('id', { ascending: false });

  // Compute valid for plans if missing
  if (data.dat?.plans) {
    for (const plan of data.dat.plans) {
      if (plan.valid === undefined) {
        const sum = (plan.splits || []).reduce((a, b) => a + b, 0);
        plan.valid = sum === plan.cycle || sum === plan.cycle * 2;
      }
    }
  }

  return {
    id: String(data.id),
    name: data.name,
    alias: data.alias || [],
    type: data.type,
    manufacturer: data.manufacturer,
    controller_model: data.controller_model,
    status: data.status,
    notes: data.notes,
    has_dat: data.has_dat,
    has_cycle_table: data.has_cycle_table,
    dat: data.dat,
    cycle_table: data.cycle_table,
    replacement: data.replacement,
    _classification: data.classification,
    routes: data.routes || [],
    location: { lat: data.lat, lng: data.lng, address: data.address },
    history: (history || []).map(h => ({
      date: h.date,
      action: h.action,
      by: h.by,
      changes: h.changes,
    })),
  };
}

export async function updateIntersection(id, body) {
  const numId = parseInt(id);
  const today = new Date().toISOString().split('T')[0];

  // Get current data for change tracking
  const { data: current } = await supabase
    .from('intersections')
    .select('status, notes')
    .eq('id', numId)
    .single();

  const updates = {};
  const changes = [];

  if (body.status !== undefined) {
    if (current && current.status !== body.status) {
      changes.push({ field: 'status', before: current.status, after: body.status });
    }
    updates.status = body.status;
  }
  if (body.notes !== undefined) {
    if (current && current.notes !== body.notes) {
      changes.push({ field: 'notes', before: current.notes, after: body.notes });
    }
    updates.notes = body.notes;
  }
  if (body.alias !== undefined) updates.alias = body.alias;
  if (body.routes !== undefined) updates.routes = body.routes;
  if (body.controller_model !== undefined) updates.controller_model = body.controller_model;

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('intersections')
    .update(updates)
    .eq('id', numId);
  if (error) throw new Error(error.message);

  // Add history entry
  const historyAction = body._history_entry?.action || (changes.length > 0 ? `필드 수정: ${changes.map(c => c.field).join(', ')}` : '업데이트');
  const historyBy = body._history_entry?.by || 'web';

  await supabase.from('intersection_history').insert({
    intersection_id: numId,
    date: today,
    action: historyAction,
    by: historyBy,
    changes: changes.length > 0 ? changes : null,
  });

  return getIntersection(id);
}

// ── Stats ──

export async function getStats() {
  const { data, error } = await supabase
    .from('intersections')
    .select('manufacturer, status, has_dat, has_cycle_table');
  if (error) throw new Error(error.message);

  const manufacturers = {};
  const statuses = {};
  let hasDat = 0, hasCycle = 0, hasBoth = 0;

  for (const item of data) {
    manufacturers[item.manufacturer] = (manufacturers[item.manufacturer] || 0) + 1;
    statuses[item.status] = (statuses[item.status] || 0) + 1;
    if (item.has_dat) hasDat++;
    if (item.has_cycle_table) hasCycle++;
    if (item.has_dat && item.has_cycle_table) hasBoth++;
  }

  const total = data.length;
  return {
    total,
    has_dat: hasDat,
    has_cycle_table: hasCycle,
    has_both: hasBoth,
    dat_coverage: total > 0 ? (hasDat / total * 100).toFixed(1) : 0,
    cycle_coverage: total > 0 ? (hasCycle / total * 100).toFixed(1) : 0,
    manufacturers,
    statuses,
  };
}

// ── Routes (요도) ──

export async function getRoutes() {
  const { data, error } = await supabase
    .from('route_diagram')
    .select('*')
    .order('id', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    // No data yet
    return { version: '2.0', format: 'graph', nodes: [], edges: [] };
  }

  return {
    version: '2.0',
    format: 'graph',
    nodes: data.nodes || [],
    edges: data.edges || [],
  };
}

export async function saveRoutes(graphData) {
  const { data: existing } = await supabase
    .from('route_diagram')
    .select('id')
    .order('id', { ascending: true })
    .limit(1)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('route_diagram')
      .update({
        nodes: graphData.nodes || [],
        edges: graphData.edges || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('route_diagram')
      .insert({
        nodes: graphData.nodes || [],
        edges: graphData.edges || [],
      });
    if (error) throw new Error(error.message);
  }

  return { ok: true };
}

// ── File URLs (Supabase Storage) ──

export function getStorageUrl(id, type) {
  const bucket = type === 'dat' ? 'dat-files' : 'cycle-tables';
  const filename = type === 'dat' ? 'data.dat' : 'cycle.xlsx';
  const { data } = supabase.storage.from(bucket).getPublicUrl(`${id}/${filename}`);
  return data?.publicUrl || null;
}

// ── DAT Register (Vercel Serverless) ──

export async function registerDat(file, name, existingId) {
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  if (existingId) form.append('existingId', existingId);

  const res = await fetch('/api/dat-register', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'DAT 등록 실패');
  }
  return res.json();
}

// ── DAT Compare (client-side) ──

export async function compareDat(id1, id2) {
  const [info1, info2] = await Promise.all([
    getIntersection(id1),
    getIntersection(id2),
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

  return { a: info1, b: info2, diffs, planDiffs, lsuDiffs };
}

// ── Replacements ──

export async function getReplacements() {
  const { data, error } = await supabase
    .from('intersections')
    .select('id, name, manufacturer, status, has_dat, has_cycle_table, replacement, notes, dat_phases, dat_cycle')
    .in('manufacturer', ['한진이엔씨', 'unknown']);
  if (error) throw new Error(error.message);

  const targets = data.map(row => ({
    id: String(row.id),
    name: row.name,
    manufacturer: row.manufacturer,
    status: row.status,
    has_dat: row.has_dat,
    has_cycle_table: row.has_cycle_table,
    replacement: row.replacement,
    notes: row.notes,
    phases: row.dat_phases,
    cycle: row.dat_cycle,
  }));

  const stats = {
    total: targets.length,
    not_started: targets.filter(r => !r.replacement?.status || r.replacement.status === '미시작').length,
    in_progress: targets.filter(r => r.replacement?.status === '진행중').length,
    completed: targets.filter(r => r.replacement?.status === '완료').length,
  };

  return { targets, stats };
}

export async function updateReplacement(id, body) {
  const numId = parseInt(id);
  const today = new Date().toISOString().split('T')[0];

  // Get current replacement
  const { data: current } = await supabase
    .from('intersections')
    .select('replacement, manufacturer')
    .eq('id', numId)
    .single();

  const replacement = {
    ...(current?.replacement || {}),
    ...body,
    updated: today,
  };

  const updates = { replacement, updated_at: new Date().toISOString() };

  // If completed, update manufacturer to 서돌전자
  if (body.status === '완료') {
    updates.manufacturer = '서돌전자';
  }

  const { error } = await supabase
    .from('intersections')
    .update(updates)
    .eq('id', numId);
  if (error) throw new Error(error.message);

  // Add history
  await supabase.from('intersection_history').insert({
    intersection_id: numId,
    date: today,
    action: `교체 상태 변경: ${body.status || '업데이트'}`,
    by: 'web',
  });

  return { ok: true };
}
