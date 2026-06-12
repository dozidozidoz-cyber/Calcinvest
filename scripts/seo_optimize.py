"""
SEO optimizer — patch en lot de toutes les pages CalcInvest.

Actions :
  1. Optimise les meta description (keyword-rich)
  2. Injecte un JSON-LD WebApplication par page
  3. Injecte un JSON-LD FAQPage pour les pages avec FAQ
  4. Ajoute un bloc HTML "Outils liés" avant le footer (maillage interne)
  5. Ajoute une section FAQ HTML visible (5 outils prio)
  6. Régénère sitemap.xml enrichi (image: + priorité)

Usage : python scripts/seo_optimize.py
"""
import json
import re
import sys
import io
from pathlib import Path
from datetime import date

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = 'https://calcinvest.fr'
TODAY = date.today().isoformat()

# ============================================================================
# 1. META DESCRIPTIONS optimisées (keyword-driven, ≤160 chars)
# ============================================================================
META_DESC = {
    'index.html': "36 simulateurs financiers gratuits : DCA, FIRE, rendement locatif, PER, fiscalité 2026. Données historiques S&P 500 1871-2026. 100% gratuit, zéro tracking.",
    'simulateur-dca.html': "Simulateur DCA bourse gratuit 2026 : backtest sur 13 actifs depuis 1871. Crises 1929, 2008, 2020 incluses. Dividendes, inflation, frais ETF, Monte Carlo.",
    'simulateur-dca-crypto.html': "Simulateur DCA crypto gratuit 2026 : backtest BTC, ETH, SOL, BNB, XRP. Calculez votre rendement si vous aviez commencé à n'importe quelle date.",
    'smart-money.html': "Smart Money Tracker : suivez les positions 13F SEC de Buffett, Burry, Ackman, les holdings ARK Invest et les transactions de Nancy Pelosi. Alpha calculé vs S&P 500.",
    'simulateur-rendement-locatif.html': "Calcul rendement locatif net 2026 : cashflow, TRI, LMNP, SCI IS. Tous les frais inclus (notaire, gestion, vacance). Simulateur immobilier complet et gratuit.",
    'simulateur-scpi.html': "Simulateur SCPI 2026 gratuit : pierre papier, 4 régimes fiscaux comparés, simulation rentier. Optimisez votre investissement immobilier passif.",
    'simulateur-pret.html': "Simulateur prêt immobilier 2026 : capacité d'emprunt, mensualités, frais de notaire, assurance. Calcul instantané pour votre projet immo.",
    'simulateur-lmnp.html': "Simulateur LMNP 2026 : Micro-BIC vs Réel + amortissements. Calculez le régime fiscal qui maximise votre rendement en location meublée.",
    'calculateur-plus-value-immobiliere.html': "Calcul plus-value immobilière 2026 : barème complet, abattements durée, IR + prélèvements sociaux. Simulez votre fiscalité de cession.",
    'portefeuille-locatif.html': "Portefeuille locatif consolidé : vue agrégée multi-biens, cashflow global, TRI portefeuille. Pilotez votre patrimoine immobilier.",
    'simulateur-dcf': "Valorisation DCF 2026 : calculez la valeur intrinsèque d'une action selon ses flux de trésorerie futurs (WACC, croissance, terminal value).",
    'valorisation-marche.html': "Valorisation marché 2026 : CAPE Shiller, drawdown, score composite. Le marché actions est-il cher ou bon marché actuellement ?",
    'allocation-portefeuille.html': "Allocation de portefeuille backtest : 60/40, All-Weather Dalio, Permanent Browne. Comparez les stratégies sur 30 ans de données réelles.",
    'regime-marche.html': "Régime de marché : Bull / Bear / Range / Volatile. Détection automatique via 5 indicateurs techniques (volatilité, drawdown, momentum).",
    'backtest-timing.html': "Backtest stratégies de timing : Golden Cross, Faber GTAA, RSI, momentum. Comparez vs buy & hold sur 50 ans de données S&P 500.",
    'calculateur-pips.html': "Calculateur PIPS forex et CFD : valeur d'un pip + taille de position optimale selon votre risque (% du capital). 20+ instruments.",
    'calculateur-marge-liquidation.html': "Calcul marge et liquidation forex/crypto : marge requise, prix de liquidation, distance margin call. Selon votre broker et levier.",
    'calculateur-couts-trading.html': "Coûts réels du trading : décomposition spread + commission + swap. Calculez vos vrais frais cumulés sur l'année et ajustez votre stratégie.",
    'calculateur-risk-management.html': "Risk management trading : expectancy, ratio R/R, breakeven winrate, probabilité de ruine. Les fondamentaux qui décident de la survie.",
    'simulateur-monte-carlo-trading.html': "Monte Carlo trading : 2000 trajectoires simulées de votre système. Drawdowns, percentiles 5/95, distribution des résultats annuels.",
    'calculateur-fiscalite-trading.html': "Fiscalité trading France 2026 : PFU 30% vs IR. Comparez CTO vs PEA pour optimiser votre imposition sur les plus-values boursières.",
    'calculateur-volatilite.html': "Calculateur ATR + Kelly : volatilité (Average True Range) + taille de position optimale (Kelly criterion). Risque corrélé multi-positions.",
    'journal-trading.html': "Journal de trade gratuit : statistiques avancées, equity curve, heatmap mensuelle, import/export CSV. Persistant en local, sans inscription.",
    'calculateur-impot-revenu.html': "Calculateur impôt revenu 2025 (déclaration 2026) : barème, parts, TMI, décote. Calcul complet de votre IR en 30 secondes.",
    'calculateur-salaire-brut-net.html': "Salaire brut net 2026 : conversion avec cotisations URSSAF, retraite, CSG. Cadre, non-cadre, statuts spécifiques.",
    'calculateur-tva-auto-entrepreneur.html': "TVA et auto-entrepreneur 2026 : conversion HT/TTC + URSSAF micro. Calculez votre vrai net après cotisations.",
    'calculateur-donation-succession.html': "Donation et succession 2026 : abattements, barème, démembrement. Optimisez la transmission patrimoniale avec les bonnes stratégies.",
    'mon-foyer-fiscal.html': "Foyer fiscal global : vue consolidée multi-membres. Qui paie quoi dans votre foyer ? Optimisation IR + IFI + cotisations.",
    'simulateur-interets-composes.html': "Simulateur intérêts composés 2026 : croissance de votre épargne sur 40 ans. La 8e merveille du monde, calculée à l'euro près.",
    'calculateur-fire.html': "Calculateur FIRE 2026 : indépendance financière, règle des 4%. Combien faut-il pour arrêter de travailler et combien de temps tient le capital ?",
    'simulateur-per.html': "Simulateur PER 2026 : PER vs CTO, économie fiscale selon votre TMI. Quel plan retraite est vraiment rentable pour vous ?",
    'simulateur-retraite.html': "Simulateur retraite France 2026 : régime général + Agirc-Arrco. Calcul de votre pension nette à l'euro près.",
    'simulateur-assurance-vie.html': "Simulateur assurance-vie 2026 : fonds €/UC, fiscalité 8 ans (abattements 4 600/9 200€), succession 152 500€/bénéficiaire.",
    'simulateur-decumulation.html': "Décumulation retraite : taux de retrait sûr (SWR) + stratégie 3 buckets. Combien de temps votre capital tient-il ?",
    'convertisseur-devises.html': "Convertisseur devises live 2026 : taux BCE en direct, 30+ devises. Idéal pour vos voyages et achats internationaux.",
    'calculatrices-express.html': "4 calculatrices express en 1 clic : TMI, SMIC net 2026, mensualité prêt, conversion devise live. Ultra-rapide.",
    'comparer.html': "Comparer simulations CalcInvest : jusqu'à 3 projets côte-à-côte. Quel scénario d'investissement gagne sur le long terme ?",
    'mes-projets.html': "Mes projets CalcInvest : sauvegardes locales + sync cloud. Retrouvez tous vos calculs en un clic, exports CSV.",
    'glossaire.html': "Glossaire financier : TMI, CAPE, SWR, PFU, TRI, IRR, ETF, PEA, CTO… Toutes les définitions claires pour comprendre l'investissement.",
    'a-propos.html': "À propos de CalcInvest : un projet 100% local, sans tracking, fait par un investisseur français pour les investisseurs français.",
    'methodologie.html': "Méthodologie CalcInvest : sources des données (Shiller, Yahoo Finance, INSEE, CNAV), formules de calcul, hypothèses. Tout est transparent.",
    'mentions-legales.html': "Mentions légales CalcInvest : éditeur, hébergement Vercel, gestion des données personnelles (RGPD), cookies (aucun).",
    'blog.html': "Blog CalcInvest : analyses marché, comparatifs (PER vs CTO, DCA vs Lump Sum), guides fiscalité 2026 et investissement long terme.",
    'connexion.html': "Connexion CalcInvest : accédez à vos projets sauvegardés et fonctionnalités premium.",
    'inscription.html': "Créer un compte CalcInvest gratuit : sauvegardez vos simulations et synchronisez vos projets.",
    'abonnement.html': "CalcInvest Premium : sauvegardes illimitées, exports PDF, alertes Smart Money. À partir de 3€/mois.",
}

