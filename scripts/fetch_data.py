"""
CalcInvest — Script de fetch des données historiques
=====================================================

Génère les fichiers JSON pour les actifs non encore disponibles (NASDAQ, CAC 40,
Nikkei, MSCI World, les 5 ETF UCITS, et l'Argent).

Usage :
    pip install yfinance pandas
    python scripts/fetch_data.py

Les fichiers sont écrits dans assets/data/{id}.json et le manifest.json
est automatiquement mis à jour (available: true).

Pour refresh les 4 actifs déjà présents (S&P 500, Or, Brent), passer --all :
    python scripts/fetch_data.py --all

NOTE : si un ticker n'est pas trouvé, essaie une variante (ex: CSPX.AS, CSPX.SW,
CSPX.DE pour les ETF listés sur plusieurs places). Voir ALTERNATIVE_TICKERS.
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import yfinance as yf
    import pandas as pd
except ImportError:
    print("❌ Installation requise : pip install yfinance pandas")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'assets' / 'data'
MANIFEST_PATH = DATA_DIR / 'manifest.json'

# Si le ticker principal du manifest ne renvoie pas de data, on essaie ces alternatives
ALTERNATIVE_TICKERS = {
    'cspx': ['CSPX.L', 'CSPX.AS', 'CSPX.DE', 'CSPX.SW'],
    'eimi': ['EIMI.L', 'EIMI.AS', 'EIMI.DE'],
    'cw8':  ['CW8.PA'],
    'panx': ['PANX.PA', 'PEAG.PA'],
    'paeem': ['C50.PA', 'PCEU.PA', 'MSE.PA'],
    'silver': ['SI=F', 'XAGUSD=X'],
    'msci_world': ['URTH', 'IWDA.L', 'IWDA.AS'],
    'cac40': ['^FCHI'],
    'nikkei': ['^N225'],
    'nasdaq': ['^IXIC'],
}


def fetch_monthly(tickers):
    """Try each ticker in order, return (used_ticker, dataframe) or (None, None)."""
    for t in tickers:
        try:
            df = yf.Ticker(t).history(period='max', interval='1mo', auto_adjust=True)
            if len(df) > 12:  # au moins 1 an de data
                return t, df
        except Exception as e:
            print(f'    ⚠ {t}: {e}')
            continue
    return None, None


def build_json(asset, df, used_ticker):
    """Converts a yfinance DataFrame to our compact JSON format."""
    # Index mensuel, on prend la colonne Close ajustée
    closes = df['Close'].dropna()

    # Keep only month-ends, remove duplicates
    closes = closes.groupby(closes.index.to_period('M')).last()
    dates = [p.strftime('%Y-%m') for p in closes.index]
    prices = [round(float(p), 4) for p in closes.values]

    return {
        'meta': {
            'id': asset['id'],
            'name': asset['name'],
            'ticker': used_ticker,
            'category': asset['category'],
            'currency': asset['currency'],
            'pea': asset['pea'],
            'desc': asset['desc'],
            'source': f'Yahoo Finance ({used_ticker}) — fetched via yfinance'
        },
        'start': dates[0],
        'end': dates[-1],
        'points': len(prices),
        'prices': prices
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all', action='store_true',
                        help='Re-fetch also assets already available')
    parser.add_argument('--only', type=str,
                        help='Fetch only this asset id (ex: --only nasdaq)')
    args = parser.parse_args()

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    fetched_ok = []
    fetched_fail = []

    for asset in manifest['assets']:
        if args.only and asset['id'] != args.only:
            continue
        if asset['available'] and not args.all:
            continue

        aid = asset['id']
        main_ticker = asset['ticker']
        alts = ALTERNATIVE_TICKERS.get(aid, [main_ticker])
        if main_ticker not in alts:
            alts = [main_ticker] + alts

        print(f'\n▶ {aid:12s} | {asset["name"]}')
        print(f'    Trying: {", ".join(alts)}')
        used, df = fetch_monthly(alts)

        if df is None:
            print(f'    ❌ No data found for {aid}')
            fetched_fail.append(aid)
            continue

        out = build_json(asset, df, used)
        out_path = DATA_DIR / f'{aid}.json'
        with open(out_path, 'w') as f:
            json.dump(out, f, separators=(',', ':'))
        size = out_path.stat().st_size
        print(f'    ✓ {used:10s} | {out["start"]} → {out["end"]} | {out["points"]} pts | {size/1024:.1f} KB')
        fetched_ok.append(aid)

    # Update manifest : flag available=true for all fetched
    if fetched_ok:
        for asset in manifest['assets']:
            if asset['id'] in fetched_ok:
                asset['available'] = True
        with open(MANIFEST_PATH, 'w') as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f'\n{"=" * 50}')
    print(f'✅ Success : {len(fetched_ok)} actifs')
    if fetched_fail:
        print(f'❌ Échecs  : {", ".join(fetched_fail)}')
        print(f'   → Ajoute des tickers alternatifs dans ALTERNATIVE_TICKERS')


if __name__ == '__main__':
    main()
