import { useRef, useEffect } from 'react';
import {
  C, ROAD_Y, ROAD_HEIGHT, LANE_HEIGHT, CAR_W, CAR_H, ROAD_CANVAS_H,
} from '../styles/colors';
import { getSignalState, getSignalStateReverse } from '../engine/signal';

const SIGNAL_COLORS = { green: C.green, yellow: C.yellow, red: C.red };

export default function RoadCanvas({ intersections, cars, time, canvasW, fullscreen }) {
  const canvasRef = useRef(null);

  // Convert distance(m) → px
  const maxDist = Math.max(...intersections.map(i => i.distance), 1);
  const margin = 80;
  const mToPx = (m) => margin + (m / maxDist) * (canvasW - margin * 2);

  const canvasH = ROAD_CANVAS_H;
  const roadY = ROAD_Y;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Background
    ctx.fillStyle = '#0F1923';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Road background
    const roadTop = roadY - ROAD_HEIGHT / 2 - 8;
    const roadBot = roadY + ROAD_HEIGHT / 2 + 8;
    ctx.fillStyle = C.roadBg;
    ctx.fillRect(0, roadTop, canvasW, roadBot - roadTop);

    // Road edge lines
    ctx.strokeStyle = C.roadEdge;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, roadY - ROAD_HEIGHT / 2);
    ctx.lineTo(canvasW, roadY - ROAD_HEIGHT / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, roadY + ROAD_HEIGHT / 2);
    ctx.lineTo(canvasW, roadY + ROAD_HEIGHT / 2);
    ctx.stroke();

    // Center dashed line
    ctx.strokeStyle = C.centerLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.moveTo(0, roadY);
    ctx.lineTo(canvasW, roadY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Direction arrows
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    for (let ax = 50; ax < canvasW; ax += 200) {
      ctx.fillText('\u2190', ax, roadY - LANE_HEIGHT / 2 + 5);
      ctx.fillText('\u2192', ax + 100, roadY + LANE_HEIGHT / 2 + 5);
    }

    // Intersections
    intersections.forEach((inter) => {
      const px = mToPx(inter.distance);
      const sigFwd = getSignalState(time, inter);
      const sigRev = getSignalStateReverse(time, inter);

      // Crosswalk bg
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px - 25, roadTop, 50, roadBot - roadTop);

      // Crosswalk stripes
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let y = roadTop + 4; y < roadBot - 4; y += 8) {
        ctx.fillRect(px - 20, y, 40, 4);
      }

      // Stop lines (횡단보도 바깥: 역방향←=위쪽 오른쪽, 정방향→=아래쪽 왼쪽)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 28, roadY - ROAD_HEIGHT / 2);
      ctx.lineTo(px + 28, roadY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 28, roadY);
      ctx.lineTo(px - 28, roadY + ROAD_HEIGHT / 2);
      ctx.stroke();

      // === Signal lights - reverse (top, ←) ===
      const lightY = roadY - ROAD_HEIGHT / 2 - 32;
      const boxW = 42, boxH = 18;
      ctx.fillStyle = C.signalBox;
      ctx.strokeStyle = C.signalBdr;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px - boxW / 2, lightY - boxH / 2, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      const lightR = 5, lightSpacing = 13;
      ['red', 'yellow', 'green'].forEach((c, i) => {
        const lx = px - lightSpacing + i * lightSpacing;
        ctx.beginPath();
        ctx.arc(lx, lightY, lightR, 0, Math.PI * 2);
        if (sigRev.state === c) {
          ctx.fillStyle = SIGNAL_COLORS[c];
          ctx.shadowColor = SIGNAL_COLORS[c];
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = C.signalOff;
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // === Signal lights - forward (bottom, →) ===
      const lightY2 = roadY + ROAD_HEIGHT / 2 + 32;
      ctx.fillStyle = C.signalBox;
      ctx.strokeStyle = C.signalBdr;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px - boxW / 2, lightY2 - boxH / 2, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      ['red', 'yellow', 'green'].forEach((c, i) => {
        const lx = px - lightSpacing + i * lightSpacing;
        ctx.beginPath();
        ctx.arc(lx, lightY2, lightR, 0, Math.PI * 2);
        if (sigFwd.state === c) {
          ctx.fillStyle = SIGNAL_COLORS[c];
          ctx.shadowColor = SIGNAL_COLORS[c];
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = C.signalOff;
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Distance label - 역방향 (위쪽)
      const revDist = maxDist - inter.distance;
      ctx.fillStyle = '#B08D57';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${revDist}m`, px, lightY - 32);

      // Name label
      ctx.fillStyle = '#94A3B8';
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.fillText(inter.name, px, lightY - 20);

      // Distance label - 정방향 (아래쪽)
      ctx.fillStyle = '#64748B';
      ctx.fillText(`${inter.distance}m`, px, lightY2 + 26);
    });

    // 교차로 간 구간 거리 표시
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < intersections.length - 1; i++) {
      const px1 = mToPx(intersections[i].distance);
      const px2 = mToPx(intersections[i + 1].distance);
      const midX = (px1 + px2) / 2;
      const gap = intersections[i + 1].distance - intersections[i].distance;
      // 위쪽 (역방향 구간)
      ctx.fillStyle = 'rgba(176,141,87,0.6)';
      ctx.fillText(`${gap}m`, midX, roadY - ROAD_HEIGHT / 2 - 64);
      // 아래쪽 (정방향 구간)
      ctx.fillStyle = 'rgba(100,116,139,0.6)';
      ctx.fillText(`${gap}m`, midX, roadY + ROAD_HEIGHT / 2 + 58);
    }

    // Cars
    cars.forEach((car) => {
      const cy = car.lane === 0 ? roadY - LANE_HEIGHT / 2 : roadY + LANE_HEIGHT / 2;
      ctx.save();
      ctx.translate(car.x, cy);

      // Leader glow ring
      if (car.zoneColor) {
        ctx.beginPath();
        ctx.arc(0, 0, CAR_W * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = car.zoneColor;
        ctx.globalAlpha = 0.12;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowColor = car.zoneColor;
        ctx.shadowBlur = 6;
      }

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.roundRect(-CAR_W / 2 + 1, -CAR_H / 2 + 1, CAR_W, CAR_H, 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Body
      ctx.fillStyle = car.zoneColor || car.color;
      ctx.beginPath();
      ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 2);
      if (car.zoneColor) {
        ctx.shadowColor = car.zoneColor;
        ctx.shadowBlur = 5;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Brake lights
      if (car.braking || car.stopped) {
        ctx.fillStyle = C.red;
        ctx.shadowColor = C.red;
        ctx.shadowBlur = 3;
        if (car.direction === 1) {
          ctx.fillRect(-CAR_W / 2, -CAR_H / 2, 1, CAR_H);
        } else {
          ctx.fillRect(CAR_W / 2 - 1, -CAR_H / 2, 1, CAR_H);
        }
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    });
  });

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={ROAD_CANVAS_H}
      style={{
        borderRadius: fullscreen ? 0 : 12,
        border: fullscreen ? 'none' : `1px solid ${C.border}`,
        display: 'block',
        maxWidth: '100%',
        ...(fullscreen ? { width: '100vw', height: 'auto', objectFit: 'contain' } : {}),
      }}
    />
  );
}
