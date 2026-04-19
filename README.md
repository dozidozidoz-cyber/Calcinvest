# CalcInvest

Plateforme de simulateurs financiers — vanilla JS + PWA + architecture portable mobile.

## 🚀 Déploiement Vercel

### Option A — Drag & drop (le plus rapide)
1. Va sur [vercel.com/new](https://vercel.com/new)
2. Drag le dossier `calcinvest/` dans la page
3. Deploy → URL live en 30 secondes

### Option B — GitHub (recommandé pour la suite)
1. Crée un repo GitHub, push le contenu de `calcinvest/`
2. Sur Vercel : **New Project → Import Git Repository**
3. Framework preset : **Other** (static site)
4. Build command : laisser vide
5. Output directory : laisser vide
6. Deploy

`vercel.json` s'occupe de tout : clean URLs, cache des assets, headers PWA.

## 📁 Structure

```
calcinvest/
├── index.html                         # Landing
├── simulateur-rendement-locatif.html  # Outil locatif (LIVE)
├── mes-projets.html                   # Gestion projets sauvegardés
├── manifest.json                      # PWA manifest
├── sw.js                              # Service worker
├── vercel.json                        # Config déploiement
├── robots.txt, sitemap.xml
├── _templates/                        # Templates pour nouveaux outils
│   ├── _template.html
│   ├── _template.core.js
│   └── _template.view.js
└── assets/
    ├── css/style.css                  # Design system complet
    ├── icons/icon-192.svg, icon-512.svg
    └── js/
        ├── common.js                  # CI.* : fmt, storage, chart, stepper, toast, modal
        ├── core/                      # ← Logique pure (portable)
        │   ├── finance-utils.js       # PMT, IRR, NPV, amortization, CAGR
        │   └── calc-locatif.js        # Calcul rendement locatif
        └── views/                     # ← Couche DOM
            ├── locatif.view.js
            └── projects.view.js
```

## 🏗️ Architecture

**Principe clé** : séparation stricte entre **logique pure** (`/core/`) et **binding DOM** (`/views/`).

```
       INPUTS (DOM)                     OUTPUTS (DOM)
             ↓                                ↑
    ┌────────────────┐              ┌────────────────┐
    │  view.js       │              │  view.js       │
    │  readForm()    │              │  renderStats() │
    └────────┬───────┘              │  renderChart() │
             │                      │  renderTable() │
             ↓ params               └────────▲───────┘
    ┌─────────────────────────────────────────┐
    │          core/calc-*.js                 │
    │  (ZÉRO DOM, fonctions pures)            │
    │  → portable Node.js / React Native / API│
    └─────────────────────────────────────────┘
```

**Pourquoi ça compte** : le jour où tu veux une app native, un backend, ou des tests unitaires, tu réutilises `/core/` tel quel. Tu remplaces juste `/views/` par le renderer ciblé.

## 🛠️ Ajouter un nouvel outil (ex : DCA)

1. Copier les templates :
   ```bash
   cp _templates/_template.html         simulateur-dca.html
   cp _templates/_template.core.js      assets/js/core/calc-dca.js
   cp _templates/_template.view.js      assets/js/views/dca.view.js
   ```

2. Remplacer les placeholders `{{TOOL}}`, `{{TOOL_CAMEL}}`, `{{TITRE_OUTIL}}`, etc. (checklist en bas des templates).

3. Coder la logique métier dans `calc-dca.js` (pure function).

4. Binder les inputs/outputs dans `dca.view.js` (remplacer les IDs `x-*` par `d-*`).

5. Tester en local : ouvre le `.html` dans un navigateur → ça marche sans build.

## 🎨 Design system

Toutes les variables CSS sont en tête de `style.css` (section **Tokens**). Composants disponibles :

- **`.stepper`** — input numérique avec `±` et unité, support press-and-hold + flèches clavier
- **`.pills` + `data-target`** — presets qui bindent automatiquement sur un input
- **`.accordion`** — section pliable, toggle au clic sur le header
- **`.stat` / `.stats-row`** — KPI avec variantes `.pos`, `.neg`, `.warn`, `.info`
- **`.card`**, **`.chart-wrap`**, **`.data-table`**, **`.info-box`**, **`.tool-card`**
- **`.toast`**, **`.modal`** — programmatique via `CI.toast()` et `CI.modal()`

Tout est déclaratif : tu écris le HTML, `CI.initAll()` câble tout.

## 📱 Futur : app mobile

Cette base est prête pour **Capacitor.js** (wrapping web → iOS/Android natif sans réécrire une ligne) :

```bash
npm install @capacitor/core @capacitor/cli
npx cap init CalcInvest com.calcinvest.app --web-dir=.
npx cap add ios
npx cap add android
npx cap sync
```

Le service worker + manifest PWA fonctionnent déjà en attendant : le site est **installable** sur n'importe quel mobile dès aujourd'hui.

## 🗺️ Roadmap

- **Session 1** ✅ Base infra + Locatif (design system + PWA + Vercel + templates)
- **Session 2** — DCA + Intérêts composés + FIRE
- **Session 3** — DCA Crypto + PER + Plus-value immobilière
- **Session 4+** — SCPI, AV, comparateurs, export PDF

---

© 2026 CalcInvest — Outils de simulation à titre informatif, ne constituent pas un conseil fiscal ou financier.
