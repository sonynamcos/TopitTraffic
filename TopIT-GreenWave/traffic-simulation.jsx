import { useState, useRef, useEffect, useCallback } from "react";

const ROAD_Y = 300;
const ROAD_HEIGHT = 52;
const LANE_HEIGHT = 26;
const CAR_W = 28;
const CAR_H = 14;
const CANVAS_W = 1100;
const CANVAS_H = 600;

const CAR_COLORS_FWD = ["#3B82F6", "#60A5FA", "#2563EB", "#1D4ED8", "#38BDF8"];
const CAR_COLORS_REV = ["#F59E0B", "#FBBF24", "#F97316", "#FB923C", "#FCD34D"];

const defaultIntersections = [
  { id: "C-001", name: "대천역 교차로", x: 200, greenTime: 35, redTime: 25, yellowTime: 3, offset: 0 },
  { id: "C-002", name: "머드축제장 앞", x: 450, greenTime: 35, redTime: 25, yellowTime: 3, offset: 8 },
  { id: "C-003", name: "해수욕장 입구", x: 700, greenTime: 35, redTime: 25, yellowTime: 3, offset: 16 },
  { id: "C-004", name: "해수욕장 중앙", x: 950, greenTime: 35, redTime: 25, yellowTime: 3, offset: 24 },
];

function getSignalState(time, intersection) {
  const cycle = intersection.greenTime + intersection.yellowTime + intersection.redTime;
  const t = ((time - intersection.offset) % cycle + cycle) % cycle;
  if (t < intersection.greenTime) return { state: "green", remaining: intersection.greenTime - t };
  if (t < intersection.greenTime + intersection.yellowTime) return { state: "yellow", remaining: intersection.greenTime + intersection.yellowTime - t };
  return { state: "red", remaining: cycle - t };
}

function getSignalStateReverse(time, intersection) {
  const cycle = intersection.greenTime + intersection.yellowTime + intersection.redTime;
  const t = ((time - intersection.offset) % cycle + cycle) % cycle;
  if (t < intersection.greenTime) return { state: "red", remaining: intersection.greenTime - t };
  if (t < intersection.greenTime + intersection.yellowTime) return { state: "red", remaining: intersection.greenTime + intersection.yellowTime - t };
  return { state: "green", remaining: cycle - t };
}

const SIGNAL_COLORS = { green: "#22C55E", yellow: "#FACC15", red: "#EF4444" };

