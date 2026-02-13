import { YELLOW_TIME } from '../styles/colors';

/**
 * 정방향 신호 상태 계산
 * phases[0] = 주 녹색 시간, 황색 3초 고정, 나머지 = 적색
 */
export function getSignalState(time, intersection) {
  const { cycle, offset, green } = intersection;
  const t = (((time - offset) % cycle) + cycle) % cycle;
  const greenTime = green || 0;

  if (t < greenTime) return { state: 'green', remaining: greenTime - t };
  if (t < greenTime + YELLOW_TIME) return { state: 'yellow', remaining: greenTime + YELLOW_TIME - t };
  return { state: 'red', remaining: cycle - t };
}

/**
 * 역방향 신호 상태 (주도로 양방향 동일 신호)
 */
export function getSignalStateReverse(time, intersection) {
  return getSignalState(time, intersection);
}
