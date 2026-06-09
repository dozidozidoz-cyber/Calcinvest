"""
Injecte un bloc sémantique "Recherches associées" visible sur chaque outil.
Capture les variantes de mots-clés (calculateur/simulateur/calculatrice,
synonymes FR) que les gens tapent réellement sur Google — basé sur de la
vraie recherche de mots-clés (juin 2026).

SEO-safe : bloc VISIBLE (pas de texte caché), contenu naturel et utile.

Usage : python scripts/seo_semantic_blocks.py
"""
import sys, io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent

# Pour chaque outil :
#   intro  = phrase d'intro naturelle (contient les variantes principales)
#   terms  = liste de variantes/synonymes (chips visibles)
SEMANTIC = {
'simulateur-rendement-locatif.html': {
    'intro': "Cet outil est à la fois un <strong>calculateur de rendement locatif</strong> et un <strong>simulateur de rentabilité locative</strong>. Il calcule la rentabilité brute, nette et net-net de votre investissement immobilier, le cash-flow mensuel, et compare les régimes fiscaux.",
    'terms': ['calcul rentabilité locative', 'calculette rentabilité locative', 'simulateur investissement locatif', 'calcul rendement locatif net', 'cash-flow immobilier', 'rentabilité nette nette', 'calcul cashflow location', 'simulateur immobilier locatif', 'rentabilité brute nette', 'calculatrice investissement immobilier'],
},
'simulateur-dca.html': {
    'intro': "Cet outil est un <strong>simulateur DCA</strong> (Dollar Cost Averaging) et un <strong>calculateur d'investissement programmé</strong> en bourse. Il backteste un plan d'épargne ETF sur données historiques réelles.",
    'terms': ['calculateur DCA', 'calculatrice DCA', 'simulateur investissement programmé', 'plan épargne ETF', 'calcul investissement mensuel bourse', 'simulateur ETF PEA', 'Dollar Cost Averaging', 'backtest DCA S&P 500', 'simulateur versement programmé', 'calcul gains bourse mensuel'],
},
'simulateur-dca-crypto.html': {
    'intro': "Cet outil est un <strong>simulateur DCA crypto</strong> et un <strong>calculateur d'investissement programmé Bitcoin</strong>. Il backteste un DCA sur BTC, ETH, SOL et autres cryptomonnaies depuis leur création.",
    'terms': ['calculateur DCA Bitcoin', 'simulateur DCA crypto', 'calcul investissement programmé crypto', 'backtest Bitcoin DCA', 'simulateur achat Bitcoin mensuel', 'calculatrice crypto', 'DCA Ethereum', 'simulateur gains crypto', 'plan achat crypto régulier'],
},
'simulateur-interets-composes.html': {
    'intro': "Cet outil est à la fois un <strong>calculateur d'intérêts composés</strong>, une <strong>calculatrice intérêts composés</strong> et un <strong>simulateur d'épargne</strong>. Il visualise l'effet boule de neige de vos placements sur le long terme.",
    'terms': ['calculatrice intérêts composés', 'simulateur intérêts composés', 'calcul intérêts composés mensuel', 'simulateur épargne', 'effet boule de neige', 'calcul placement long terme', 'simulateur capital épargne', 'formule intérêts composés', 'calcul rendement épargne', 'simulateur croissance épargne'],
},
'calculateur-fire.html': {
    'intro': "Cet outil est un <strong>calculateur FIRE</strong> et un <strong>simulateur d'indépendance financière</strong>. Il applique la règle des 4 % pour estimer le capital nécessaire et l'âge de votre liberté financière.",
    'terms': ['simulateur FIRE', 'calcul indépendance financière', 'règle des 4 pour cent', 'calcul retraite anticipée', 'simulateur liberté financière', 'combien pour être rente', 'capital pour ne plus travailler', 'simulateur LeanFIRE FatFIRE', 'calcul taux de retrait'],
},
'simulateur-per.html': {
    'intro': "Cet outil est un <strong>simulateur PER</strong> (Plan d'Épargne Retraite) et un <strong>calculateur d'économie d'impôt</strong>. Il estime votre défiscalisation selon votre TMI et compare PER vs CTO.",
    'terms': ['calculateur PER', 'simulateur économie impôt PER', 'calcul déduction fiscale PER', 'simulateur plafond PER', 'disponible fiscal PER', 'calcul réduction impôt PER', 'PER vs assurance-vie', 'défiscalisation retraite', 'simulateur plan épargne retraite'],
},
'calculateur-impot-revenu.html': {
    'intro': "Cet outil est un <strong>calculateur d'impôt sur le revenu 2026</strong> et un <strong>simulateur IR</strong>. Il applique le barème officiel par tranche, le quotient familial et la décote.",
    'terms': ['simulateur impôt revenu', 'calcul IR 2026', 'simulateur impôt 2026 revenus 2025', 'barème impôt par tranche', 'calcul TMI', 'simulateur quotient familial', 'calcul revenu fiscal de référence', 'calculatrice impôt revenu', 'calcul tranches imposition', 'simulateur impôt gratuit'],
},
'simulateur-scpi.html': {
    'intro': "Cet outil est un <strong>simulateur SCPI</strong> et un <strong>calculateur de rendement SCPI</strong>. Il chiffre la pierre papier après fiscalité, compare 4 régimes et simule la rente.",
    'terms': ['calculateur SCPI', 'calcul rendement SCPI', 'simulateur pierre papier', 'simulateur investissement SCPI', 'calcul revenus SCPI', 'SCPI fiscalité', 'simulateur SCPI rendement net', 'calcul parts SCPI', 'rentabilité SCPI'],
},
'simulateur-pret.html': {
    'intro': "Cet outil est un <strong>simulateur de prêt immobilier</strong>, une <strong>calculette de crédit</strong> et un <strong>calculateur de mensualités</strong>. Il calcule capacité d'emprunt, mensualité, coût total et assurance.",
    'terms': ['calculateur prêt immobilier', 'calculette prêt immobilier', 'calcul mensualité crédit', 'simulateur capacité emprunt', 'calcul coût total crédit', 'simulateur crédit immobilier', 'calcul taux endettement', 'simulateur assurance emprunteur', 'calcul mensualités prêt', 'simulation emprunt immobilier'],
},
'simulateur-lmnp.html': {
    'intro': "Cet outil est un <strong>simulateur LMNP</strong> et un <strong>calculateur location meublée</strong>. Il compare Micro-BIC vs Réel avec amortissements pour maximiser votre net.",
    'terms': ['calculateur LMNP', 'simulateur location meublée', 'calcul amortissement LMNP', 'Micro-BIC vs réel', 'simulateur LMNP réel', 'calcul impôt location meublée', 'fiscalité LMNP', 'simulateur meublé non professionnel'],
},
'calculateur-plus-value-immobiliere.html': {
    'intro': "Cet outil est un <strong>calculateur de plus-value immobilière</strong> et un <strong>simulateur d'imposition sur la cession</strong>. Il applique le barème IR + PS, les abattements durée et les exonérations.",
    'terms': ['simulateur plus-value immobilière', 'calcul plus-value immobilière 2026', 'calcul abattement plus-value', 'simulateur impôt cession immobilier', 'calcul imposition plus-value', 'exonération plus-value immobilière', 'plus-value résidence secondaire', 'calculatrice plus-value immo'],
},
'portefeuille-locatif.html': {
    'intro': "Cet outil est un <strong>simulateur de portefeuille locatif</strong> et un <strong>calculateur de cashflow multi-biens</strong>. Il agrège plusieurs investissements immobiliers en une vue consolidée.",
    'terms': ['calcul cashflow multi-biens', 'simulateur patrimoine immobilier', 'rentabilité portefeuille locatif', 'gestion locative agrégée', 'calcul TRI portefeuille immobilier'],
},
'simulateur-dcf.html': {
    'intro': "Cet outil est un <strong>calculateur DCF</strong> (Discounted Cash Flow) et un <strong>simulateur de valorisation d'action</strong>. Il calcule la valeur intrinsèque selon les flux de trésorerie actualisés.",
    'terms': ['simulateur valorisation action', 'calcul valeur intrinsèque', 'modèle DCF actualisation', 'calcul WACC', 'valorisation entreprise DCF', 'calcul flux trésorerie actualisés', 'simulateur prix juste action'],
},
'valorisation-marche.html': {
    'intro': "Cet outil est un <strong>indicateur de valorisation du marché</strong> et un <strong>calculateur CAPE Shiller</strong>. Il évalue si le marché actions est cher via plusieurs ratios.",
    'terms': ['calcul CAPE Shiller', 'indicateur marché cher', 'PER de Shiller', 'valorisation S&P 500', 'le marché est-il cher', 'score composite valorisation', 'ratio CAPE 2026'],
},
'allocation-portefeuille.html': {
    'intro': "Cet outil est un <strong>simulateur d'allocation de portefeuille</strong> et un <strong>backtest 60/40 / All-Weather</strong>. Il compare les grandes stratégies d'allocation d'actifs.",
    'terms': ['backtest portefeuille 60/40', 'simulateur All-Weather Dalio', 'portefeuille permanent Browne', 'allocation actifs backtest', 'calcul performance portefeuille', 'stratégie allocation diversifiée'],
},
'regime-marche.html': {
    'intro': "Cet outil est un <strong>détecteur de régime de marché</strong> (bull / bear / range / volatile) basé sur 5 indicateurs techniques.",
    'terms': ['détection bull bear market', 'indicateur tendance marché', 'régime volatilité bourse', 'phase de marché actuelle', 'signal bull market'],
},
'backtest-timing.html': {
    'intro': "Cet outil est un <strong>backtest de stratégies de timing</strong> : Golden Cross, Faber GTAA, momentum et RSI testés sur données historiques.",
    'terms': ['backtest Golden Cross', 'stratégie Faber GTAA', 'backtest moyenne mobile', 'market timing stratégie', 'backtest momentum bourse', 'signal achat moyenne mobile'],
},
'calculateur-pips.html': {
    'intro': "Cet outil est un <strong>calculateur de pips</strong> forex et un <strong>calculateur de taille de position</strong>. Il calcule la valeur d'un pip et le position sizing selon votre risque.",
    'terms': ['calcul valeur pip', 'calculateur position sizing', 'calcul lot forex', 'taille position trading', 'calcul pip value', 'money management forex', 'calculatrice pips'],
},
'calculateur-marge-liquidation.html': {
    'intro': "Cet outil est un <strong>calculateur de marge</strong> et un <strong>calculateur de prix de liquidation</strong> pour le trading à effet de levier.",
    'terms': ['calcul prix liquidation', 'calcul marge trading', 'calculateur levier crypto', 'distance margin call', 'calcul liquidation futures', 'calculatrice marge'],
},
'calculateur-couts-trading.html': {
    'intro': "Cet outil est un <strong>calculateur de coûts de trading</strong> : spread, commission et swap décomposés pour connaître vos vrais frais.",
    'terms': ['calcul frais trading', 'calcul spread commission', 'coût swap trading', 'calcul break-even trade', 'frais broker forex'],
},
'calculateur-risk-management.html': {
    'intro': "Cet outil est un <strong>calculateur de risk management</strong> : expectancy, ratio risque/rendement, probabilité de ruine pour valider votre système.",
    'terms': ['calcul expectancy trading', 'calcul ratio risk reward', 'probabilité de ruine', 'calcul risque par trade', 'money management trading', 'calcul R/R'],
},
'simulateur-monte-carlo-trading.html': {
    'intro': "Cet outil est un <strong>simulateur Monte Carlo trading</strong> : 2 000 trajectoires simulées de votre système pour estimer drawdowns et percentiles.",
    'terms': ['simulation Monte Carlo trading', 'calcul drawdown trading', 'percentiles trading système', 'simulateur trajectoires trading', 'risque de ruine Monte Carlo'],
},
'calculateur-fiscalite-trading.html': {
    'intro': "Cet outil est un <strong>calculateur de fiscalité trading</strong> : PFU 30 % vs barème IR, CTO vs PEA pour optimiser votre imposition.",
    'terms': ['calcul impôt plus-value bourse', 'fiscalité trading France', 'PFU vs barème IR', 'imposition CTO PEA', 'calcul flat tax bourse', 'fiscalité plus-value mobilière'],
},
'calculateur-volatilite.html': {
    'intro': "Cet outil est un <strong>calculateur ATR</strong> (Average True Range) et un <strong>calculateur Kelly</strong> pour le sizing optimal selon la volatilité.",
    'terms': ['calcul ATR trading', 'critère de Kelly', 'calcul stop loss ATR', 'sizing optimal Kelly', 'calcul volatilité action', 'position sizing volatilité'],
},
'journal-trading.html': {
    'intro': "Cet outil est un <strong>journal de trading gratuit</strong> avec statistiques avancées, equity curve et heatmap mensuelle, persistant en local.",
    'terms': ['journal de trade gratuit', 'trading journal en ligne', 'suivi statistiques trading', 'equity curve trading', 'carnet de trading', 'tableau suivi trades'],
},
'calculateur-salaire-brut-net.html': {
    'intro': "Cet outil est un <strong>calculateur salaire brut net</strong> 2026 : conversion avec cotisations URSSAF, retraite et CSG.",
    'terms': ['convertir brut net salaire', 'calcul salaire net 2026', 'simulateur salaire brut net', 'calcul cotisations salariales', 'salaire net cadre non-cadre', 'calculette brut net'],
},
'calculateur-tva-auto-entrepreneur.html': {
    'intro': "Cet outil est un <strong>calculateur TVA</strong> et un <strong>simulateur auto-entrepreneur</strong> : conversion HT/TTC + cotisations URSSAF micro.",
    'terms': ['calcul TVA HT TTC', 'simulateur auto-entrepreneur', 'calcul cotisations micro-entreprise', 'calcul URSSAF auto-entrepreneur', 'calculateur micro-entreprise', 'TVA 20% calcul'],
},
'calculateur-donation-succession.html': {
    'intro': "Cet outil est un <strong>calculateur de donation</strong> et un <strong>simulateur de droits de succession</strong> : abattements, barème et démembrement.",
    'terms': ['calcul droits succession', 'simulateur donation', 'calcul abattement donation', 'barème droits de succession', 'calcul frais succession', 'simulateur transmission patrimoine'],
},
'mon-foyer-fiscal.html': {
    'intro': "Cet outil est un <strong>calculateur de foyer fiscal global</strong> : vue consolidée multi-membres pour optimiser IR, IFI et cotisations.",
    'terms': ['calcul foyer fiscal', 'optimisation fiscale foyer', 'simulateur impôts foyer', 'consolidation revenus foyer', 'calcul parts fiscales foyer'],
},
'simulateur-retraite.html': {
    'intro': "Cet outil est un <strong>simulateur de retraite</strong> et un <strong>calculateur de pension</strong> : régime général + Agirc-Arrco à l'euro près.",
    'terms': ['calculateur retraite', 'calcul pension retraite', 'simulateur retraite Agirc-Arrco', 'calcul montant retraite', 'estimation pension régime général', 'simulateur âge retraite'],
},
'simulateur-assurance-vie.html': {
    'intro': "Cet outil est un <strong>simulateur d'assurance-vie</strong> et un <strong>calculateur de fiscalité après 8 ans</strong> : fonds €/UC, abattements et succession.",
    'terms': ['calculateur assurance-vie', 'simulateur rendement assurance-vie', 'calcul fiscalité assurance-vie 8 ans', 'calcul abattement assurance-vie', 'simulateur fonds euros UC', 'assurance-vie succession'],
},
'simulateur-decumulation.html': {
    'intro': "Cet outil est un <strong>simulateur de décumulation</strong> : taux de retrait sûr (SWR) et stratégie 3 buckets pour la phase retraite.",
    'terms': ['calcul taux de retrait sûr', 'simulateur SWR retraite', 'stratégie 3 buckets', 'calcul durée capital retraite', 'décaissement épargne retraite', 'safe withdrawal rate'],
},
'convertisseur-devises.html': {
    'intro': "Cet outil est un <strong>convertisseur de devises</strong> en direct : taux BCE live pour 30+ monnaies.",
    'terms': ['convertir euro dollar', 'taux de change live', 'convertisseur monnaie', 'calcul conversion devise', 'taux BCE euro', 'change euro livre'],
},
'smart-money.html': {
    'intro': "Cet outil est un <strong>tracker Smart Money</strong> : suivi des portefeuilles 13F (Buffett, Burry, Ackman), holdings ARK et transactions du Congrès US (Pelosi).",
    'terms': ['suivre portefeuille Buffett', 'tracker 13F SEC', 'positions hedge funds', 'trades Nancy Pelosi', 'holdings ARK Invest', 'congress trading tracker', 'copier trades politiciens', 'portefeuille Michael Burry'],
},
}

