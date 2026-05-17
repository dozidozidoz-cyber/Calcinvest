/* ============================================================
   CalcInvest — /api/config
   Sert les clés publiques (Supabase URL + anon key) depuis les
   env vars Vercel. La service_role key NE DOIT JAMAIS être ici.

   Vercel → Settings → Environment Variables :
     SUPABASE_URL              https://xxx.supabase.co
     SUPABASE_ANON_KEY         eyJhbGciOiJIUzI1NiIs... (anon public)
     STRIPE_PUBLISHABLE_KEY    pk_live_xxx ou pk_test_xxx (optionnel)
   ============================================================ */

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  const supabaseUrl  = process.env.SUPABASE_URL || null;
  const supabaseKey  = process.env.SUPABASE_ANON_KEY || null;
  const stripePubKey = process.env.STRIPE_PUBLISHABLE_KEY || null;

  return res.status(200).json({
    supabase: supabaseUrl && supabaseKey ? { url: supabaseUrl, anonKey: supabaseKey } : null,
    stripe:   stripePubKey ? { publishableKey: stripePubKey } : null,
    configured: !!(supabaseUrl && supabaseKey),
    env: process.env.VERCEL_ENV || 'unknown'
  });
};
