// Dark mode color palette (from 설계서)
export const C = {
  bg:        '#0a0a1a',
  card:      '#161625',
  border:    '#2a2a4a',
  surface:   '#111125',
  text:      '#e2e8f0',
  textMute:  '#64748b',
  textDim:   '#475569',
  green:     '#22c55e',
  red:       '#ef4444',
  yellow:    '#eab308',
  blue:      '#3b82f6',
  orange:    '#f59e0b',
  grid:      'rgba(100,116,139,0.12)',
  roadBg:    '#1E293B',
  roadEdge:  '#475569',
  centerLine:'#FBBF24',
  signalOff: '#1E293B',
  signalBox: '#0F172A',
  signalBdr: '#334155',
};

// Canvas / road dimensions
export const ROAD_Y = 260;
export const ROAD_HEIGHT = 52;
export const LANE_HEIGHT = 26;
export const CAR_W = 10;
export const CAR_H = 5;
export const ROAD_CANVAS_H = 420;
export const TSD_CANVAS_H = 300;
export const YELLOW_TIME = 3;

export const CAR_COLORS_FWD = ['#3B82F6', '#60A5FA', '#2563EB', '#1D4ED8', '#38BDF8'];
export const CAR_COLORS_REV = ['#F59E0B', '#FBBF24', '#F97316', '#FB923C', '#FCD34D'];

// Default intersection data (탑아이티 원본)
export const DEFAULT_INTERSECTIONS = [
  { id: 1, name: '수청4R', cycle: 160, offset: 145, green: 120, distance: 0 },
  { id: 2, name: '대천중', cycle: 160, offset: 40,  green: 80,  distance: 214 },
  { id: 3, name: '한내초', cycle: 160, offset: 130, green: 131, distance: 417 },
  { id: 4, name: '흑포',   cycle: 160, offset: 0,   green: 70,  distance: 692 },
];
