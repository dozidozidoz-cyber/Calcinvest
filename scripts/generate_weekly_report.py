"""
CalcInvest — Rapport de marché hebdomadaire auto-généré
========================================================
Génère marche-cette-semaine.html chaque lundi (GitHub Action) :
  - Perf hebdo + YTD des grands actifs (yfinance, live)
  - Régime de tendance S&P 500 (prix vs MM10 mensuelle, méthode Faber)
  - Dernières transactions Pelosi (smart-money/pelosi.json)
  - Top 5 du portefeuille Berkshire (berkshire.json)

URL fixe /marche-cette-semaine (écrasée chaque semaine → conserve
le jus SEO, contenu frais hebdomadaire).

Usage : python scripts/generate_weekly_report.py
Deps  : pip install yfinance pandas
"""
import json
import locale
import sys, io
from datetime import datetime, timezone
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent

ASSETS = [
    ('^GSPC',   'S&P 500'),
    ('^IXIC',   'Nasdaq'),
    ('^FCHI',   'CAC 40'),
    ('GC=F',    'Or'),
    ('BTC-USD', 'Bitcoin'),
    ('ETH-USD', 'Ethereum'),
]

MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']


def fetch_perfs():
    import yfinance as yf
    rows = []
    for ticker, label in ASSETS:
        try:
            h = yf.Ticker(ticker).history(period='1y', interval='1d', auto_adjust=True)
            if h.empty or len(h) < 6:
                continue
            closes = h['Close']
            last = float(closes.iloc[-1])
            week_ago = float(closes.iloc[-6])  # ~5 jours ouvrés
            # YTD : premier close de l'année courante
            year = closes.index[-1].year
            ytd_series = closes[closes.index.year == year]
            ytd_start = float(ytd_series.iloc[0]) if len(ytd_series) else last
            rows.append({
                'label': label,
                'last': last,
                'week': 100 * (last - week_ago) / week_ago,
                'ytd': 100 * (last - ytd_start) / ytd_start,
            })
        except Exception as e:
            print(f'  ! {ticker}: {e}')
    return rows


def faber_regime():
    """Prix S&P 500 vs moyenne mobile 10 mois (monthly closes locaux)."""
    d = json.loads((ROOT / 'assets' / 'data' / 'sp500.json').read_text(encoding='utf-8'))
    prices = d['prices']
    if len(prices) < 13:
        return None
    last = prices[-1]
    ma10 = sum(prices[-10:]) / 10
    perf12 = 100 * (prices[-1] - prices[-13]) / prices[-13]
    return {
        'last': last, 'ma10': ma10,
        'above': last > ma10,
        'gap': 100 * (last - ma10) / ma10,
        'perf12': perf12,
        'asof': d['end'],
    }


def smart_money():
    out = {'pelosi': [], 'berkshire': []}
    try:
        p = json.loads((ROOT / 'assets' / 'data' / 'smart-money' / 'pelosi.json').read_text(encoding='utf-8'))
        out['pelosi'] = p.get('transactions', [])[:3]
    except Exception:
        pass
    try:
        b = json.loads((ROOT / 'assets' / 'data' / 'smart-money' / 'berkshire.json').read_text(encoding='utf-8'))
        f = b.get('filings', [{}])[0]
        out['berkshire'] = f.get('positions', [])[:5]
        out['berkshire_period'] = f.get('period', '')
    except Exception:
        pass
    return out


def fmt_pct(v):
    cls = 'pos' if v >= 0 else 'neg'
    return f'<span class="{cls}">{"+" if v >= 0 else ""}{v:.1f} %</span>'


def fmt_price(v):
    if v >= 1000:
        return f'{v:,.0f}'.replace(',', ' ')
    return f'{v:,.2f}'.replace(',', ' ')


