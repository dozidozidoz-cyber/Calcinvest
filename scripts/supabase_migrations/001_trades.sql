-- ============================================================
-- CalcInvest — Schema Journal de Trade
-- Table : public.trades (1 row = 1 trade)
-- RLS : chaque utilisateur ne voit que ses propres trades
-- À exécuter dans Supabase → SQL Editor (une fois)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trades (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identification du trade
  instrument    text        NOT NULL,                              -- 'EUR/USD', 'BTC/USD', 'AAPL'...
  category      text        DEFAULT 'forex',                       -- forex/crypto/stock/index/commodity
  side          text        NOT NULL CHECK (side IN ('long', 'short')),

  -- Timing
  entry_date    timestamptz NOT NULL DEFAULT now(),
  exit_date     timestamptz,                                       -- NULL = trade ouvert

  -- Prix & taille
  entry_price   numeric     NOT NULL,
  exit_price    numeric,                                           -- NULL si encore ouvert
  size          numeric     NOT NULL DEFAULT 1,                    -- units brutes (1 lot=100k pour forex, 1 BTC, etc.)
  size_unit     text        DEFAULT 'units',                       -- 'lot' | 'units' | 'shares' | 'BTC'...

  -- Money management
  stop_loss     numeric,
  take_profit   numeric,
  risk_amount   numeric,                                           -- € risqué initialement
  fees          numeric     DEFAULT 0,                             -- commissions + spread + swap
  pnl           numeric,                                           -- P&L net en € du compte
  pnl_pct       numeric,                                           -- P&L en % du capital

  -- Métadonnées qualitatives
  strategy      text,                                              -- 'breakout', 'reversal', 'pullback'...
  setup         text,                                              -- description courte
  notes         text,
  tags          text[],                                            -- ['news', 'momentum', 'fomo']
  screenshot_url text,
  rating        smallint    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),  -- auto-évaluation 1-5

  -- Sentiment
  emotion_pre   text,                                              -- 'confident', 'fomo', 'fearful'
  emotion_post  text,
  followed_plan boolean,

  -- Timestamps
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_trades_user_id    ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON public.trades(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_entry ON public.trades(user_id, entry_date DESC);

-- ─── Row Level Security ────────────────────────────────────
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own trades" ON public.trades;
CREATE POLICY "Users can read own trades"
  ON public.trades FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own trades" ON public.trades;
CREATE POLICY "Users can insert own trades"
  ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own trades" ON public.trades;
CREATE POLICY "Users can update own trades"
  ON public.trades FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own trades" ON public.trades;
CREATE POLICY "Users can delete own trades"
  ON public.trades FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Trigger pour updated_at ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trades_updated_at ON public.trades;
CREATE TRIGGER trg_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Vérification ──────────────────────────────────────────
-- Lance après migration :
--   SELECT * FROM public.trades LIMIT 1;     -- doit renvoyer 0 lignes mais sans erreur
--   SELECT count(*) FROM pg_policies WHERE tablename = 'trades';  -- doit être 4
