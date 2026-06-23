-- Run this in Supabase → SQL Editor if the Income page shows
-- "permission denied for table income_tracker".

CREATE TABLE IF NOT EXISTS income_tracker (
  id         TEXT        PRIMARY KEY DEFAULT 'default',
  paid_keys  JSONB       DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE income_tracker DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE income_tracker TO anon, authenticated, service_role;

INSERT INTO income_tracker (id, paid_keys)
VALUES ('default', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
