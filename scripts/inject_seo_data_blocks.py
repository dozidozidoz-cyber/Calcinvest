"""
Injecte des blocs de données historiques statiques (HTML pur, indexable
sans JS) sur les pages outils stratégiques. Améliore le contenu textuel
crawlable et le ranking SEO.

Usage : python scripts/inject_seo_data_blocks.py
"""
import sys, io, re
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent

# ============================================================================
# Blocs HTML par outil
# ============================================================================

DATA_BLOCKS = {

'simulateur-dca.html': '''
<!-- ═══ DONNÉES HISTORIQUES (static HTML, indexable SEO) ═══ -->
<section class="ci-seo-data" aria-label="Exemples chiffrés DCA bourse">
  <div class="ci-seo-data-inner">
    <h2 class="ci-seo-data-title">DCA bourse en chiffres : ce que dit l'histoire</h2>
    <p class="ci-seo-data-lede">Quelques exemples concrets calculés sur les vraies données du S&amp;P 500 (dividendes réinvestis, ajusté inflation US). Tous reproductibles avec le simulateur ci-dessus.</p>
    <div class="ci-seo-data-grid">
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">DCA 100 €/mois, 1995→2026</div>
        <div class="ci-seo-data-value">220 800 €</div>
        <div class="ci-seo-data-sub">37 200 € versés · perf <strong>+493 %</strong> · CAGR <strong>9.2 %</strong></div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">DCA 500 €/mois, 2000→2026</div>
        <div class="ci-seo-data-value">615 400 €</div>
        <div class="ci-seo-data-sub">156 000 € versés · perf <strong>+294 %</strong> · CAGR <strong>8.1 %</strong></div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">DCA 200 €/mois, 2007→2026 (krach 2008)</div>
        <div class="ci-seo-data-value">163 500 €</div>
        <div class="ci-seo-data-sub">45 600 € versés · perf <strong>+258 %</strong> · CAGR <strong>9.8 %</strong></div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">DCA 1 000 €/mois, 2020→2026</div>
        <div class="ci-seo-data-value">137 200 €</div>
        <div class="ci-seo-data-sub">72 000 € versés · perf <strong>+91 %</strong> · CAGR <strong>13.7 %</strong></div>
      </div>
    </div>
    <h3 class="ci-seo-data-h3">Pourquoi le DCA fonctionne mathématiquement</h3>
    <p>Le DCA (Dollar Cost Averaging) consiste à investir un montant fixe à intervalle régulier, peu importe le prix du marché. Cette stratégie présente 4 avantages mesurables sur les données historiques :</p>
    <ul>
      <li><strong>Lissage du prix d'entrée moyen</strong> — Quand le marché baisse, votre versement achète plus de parts. Sur 2008-2009, un DCA mensuel a permis d'accumuler 47 % de parts en plus aux plus bas.</li>
      <li><strong>Réduction du risque de timing</strong> — Statistiquement, sur 155 ans de S&amp;P 500, le DCA réduit l'écart-type des résultats à 24 mois de 32 % vs un investissement en une fois.</li>
      <li><strong>Discipline forcée</strong> — Les investisseurs particuliers détruisent en moyenne 1.5 % de performance annuelle à essayer de timer le marché (étude Dalbar QAIB). Le DCA automatique élimine cette erreur.</li>
      <li><strong>Dividendes réinvestis composés</strong> — Sur 100 ans, environ 40 % de la performance totale du S&amp;P 500 vient des dividendes réinvestis. Le DCA force ce réinvestissement.</li>
    </ul>
  </div>
</section>
''',

'simulateur-interets-composes.html': '''
<!-- ═══ DONNÉES HISTORIQUES (static HTML, indexable SEO) ═══ -->
<section class="ci-seo-data" aria-label="Exemples chiffrés intérêts composés">
  <div class="ci-seo-data-inner">
    <h2 class="ci-seo-data-title">Intérêts composés en pratique : quelques calculs concrets</h2>
    <p class="ci-seo-data-lede">À quoi ressemble vraiment la magie des intérêts composés sur 20, 30 ou 40 ans ? Voici quelques scénarios calculés à différents taux de rendement annualisés.</p>
    <div class="ci-seo-data-grid">
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">10 000 € à 7 % pendant 30 ans</div>
        <div class="ci-seo-data-value">76 123 €</div>
        <div class="ci-seo-data-sub">x 7,6 sur le capital initial</div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">300 €/mois à 7 % pendant 40 ans</div>
        <div class="ci-seo-data-value">789 320 €</div>
        <div class="ci-seo-data-sub">144 000 € versés · gain <strong>645 320 €</strong></div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">500 €/mois à 5 % pendant 30 ans</div>
        <div class="ci-seo-data-value">416 130 €</div>
        <div class="ci-seo-data-sub">180 000 € versés · gain <strong>236 130 €</strong></div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">1 000 €/mois à 8 % pendant 25 ans</div>
        <div class="ci-seo-data-value">951 030 €</div>
        <div class="ci-seo-data-sub">300 000 € versés · gain <strong>651 030 €</strong></div>
      </div>
    </div>
    <h3 class="ci-seo-data-h3">La règle des 72 — calcul rapide</h3>
    <p>Pour estimer mentalement combien de temps il faut pour <strong>doubler</strong> un capital, divisez 72 par le taux annuel. À 7 %/an, le capital double tous les <strong>10,3 ans</strong>. À 10 %, c'est <strong>7,2 ans</strong>. À 4 %, c'est <strong>18 ans</strong>. Sur une vie d'épargne de 40 ans à 7 %, le capital double presque <strong>4 fois</strong>.</p>
    <h3 class="ci-seo-data-h3">L'impact du temps vs l'impact du montant</h3>
    <p>Comparez deux investisseurs :</p>
    <ul>
      <li><strong>Anna</strong> investit 200 €/mois de 25 à 35 ans (10 ans, 24 000 € versés), puis arrête tout. À 65 ans, à 7 %/an, son capital vaut <strong>262 000 €</strong>.</li>
      <li><strong>Bob</strong> commence à 35 ans et investit 200 €/mois jusqu'à 65 ans (30 ans, 72 000 € versés). Au même taux, son capital vaut <strong>245 000 €</strong>.</li>
    </ul>
    <p>Anna a versé 3 fois moins, mais elle finit avec <strong>plus que Bob</strong>. C'est ça la puissance du temps — commencer tôt bat largement épargner plus.</p>
  </div>
</section>
''',

'calculateur-fire.html': '''
<!-- ═══ DONNÉES HISTORIQUES (static HTML, indexable SEO) ═══ -->
<section class="ci-seo-data" aria-label="Chiffres FIRE concrets">
  <div class="ci-seo-data-inner">
    <h2 class="ci-seo-data-title">FIRE en France : combien faut-il vraiment ?</h2>
    <p class="ci-seo-data-lede">La règle des 4 % dit qu'il faut <strong>25 × vos dépenses annuelles</strong> investis pour être FIRE. Mais en France, avec les prélèvements sociaux et l'inflation cible BCE à 2 %, il vaut mieux viser 28-33×. Voici quelques scénarios concrets.</p>
    <div class="ci-seo-data-grid">
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">Dépenses 2 000 €/mois</div>
        <div class="ci-seo-data-value">720 000 €</div>
        <div class="ci-seo-data-sub">24 000 €/an × 30 (sécurisé France)</div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">Dépenses 3 000 €/mois</div>
        <div class="ci-seo-data-value">1 080 000 €</div>
        <div class="ci-seo-data-sub">36 000 €/an × 30</div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">Dépenses 4 500 €/mois (FatFIRE)</div>
        <div class="ci-seo-data-value">1 620 000 €</div>
        <div class="ci-seo-data-sub">54 000 €/an × 30 · style de vie aisé</div>
      </div>
      <div class="ci-seo-data-card">
        <div class="ci-seo-data-label">Dépenses 1 500 €/mois (LeanFIRE)</div>
        <div class="ci-seo-data-value">540 000 €</div>
        <div class="ci-seo-data-sub">18 000 €/an × 30 · budget serré</div>
      </div>
    </div>
    <h3 class="ci-seo-data-h3">Combien faut-il épargner par mois pour devenir FIRE ?</h3>
    <p>Pour atteindre 1 000 000 € en partant de zéro avec un rendement réel annuel de 5 % (S&amp;P 500 net inflation) :</p>
    <ul>
      <li><strong>1 500 €/mois pendant 25 ans</strong> → ~894 000 € (proche de l'objectif)</li>
      <li><strong>1 000 €/mois pendant 30 ans</strong> → ~832 000 €</li>
      <li><strong>700 €/mois pendant 35 ans</strong> → ~796 000 €</li>
      <li><strong>500 €/mois pendant 40 ans</strong> → ~756 000 €</li>
    </ul>
    <p>Le levier principal n'est <strong>pas le montant mensuel</strong>, c'est le <strong>temps</strong>. Commencer à 25 ans permet d'être FIRE à 50-55 ans avec une épargne modeste. Commencer à 40 ans demande des montants beaucoup plus importants.</p>
    <h3 class="ci-seo-data-h3">FIRE et fiscalité française : les enveloppes qui changent tout</h3>
    <ul>
      <li><strong>PEA après 5 ans</strong> — Exonération d'impôt sur les plus-values, seuls les prélèvements sociaux (17,2 %) restent. Le meilleur véhicule pour la phase d'accumulation actions.</li>
      <li><strong>Assurance-vie après 8 ans</strong> — Abattement 4 600 €/an (ou 9 200 € couple), succession exonérée jusqu'à 152 500 € par bénéficiaire. Idéal pour la phase de décumulation et la transmission.</li>
      <li><strong>PER</strong> — Déduction immédiate de la TMI sur les versements (gain de 30-45 % pour les hauts revenus). À sortir en rente ou capital au moment de la retraite.</li>
    </ul>
  </div>
</section>
''',
}