CSS_BLOCK = '''
/* ============================================================
   BLOC SÉMANTIQUE SEO — "Recherches associées" (visible)
   ============================================================ */
.ci-semantic {
  padding: 28px 20px;
  background: var(--bg-2);
  border-top: 1px solid var(--border);
}
.ci-semantic-inner { max-width: 1100px; margin: 0 auto; }
.ci-semantic-intro {
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.6;
  margin: 0 0 16px;
  max-width: 820px;
}
.ci-semantic-intro strong { color: var(--text); }
.ci-semantic-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3, var(--text-2));
  font-weight: 600;
  margin-bottom: 10px;
}
.ci-semantic-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ci-semantic-chip {
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 99px;
  font-size: 12.5px;
  color: var(--text-2);
}
'''


def build_block(data):
    chips = ''.join(f'<span class="ci-semantic-chip">{t}</span>\n' for t in data['terms'])
    return f'''
<!-- ═══ Recherches associées (SEO sémantique) ═══ -->
<section class="ci-semantic" aria-label="Recherches associées">
  <div class="ci-semantic-inner">
    <p class="ci-semantic-intro">{data['intro']}</p>
    <div class="ci-semantic-label">Recherches fréquentes pour cet outil</div>
    <div class="ci-semantic-chips">
{chips}    </div>
  </div>
</section>
'''


