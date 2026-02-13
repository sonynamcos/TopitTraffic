import { useRef, useEffect } from 'react';
import { C, TSD_CANVAS_H } from '../styles/colors';
import { getSignalState, getSignalStateReverse } from '../engine/signal';

const HALF_H = Math.round(TSD_CANVAS_H * 0.48);

/**
 * 단일 방향 시공간 다이어그램
 * direction: 'fwd' | 'rev'
 */
function SingleTSD({ intersections, cars, time, canvasW, speed, direction }) {
  const canvasRef = useRef(null);
  const isFwd = direction === 'fwd';
  const color = isFwd ? C.blue : C.orange;
  const title = isFwd
    ? '\uC544\uB798\uCABD \uCC28\uC120 (\uC815\uBC29\uD5A5 \u2192)'
    : '\uC704\uCABD \uCC28\uC120 (\uC5ED\uBC29\uD5A5 \u2190)';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, HALF_H);

    const cycle = intersections[0]?.cycle || 160;
    const maxDist = Math.max(...intersections.map(i => i.distance), 1);
    const timeWindow = cycle * 2.5;
    const speedMps = speed * 1000 / 3600;

    const padL = 60, padR = 20, padT = 28, padB = 28;
    const plotW = canvasW - padL - padR;
    const plotH = HALF_H - padT - padB;

    // 정방향: 시간 왼→오, 역방향: 시간 오→왼
    const tToPx = isFwd
      ? (t) => padL + (t / timeWindow) * plotW
      : (t) => padL + plotW - (t / timeWindow) * plotW;
    // 정방향: 수청(0m)→흑포(692m) 위→아래, 역방향: 흑포(692m)→수청(0m) 위→아래
    const dToPx = isFwd
      ? (d) => padT + (d / maxDist) * plotH
      : (d) => padT + ((maxDist - d) / maxDist) * plotH;

    // Background
    ctx.fillStyle = 'rgba(15,23,35,0.95)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvasW, HALF_H, 8);
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvasW, HALF_H, 8);
    ctx.stroke();

    // Title
    ctx.fillStyle = color;
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, padL, 16);

    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    for (let t = 0; t <= timeWindow; t += 10) {
      const x = tToPx(t);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      if (t % 20 === 0) {
        ctx.fillStyle = C.textDim;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${t}s`, x, padT + plotH + 14);
      }
    }

    // Signal bands (해당 방향 기준)
    const getSig = isFwd ? getSignalState : getSignalStateReverse;
    intersections.forEach((inter) => {
      const y = dToPx(inter.distance);
      for (let t = 0; t < timeWindow; t += 0.5) {
        const sig = getSig(t, inter);
        const x1 = tToPx(t);
        const x2 = tToPx(t + 0.5);
        ctx.fillStyle =
          sig.state === 'green' ? 'rgba(34,197,94,0.3)' :
          sig.state === 'yellow' ? 'rgba(234,179,8,0.2)' :
          'rgba(239,68,68,0.15)';
        ctx.fillRect(x1, y - 5, x2 - x1, 10);
      }

      // Label
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(inter.name, padL - 6, y + 4);
    });

    // Ideal trajectory line
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const startT = time % timeWindow;
    const orderedInters = isFwd ? intersections : [...intersections].reverse();

    for (let band = -1; band <= 2; band++) {
      ctx.beginPath();
      let started = false;
      orderedInters.forEach((inter) => {
        const travelTime = isFwd
          ? inter.distance / speedMps
          : (maxDist - inter.distance) / speedMps;
        const t = ((startT + travelTime + band * cycle) % timeWindow + timeWindow) % timeWindow;
        const x = tToPx(t);
        const y = dToPx(inter.distance);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Zone leader dots (구역별 선두 차량)
    const margin = 80;
    const pxToM = (px) => ((px - margin) / (canvasW - margin * 2)) * maxDist;
    const dir = isFwd ? 1 : -1;
    const leaderCars = cars.filter(c => c.direction === dir && c.zoneColor);
    const ctTime = time % timeWindow;
    leaderCars.forEach(lead => {
      const dist = Math.max(0, Math.min(maxDist, pxToM(lead.x)));
      const cx = tToPx(ctTime);
      const cy = dToPx(dist);

      // Glow
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = lead.zoneColor;
      ctx.shadowColor = lead.zoneColor;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner dot
      ctx.beginPath();
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    });

    // Current time marker
    const ctX = tToPx(time % timeWindow);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ctX, padT);
    ctx.lineTo(ctX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = C.textMute;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isFwd ? '\uc2dc\uac04(s) \u2192' : '\u2190 \uc2dc\uac04(s)', padL + plotW / 2, padT + plotH + 22);
    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(isFwd ? '\uac70\ub9ac(m) \u2193' : '\uac70\ub9ac(m) \u2193', 0, 0);
    ctx.restore();
  });

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={HALF_H}
      style={{ borderRadius: 12, border: `1px solid ${C.border}`, display: 'block', maxWidth: '100%' }}
    />
  );
}

export default function TSDCanvas({ intersections, cars, time, canvasW, speed }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SingleTSD intersections={intersections} cars={cars} time={time}
        canvasW={canvasW} speed={speed} direction="rev" />
      <SingleTSD intersections={intersections} cars={cars} time={time}
        canvasW={canvasW} speed={speed} direction="fwd" />
    </div>
  );
}