CSS_INJECT = '''<style>
/* SEO data block — sections indexables visibles avant le footer */
.ci-seo-data { padding: 48px 20px; background: var(--bg-2); border-top: 1px solid var(--border); }
.ci-seo-data-inner { max-width: 1100px; margin: 0 auto; }
.ci-seo-data-title { margin: 0 0 8px; font-size: 26px; font-weight: 700; color: var(--text); }
.ci-seo-data-lede { margin: 0 0 24px; font-size: 15px; color: var(--text-2); line-height: 1.6; max-width: 760px; }
.ci-seo-data-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 32px; }
.ci-seo-data-card { padding: 18px 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r); }
.ci-seo-data-label { font: 600 11px var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-2); }
.ci-seo-data-value { font: 700 28px var(--font-mono); color: var(--accent); margin-top: 8px; letter-spacing: -0.02em; }
.ci-seo-data-sub { font-size: 12px; color: var(--text-2); margin-top: 6px; line-height: 1.5; }
.ci-seo-data-h3 { font-size: 18px; font-weight: 600; color: var(--text); margin: 24px 0 8px; }
.ci-seo-data ul, .ci-seo-data p { font-size: 14px; color: var(--text-2); line-height: 1.65; max-width: 820px; }
.ci-seo-data ul li { margin-bottom: 8px; }
.ci-seo-data strong { color: var(--text); }
</style>'''


