"""
Injecte du Schema.org HowTo sur les 8 outils stratégiques.
Permet à Google d'afficher les étapes directement dans les résultats
de recherche (rich snippets HowTo, gros boost de CTR).

Usage : python scripts/inject_howto_schema.py
"""
import json, sys, io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = 'https://calcinvest.fr'

HOWTOS = {
'simulateur-rendement-locatif.html': {
    'name': 'Comment calculer le rendement locatif net en 4 étapes',
    'description': 'Méthode complète pour calculer le vrai rendement net (charges + fiscalité) d\'un investissement immobilier locatif en France.',
    'totalTime': 'PT3M',
    'steps': [
        ('Renseigner le prix d\'achat et les frais', 'Saisir le prix d\'acquisition du bien immobilier, les frais de notaire (7-8 % dans l\'ancien) et le montant des travaux initiaux éventuels.'),
        ('Saisir le loyer et les charges', 'Entrer le loyer mensuel attendu, la taxe foncière, les charges de copropriété non récupérables, l\'assurance PNO et la vacance prévue (8-15 %).'),
        ('Choisir le régime fiscal', 'Sélectionner entre Micro-foncier (abattement 30 %), Foncier réel, LMNP Micro-BIC (50 %), LMNP réel (amortissements) ou SCI à l\'IS.'),
        ('Lire le rendement net net', 'Le simulateur affiche le cashflow mensuel, le rendement annuel net après tout impôt, et le TRI sur 20 ans avec ou sans levier crédit.'),
    ]
},
'simulateur-dca.html': {
    'name': 'Comment backtester une stratégie DCA en 4 étapes',
    'description': 'Tester l\'efficacité d\'un investissement DCA (Dollar Cost Averaging) sur les données historiques du S&P 500 et d\'autres indices.',
    'totalTime': 'PT2M',
    'steps': [
        ('Choisir un actif et une période', 'Sélectionner parmi 13 actifs disponibles (S&P 500, MSCI World, Nasdaq, Or, etc.) et la période de backtest (1871 à 2026).'),
        ('Définir le versement mensuel', 'Saisir le montant à investir chaque mois (DCA) ou en une fois (Lump Sum) pour comparer les deux stratégies.'),
        ('Activer les options avancées', 'Cocher dividendes réinvestis, ajustement inflation (CPI US), frais ETF (TER), et choisir un scénario historique (1929, 2000, 2008, 2020).'),
        ('Analyser les 10 graphiques', 'Le simulateur génère vue d\'ensemble, rendements glissants, drawdown, volatilité, Monte Carlo et comparaison multi-actifs.'),
    ]
},
'calculateur-fire.html': {
    'name': 'Comment calculer son objectif FIRE en 4 étapes',
    'description': 'Déterminer le capital nécessaire pour l\'indépendance financière (FIRE) selon la règle des 4 % adaptée à la fiscalité française.',
    'totalTime': 'PT2M',
    'steps': [
        ('Estimer ses dépenses annuelles', 'Indiquer le budget annuel souhaité une fois FIRE (loyer/charges, alimentation, voyages, santé). En général entre 18 000 € (LeanFIRE) et 60 000 € (FatFIRE).'),
        ('Choisir un taux de retrait sûr', 'Sélectionner entre 3 % (très sécurisé, recommandé en France), 3,5 % (équilibré) ou 4 % (règle Trinity classique US).'),
        ('Saisir sa situation actuelle', 'Capital déjà accumulé, épargne mensuelle, et rendement annuel attendu (réel, net d\'inflation, 5-7 % typique).'),
        ('Lire le délai FIRE', 'Le simulateur calcule combien d\'années avant d\'atteindre l\'objectif et la trajectoire mensuelle de votre capital.'),
    ]
},
'simulateur-interets-composes.html': {
    'name': 'Comment calculer les intérêts composés sur le long terme',
    'description': 'Projeter la croissance de votre épargne avec capitalisation des intérêts sur plusieurs décennies.',
    'totalTime': 'PT1M',
    'steps': [
        ('Saisir le capital initial', 'Entrer le montant déjà épargné au départ (peut être 0 si vous commencez de zéro).'),
        ('Définir le versement périodique', 'Choisir un versement mensuel ou annuel régulier qui s\'ajoutera au capital.'),
        ('Indiquer le taux et la durée', 'Saisir le rendement annualisé attendu (typique : 7 % S&P 500 historique, 5 % portefeuille mixte) et le nombre d\'années.'),
        ('Visualiser la courbe exponentielle', 'Le graphique montre la part "versée" vs la part "intérêts composés", qui devient majoritaire après ~20 ans.'),
    ]
},
'simulateur-per.html': {
    'name': 'Comment comparer PER vs CTO en 4 étapes',
    'description': 'Évaluer si le PER (Plan d\'Épargne Retraite) est plus rentable qu\'un CTO selon votre TMI et votre horizon.',
    'totalTime': 'PT2M',
    'steps': [
        ('Saisir votre TMI actuelle', 'Indiquer votre Tranche Marginale d\'Imposition (11 %, 30 %, 41 % ou 45 %) — visible sur votre dernier avis d\'imposition.'),
        ('Estimer votre TMI à la retraite', 'En général, la TMI à la retraite est inférieure (revenu plus faible). Si vous passez de 30 % à 11 %, le gain fiscal du PER est maximal.'),
        ('Définir versements et durée', 'Saisir le montant annuel versé au PER ou CTO et la durée d\'accumulation jusqu\'à la retraite.'),
        ('Comparer les deux capitaux nets', 'Le simulateur affiche le capital net après tous impôts à la sortie, en sortie capital et en sortie rente.'),
    ]
},
'simulateur-assurance-vie.html': {
    'name': 'Comment simuler une assurance-vie en 4 étapes',
    'description': 'Projeter la valeur d\'un contrat d\'assurance-vie avec mix fonds €/UC et fiscalité après 8 ans.',
    'totalTime': 'PT2M',
    'steps': [
        ('Choisir l\'allocation €/UC', 'Définir la part en fonds € (sécurisé, ~2 %) et la part en UC (plus risqué, ~6 % attendus).'),
        ('Saisir versements et durée', 'Indiquer le versement initial, les versements programmés mensuels, et la durée du contrat.'),
        ('Activer les options fiscales', 'Cocher abattement après 8 ans (4 600 €/an célibataire, 9 200 € couple) et exonération succession 152 500 €/bénéficiaire.'),
        ('Analyser le capital net', 'Le simulateur affiche valeur du contrat année par année, fiscalité applicable et succession optimisée.'),
    ]
},
'calculateur-impot-revenu.html': {
    'name': 'Comment calculer son impôt sur le revenu 2025 en 4 étapes',
    'description': 'Calculer le montant exact de votre impôt sur le revenu selon le barème 2025 (déclaration 2026).',
    'totalTime': 'PT1M',
    'steps': [
        ('Saisir vos revenus', 'Indiquer salaires nets imposables, revenus fonciers, dividendes, plus-values mobilières — tous les revenus du foyer.'),
        ('Définir la composition du foyer', 'Nombre de parts fiscales selon votre situation (célibataire, couple, enfants à charge, pension alimentaire).'),
        ('Ajouter les déductions', 'Saisir versements PER, dons aux œuvres, frais réels professionnels, pensions versées — tous les abattements applicables.'),
        ('Lire votre IR + TMI', 'Le calculateur affiche le montant exact dû, votre TMI, et la décote éventuelle pour les revenus modestes.'),
    ]
},
'simulateur-pret.html': {
    'name': 'Comment simuler un prêt immobilier en 4 étapes',
    'description': 'Calculer mensualités, capacité d\'emprunt et coût total d\'un crédit immobilier en 2026.',
    'totalTime': 'PT1M',
    'steps': [
        ('Saisir le montant emprunté', 'Indiquer le capital à emprunter (prix du bien − apport − frais de notaire couverts par les fonds propres).'),
        ('Définir taux et durée', 'Saisir le TAEG proposé par la banque (3,2-4,2 % en 2026 selon profil) et la durée du prêt (15 à 25 ans typique).'),
        ('Ajouter l\'assurance emprunteur', 'Indiquer le taux d\'assurance (0,1-0,5 % selon profil et délégation) — peut représenter 30 % du coût total.'),
        ('Lire les résultats complets', 'Mensualité totale, coût total du crédit, capacité d\'emprunt selon vos revenus, tableau d\'amortissement année par année.'),
    ]
},
}


