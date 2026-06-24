-- HOTFIX: run this now if the app shows "permission denied for table …"
-- after supabase-enable-rls.sql. Keeps RLS on (database stays locked down).

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON TABLE contacts TO service_role;
GRANT ALL ON TABLE transactions TO service_role;
GRANT ALL ON TABLE extractions TO service_role;
GRANT ALL ON TABLE transaction_meta TO service_role;
GRANT ALL ON TABLE income_tracker TO service_role;
GRANT ALL ON TABLE gmail_integration TO service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Remove direct public API access (anon key can no longer read/write).
REVOKE ALL ON TABLE contacts FROM anon, authenticated;
REVOKE ALL ON TABLE transactions FROM anon, authenticated;
REVOKE ALL ON TABLE extractions FROM anon, authenticated;
REVOKE ALL ON TABLE transaction_meta FROM anon, authenticated;
REVOKE ALL ON TABLE income_tracker FROM anon, authenticated;
REVOKE ALL ON TABLE gmail_integration FROM anon, authenticated;