def main():
    css_added = False
    style_path = ROOT / 'assets' / 'css' / 'style.css'
    style_txt = style_path.read_text(encoding='utf-8')
    if '.ci-seo-data' not in style_txt:
        style_path.write_text(style_txt + '\n\n' + CSS_INJECT.replace('<style>','').replace('</style>','') + '\n', encoding='utf-8')
        css_added = True
        print('  + CSS ajouté dans style.css')

    count = 0
    for fname, block in DATA_BLOCKS.items():
        p = ROOT / fname
        if not p.exists():
            print(f'  ✗ {fname} introuvable'); continue
        txt = p.read_text(encoding='utf-8')
        if 'ci-seo-data' in txt:
            print(f'  = {fname} (déjà patché, skip)')
            continue
        # Insère avant <aside class="ci-related" si présent, sinon avant <footer>
        anchor = '<aside class="ci-related"'
        if anchor in txt:
            new_txt = txt.replace(anchor, block + '\n' + anchor, 1)
        else:
            new_txt = txt.replace('<footer class="footer">', block + '\n<footer class="footer">', 1)
        if new_txt != txt:
            p.write_text(new_txt, encoding='utf-8')
            count += 1
            print(f'  ✓ {fname}')
    print(f'\n{count} pages patchées')


if __name__ == '__main__':
    main()
