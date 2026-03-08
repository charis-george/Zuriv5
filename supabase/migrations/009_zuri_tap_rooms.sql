-- Zuri Tap hotspot: room with short code. Business turns Tap on → room created; clients join by code.
CREATE TABLE IF NOT EXISTS zuri_tap_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zuri_tap_rooms_code ON zuri_tap_rooms(code);
CREATE INDEX IF NOT EXISTS idx_zuri_tap_rooms_business ON zuri_tap_rooms(business_id);
CREATE INDEX IF NOT EXISTS idx_zuri_tap_rooms_expires ON zuri_tap_rooms(expires_at);

ALTER TABLE zuri_tap_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zuri_tap_rooms service role" ON zuri_tap_rooms FOR ALL USING (true);
