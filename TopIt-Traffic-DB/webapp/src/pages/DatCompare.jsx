import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getIntersections, compareDat } from '../api/client';

export default function DatCompare() {
  const [list, setList] = useState([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getIntersections({ has_dat: 'true' }).then(data => {
      setList(data.intersections || []);
    });
  }, []);

  async function handleCompare() {
    if (!idA || !idB) return;
    if (idA === idB) { setError('서로 다른 교차로를 선택하세요.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await compareDat(idA, idB);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="detail-header">
        <h2>DAT 파일 비교</h2>
      </div>

      {/* 선택 영역 */}
      <div className="card compare-selector">
        <div className="compare-row">
          <div className="compare-col">
            <label className="compare-label">A 교차로</label>
            <select
              className="filter-select compare-select"
              value={idA}
              onChange={e => { setIdA(e.target.value); setResult(null); }}
            >
              <option value="">-- 선택 --</option>
              {list.map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.id})</option>
              ))}
            </select>
          </div>
          <div className="compare-vs">VS</div>
          <div className="compare-col">
            <label className="compare-label">B 교차로</label>
            <select
              className="filter-select compare-select"
              value={idB}
              onChange={e => { setIdB(e.target.value); setResult(null); }}
            >
              <option value="">-- 선택 --</option>
              {list.map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.id})</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleCompare} disabled={!idA || !idB || loading}>
            {loading ? '비교 중...' : '비교'}
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ marginTop: 16, color: 'var(--red)' }}>{error}</div>}

      {result && <CompareResult result={result} />}
    </div>
  );
}