# ============================================================================
# 2. PER-PAGE METADATA pour JSON-LD WebApplication
# ============================================================================
WEBAPP_META = {
    # slug → (name, description courte pour schema)
    'simulateur-dca.html': ('Simulateur DCA Bourse', 'Backtest historique d\'une stratégie DCA bourse depuis 1871'),
    'simulateur-dca-crypto.html': ('Simulateur DCA Crypto', 'Backtest historique DCA sur BTC, ETH et autres cryptos'),
    'smart-money.html': ('Smart Money Tracker', 'Suivi des portefeuilles d\'investisseurs institutionnels et politiciens'),
    'simulateur-rendement-locatif.html': ('Calcul Rendement Locatif', 'Simulateur complet de rendement immobilier locatif'),
    'simulateur-scpi.html': ('Simulateur SCPI', 'Investissement pierre papier avec optimisation fiscale'),
    'simulateur-pret.html': ('Simulateur Prêt Immobilier', 'Calcul de mensualités et capacité d\'emprunt'),
    'simulateur-lmnp.html': ('Simulateur LMNP', 'Location meublée non-professionnelle, Micro-BIC vs Réel'),
    'calculateur-plus-value-immobiliere.html': ('Calcul Plus-Value Immobilière', 'Fiscalité de cession immobilière'),
    'portefeuille-locatif.html': ('Portefeuille Locatif', 'Gestion agrégée multi-biens immobiliers'),
    'simulateur-dcf.html': ('Valorisation DCF', 'Valeur intrinsèque d\'une action par flux de trésorerie actualisés'),
    'valorisation-marche.html': ('Valorisation du Marché', 'CAPE Shiller, drawdown, score composite'),
    'allocation-portefeuille.html': ('Allocation de Portefeuille', 'Stratégies 60/40, All-Weather, Permanent'),
    'regime-marche.html': ('Régime de Marché', 'Détection Bull / Bear / Range / Volatile'),
    'backtest-timing.html': ('Backtest Stratégies Timing', 'Golden Cross, GTAA, RSI, momentum'),
    'calculateur-pips.html': ('Calculateur PIPS', 'Valeur d\'un pip et taille de position forex/CFD'),
    'calculateur-marge-liquidation.html': ('Marge & Liquidation', 'Marge et prix de liquidation forex/crypto'),
    'calculateur-couts-trading.html': ('Coûts du Trade', 'Spread + commission + swap réels'),
    'calculateur-risk-management.html': ('Risk Management', 'Expectancy, R/R, probabilité de ruine'),
    'simulateur-monte-carlo-trading.html': ('Monte Carlo Trading', '2000 trajectoires simulées de votre système'),
    'calculateur-fiscalite-trading.html': ('Fiscalité Trading', 'PFU vs IR, CTO vs PEA'),
    'calculateur-volatilite.html': ('ATR & Kelly', 'Volatilité et sizing optimal'),
    'journal-trading.html': ('Journal de Trade', 'Suivi statistique de votre trading'),
    'calculateur-impot-revenu.html': ('Calculateur Impôt Revenu', 'Calcul IR 2025 / déclaration 2026'),
    'calculateur-salaire-brut-net.html': ('Salaire Brut/Net', 'Conversion avec cotisations URSSAF'),
    'calculateur-tva-auto-entrepreneur.html': ('TVA & Auto-Entrepreneur', 'HT/TTC + URSSAF micro'),
    'calculateur-donation-succession.html': ('Donation & Succession', 'Abattements et barème transmission'),
    'mon-foyer-fiscal.html': ('Foyer Fiscal Global', 'Vue consolidée multi-membres'),
    'simulateur-interets-composes.html': ('Intérêts Composés', 'Croissance d\'épargne long terme'),
    'calculateur-fire.html': ('Calculateur FIRE', 'Indépendance financière, règle des 4%'),
    'simulateur-per.html': ('Simulateur PER', 'Plan épargne retraite vs CTO'),
    'simulateur-retraite.html': ('Simulateur Retraite', 'Pension régime général + Agirc-Arrco'),
    'simulateur-assurance-vie.html': ('Simulateur Assurance-Vie', 'Multi-supports, fiscalité 8 ans'),
    'simulateur-decumulation.html': ('Simulateur Décumulation', 'SWR + stratégie 3 buckets'),
    'convertisseur-devises.html': ('Convertisseur Devises', 'Taux BCE live, 30+ devises'),
    'calculatrices-express.html': ('Calculatrices Express', '4 mini-outils 1-clic'),
    'comparer.html': ('Comparer Simulations', 'Jusqu\'à 3 projets côte-à-côte'),
    'mes-projets.html': ('Mes Projets', 'Sauvegardes locales + sync cloud'),
    'glossaire.html': ('Glossaire Financier', 'Définitions claires de l\'investissement'),
}

