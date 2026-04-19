# CalcInvest — Context for Claude Code

> Ce fichier est lu automatiquement par Claude Code au début de chaque session. Il contient tout le contexte nécessaire pour travailler sur le projet sans avoir à re-expliquer l'architecture, les conventions ou la roadmap.

---

## 🎯 Produit

**CalcInvest** — Plateforme web de simulateurs financiers pour le marché francophone (puis anglophone en phase 2). Monétisation : AdSense, affiliation (courtiers, exchanges crypto, SCPI, néobanques), abonnement premium (€3-5/mois).

**Produit cible** : niveau de qualité équivalent à [backtest-ashy.vercel.app](https://backtest-ashy.vercel.app) — dashboard fintech sérieux avec analyses statistiques poussées, scénarios historiques, graphiques multi-séries.

**Utilisateur** : Nicolas, 30 ans, chef saisonnier, relocation Asie du Sud-Est, bases Python/JS, préfère réponses directes, casual, français, zéro bullshit.

---

## 🏗️ Architecture

**Stack** : HTML/CSS/JS vanilla, aucun build step, aucune dépendance runtime.

**Principe clé** : séparation stricte `core/` (logique pure) ↔ `views/` (DOM binding). Permet de porter l'app sur React Native / API / tests sans réécrire la logique.

```
calcinvest/
├── index.html                         # Landing (tool-cards)
├── simulateur-rendement-locatif.html  # Outil 1 : LIVE
├── simulateur-dca.html                # Outil 2 : LIVE (7 analyses, 3 implémentées)
├── mes-projets.html                   # Gestion projets sauvegardés
├── manifest.json                      # PWA manifest
├── sw.js                              # Service worker (cache v3)
├── vercel.json                        # Config clean URLs + headers
├── robots.txt, sitemap.xml
├── _templates/                        # Templates pour créer un nouvel outil
├── scripts/
│   ├── fetch_data.py                  # Fetch yfinance pour ETF UCITS
│   └── README.md
└── assets/
    ├── css/style.css                  # Design system complet (tokens + composants)
    ├── icons/icon-192.svg, icon-512.svg
    ├── data/
    │   ├── manifest.json              # Liste maître des 13 actifs
    │   ├── sp500.json                 # Enrichi : prices, dividends, cpi, pe10
    │   ├── nasdaq.json, nikkei.json, cac40.json, msci_world.json
    │   ├── paeem.json                 # Euro Stoxx 50 (proxy PAEEM)
    │   ├── gold.json, silver.json, oil_brent.json, oil_wti.json
    │   └── (cw8, cspx, eimi, panx : SOON, à fetch via yfinance)
    └── js/
        ├── common.js                  # CI.* : fmt, storage, chart, stepper, toast, modal
        ├── core/                      # ← Logique pure, portable
        │   ├── finance-utils.js       # PMT, IRR, NPV, amortization, CAGR
        │   ├── calc-locatif.js        # Rendement locatif
        │   └── calc-dca.js            # DCA v2 (divs, TER, inflation, cash, stats)
        └── views/                     # ← Couche DOM
            ├── locatif.view.js
            ├── dca.view.js            # v2 avec 3 analyses + placeholders
            └── projects.view.js
```

### Principes de code

- **Vanilla JS uniquement** — pas de React, Vue, Svelte. Pas de build step.
- **Tokens CSS centralisés** en tête de `style.css`. Un seul endroit pour changer le thème.
- **IDs préfixés par outil** : `l-*` (locatif), `d-*` (DCA), `c-*` (compound). Stats = `ls-*`, `ds-*`, etc. Évite les collisions si plusieurs outils partagent la page.
- **URL state** : chaque outil sérialise ses params dans l'URL (`CI.setUrlParams`) → partageable.
- **localStorage** : projets sauvegardés sous clé `calcinvest_projects_v1`.
- **No tracking, no analytics** pour l'instant. AdSense/affiliation viendra quand trafic établi.
- **PWA ready** : manifest + service worker. Installable dès maintenant, prête pour Capacitor plus tard (mobile app sans réécrire).

---

## 🎨 Design system

**Inspiration** : backtest-ashy.vercel.app (dark fintech, accent mint).

**Tokens principaux** (dans `assets/css/style.css`) :
- Background : `#0A0F14` (pas pur noir, nuance vert-bleu)
- Accent : `#34D399` (emerald-400)
- Red : `#F87171`, Yellow : `#FBBF24`, Purple : `#A78BFA`, Blue : `#60A5FA`
- Fonts : `Inter` (sans), `JetBrains Mono` (mono)

**Composants standard** (tous définis dans style.css) :
- `.stepper` — input numérique `[−|value|unit|+]` avec press-and-hold + flèches. Init via `CI.initSteppers()`.
- `.pills[data-target]` — presets qui bindent automatiquement un input. Init via `CI.initPills()`.
- `.accordion` — section pliable. Init via `CI.initAccordions()`.
- `.stat`, `.stats-row` — KPI avec variantes `.pos`/`.neg`/`.warn`/`.info`.
- `.card`, `.chart-wrap`, `.data-table`, `.info-box`.
- `.tool-card` — cards du landing avec `--card-color` personnalisable.
- `.toast`, `.modal` — programmatique via `CI.toast()`, `CI.modal()`, `CI.promptSave()`.

**Règle d'or** : toujours utiliser les tokens CSS (`var(--accent)`, etc.) plutôt que des couleurs en dur. Le jour où on swap de thème, c'est un seul fichier à toucher.

---

## 📊 API interne (common.js → namespace `CI`)

```javascript
// Format
CI.fmtNum(n, dec)      // "12 345"
CI.fmtMoney(n, dec)    // "12 345 €"
CI.fmtPct(n, dec)      // "+5.2 %" (signé)
CI.fmtPctPlain(n, dec) // "5.2 %"
CI.fmtCompact(n)       // "12 k€" / "1.2 M€"
CI.fmtDate(ts)         // "18 avr. 2026"

// Storage
CI.getProjects() / saveProject(p) / getProject(id) / deleteProject(id)
CI.exportProjects() / importProjects(file)

// URL
CI.getUrlParam(key) / setUrlParams({k:v}) / copyShareUrl()

// UI
CI.toast(msg, type, duration)     // type: '', 'success', 'error', 'warn'
CI.modal({title, body, onConfirm})
CI.promptSave(type, data, defaultName, cb)

// Components (auto-init via initAll)
CI.initSteppers(root) / initPills(root) / initAccordions(root) / initAll(root)

// Charts
CI.drawChart(canvasId, labels, datasets, opts)
// datasets: [{ data, color, fill?, fillColor?, width?, dash? }]
```

---

## 🧮 Core finance (finance-utils.js → namespace `FIN`)

```javascript
FIN.pmt(rate, nper, pv)              // Paiement périodique (Excel PMT)
FIN.ipmt(rate, per, nper, pv)        // Part intérêts
FIN.ppmt(rate, per, nper, pv)        // Part capital
FIN.amortization(annualRate, years, principal, {insuranceRate})
FIN.npv(rate, cashflows)             // Valeur actualisée nette
FIN.irr(cashflows, guess)            // Taux interne de rentabilité (Newton + bisection)
FIN.fv(rate, nper, pmt, pv)          // Valeur future
FIN.cagr(start, end, years)          // Taux de croissance annuel composé
FIN.realRate(nominal, inflation)     // Fisher equation
FIN.yearsToGoal(goal, rate, pmt, pv) // Temps pour atteindre un objectif
FIN.num(v, fallback)                 // Parse safe
```

Module testé : `node -e "const FIN = require('./assets/js/core/finance-utils.js'); ..."`.

---

## 📈 État des outils

| Outil | Fichier | Statut |
|---|---|---|
| **Rendement locatif** | `simulateur-rendement-locatif.html` | ✅ LIVE complet |
| **DCA / Placement bourse** | `simulateur-dca.html` | ✅ LIVE (3/7 analyses implémentées) |
| **Mes projets** | `mes-projets.html` | ✅ LIVE |
| Intérêts composés | — | 🔜 À faire (Session 4+) |
| FIRE | — | 🔜 À faire |
| PER | — | 🔜 À faire |
| DCA Crypto | — | 🔜 À faire |

### État du simulateur DCA (7 analyses)

| # | Analyse | Statut |
|---|---|---|
| 01 | Vue d'ensemble (stats + chart 4 séries) | ✅ Implémenté |
| 02 | Rendements glissants (heatmap année × durée) | 🔜 Placeholder |
| 03 | Lump sum vs DCA étalé | 🔜 Placeholder |
| 04 | Histogramme rendements annuels | ✅ Implémenté |
| 05 | Drawdown historique (underwater chart) | ✅ Implémenté |
| 06 | Volatilité glissante + CAPE | 🔜 Placeholder (data CAPE déjà dans sp500.json via `pe10`) |
| 07 | Prévisions Monte Carlo (bootstrap 2000 trajectoires) | 🔜 Placeholder |

### Features du DCA déjà codées

- Scénarios historiques (1929, 1937, 1973, 1987, 2000, 2007, 2020, 2022, "Aujourd'hui")
- Mode Durée fixe / Sortie fixe
- Déploiement En une fois / DCA étalé (12 mois)
- Dividendes réinvestis (S&P 500 uniquement — data Shiller)
- Pouvoir d'achat (inflation-adjusted via CPI US, S&P 500 uniquement)
- Frais ETF (TER) paramétrable
- Comparaison cash (Livret A 2%, Boosté 4%, etc.)
- Chart Analyse 01 avec 4 séries (Portefeuille / Versé / Cash / Sans frais)

---

## 📂 Actifs disponibles (13 total, 9 LIVE, 4 SOON)

Manifest : `assets/data/manifest.json`. Format JSON par actif :
```json
{
  "meta": { "id", "name", "ticker", "category", "currency", "pea", "desc", "source" },
  "start": "YYYY-MM", "end": "YYYY-MM", "points": N,
  "prices": [...],
  "dividends": [...]   // S&P 500 only (monthly annualized/12)
  "cpi": [...],        // S&P 500 only (CPI US mensuel Shiller)
  "pe10": [...]        // S&P 500 only (CAPE Shiller PE 10Y)
}
```

**LIVE (9)** :
- `sp500` (1871 → 2026) — enrichi divs + CPI + PE10
- `nasdaq` (2011 → 2024), `nikkei` (2011 → 2024), `cac40` (2011 → 2024)
- `msci_world` (2012 → 2025), `paeem` Euro Stoxx 50 (2011 → 2025)
- `gold` (1833 → 2026), `silver` (2011 → 2024)
- `oil_brent` (1987 → 2026), `oil_wti` (1986 → 2026)

**SOON (4)** ETF UCITS : `cw8`, `cspx`, `eimi`, `panx` — à activer avec `python scripts/fetch_data.py` (yfinance).

---

## 🗺️ Roadmap prochaines sessions

**Session 4** — Compléter Analyses 02 (heatmap rendements glissants) + 03 (Lump vs DCA). Analyses "simples" basées sur la data existante.

**Session 5** — Analyse 06 (Volatilité glissante 12 mois + CAPE vs moyenne historique). La CAPE est déjà dans `sp500.json` (`pe10`), c'est du pur calcul.

**Session 6** — Analyse 07 (Monte Carlo bootstrap). Le gros morceau : 2000 trajectoires rééchantillonnant les rendements mensuels historiques.

**Session 7+** — Nouveaux outils :
1. **Intérêts composés** (12K recherches/mois FR — gros trafic)
2. **FIRE** (niche vierge, règle des 4%)
3. **PER** (affiliation bancaire lucrative)
4. **DCA Crypto** (séparé de la finance trad)

**Phase 2 (Y2)** — Version EN (`calcinvest.com`). Clone i18n, adaptation fiscalité (ISA/SIPP, 401k/Roth), affiliation EN (eToro, IBKR, Kraken).

---

## 🛠️ Workflow dev

**Zero build step** — ouvrir `index.html` dans un navigateur, ça marche. Pour dev local avec HTTP (évite CORS sur fetch `/assets/data/*.json`) :
```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

**Tests core** (Node.js, pur) :
```bash
node -e "
const FIN = require('./assets/js/core/finance-utils.js');
global.FIN = FIN;
const { calcDCA } = require('./assets/js/core/calc-dca.js');
// ...
"
```

**Déploiement** : Vercel auto-deploy sur push vers `main` du repo GitHub. `vercel.json` gère tout (clean URLs, cache headers, PWA).

**Data refresh** (pour ajouter les 4 ETF UCITS manquants ou mettre à jour les cours) :
```bash
pip install yfinance pandas
python scripts/fetch_data.py         # fetch seulement les SOON
python scripts/fetch_data.py --all   # refresh tout
git add assets/data/
git commit -m "data: monthly refresh"
git push
```

---

## 📝 Conventions de code

### Créer un nouvel outil

Utiliser `_templates/_template.html`, `_template.core.js`, `_template.view.js`. Checklist :

1. Copier les 3 templates en remplaçant `{{TOOL}}` (kebab-case) et `{{TOOL_CAMEL}}` (PascalCase)
2. Préfixer tous les IDs par un caractère unique (`d-`, `c-`, `f-`...)
3. Logique métier dans `core/calc-xxx.js` (pure, zéro DOM)
4. Binding DOM dans `views/xxx.view.js`
5. Ajouter dans `sitemap.xml`
6. Ajouter une `.tool-card` dans `index.html`
7. Ajouter le type dans `TOOL_URLS` + `TOOL_META` de `views/projects.view.js`
8. Ajouter le préfixe d'ID dans le CSS si besoin de specific styling
9. Lier aux scripts : `common.js` + `core/finance-utils.js` + `core/calc-xxx.js` + `views/xxx.view.js`

### Ajouter une analyse au simulateur DCA

Le fichier `views/dca.view.js` a des fonctions `renderAnalyse01(...)`, `renderAnalyse04(...)`, `renderAnalyse05(...)` qui sont appelées par `run()`. Pour implémenter l'Analyse 02 (par exemple) :

1. Dans `core/calc-dca.js` : ajouter une fonction pure `computeRollingReturns(prices, seriesStart, durationsYears)` qui renvoie les données nécessaires (2D array : year × duration → CAGR).
2. Dans `simulateur-dca.html` : remplacer la `.placeholder-card` du `<section id="a2">` par les stats + container de chart/heatmap.
3. Dans `views/dca.view.js` : ajouter `renderAnalyse02(form, r)` qui appelle la fonction core et fait le DOM. L'appeler dans `run()`.

Pattern : **jamais de logique de calcul dans la view, jamais d'accès DOM dans le core**.

### Git

Branch unique `main`. Commits courts, en français, préfixés par le scope :
- `feat: dca rendements glissants`
- `fix: drawdown recovery time`
- `data: monthly refresh`
- `style: tokens CSS cleanup`
- `docs: update CLAUDE.md`

---

## 📞 Préférences de communication

- **Langue** : français
- **Ton** : direct, casual, zéro intro marketing
- **Format** : réponses concises, code complet prêt à déployer
- **Pas de** : intros polies, résumés inutiles, disclaimers génériques
- **Multi-options** : proposer 2-3 pistes max quand pertinent, avec une recommandation claire
- **Critique** : OK pour pointer les mauvaises idées, suggérer des alternatives
