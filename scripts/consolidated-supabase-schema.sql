-- =========================================================================
-- Consolidated Supabase Schema Migration: New Tables, Indexes, and RLS
-- Run this in the Supabase SQL Editor to ensure all tables, indexes,
-- and RLS policies are up-to-date.
-- =========================================================================

-- 1. Table: public.opt_outs
-- Honors Meta Developer Policies for user-initiated opt-out (STOP, UNSUBSCRIBE)
CREATE TABLE IF NOT EXISTS public.opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'opted_out' CHECK (status IN ('opted_out', 'opted_in')),
  opted_out_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, recipient_id)
);

-- 2. Table: public.account_warmup_counters
-- Enforces 14-day progressive account warm-up rate limits
CREATE TABLE IF NOT EXISTS public.account_warmup_counters (
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action_date DATE NOT NULL DEFAULT CURRENT_DATE,
  action_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, action_date)
);

-- 3. Table: public.account_links
-- Enables Instagram-style multi-account switching while preserving tenant isolation
CREATE TABLE IF NOT EXISTS public.account_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  linked_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, linked_user_id)
);

-- ==========================================
-- Performance & High-Traffic Indexes
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_users_page_id ON public.users(page_id);
CREATE INDEX IF NOT EXISTS idx_users_business_account_id ON public.users(business_account_id);
CREATE INDEX IF NOT EXISTS idx_opt_outs_lookup ON public.opt_outs(user_id, recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_warmup_counters_user_date ON public.account_warmup_counters(user_id, action_date);
CREATE INDEX IF NOT EXISTS idx_account_links_user_id ON public.account_links(user_id);
CREATE INDEX IF NOT EXISTS idx_account_links_linked_id ON public.account_links(linked_user_id);

-- ==========================================
-- Row Level Security (RLS) & Policies
-- ==========================================
ALTER TABLE public.opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_warmup_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opt_outs_select_own" ON public.opt_outs;
CREATE POLICY "opt_outs_select_own" ON public.opt_outs
  FOR SELECT TO anon, authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::bigint);

DROP POLICY IF EXISTS "Users can view their own linked accounts" ON public.account_links;
CREATE POLICY "Users can view their own linked accounts"
  ON public.account_links
  FOR SELECT
  USING (auth.uid()::text = user_id::text);