# ============================================================================
# 3. FAQ par outil (5 outils prio)
# ============================================================================
FAQ_DATA = {
    'simulateur-dca.html': [
        ("Le DCA fonctionne-t-il en bear market ?",
         "Oui, c'est même quand il fonctionne le mieux. Sur le S&P 500, ceux qui ont DCA pendant 2007-2009 (-55% en absolu) ont accumulé tellement de parts à bas prix qu'ils ont battu le buy & hold de ~3% par an sur 15 ans. Le simulateur le démontre avec le scénario 2007."),
        ("DCA vs investissement en une fois (Lump Sum) : lequel rapporte plus ?",
         "Lump Sum gagne environ 2/3 du temps sur 100 ans de données, simplement parce que les marchés montent plus souvent qu'ils ne baissent. Mais le DCA réduit drastiquement le risque émotionnel — il faut comparer perf ajustée du stress, pas juste perf brute."),
        ("À partir de combien démarrer un DCA en 2026 ?",
         "50 à 100 € par mois suffisent pour démarrer. Les frais ETF modernes (TER < 0,2%) et les courtiers PEA gratuits comme Trade Republic ou BoursoBank rendent le DCA viable même avec petite épargne. Le simulateur intègre les frais réels."),
        ("DCA mensuel ou hebdomadaire : quelle différence ?",
         "Sur 30 ans, la différence est de < 0,1% en rendement final. Choisis la fréquence qui colle à ton salaire pour automatiser. Mensuel = simplicité, hebdomadaire = lissage très légèrement supérieur en marché ultra-volatil."),
        ("Faut-il réinvestir les dividendes ?",
         "Oui systématiquement. Sur 100 ans de S&P 500, environ 40% de la performance totale vient des dividendes réinvestis. Le simulateur permet de comparer avec et sans réinvestissement pour visualiser l'écart."),
        ("Comment intégrer la fiscalité française au DCA ?",
         "PEA : exonéré au-delà de 5 ans (prélèvements sociaux 17,2% seulement). CTO : flat tax 30% (PFU) sur les plus-values. Le simulateur propose les deux. Pour les ETF UCITS éligibles PEA (CW8, CSPX EU), le gain fiscal est massif sur 20+ ans."),
    ],
    'smart-money.html': [
        ("Qu'est-ce qu'un filing 13F ?",
         "Aux États-Unis, tout gérant de fonds avec plus de 100M$ d'actifs doit publier ses positions actions chaque trimestre via la SEC (formulaire 13F-HR). C'est public et gratuit. CalcInvest récupère ces données directement depuis data.sec.gov."),
        ("Pourquoi suivre Nancy Pelosi ?",
         "Pelosi (et son mari Paul Pelosi qui gère le portefeuille) a battu le S&P 500 de manière significative sur les dernières années. Que ce soit par chance, information privilégiée ou compétence, le timing de ses trades est étudié par toute la communauté finance — CalcInvest calcule l'alpha en direct."),
        ("Les données sont-elles en temps réel ?",
         "13F : trimestriel, déposé sous 45 jours après la fin du trimestre. ARK : daily (J+1). STOCK Act House : généralement sous 30-45 jours après la transaction. Donc pas du \"temps réel\", mais aussi frais que la loi le permet."),
        ("Puis-je copier ces trades ?",
         "Légalement oui (données publiques). Pratiquement : tu auras toujours 30-90 jours de retard sur les hedge funds. Sur les politiciens c'est plus exploitable car les trades sont smaller et le timing révèle des paris ciblés (ex : NVDA call options Pelosi). Mais aucune garantie."),
        ("C'est quoi l'alpha vs S&P 500 ?",
         "L'alpha = ta performance — la performance du benchmark sur la même période. Si Pelosi achète AAPL et fait +25%, mais que le S&P 500 a fait +20% sur la même fenêtre, son alpha est +5%. C'est ce qui mesure la skill (ou la chance)."),
        ("Combien coûte le suivi sur CalcInvest ?",
         "Gratuit, sans inscription, sans cookies. Toutes les sources sont publiques (SEC EDGAR, arkfunds.io, disclosures-clerk.house.gov). Premium prévu pour les alertes email \"Pelosi a tradé\" et l'export PDF."),
    ],
    'calculateur-fire.html': [
        ("C'est quoi le mouvement FIRE ?",
         "FIRE = Financial Independence, Retire Early. Le principe : épargner agressivement (50% du revenu et plus) et investir en ETF/immobilier pour atteindre l'indépendance financière avant 50 ans. La règle des 4% en est le pilier."),
        ("Qu'est-ce que la règle des 4% ?",
         "Étude Trinity (1998) : sur 30 ans de marchés US (1926-1995), retirer 4% du capital initial chaque année (ajusté de l'inflation) avait une probabilité de survie de 95%+ avec un portefeuille 60/40 actions/obligations. C'est devenu le standard FIRE."),
        ("La règle des 4% est-elle valide en 2026 ?",
         "Débattue. Les rendements futurs des actions et obligations pourraient être inférieurs aux moyennes historiques. Beaucoup de FIRE actuels visent plutôt 3-3,5% pour plus de sécurité. Le simulateur permet d'ajuster ce taux."),
        ("Combien faut-il pour devenir FIRE en France ?",
         "Règle du 25x : si tu dépenses 30 000€/an, il te faut 750 000€ investis. Mais en France ajoute les prélèvements sociaux (17,2%) et impôts. Compte plutôt 30-33x tes dépenses annuelles pour être tranquille."),
        ("FIRE et fiscalité française : quelles enveloppes ?",
         "PEA après 5 ans (exonération hors PS) reste la meilleure pour les actions UE/US via ETF. Assurance-vie après 8 ans (abattement 4 600€/an + 152 500€ succession). PER pour réduire l'IR pendant la phase d'accumulation."),
        ("LeanFIRE, FatFIRE, BaristaFIRE : c'est quoi ?",
         "LeanFIRE : FIRE avec budget serré (~25k€/an). FatFIRE : FIRE confortable (>60k€/an). BaristaFIRE : capital partiel + petit job pour combler le gap. Choisis selon ton style de vie cible."),
    ],
    'simulateur-rendement-locatif.html': [
        ("Comment calculer le rendement locatif net ?",
         "Rendement net = (Loyers annuels - charges - impôts - vacance) / (Prix d'achat + frais de notaire + travaux). Le simulateur intègre tous ces postes pour un calcul réaliste, pas juste le rendement brut affiché par les agences."),
        ("Quel est un bon rendement locatif en 2026 ?",
         "Net (après tout) : 3-4% = correct, 5%+ = excellent, 7%+ = exceptionnel mais souvent risqué (zone tendue, état dégradé). Brut affiché par les agences : ajoute 2 points pour comparer au net. La fiscalité française rogne sévèrement."),
        ("LMNP réel ou Micro-BIC : lequel choisir ?",
         "Sous 77 700€ de recettes, Micro-BIC = abattement forfaitaire 50%. Réel = on déduit les vraies charges + amortissements. Si tu as un crédit ou des travaux, Réel gagne presque toujours. Le simulateur compare les deux."),
        ("Vaut-il mieux investir en SCI à l'IS ?",
         "Pour les patrimoines importants ou les revenus locatifs élevés (TMI 30%+), oui. L'IS à 15-25% sur les premiers 42 500€ et amortissement du bien rendent la SCI ultra-efficace. Mais complexité comptable + plus-value des parts = plus dur à revendre."),
        ("Comment intégrer la vacance locative au calcul ?",
         "Compte 1 mois de vacance par an minimum (8% des loyers) en zone tendue, 2-3 mois en zone détendue. Le simulateur permet de saisir le taux pour stresser ton scénario."),
        ("Quel TRI cible pour un investissement locatif ?",
         "TRI sur 20 ans : 6-8% = bon investissement (proche du S&P 500 net d'impôts). 10%+ = excellent (mais souvent en zone à risque). En dessous de 5%, regarde plutôt les SCPI ou les ETF — moins de hassle pour le même rendement."),
    ],
    'simulateur-interets-composes.html': [
        ("Les intérêts composés, c'est quoi exactement ?",
         "Tes intérêts gagnés génèrent eux-mêmes des intérêts. À 7%/an, 10 000€ deviennent 19 672€ en 10 ans (et pas 17 000€ comme avec des intérêts simples). Sur 40 ans, ça fait 149 745€. Einstein l'aurait appelé la 8e merveille du monde."),
        ("Quel rendement annuel utiliser pour mes simulations ?",
         "Référence historique : S&P 500 = 7% réel (net inflation), bond US 10y = 2% réel, livret A 2026 = ~0% réel. Pour un portefeuille mixte, 4-6% net inflation est une hypothèse raisonnable."),
        ("Faut-il compter avec ou sans inflation ?",
         "Toujours en réel (net inflation) pour avoir une vraie idée du pouvoir d'achat futur. 100 000€ dans 30 ans avec 2% d'inflation = 55 000€ d'aujourd'hui. Le simulateur permet les deux modes."),
        ("Combien faut-il épargner par mois pour atteindre 1M€ ?",
         "Avec 7% de rendement annuel net inflation : 500€/mois pendant 35 ans, ou 1 000€/mois pendant 27 ans, ou 2 000€/mois pendant 20 ans. Le temps compte plus que le montant — commencer tôt est le levier principal."),
        ("Impact de la fréquence de capitalisation ?",
         "Capitalisation mensuelle vs annuelle : <0,5% d'écart sur 40 ans. Ne te prends pas la tête, prends la fréquence proposée par ton support (souvent annuelle pour les ETF à dividendes accumulants)."),
        ("Comment battre les intérêts composés du marché ?",
         "Très difficile. <10% des fonds actifs battent le S&P 500 sur 20+ ans. La meilleure stratégie pour la plupart : ETF indiciel low-cost + temps + zéro intervention. Le simulateur démontre pourquoi sur 30+ ans."),
    ],
}

