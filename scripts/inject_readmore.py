"""
Injecte un bloc "Pour aller plus loin" (liens vers articles blog) sur les
outils ayant des articles correspondants. Maillage interne outils → blog.

Usage : python scripts/inject_readmore.py   (idempotent)
"""
import sys, io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent

ARTICLES = {
    'dca-vs-lump-sum':            ('DCA vs lump sum : que dit l\'historique 1871-2026 ?', '8 min'),
    'dca-crypto-2026':            ('DCA crypto : faut-il continuer ? Backtest BTC 2013-2026', '9 min'),
    'pelosi-vs-sp500-2026':       ('Pelosi vs S&P 500 : a-t-elle vraiment battu le marché ?', '11 min'),
    'rendement-locatif-net-2026': ('Rendement locatif net : la formule complète + 5 pièges', '10 min'),
    'plus-value-immobiliere-2026':('Plus-value immobilière : barème complet + 4 cas concrets', '9 min'),
    'per-vs-assurance-vie-2026':  ('PER ou Assurance-Vie : lequel choisir ?', '10 min'),
    'per-cto-assurance-vie':      ('PER vs CTO vs Assurance-Vie : le match à 3', '11 min'),
    'scpi-vs-locatif':            ('SCPI ou locatif direct : le match fiscal complet', '12 min'),
    'monte-carlo-fire':           ('Monte Carlo + FIRE : votre capital survivra-t-il 40 ans ?', '10 min'),
    'reforme-retraite-2023':      ('Réforme des retraites : ce qui change pour votre pension', '9 min'),
    'all-weather-dalio-2026':     ('All-Weather de Dalio : le portefeuille tous temps backtesté', '10 min'),
    'faber-gtaa-pratique':        ('Faber GTAA : la stratégie de timing qui marche vraiment', '8 min'),
    'marche-cher-2026':           ('Le marché est-il cher ? Score composite CAPE', '10 min'),
    'comparateur-brokers':        ('Comparateur brokers : lequel choisir pour le PEA / CTO', '9 min'),
}

# outil → slugs d'articles pertinents (2-3 max)
MAPPING = {
    'simulateur-dca.html':                ['dca-vs-lump-sum', 'marche-cher-2026', 'dca-crypto-2026'],
    'simulateur-dca-crypto.html':         ['dca-crypto-2026', 'dca-vs-lump-sum'],
    'smart-money.html':                   ['pelosi-vs-sp500-2026', 'marche-cher-2026'],
    'simulateur-rendement-locatif.html':  ['rendement-locatif-net-2026', 'scpi-vs-locatif', 'plus-value-immobiliere-2026'],
    'simulateur-scpi.html':               ['scpi-vs-locatif', 'rendement-locatif-net-2026'],
    'simulateur-pret.html':               ['rendement-locatif-net-2026', 'plus-value-immobiliere-2026'],
    'simulateur-lmnp.html':               ['rendement-locatif-net-2026', 'plus-value-immobiliere-2026'],
    'calculateur-plus-value-immobiliere.html': ['plus-value-immobiliere-2026', 'rendement-locatif-net-2026'],
    'portefeuille-locatif.html':          ['rendement-locatif-net-2026', 'scpi-vs-locatif'],
    'simulateur-per.html':                ['per-vs-assurance-vie-2026', 'per-cto-assurance-vie', 'reforme-retraite-2023'],
    'simulateur-assurance-vie.html':      ['per-vs-assurance-vie-2026', 'per-cto-assurance-vie'],
    'simulateur-retraite.html':           ['reforme-retraite-2023', 'per-vs-assurance-vie-2026'],
    'calculateur-fire.html':              ['monte-carlo-fire', 'dca-vs-lump-sum'],
    'simulateur-decumulation.html':       ['monte-carlo-fire', 'reforme-retraite-2023'],
    'simulateur-interets-composes.html':  ['dca-vs-lump-sum', 'monte-carlo-fire'],
    'allocation-portefeuille.html':       ['all-weather-dalio-2026', 'faber-gtaa-pratique'],
    'backtest-timing.html':               ['faber-gtaa-pratique', 'all-weather-dalio-2026'],
    'valorisation-marche.html':           ['marche-cher-2026', 'pelosi-vs-sp500-2026'],
    'regime-marche.html':                 ['marche-cher-2026', 'faber-gtaa-pratique'],
    'simulateur-dcf.html':                ['marche-cher-2026', 'pelosi-vs-sp500-2026'],
    'simulateur-monte-carlo-trading.html':['monte-carlo-fire', 'faber-gtaa-pratique'],
    'calculateur-couts-trading.html':     ['comparateur-brokers'],
    'journal-trading.html':               ['comparateur-brokers', 'faber-gtaa-pratique'],
    'calculateur-fiscalite-trading.html': ['per-cto-assurance-vie', 'comparateur-brokers'],
}

ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 6h6M5 9h6M5 12h3"/></svg>'


