import { YELLOW_TIME } from '../styles/colors';

/**
 * 옵셋 자동 최적화
 * 정방향/역방향/양방향 각 시나리오별 상위 3개 = 총 9개 추천
 * "대역폭(bandwidth)" = 한 주기 중 차량이 출발해서 모든 교차로를 녹색으로 통과할 수 있는 시간(초)
 */

function scoreFwd(intersections, offsets, speedMps) {
  const cycle = intersections[0].cycle;
  const n = intersections.length;
  let count = 0;
  const step = 0.5; // 0.5초 해상도
  for (let t0 = 0; t0 < cycle; t0 += step) {
    let ok = true;
    for (let i = 0; i < n; i++) {
      const arrive = t0 + intersections[i].distance / speedMps;
      const phase = (((arrive - offsets[i]) % cycle) + cycle) % cycle;
      if (phase >= intersections[i].green) { ok = false; break; }
    }
    if (ok) count += step;
  }
  return Math.round(count * 10) / 10;
}

function scoreRev(intersections, offsets, speedMps, maxDist) {
  const cycle = intersections[0].cycle;
  const n = intersections.length;
  let count = 0;
  const step = 0.5;
  for (let t0 = 0; t0 < cycle; t0 += step) {
    let ok = true;
    for (let i = n - 1; i >= 0; i--) {
      const arrive = t0 + (maxDist - intersections[i].distance) / speedMps;
      const phase = (((arrive - offsets[i]) % cycle) + cycle) % cycle;
      if (phase >= intersections[i].green) { ok = false; break; }
    }
    if (ok) count += step;
  }
  return Math.round(count * 10) / 10;
}

// 중복 옵셋 배열 제거
function dedup(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const key = item.offsets.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function optimize(intersections, speed) {
  const cycle = intersections[0].cycle;
  const speedMps = speed * 1000 / 3600;
  const maxDist = Math.max(...intersections.map(i => i.distance));

  const candidates = [];

  for (let base = 0; base < cycle; base++) {
    const fwdOffsets = intersections.map(inter => {
      const travel = inter.distance / speedMps;
      return Math.round(((base + travel) % cycle + cycle) % cycle);
    });

    const revOffsets = intersections.map(inter => {
      const travel = (maxDist - inter.distance) / speedMps;
      return Math.round(((base + travel) % cycle + cycle) % cycle);
    });

    candidates.push({ offsets: fwdOffsets, src: 'fwd' });
    candidates.push({ offsets: revOffsets, src: 'rev' });

    // 균형 탐색: 정방향/역방향 보간 (25%, 50%, 75%)
    for (const w of [0.25, 0.5, 0.75]) {
      const blended = intersections.map((inter, i) => {
        const diff = ((revOffsets[i] - fwdOffsets[i]) % cycle + cycle) % cycle;
        return Math.round((fwdOffsets[i] + diff * w) % cycle);
      });
      candidates.push({ offsets: blended, src: 'blend' });
    }
  }

  const scored = candidates.map(c => {
    const fwd = scoreFwd(intersections, c.offsets, speedMps);
    const rev = scoreRev(intersections, c.offsets, speedMps, maxDist);
    return { ...c, fwd, rev, total: fwd + rev };
  });

  const topFwd = dedup([...scored].sort((a, b) => b.fwd - a.fwd || b.total - a.total)).slice(0, 3);
  const topRev = dedup([...scored].sort((a, b) => b.rev - a.rev || b.total - a.total)).slice(0, 3);
  const topBal = dedup([...scored].sort((a, b) => b.total - a.total || Math.min(b.fwd, b.rev) - Math.min(a.fwd, a.rev))).slice(0, 3);

  return {
    speed,
    scenarios: [
      { label: '정방향 최적', items: topFwd.map((r, i) => ({ rank: i + 1, offsets: r.offsets, fwd: r.fwd, rev: r.rev })) },
      { label: '역방향 최적', items: topRev.map((r, i) => ({ rank: i + 1, offsets: r.offsets, fwd: r.fwd, rev: r.rev })) },
      { label: '양방향 균형', items: topBal.map((r, i) => ({ rank: i + 1, offsets: r.offsets, fwd: r.fwd, rev: r.rev })) },
    ],
  };
}