# ============================================================================
# 4. INTERNAL LINKING — outils liés par outil
# ============================================================================
RELATED = {
    'simulateur-dca.html':                 ['simulateur-interets-composes', 'calculateur-fire', 'allocation-portefeuille', 'smart-money'],
    'simulateur-dca-crypto.html':          ['simulateur-dca', 'calculateur-volatilite', 'calculateur-risk-management', 'simulateur-interets-composes'],
    'smart-money.html':                    ['simulateur-dca', 'valorisation-marche', 'allocation-portefeuille', 'simulateur-dcf'],
    'simulateur-rendement-locatif.html':   ['simulateur-pret', 'simulateur-lmnp', 'calculateur-plus-value-immobiliere', 'simulateur-scpi'],
    'simulateur-scpi.html':                ['simulateur-rendement-locatif', 'simulateur-assurance-vie', 'allocation-portefeuille', 'simulateur-decumulation'],
    'simulateur-pret.html':                ['simulateur-rendement-locatif', 'calculateur-plus-value-immobiliere', 'simulateur-lmnp', 'mon-foyer-fiscal'],
    'simulateur-lmnp.html':                ['simulateur-rendement-locatif', 'calculateur-impot-revenu', 'portefeuille-locatif', 'calculateur-plus-value-immobiliere'],
    'calculateur-plus-value-immobiliere.html': ['simulateur-rendement-locatif', 'simulateur-lmnp', 'calculateur-donation-succession', 'mon-foyer-fiscal'],
    'portefeuille-locatif.html':           ['simulateur-rendement-locatif', 'simulateur-lmnp', 'simulateur-scpi', 'comparer'],
    'simulateur-dcf.html':                 ['valorisation-marche', 'allocation-portefeuille', 'smart-money', 'regime-marche'],
    'valorisation-marche.html':            ['allocation-portefeuille', 'regime-marche', 'backtest-timing', 'smart-money'],
    'allocation-portefeuille.html':        ['simulateur-dca', 'simulateur-decumulation', 'calculateur-fire', 'backtest-timing'],
    'regime-marche.html':                  ['valorisation-marche', 'backtest-timing', 'simulateur-dca', 'calculateur-risk-management'],
    'backtest-timing.html':                ['simulateur-dca', 'regime-marche', 'allocation-portefeuille', 'simulateur-monte-carlo-trading'],
    'calculateur-pips.html':               ['calculateur-marge-liquidation', 'calculateur-couts-trading', 'calculateur-risk-management', 'journal-trading'],
    'calculateur-marge-liquidation.html':  ['calculateur-pips', 'calculateur-couts-trading', 'calculateur-risk-management', 'calculateur-volatilite'],
    'calculateur-couts-trading.html':      ['calculateur-pips', 'calculateur-fiscalite-trading', 'journal-trading', 'calculateur-risk-management'],
    'calculateur-risk-management.html':    ['calculateur-volatilite', 'simulateur-monte-carlo-trading', 'journal-trading', 'calculateur-pips'],
    'simulateur-monte-carlo-trading.html': ['calculateur-risk-management', 'calculateur-volatilite', 'journal-trading', 'backtest-timing'],
    'calculateur-fiscalite-trading.html':  ['calculateur-impot-revenu', 'simulateur-per', 'calculateur-couts-trading', 'mon-foyer-fiscal'],
    'calculateur-volatilite.html':         ['calculateur-risk-management', 'simulateur-monte-carlo-trading', 'calculateur-pips', 'journal-trading'],
    'journal-trading.html':                ['calculateur-risk-management', 'simulateur-monte-carlo-trading', 'calculateur-volatilite', 'calculateur-fiscalite-trading'],
    'calculateur-impot-revenu.html':       ['calculateur-salaire-brut-net', 'simulateur-per', 'calculateur-fiscalite-trading', 'mon-foyer-fiscal'],
    'calculateur-salaire-brut-net.html':   ['calculateur-impot-revenu', 'calculateur-tva-auto-entrepreneur', 'simulateur-per', 'mon-foyer-fiscal'],
    'calculateur-tva-auto-entrepreneur.html': ['calculateur-salaire-brut-net', 'calculateur-impot-revenu', 'simulateur-per', 'mon-foyer-fiscal'],
    'calculateur-donation-succession.html':['calculateur-plus-value-immobiliere', 'simulateur-assurance-vie', 'mon-foyer-fiscal', 'simulateur-per'],
    'mon-foyer-fiscal.html':               ['calculateur-impot-revenu', 'calculateur-donation-succession', 'simulateur-per', 'comparer'],
    'simulateur-interets-composes.html':   ['simulateur-dca', 'calculateur-fire', 'simulateur-assurance-vie', 'allocation-portefeuille'],
    'calculateur-fire.html':               ['simulateur-interets-composes', 'simulateur-decumulation', 'simulateur-dca', 'allocation-portefeuille'],
    'simulateur-per.html':                 ['calculateur-impot-revenu', 'simulateur-assurance-vie', 'simulateur-retraite', 'mon-foyer-fiscal'],
    'simulateur-retraite.html':            ['simulateur-per', 'simulateur-decumulation', 'calculateur-fire', 'simulateur-assurance-vie'],
    'simulateur-assurance-vie.html':       ['simulateur-per', 'calculateur-donation-succession', 'allocation-portefeuille', 'simulateur-decumulation'],
    'simulateur-decumulation.html':        ['calculateur-fire', 'simulateur-retraite', 'allocation-portefeuille', 'simulateur-assurance-vie'],
}

