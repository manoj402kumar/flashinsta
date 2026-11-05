-- Migration 10: Create account_links table for Multi-Account Instagram Switching
-- Allows a single creator/user to link multiple Instagram accounts and switch between them with one click.
-- Preserves strict multi-tenant isolation by maintaining separate users rows per account.

CREATE TABLE IF NOT EXISTS public.account_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  linked_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, linked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_links_user_id ON public.account_links(user_id);
CREATE INDEX IF NOT EXISTS idx_account_links_linked_id ON public.account_links(linked_user_id);

ALTER TABLE public.account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own linked accounts" ON public.account_links;
CREATE POLICY "Users can view their own linked accounts"
  ON public.account_links
  FOR SELECT
  USING (auth.uid()::text = user_id::text);
