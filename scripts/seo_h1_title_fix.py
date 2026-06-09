"""
Réécrit les <title> et <h1 class="page-title"> de chaque outil pour
contenir les mots-clés SEO cibles. Le H1 actuel (créatif) est conservé
comme tagline en sous-titre.

Usage : python scripts/seo_h1_title_fix.py
"""
import re, sys, io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent

# Pour chaque page : (nouveau title, nouveau H1, conserver l'ancien H1 en tagline)
FIXES = {
'simulateur-rendement-locatif.html': {
    'title': 'Calculateur Rendement Locatif Net 2026 — Cashflow, LMNP, SCI | CalcInvest',
    'h1':    'Calculateur de rendement locatif net 2026',
    'tagline': 'Votre futur locatif, audité avant l\'achat — cashflow, fiscalité comparée des 4 régimes, simulation de revente.',
},
'simulateur-dca.html': {
    'title': 'Simulateur DCA Bourse Gratuit 2026 — Backtest S&P 500 1871-2026 | CalcInvest',
    'h1':    'Simulateur DCA Bourse 2026 — Backtestez votre stratégie',
    'tagline': '13 actifs, depuis 1871. Crises de 1929, 2008, 2020 incluses. Dividendes, inflation, frais ETF, Monte Carlo — tout est intégré.',
},
'simulateur-dca-crypto.html': {
    'title': 'Simulateur DCA Crypto 2026 — Backtest Bitcoin, Ethereum, Solana | CalcInvest',
    'h1':    'Simulateur DCA Crypto — BTC, ETH, SOL depuis 2013',
    'tagline': 'Combien aurait rapporté un DCA crypto si vous aviez commencé en 2013, 2017 ou 2020 ? Backtest complet.',
},
'calculateur-fire.html': {
    'title': 'Calculateur FIRE 2026 — Indépendance Financière, Règle des 4% | CalcInvest',
    'h1':    'Calculateur FIRE 2026 — Indépendance financière',
    'tagline': 'À quel âge serez-vous libre financièrement ? Règle des 4 % adaptée à la fiscalité française.',
},
'simulateur-per.html': {
    'title': 'Simulateur PER 2026 — Économie Fiscale + PER vs CTO + Assurance-Vie | CalcInvest',
    'h1':    'Simulateur PER 2026 — Plan Épargne Retraite',
    'tagline': 'Le PER vaut-il vraiment le coup pour vous ? Calcul de l\'économie fiscale selon votre TMI.',
},
'simulateur-interets-composes.html': {
    'title': 'Calculateur d\'Intérêts Composés 2026 — Croissance sur 40 ans | CalcInvest',
    'h1':    'Calculateur d\'intérêts composés sur 10, 20, 40 ans',
    'tagline': 'L\'effet boule de neige, en chiffres. La 8e merveille du monde, calculée à l\'euro près.',
},
'calculateur-impot-revenu.html': {
    'title': 'Calculateur Impôt sur le Revenu 2026 — Barème IR France | CalcInvest',
    'h1':    'Calculateur impôt sur le revenu 2026 (déclaration 2026)',
    'tagline': 'Barème, parts fiscales, TMI, décote — votre IR exact en 30 secondes.',
},
'simulateur-scpi.html': {
    'title': 'Simulateur SCPI 2026 — Rendement Net + Fiscalité Pierre Papier | CalcInvest',
    'h1':    'Simulateur SCPI 2026 — Pierre papier',
    'tagline': 'La pierre papier, chiffrée après fiscalité. 4 régimes comparés, simulation rentier.',
},
'simulateur-pret.html': {
    'title': 'Simulateur Prêt Immobilier 2026 — Mensualité + Capacité Emprunt | CalcInvest',
    'h1':    'Simulateur prêt immobilier 2026',
    'tagline': 'Capacité d\'emprunt, mensualités, frais de notaire, assurance — votre projet immo complet.',
},
'simulateur-lmnp.html': {
    'title': 'Simulateur LMNP 2026 — Micro-BIC vs Réel + Amortissements | CalcInvest',
    'h1':    'Simulateur LMNP 2026 — Location meublée',
    'tagline': 'Micro-BIC vs Réel + amortissements — quel régime maximise votre net ?',
},
'calculateur-plus-value-immobiliere.html': {
    'title': 'Calculateur Plus-Value Immobilière 2026 — IR + PS + Abattements | CalcInvest',
    'h1':    'Calculateur plus-value immobilière 2026',
    'tagline': 'Cession, abattements durée 22/30 ans, IR + prélèvements sociaux — barème complet 2026.',
},
'portefeuille-locatif.html': {
    'title': 'Portefeuille Locatif — Cashflow Multi-Biens Consolidé | CalcInvest',
    'h1':    'Portefeuille locatif — vision agrégée multi-biens',
    'tagline': 'Cashflow consolidé, TRI portefeuille. Pilotez votre patrimoine immobilier.',
},
'simulateur-dcf.html': {
    'title': 'Valorisation DCF 2026 — Calcul Valeur Intrinsèque Action | CalcInvest',
    'h1':    'Valorisation DCF — Valeur intrinsèque d\'une action',
    'tagline': 'WACC, croissance, terminal value — calculez la valeur intrinsèque d\'une action.',
},
'valorisation-marche.html': {
    'title': 'Valorisation du Marché 2026 — CAPE Shiller, Drawdown, Score | CalcInvest',
    'h1':    'Valorisation du marché 2026 — Le marché est-il cher ?',
    'tagline': 'CAPE Shiller, drawdown, score composite. Données en direct.',
},
'allocation-portefeuille.html': {
    'title': 'Allocation de Portefeuille — 60/40, All-Weather, Permanent | CalcInvest',
    'h1':    'Allocation de portefeuille — Backtest 60/40, All-Weather',
    'tagline': 'Backtestez les stratégies sur 30 ans de données réelles.',
},
'regime-marche.html': {
    'title': 'Régime de Marché 2026 — Bull, Bear, Range, Volatile | CalcInvest',
    'h1':    'Régime de marché 2026 — Bull / Bear / Range / Volatile',
    'tagline': 'Détection automatique via 5 indicateurs techniques.',
},
'backtest-timing.html': {
    'title': 'Backtest Stratégies de Timing — Golden Cross, GTAA, RSI | CalcInvest',
    'h1':    'Backtest stratégies de timing — Golden Cross, GTAA, RSI',
    'tagline': 'Vos stratégies de market timing testées sur 50 ans de S&P 500.',
},
'calculateur-pips.html': {
    'title': 'Calculateur PIPS Forex 2026 — Valeur Pip + Taille Position | CalcInvest',
    'h1':    'Calculateur PIPS Forex — Position sizing',
    'tagline': 'Valeur d\'un pip + taille de position optimale selon votre risque.',
},
'calculateur-marge-liquidation.html': {
    'title': 'Calculateur Marge & Liquidation Forex / Crypto 2026 | CalcInvest',
    'h1':    'Calculateur de marge et prix de liquidation',
    'tagline': 'Marge requise, prix de liquidation, distance margin call.',
},
'calculateur-couts-trading.html': {
    'title': 'Calculateur Coûts Trading 2026 — Spread, Commission, Swap | CalcInvest',
    'h1':    'Calculateur coûts de trading',
    'tagline': 'Décomposition spread + commission + swap — vrais frais cumulés.',
},
'calculateur-risk-management.html': {
    'title': 'Calculateur Risk Management Trading — R/R, Expectancy, Ruine | CalcInvest',
    'h1':    'Calculateur risk management trading',
    'tagline': 'Expectancy, ratio R/R, breakeven winrate, probabilité de ruine.',
},
'simulateur-monte-carlo-trading.html': {
    'title': 'Simulateur Monte Carlo Trading — 2000 Trajectoires | CalcInvest',
    'h1':    'Simulateur Monte Carlo Trading — 2 000 trajectoires',
    'tagline': 'Drawdowns, percentiles 5/95, distribution des résultats annuels.',
},
'calculateur-fiscalite-trading.html': {
    'title': 'Calculateur Fiscalité Trading France 2026 — PFU vs IR, CTO vs PEA | CalcInvest',
    'h1':    'Calculateur fiscalité trading France 2026',
    'tagline': 'PFU 30 % vs barème IR, CTO vs PEA — optimisez votre imposition.',
},
'calculateur-volatilite.html': {
    'title': 'Calculateur ATR & Kelly — Volatilité + Sizing Optimal | CalcInvest',
    'h1':    'Calculateur ATR & Kelly — Volatilité et sizing',
    'tagline': 'Stop loss adaptatif (ATR), taille optimale (Kelly), risque corrélé multi-positions.',
},
'journal-trading.html': {
    'title': 'Journal de Trading Gratuit — Statistiques, Equity Curve | CalcInvest',
    'h1':    'Journal de trading gratuit — Stats avancées',
    'tagline': 'Statistiques, equity curve, heatmap mensuelle — persistant en local.',
},
'calculateur-salaire-brut-net.html': {
    'title': 'Calculateur Salaire Brut Net 2026 — Cotisations URSSAF | CalcInvest',
    'h1':    'Calculateur salaire brut net 2026',
    'tagline': 'Cotisations URSSAF, retraite, CSG — votre vraie fiche de paie.',
},
'calculateur-tva-auto-entrepreneur.html': {
    'title': 'Calculateur TVA Auto-Entrepreneur 2026 — HT/TTC + URSSAF | CalcInvest',
    'h1':    'Calculateur TVA + Auto-Entrepreneur 2026',
    'tagline': 'HT/TTC + URSSAF micro — votre vrai net après cotisations.',
},
'calculateur-donation-succession.html': {
    'title': 'Calculateur Donation & Succession 2026 — Abattements + Barème | CalcInvest',
    'h1':    'Calculateur donation et succession 2026',
    'tagline': 'Abattements, barème, démembrement — optimiser la transmission.',
},
'mon-foyer-fiscal.html': {
    'title': 'Calculateur Foyer Fiscal — Vue Consolidée Multi-Membres | CalcInvest',
    'h1':    'Foyer fiscal global — Vue consolidée multi-membres',
    'tagline': 'Qui paie quoi dans votre foyer ? Optimisation IR + IFI + cotisations.',
},
'simulateur-retraite.html': {
    'title': 'Simulateur Retraite 2026 — Régime Général + Agirc-Arrco | CalcInvest',
    'h1':    'Simulateur retraite France 2026',
    'tagline': 'Régime général + Agirc-Arrco — calcul de votre pension nette à l\'euro près.',
},
'simulateur-assurance-vie.html': {
    'title': 'Simulateur Assurance-Vie 2026 — Fonds €/UC + Fiscalité 8 ans | CalcInvest',
    'h1':    'Simulateur assurance-vie 2026',
    'tagline': 'Fonds €/UC, fiscalité 8 ans (abat. 4 600/9 200 €), succession 152 500 €/bénéf.',
},
'simulateur-decumulation.html': {
    'title': 'Simulateur Décumulation Retraite — SWR + Stratégie 3 Buckets | CalcInvest',
    'h1':    'Simulateur décumulation retraite — SWR + 3 buckets',
    'tagline': 'Taux de retrait sûr (SWR) — combien de temps tient votre capital ?',
},
'convertisseur-devises.html': {
    'title': 'Convertisseur Devises Live 2026 — Taux BCE en Direct | CalcInvest',
    'h1':    'Convertisseur devises live — Taux BCE 2026',
    'tagline': 'Taux BCE en direct, 30+ devises. Pour vos voyages et achats internationaux.',
},
'smart-money.html': {
    'title': 'Smart Money Tracker — Portefeuilles Buffett, ARK, Pelosi | CalcInvest',
    'h1':    'Smart Money Tracker — Suivre les meilleurs investisseurs',
    'tagline': 'Positions 13F SEC (Buffett, Burry, Ackman), holdings ARK, transactions Pelosi — perf vs S&P 500.',
},
}

