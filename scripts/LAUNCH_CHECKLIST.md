# CalcInvest — Checklist mise en ligne

Document de référence pour le go-live de calcinvest.fr.
Coche les étapes au fur et à mesure.

---

## 🔧 Phase 1 — Domaine + Vercel (30 min)

- [ ] Acheter `calcinvest.fr` (OVH ~7€/an ou Gandi ~12€/an)
- [ ] Vercel Dashboard → Project → **Settings → Domains** → Add `calcinvest.fr` + `www.calcinvest.fr`
- [ ] Chez OVH/Gandi, ajouter les enregistrements DNS donnés par Vercel :
  - `A` record racine : `76.76.21.21`
  - `CNAME www` : `cname.vercel-dns.com`
- [ ] Attendre propagation (1-24h, généralement < 1h)
- [ ] Vérifier HTTPS auto (Let's Encrypt) : `https://calcinvest.fr` accessible
- [ ] Redirection `www` → racine (automatique via Vercel si bien configuré)

## 🔑 Phase 2 — Variables d'environnement (5 min)

Dans Vercel → Settings → Environment Variables (Production) :
- [ ] `SUPABASE_URL` = `https://xxx.supabase.co`
- [ ] `SUPABASE_ANON_KEY` = clé anon publique
- [ ] (Optionnel pour plus tard) `STRIPE_*` — pas nécessaire en pre-launch

## ✅ Phase 3 — Smoke test pré-live (2 min)

- [ ] Lancer en local : `node scripts/smoke_test.js`
- [ ] Vérifier "All systems go" en vert
- [ ] Si erreur : corriger avant de continuer

## 🌐 Phase 4 — Vérifications sur le site live (10 min)

Navigation privée sur `https://calcinvest.fr` :
- [ ] Home charge sans erreur console
- [ ] Test 3 outils différents (DCA, FIRE, Allocation) → calculs fonctionnent
- [ ] Mobile : ouvrir Chrome DevTools, vue iPhone (375px), tout responsive
- [ ] Megamenu → tous les outils accessibles
- [ ] Lighthouse score (Chrome DevTools → Lighthouse) :
  - [ ] Performance ≥ 85
  - [ ] Accessibility ≥ 90
  - [ ] SEO ≥ 90
- [ ] `https://calcinvest.fr/sitemap.xml` accessible (50 URLs)
- [ ] `https://calcinvest.fr/robots.txt` accessible
- [ ] PWA installable (Chrome → menu → "Installer l'application")

## 🔍 Phase 5 — Google Search Console (15 min)

- [ ] Aller sur https://search.google.com/search-console
- [ ] **Ajouter une propriété** type "Préfixe d'URL" : `https://calcinvest.fr`
- [ ] Vérification recommandée : **enregistrement TXT DNS** chez OVH/Gandi (le plus fiable, persistant)
- [ ] Une fois vérifié, dans GSC :
  - [ ] **Sitemaps** (gauche) → Ajouter `https://calcinvest.fr/sitemap.xml` → Envoyer
  - [ ] Vérifier statut "Réussi" sous 24h
- [ ] **Inspection d'URL** (barre haut) : demander indexation manuelle des 10 pages prioritaires :

### Top 10 pages à indexer en priorité (SEO long-tail FR fort)

| Priorité | URL | Volume mensuel FR estimé |
|----------|-----|--------------------------|
| 1 | `https://calcinvest.fr/` | — |
| 2 | `https://calcinvest.fr/simulateur-interets-composes` | ~12k |
| 3 | `https://calcinvest.fr/calculateur-fire` | ~3k |
| 4 | `https://calcinvest.fr/simulateur-rendement-locatif` | ~8k |
| 5 | `https://calcinvest.fr/calculateur-salaire-brut-net` | ~25k |
| 6 | `https://calcinvest.fr/simulateur-dca` | ~4k |
| 7 | `https://calcinvest.fr/simulateur-pret` | ~30k |
| 8 | `https://calcinvest.fr/calculateur-impot-revenu` | ~40k |
| 9 | `https://calcinvest.fr/simulateur-dcf` | ~2k |
| 10 | `https://calcinvest.fr/allocation-portefeuille` | ~1k |

**Note** : GSC permet ~10 demandes manuelles par jour. Faire les 10 d'un coup, puis attendre.

## 🔎 Phase 6 — Bing Webmaster Tools (10 min)

- [ ] https://www.bing.com/webmasters
- [ ] Ajouter `calcinvest.fr`
- [ ] **Import depuis Google Search Console** (1 clic, gagne du temps)
- [ ] Vérifier le sitemap est bien repris

## 📊 Phase 7 — Analytics (5 min)

Recommandé : **Vercel Analytics** (gratuit, RGPD-friendly, 0 config) :
- [ ] Vercel Dashboard → Analytics → Enable
- [ ] Affiche : visiteurs, pages vues, Web Vitals, top referrers

Alternative : **Plausible** (9€/mois, plus de détails)

❌ **Éviter Google Analytics** : nécessite bandeau cookies RGPD lourd

## 💰 Phase 8 — Monétisation (optionnel J1, recommandé J+7)

### AdSense (revenu passif)
- [ ] https://www.google.com/adsense → Inscription
- [ ] Ajouter `calcinvest.fr`
- [ ] Coller le script d'auto-ads dans `<head>` de toutes les pages
- [ ] Attendre validation (24-72h)
- [ ] **CPM fintech FR : 1-3 €/1000 visites**

### Affiliation broker (jackpot)
Trade Republic, IBKR, Saxo, Boursobank : 50-150 € par compte ouvert.
- [ ] Trade Republic Partner Programme
- [ ] IBKR Referral
- [ ] Placer 2-3 liens contextuels (ex : sur `/simulateur-dca` : "Ouvrir un compte chez Trade Republic")

## 📢 Phase 9 — Premier coup de bouche-à-oreille (J+7)

Une fois Google a commencé à crawler (vérifier dans GSC "Pages > Indexées" > 10) :

- [ ] **Reddit r/vosfinances** : post avec un outil spécifique (PAS le site brut)
  - Bon exemple : "J'ai fait un comparateur d'allocation 60/40 vs All-Weather vs Permanent — vos retours"
  - Mauvais : "Découvrez mon nouveau site CalcInvest"
- [ ] **Twitter/X FR fintwit** : 1 post court avec screenshot d'un outil + chiffre choquant
  - Exemple : "Saviez-vous qu'en France, la règle des 4 % FIRE = 1.07 M€ et pas 750 k$ ? J'ai fait le calc 👇"
- [ ] **LinkedIn perso** : 1 post court, ciblé pros finance
- [ ] **HackerNews** (Show HN, en anglais) : juste si tu fais une version EN
- [ ] **ProductHunt** : viable mais audience tech, pas finance FR

## 🚨 Phase 10 — Surveillance première semaine

- [ ] Vercel → Logs : checker les 500/404 quotidiennement
- [ ] GSC → Couverture : vérifier les erreurs d'indexation
- [ ] GSC → Performances : suivre l'évolution clicks/impressions
- [ ] Vercel Analytics : durée de session moyenne, taux de rebond
- [ ] Si bug critique → fix immédiat + bump sw.js + push

---

## 📈 Métriques de succès — 30 premiers jours

| Métrique | Cible J+7 | Cible J+30 |
|----------|-----------|------------|
| Pages indexées (GSC) | ≥ 20 | ≥ 45 |
| Visites/jour | ≥ 5 | ≥ 50 |
| Bounce rate | ≤ 70 % | ≤ 60 % |
| Durée session moy. | ≥ 1 min | ≥ 2 min |
| Liens entrants | ≥ 2 | ≥ 10 |

À J+30, si tu atteins ces seuils → activer AdSense + affiliation à fond.
À J+90, si trafic constant > 500/jour → réactiver auth + lancer premium.

---

## 🆘 En cas de problème

- **Vercel down / erreurs build** : vérifier les logs déploiement, rollback au dernier commit OK
- **DNS qui ne propage pas** : `dig calcinvest.fr` depuis terminal, vérifier les enregistrements
- **HTTPS échoue** : attendre 24h, sinon redéclencher dans Vercel Settings → Domains → Refresh
- **Pages 404 inattendues** : vérifier `cleanUrls: true` dans vercel.json (trailing slash)
- **Service Worker bloque l'update** : bump `CACHE_VERSION` dans sw.js + push
- **Supabase erreurs CORS** : vérifier les Auth → URL Configuration dans Supabase dashboard

---

*Mis à jour : 2026-05. Cf. CLAUDE.md pour le contexte projet.*
