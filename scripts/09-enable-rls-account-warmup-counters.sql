-- =========================================================================
-- Migration: Enable Row Level Security (RLS) on public.account_warmup_counters
--
-- Security fix: Prevents unauthorized anonymous / public access via anon key.
-- Server code using service-role key continues to bypass RLS.
-- Authenticated users can only read and manage their own counter rows.
-- =========================================================================

-- 1. Enable Row Level Security
ALTER TABLE public.account_warmup_counters ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any (idempotency)
DROP POLICY IF EXISTS "account_warmup_counters_select_own" ON public.account_warmup_counters;
DROP POLICY IF EXISTS "account_warmup_counters_insert_own" ON public.account_warmup_counters;
DROP POLICY IF EXISTS "account_warmup_counters_update_own" ON public.account_warmup_counters;
DROP POLICY IF EXISTS "account_warmup_counters_delete_own" ON public.account_warmup_counters;

-- 3. Per-user ownership policies
-- In this schema, user_id is BIGINT matching the user's ID stored in the JWT claims (`sub`).
-- Unauthenticated requests (where JWT claims are null) evaluate to NULL/false and are denied.

-- SELECT: Signed-in users can only view their own warmup counters
CREATE POLICY "account_warmup_counters_select_own" ON public.account_warmup_counters
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- INSERT: Signed-in users can only insert counters for their own user_id
CREATE POLICY "account_warmup_counters_insert_own" ON public.account_warmup_counters
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- UPDATE: Signed-in users can only update their own warmup counters
CREATE POLICY "account_warmup_counters_update_own" ON public.account_warmup_counters
  FOR UPDATE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint)
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

-- DELETE: Signed-in users can only delete their own warmup counters
CREATE POLICY "account_warmup_counters_delete_own" ON public.account_warmup_counters
  FOR DELETE TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);
