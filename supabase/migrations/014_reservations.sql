-- Reservations (table bookings / requests)

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  party_size INTEGER DEFAULT 1,
  reserved_for TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reservations_business_id ON reservations(business_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_reserved_for ON reservations(reserved_for);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Service-role driven server logic. Public access can be restricted/expanded later.
CREATE POLICY "Reservations viewable by service role" ON reservations
  FOR ALL USING (true);

