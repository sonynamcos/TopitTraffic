import { CAR_W, CAR_COLORS_FWD, CAR_COLORS_REV } from '../styles/colors';
import { getSignalState, getSignalStateReverse } from './signal';

// 현실적 물리 상수 (m/s²)
const DECEL_MPS2 = 3.5;    // 편안한 브레이크
const ACCEL_MPS2 = 2.0;    // 일반 가속
const FOLLOW_GAP_M = 8;    // 최소 차간거리
const STOP_MARGIN_M = 100; // 감속 판단 최대 거리

let nextId = 0;

export function spawnCar(direction, speedPxPerSec, canvasW) {
  const colorArr = direction === 1 ? CAR_COLORS_FWD : CAR_COLORS_REV;
  const speedVar = 0.9 + Math.random() * 0.2;
  return {
    id: ++nextId,
    x: direction === 1 ? -CAR_W : canvasW + CAR_W,
    lane: direction === 1 ? 1 : 0,
    direction,
    speed: speedPxPerSec * speedVar,
    maxSpeed: speedPxPerSec * speedVar,
    color: colorArr[Math.floor(Math.random() * colorArr.length)],
    stopped: false,
    braking: false,
  };
}

export function updateCars(cars, intersections, time, dt, mToPx, pxToM, canvasW) {
  const pxPerM = mToPx(1) - mToPx(0);
  const decelPx = DECEL_MPS2 * pxPerM;
  const accelPx = ACCEL_MPS2 * pxPerM;
  const followGapPx = FOLLOW_GAP_M * pxPerM;
  const stopMarginPx = STOP_MARGIN_M * pxPerM;
  const carHalf = CAR_W / 2;

  cars.forEach((car) => {
    const isForward = car.direction === 1;
    let targetSpeed = car.maxSpeed; // 기본: 최고속도까지 가속

    // 1) 신호 정지선 확인 → 정지선에 맞춰 감속
    for (const inter of intersections) {
      const sig = isForward ? getSignalState(time, inter) : getSignalStateReverse(time, inter);
      if (sig.state !== 'red' && sig.state !== 'yellow') continue;

      const interPx = mToPx(inter.distance);
      const stopLine = isForward ? interPx - 28 : interPx + 28;
      const dist = isForward
        ? stopLine - (car.x + carHalf)
        : (car.x - carHalf) - stopLine;

      if (dist > 0 && dist < stopMarginPx) {
        // v² = 2ad → 이 거리에서 멈추려면 필요한 속도
        const safeSpeed = Math.sqrt(2 * decelPx * dist);
        targetSpeed = Math.min(targetSpeed, safeSpeed);
      } else if (dist <= 0 && dist > -5) {
        // 정지선에 도달/약간 지남 → 정지
        targetSpeed = 0;
      }
    }

    // 2) 전방 차량 확인 → 앞차 속도에 맞춰 감속
    for (const other of cars) {
      if (other.id === car.id || other.lane !== car.lane || other.direction !== car.direction) continue;

      let gap;
      if (isForward && other.x > car.x) {
        gap = (other.x - carHalf) - (car.x + carHalf);
      } else if (!isForward && other.x < car.x) {
        gap = (car.x - carHalf) - (other.x + carHalf);
      } else {
        continue;
      }

      if (gap < stopMarginPx) {
        const freeGap = gap - followGapPx;
        if (freeGap <= 0) {
          // 너무 가까움 → 앞차 속도로 제한 (앞차가 가면 따라감)
          targetSpeed = Math.min(targetSpeed, other.speed);
        } else {
          // 여유 있지만 감속 필요할 수 있음
          const safeSpeed = Math.sqrt(2 * decelPx * freeGap) + other.speed * 0.8;
          targetSpeed = Math.min(targetSpeed, safeSpeed);
        }
      }
    }

    // 속도 조절
    if (car.speed > targetSpeed + 0.1) {
      // 감속
      car.braking = true;
      const needed = (car.speed - targetSpeed) / dt;
      const applyDecel = Math.min(needed, decelPx * 2);
      car.speed = Math.max(targetSpeed, car.speed - applyDecel * dt);
      if (car.speed < 0.1) { car.speed = 0; car.stopped = true; }
    } else {
      // 가속 (targetSpeed까지만)
      car.braking = false;
      car.stopped = false;
      car.speed = Math.min(targetSpeed, car.speed + accelPx * dt);
    }

    car.x += car.speed * car.direction * dt;
  });

  // 충돌 해소: 같은 차선의 겹친 차량을 강제 분리
  const minGap = CAR_W + 2;
  const lanes = {};
  cars.forEach(c => {
    const key = `${c.lane}_${c.direction}`;
    (lanes[key] ||= []).push(c);
  });
  for (const group of Object.values(lanes)) {
    const dir = group[0].direction;
    // 선두차부터 정렬 (정방향: x 큰 순, 역방향: x 작은 순)
    group.sort((a, b) => dir === 1 ? b.x - a.x : a.x - b.x);
    for (let i = 1; i < group.length; i++) {
      const ahead = group[i - 1];
      const behind = group[i];
      if (dir === 1) {
        if (behind.x + minGap > ahead.x) {
          behind.x = ahead.x - minGap;
          behind.speed = Math.min(behind.speed, ahead.speed);
        }
      } else {
        if (behind.x - minGap < ahead.x) {
          behind.x = ahead.x + minGap;
          behind.speed = Math.min(behind.speed, ahead.speed);
        }
      }
    }
  }

  return cars.filter((c) => c.x > -100 && c.x < canvasW + 100);
}