def main():
    # 1. CSS
    style_path = ROOT / 'assets' / 'css' / 'style.css'
    style_txt = style_path.read_text(encoding='utf-8')
    if '.ci-semantic' not in style_txt:
        style_path.write_text(style_txt + '\n' + CSS_BLOCK + '\n', encoding='utf-8')
        print('  + CSS .ci-semantic ajouté')

    count = 0
    for slug, data in SEMANTIC.items():
        p = ROOT / slug
        if not p.exists():
            print(f'  ✗ {slug} introuvable'); continue
        txt = p.read_text(encoding='utf-8')
        if 'ci-semantic' in txt:
            print(f'  = {slug} (déjà patché)'); continue
        block = build_block(data)
        # Insère avant .ci-related si présent, sinon avant .ci-seo-data, sinon avant footer
        if '<aside class="ci-related"' in txt:
            new_txt = txt.replace('<aside class="ci-related"', block + '\n<aside class="ci-related"', 1)
        elif '<section class="ci-seo-data"' in txt:
            new_txt = txt.replace('<section class="ci-seo-data"', block + '\n<section class="ci-seo-data"', 1)
        elif '<footer class="footer">' in txt:
            new_txt = txt.replace('<footer class="footer">', block + '\n<footer class="footer">', 1)
        else:
            print(f'  ✗ {slug} : pas de point d\'insertion'); continue
        if new_txt != txt:
            p.write_text(new_txt, encoding='utf-8')
            count += 1
            print(f'  ✓ {slug}')
    print(f'\n{count} pages avec bloc sémantique injecté')


if __name__ == '__main__':
    main()