TOOL_LABELS = {  # slug → label affiché dans les related links
    'simulateur-dca': 'DCA Bourse', 'simulateur-dca-crypto': 'DCA Crypto',
    'smart-money': 'Smart Money Tracker', 'simulateur-dcf': 'Valorisation DCF',
    'valorisation-marche': 'Valorisation Marché', 'allocation-portefeuille': 'Allocation Portefeuille',
    'regime-marche': 'Régime de marché', 'backtest-timing': 'Backtest Timing',
    'simulateur-rendement-locatif': 'Rendement Locatif', 'simulateur-scpi': 'SCPI',
    'simulateur-pret': 'Simulateur Prêt', 'simulateur-lmnp': 'LMNP',
    'calculateur-plus-value-immobiliere': 'Plus-Value Immobilière', 'portefeuille-locatif': 'Portefeuille Locatif',
    'calculateur-pips': 'PIPS', 'calculateur-marge-liquidation': 'Marge & Liquidation',
    'calculateur-couts-trading': 'Coûts Trading', 'calculateur-risk-management': 'Risk Management',
    'simulateur-monte-carlo-trading': 'Monte Carlo Trading', 'calculateur-fiscalite-trading': 'Fiscalité Trading',
    'calculateur-volatilite': 'ATR & Kelly', 'journal-trading': 'Journal de Trade',
    'calculateur-impot-revenu': 'Impôt Revenu', 'calculateur-salaire-brut-net': 'Salaire Brut/Net',
    'calculateur-tva-auto-entrepreneur': 'TVA Auto-Entrepreneur', 'calculateur-donation-succession': 'Donation/Succession',
    'mon-foyer-fiscal': 'Foyer Fiscal', 'simulateur-interets-composes': 'Intérêts Composés',
    'calculateur-fire': 'FIRE', 'simulateur-per': 'PER',
    'simulateur-retraite': 'Retraite', 'simulateur-assurance-vie': 'Assurance-Vie',
    'simulateur-decumulation': 'Décumulation', 'convertisseur-devises': 'Convertisseur Devises',
    'calculatrices-express': 'Calculatrices Express', 'comparer': 'Comparer Simulations',
    'mes-projets': 'Mes Projets', 'glossaire': 'Glossaire',
}