def build_howto_jsonld(slug, data):
    steps = []
    for i, (step_name, step_text) in enumerate(data['steps'], 1):
        steps.append({
            '@type': 'HowToStep',
            'position': i,
            'name': step_name,
            'text': step_text,
        })
    return {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        'name': data['name'],
        'description': data['description'],
        'totalTime': data['totalTime'],
        'step': steps,
        'estimatedCost': {'@type': 'MonetaryAmount', 'currency': 'EUR', 'value': '0'},
        'image': f'{BASE_URL}/assets/og/{slug.replace(".html","")}.png',
        'tool': {'@type': 'HowToTool', 'name': 'Aucun — outil gratuit en ligne'},
    }


def jsonld_script(data):
    return '<script type="application/ld+json">\n' + json.dumps(data, ensure_ascii=False, indent=2) + '\n</script>'


def main():
    count = 0
    for slug, data in HOWTOS.items():
        p = ROOT / slug
        if not p.exists():
            print(f'  ✗ {slug} introuvable'); continue
        txt = p.read_text(encoding='utf-8')
        if '"@type": "HowTo"' in txt:
            print(f'  = {slug} (déjà patché)'); continue
        ld = build_howto_jsonld(slug, data)
        script = jsonld_script(ld)
        new_txt = txt.replace('</head>', script + '\n</head>', 1)
        if new_txt != txt:
            p.write_text(new_txt, encoding='utf-8')
            count += 1
            print(f'  ✓ {slug}')
    print(f'\n{count} pages avec HowTo Schema injecté')


if __name__ == '__main__':
    main()
