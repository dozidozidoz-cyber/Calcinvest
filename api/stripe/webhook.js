/* ============================================================
   CalcInvest — /api/stripe/webhook
   Reçoit les events Stripe et met à jour Supabase

   Events gérés :
   - checkout.session.completed → active le premium
   - customer.subscription.deleted → désactive le premium
   - invoice.payment_failed → désactive le premium

   ⚙️  CONFIG — à remplir avec tes clés
   ============================================================ */

// 🔑 Variables d'environnement (Vercel → Settings → Env Vars)
//    STRIPE_SECRET_KEY       sk_live_xxx ou sk_test_xxx
//    STRIPE_WEBHOOK_SECRET   whsec_xxx (Stripe → Webhooks → Signing secret)
//    SUPABASE_URL            https://xxx.supabase.co
//    SUPABASE_SERVICE_KEY    service_role key
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[stripe/webhook] Missing required env vars');
}

const Stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

/* Met à jour user_metadata dans Supabase via Admin API */
async function updateUserPlan(userId, plan, premiumUntil) {
  const body = {
    user_metadata: {
      plan,
      premium_until: premiumUntil || null,
    }
  };

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase update failed: ' + err);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!Stripe) return res.status(503).json({ error: 'Webhook non configuré' });

  // Récupère le body brut pour vérifier la signature Stripe
  const sig  = req.headers['stripe-signature'];
  let event;

  try {
    // Vercel expose req.body comme Buffer si tu l'as configuré
    const rawBody = req.body;
    event = Stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature invalide:', err.message);
    return res.status(400).json({ error: 'Webhook signature invalide' });
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId  = session.metadata?.user_id;
        if (!userId) break;

        // Récupère la subscription pour connaître la date de fin
        const sub = await Stripe.subscriptions.retrieve(session.subscription);
        const until = new Date(sub.current_period_end * 1000).toISOString();

        await updateUserPlan(userId, 'premium', until);
        console.log(`[webhook] Premium activé : user=${userId} jusqu'au ${until}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const sub     = await Stripe.subscriptions.retrieve(invoice.subscription);
        const userId  = sub.metadata?.user_id;
        if (!userId) break;

        const until = new Date(sub.current_period_end * 1000).toISOString();
        await updateUserPlan(userId, 'premium', until);
        console.log(`[webhook] Renouvellement premium : user=${userId} jusqu'au ${until}`);
        break;
      }

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj    = event.data.object;
        const subId  = obj.subscription || obj.id;
        const sub    = await Stripe.subscriptions.retrieve(subId).catch(() => null);
        const userId = sub?.metadata?.user_id || obj.metadata?.user_id;
        if (!userId) break;

        await updateUserPlan(userId, 'free', null);
        console.log(`[webhook] Premium désactivé : user=${userId}`);
        break;
      }

      default:
        // Event non géré, ignorer
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[webhook] Erreur traitement:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
