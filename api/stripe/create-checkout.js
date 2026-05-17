/* ============================================================
   CalcInvest — /api/stripe/create-checkout
   Crée une session Stripe Checkout pour l'abonnement Premium

   GET /api/stripe/create-checkout?user_id=xxx&email=xxx

   ⚙️  CONFIG — à remplir avec tes clés Stripe
   ============================================================ */

/* ----------------------------------------------------------
   🔑  Variables d'environnement (Vercel → Settings → Env Vars)
       Production : Stripe live keys + Supabase prod
       Preview/Dev : Stripe test keys
   Configurer :
     STRIPE_SECRET_KEY        sk_live_xxx ou sk_test_xxx
     STRIPE_PRICE_ID          price_xxx (4,90 €/mois)
     STRIPE_PRICE_ID_ANNUAL   price_xxx (49 €/an) — optionnel
     SUPABASE_URL             https://xxx.supabase.co
     SUPABASE_SERVICE_KEY     service_role key
   ---------------------------------------------------------- */
const STRIPE_SECRET_KEY    = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID      = process.env.STRIPE_PRICE_ID;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
  console.error('[stripe/create-checkout] Missing env vars STRIPE_SECRET_KEY or STRIPE_PRICE_ID');
}

const Stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { user_id, email } = req.query;

  if (!user_id || !email) {
    return res.status(400).json({ error: 'user_id et email requis' });
  }

  if (!Stripe) {
    return res.status(503).json({ error: 'Service de paiement non configuré (env vars manquantes)' });
  }

  try {
    const session = await Stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price: STRIPE_PRICE_ID,
        quantity: 1,
      }],
      metadata: {
        user_id,  // On retrouve le user Supabase dans le webhook
      },
      subscription_data: {
        metadata: { user_id },
      },
      success_url: `${req.headers.origin || 'https://calcinvest.fr'}/abonnement?success=1`,
      cancel_url:  `${req.headers.origin || 'https://calcinvest.fr'}/abonnement?cancel=1`,
      locale: 'fr',
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('[create-checkout]', err.message);
    return res.status(500).json({ error: 'Erreur création session Stripe : ' + err.message });
  }
};
