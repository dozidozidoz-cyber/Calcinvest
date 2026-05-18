#!/usr/bin/env python3
"""Inject intro-banner dans les 5 pages techniques."""
import re

INTROS = {
    'calculateur-volatilite.html': {
        'key': 'atr-kelly',
        'title': '💡 Première fois sur ATR & Kelly ?',
        'body': "L'<strong>ATR</strong> (Average True Range) mesure la <strong>volatilité réelle</strong> d'un actif sur les N dernières périodes — pratique pour placer un stop loss adapté (et pas un stop arbitraire à 30 pips qui se fait virer par le bruit). Le <strong>Kelly Criterion</strong> calcule la <strong>taille de position optimale</strong> qui maximise la croissance long terme de votre compte, en fonction de votre winrate et de votre R/R. Outils utiles à partir de 50 trades/mois — en deçà, restez sur la règle du 1 % par trade.",
    },
    'simulateur-monte-carlo-trading.html': {
        'key': 'mc-trading',
        'title': '💡 Qu\'est-ce qu\'une simulation Monte Carlo ?',
        'body': "Plutôt que de te dire « si tu gagnes 1 trade sur 2 à R/R 2:1, tu fais X € », on <strong>simule 2 000 fois</strong> ta stratégie en mélangeant aléatoirement l'ordre des trades. Résultat : tu vois <strong>tous les scénarios possibles</strong>, pas juste la moyenne. Tu découvres ton <strong>vrai max drawdown</strong>, ton percentile 5 % (le pire scénario réaliste), ta probabilité d'atteindre ton objectif. Indispensable avant de mettre du vrai argent sur une stratégie.",
    },
    'calculateur-risk-management.html': {
        'key': 'risk-mgmt',
        'title': '💡 Pourquoi le risk management décide de la survie ?',
        'body': "Un trader qui risque 5 % par trade et perd 10 fois d'affilée a perdu <strong>40 % de son compte</strong>. Avec un risque de 1 %, il aurait perdu 9 %. La <strong>probabilité de ruine</strong> dépend de 3 paramètres : ton winrate, ton R/R, et ta taille de position. Cet outil calcule <strong>combien de trades perdants tu peux enchaîner avant de couler</strong>. C'est la base que 95 % des traders ignorent — et c'est pour ça que 95 % perdent.",
    },
    'calculateur-marge-liquidation.html': {
        'key': 'marge-liq',
        'title': '💡 Qu\'est-ce qu\'un margin call et un prix de liquidation ?',
        'body': "Quand tu trades avec <strong>effet de levier</strong>, ton broker te prête de l'argent — en échange, il te bloque une <strong>marge</strong>. Si ta position perd suffisamment pour que ton équité tombe sous un seuil (typiquement 50 % puis 20 % de la marge), le broker te <strong>liquide automatiquement</strong> pour éviter qu'il perde son prêt. Cet outil te dit <strong>à quel prix tu te fais liquider</strong> selon ta taille de position et ton levier — pour ne jamais avoir de surprise.",
    },
    'simulateur-dcf.html': {
        'key': 'dcf',
        'title': '💡 Qu\'est-ce que la valorisation par DCF ?',
        'body': "Le <strong>DCF (Discounted Cash Flow)</strong> est la méthode utilisée par les analystes pros pour déterminer la <strong>valeur intrinsèque d'une action</strong>. Principe : projeter les flux de trésorerie futurs de l'entreprise sur 5-10 ans, les <strong>actualiser</strong> (les ramener à valeur présente avec un taux d'actualisation = WACC), et ajouter une <strong>valeur terminale</strong> pour la période au-delà. Si ta valorisation > cours actuel = action sous-évaluée. Outil avancé pour stock-pickers value/growth.",
    },
}

for filepath, conf in INTROS.items():
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            c = f.read()
    except FileNotFoundError:
        print('SKIP %s (not found)' % filepath)
        continue

    if 'data-intro-banner' in c:
        print('ALREADY %s' % filepath)
        continue

    # Build banner HTML
    banner_html = (
        '<div data-intro-banner data-intro-key="' + conf['key'] + '" '
        'data-intro-title="' + conf['title'].replace('"', '&quot;') + '" '
        'data-intro-body="' + conf['body'].replace('"', '&quot;') + '" '
        'style="margin-top:24px"></div>'
    )

    # Insert juste après le page-header (avant la première <section class="accordion" ou <section class="card")
    # On cible </div>\n*</div>\n*</div>\n\n* (fin de page-header) avant la section params
    # Approach simpler: chercher la fin du <div class="page-header"> avec son contenu fermé
    # par un </div> juste avant <section class="accordion" or <section class="card" id="result-hero"
    pattern = re.compile(
        r'(<p class="page-lede">.*?</p>\s*</div>)',
        re.DOTALL
    )
    m = pattern.search(c)
    if m:
        c = c.replace(m.group(0), m.group(0) + '\n\n    ' + banner_html, 1)
        print('OK injected: %s' % filepath)
    else:
        print('PATTERN NOT FOUND: %s' % filepath)
        continue

    # Inject le script intro-banner.js avant </body> si pas déjà
    if 'intro-banner.js' not in c:
        c = c.replace('</body>',
            '<script src="/assets/js/intro-banner.js"></script>\n</body>', 1)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(c)

print('Done')
