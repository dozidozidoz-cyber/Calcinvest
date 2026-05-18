#!/usr/bin/env python3
"""Inject les 12 nouvelles tool-cards dans index.html par catégorie."""
import re

with open('index.html', 'r', encoding='utf-8') as f:
    c = f.read()

def card(url, color, icon_svg, title, desc, tag='Live'):
    return f'''
      <a href="{url}" class="tool-card" style="--card-color:{color}">
        <div class="tool-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            {icon_svg}
          </svg>
        </div>
        <div class="tool-card-body">
          <div class="tool-card-title">{title}</div>
          <div class="tool-card-desc">{desc}</div>
          <span class="tool-card-tag"><span class="dot"></span>{tag}</span>
        </div>
        <svg class="tool-card-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
      </a>
'''

# === IMMOBILIER (3 nouveaux) ===
immo_new = card('/calculateur-plus-value-immobiliere', '#10B981',
    '<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-7h6v7"/>',
    'Plus-Value Immobilière 2025',
    'Cession bien immo : 19 % IR + 17.2 % PS + surtaxe, abattements durée détention complets (exo IR à 22 ans, PS à 30 ans).',
    'Live · 25k recherches/mois')
immo_new += card('/simulateur-lmnp', '#0E9F6E',
    '<path d="M3 21h18"/><path d="M5 21V11l7-5 7 5v10"/><rect x="9" y="14" width="6" height="7"/>',
    'Simulateur LMNP',
    'Location meublée non pro : micro-BIC (50/71 %) vs réel-BIC avec amortissements. Effacez 10-20 ans d\'impôt.',
    'Live · 2 régimes comparés')
immo_new += card('/portefeuille-locatif', '#10B981',
    '<rect x="2" y="8" width="6" height="13"/><rect x="9" y="3" width="6" height="18"/><rect x="16" y="11" width="6" height="10"/>',
    'Portefeuille Locatif Multi-biens',
    'Tableau de bord agrégé : cashflow global, rendement moyen pondéré, endettement, performance par bien.',
    'Live · multi-biens')

# === TRADING (1 nouveau) ===
trading_new = card('/journal-trading', '#7C3AED',
    '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M7 16h3M14 16h3"/>',
    'Journal de Trading',
    'Suivi de vos trades persistant : winrate, expectancy, profit factor, equity curve, drawdown. Cloud + RLS Supabase.',
    'Live · stats avancées')

# === FISCALITÉ (5 nouveaux) ===
fisca_new = card('/calculateur-salaire-brut-net', '#3B82F6',
    '<circle cx="12" cy="9" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    'Salaire Brut / Net 2025',
    'Conversion bidirectionnelle, statut cadre/non-cadre, détail cotisations URSSAF + AGIRC-ARRCO + CSG.',
    'Live · 80k recherches/mois')
fisca_new += card('/calculateur-tva-auto-entrepreneur', '#F59E0B',
    '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    'TVA + Auto-Entrepreneur',
    'Conversion HT/TTC (4 taux) + cotisations URSSAF micro-entreprise + IR (VL ou barème) + seuils 2025.',
    'Live · 60k recherches/mois')
fisca_new += card('/convertisseur-devises', '#0EA5E9',
    '<path d="M3 12h18M7 7l-4 5 4 5M17 17l4-5-4-5"/>',
    'Convertisseur Devises Live',
    '30+ devises temps réel via API BCE (Frankfurter). Taux officiels actualisés chaque jour ouvré.',
    'Live · 50k recherches/mois')
fisca_new += card('/calculateur-donation-succession', '#D97706',
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'Donation & Succession',
    'Abattements 2025 (100k enfant, 31.8k petit-enfant…), barème progressif, démembrement (usufruit/NP).',
    'Live · 30k recherches/mois')
fisca_new += card('/mon-foyer-fiscal', '#DC2626',
    '<rect x="3" y="2" width="18" height="20" rx="1"/><path d="M7 8h10M7 12h10M7 16h7"/>',
    'Mon Foyer Fiscal 360°',
    'Agrège revenus salariés, fonciers, trading, AV en un dashboard. IR total + TMI + recommandations chiffrées.',
    'Live · vue d\'ensemble')

# === ÉPARGNE (2 nouveaux) ===
epargne_new = card('/simulateur-assurance-vie', '#7C3AED',
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    'Simulateur Assurance-Vie',
    'Multi-supports fonds €/UC, fiscalité 8 ans (abat. 4 600/9 200 €), succession 152 500 €/bénéficiaire.',
    'Live · 40k recherches/mois')
epargne_new += card('/simulateur-decumulation', '#0891B2',
    '<path d="M2 12c2 0 4-2 6-2s4 2 6 2"/><path d="M2 18c2 0 4-2 6-2s4 2 6 2"/>',
    'Simulateur Décumulation',
    'Phase de retrait : combien d\'années votre capital tient-il ? SWR via Monte Carlo Trinity. Stratégie 3 buckets.',
    'Live · FIRE phase 2')

