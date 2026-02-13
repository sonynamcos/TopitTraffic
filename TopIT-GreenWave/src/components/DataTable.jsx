import { C } from '../styles/colors';
import NumInput from './NumInput';

const cellStyle = {
  padding: '6px 8px',
  background: C.bg,
  border: `1px solid ${C.border}`,
  color: C.text,
  fontSize: 13,
  fontFamily: 'monospace',
  textAlign: 'center',
};

const inputStyle = {
  ...cellStyle,
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
};

const headerStyle = {
  ...cellStyle,
  background: C.surface,
  fontWeight: 600,
  fontSize: 11,
  color: '#94A3B8',
};

export default function DataTable({ intersections, onChange, onAdd, onRemove }) {
  const update = (id, field, value) => {
    onChange(intersections.map(i =>
      i.id === id ? { ...i, [field]: field === 'name' ? value : Number(value) || 0 } : i
    ));
  };

  return (
    <div style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.text }}>
        입력 테이블
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
          <thead>
            <tr>
              {['도로명', '주기', '옵셋', '녹색', '거리(m)', ''].map((h, i) => (
                <th key={i} style={headerStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {intersections.map((inter) => (
              <tr key={inter.id}>
                <td style={cellStyle}>
                  <input style={{ ...inputStyle, textAlign: 'left' }}
                    value={inter.name} onChange={(e) => update(inter.id, 'name', e.target.value)} />
                </td>
                <td style={cellStyle}>
                  <NumInput style={inputStyle} min={1} max={999}
                    value={inter.cycle} onChange={(v) => update(inter.id, 'cycle', v)} />
                </td>
                <td style={cellStyle}>
                  <NumInput style={inputStyle} min={0} max={inter.cycle - 1}
                    value={inter.offset} onChange={(v) => update(inter.id, 'offset', v)} />
                </td>
                <td style={cellStyle}>
                  <NumInput style={inputStyle} min={1} max={inter.cycle - 1}
                    value={inter.green} onChange={(v) => update(inter.id, 'green', v)} />
                </td>
                <td style={cellStyle}>
                  <NumInput style={inputStyle} min={0} max={9999}
                    value={inter.distance} onChange={(v) => update(inter.id, 'distance', v)} />
                </td>
                <td style={cellStyle}>
                  {intersections.length > 2 && (
                    <button onClick={() => onRemove(inter.id)}
                      style={{
                        background: 'transparent', border: 'none', color: C.red,
                        cursor: 'pointer', fontSize: 16, padding: '2px 6px',
                      }}>
                      {'✕'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd}
        style={{
          marginTop: 8, padding: '6px 14px', borderRadius: 6,
          border: `1px solid ${C.border}`, background: C.surface,
          color: C.green, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>
        + 교차로 추가
      </button>
    </div>
  );
}
