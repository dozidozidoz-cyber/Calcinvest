"""
CalcInvest — Fetch des cours JOURNALIERS (OHLC ajusté)
======================================================

Les JSON mensuels (assets/data/{id}.json) suffisent pour le DCA, pas pour
tester un stop ou une moyenne mobile : il faut le plus haut / plus bas de
chaque séance. Ce script écrit assets/data/daily/{id}.json pour chaque actif
du manifest, plus assets/data/daily/series.json (liste des séries
disponibles — pas "index.json", que Vercel sert comme index du dossier).

Usage :
    pip install yfinance pandas
    python scripts/fetch_daily.py                     # tous les actifs du manifest
    python scripts/fetch_daily.py --only sp500        # un seul actif
    python scripts/fetch_daily.py --since 1990-01-01  # historique plus long
    python scripts/fetch_daily.py --ticker TWST --ticker 0388.HK
                                                      # tickers Yahoo hors manifest

Format de sortie (colonnaire, compact) :
    { "meta": { id, name, ticker, currency, adjusted, source },
      "start", "end", "points",
      "d": ["YYYY-MM-DD", ...], "o": [...], "h": [...], "l": [...], "c": [...] }

Les prix sont AJUSTÉS des dividendes et des splits (auto_adjust=True : le
facteur adjclose / close est appliqué à O, H, L, C). Sans ça, un détachement
de dividende ou un split ressemble à une chute et déclenche un faux stop
dans un backtest.
"""

import argparse
import json
import math
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# fetch_data fournit la table des tickers de secours ; son import règle aussi
# l'encodage de la console Windows et vérifie que yfinance/pandas sont là.
from fetch_data import ALTERNATIVE_TICKERS, DATA_DIR, MANIFEST_PATH

import yfinance as yf

DAILY_DIR = DATA_DIR / 'daily'
SERIES_PATH = DAILY_DIR / 'series.json'
DEFAULT_SINCE = '2000-01-01'
DELAY_S = 0.4
MIN_POINTS = 30


def slug(ticker):
    """Ticker Yahoo → nom de fichier ('0388.HK' → '0388_hk')."""
    return re.sub(r'[^a-z0-9]+', '_', ticker.lower()).strip('_')


def _round(v):
    """7 chiffres significatifs : assez pour un prix, compact en JSON."""
    return float(f'{v:.7g}')


def build_series(df, today):
    """Convertit un DataFrame yfinance (index = dates, colonnes Open/High/Low/Close)
    en série colonnaire. Fonction pure (testée dans tests/py/test_fetch_daily.py).

    - écarte les séances incomplètes (valeur manquante ou <= 0) ;
    - écarte les séances datées >= `today` ("YYYY-MM-DD") : la séance du jour
      n'est pas terminée ;
    - écarte doublons et dates non croissantes ;
    - garantit low <= open, close <= high.
    """
    d, o, h, l, c = [], [], [], [], []
    prev = None
    for ts, row in zip(df.index, df[['Open', 'High', 'Low', 'Close']].itertuples(index=False, name=None)):
        if not all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in row):
            continue
        date = ts.strftime('%Y-%m-%d')
        if date >= today or (prev is not None and date <= prev):
            continue
        d.append(date)
        o.append(_round(row[0]))
        h.append(_round(max(row)))
        l.append(_round(min(row)))
        c.append(_round(row[3]))
        prev = date
    return {'d': d, 'o': o, 'h': h, 'l': l, 'c': c}


def fetch_daily(tickers, since, today):
    """Essaie chaque ticker dans l'ordre ; renvoie (ticker, série, devise) ou (None, None, None)."""
    for t in tickers:
        try:
            tk = yf.Ticker(t)
            df = tk.history(start=since, interval='1d', auto_adjust=True)
            series = build_series(df, today)
            if len(series['d']) < MIN_POINTS:
                raise ValueError(f'série trop courte ({len(series["d"])} séances)')
            currency = None
            try:
                currency = tk.history_metadata.get('currency')
            except Exception:
                pass
            return t, series, currency
        except Exception as e:
            print(f'    ⚠ {t}: {e}')
        time.sleep(DELAY_S)
    return None, None, None


def build_jobs(args):
    jobs = []
    if not args.ticker or args.only:
        with open(MANIFEST_PATH, encoding='utf-8') as f:
            manifest = json.load(f)
        for a in manifest['assets']:
            if args.only and a['id'] != args.only:
                continue
            tickers = [a['ticker']]
            for alt in ALTERNATIVE_TICKERS.get(a['id'], []):
                if alt not in tickers:
                    tickers.append(alt)
            jobs.append({'id': a['id'], 'name': a['name'], 'currency': a.get('currency'), 'tickers': tickers})
    for t in args.ticker:
        jobs.append({'id': slug(t), 'name': t, 'currency': None, 'tickers': [t]})
    return jobs


def write_series_index():
    series = []
    for path in sorted(DAILY_DIR.glob('*.json')):
        if path.name == SERIES_PATH.name:
            continue
        with open(path, encoding='utf-8') as f:
            j = json.load(f)
        series.append({
            'id': j['meta']['id'], 'name': j['meta']['name'], 'ticker': j['meta']['ticker'],
            'currency': j['meta']['currency'], 'start': j['start'], 'end': j['end'], 'points': j['points'],
        })
    series.sort(key=lambda s: s['id'])
    out = {'updatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%d'), 'series': series}
    with open(SERIES_PATH, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return len(series)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', type=str, help='Un seul actif du manifest (ex: --only sp500)')
    parser.add_argument('--since', type=str, default=DEFAULT_SINCE, help='Date de début YYYY-MM-DD')
    parser.add_argument('--ticker', action='append', default=[],
                        help='Ticker Yahoo hors manifest (répétable)')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.since):
        parser.error('--since attend YYYY-MM-DD')

    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    DAILY_DIR.mkdir(parents=True, exist_ok=True)

    jobs = build_jobs(args)
    if not jobs:
        parser.error('Aucun actif à récupérer (vérifiez --only)')

    ok, fail = [], []
    for job in jobs:
        print(f'\n▶ {job["id"]:12s} | {", ".join(job["tickers"])}')
        used, s, currency = fetch_daily(job['tickers'], args.since, today)
        if s is None:
            print('    ❌ aucune donnée')
            fail.append(job['id'])
            continue
        out = {
            'meta': {
                'id': job['id'],
                'name': job['name'],
                'ticker': used,
                'currency': currency or job['currency'],
                'adjusted': True,
                'source': f'Yahoo Finance ({used}) — OHLC journalier ajusté dividendes/splits, via yfinance',
            },
            'start': s['d'][0], 'end': s['d'][-1], 'points': len(s['d']),
            'd': s['d'], 'o': s['o'], 'h': s['h'], 'l': s['l'], 'c': s['c'],
        }
        out_path = DAILY_DIR / f'{job["id"]}.json'
        with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
        print(f'    ✓ {out["start"]} → {out["end"]} | {out["points"]} séances | {out_path.stat().st_size / 1024:.0f} KB')
        ok.append(job['id'])
        time.sleep(DELAY_S)

    n = write_series_index()
    print(f'\n{"=" * 50}')
    print(f'✅ {len(ok)} séries récupérées, {n} dans series.json')
    if fail:
        print(f'❌ Échecs  : {", ".join(fail)}')
    if not ok:
        sys.exit(1)


if __name__ == '__main__':
    main()
