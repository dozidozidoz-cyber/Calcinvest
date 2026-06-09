"""
Retire "2026" des titles et H1 des outils intemporels (math, backtest,
concepts). Garde "2026" sur les outils fiscaux/règlementaires où les
règles changent chaque année.

Usage : python scripts/seo_remove_year.py
"""
import re, sys, io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent

# Pour chaque outil intemporel : (nouveau title, nouveau H1)
INTEMPORAL = {
'simulateur-dca.html': {
    'title': 'Simulateur DCA Bourse Gratuit — Backtest S&P 500 1871 à aujourd\'hui | CalcInvest',
    'h1':    'Simulateur DCA Bourse — Backtestez votre stratégie',
},
'simulateur-dca-crypto.html': {
    'title': 'Simulateur DCA Crypto — Backtest Bitcoin, Ethereum, Solana | CalcInvest',
    'h1':    'Simulateur DCA Crypto — BTC, ETH, SOL depuis 2013',
},
'simulateur-interets-composes.html': {
    'title': 'Calculateur d\'Intérêts Composés — Effet boule de neige sur 40 ans | CalcInvest',
    'h1':    'Calculateur d\'intérêts composés sur 10, 20, 40 ans',
},
'calculateur-fire.html': {
    'title': 'Calculateur FIRE — Indépendance Financière, Règle des 4% | CalcInvest',
    'h1':    'Calculateur FIRE — Indépendance financière',
},
'simulateur-decumulation.html': {
    'title': 'Simulateur Décumulation Retraite — SWR + Stratégie 3 Buckets | CalcInvest',
    'h1':    'Simulateur décumulation retraite — SWR + 3 buckets',
},
'simulateur-dcf.html': {
    'title': 'Valorisation DCF — Calcul Valeur Intrinsèque d\'une Action | CalcInvest',
    'h1':    'Valorisation DCF — Valeur intrinsèque d\'une action',
},
'valorisation-marche.html': {
    'title': 'Valorisation du Marché — CAPE Shiller, Drawdown, Score Composite | CalcInvest',
    'h1':    'Valorisation du marché — Le marché est-il cher ?',
},
'allocation-portefeuille.html': {
    'title': 'Allocation de Portefeuille — Backtest 60/40, All-Weather, Permanent | CalcInvest',
    'h1':    'Allocation de portefeuille — Backtest 60/40, All-Weather',
},
'regime-marche.html': {
    'title': 'Régime de Marché — Bull, Bear, Range, Volatile | CalcInvest',
    'h1':    'Régime de marché — Bull / Bear / Range / Volatile',
},
'backtest-timing.html': {
    'title': 'Backtest Stratégies de Timing — Golden Cross, GTAA, RSI | CalcInvest',
    'h1':    'Backtest stratégies de timing — Golden Cross, GTAA, RSI',
},
'calculateur-pips.html': {
    'title': 'Calculateur PIPS Forex — Valeur Pip + Taille Position | CalcInvest',
    'h1':    'Calculateur PIPS Forex — Position sizing',
},
'calculateur-marge-liquidation.html': {
    'title': 'Calculateur Marge & Liquidation Forex / Crypto | CalcInvest',
    'h1':    'Calculateur de marge et prix de liquidation',
},
'calculateur-couts-trading.html': {
    'title': 'Calculateur Coûts Trading — Spread, Commission, Swap | CalcInvest',
    'h1':    'Calculateur coûts de trading',
},
'calculateur-risk-management.html': {
    'title': 'Calculateur Risk Management Trading — R/R, Expectancy, Ruine | CalcInvest',
    'h1':    'Calculateur risk management trading',
},
'simulateur-monte-carlo-trading.html': {
    'title': 'Simulateur Monte Carlo Trading — 2000 Trajectoires | CalcInvest',
    'h1':    'Simulateur Monte Carlo Trading — 2 000 trajectoires',
},
'calculateur-volatilite.html': {
    'title': 'Calculateur ATR & Kelly — Volatilité + Sizing Optimal | CalcInvest',
    'h1':    'Calculateur ATR & Kelly — Volatilité et sizing',
},
'journal-trading.html': {
    'title': 'Journal de Trading Gratuit — Statistiques, Equity Curve | CalcInvest',
    'h1':    'Journal de trading gratuit — Stats avancées',
},
'convertisseur-devises.html': {
    'title': 'Convertisseur Devises Live — Taux BCE en Direct | CalcInvest',
    'h1':    'Convertisseur devises live — Taux BCE',
},
'smart-money.html': {
    'title': 'Smart Money Tracker — Portefeuilles Buffett, ARK, Pelosi | CalcInvest',
    'h1':    'Smart Money Tracker — Suivre les meilleurs investisseurs',
},
}

PT_PATTERN = re.compile(r'(<h1 class="page-title">)([^<]+)(</h1>)')


def patch(html_path, fix):
    txt = html_path.read_text(encoding='utf-8')
    changed = False
    # Title
    new_title = f'<title>{fix["title"]}</title>'
    new_txt = re.sub(r'<title>[^<]+</title>', new_title, txt, count=1)
    if new_txt != txt:
        txt = new_txt; changed = True
    # H1
    m = PT_PATTERN.search(txt)
    if m:
        new_txt = txt[:m.start()] + f'<h1 class="page-title">{fix["h1"]}</h1>' + txt[m.end():]
        if new_txt != txt:
            txt = new_txt; changed = True
    if changed:
        html_path.write_text(txt, encoding='utf-8')
    return changed


def main():
    print('=== RETRAIT "2026" SUR OUTILS INTEMPORELS ===\n')
    count = 0
    for slug, fix in INTEMPORAL.items():
        p = ROOT / slug
        if not p.exists():
            print(f'  ✗ {slug} introuvable'); continue
        if patch(p, fix):
            print(f'  ✓ {slug}')
            count += 1
    print(f'\n{count} pages nettoyées')


if __name__ == '__main__':
    main()
