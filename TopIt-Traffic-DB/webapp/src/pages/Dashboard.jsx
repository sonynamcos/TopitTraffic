import { useState, useEffect } from 'react';
import { getStats } from '../api/client';

const MFR_COLORS = {
  '서돌전자': '#2563eb',
  '서돌전자(추정)': '#60a5fa',
  '한진이엔씨': '#f59e0b',
  'LCsim': '#8b5cf6',
  'unknown': '#9ca3af',
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStats().then(setStats).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="loading">오류: {error}</div>;
  if (!stats) return <div className="loading">로딩 중...</div>;

  const mfrEntries = Object.entries(stats.manufacturers).sort((a, b) => b[1] - a[1]);
  const statusEntries = Object.entries(stats.statuses).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="card-grid">
        <div className="card stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">총 교차로</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{stats.has_dat}</div>
          <div className="stat-label">DAT 확보</div>
          <div className="stat-sub">{stats.dat_coverage}%</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{stats.has_cycle_table}</div>
          <div className="stat-label">주기표 확보</div>
          <div className="stat-sub">{stats.cycle_coverage}%</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{stats.has_both}</div>
          <div className="stat-label">DAT + 주기표</div>
          <div className="stat-sub">
            {stats.total > 0 ? (stats.has_both / stats.total * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="section-title">제조사별 분포</div>
          <div className="mfr-bar">
            {mfrEntries.map(([mfr, count]) => (
              <div
                key={mfr}
                className="mfr-bar-segment"
                style={{
                  width: `${(count / stats.total) * 100}%`,
                  background: MFR_COLORS[mfr] || '#9ca3af',
                }}
                title={`${mfr}: ${count}`}
              >
                {count}
              </div>
            ))}
          </div>
          <div className="mfr-legend">
            {mfrEntries.map(([mfr, count]) => (
              <div key={mfr} className="mfr-legend-item">
                <div className="mfr-dot" style={{ background: MFR_COLORS[mfr] || '#9ca3af' }} />
                <span>{mfr} ({count})</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-title">데이터 확보 현황</div>
          <div style={{ marginTop: 12 }}>
            <CoverageBar label="DAT 파일" value={stats.has_dat} total={stats.total} color="var(--primary)" />
            <CoverageBar label="주기표" value={stats.has_cycle_table} total={stats.total} color="var(--green)" />
            <CoverageBar label="DAT + 주기표" value={stats.has_both} total={stats.total} color="var(--yellow)" />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">상태별 현황</div>
        <table>
          <thead>
            <tr>
              <th>상태</th>
              <th>교차로 수</th>
              <th>비율</th>
            </tr>
          </thead>
          <tbody>
            {statusEntries.map(([status, count]) => (
              <tr key={status}>
                <td><StatusBadge status={status} /></td>
                <td>{count}</td>
                <td>{(count / stats.total * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageBar({ label, value, total, color }) {
  const pct = total > 0 ? (value / total * 100) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>{value}/{total} ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ height: 8, background: 'var(--gray-light)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    '정상': 'badge-green',
    '점검필요': 'badge-yellow',
    '교체예정': 'badge-red',
    '미확인': 'badge-gray',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}