# Pattern for finding the page-title block (h1 + lede)
# We need to replace the H1 + insert a tagline after it (above the lede)
PT_PATTERN = re.compile(
    r'(<h1 class="page-title">)([^<]*(?:<[^/][^>]*>[^<]*</[^>]+>[^<]*)*)(</h1>)',
    re.DOTALL
)


def patch(html_path, fix):
    txt = html_path.read_text(encoding='utf-8')
    changed = False

    # 1. Title tag
    new_title = f'<title>{fix["title"]}</title>'
    new_txt = re.sub(r'<title>[^<]+</title>', new_title, txt, count=1)
    if new_txt != txt:
        txt = new_txt
        changed = True

    # 2. H1 — capture l'existant pour le mettre en tagline
    m = PT_PATTERN.search(txt)
    if m:
        old_h1_inner = m.group(2).strip()
        # On crée le nouveau bloc H1 + tagline
        # Si la tagline désirée est différente du H1 actuel, on l'utilise ; sinon on garde l'ancien comme tagline
        if 'tagline' in fix:
            replacement = (
                f'<h1 class="page-title">{fix["h1"]}</h1>\n'
                f'      <p class="page-tagline" style="margin:6px 0 -6px;color:var(--text-2);font-size:14px;font-style:italic">{fix["tagline"]}</p>'
            )
        else:
            replacement = f'<h1 class="page-title">{fix["h1"]}</h1>'
        # On remplace seulement la première occurrence
        new_txt = txt[:m.start()] + replacement + txt[m.end():]
        if new_txt != txt:
            txt = new_txt
            changed = True

    if changed:
        html_path.write_text(txt, encoding='utf-8')
    return changed


def main():
    print('=== SEO H1 + TITLE FIX ===\n')
    count = 0
    for slug, fix in FIXES.items():
        p = ROOT / slug
        if not p.exists():
            print(f'  ✗ {slug} introuvable'); continue
        if patch(p, fix):
            print(f'  ✓ {slug}')
            count += 1
        else:
            print(f'  = {slug} (rien à changer)')
    print(f'\n{count} pages avec H1/title optimisés SEO')


if __name__ == '__main__':
    main()