function CompareResult({ result }) {
  const { a, b, diffs, planDiffs, lsuDiffs } = result;
  const hasDiffs = diffs.length > 0 || planDiffs.length > 0 || lsuDiffs.length > 0;

  return (
    <div style={{ marginTop: 16 }}>
      {/* 요약 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">비교 요약</div>
        <div className="compare-summary">
          <SummaryCard info={a} label="A" />
          <div className="compare-summary-diff">
            {hasDiffs ? (
              <span className="badge badge-yellow">{diffs.length + planDiffs.length + lsuDiffs.length}건 차이</span>
            ) : (
              <span className="badge badge-green">동일</span>
            )}
          </div>
          <SummaryCard info={b} label="B" />
        </div>
      </div>

      {/* 기본 필드 차이 */}
      {diffs.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">기본 정보 차이</div>
          <table className="diff-table">
            <thead>
              <tr>
                <th>필드</th>
                <th className="diff-col-a">A: {a.name}</th>
                <th className="diff-col-b">B: {b.name}</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d, i) => (
                <tr key={i}>
                  <td className="diff-field">{d.field}</td>
                  <td className="diff-val-a">{d.a}</td>
                  <td className="diff-val-b">{d.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 타이밍 계획 비교 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">타이밍 계획 비교</div>
        {a.dat?.plans?.length > 0 || b.dat?.plans?.length > 0 ? (
          <PlanComparison plansA={a.dat?.plans || []} plansB={b.dat?.plans || []} planDiffs={planDiffs} nameA={a.name} nameB={b.name} />
        ) : (
          <div className="loading">타이밍 계획 데이터 없음</div>
        )}
      </div>

      {/* LSU 비교 */}
      {(a.dat?.lsu_types?.length > 0 || b.dat?.lsu_types?.length > 0) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">LSU 구성 비교</div>
          <LsuComparison a={a.dat} b={b.dat} lsuDiffs={lsuDiffs} nameA={a.name} nameB={b.name} />
        </div>
      )}

      {/* 상세 링크 */}
      <div className="btn-group">
        <Link to={`/intersection/${a.id}`} className="btn">A: {a.name} 상세</Link>
        <Link to={`/intersection/${b.id}`} className="btn">B: {b.name} 상세</Link>
      </div>
    </div>
  );
}

function SummaryCard({ info, label }) {
  const mfrClass = {
    '서돌전자': 'badge-blue', '서돌전자(추정)': 'badge-blue',
    '한진이엔씨': 'badge-yellow', 'LCsim': 'badge-gray',
  };

  return (
    <div className="compare-summary-card">
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, margin: '4px 0' }}>{info.name}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{info.id}</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge ${mfrClass[info.manufacturer] || 'badge-gray'}`}>{info.manufacturer}</span>
        {info.dat?.format && <span className="badge badge-gray">{info.dat.format}</span>}
      </div>
      <div style={{ fontSize: 13, marginTop: 8 }}>
        {info.dat?.phases || 0}현시 / {info.dat?.plans?.[0]?.cycle || '-'}초
      </div>
    </div>
  );
}

function PlanComparison({ plansA, plansB, planDiffs, nameA, nameB }) {
  const maxPlans = Math.max(plansA.length, plansB.length);
  const diffSet = new Set(planDiffs.map(d => d.plan));
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  return (
    <div>
      <table className="diff-table">
        <thead>
          <tr>
            <th>Plan</th>
            <th colSpan={3} className="diff-col-a">{nameA}</th>
            <th colSpan={3} className="diff-col-b">{nameB}</th>
            <th>상태</th>
          </tr>
          <tr>
            <th></th>
            <th>주기</th><th>옵셋</th><th>현시 분배</th>
            <th>주기</th><th>옵셋</th><th>현시 분배</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxPlans }, (_, i) => {
            const pa = plansA[i];
            const pb = plansB[i];
            const isDiff = diffSet.has(i);

            return (
              <tr key={i} className={isDiff ? 'diff-row' : ''}>
                <td style={{ fontWeight: 600 }}>Plan {i}</td>
                <td>{pa?.cycle ?? '-'}</td>
                <td>{pa?.offset ?? '-'}</td>
                <td>
                  {pa?.splits ? (
                    <span className="splits-inline">
                      {pa.splits.map((s, j) => (
                        <span key={j} style={{ background: `${colors[j % colors.length]}22`, color: colors[j % colors.length], padding: '1px 6px', borderRadius: 3, fontWeight: 600, fontSize: 12 }}>
                          {s}
                        </span>
                      ))}
                    </span>
                  ) : '-'}
                </td>
                <td>{pb?.cycle ?? '-'}</td>
                <td>{pb?.offset ?? '-'}</td>
                <td>
                  {pb?.splits ? (
                    <span className="splits-inline">
                      {pb.splits.map((s, j) => (
                        <span key={j} style={{ background: `${colors[j % colors.length]}22`, color: colors[j % colors.length], padding: '1px 6px', borderRadius: 3, fontWeight: 600, fontSize: 12 }}>
                          {s}
                        </span>
                      ))}
                    </span>
                  ) : '-'}
                </td>
                <td>
                  {isDiff ? <span className="badge badge-yellow">차이</span> : <span className="badge badge-green">동일</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Phase bar visual comparison */}
      {plansA[0]?.splits && plansB[0]?.splits && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Plan 0 현시 분배 비교</div>
          <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 500 }}>A: {nameA}</div>
          <PhasesBar splits={plansA[0].splits} />
          <div style={{ marginBottom: 4, marginTop: 8, fontSize: 12, fontWeight: 500 }}>B: {nameB}</div>
          <PhasesBar splits={plansB[0].splits} />
        </div>
      )}
    </div>
  );
}

function PhasesBar({ splits }) {
  if (!splits?.length) return null;
  const total = splits.reduce((a, b) => a + b, 0);
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  return (
    <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {splits.map((s, i) => (
        <div
          key={i}
          style={{
            width: `${(s / total) * 100}%`,
            background: colors[i % colors.length],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 11, fontWeight: 600, minWidth: 22,
          }}
          title={`현시 ${i + 1}: ${s}초`}
        >
          {s}s
        </div>
      ))}
    </div>
  );
}

function LsuComparison({ a, b, lsuDiffs, nameA, nameB }) {
  const diffIndexes = new Set(lsuDiffs.map(d => d.index));
  const maxLsu = Math.max(a?.lsu_types?.length || 0, b?.lsu_types?.length || 0);

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
        차이: {lsuDiffs.length}건 / 총 {maxLsu}개
      </div>
      <div className="detail-grid">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>A: {nameA}</div>
          <div className="lsu-grid">
            {Array.from({ length: a?.lsu_types?.length || 0 }, (_, i) => {
              const active = a?.lsu_active?.[i];
              const type = a?.lsu_types?.[i] || '-';
              const isDiff = diffIndexes.has(i);
              return (
                <div
                  key={i}
                  className={`lsu-item ${active ? 'active' : 'inactive'} ${isDiff ? 'lsu-diff' : ''}`}
                  title={`LSU ${i + 1}: ${type}`}
                >
                  <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
                    <div>{i + 1}</div>
                    <div style={{ fontSize: 8 }}>{type.replace('차량', 'V').replace('보행', 'P').replace('색', '')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>B: {nameB}</div>
          <div className="lsu-grid">
            {Array.from({ length: b?.lsu_types?.length || 0 }, (_, i) => {
              const active = b?.lsu_active?.[i];
              const type = b?.lsu_types?.[i] || '-';
              const isDiff = diffIndexes.has(i);
              return (
                <div
                  key={i}
                  className={`lsu-item ${active ? 'active' : 'inactive'} ${isDiff ? 'lsu-diff' : ''}`}
                  title={`LSU ${i + 1}: ${type}`}
                >
                  <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
                    <div>{i + 1}</div>
                    <div style={{ fontSize: 8 }}>{type.replace('차량', 'V').replace('보행', 'P').replace('색', '')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