# === OUTILS TRANSVERSES (1 nouveau, dans nouvelle section) ===
outils_section = '''
    <!-- Catégorie 5 : Outils transverses -->
    <div class="category-divider" id="cat-outils">
      <div class="category-divider-icon" style="background:rgba(52,211,153,0.08);color:#34D399">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
          <path d="M3 5l3-1 3 1 3-1 3 1v9l-3-1-3 1-3-1-3 1z"/>
        </svg>
      </div>
      <div class="category-divider-text">
        <div class="category-divider-title">Outils & Express</div>
        <div class="category-divider-desc">Calculs rapides, comparateur, glossaire</div>
      </div>
      <div class="category-divider-line"></div>
      <div class="category-divider-count">3 outils</div>
    </div>

    <div class="tools-grid">
''' + card('/calculatrices-express', '#34D399',
    '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 3v18"/>',
    'Calculatrices Express',
    '4 mini-outils ultra-rapides en 1 clic : TMI, SMIC net 2025, mensualité prêt, conversion devise live.',
    'Live · SEO long-tail') + card('/comparer', '#34D399',
    '<rect x="2" y="3" width="9" height="18"/><rect x="13" y="3" width="9" height="18"/><path d="M2 9h9M13 9h9"/>',
    'Comparer Simulations',
    'Comparez côte-à-côte jusqu\'à 3 projets sauvegardés. Tableau synthétique aggrégé de tous les paramètres.',
    'Live · multi-projets') + card('/glossaire', '#94A3B8',
    '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 8h18M7 12h10M7 16h7"/>',
    'Glossaire Financier',
    'Toutes les définitions des termes utilisés dans les simulateurs. Recherche live + navigation alphabétique A-Z.',
    'Live · 100+ termes') + '''    </div>

'''

# === Insertions ===
# Immobilier : avant la fermeture </div> de la grille (qui contient simulateur-pret)
c = c.replace(
    '''        <svg class="tool-card-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
      </a>
    </div>

    <!-- Catégorie 3 : Trading -->''',
    '''        <svg class="tool-card-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
      </a>
''' + immo_new + '''    </div>

    <!-- Catégorie 3 : Trading -->''',
    1
)

# Trading : insertion avant </div> + Catégorie 3bis Fiscalité
c = c.replace(
    '''    </div>

    <!-- Catégorie 3bis : Fiscalité grand public -->''',
    trading_new + '''    </div>

    <!-- Catégorie 3bis : Fiscalité grand public -->''',
    1
)

# Fiscalité : insertion avant </div> + Catégorie 4 Épargne
c = c.replace(
    '''    </div>

    <!-- Catégorie 4 : Épargne -->''',
    fisca_new + '''    </div>

    <!-- Catégorie 4 : Épargne -->''',
    1
)

# Épargne : trouver la fin de la grille épargne (avant la prochaine section ou fin)
# La section épargne est suivie par la suite du HTML (newsletter, footer, etc.)
# On insère epargne_new + outils_section juste avant la prochaine balise hors tools-grid
# Pattern : trouver la fin de épargne tools-grid en cherchant le </div> qui suit
# le dernier outil épargne (Retraite)
c = c.replace(
    '''        <div class="tool-card-title">Simulateur Retraite</div>''',
    '''        <div class="tool-card-title">Simulateur Retraite</div>''',
    1
)

# On va injecter en cherchant le </div> + </section> qui clôture la catégorie épargne
# Plus simple : trouver "Simulateur Retraite" et insérer après son </a>
pattern = re.compile(
    r'(<a href="/simulateur-retraite"[^>]*>.*?</a>)\s*\n\s*</div>',
    re.DOTALL
)
m = pattern.search(c)
if m:
    replacement = m.group(1) + epargne_new + '    </div>' + outils_section
    c = c.replace(m.group(0), replacement, 1)
    print('  Épargne section trouvée + injection OK')
else:
    print('  WARN: pattern épargne non trouvé, fallback')

# === Counts ===
c = c.replace('<div class="category-divider-count">3 outils</div>',
              '<div class="category-divider-count">6 outils</div>', 1)  # Immobilier
# Trading : 7 → 8
c = re.sub(r'(category-divider-count">)\s*(?:7|8)\s+outils\s*(</div>)',
           lambda m: m.group(1) + '8 outils' + m.group(2), c, count=1)
# Fiscalité : 1 → 6
c = c.replace('<div class="category-divider-count">1 outil</div>',
              '<div class="category-divider-count">6 outils</div>', 1)
# Épargne : 4 → 6
c = c.replace('<div class="category-divider-count">4 outils</div>',
              '<div class="category-divider-count">6 outils</div>', 1)

# Compteur global hero "18 outils" → 30
c = c.replace('18 outils', '30 outils')
c = c.replace('data-countup="18"', 'data-countup="30"')
c = c.replace('<strong>18 outils</strong>', '<strong>30 outils</strong>')
c = c.replace('1871 → 2026 · 18 outils', '1871 → 2026 · 30 outils')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print('Injection terminée.')
print('Cards comptées:', c.count('tool-card-title'))
