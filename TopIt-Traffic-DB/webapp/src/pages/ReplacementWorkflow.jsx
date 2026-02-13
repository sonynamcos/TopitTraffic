import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getReplacements, updateReplacement } from '../api/client';

const STEPS = [
  { key: 'survey', label: '현장조사', desc: '현장 제어기 상태 확인 및 배선 조사' },
  { key: 'dat_prep', label: 'DAT 준비', desc: '서돌 DAT 파일 작성 (타이밍/현시 설정)' },
  { key: 'hardware', label: '제어기 교체', desc: '한진 제어기 철거 및 서돌 제어기 설치' },
  { key: 'dat_upload', label: 'DAT 업로드', desc: '새 DAT 파일 제어기에 업로드' },
  { key: 'cycle_update', label: '주기표 갱신', desc: '주기표 엑셀 업데이트' },
  { key: 'verify', label: '완료 확인', desc: '현장 동작 확인 및 최종 검수' },
];

export default function ReplacementWorkflow() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, not_started, in_progress, completed
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const result = await getReplacements();
      setData(result);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleStepToggle(id, stepKey, currentChecked) {
    const target = data.targets.find(t => t.id === id);
    const checklist = { ...(target?.replacement?.checklist || {}) };
    checklist[stepKey] = !currentChecked;

    // Determine overall status
    const completedSteps = STEPS.filter(s => checklist[s.key]).length;
    let status = '미시작';
    if (completedSteps === STEPS.length) status = '완료';
    else if (completedSteps > 0) status = '진행중';

    try {
      await updateReplacement(id, { checklist, status });
      await loadData();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  }

  async function handleNotesUpdate(id, notes) {
    try {
      await updateReplacement(id, { notes });
      await loadData();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  }

  if (error) return <div className="loading">오류: {error}</div>;
  if (!data) return <div className="loading">로딩 중...</div>;

  const { targets, stats } = data;

  const filtered = targets.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'not_started') return !t.replacement?.status || t.replacement.status === '미시작';
    if (filter === 'in_progress') return t.replacement?.status === '진행중';
    if (filter === 'completed') return t.replacement?.status === '완료';
    return true;
  });

  return (
    <div>
      <div className="detail-header">
        <h2>제어기 교체 워크플로우</h2>
        <span className="badge badge-yellow">한진 → 서돌</span>
      </div>

      {/* 진행 현황 카드 */}
      <div className="card-grid">
        <div className="card stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">교체 대상</div>
        </div>
        <div className="card stat-card" onClick={() => setFilter('not_started')} style={{ cursor: 'pointer' }}>
          <div className="stat-value" style={{ color: 'var(--gray)' }}>{stats.not_started}</div>
          <div className="stat-label">미시작</div>
        </div>
        <div className="card stat-card" onClick={() => setFilter('in_progress')} style={{ cursor: 'pointer' }}>
          <div className="stat-value" style={{ color: 'var(--yellow)' }}>{stats.in_progress}</div>
          <div className="stat-label">진행중</div>
        </div>
        <div className="card stat-card" onClick={() => setFilter('completed')} style={{ cursor: 'pointer' }}>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.completed}</div>
          <div className="stat-label">완료</div>
        </div>
      </div>

      {/* 전체 진행률 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">전체 진행률</div>
        <ProgressBar completed={stats.completed} total={stats.total} />
        <div style={{ marginTop: 12 }}>
          <StepSummary targets={targets} />
        </div>
      </div>

      {/* 필터 */}
      <div className="toolbar">
        <select
          className="filter-select"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="all">전체 ({stats.total})</option>
          <option value="not_started">미시작 ({stats.not_started})</option>
          <option value="in_progress">진행중 ({stats.in_progress})</option>
          <option value="completed">완료 ({stats.completed})</option>
        </select>
        <span className="count-label">{filtered.length}개 표시</span>
      </div>

      {/* 교차로 목록 */}
      {filtered.map(target => (
        <ReplacementCard
          key={target.id}
          target={target}
          expanded={expandedId === target.id}
          onToggle={() => setExpandedId(expandedId === target.id ? null : target.id)}
          onStepToggle={handleStepToggle}
          onNotesUpdate={handleNotesUpdate}
        />
      ))}
    </div>
  );
}

function ProgressBar({ completed, total }) {
  const pct = total > 0 ? (completed / total * 100).toFixed(1) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span>{completed} / {total} 완료</span>
        <span style={{ fontWeight: 600 }}>{pct}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StepSummary({ targets }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
      {STEPS.map(step => {
        const done = targets.filter(t => t.replacement?.checklist?.[step.key]).length;
        const pct = targets.length > 0 ? (done / targets.length * 100).toFixed(0) : 0;
        return (
          <div key={step.key} style={{ fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span>{step.label}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{done}/{targets.length}</span>
            </div>
            <div className="progress-track" style={{ height: 4 }}>
              <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReplacementCard({ target, expanded, onToggle, onStepToggle, onNotesUpdate }) {
  const [editNotes, setEditNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const replacement = target.replacement || {};
  const checklist = replacement.checklist || {};
  const completedSteps = STEPS.filter(s => checklist[s.key]).length;
  const pct = (completedSteps / STEPS.length * 100).toFixed(0);

  const statusBadge = {
    '완료': 'badge-green',
    '진행중': 'badge-yellow',
  };

  return (
    <div className="card replace-card" style={{ marginBottom: 8 }}>
      <div className="replace-header" onClick={onToggle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <span className={`badge ${statusBadge[replacement.status] || 'badge-gray'}`}>
            {replacement.status || '미시작'}
          </span>
          <span style={{ fontWeight: 600 }}>{target.name}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{target.id}</span>
          <span className="badge badge-yellow" style={{ fontSize: 11 }}>{target.manufacturer}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 100 }}>
            <div className="progress-track" style={{ height: 6 }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 50, textAlign: 'right' }}>
            {completedSteps}/{STEPS.length}
          </span>
          <span style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
            {expanded ? '\u25B2' : '\u25BC'}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {/* 체크리스트 */}
          <div className="checklist">
            {STEPS.map((step, i) => {
              const checked = checklist[step.key] || false;
              return (
                <label key={step.key} className={`checklist-item ${checked ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onStepToggle(target.id, step.key, checked)}
                  />
                  <div>
                    <div className="checklist-label">
                      <span className="checklist-num">{i + 1}</span>
                      {step.label}
                    </div>
                    <div className="checklist-desc">{step.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* 메모 */}
          <div style={{ marginTop: 12 }}>
            {editingNotes ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <textarea
                  className="search-input"
                  style={{ flex: 1, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="교체 관련 메모..."
                  autoFocus
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => { onNotesUpdate(target.id, editNotes); setEditingNotes(false); }}>저장</button>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => setEditingNotes(false)}>취소</button>
                </div>
              </div>
            ) : (
              <div
                style={{ fontSize: 13, color: target.notes ? 'var(--text)' : 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                onClick={() => { setEditNotes(target.notes || ''); setEditingNotes(true); }}
              >
                {target.notes || '메모 추가하려면 클릭...'}
              </div>
            )}
          </div>

          {/* 링크 */}
          <div className="btn-group" style={{ marginTop: 8 }}>
            <Link to={`/intersection/${target.id}`} className="btn" style={{ fontSize: 12 }}>
              상세 보기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