# ============================================================================
# Builders
# ============================================================================

def build_webapp_jsonld(name, desc, url, slug):
    """JSON-LD WebApplication pour les outils."""
    return {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        'name': name,
        'description': desc,
        'url': url,
        'applicationCategory': 'FinanceApplication',
        'operatingSystem': 'Any',
        'inLanguage': 'fr-FR',
        'isAccessibleForFree': True,
        'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'},
        'publisher': {
            '@type': 'Organization',
            'name': 'CalcInvest',
            'url': BASE_URL,
            'logo': {'@type': 'ImageObject', 'url': f'{BASE_URL}/assets/icons/icon-512.png'},
        },
    }


def build_faq_jsonld(faq_pairs):
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': [
            {
                '@type': 'Question',
                'name': q,
                'acceptedAnswer': {'@type': 'Answer', 'text': a},
            }
            for q, a in faq_pairs
        ],
    }


def jsonld_script(data):
    return '<script type="application/ld+json">\n' + json.dumps(data, ensure_ascii=False, indent=2) + '\n</script>'


def build_related_block(slug_no_ext):
    """Bloc HTML 'Outils liés' inséré avant le footer."""
    related = RELATED.get(slug_no_ext + '.html')
    if not related:
        return ''
    items = ''
    for s in related:
        label = TOOL_LABELS.get(s, s)
        items += f'  <a href="/{s}" class="ci-related-item"><span class="ci-related-arrow">→</span>{label}</a>\n'
    return f'''
<!-- ═══ Outils liés (SEO internal linking) ═══ -->
<aside class="ci-related" aria-label="Outils complémentaires">
  <div class="ci-related-inner">
    <h3 class="ci-related-title">Outils complémentaires</h3>
    <div class="ci-related-grid">
{items}    </div>
  </div>
</aside>
'''


