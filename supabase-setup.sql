-- Run this entire file in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── Contacts table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  type         TEXT        NOT NULL CHECK (type IN ('lender', 'title')),
  company_name TEXT        NOT NULL,
  contact_name TEXT        NOT NULL,
  email        TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Internal tool: RLS enabled with no public policies. The Next.js app uses
-- SUPABASE_SERVICE_ROLE_KEY on the server (bypasses RLS). Run
-- supabase-enable-rls.sql on existing databases that still have RLS disabled.
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- ── Transactions table ────────────────────────────────────────────────────────
-- Core transaction fields (live Supabase schema). Shares the same UUID as the
-- corresponding row in `extractions`.
CREATE TABLE IF NOT EXISTS transactions (
  id                       UUID        PRIMARY KEY,
  property_address         TEXT,
  purchase_price           NUMERIC,
  closing_date             DATE,
  acceptance_date          DATE,
  inspection_period_days   INTEGER,
  earnest_money            NUMERIC,
  financing_type           TEXT,
  financing_percentage     NUMERIC,
  contingencies            TEXT[]      DEFAULT '{}',
  source_documents         UUID[]      DEFAULT '{}',
  conflicts_noted          TEXT[]      DEFAULT '{}',
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ── Extractions table ─────────────────────────────────────────────────────────
-- Full extraction payload (JSON) retained for audit / re-processing.
CREATE TABLE IF NOT EXISTS extractions (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type      TEXT,
  file_name          TEXT,
  extracted_data     JSONB,
  flagged_for_review BOOLEAN     DEFAULT false,
  status             TEXT        DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
  status_manual      BOOLEAN     DEFAULT false,
  confidence         NUMERIC,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE extractions ENABLE ROW LEVEL SECURITY;

-- Migration for existing databases (safe to re-run):
-- IMPORTANT: Status actions (Mark as Cancelled / Closed) require these columns.
-- Run this block if cancel/close buttons fail or status stays Active.
ALTER TABLE extractions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE extractions ADD COLUMN IF NOT EXISTS status_manual BOOLEAN DEFAULT false;
UPDATE extractions SET status = 'active' WHERE status IS NULL;

-- ── Transaction meta table ────────────────────────────────────────────────────
-- One row per extraction, stores contact selections, commission data, and
-- any manual worksheet overrides.
CREATE TABLE IF NOT EXISTS transaction_meta (
  transaction_id   UUID        PRIMARY KEY,
  lender_contact_id UUID       REFERENCES contacts(id) ON DELETE SET NULL,
  title_contact_id  UUID       REFERENCES contacts(id) ON DELETE SET NULL,
  commission       JSONB       DEFAULT '{}',
  worksheet        JSONB       DEFAULT '{}',
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transaction_meta ENABLE ROW LEVEL SECURITY;

-- Add seller's title company column (run once; safe to re-run)
ALTER TABLE transaction_meta
  ADD COLUMN IF NOT EXISTS seller_title_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Editable per-transaction parties roster (buyers, sellers, agents, lender,
-- title companies, etc.) used by the Transaction Parties cards and the
-- Transaction Contacts list. Run once; safe to re-run.
ALTER TABLE transaction_meta
  ADD COLUMN IF NOT EXISTS parties JSONB DEFAULT '[]'::jsonb;

-- ── Income tracker (paid flags for coordinator payouts) ───────────────────────
CREATE TABLE IF NOT EXISTS income_tracker (
  id         TEXT        PRIMARY KEY DEFAULT 'default',
  paid_keys  JSONB       DEFAULT '[]'::jsonb,
  close_date_overrides JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE income_tracker ENABLE ROW LEVEL SECURITY;

-- Server-side only (service role). Anon key has no RLS policies.
GRANT ALL ON TABLE income_tracker TO service_role;

INSERT INTO income_tracker (id, paid_keys)
VALUES ('default', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Gmail OAuth tokens (encrypted at rest) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS gmail_integration (
  id                       TEXT        PRIMARY KEY DEFAULT 'default',
  email                    TEXT        NOT NULL,
  access_token_encrypted   TEXT        NOT NULL,
  refresh_token_encrypted  TEXT        NOT NULL,
  expires_at               TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gmail_integration ENABLE ROW LEVEL SECURITY;

-- ── Worksheets storage bucket ────────────────────────────────────────────────
-- Private bucket for generated closing-worksheet PDFs (server-side upload only).
-- Run once; safe to re-run.
INSERT INTO storage.buckets (id, name, public)
VALUES ('worksheets', 'worksheets', false)
ON CONFLICT (id) DO NOTHING;

-- ── Default contacts seed ─────────────────────────────────────────────────────
-- Only inserts if table is empty so this is safe to re-run.
INSERT INTO contacts (type, company_name, contact_name, email, phone)
SELECT * FROM (VALUES
  ('title'::TEXT, 'Watermark Title',    'Ingrid Bredeson', 'teamingrid@wmtitle.com',           '(763) 972-4523'),
  ('title'::TEXT, 'All American Title', 'Lacey Rentz',     'lrentz@allamericantitleco.com',    '(763) 710-8645'),
  ('lender'::TEXT,'Fairway Mortgage',   'Brett Reinhart',  'brett.reinhart@fairwaymc.com',     '(952) 738-1178'),
  ('lender'::TEXT,'Edge Home Finance',  'Josh Little',     'josh@loansbylittle.com',           '(507) 210-7227')
) AS v(type, company_name, contact_name, email, phone)
WHERE NOT EXISTS (SELECT 1 FROM contacts LIMIT 1);

-- ── Contact email corrections (safe to re-run) ────────────────────────────────
UPDATE contacts SET email = 'teamingrid@wmtitle.com'
WHERE contact_name = 'Ingrid Bredeson' AND email = 'ingrid@wmtitle.com';
