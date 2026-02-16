-- TopIT 보령시 교통신호 DB - Supabase Schema
-- Run this in your Supabase SQL Editor

-- ── intersections 테이블 ──
CREATE TABLE IF NOT EXISTS intersections (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  alias TEXT[] DEFAULT '{}',
  type TEXT DEFAULT '',
  manufacturer TEXT DEFAULT 'unknown',
  status TEXT DEFAULT '미확인',
  notes TEXT DEFAULT '',
  has_dat BOOLEAN DEFAULT false,
  has_cycle_table BOOLEAN DEFAULT false,
  dat_phases INT,
  dat_cycle INT,
  dat JSONB,
  cycle_table JSONB,
  replacement JSONB,
  classification JSONB,
  lat FLOAT,
  lng FLOAT,
  address TEXT DEFAULT '',
  routes TEXT[] DEFAULT '{}',
  controller_model TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── intersection_history 테이블 ──
CREATE TABLE IF NOT EXISTS intersection_history (
  id SERIAL PRIMARY KEY,
  intersection_id INT REFERENCES intersections(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  action TEXT,
  "by" TEXT DEFAULT 'web',
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── route_diagram 테이블 (단일 행) ──
CREATE TABLE IF NOT EXISTS route_diagram (
  id SERIAL PRIMARY KEY,
  nodes JSONB DEFAULT '[]',
  edges JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 초기 행 삽입 (요도 데이터용)
INSERT INTO route_diagram (nodes, edges) VALUES ('[]', '[]')
ON CONFLICT DO NOTHING;

-- ── 인덱스 ──
CREATE INDEX IF NOT EXISTS idx_intersections_manufacturer ON intersections(manufacturer);
CREATE INDEX IF NOT EXISTS idx_intersections_status ON intersections(status);
CREATE INDEX IF NOT EXISTS idx_intersections_has_dat ON intersections(has_dat);
CREATE INDEX IF NOT EXISTS idx_intersections_has_cycle_table ON intersections(has_cycle_table);
CREATE INDEX IF NOT EXISTS idx_history_intersection_id ON intersection_history(intersection_id);

-- ── RLS (Row Level Security) ──
-- 공개 읽기, 인증 없이 쓰기 허용 (내부 도구이므로)
ALTER TABLE intersections ENABLE ROW LEVEL SECURITY;
ALTER TABLE intersection_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_diagram ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read intersections" ON intersections FOR SELECT USING (true);
CREATE POLICY "Allow public insert intersections" ON intersections FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update intersections" ON intersections FOR UPDATE USING (true);
CREATE POLICY "Allow public delete intersections" ON intersections FOR DELETE USING (true);

CREATE POLICY "Allow public read history" ON intersection_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert history" ON intersection_history FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read route_diagram" ON route_diagram FOR SELECT USING (true);
CREATE POLICY "Allow public update route_diagram" ON route_diagram FOR UPDATE USING (true);

-- ── Storage 버킷 ──
INSERT INTO storage.buckets (id, name, public) VALUES ('dat-files', 'dat-files', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('cycle-tables', 'cycle-tables', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies (public read/write)
CREATE POLICY "Allow public read dat-files" ON storage.objects FOR SELECT USING (bucket_id = 'dat-files');
CREATE POLICY "Allow public upload dat-files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dat-files');
CREATE POLICY "Allow public overwrite dat-files" ON storage.objects FOR UPDATE USING (bucket_id = 'dat-files');
CREATE POLICY "Allow public read cycle-tables" ON storage.objects FOR SELECT USING (bucket_id = 'cycle-tables');
CREATE POLICY "Allow public upload cycle-tables" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cycle-tables');
CREATE POLICY "Allow public overwrite cycle-tables" ON storage.objects FOR UPDATE USING (bucket_id = 'cycle-tables');
