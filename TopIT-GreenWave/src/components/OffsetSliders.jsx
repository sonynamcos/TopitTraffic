import { C } from '../styles/colors';
import { getSignalState } from '../engine/signal';
import NumInput from './NumInput';

const SIGNAL_COLORS = { green: C.green, yellow: C.yellow, red: C.red };

export default function OffsetSliders({ intersections, onChange, currentTime }) {
  const updateOffset = (id, val) => {
    onChange(intersections.map(i =>
      i.id === id ? { ...i, offset: Number(val) } : i
    ));
  };

  return (
    <div style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.text }}>
        옵셋 슬라이더
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {intersections.map((inter) => {
          const sig = getSignalState(currentTime, inter);
          return (
            <div key={inter.id} style={{
              background: C.bg, borderRadius: 8, padding: '10px 12px',
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: SIGNAL_COLORS[sig.state],
                    boxShadow: `0 0 6px ${SIGNAL_COLORS[sig.state]}`,
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{inter.name}</span>
                </div>
                <span style={{ fontSize: 11, color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.ceil(sig.remaining)}s
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range" min={0} max={inter.cycle - 1}
                  value={inter.offset}
                  onChange={(e) => updateOffset(inter.id, e.target.value)}
                  style={{ flex: 1, accentColor: C.green }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 60 }}>
                  <NumInput
                    min={0} max={inter.cycle - 1}
                    value={inter.offset}
                    onChange={(v) => updateOffset(inter.id, v)}
                    style={{
                      width: 48, fontSize: 14, fontWeight: 700, color: C.green,
                      background: 'transparent', border: `1px solid ${C.border}`,
                      borderRadius: 4, padding: '2px 4px', textAlign: 'right',
                      outline: 'none', fontVariantNumeric: 'tabular-nums',
                      fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontSize: 12, color: C.textMute }}>s</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