def build_block(article_slugs):
    items = ''
    for slug in article_slugs:
        if slug not in ARTICLES:
            continue
        title, mins = ARTICLES[slug]
        items += f'''    <a href="/blog/{slug}" class="ci-readmore-item">
      <span class="ci-readmore-icon">{ICON}</span>
      <span class="ci-readmore-text"><strong>{title}</strong><span class="ci-readmore-meta">Article · {mins} de lecture</span></span>
      <span class="ci-readmore-arrow">→</span>
    </a>
'''
    return f'''
<!-- ═══ Pour aller plus loin (maillage outils → blog) ═══ -->
<aside class="ci-readmore" aria-label="Articles liés">
  <div class="ci-readmore-inner">
    <h3 class="ci-readmore-title">📖 Pour aller plus loin</h3>
{items}  </div>
</aside>
'''


CSS = '''
/* ============================================================
   POUR ALLER PLUS LOIN (maillage outils → blog)
   ============================================================ */
.ci-readmore { padding: 28px 20px; background: var(--bg); border-top: 1px solid var(--border); }
.ci-readmore-inner { max-width: 1100px; margin: 0 auto; display: grid; gap: 8px; }
.ci-readmore-title { margin: 0 0 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-2); }
.ci-readmore-item { display: flex; align-items: center; gap: 14px; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r); text-decoration: none; transition: var(--t-fast); }
.ci-readmore-item:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.ci-readmore-icon { color: var(--accent); flex-shrink: 0; display: grid; place-items: center; }
.ci-readmore-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.ci-readmore-text strong { font-size: 14px; color: var(--text); font-weight: 600; }
.ci-readmore-meta { font-size: 11.5px; color: var(--text-2); }
.ci-readmore-arrow { color: var(--accent); font-weight: 600; flex-shrink: 0; }
'''


def main():
    # CSS
    css_path = ROOT / 'assets' / 'css' / 'style.css'
    css_txt = css_path.read_text(encoding='utf-8')
    if '.ci-readmore' not in css_txt:
        # insère AVANT le bloc responsive final pour que les media queries gardent la priorité
        marker = '/* ============================================================\n   RESPONSIVE MOBILE — fixes placés EN FIN DE FICHIER'
        if marker in css_txt:
            css_txt = css_txt.replace(marker, CSS + '\n' + marker)
        else:
            css_txt += '\n' + CSS
        css_path.write_text(css_txt, encoding='utf-8')
        print('  + CSS ajouté')

    count = 0
    for fname, slugs in MAPPING.items():
        p = ROOT / fname
        if not p.exists():
            print(f'  ✗ {fname} introuvable'); continue
        txt = p.read_text(encoding='utf-8')
        if 'ci-readmore' in txt:
            continue  # déjà patché
        block = build_block(slugs)
        anchor = '<aside class="ci-related"'
        if anchor in txt:
            new_txt = txt.replace(anchor, block + '\n' + anchor, 1)
        elif '<footer class="footer">' in txt:
            new_txt = txt.replace('<footer class="footer">', block + '\n<footer class="footer">', 1)
        else:
            print(f'  ? {fname} : pas d\'ancre'); continue
        p.write_text(new_txt, encoding='utf-8')
        count += 1
        print(f'  ✓ {fname}')
    print(f'\n{count} outils maillés vers le blog')


if __name__ == '__main__':
    main()
