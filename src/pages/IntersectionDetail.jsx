import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getIntersection, updateIntersection, getStorageUrl } from '../api/client';

export default function IntersectionDetail() {
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');

  useEffect(() => {
    getIntersection(id).then(data => {
      setInfo(data);
      setEditNotes(data.notes || '');
      setEditStatus(data.status || '정상');
    }).catch(e => setError(e.message));
  }, [id]);

  async function handleSave() {
    try {
      const updated = await updateIntersection(id, {
        notes: editNotes,
        status: editStatus,
        _history_entry: { action: `상태/메모 수정`, by: 'web' },
      });
      setInfo(updated);
      setEditing(false);
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  }

  if (error) return <div className="loading">오류: {error}</div>;
  if (!info) return <div className="loading">로딩 중...</div>;

  const dat = info.dat;
  const cycle = info.cycle_table;

  const datUrl = info.has_dat ? getStorageUrl(id, 'dat') : null;
  const cycleUrl = info.has_cycle_table ? getStorageUrl(id, 'cycle') : null;

  return (
    <div>
      <Link to="/list" className="back-link">&larr; 목록으로</Link>

      <div className="detail-header">
        <h2>{info.name}</h2>
        <span className="detail-id">{info.id}</span>
        <StatusBadge status={info.status} />
        <MfrBadge mfr={info.manufacturer} />
      </div>

      <div className="detail-grid">
        {/* 기본 정보 */}
        <div className="card">
          <div className="section-title">기본 정보</div>
          <InfoRow label="교차로명" value={info.name} />
          <InfoRow label="ID" value={info.id} />
          <InfoRow label="유형" value={info.type} />
          <InfoRow label="제조사" value={info.manufacturer} />
          <InfoRow label="제어기 모델" value={info.controller_model || '-'} />
          <InfoRow label="별칭" value={info.alias?.length > 0 ? info.alias.join(', ') : '-'} />
          <InfoRow label="노선" value={info.routes?.length > 0 ? info.routes.join(', ') : '-'} />

          <div className="btn-group">
            {datUrl && (
              <a href={datUrl} className="btn" download>
                DAT 다운로드
              </a>
            )}
            {cycleUrl && (
              <a href={cycleUrl} className="btn" download>
                주기표 다운로드
              </a>
            )}
          </div>
        </div>

        {/* DAT 정보 */}
        <div className="card">
          <div className="section-title">DAT 파일 정보</div>
          {dat ? (
            <>
              <InfoRow label="파일명" value={dat.filename || '-'} />
              <InfoRow label="원본 파일" value={dat.original_filename || '-'} />
              <InfoRow label="크기" value={dat.size ? `${dat.size.toLocaleString()} bytes` : '-'} />
              <InfoRow label="포맷" value={dat.format || '-'} />
              <InfoRow label="수정일" value={dat.date_modified || '-'} />
              <InfoRow label="전화번호" value={dat.phone || '-'} />
              <InfoRow label="현시 수" value={dat.phases || '-'} />
            </>
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>
              DAT 파일 없음
            </div>
          )}
        </div>
      </div>

      {/* 타이밍 계획 */}
      {dat?.plans?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">타이밍 계획</div>
          <table className="plan-table">
            <thead>
              <tr>
                <th>계획</th>
                <th>주기(초)</th>
                <th>옵셋</th>
                {dat.plans[0].splits.map((_, i) => (
                  <th key={i}>현시 {i + 1}</th>
                ))}
                <th>검증</th>
              </tr>
            </thead>
            <tbody>
              {dat.plans.map((plan, planIdx) => (
                <tr key={plan.plan ?? planIdx}>
                  <td style={{ fontWeight: 600 }}>Plan {plan.plan ?? planIdx}</td>
                  <td>{plan.cycle}</td>
                  <td>{plan.offset}</td>
                  {plan.splits.map((s, i) => (
                    <td key={i}>
                      <span style={{
                        background: `hsla(${210 + i * 40}, 70%, 55%, 0.2)`,
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                      }}>
                        {s}
                      </span>
                    </td>
                  ))}
                  <td>
                    {plan.valid
                      ? <span className="check">OK</span>
                      : <span className="cross">ERR</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {dat.plans.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Plan 0 현시 분배</div>
              <PhasesBar plan={dat.plans[0]} />
            </div>
          )}
        </div>
      )}

      {/* LSU 구성 */}
      {dat?.lsu_types?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">LSU 구성</div>
          <div className="lsu-grid">
            {dat.lsu_types.map((type, i) => {
              const active = dat.lsu_active?.[i];
              return (
                <div key={i} className={`lsu-item ${active ? 'active' : 'inactive'}`} title={`LSU ${i + 1}: ${type}`}>
                  <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
                    <div>{i + 1}</div>
                    <div style={{ fontSize: 8 }}>{type.replace('차량', 'V').replace('보행', 'P').replace('색', '')}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            활성: {dat.lsu_active?.filter(Boolean).length || 0}개 / 총 {dat.lsu_types.length}개
          </div>
        </div>
      )}

      <div className="detail-grid">
        {/* 주기표 정보 */}
        <div className="card">
          <div className="section-title">주기표 정보</div>
          {cycle ? (
            <>
              <InfoRow label="파일명" value={cycle.filename || '-'} />
              <InfoRow label="원본" value={cycle.source_file || '-'} />
              <InfoRow label="시트" value={cycle.sheet_name || '-'} />
            </>
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>
              주기표 없음
            </div>
          )}
        </div>

        {/* 메모/상태 */}
        <div className="card">
          <div className="section-title">메모 / 상태</div>
          {editing ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 500 }}>상태</label>
                <select
                  className="filter-select"
                  style={{ display: 'block', width: '100%', marginTop: 4 }}
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                >
                  <option value="정상">정상</option>
                  <option value="점검필요">점검필요</option>
                  <option value="교체예정">교체예정</option>
                  <option value="미확인">미확인</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500 }}>메모</label>
                <textarea
                  style={{
                    display: 'block', width: '100%', marginTop: 4,
                    padding: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    fontSize: 14, minHeight: 80, resize: 'vertical', fontFamily: 'inherit',
                    background: 'rgba(255,255,255,0.05)', color: 'var(--text)',
                  }}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                />
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" onClick={handleSave}>저장</button>
                <button className="btn" onClick={() => setEditing(false)}>취소</button>
              </div>
            </>
          ) : (
            <>
              <InfoRow label="상태" value={<StatusBadge status={info.status} />} />
              <InfoRow label="메모" value={info.notes || '-'} />
              <div className="btn-group">
                <button className="btn" onClick={() => setEditing(true)}>편집</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 히스토리 */}
      {info.history?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">히스토리</div>
          {info.history.map((h, i) => (
            <div key={i} className="history-item">
              <span className="history-date">{h.date}</span>
              {' '}{h.action}
              {h.by && <span style={{ color: 'var(--text-secondary)' }}> ({h.by})</span>}
              {h.changes?.length > 0 && (
                <div className="history-changes">
                  {h.changes.map((c, j) => (
                    <div key={j} className="history-change">
                      <span className="history-change-field">{c.field}:</span>
                      <span className="history-change-before">{formatChangeValue(c.before)}</span>
                      <span>&rarr;</span>
                      <span className="history-change-after">{formatChangeValue(c.after)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 분류 메타데이터 */}
      {info._classification && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">분류 정보</div>
          <InfoRow label="신뢰도" value={
            <span className={`badge ${info._classification.confidence === 'high' ? 'badge-green' : info._classification.confidence === 'medium' ? 'badge-yellow' : 'badge-gray'}`}>
              {info._classification.confidence}
            </span>
          } />
          <InfoRow label="근거" value={info._classification.reason || '-'} />
          <InfoRow label="원본 파일" value={info._classification.source_files?.join(', ') || '-'} />
          <InfoRow label="선택 파일" value={info._classification.selected || '-'} />
        </div>
      )}
    </div>
  );
}

function formatChangeValue(val) {
  if (val === null || val === undefined || val === '') return '(없음)';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    '정상': 'badge-green',
    '점검필요': 'badge-yellow',
    '교체예정': 'badge-red',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}

function MfrBadge({ mfr }) {
  const map = {
    '서돌전자': 'badge-blue',
    '서돌전자(추정)': 'badge-blue',
    '한진이엔씨': 'badge-yellow',
  };
  return <span className={`badge ${map[mfr] || 'badge-gray'}`}>{mfr}</span>;
}

function PhasesBar({ plan }) {
  if (!plan?.splits?.length) return null;
  const total = plan.splits.reduce((a, b) => a + b, 0);
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  return (
    <div style={{ display: 'flex', height: 32, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {plan.splits.map((s, i) => (
        <div
          key={i}
          style={{
            width: `${(s / total) * 100}%`,
            background: colors[i % colors.length],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 12,
            fontWeight: 600,
            minWidth: 24,
          }}
          title={`현시 ${i + 1}: ${s}초`}
        >
          {s}s
        </div>
      ))}
    </div>
  );
}
