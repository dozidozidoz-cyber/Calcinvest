# Scripts

## `fetch_data.py` — Récupération des données historiques

Génère les fichiers JSON pour les actifs marqués `available: false` dans `assets/data/manifest.json`.

**État actuel (19 avril 2026) : 9 actifs déjà live, 4 ETF UCITS restants à activer.**

### Actifs déjà live (sans action requise)

S&P 500 (depuis 1871), NASDAQ Composite, MSCI World, CAC 40, Nikkei 225, Or, Argent, Pétrole Brent, Euro Stoxx 50.

### Actifs à activer via ce script

- **CW8** — Amundi MSCI World (PEA)
- **CSPX** — iShares Core S&P 500 UCITS
- **EIMI** — iShares Core EM IMI UCITS
- **PANX** — BNPP Easy NASDAQ 100 (PEA)

### Installation

```bash
pip install yfinance pandas
```

### Usage

```bash
# Depuis la racine du projet
python scripts/fetch_data.py
```

Le script va :
1. Lire `assets/data/manifest.json`
2. Pour chaque actif `available: false`, essayer une liste de tickers Yahoo Finance
3. Récupérer les prix mensuels (période max)
4. Écrire `assets/data/{id}.json`
5. Mettre à jour le manifest (`available: true`)

### Options

```bash
# Refresh aussi les actifs déjà présents (utile pour MAJ mensuelle)
python scripts/fetch_data.py --all

# Fetch un seul actif (debug)
python scripts/fetch_data.py --only nasdaq
```

### Si un ticker ne marche pas

Yahoo Finance change parfois les tickers. Si un actif renvoie "No data", édite `ALTERNATIVE_TICKERS` en haut du script pour ajouter des variantes :

```python
ALTERNATIVE_TICKERS = {
    'cspx': ['CSPX.L', 'CSPX.AS', 'CSPX.DE', 'CSPX.SW'],  # ← ajouter ici
    # ...
}
```

Tickers alternatifs utiles :
- ETF UCITS : essayer `.L` (Londres), `.AS` (Amsterdam), `.DE` (Francfort), `.SW` (Suisse), `.PA` (Paris)
- Indices : préfixe `^` obligatoire (`^GSPC`, `^IXIC`, etc.)
- Futures : suffixe `=F` (`GC=F` pour l'or, `SI=F` pour l'argent, `CL=F` pour WTI)

### Refresh périodique

Pour garder les données à jour, relance `python scripts/fetch_data.py --all` une fois par mois, commit, push. Vercel redéploie automatiquement.
