"""
Génère les Open Graph images (1200x630) pour chaque page principale.
Cartes "premium fintech" : fond brand sombre, logo Cristal, titre, sous-titre.

Usage :
    python scripts/generate_og_images.py

Sortie : assets/og/{slug}.png
"""
import sys, io, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'og'
OUT.mkdir(parents=True, exist_ok=True)

FONT_BOLD    = 'C:/Windows/Fonts/segoeuib.ttf'
FONT_REGULAR = 'C:/Windows/Fonts/segoeui.ttf'

BG      = (10, 15, 20, 255)        # #0A0F14
BG_2    = (22, 28, 35, 255)        # #161C23
ACCENT  = (52, 211, 153, 255)      # #34D399
TEXT    = (245, 247, 250, 255)
TEXT_2  = (148, 163, 184, 255)
BORDER  = (38, 48, 60, 255)

# Liste des pages avec leur (slug, title, subtitle, eyebrow)
PAGES = [
    # Marchés
    ('default',                       'CalcInvest', 'Simulateurs financiers — DCA, FIRE, locatif, fiscalité, Smart Money.', 'CalcInvest'),
    ('home',                          'Investir avec les bons chiffres.', '36 simulateurs gratuits couvrant bourse, immo, retraite, FIRE et trading.', 'CalcInvest · Accueil'),
    ('smart-money',                   'Smart Money Tracker', 'Suivez les positions de Buffett, Burry, Ackman, ARK et Pelosi — perf vs S&P 500.', 'Live · 13F + ARK + STOCK Act'),
    ('simulateur-dca',                'Simulateur DCA Bourse', 'Backtest 1871→2026 sur 13 actifs. Crises de 1929, 2008, 2020 incluses.', 'DCA · Bourse'),
    ('simulateur-dca-crypto',         'Simulateur DCA Crypto', 'BTC, ETH, SOL — votre DCA si vous aviez commencé à n\'importe quelle date.', 'DCA · Crypto'),
    ('simulateur-dcf',                'Valorisation DCF', 'Calculez la valeur intrinsèque d\'une action selon ses flux de trésorerie.', 'Marchés · DCF'),
    ('valorisation-marche',           'Valorisation du marché', 'CAPE Shiller, drawdown, score composite — le marché est-il cher ?', 'Marchés · Valorisation'),
    ('allocation-portefeuille',       'Allocation de Portefeuille', '60/40, All-Weather Dalio, Permanent Browne — backtesté sur 30 ans.', 'Marchés · Allocation'),
    ('regime-marche',                 'Régime de marché', 'Bull / Bear / Range / Volatile — détection automatique par 5 indicateurs.', 'Marchés · Régime'),
    ('backtest-timing',               'Backtest Timing', 'Golden Cross, Faber GTAA, RSI — vos stratégies sur 50 ans de data.', 'Marchés · Timing'),
    # Immobilier
    ('simulateur-rendement-locatif',  'Rendement Locatif', 'Cashflow, TRI, LMNP, SCI à l\'IS — analyse complète d\'un investissement immo.', 'Immobilier · Rendement'),
    ('simulateur-scpi',               'Simulateur SCPI', 'Pierre papier, 4 régimes fiscaux comparés + simulation rentier.', 'Immobilier · SCPI'),
    ('simulateur-pret',               'Simulateur de Prêt', 'Capacité, mensualités, frais de notaire — votre projet immo complet.', 'Immobilier · Prêt'),
    ('simulateur-lmnp',               'LMNP · Location Meublée', 'Micro-BIC vs Réel + amortissements — quel régime maximise votre net ?', 'Immobilier · LMNP'),
    ('portefeuille-locatif',          'Portefeuille Locatif', 'Vue agrégée multi-biens : cashflow consolidé, TRI global.', 'Immobilier · Multi-biens'),
    ('calculateur-plus-value-immobiliere', 'Plus-Value Immobilière', 'Cession, abattements durée, IR + PS — barème 2026.', 'Immobilier · Plus-value'),
    # Trading
    ('calculateur-pips',              'Calculateur PIPS', 'Valeur d\'un pip + taille de position optimale selon votre risque.', 'Trading · PIPS'),
    ('calculateur-marge-liquidation', 'Marge & Liquidation', 'Marge requise, prix de liquidation, SL/TP par montant.', 'Trading · Marge'),
    ('calculateur-couts-trading',     'Coûts réels du trade', 'Spread + commission + swap — vrais frais cumulés sur l\'année.', 'Trading · Coûts'),
    ('calculateur-risk-management',   'Risk Management', 'Expectancy, ratio R/R, probabilité de ruine — les fondamentaux.', 'Trading · Risk'),
    ('simulateur-monte-carlo-trading','Monte Carlo Trading', '2 000 trajectoires simulées : drawdowns, percentiles, distribution.', 'Trading · Monte Carlo'),
    ('calculateur-fiscalite-trading', 'Fiscalité Trading FR', 'PFU vs IR, CTO vs PEA — quel est le mieux pour votre stratégie ?', 'Trading · Fiscalité'),
    ('calculateur-volatilite',        'ATR & Kelly', 'Volatilité + sizing optimal — risque corrélé multi-positions.', 'Trading · Quanti'),
    ('journal-trading',               'Journal de Trade', 'Stats avancées, equity curve, heatmap mensuelle — persistant localStorage.', 'Trading · Journal'),
    # Fiscalité
    ('calculateur-impot-revenu',      'Calculateur Impôt Revenu', 'Barème 2025, parts, TMI, décote — calcul complet en 30 secondes.', 'Fiscalité · IR'),
    ('calculateur-salaire-brut-net',  'Salaire Brut/Net', 'Cotisations URSSAF, retraite, CSG — votre vraie fiche de paie.', 'Fiscalité · Salaire'),
    ('calculateur-tva-auto-entrepreneur', 'TVA Auto-Entrepreneur', 'HT/TTC + URSSAF micro — votre vrai net après tout.', 'Fiscalité · Micro'),
    ('calculateur-donation-succession','Donation & Succession', 'Abattements, barème, démembrement — optimiser la transmission.', 'Fiscalité · Transmission'),
    ('mon-foyer-fiscal',              'Foyer Fiscal Global', 'Vue consolidée multi-membres — qui paie quoi dans le foyer.', 'Fiscalité · Foyer'),
    # Épargne
    ('simulateur-interets-composes',  'Intérêts Composés', 'Croissance de votre épargne sur 40 ans — le 8e merveille du monde.', 'Épargne · Composés'),
    ('calculateur-fire',              'Calculateur FIRE', 'Indépendance financière, règle des 4% — combien et combien de temps ?', 'Épargne · FIRE'),
    ('simulateur-per',                'Simulateur PER', 'PER vs CTO, économie fiscale — la TMI fait toute la différence.', 'Épargne · PER'),
    ('simulateur-retraite',           'Simulateur Retraite', 'Régime général + Agirc-Arrco — votre pension à l\'euro près.', 'Épargne · Retraite'),
    ('simulateur-assurance-vie',      'Assurance-Vie', 'Fonds €/UC, fiscalité 8 ans, succession 152 500€/bénéf.', 'Épargne · AV'),
    ('simulateur-decumulation',       'Décumulation', 'SWR + stratégie 3 buckets — combien de temps tient votre capital.', 'Épargne · Phase 2'),
    # Outils
    ('convertisseur-devises',         'Convertisseur Devises', 'Taux BCE en direct, 30+ devises — pour vos voyages et achats.', 'Outils · Devises'),
    ('calculatrices-express',         'Calculatrices Express', '4 mini-outils 1-clic : TMI, SMIC, prêt, devise.', 'Outils · Express'),
    ('comparer',                      'Comparer Simulations', 'Jusqu\'à 3 projets côte-à-côte — quel scénario gagne ?', 'Outils · Compare'),
    ('mes-projets',                   'Mes Projets', 'Sauvegardes + sync cloud — retrouvez tous vos calculs en un clic.', 'Outils · Projets'),
    ('glossaire',                     'Glossaire Financier', 'TMI, CAPE, SWR, PFU… toutes les définitions en clair.', 'Outils · Glossaire'),
]