def build_faq_block(faq_pairs):
    """Bloc HTML FAQ visible (accordion), avant le footer."""
    items = ''
    for i, (q, a) in enumerate(faq_pairs):
        items += f'''  <details class="ci-faq-item">
    <summary class="ci-faq-q">{q}</summary>
    <div class="ci-faq-a">{a}</div>
  </details>
'''
    return f'''
<!-- ═══ FAQ (SEO + UX) ═══ -->
<section class="ci-faq" aria-label="Questions fréquentes">
  <div class="ci-faq-inner">
    <h2 class="ci-faq-title">Questions fréquentes</h2>
{items}  </div>
</section>
'''


# ============================================================================
# Main patcher
# ============================================================================

def patch_page(html_path):
    name = html_path.name
    txt = html_path.read_text(encoding='utf-8')
    changed = False

    # 1. Meta description
    if name in META_DESC:
        new_desc = META_DESC[name]
        # Replace existing meta description
        new_txt, n = re.subn(
            r'<meta name="description" content="[^"]*"\s*/?>',
            f'<meta name="description" content="{new_desc}" />',
            txt,
        )
        if n > 0 and new_txt != txt:
            txt = new_txt
            changed = True

    # 2. JSON-LD WebApplication (skip si déjà présent)
    slug_no_ext = name.replace('.html', '')
    if name in WEBAPP_META and 'WebApplication' not in txt:
        wa_name, wa_desc = WEBAPP_META[name]
        ld = build_webapp_jsonld(
            wa_name, wa_desc,
            f'{BASE_URL}/{slug_no_ext}' if slug_no_ext != 'index' else BASE_URL,
            slug_no_ext,
        )
        script = jsonld_script(ld)
        # Inject juste avant </head>
        new_txt = txt.replace('</head>', script + '\n</head>', 1)
        if new_txt != txt:
            txt = new_txt
            changed = True

    # 3. JSON-LD FAQPage (skip si déjà présent)
    if name in FAQ_DATA and 'FAQPage' not in txt:
        faq_ld = build_faq_jsonld(FAQ_DATA[name])
        script = jsonld_script(faq_ld)
        new_txt = txt.replace('</head>', script + '\n</head>', 1)
        if new_txt != txt:
            txt = new_txt
            changed = True

    # 4. Bloc "Outils liés" HTML (skip si déjà présent)
    if name in RELATED and 'ci-related' not in txt:
        block = build_related_block(slug_no_ext)
        # Insert avant <footer class="footer">
        if '<footer class="footer">' in txt:
            new_txt = txt.replace('<footer class="footer">', block + '<footer class="footer">', 1)
            if new_txt != txt:
                txt = new_txt
                changed = True

    # 5. Bloc FAQ HTML (skip si déjà présent)
    if name in FAQ_DATA and 'ci-faq' not in txt:
        block = build_faq_block(FAQ_DATA[name])
        if '<footer class="footer">' in txt:
            new_txt = txt.replace('<footer class="footer">', block + '<footer class="footer">', 1)
            if new_txt != txt:
                txt = new_txt
                changed = True

    if changed:
        html_path.write_text(txt, encoding='utf-8')
    return changed