def build_html(perfs, regime, sm, now):
    date_fr = f'{now.day} {MOIS_FR[now.month-1]} {now.year}'

    perf_rows = ''.join(
        f'<tr><td><strong>{r["label"]}</strong></td><td class="mono">{fmt_price(r["last"])}</td>'
        f'<td class="mono">{fmt_pct(r["week"])}</td><td class="mono">{fmt_pct(r["ytd"])}</td></tr>'
        for r in perfs
    )

    regime_html = ''
    if regime:
        state = 'TENDANCE HAUSSIÈRE' if regime['above'] else 'TENDANCE BAISSIÈRE'
        state_cls = 'pos' if regime['above'] else 'neg'
        regime_html = f'''
    <div class="ci-seo-data-grid" style="margin-bottom:24px">
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">Régime S&amp;P 500 (méthode Faber)</div>
        <div class="ci-seo-data-value {state_cls}" style="font-size:18px">{state}</div>
        <div class="ci-seo-data-sub">Prix {fmt_pct(regime["gap"])} vs moyenne mobile 10 mois · données {regime["asof"]}</div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">Performance 12 mois S&amp;P 500</div>
        <div class="ci-seo-data-value" style="font-size:18px">{fmt_pct(regime["perf12"])}</div>
        <div class="ci-seo-data-sub">closes mensuels, dividendes non inclus</div>
      </div>
    </div>'''

    pelosi_rows = ''.join(
        f'<tr><td>{t.get("date","—")}</td><td><strong>{t.get("ticker") or "—"}</strong></td>'
        f'<td>{(t.get("asset") or "")[:60]}</td><td>{t.get("type","")}</td><td class="mono">{t.get("amount","")}</td></tr>'
        for t in sm['pelosi']
    ) or '<tr><td colspan="5">Aucune transaction récente</td></tr>'

    berk_rows = ''.join(
        f'<tr><td><strong>{p.get("issuer","")}</strong></td><td class="mono">{p.get("pct",0):.1f} %</td></tr>'
        for p in sm['berkshire']
    ) or '<tr><td colspan="2">—</td></tr>'

    return f'''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#34D399" />
<title>Le marché cette semaine — point hebdo du {date_fr} | CalcInvest</title>
<meta name="description" content="Point de marché hebdomadaire du {date_fr} : performance S&P 500, Nasdaq, CAC 40, or, Bitcoin. Régime de tendance, derniers trades de Nancy Pelosi, portefeuille Buffett." />
<link rel="canonical" href="https://calcinvest.fr/marche-cette-semaine" />
<meta property="og:type" content="article" />
<meta property="og:title" content="Le marché cette semaine — {date_fr} | CalcInvest" />
<meta property="og:description" content="Perfs hebdo des grands actifs, régime de tendance S&P 500, derniers trades Pelosi. Mis à jour chaque lundi automatiquement." />
<meta property="og:url" content="https://calcinvest.fr/marche-cette-semaine" />
<meta property="og:image" content="https://calcinvest.fr/assets/og/valorisation-marche.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://calcinvest.fr/assets/og/valorisation-marche.png" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/svg+xml" href="/assets/icons/icon-192.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="preload" href="/assets/css/style.css" as="style" />
<link rel="stylesheet" href="/assets/css/style.css" />
<script type="application/ld+json">{{"@context": "https://schema.org", "@type": "Article", "headline": "Le marché cette semaine — point hebdo du {date_fr}", "description": "Performance hebdomadaire des grands actifs, régime de tendance S&P 500, derniers trades du Congrès US.", "url": "https://calcinvest.fr/marche-cette-semaine", "datePublished": "{now.strftime('%Y-%m-%d')}", "dateModified": "{now.strftime('%Y-%m-%d')}", "author": {{"@type": "Organization", "name": "CalcInvest"}}, "publisher": {{"@type": "Organization", "name": "CalcInvest", "logo": {{"@type": "ImageObject", "url": "https://calcinvest.fr/assets/icons/icon-512.png"}}}}}}</script>
</head>
<body>

<header class="topbar">
  <div class="topbar-left">
    <a href="/" class="logo">
      <div class="logo-icon">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2L22 12L12 22L2 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 2L17 12L12 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" opacity="0.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
      </div>
      <div class="logo-text"><div class="logo-text-main">CalcInvest</div></div>
    </a>
  </div>
  <div class="topbar-right" id="ci-user-zone"></div>
</header>

<main class="main fade-in" style="max-width:900px;margin:0 auto;padding:40px 20px 80px">

  <div class="page-header">
    <div class="page-eyebrow">
      <span class="page-eyebrow-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12l4-4 3 3 5-6"/></svg></span>
      Point hebdo · généré automatiquement chaque lundi
    </div>
    <h1 class="page-title">Le marché cette semaine — {date_fr}</h1>
    <p class="page-lede">Performances de la semaine écoulée, régime de tendance et activité Smart Money. Page mise à jour automatiquement chaque lundi matin depuis les données de marché.</p>
  </div>

  <section class="card" style="margin-bottom:24px">
    <div class="card-header"><div class="card-title">Performance des grands actifs</div><div class="card-meta">semaine écoulée + depuis le 1er janvier</div></div>
    <div class="card-body">
      <table class="data-table">
        <thead><tr><th>Actif</th><th>Dernier cours</th><th>1 semaine</th><th>YTD {now.year}</th></tr></thead>
        <tbody>{perf_rows}</tbody>
      </table>
    </div>
  </section>
{regime_html}
  <section class="card" style="margin-bottom:24px">
    <div class="card-header"><div class="card-title">Dernières transactions de Nancy Pelosi</div><div class="card-meta">source : disclosures-clerk.house.gov</div></div>
    <div class="card-body">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Ticker</th><th>Actif</th><th>Type</th><th>Montant</th></tr></thead>
        <tbody>{pelosi_rows}</tbody>
      </table>
      <p style="font-size:12px;color:var(--text-2);margin:10px 0 0">Suivi complet avec perf vs S&amp;P 500 sur le <a href="/smart-money">Smart Money Tracker</a>.</p>
    </div>
  </section>

  <section class="card" style="margin-bottom:24px">
    <div class="card-header"><div class="card-title">Top 5 du portefeuille Berkshire Hathaway</div><div class="card-meta">13F au {sm.get('berkshire_period','')}</div></div>
    <div class="card-body">
      <table class="data-table">
        <thead><tr><th>Position</th><th>% du portefeuille</th></tr></thead>
        <tbody>{berk_rows}</tbody>
      </table>
    </div>
  </section>

  <section class="ci-readmore" style="border-radius:var(--r)">
    <div class="ci-readmore-inner">
      <h3 class="ci-readmore-title">Creuser avec les outils</h3>
      <a href="/valorisation-marche" class="ci-readmore-item"><span class="ci-readmore-text"><strong>Le marché est-il cher ?</strong><span class="ci-readmore-meta">CAPE, drawdown, score composite</span></span><span class="ci-readmore-arrow">→</span></a>
      <a href="/regime-marche" class="ci-readmore-item"><span class="ci-readmore-text"><strong>Régime de marché détaillé</strong><span class="ci-readmore-meta">Bull / Bear / Range / Volatile</span></span><span class="ci-readmore-arrow">→</span></a>
      <a href="/simulateur-dca" class="ci-readmore-item"><span class="ci-readmore-text"><strong>Backtester un DCA maintenant</strong><span class="ci-readmore-meta">13 actifs depuis 1871</span></span><span class="ci-readmore-arrow">→</span></a>
    </div>
  </section>

  <p style="font-size:12px;color:var(--text-2);margin-top:24px">Données : Yahoo Finance, SEC EDGAR, House Clerk. Aucune recommandation d'investissement — informations à but pédagogique. Généré le {date_fr}.</p>

</main>

<footer class="footer">
  <div>Page régénérée automatiquement chaque lundi</div>
  <div><a href="/">Accueil</a> · <a href="/smart-money">Smart Money</a> · <a href="/blog">Blog</a></div>
</footer>

<script src="/assets/js/common.js"></script>
</body>
</html>
'''


def main():
    now = datetime.now(timezone.utc)
    print('Fetch des perfs hebdo…')
    perfs = fetch_perfs()
    print(f'  {len(perfs)} actifs OK')
    regime = faber_regime()
    sm = smart_money()
    html = build_html(perfs, regime, sm, now)
    out = ROOT / 'marche-cette-semaine.html'
    out.write_text(html, encoding='utf-8')
    print(f'✓ {out.name} généré ({len(html)//1024} ko)')


if __name__ == '__main__':
    main()