def text_size(font, text):
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_text(text, font, max_width):
    """Coupe le texte en plusieurs lignes selon la largeur max."""
    words = text.split()
    lines = []
    cur = ''
    for w in words:
        test = (cur + ' ' + w).strip()
        if text_size(font, test)[0] <= max_width:
            cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines


def draw_cristal_logo(draw, cx, cy, size, color=ACCENT, stroke=8):
    """Dessine le logo Cristal centré sur (cx, cy) avec hauteur 'size'."""
    arm = size // 2
    # Outline diamond
    pts = [(cx, cy - arm), (cx + arm, cy), (cx, cy + arm), (cx - arm, cy), (cx, cy - arm)]
    draw.line(pts, fill=color, width=stroke, joint='curve')
    # Inner facet
    inner = int(arm * 0.55)
    facet = [(cx, cy - arm), (cx + inner, cy), (cx, cy + arm)]
    # Apply opacity manually by using a more transparent color
    facet_color = (color[0], color[1], color[2], 128)
    # PIL.ImageDraw doesn't natively do opacity on line. Workaround: dim color.
    dim = tuple(int(c * 0.6) for c in color[:3]) + (255,)
    draw.line(facet, fill=dim, width=stroke, joint='curve')
    # Center dot
    dot = max(3, int(size * 0.06))
    draw.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=color)


