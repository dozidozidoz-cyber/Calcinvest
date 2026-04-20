"""
CalcInvest — Fetch données historiques crypto
=============================================

Génère les fichiers JSON mensuels pour BTC, ETH, XRP, BNB, SOL
avec le maximum d'historique disponible sur Yahoo Finance.

Usage :
    python scripts/fetch_crypto.py
    python scripts/fetch_crypto.py --only btc
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

ROOT     = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'assets' / 'data'

CRYPTOS = [
    {
        'id':       'btc',
        'name':     'Bitcoin',
        'ticker':   'BTC-USD',
        'symbol':   'BTC',
        'color':    '#F7931A',
        'desc':     'La première cryptomonnaie, réserve de valeur décentralisée. Capitalisation #1.',
        'alts':     ['BTC-USD'],
    },
    {
        'id':       'eth',
        'name':     'Ethereum',
        'ticker':   'ETH-USD',
        'symbol':   'ETH',
        'color':    '#627EEA',
        'desc':     'Plateforme de smart contracts. Capitalisation #2. Proof-of-Stake depuis 2022.',
        'alts':     ['ETH-USD'],
    },
    {
        'id':       'xrp',
        'name':     'XRP (Ripple)',
        'ticker':   'XRP-USD',
        'symbol':   'XRP',
        'color':    '#00AAE4',
        'desc':     'Protocole de paiements internationaux rapides. Forte adoption bancaire.',
        'alts':     ['XRP-USD'],
    },
    {
        'id':       'bnb',
        'name':     'BNB (Binance)',
        'ticker':   'BNB-USD',
        'symbol':   'BNB',
        'color':    '#F3BA2F',
        'desc':     "Token natif de la Binance Smart Chain. Utilité : frais réduits sur l'exchange.",
        'alts':     ['BNB-USD'],
    },
    {
        'id':       'sol',
        'name':     'Solana',
        'ticker':   'SOL-USD',
        'symbol':   'SOL',
        'color':    '#9945FF',
        'desc':     'Blockchain haute performance : 65 000 TPS, frais < $0.01. Écosystème DeFi/NFT.',
        'alts':     ['SOL-USD'],
    },
]

# Halvings BTC (dates mensuelles pour repères visuels)
BTC_HALVINGS = ['2012-11', '2016-07', '2020-05', '2024-04']


def fetch_monthly(tickers):
    for t in tickers:
        try:
            df = yf.Ticker(t).history(period='max', interval='1mo', auto_adjust=True)
            if df is not None and len(df) > 12:
                return t, df
        except Exception as e:
            print(f'    ⚠ {t}: {e}')
    return None, None


def build_crypto_json(crypto, df, used_ticker):
    closes = df['Close'].dropna()
    closes = closes.groupby(closes.index.to_period('M')).last()
    dates  = [p.strftime('%Y-%m') for p in closes.index]
    prices = [round(float(p), 6) for p in closes.values]

    out = {
        'meta': {
            'id':       crypto['id'],
            'name':     crypto['name'],
            'ticker':   used_ticker,
            'symbol':   crypto['symbol'],
            'category': 'crypto',
            'currency': 'USD',
            'color':    crypto['color'],
            'desc':     crypto['desc'],
            'source':   f'Yahoo Finance ({used_ticker}) — fetched via yfinance'
        },
        'start':  dates[0],
        'end':    dates[-1],
        'points': len(prices),
        'prices': prices
    }

    # Extra pour BTC : dates de halving
    if crypto['id'] == 'btc':
        out['halvings'] = BTC_HALVINGS

    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', type=str, help='Fetch seulement cet id (ex: --only btc)')
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    ok, fail = [], []

    for crypto in CRYPTOS:
        if args.only and crypto['id'] != args.only:
            continue

        print(f'\n[>] {crypto["id"]:6s} | {crypto["name"]}')
        print(f'    Trying: {", ".join(crypto["alts"])}')

        used, df = fetch_monthly(crypto['alts'])
        if df is None:
            print(f'    [FAIL] Aucune donnee trouvee')
            fail.append(crypto['id'])
            continue

        out      = build_crypto_json(crypto, df, used)
        out_path = DATA_DIR / f'{crypto["id"]}.json'
        with open(out_path, 'w') as f:
            json.dump(out, f, separators=(',', ':'))

        size = out_path.stat().st_size
        print(f'    [OK] {out["start"]} -> {out["end"]} | {out["points"]} pts | {size/1024:.1f} KB')
        ok.append(crypto['id'])

    print(f'\n{"=" * 50}')
    print(f'[OK] Succes : {len(ok)} cryptos ({", ".join(ok)})')
    if fail:
        print(f'[FAIL] Echecs : {", ".join(fail)}')


if __name__ == '__main__':
    main()
