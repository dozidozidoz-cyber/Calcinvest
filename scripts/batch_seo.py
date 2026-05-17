#!/usr/bin/env python3
"""Batch B SEO: ajoute OG/Twitter + JSON-LD sur toutes les pages."""
import os, re, json

PAGES = {
    'simulateur-dca.html':              {'type':'sim', 'name':'DCA Bourse'},
    'simulateur-dca-crypto.html':       {'type':'sim', 'name':'DCA Crypto'},
    'simulateur-dcf.html':              {'type':'sim', 'name':'Valorisation DCF'},
    'simulateur-rendement-locatif.html':{'type':'sim', 'name':'Rendement Locatif'},
    'simulateur-scpi.html':             {'type':'sim', 'name':'SCPI'},
    'simulateur-pret.html':             {'type':'sim', 'name':'Prêt Immobilier'},
    'simulateur-interets-composes.html':{'type':'sim', 'name':'Intérêts Composés'},
    'simulateur-per.html':              {'type':'sim', 'name':'PER'},
    'simulateur-retraite.html':         {'type':'sim', 'name':'Retraite'},
    'simulateur-monte-carlo-trading.html':{'type':'sim','name':'Monte Carlo Trading'},
    'calculateur-fire.html':            {'type':'sim', 'name':'FIRE'},
    'calculateur-pips.html':            {'type':'sim', 'name':'PIPS'},
    'calculateur-marge-liquidation.html':{'type':'sim','name':'Marge & Liquidation'},
    'calculateur-couts-trading.html':   {'type':'sim', 'name':'Coûts Trading'},
    'calculateur-risk-management.html': {'type':'sim', 'name':'Risk Management'},
    'calculateur-fiscalite-trading.html':{'type':'sim','name':'Fiscalité Trading'},
    'comparateur-brokers.html':         {'type':'sim', 'name':'Comparateur Brokers'},
    'calculateur-volatilite.html':      {'type':'sim', 'name':'ATR & Kelly'},
    'calculateur-impot-revenu.html':    {'type':'sim', 'name':'Impôt Revenu'},
    'index.html':                       {'type':'web', 'name':'CalcInvest'},
    'comparer.html':                    {'type':'web', 'name':'Comparer'},
    'glossaire.html':                   {'type':'web', 'name':'Glossaire'},
    'methodologie.html':                {'type':'web', 'name':'Méthodologie'},
    'blog.html':                        {'type':'web', 'name':'Blog'},
    'mes-projets.html':                 {'type':'web', 'name':'Mes projets'},
    'abonnement.html':                  {'type':'web', 'name':'Tarifs Premium'},
    'mentions-legales.html':            {'type':'web', 'name':'Mentions légales'},
    'connexion.html':                   {'type':'web', 'name':'Connexion'},
    'inscription.html':                 {'type':'web', 'name':'Inscription'},
    'blog/dca-vs-lump-sum.html':        {'type':'article', 'name':'DCA vs Lump Sum'},
    'blog/scpi-vs-locatif.html':        {'type':'article', 'name':'SCPI vs Locatif'},
    'blog/reforme-retraite-2023.html':  {'type':'article', 'name':'Réforme retraite 2023'},
    'blog/per-cto-assurance-vie.html':  {'type':'article', 'name':'PER vs CTO vs AV'},
    'blog/monte-carlo-fire.html':       {'type':'article', 'name':'Monte Carlo + FIRE'},
}

OG_DEFAULT_IMG = 'https://calcinvest.fr/assets/icons/icon-512.svg'
stats = {'og': 0, 'tw': 0, 'jsonld': 0}

