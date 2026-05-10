/* ============================================================
   CalcInvest — /api/stripe/create-checkout
   Crée une session Stripe Checkout pour l'abonnement Premium

   GET /api/stripe/create-checkout?user_id=xxx&email=xxx

   ⚙️  CONFIG — à remplir avec tes clés Stripe
   ============================================================ */

/* ----------------------------------------------------------
   🔑  PLACEHOLDER — remplacer par tes vraies clés Stripe
   Dashboard → Developers → API Keys
   ---------------------------------------------------------- */
const STRIPE_SECRET_KEY   = 'sk_test_VOTRE_CLE_SECRETE';
const STRIPE_PRICE_ID     = 'price_VOTRE_PRICE_ID';       // ID du prix mensuel 4,90€
const SUPABASE_URL        = 'https://VOTRE_PROJECT_ID.supabase.co';
const SUPABASE_SERVICE_KEY = 'VOTRE_SERVICE_ROLE_KEY';    // Settings → API → service_role

const Stripe = require('stripe')(STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { user_id, email } = req.query;

  if (!user_id || !email) {
    return res.status(400).json({ error: 'user_id et email requis' });
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
