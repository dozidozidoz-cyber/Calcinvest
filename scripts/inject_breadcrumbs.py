"""
Injecte un JSON-LD BreadcrumbList (Accueil > Catégorie > Outil) sur
chaque page outil. Affiche un fil d'ariane dans les résultats Google
à la place de l'URL brute.

Usage : python scripts/inject_breadcrumbs.py   (idempotent)
"""
import json, sys, io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://calcinvest.fr'

# slug → (catégorie, nom outil)
TOOLS = {
    'simulateur-dca':                  ('Marchés', 'Simulateur DCA Bourse'),
    'simulateur-dca-crypto':           ('Marchés', 'Simulateur DCA Crypto'),
    'smart-money':                     ('Marchés', 'Smart Money Tracker'),
    'simulateur-dcf':                  ('Marchés', 'Valorisation DCF'),
    'valorisation-marche':             ('Marchés', 'Valorisation du Marché'),
    'allocation-portefeuille':         ('Marchés', 'Allocation de Portefeuille'),
    'regime-marche':                   ('Marchés', 'Régime de Marché'),
    'backtest-timing':                 ('Marchés', 'Backtest Timing'),
    'simulateur-rendement-locatif':    ('Immobilier', 'Rendement Locatif'),
    'simulateur-scpi':                 ('Immobilier', 'Simulateur SCPI'),
    'simulateur-pret':                 ('Immobilier', 'Simulateur de Prêt'),
    'simulateur-lmnp':                 ('Immobilier', 'Simulateur LMNP'),
    'calculateur-plus-value-immobiliere': ('Immobilier', 'Plus-Value Immobilière'),
    'portefeuille-locatif':            ('Immobilier', 'Portefeuille Locatif'),
    'calculateur-pips':                ('Trading', 'Calculateur PIPS'),
    'calculateur-marge-liquidation':   ('Trading', 'Marge & Liquidation'),
    'calculateur-couts-trading':       ('Trading', 'Coûts du Trade'),
    'calculateur-risk-management':     ('Trading', 'Risk Management'),
    'simulateur-monte-carlo-trading':  ('Trading', 'Monte Carlo Trading'),
    'calculateur-fiscalite-trading':   ('Trading', 'Fiscalité Trading'),
    'calculateur-volatilite':          ('Trading', 'ATR & Kelly'),
    'journal-trading':                 ('Trading', 'Journal de Trading'),
    'calculateur-impot-revenu':        ('Fiscalité', 'Calculateur Impôt Revenu'),
    'calculateur-salaire-brut-net':    ('Fiscalité', 'Salaire Brut Net'),
    'calculateur-tva-auto-entrepreneur': ('Fiscalité', 'TVA Auto-Entrepreneur'),
    'calculateur-donation-succession': ('Fiscalité', 'Donation & Succession'),
    'mon-foyer-fiscal':                ('Fiscalité', 'Foyer Fiscal Global'),
    'simulateur-interets-composes':    ('Épargne', 'Intérêts Composés'),
    'calculateur-fire':                ('Épargne', 'Calculateur FIRE'),
    'simulateur-per':                  ('Épargne', 'Simulateur PER'),
    'simulateur-retraite':             ('Épargne', 'Simulateur Retraite'),
    'simulateur-assurance-vie':        ('Épargne', 'Assurance-Vie'),
    'simulateur-decumulation':         ('Épargne', 'Décumulation'),
    'convertisseur-devises':           ('Outils', 'Convertisseur Devises'),
    'calculatrices-express':           ('Outils', 'Calculatrices Express'),
    'comparer':                        ('Outils', 'Comparer Simulations'),
    'mes-projets':                     ('Outils', 'Mes Projets'),
    'glossaire':                       ('Outils', 'Glossaire Financier'),
}

# Ancres de catégorie sur la home (sections existantes)
CAT_ANCHOR = {
    'Marchés': '/#cat-marches', 'Immobilier': '/#cat-immo', 'Trading': '/#cat-trading',
    'Fiscalité': '/#cat-fisca', 'Épargne': '/#cat-epargne', 'Outils': '/#cat-outils',
}


def main():
    count = 0
    for slug, (cat, name) in TOOLS.items():
        p = ROOT / f'{slug}.html'
        if not p.exists():
            print(f'  ✗ {slug}.html introuvable'); continue
        txt = p.read_text(encoding='utf-8')
        if '"BreadcrumbList"' in txt:
            continue
        ld = {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': BASE + '/'},
                {'@type': 'ListItem', 'position': 2, 'name': cat, 'item': BASE + CAT_ANCHOR.get(cat, '/')},
                {'@type': 'ListItem', 'position': 3, 'name': name, 'item': f'{BASE}/{slug}'},
            ],
        }
        script = '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>'
        new_txt = txt.replace('</head>', script + '\n</head>', 1)
        if new_txt != txt:
            p.write_text(new_txt, encoding='utf-8')
            count += 1
    print(f'{count} outils avec BreadcrumbList')


if __name__ == '__main__':
    main()
