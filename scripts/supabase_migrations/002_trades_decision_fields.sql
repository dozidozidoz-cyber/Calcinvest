-- ============================================================
-- CalcInvest — Journal de Trade : champs de décision
-- Ajoute la thèse, la condition d'invalidation et la raison de
-- sortie à public.trades. À exécuter après 001_trades.sql
-- (Supabase → SQL Editor, une fois). Idempotent.
-- ============================================================

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS thesis       text,   -- pourquoi j'achète, écrit avant l'entrée
  ADD COLUMN IF NOT EXISTS invalidation text,   -- ce qui prouverait que la thèse est fausse
  ADD COLUMN IF NOT EXISTS exit_reason  text;   -- stop | invalidated | target | discretionary

ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_exit_reason_check;
ALTER TABLE public.trades
  ADD CONSTRAINT trades_exit_reason_check
  CHECK (exit_reason IS NULL OR exit_reason IN ('stop', 'invalidated', 'target', 'discretionary'));
