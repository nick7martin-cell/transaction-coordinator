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

-- service_role is used by Next.js API routes (bypasses RLS, but still needs GRANT).
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON TABLE contacts TO service_role;
GRANT ALL ON TABLE transactions TO service_role;
GRANT ALL ON TABLE extractions TO service_role;
GRANT ALL ON TABLE transaction_meta TO service_role;
GRANT ALL ON TABLE income_tracker TO service_role;
GRANT ALL ON TABLE gmail_integration TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE ALL ON TABLE contacts FROM anon, authenticated;
REVOKE ALL ON TABLE transactions FROM anon, authenticated;
REVOKE ALL ON TABLE extractions FROM anon, authenticated;
REVOKE ALL ON TABLE transaction_meta FROM anon, authenticated;
REVOKE ALL ON TABLE income_tracker FROM anon, authenticated;
REVOKE ALL ON TABLE gmail_integration FROM anon, authenticated;

-- Intentionally no RLS policies for anon/authenticated — deny-by-default.
