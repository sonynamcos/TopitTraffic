import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getIntersections } from '../api/client';

export default function IntersectionList() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const q = searchParams.get('q') || '';
  const mfr = searchParams.get('manufacturer') || '';
  const hasDat = searchParams.get('has_dat') || '';
  const hasCycle = searchParams.get('has_cycle_table') || '';
  const [sortCol, setSortCol] = useState('id');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    const params = {};
    if (q) params.q = q;
    if (mfr) params.manufacturer = mfr;
    if (hasDat) params.has_dat = hasDat;
    if (hasCycle) params.has_cycle_table = hasCycle;

    getIntersections(params).then(setData).catch(e => setError(e.message));
  }, [q, mfr, hasDat, hasCycle]);

  const sorted = useMemo(() => {
    if (!data) return [];
    const items = [...data.intersections];
    items.sort((a, b) => {
      let va = a[sortCol];
      let vb = b[sortCol];
      // ID를 숫자로 정렬
      if (sortCol === 'id') { va = parseInt(va) || 0; vb = parseInt(vb) || 0; }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (typeof va === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [data, sortCol, sortDir]);

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  }

  if (error) return <div className="loading">오류: {error}</div>;
  if (!data) return <div className="loading">로딩 중...</div>;

  const manufacturers = [...new Set(data.intersections.map(i => i.manufacturer))].sort();

  return (
    <div>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="교차로명 또는 ID 검색..."
          value={q}
          onChange={e => setFilter('q', e.target.value)}
        />
        <select
          className="filter-select"
          value={mfr}
          onChange={e => setFilter('manufacturer', e.target.value)}
        >
          <option value="">전체 제조사</option>
          {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          className="filter-select"
          value={hasDat}
          onChange={e => setFilter('has_dat', e.target.value)}
        >
          <option value="">DAT 전체</option>
          <option value="true">DAT 있음</option>
          <option value="false">DAT 없음</option>
        </select>
        <select
          className="filter-select"
          value={hasCycle}
          onChange={e => setFilter('has_cycle_table', e.target.value)}
        >
          <option value="">주기표 전체</option>
          <option value="true">주기표 있음</option>
          <option value="false">주기표 없음</option>
        </select>
        <span className="count-label">{sorted.length}개</span>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh col="id" current={sortCol} dir={sortDir} onClick={handleSort}>ID</SortTh>
              <SortTh col="name" current={sortCol} dir={sortDir} onClick={handleSort}>교차로명</SortTh>
              <SortTh col="manufacturer" current={sortCol} dir={sortDir} onClick={handleSort}>제조사</SortTh>
              <SortTh col="phases" current={sortCol} dir={sortDir} onClick={handleSort}>현시</SortTh>
              <SortTh col="cycle" current={sortCol} dir={sortDir} onClick={handleSort}>주기(초)</SortTh>
              <SortTh col="has_dat" current={sortCol} dir={sortDir} onClick={handleSort}>DAT</SortTh>
              <SortTh col="has_cycle_table" current={sortCol} dir={sortDir} onClick={handleSort}>주기표</SortTh>
              <SortTh col="status" current={sortCol} dir={sortDir} onClick={handleSort}>상태</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map(item => (
              <tr
                key={item.id}
                className="clickable"
                onClick={() => navigate(`/intersection/${item.id}`)}
              >
                <td><span className="badge badge-blue">{item.id}</span></td>
                <td style={{ fontWeight: 500 }}>{item.name}</td>
                <td><MfrBadge mfr={item.manufacturer} /></td>
                <td>{item.phases || '-'}</td>
                <td>{item.cycle || '-'}</td>
                <td>{item.has_dat ? <span className="check">O</span> : <span className="cross">X</span>}</td>
                <td>{item.has_cycle_table ? <span className="check">O</span> : <span className="cross">X</span>}</td>
                <td><StatusBadge status={item.status} /></td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>결과 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortTh({ col, current, dir, onClick, children }) {
  const active = current === col;
  const arrow = active ? (dir === 'asc' ? ' \u2191' : ' \u2193') : '';
  return (
    <th className={active ? 'sorted' : ''} onClick={() => onClick(col)}>
      {children}{arrow}
    </th>
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
    'LCsim': 'badge-gray',
  };
  return <span className={`badge ${map[mfr] || 'badge-gray'}`}>{mfr}</span>;
}