def make_og(slug, title, subtitle, eyebrow):
    W, H = 1200, 630
    img = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(img)

    # Subtle gradient background : draw progressively lighter towards top-right
    for y in range(H):
        ratio = y / H
        color = tuple(int(BG[i] + (BG_2[i] - BG[i]) * ratio) for i in range(3)) + (255,)
        d.line([(0, y), (W, y)], fill=color)

    # Decorative accent line on the right (subtle diagonal)
    for i in range(-10, 11, 2):
        d.line([(W - 280 + i*15, 0), (W + i*15, H)], fill=(52, 211, 153, max(10, 50 - abs(i)*3)), width=1)

    # Top-left : Logo + wordmark
    draw_cristal_logo(d, 80, 80, 64, color=ACCENT, stroke=6)
    try:
        font_brand = ImageFont.truetype(FONT_BOLD, 28)
    except:
        font_brand = ImageFont.load_default()
    d.text((130, 65), 'CalcInvest', font=font_brand, fill=TEXT)

    # Eyebrow
    try:
        font_eyebrow = ImageFont.truetype(FONT_BOLD, 18)
    except:
        font_eyebrow = font_brand
    d.text((80, 210), eyebrow.upper(), font=font_eyebrow, fill=ACCENT)

    # Title (large, bold)
    try:
        font_title = ImageFont.truetype(FONT_BOLD, 64)
    except:
        font_title = font_brand
    title_lines = wrap_text(title, font_title, W - 160)
    y = 250
    for line in title_lines:
        d.text((80, y), line, font=font_title, fill=TEXT)
        y += 76

    # Subtitle (smaller, lighter)
    try:
        font_sub = ImageFont.truetype(FONT_REGULAR, 30)
    except:
        font_sub = font_brand
    sub_lines = wrap_text(subtitle, font_sub, W - 160)
    y += 16
    for line in sub_lines[:3]:
        d.text((80, y), line, font=font_sub, fill=TEXT_2)
        y += 40

    # Bottom-right: URL
    try:
        font_url = ImageFont.truetype(FONT_BOLD, 22)
    except:
        font_url = font_brand
    url = 'calcinvest.fr' + ('' if slug in ('default','home') else '/' + slug)
    url_w = text_size(font_url, url)[0]
    d.text((W - 80 - url_w, H - 60), url, font=font_url, fill=ACCENT)

    # Save
    img = img.convert('RGB')
    path = OUT / f'{slug}.png'
    img.save(path, format='PNG', optimize=True)
    return path


count = 0
for slug, title, subtitle, eyebrow in PAGES:
    p = make_og(slug, title, subtitle, eyebrow)
    count += 1
    print(f'  ✓ {p.name}  ({os.path.getsize(p)//1024}KB)')

print(f'\n{count} OG images générées dans assets/og/')
