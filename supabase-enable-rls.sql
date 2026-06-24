-- Run once in Supabase → SQL Editor to fix the "RLS disabled in public" alert.
--
-- Before running: ensure Vercel (and local .env) has SUPABASE_SERVICE_ROLE_KEY set.
-- The app reads/writes the database server-side with that key only — it bypasses RLS.
-- After this runs, the public anon key can no longer read or change your data.

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_tracker ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_integration ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies for anon/authenticated — deny-by-default.
-- service_role (used by Next.js API routes) continues to work normally.