for filepath, info in PAGES.items():
    if not os.path.exists(filepath):
        print('  SKIP %s' % filepath); continue
    with open(filepath, 'r', encoding='utf-8') as fp:
        content = fp.read()

    name = info['name']
    title_m = re.search(r'<title>(.+?)</title>', content)
    title = title_m.group(1) if title_m else name + ' | CalcInvest'
    desc_m = re.search(r'<meta\s+name="description"\s+content="([^"]+)"', content)
    desc = desc_m.group(1) if desc_m else (name + ' — CalcInvest')
    canon_m = re.search(r'<link\s+rel="canonical"\s+href="([^"]+)"', content)
    canonical = canon_m.group(1) if canon_m else ('https://calcinvest.fr/' + filepath.replace('.html',''))

    og_type = 'article' if info['type'] == 'article' else 'website'
    og_block = (
        '<meta property="og:type" content="' + og_type + '" />\n'
        '<meta property="og:title" content="' + title + '" />\n'
        '<meta property="og:description" content="' + desc + '" />\n'
        '<meta property="og:url" content="' + canonical + '" />\n'
        '<meta property="og:image" content="' + OG_DEFAULT_IMG + '" />\n'
        '<meta property="og:site_name" content="CalcInvest" />\n'
        '<meta property="og:locale" content="fr_FR" />\n'
        '<meta name="twitter:card" content="summary_large_image" />\n'
        '<meta name="twitter:title" content="' + title + '" />\n'
        '<meta name="twitter:description" content="' + desc + '" />\n'
        '<meta name="twitter:image" content="' + OG_DEFAULT_IMG + '" />'
    )

    has_og_url = 'property="og:url"' in content
    has_tw = 'name="twitter:card"' in content

    if not has_og_url or not has_tw:
        # Supprimer anciens og:title/desc/type isolés
        content = re.sub(
            r'<meta\s+property="og:(title|description|type)"\s+content="[^"]*"\s*/?>\s*\n?',
            '', content)
        if canon_m:
            content = content.replace(canon_m.group(0), canon_m.group(0) + '\n' + og_block, 1)
        else:
            content = content.replace('</head>', og_block + '\n</head>', 1)
        if not has_og_url: stats['og'] += 1
        if not has_tw: stats['tw'] += 1

    # JSON-LD
    if 'application/ld+json' not in content:
        clean_name = title.split('—')[0].split('|')[0].strip()
        if info['type'] == 'sim':
            data = {
                "@context": "https://schema.org",
                "@type": "WebApplication",
                "name": clean_name,
                "description": desc,
                "url": canonical,
                "applicationCategory": "FinanceApplication",
                "operatingSystem": "Web",
                "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
                "publisher": {"@type": "Organization", "name": "CalcInvest", "url": "https://calcinvest.fr"}
            }
        elif info['type'] == 'article':
            data = {
                "@context": "https://schema.org",
                "@type": "Article",
                "headline": name,
                "description": desc,
                "url": canonical,
                "datePublished": "2026-04-15",
                "dateModified": "2026-05-16",
                "author": {"@type": "Organization", "name": "CalcInvest"},
                "publisher": {"@type": "Organization", "name": "CalcInvest",
                              "logo": {"@type": "ImageObject", "url": OG_DEFAULT_IMG}},
                "mainEntityOfPage": {"@type": "WebPage", "@id": canonical}
            }
        else:
            atype = "WebSite" if filepath == 'index.html' else "WebPage"
            data = {
                "@context": "https://schema.org",
                "@type": atype,
                "name": clean_name,
                "description": desc,
                "url": canonical,
                "publisher": {"@type": "Organization", "name": "CalcInvest", "url": "https://calcinvest.fr"}
            }
            if filepath == 'index.html':
                data["potentialAction"] = {
                    "@type": "SearchAction",
                    "target": "https://calcinvest.fr/#outils?q={search_term_string}",
                    "query-input": "required name=search_term_string"
                }

        # Breadcrumb pour articles blog
        if info['type'] == 'article':
            breadcrumb = {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://calcinvest.fr/"},
                    {"@type": "ListItem", "position": 2, "name": "Blog", "item": "https://calcinvest.fr/blog"},
                    {"@type": "ListItem", "position": 3, "name": name, "item": canonical}
                ]
            }
            jsonld_block = (
                '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>\n'
                '<script type="application/ld+json">' + json.dumps(breadcrumb, ensure_ascii=False) + '</script>'
            )
        else:
            jsonld_block = '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'

        content = content.replace('</head>', jsonld_block + '\n</head>', 1)
        stats['jsonld'] += 1

    with open(filepath, 'w', encoding='utf-8') as fp:
        fp.write(content)

print('OG: +%d | Twitter: +%d | JSON-LD: +%d' % (stats['og'], stats['tw'], stats['jsonld']))