def regen_sitemap():
    """Régénère sitemap.xml avec image namespace + priorités précises."""
    pages = [
        ('', 1.0, 'weekly'),  # home
    ]
    # Tous les outils principaux (priorité 0.9)
    main_tools = [k.replace('.html', '') for k in WEBAPP_META]
    for slug in main_tools:
        pages.append((slug, 0.9, 'monthly'))
    # Rapport hebdo auto-généré (contenu frais → crawl fréquent)
    pages.append(('marche-cette-semaine', 0.8, 'weekly'))
    # Pages secondaires
    for slug in ['a-propos', 'methodologie', 'glossaire', 'comparer', 'mes-projets',
                 'mentions-legales', 'abonnement', 'connexion', 'inscription', 'blog']:
        pages.append((slug, 0.5, 'monthly'))
    # Blog posts
    for p in (ROOT / 'blog').glob('*.html'):
        pages.append(('blog/' + p.stem, 0.7, 'monthly'))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    seen = set()
    for slug, pri, freq in pages:
        if slug in seen: continue
        seen.add(slug)
        url = f'{BASE_URL}/{slug}' if slug else f'{BASE_URL}/'
        lines.append('  <url>')
        lines.append(f'    <loc>{url}</loc>')
        lines.append(f'    <lastmod>{TODAY}</lastmod>')
        lines.append(f'    <changefreq>{freq}</changefreq>')
        lines.append(f'    <priority>{pri}</priority>')
        lines.append('  </url>')
    lines.append('</urlset>')
    (ROOT / 'sitemap.xml').write_text('\n'.join(lines), encoding='utf-8')
    print(f'  ✓ sitemap.xml ({len(seen)} URLs)')


def main():
    print('=== SEO OPTIMIZE ===\n')
    count = 0
    for p in ROOT.glob('*.html'):
        if p.name.startswith('_'): continue
        if patch_page(p):
            print(f'  ✓ {p.name}')
            count += 1
    print(f'\n{count} pages patchées')
    print('\nRégénération sitemap…')
    regen_sitemap()
    print('\n✓ SEO optimize terminé')


if __name__ == '__main__':
    main()
