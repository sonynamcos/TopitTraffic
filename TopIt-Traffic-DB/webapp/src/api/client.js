const BASE = '/api';

async function fetchJson(url, options) {
  const res = await fetch(`${BASE}${url}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API 오류');
  }
  return res.json();
}

export function getIntersections(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`/intersections${qs ? '?' + qs : ''}`);
}

export function getIntersection(id) {
  return fetchJson(`/intersection/${id}`);
}

export function updateIntersection(id, data) {
  return fetchJson(`/intersection/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function getStats() {
  return fetchJson('/stats');
}

export function getRoutes() {
  return fetchJson('/routes');
}

export function saveRoutes(data) {
  return fetchJson('/routes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function getFileUrl(id, type) {
  return `${BASE}/file/${id}/${type}`;
}

// DAT 업로드 → 자동 등록 (existingId가 있으면 재업로드)
export async function registerDat(file, name, existingId) {
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  if (existingId) form.append('existingId', existingId);
  const res = await fetch(`${BASE}/dat-register`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'DAT 등록 실패');
  }
  return res.json();
}

// Phase 4: DAT 비교
export function compareDat(id1, id2) {
  return fetchJson(`/compare/${id1}/${id2}`);
}

// Phase 4: 교체 대상 목록
export function getReplacements() {
  return fetchJson('/replacements');
}

// Phase 4: 교체 상태 업데이트
export function updateReplacement(id, data) {
  return fetchJson(`/intersection/${id}/replacement`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