export default function TrafficSimulation() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const timeRef = useRef(0);
  const carsRef = useRef([]);
  const [intersections, setIntersections] = useState(defaultIntersections);
  const [speed, setSpeed] = useState(50);
  const [simSpeed, setSimSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [showTimespace, setShowTimespace] = useState(true);
  const [carDensity, setCarDensity] = useState(3);
  const lastFrameRef = useRef(performance.now());

  const speedPxPerSec = speed * 1000 / 3600 * 3.5;

  const spawnCar = useCallback((cars, direction) => {
    const lane = direction === 1 ? 0 : 1;
    const x = direction === 1 ? -CAR_W : CANVAS_W + CAR_W;
    const colorArr = direction === 1 ? CAR_COLORS_FWD : CAR_COLORS_REV;
    cars.push({
      id: Math.random(),
      x,
      lane,
      direction,
      speed: speedPxPerSec * (0.9 + Math.random() * 0.2),
      maxSpeed: speedPxPerSec * (0.9 + Math.random() * 0.2),
      color: colorArr[Math.floor(Math.random() * colorArr.length)],
      stopped: false,
      braking: false,
    });
  }, [speedPxPerSec]);

  useEffect(() => {
    carsRef.current = [];
    timeRef.current = 0;
  }, [speed, intersections]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let spawnTimerFwd = 0;
    let spawnTimerRev = 0;

    const draw = (timestamp) => {
      const rawDt = (timestamp - lastFrameRef.current) / 1000;
      lastFrameRef.current = timestamp;
      const dt = isPlaying ? Math.min(rawDt, 0.1) * simSpeed : 0;

      if (isPlaying) {
        timeRef.current += dt;
        setCurrentTime(timeRef.current);
      }
      const time = timeRef.current;
      let cars = carsRef.current;

      // Spawn
      if (isPlaying) {
        spawnTimerFwd += dt;
        spawnTimerRev += dt;
        const interval = 4.5 / carDensity;
        if (spawnTimerFwd > interval) { spawnCar(cars, 1); spawnTimerFwd = 0; }
        if (spawnTimerRev > interval) { spawnCar(cars, -1); spawnTimerRev = 0; }
      }

      // Update cars
      cars.forEach((car) => {
        if (!isPlaying) return;
        const isForward = car.direction === 1;
        let shouldStop = false;
        let stopX = null;

        // Check signals
        for (const inter of intersections) {
          const sig = isForward ? getSignalState(time, inter) : getSignalStateReverse(time, inter);
          const stopLine = isForward ? inter.x - 30 : inter.x + 30;

          if (sig.state === "red" || sig.state === "yellow") {
            if (isForward && car.x < stopLine - 2 && car.x > stopLine - 150) {
              shouldStop = true;
              stopX = stopLine - CAR_W / 2;
              break;
            }
            if (!isForward && car.x > stopLine + 2 && car.x < stopLine + 150) {
              shouldStop = true;
              stopX = stopLine + CAR_W / 2;
              break;
            }
          }
        }

        // Check car ahead
        const ahead = cars.filter((c) => c.lane === car.lane && c.direction === car.direction && c.id !== car.id);
        for (const other of ahead) {
          if (isForward && other.x > car.x && other.x - car.x < CAR_W + 18) {
            shouldStop = true;
            stopX = other.x - CAR_W - 12;
            break;
          }
          if (!isForward && other.x < car.x && car.x - other.x < CAR_W + 18) {
            shouldStop = true;
            stopX = other.x + CAR_W + 12;
            break;
          }
        }

        if (shouldStop) {
          car.braking = true;
          const decel = 180;
          car.speed = Math.max(0, car.speed - decel * dt);
          if (car.speed === 0) car.stopped = true;
        } else {
          car.stopped = false;
          car.braking = false;
          const accel = 100;
          car.speed = Math.min(car.maxSpeed, car.speed + accel * dt);
        }
        car.x += car.speed * car.direction * dt;
      });

      // Remove off-screen
      carsRef.current = cars.filter((c) => c.x > -100 && c.x < CANVAS_W + 100);

      // === DRAW ===
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Background
      ctx.fillStyle = "#0F1923";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Road bg
      const roadTop = ROAD_Y - ROAD_HEIGHT / 2 - 8;
      const roadBot = ROAD_Y + ROAD_HEIGHT / 2 + 8;
      ctx.fillStyle = "#1E293B";
      ctx.fillRect(0, roadTop, CANVAS_W, roadBot - roadTop);

      // Road edge lines
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, ROAD_Y - ROAD_HEIGHT / 2);
      ctx.lineTo(CANVAS_W, ROAD_Y - ROAD_HEIGHT / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, ROAD_Y + ROAD_HEIGHT / 2);
      ctx.lineTo(CANVAS_W, ROAD_Y + ROAD_HEIGHT / 2);
      ctx.stroke();

      // Center dashed line
      ctx.strokeStyle = "#FBBF24";
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      ctx.moveTo(0, ROAD_Y);
      ctx.lineTo(CANVAS_W, ROAD_Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Intersections
      intersections.forEach((inter) => {
        // Crosswalk
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(inter.x - 25, roadTop, 50, roadBot - roadTop);

        // Crosswalk stripes
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        for (let y = roadTop + 4; y < roadBot - 4; y += 8) {
          ctx.fillRect(inter.x - 20, y, 40, 4);
        }

        // Stop lines
        const sigFwd = getSignalState(time, inter);
        const sigRev = getSignalStateReverse(time, inter);

        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(inter.x - 30, ROAD_Y - ROAD_HEIGHT / 2);
        ctx.lineTo(inter.x - 30, ROAD_Y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(inter.x + 30, ROAD_Y);
        ctx.lineTo(inter.x + 30, ROAD_Y + ROAD_HEIGHT / 2);
        ctx.stroke();

        // Signal lights - forward (top)
        const lightY = ROAD_Y - ROAD_HEIGHT / 2 - 32;
        ctx.fillStyle = "#0F172A";
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1;
        const boxW = 42;
        const boxH = 18;
        ctx.beginPath();
        ctx.roundRect(inter.x - boxW / 2, lightY - boxH / 2, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        // 3 lights
        const lightR = 5;
        const lightSpacing = 13;
        ["red", "yellow", "green"].forEach((c, i) => {
          const lx = inter.x - lightSpacing + i * lightSpacing;
          ctx.beginPath();
          ctx.arc(lx, lightY, lightR, 0, Math.PI * 2);
          if (sigFwd.state === c) {
            ctx.fillStyle = SIGNAL_COLORS[c];
            ctx.shadowColor = SIGNAL_COLORS[c];
            ctx.shadowBlur = 12;
          } else {
            ctx.fillStyle = "#1E293B";
            ctx.shadowBlur = 0;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
        });

        // Signal lights - reverse (bottom)
        const lightY2 = ROAD_Y + ROAD_HEIGHT / 2 + 32;
        ctx.fillStyle = "#0F172A";
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(inter.x - boxW / 2, lightY2 - boxH / 2, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        ["red", "yellow", "green"].forEach((c, i) => {
          const lx = inter.x - lightSpacing + i * lightSpacing;
          ctx.beginPath();
          ctx.arc(lx, lightY2, lightR, 0, Math.PI * 2);
          if (sigRev.state === c) {
            ctx.fillStyle = SIGNAL_COLORS[c];
            ctx.shadowColor = SIGNAL_COLORS[c];
            ctx.shadowBlur = 12;
          } else {
            ctx.fillStyle = "#1E293B";
            ctx.shadowBlur = 0;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
        });

        // Name label
        ctx.fillStyle = "#94A3B8";
        ctx.font = "bold 11px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(inter.name, inter.x, lightY - 18);
        ctx.fillStyle = "#64748B";
        ctx.font = "10px -apple-system, sans-serif";
        ctx.fillText(`옵셋: ${inter.offset}s`, inter.x, lightY2 + 26);
      });

      // Cars
      carsRef.current.forEach((car) => {
        const cy = car.lane === 0 ? ROAD_Y - LANE_HEIGHT / 2 : ROAD_Y + LANE_HEIGHT / 2;
        ctx.save();
        ctx.translate(car.x, cy);

        // Car shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.roundRect(-CAR_W / 2 + 2, -CAR_H / 2 + 2, CAR_W, CAR_H, 3);
        ctx.fill();

        // Car body
        ctx.fillStyle = car.color;
        ctx.beginPath();
        ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 3);
        ctx.fill();

        // Windshield
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        if (car.direction === 1) {
          ctx.fillRect(CAR_W / 2 - 8, -CAR_H / 2 + 2, 5, CAR_H - 4);
        } else {
          ctx.fillRect(-CAR_W / 2 + 3, -CAR_H / 2 + 2, 5, CAR_H - 4);
        }

        // Brake lights
        if (car.braking || car.stopped) {
          ctx.fillStyle = "#EF4444";
          ctx.shadowColor = "#EF4444";
          ctx.shadowBlur = 8;
          if (car.direction === 1) {
            ctx.fillRect(-CAR_W / 2, -CAR_H / 2 + 1, 2, 4);
            ctx.fillRect(-CAR_W / 2, CAR_H / 2 - 5, 2, 4);
          } else {
            ctx.fillRect(CAR_W / 2 - 2, -CAR_H / 2 + 1, 2, 4);
            ctx.fillRect(CAR_W / 2 - 2, CAR_H / 2 - 5, 2, 4);
          }
          ctx.shadowBlur = 0;
        }

        ctx.restore();
      });

      // Direction arrows on road
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      for (let ax = 50; ax < CANVAS_W; ax += 200) {
        ctx.fillText("→", ax, ROAD_Y - LANE_HEIGHT / 2 + 5);
        ctx.fillText("←", ax + 100, ROAD_Y + LANE_HEIGHT / 2 + 5);
      }

      // Time-Space Diagram
      if (showTimespace) {
        const tsX = 40;
        const tsY = ROAD_Y + ROAD_HEIGHT / 2 + 80;
        const tsW = CANVAS_W - 80;
        const tsH = 180;
        const tsCycle = intersections[0].greenTime + intersections[0].yellowTime + intersections[0].redTime;
        const tsTimeWindow = tsCycle * 2.5;

        // BG
        ctx.fillStyle = "rgba(15,23,35,0.9)";
        ctx.strokeStyle = "#1E293B";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tsX - 10, tsY - 30, tsW + 20, tsH + 50, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#94A3B8";
        ctx.font = "bold 11px -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("시공간 다이어그램 (Time-Space Diagram)", tsX, tsY - 14);

        // Grid
        ctx.strokeStyle = "#1E293B";
        ctx.lineWidth = 0.5;
        for (let t = 0; t <= tsTimeWindow; t += 10) {
          const x = tsX + (t / tsTimeWindow) * tsW;
          ctx.beginPath();
          ctx.moveTo(x, tsY);
          ctx.lineTo(x, tsY + tsH);
          ctx.stroke();
          if (t % 20 === 0) {
            ctx.fillStyle = "#475569";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${t}s`, x, tsY + tsH + 14);
          }
        }

        // Intersection rows with signal colors
        intersections.forEach((inter, i) => {
          const y = tsY + (i / (intersections.length - 1)) * tsH;

          // Signal timeline
          for (let t = 0; t < tsTimeWindow; t += 0.5) {
            const sig = getSignalState(t, inter);
            const x1 = tsX + (t / tsTimeWindow) * tsW;
            const x2 = tsX + ((t + 0.5) / tsTimeWindow) * tsW;
            ctx.fillStyle = sig.state === "green" ? "rgba(34,197,94,0.3)" : sig.state === "yellow" ? "rgba(250,204,21,0.2)" : "rgba(239,68,68,0.15)";
            ctx.fillRect(x1, y - 6, x2 - x1, 12);
          }

          // Label
          ctx.fillStyle = "#CBD5E1";
          ctx.font = "10px -apple-system, sans-serif";
          ctx.textAlign = "right";
          ctx.fillText(inter.name.substring(0, 6), tsX - 4, y + 4);
        });

        // Green wave band (forward)
        ctx.strokeStyle = "rgba(59,130,246,0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        const startT = time % tsTimeWindow;
        for (let band = -1; band <= 2; band++) {
          ctx.beginPath();
          intersections.forEach((inter, i) => {
            const dist = inter.x - intersections[0].x;
            const travelTime = dist / speedPxPerSec;
            const t = (startT + travelTime + band * tsCycle) % tsTimeWindow;
            const x = tsX + (t / tsTimeWindow) * tsW;
            const y = tsY + (i / (intersections.length - 1)) * tsH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Current time marker
        const ctX = tsX + ((time % tsTimeWindow) / tsTimeWindow) * tsW;
        ctx.strokeStyle = "#F59E0B";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(ctX, tsY);
        ctx.lineTo(ctX, tsY + tsH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Axes
        ctx.fillStyle = "#64748B";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("시간(s) →", tsX + tsW / 2, tsY + tsH + 26);
        ctx.save();
        ctx.translate(tsX - 42, tsY + tsH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("거리 →", 0, 0);
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    lastFrameRef.current = performance.now();
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [intersections, speed, simSpeed, isPlaying, showTimespace, spawnCar, carDensity, speedPxPerSec]);

  const updateOffset = (idx, val) => {
    setIntersections((prev) => prev.map((inter, i) => (i === idx ? { ...inter, offset: Number(val) } : inter)));
  };

  const cycle = intersections[0].greenTime + intersections[0].yellowTime + intersections[0].redTime;

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#0B1120", color: "#E2E8F0", fontFamily: "-apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", background: "#111827", borderBottom: "1px solid #1E293B", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22 }}>🚗</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>교통신호 연동 시뮬레이터</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>보령시 · Green Wave Simulation</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #334155", background: isPlaying ? "#1E293B" : "#22C55E", color: "#E2E8F0", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            {isPlaying ? "⏸ 일시정지" : "▶ 재생"}
          </button>
          <button
            onClick={() => { timeRef.current = 0; carsRef.current = []; }}
            style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #334155", background: "#1E293B", color: "#E2E8F0", cursor: "pointer", fontSize: 13 }}
          >
            ↺ 리셋
          </button>
          <button
            onClick={() => setShowTimespace(!showTimespace)}
            style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #334155", background: showTimespace ? "#1D4ED8" : "#1E293B", color: "#E2E8F0", cursor: "pointer", fontSize: 13 }}
          >
            📊 시공간도
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ borderRadius: 12, border: "1px solid #1E293B", maxWidth: "100%" }}
        />
      </div>

      {/* Controls */}
      <div style={{ padding: "0 20px 20px", maxWidth: 1100, margin: "0 auto" }}>
        {/* Global controls */}
        <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, background: "#111827", borderRadius: 12, padding: 16, border: "1px solid #1E293B" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, fontWeight: 600 }}>제한속도</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={30} max={80} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ flex: 1, accentColor: "#3B82F6" }} />
              <span style={{ fontSize: 18, fontWeight: 700, color: "#3B82F6", minWidth: 70, textAlign: "right" }}>{speed} km/h</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200, background: "#111827", borderRadius: 12, padding: 16, border: "1px solid #1E293B" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, fontWeight: 600 }}>시뮬 배속</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={0.5} max={4} step={0.5} value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} style={{ flex: 1, accentColor: "#F59E0B" }} />
              <span style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B", minWidth: 50, textAlign: "right" }}>x{simSpeed}</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200, background: "#111827", borderRadius: 12, padding: 16, border: "1px solid #1E293B" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, fontWeight: 600 }}>차량 밀도</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={1} max={6} value={carDensity} onChange={(e) => setCarDensity(Number(e.target.value))} style={{ flex: 1, accentColor: "#22C55E" }} />
              <span style={{ fontSize: 18, fontWeight: 700, color: "#22C55E", minWidth: 50, textAlign: "right" }}>{["", "한산", "여유", "보통", "혼잡", "정체", "극정체"][carDensity]}</span>
            </div>
          </div>
        </div>

        {/* Per-intersection offset controls */}
        <div style={{ background: "#111827", borderRadius: 12, padding: 16, border: "1px solid #1E293B" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>교차로별 옵셋 설정</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>주기: {cycle}초 | 경과: {Math.floor(currentTime)}초</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {intersections.map((inter, i) => {
              const sig = getSignalState(currentTime, inter);
              return (
                <div
                  key={inter.id}
                  onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
                  style={{
                    background: selectedIdx === i ? "#1E293B" : "#0B1120",
                    borderRadius: 10,
                    padding: 14,
                    border: `1px solid ${selectedIdx === i ? "#3B82F6" : "#1E293B"}`,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{inter.name}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{inter.id}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: SIGNAL_COLORS[sig.state], boxShadow: `0 0 8px ${SIGNAL_COLORS[sig.state]}` }} />
                      <span style={{ fontSize: 12, color: "#94A3B8", fontVariantNumeric: "tabular-nums" }}>{Math.ceil(sig.remaining)}s</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "#64748B", minWidth: 40 }}>옵셋</span>
                    <input
                      type="range"
                      min={0}
                      max={cycle - 1}
                      value={inter.offset}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateOffset(i, e.target.value)}
                      style={{ flex: 1, accentColor: "#3B82F6" }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#3B82F6", minWidth: 35, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inter.offset}s</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 12, display: "flex", gap: 20, justifyContent: "center", fontSize: 11, color: "#475569" }}>
          <span>🔵 정방향 차량</span>
          <span>🟡 역방향 차량</span>
          <span style={{ color: "#64748B" }}>옵셋을 조정하여 Green Wave를 만들어보세요!</span>
        </div>
      </div>
    </div>
  );
}
