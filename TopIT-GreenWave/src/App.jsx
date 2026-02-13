import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { C, DEFAULT_INTERSECTIONS } from './styles/colors';
import { spawnCar, updateCars } from './engine/vehicle';
import { optimize } from './engine/optimizer';

// 구역별 선두차량 색상 (5구역: 빨강, 초록, 파랑, 노랑, 보라)
const ZONE_COLORS = ['#FF4444', '#44FF88', '#4499FF', '#FFD700', '#DA70D6'];
import RoadCanvas from './components/RoadCanvas';
import TSDCanvas from './components/TSDCanvas';
import DataTable from './components/DataTable';
import OffsetSliders from './components/OffsetSliders';
import NumInput from './components/NumInput';

const CANVAS_W = 1100;

export default function App() {
  const [intersections, setIntersections] = useState(DEFAULT_INTERSECTIONS);
  const [speed, setSpeed] = useState(40);         // km/h
  const [simSpeed, setSimSpeed] = useState(1);     // 배속
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [carDensity, setCarDensity] = useState(1);
  const [cars, setCars] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [roadFs, setRoadFs] = useState(false);
  const roadContainerRef = useRef(null);

  const timeRef = useRef(0);
  const carsRef = useRef([]);
  const animRef = useRef(null);
  const lastFrameRef = useRef(performance.now());
  const spawnFwdRef = useRef(0);
  const spawnRevRef = useRef(0);

  // Convert meters <-> pixels
  const maxDist = Math.max(...intersections.map(i => i.distance), 1);
  const margin = 80;
  const mToPx = useCallback((m) => margin + (m / maxDist) * (CANVAS_W - margin * 2), [maxDist]);
  const pxToM = useCallback((px) => ((px - margin) / (CANVAS_W - margin * 2)) * maxDist, [maxDist]);

  const speedPxPerSec = speed * 1000 / 3600 * ((CANVAS_W - margin * 2) / maxDist);

  // Reset cars when intersection count or speed changes
  useEffect(() => {
    carsRef.current = [];
    setCars([]);
    timeRef.current = 0;
    setCurrentTime(0);
  }, [intersections.length, speed]);

  // Animation loop
  useEffect(() => {
    const loop = (timestamp) => {
      const rawDt = (timestamp - lastFrameRef.current) / 1000;
      lastFrameRef.current = timestamp;
      const dt = isPlaying ? Math.min(rawDt, 0.1) * simSpeed : 0;

      if (isPlaying) {
        timeRef.current += dt;

        // Spawn cars
        spawnFwdRef.current += dt;
        spawnRevRef.current += dt;
        const interval = 12 / carDensity;
        if (spawnFwdRef.current > interval) {
          carsRef.current.push(spawnCar(1, speedPxPerSec, CANVAS_W));
          spawnFwdRef.current = 0;
        }
        if (spawnRevRef.current > interval) {
          carsRef.current.push(spawnCar(-1, speedPxPerSec, CANVAS_W));
          spawnRevRef.current = 0;
        }

        // Update vehicle physics
        carsRef.current = updateCars(
          carsRef.current, intersections,
          timeRef.current, dt,
          mToPx, pxToM, CANVAS_W
        );
      }

      // 구역별 선두 차량 마킹 (5구역)
      const allCars = carsRef.current;
      allCars.forEach(c => { c.zoneColor = null; });
      // 구역 경계: [0, inter0, inter1, inter2, inter3, canvasW]
      const bounds = [
        0,
        ...intersections.map(i => mToPx(i.distance)),
        CANVAS_W,
      ];
      for (let z = 0; z < bounds.length - 1; z++) {
        const lo = bounds[z];
        const hi = bounds[z + 1];
        let fwdLead = null;
        let revLead = null;
        for (const c of allCars) {
          if (c.x < lo || c.x > hi) continue;
          if (c.direction === 1 && (!fwdLead || c.x > fwdLead.x)) fwdLead = c;
          if (c.direction === -1 && (!revLead || c.x < revLead.x)) revLead = c;
        }
        if (fwdLead) fwdLead.zoneColor = ZONE_COLORS[z % ZONE_COLORS.length];
        if (revLead) revLead.zoneColor = ZONE_COLORS[z % ZONE_COLORS.length];
      }

      setCurrentTime(timeRef.current);
      setCars([...allCars]);

      animRef.current = requestAnimationFrame(loop);
    };

    lastFrameRef.current = performance.now();
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [intersections, speed, simSpeed, isPlaying, carDensity, speedPxPerSec, mToPx, pxToM]);

  // 도로 캔버스 전체화면
  const toggleRoadFs = useCallback(() => {
    if (!document.fullscreenElement) {
      roadContainerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setRoadFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);


  const handleReset = () => {
    timeRef.current = 0;
    carsRef.current = [];
    spawnFwdRef.current = 0;
    spawnRevRef.current = 0;
    setCurrentTime(0);
    setCars([]);
  };

  const handleAdd = () => {
    const maxId = Math.max(...intersections.map(i => i.id), 0);
    const lastDist = intersections[intersections.length - 1]?.distance || 0;
    const cycle = intersections[0]?.cycle || 160;
    setIntersections([...intersections, {
      id: maxId + 1,
      name: `교차로${maxId + 1}`,
      cycle,
      offset: 0,
      green: 60,
      distance: lastDist + 200,
    }]);
  };

  const handleRemove = (id) => {
    setIntersections(intersections.filter(i => i.id !== id));
  };

  const handleOptimize = () => {
    setRecommendations(optimize(intersections, speed));
  };

  const applyRecommendation = (rec) => {
    setIntersections(intersections.map((inter, i) => ({ ...inter, offset: rec.offsets[i] })));
    setRecommendations(null);
    handleReset();
  };

  const cycle = intersections[0]?.cycle || 160;
  const densityLabels = ['', '한산', '여유', '보통', '혼잡', '정체', '극정체'];

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      {/* Header */}
      <div style={{
        padding: '10px 24px',
        background: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #22c55e, #3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}>{'🚦'}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.3px',
                background: 'linear-gradient(90deg, #22c55e, #3b82f6)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>TopIt GreenWave</div>
              <div style={{ fontSize: 9, color: C.textDim, fontWeight: 500, marginTop: -1 }}>v2.0 Signal Coordinator</div>
            </div>
          </div>
          <div style={{
            display: 'flex', gap: 12, marginLeft: 8,
            fontSize: 11, color: C.textMute, fontVariantNumeric: 'tabular-nums',
          }}>
            <span style={{
              padding: '3px 8px', borderRadius: 6,
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)',
            }}>
              <span style={{ color: C.green }}>{'●'}</span>{' '}주기 {cycle}s
            </span>
            <span style={{
              padding: '3px 8px', borderRadius: 6,
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
            }}>
              <span style={{ color: C.blue }}>{'◷'}</span>{' '}{Math.floor(currentTime)}s 경과
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setIsPlaying(!isPlaying)} style={{
            padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
            border: isPlaying ? `1px solid ${C.border}` : '1px solid rgba(34,197,94,0.4)',
            background: isPlaying ? C.card : 'rgba(34,197,94,0.12)',
            color: isPlaying ? C.text : C.green,
          }}>
            {isPlaying ? '⏸ 일시정지' : '▶ 재생'}
          </button>
          <button onClick={handleReset} style={{
            padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
            border: `1px solid ${C.border}`, background: C.card, color: C.textMute,
          }}>
            {'↺ 리셋'}
          </button>
        </div>
      </div>

      {/* Global controls row */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 20px' }}>
        <div style={{ width: '100%', maxWidth: CANVAS_W, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ControlCard label="주행속도" color={C.blue}
            value={
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <NumInput min={10} max={120} value={speed} onChange={setSpeed}
                  style={{
                    width: 44, fontSize: 16, fontWeight: 700, color: C.blue,
                    background: 'transparent', border: `1px solid ${C.border}`,
                    borderRadius: 4, padding: '2px 4px', textAlign: 'right',
                    outline: 'none', fontFamily: 'inherit',
                  }} />
                <span style={{ fontSize: 12, color: C.textMute }}>km/h</span>
              </div>
            }
            input={<input type="range" min={20} max={80} value={speed}
              onChange={e => setSpeed(Number(e.target.value))} style={{ flex: 1, accentColor: C.blue }} />}
          />
          <ControlCard label="시뮬 배속" color={C.orange}
            value={`x${simSpeed}`}
            input={
              <div style={{ display: 'flex', gap: 4 }}>
                {[0.5, 1, 2, 4].map(s => (
                  <button key={s} onClick={() => setSimSpeed(s)}
                    style={{
                      flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${simSpeed === s ? C.orange : C.border}`,
                      background: simSpeed === s ? C.orange : C.card,
                      color: simSpeed === s ? '#000' : C.text,
                    }}>
                    x{s}
                  </button>
                ))}
              </div>
            }
          />
          <ControlCard label="차량 밀도" color={C.green}
            value={densityLabels[carDensity]}
            input={<input type="range" min={1} max={6} value={carDensity}
              onChange={e => setCarDensity(Number(e.target.value))} style={{ flex: 1, accentColor: C.green }} />}
          />
        </div>
      </div>

      {/* Main content: left sidebar (table) + right (canvases + sliders) */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', maxWidth: 1440, margin: '0 auto' }}>
        {/* Left: DataTable */}
        <div style={{ width: 480, flexShrink: 0 }}>
          <DataTable intersections={intersections} onChange={setIntersections} onAdd={handleAdd} onRemove={handleRemove} />
          <div style={{ marginTop: 12 }}>
            <OffsetSliders intersections={intersections} onChange={setIntersections} currentTime={currentTime} />
          </div>
          {/* 자동 최적화 */}
          <div style={{ marginTop: 12, position: 'relative' }}>
            <button onClick={handleOptimize} style={{
              width: '100%', padding: '10px 16px', borderRadius: 8,
              border: `1px solid ${C.green}`, background: C.card,
              color: C.green, cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}>
              {recommendations ? '\u21BB 재계산' : '\u26A1 자동 최적화'}
            </button>
            {/* 위로 뜨는 팝업 메뉴 */}
            {recommendations && (
              <>
                <div onClick={() => setRecommendations(null)}
                  style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0,
                  marginBottom: 6, zIndex: 100,
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: 12, boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
                  maxHeight: 420, overflowY: 'auto',
                }}>
                  <div style={{ fontSize: 11, color: C.textMute, marginBottom: 8 }}>
                    기준속도: {recommendations.speed} km/h
                  </div>
                  {recommendations.scenarios.map((scenario, si) => (
                    <div key={si} style={{ marginBottom: si < 2 ? 10 : 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4,
                        borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
                        {scenario.label}
                      </div>
                      {scenario.items.map((rec) => (
                        <button key={`${si}-${rec.rank}`} onClick={() => applyRecommendation(rec)} style={{
                          width: '100%', padding: '8px 10px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${C.border}`, background: C.bg,
                          color: C.text, textAlign: 'left', display: 'block',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>
                              {rec.rank}순위
                            </span>
                            <span style={{ fontSize: 11 }}>
                              <span style={{ color: C.blue }}>{rec.fwd}s</span>
                              {' / '}
                              <span style={{ color: C.orange }}>{rec.rev}s</span>
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                            {rec.offsets.join(', ')}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Canvases */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div ref={roadContainerRef} style={{
            position: 'relative',
            background: roadFs ? '#0F1923' : 'transparent',
            ...(roadFs ? { width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
          }}>
            <RoadCanvas intersections={intersections} cars={cars} time={currentTime}
              canvasW={CANVAS_W} fullscreen={roadFs} />
            <button onClick={toggleRoadFs} style={{
              position: 'absolute', top: 8, right: 8,
              padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
              fontSize: 13, border: `1px solid ${C.border}`,
              background: 'rgba(22,22,37,0.8)', color: C.textMute,
              opacity: 0.6, transition: 'opacity 0.2s', zIndex: 1,
            }}
              onMouseEnter={e => e.target.style.opacity = 1}
              onMouseLeave={e => e.target.style.opacity = 0.6}
            >
              {roadFs ? '✕ 닫기' : '⊞ 전체화면'}
            </button>
          </div>
          <TSDCanvas intersections={intersections} cars={cars} time={currentTime} canvasW={CANVAS_W} speed={speed} />
          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', fontSize: 11, color: C.textDim }}>
            <span style={{ color: C.orange }}>{'\u25CF'} 위쪽 차선 (역방향 {'\u2190'})</span>
            <span style={{ color: C.blue }}>{'\u25CF'} 아래쪽 차선 (정방향 {'\u2192'})</span>
            <span>옵셋을 조정하여 Green Wave를 만들어보세요!</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlCard({ label, color, value, input }) {
  return (
    <div style={{ flex: 1, minWidth: 200, background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.textMute, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>{input}</div>
        <span style={{ fontSize: 16, fontWeight: 700, color, minWidth: 70, textAlign: 'right' }}>{value}</span>
      </div>
    </div>
  );
}

function btnStyle(bg) {
  return {
    padding: '6px 16px', borderRadius: 8,
    border: `1px solid ${C.border}`, background: bg,
    color: C.text, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  };
}
