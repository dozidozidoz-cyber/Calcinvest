"""
FAQ vague 2 — ajoute FAQ visible + Schema FAQPage sur 10 outils
fiscaux/épargne à fort volume de recherche "comment...".

Usage : python scripts/inject_faq_wave2.py   (idempotent)
"""
import json, sys, io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent

FAQ = {
'calculateur-impot-revenu.html': [
    ("Comment calculer son impôt sur le revenu 2026 ?",
     "On divise le revenu net imposable par le nombre de parts fiscales, on applique le barème progressif par tranche (0 % jusqu'à 11 497 €, puis 11 %, 30 %, 41 %, 45 %), puis on multiplie par le nombre de parts. Le calculateur fait tout ça automatiquement, décote et plafonnement du quotient familial inclus."),
    ("C'est quoi la TMI (Tranche Marginale d'Imposition) ?",
     "C'est le taux de la tranche la plus haute que votre revenu atteint. Avec 40 000 € imposables pour 1 part, votre TMI est 30 % — mais seul l'excédent au-dessus de 29 315 € est taxé à 30 %, pas tout le revenu. Confondre TMI et taux moyen est l'erreur n°1."),
    ("Quelle différence entre taux moyen et taux marginal ?",
     "Le taux moyen = impôt total / revenu (ce que vous payez réellement). Le taux marginal (TMI) = le taux appliqué à votre dernier euro gagné. Le taux moyen est toujours inférieur. La TMI sert à évaluer l'intérêt d'une déduction (PER, déficit foncier) : chaque euro déduit fait économiser TMI %."),
    ("Comment fonctionne la décote 2026 ?",
     "Si votre impôt brut est inférieur à environ 1 964 € (célibataire) ou 3 248 € (couple), une décote le réduit automatiquement. Elle s'éteint progressivement — c'est ce qui explique que beaucoup de foyers modestes ne paient rien malgré un calcul théorique positif."),
    ("Les revenus du capital sont-ils dans le barème ?",
     "Par défaut non : dividendes, intérêts et plus-values mobilières subissent le PFU de 30 % (12,8 % IR + 17,2 % PS) hors barème. Vous pouvez opter pour le barème si votre TMI est ≤ 11 % — l'option est globale et s'applique à tous vos revenus de capitaux de l'année."),
    ("Combien fait économiser un versement PER ?",
     "Votre TMI × le versement. À TMI 30 %, verser 5 000 € au PER économise 1 500 € d'impôt l'année du versement. À TMI 11 %, seulement 550 € — d'où l'intérêt de simuler avant de verser. Voir le simulateur PER du site pour le calcul complet entrée/sortie."),
],
'calculateur-salaire-brut-net.html': [
    ("Comment convertir un salaire brut en net ?",
     "On retire les cotisations salariales : environ 22 % pour un non-cadre et 25 % pour un cadre dans le privé. 3 000 € brut donnent ainsi ~2 340 € net (non-cadre) ou ~2 250 € net (cadre). Le calculateur détaille chaque ligne : retraite, CSG/CRDS, chômage, prévoyance."),
    ("Quelle différence entre net à payer et net imposable ?",
     "Le net imposable est supérieur au net versé car une partie de la CSG (2,9 points) n'est pas déductible et la part patronale de mutuelle est réintégrée. C'est le net imposable qui sert au calcul de l'impôt — comptez environ 3-4 % de plus que le net perçu."),
    ("Quel est le salaire net pour 40 000 € brut annuel ?",
     "Environ 31 200 € net/an pour un non-cadre (2 600 €/mois) et 30 000 € pour un cadre (2 500 €/mois), avant prélèvement à la source. Après PAS à un taux de ~7 %, comptez environ 2 420 €/mois nets d'impôt pour un célibataire non-cadre."),
    ("Pourquoi un cadre cotise-t-il plus qu'un non-cadre ?",
     "Principalement à cause de la cotisation APEC, de la prévoyance obligatoire (1,5 % tranche A à la charge de l'employeur mais souvent complétée) et de taux retraite complémentaire plus élevés au-delà du plafond de la Sécurité sociale (3 925 €/mois en 2026)."),
    ("Le prélèvement à la source change-t-il le net ?",
     "Oui : l'employeur retient l'impôt directement selon votre taux personnalisé transmis par le fisc. Le « net après PAS » est donc ce qui arrive vraiment sur votre compte. Le calculateur affiche les deux : net avant impôt et net après prélèvement à la source."),
],
'calculateur-tva-auto-entrepreneur.html': [
    ("Quel est le plafond de franchise de TVA en 2026 ?",
     "37 500 € pour les prestations de services et 85 000 € pour la vente de marchandises (seuils majorés : 41 250 € et 93 500 €). En dessous, vous facturez sans TVA avec la mention « TVA non applicable, art. 293 B du CGI ». Au-delà, vous devez facturer la TVA dès le 1er jour du mois de dépassement."),
    ("Quelles cotisations URSSAF paie un auto-entrepreneur ?",
     "En 2026 : 12,3 % du CA pour la vente de marchandises, 21,2 % pour les prestations de services commerciales/artisanales (BIC), 24,6 % pour les professions libérales (BNC). S'ajoutent la CFP (0,1-0,3 %) et éventuellement le versement libératoire de l'impôt (1-2,2 %)."),
    ("Comment calculer son revenu net d'auto-entrepreneur ?",
     "CA encaissé − cotisations URSSAF − impôt − frais réels (non déductibles fiscalement mais bien réels : matériel, assurance, déplacements). Un libéral à 50 000 € de CA garde environ 34 000 € après URSSAF et impôt, avant frais. Le calculateur fait le détail par statut."),
    ("Dépasser le plafond de TVA est-il grave ?",
     "Non, mais ça change la facturation : vous ajoutez 20 % de TVA sur vos factures (ou l'absorbez en baissant vos prix si vos clients sont des particuliers). En B2B c'est neutre, vos clients récupèrent la TVA. En B2C c'est une vraie perte de marge à anticiper."),
    ("Auto-entrepreneur ou société (EURL/SASU) : quand basculer ?",
     "Généralement quand le CA dépasse 60-70 % des plafonds micro ou que vos frais réels dépassent l'abattement forfaitaire (34 % BNC, 50 % BIC services). En société, vous déduisez les frais réels et optimisez salaire/dividendes — mais comptabilité obligatoire (~1 500 €/an)."),
],
'calculateur-donation-succession.html': [
    ("Quel est l'abattement pour une donation parent-enfant ?",
     "100 000 € par parent et par enfant, renouvelable tous les 15 ans. Un couple peut donc transmettre 200 000 € à chaque enfant sans aucun droit, et recommencer 15 ans plus tard. S'y ajoute le don familial d'argent de 31 865 € (donateur < 80 ans, bénéficiaire majeur)."),
    ("Comment sont calculés les droits de succession ?",
     "Après abattement (100 000 € par enfant), le solde est taxé par tranches : 5 % jusqu'à 8 072 €, puis 10 %, 15 %, 20 % jusqu'à 552 324 €, 30 %, 40 % et 45 % au-delà de 1 805 677 €. Entre frères/sœurs : 35-45 % après 15 932 € d'abattement. Le conjoint survivant est totalement exonéré."),
    ("Qu'est-ce que le démembrement de propriété ?",
     "Donner la nue-propriété en gardant l'usufruit : vous continuez d'occuper ou louer le bien, et les droits sont calculés sur la seule nue-propriété (60 % de la valeur à 65 ans, 50 % à 75 ans). Au décès, l'usufruit rejoint la nue-propriété sans aucun droit supplémentaire."),
    ("L'assurance-vie échappe-t-elle à la succession ?",
     "En grande partie : les versements faits avant 70 ans donnent droit à 152 500 € d'abattement par bénéficiaire, puis taxation 20 % (31,25 % au-delà de 852 500 €). Hors succession civile, hors barème. C'est l'outil de transmission le plus puissant pour les patrimoines moyens."),
    ("Faut-il donner de son vivant ou laisser hériter ?",
     "Donner tôt presque toujours : les abattements se renouvellent tous les 15 ans, le démembrement réduit l'assiette, et la plus-value future du bien échappe aux droits. Commencer à 55-60 ans permet 2 cycles complets d'abattements avant 90 ans."),
],
'simulateur-lmnp.html': [
    ("LMNP réel ou Micro-BIC : lequel choisir ?",
     "Micro-BIC = abattement forfaitaire de 50 % sur les loyers, zéro paperasse. Réel = déduction des charges réelles + amortissement du bien (hors terrain). Avec un crédit en cours ou un bien > 100 000 €, le réel aboutit presque toujours à 0 € d'impôt pendant 10-15 ans. Le simulateur compare les deux sur votre cas."),
    ("Comment fonctionne l'amortissement en LMNP réel ?",
     "Le bien est décomposé : gros œuvre (~40 % sur 50 ans), façade/étanchéité (~15 % sur 20 ans), installations (~15 % sur 15 ans), agencements (~15 % sur 10 ans), mobilier (sur 7 ans). Le terrain (~15 %) ne s'amortit pas. Résultat : 2-3 % du prix déduit chaque année, souvent plus que le bénéfice imposable."),
    ("L'amortissement LMNP est-il réintégré à la revente ?",
     "Depuis février 2025, oui : la loi de finances réintègre les amortissements déduits dans le calcul de la plus-value imposable à la revente. Le LMNP réel reste avantageux pendant la détention, mais l'écart avec le micro se réduit à la sortie — à simuler sur la durée totale."),
    ("Faut-il un comptable en LMNP réel ?",
     "Fortement recommandé : liasse fiscale 2031, tableaux d'amortissement, FEC. Comptez 400-700 €/an, dont les deux tiers récupérés via la réduction d'impôt pour adhésion à un OGA/CGA (plafonnée à 915 €). C'est une charge déductible en plus."),
    ("Quels sont les seuils du statut LMNP ?",
     "Recettes locatives meublées < 23 000 €/an OU inférieures aux autres revenus du foyer. Au-delà des deux, vous basculez en LMP (loueur professionnel) : cotisations sociales SSI (~35-40 % du bénéfice) mais plus-values professionnelles potentiellement exonérées après 5 ans."),
],
'simulateur-scpi.html': [
    ("Quel rendement attendre d'une SCPI en 2026 ?",
     "Le taux de distribution moyen du marché tourne autour de 4,5-5 % brut. Les meilleures SCPI diversifiées ou européennes servent 6-7 %, les SCPI de bureaux parisiens historiques plutôt 4 %. Attention : c'est avant fiscalité — à TMI 30 % + PS, le net tombe à ~2,5-3,5 % en détention directe."),
    ("SCPI en direct, en assurance-vie ou en nue-propriété ?",
     "Direct = revenus immédiats mais fiscalité lourde (TMI + 17,2 % PS). Assurance-vie = fiscalité adoucie après 8 ans mais frais du contrat et choix limité. Nue-propriété = décote de 20-40 % à l'achat, zéro revenu et zéro impôt pendant le démembrement — idéal pour préparer la retraite à TMI élevée."),
    ("Les SCPI européennes sont-elles plus intéressantes fiscalement ?",
     "Souvent oui pour les TMI élevées : les revenus de source étrangère (Allemagne, Pays-Bas, Espagne) échappent aux prélèvements sociaux de 17,2 % et bénéficient d'un crédit d'impôt ou taux effectif. Une SCPI européenne à 5 % peut rapporter plus net qu'une française à 5,5 %."),
    ("Quels sont les frais d'une SCPI ?",
     "Frais de souscription 8-12 % (payés à la sortie de fait, via la décote du prix de retrait), frais de gestion ~10-12 % des loyers (déjà déduits du rendement affiché). Il faut détenir 8-10 ans minimum pour amortir l'entrée — la SCPI est un placement long terme, pas un livret."),
    ("Peut-on acheter des SCPI à crédit ?",
     "Oui, et c'est fiscalement efficace : les intérêts d'emprunt sont déductibles des revenus fonciers. Avec un taux à 3,5-4 % et une SCPI à 5,5-6 %, l'effet de levier reste positif. Les banques sont plus frileuses que pour l'immo direct — passer par un courtier spécialisé aide."),
],
'simulateur-pret.html': [
    ("Comment calculer la mensualité d'un prêt immobilier ?",
     "Formule : M = C × t/12 / (1 − (1 + t/12)^−n), avec C le capital, t le taux annuel et n le nombre de mois. Pour 250 000 € sur 25 ans à 3,5 % : 1 251 €/mois hors assurance. Le simulateur ajoute l'assurance et calcule le coût total du crédit."),
    ("Quelle capacité d'emprunt avec mon salaire ?",
     "Le HCSF limite le taux d'endettement à 35 % des revenus nets (assurance incluse). Avec 3 000 €/mois, votre mensualité max est 1 050 €, soit environ 210 000 € empruntables sur 25 ans à 3,5 %. Les revenus locatifs existants comptent à 70 %."),
    ("L'assurance emprunteur compte-t-elle dans le coût ?",
     "Énormément : à 0,35 % du capital sur 25 ans, elle représente 15-30 % du coût total du crédit. Depuis la loi Lemoine, vous pouvez la changer à tout moment — passer de l'assurance groupe banque (0,35 %) à une délégation (0,10-0,15 % pour un profil jeune) économise 10 000-20 000 €."),
    ("Vaut-il mieux allonger la durée ou augmenter l'apport ?",
     "Allonger la durée augmente la capacité d'emprunt mais gonfle le coût total (+30 % d'intérêts entre 20 et 25 ans). L'apport réduit le taux obtenu et les intérêts. Règle pratique : apport minimum 10 % + frais de notaire, et la durée la plus courte que votre taux d'endettement tolère."),
    ("Combien coûtent les frais de notaire en 2026 ?",
     "7 à 8 % du prix dans l'ancien (dont l'essentiel est constitué des droits de mutation départementaux), 2 à 3 % dans le neuf. Sur 250 000 € dans l'ancien : environ 18 500 €. Ils ne sont pas finançables par toutes les banques — souvent à sortir de l'apport."),
],
'simulateur-per.html': [
    ("Combien le PER fait-il vraiment économiser ?",
     "Votre TMI × le versement, l'année du versement. 5 000 € versés à TMI 30 % = 1 500 € d'impôt en moins. Mais à la sortie, le capital versé est imposé au barème — le vrai gain est l'écart entre TMI active et TMI retraite, plus la capitalisation de l'économie d'impôt pendant 20-30 ans."),
    ("Quel est le plafond de déduction PER en 2026 ?",
     "10 % des revenus professionnels de l'année précédente, plafonné à 37 094 € (salariés) ou 87 135 € (indépendants, calcul spécifique). Les plafonds non utilisés des 3 années précédentes se reportent, et les couples peuvent mutualiser leurs plafonds."),
    ("PER ou assurance-vie : lequel choisir ?",
     "PER si TMI ≥ 30 % et horizon retraite (l'économie d'entrée fait la différence). Assurance-vie si TMI ≤ 11 %, besoin de flexibilité ou objectif succession (abattement 152 500 €/bénéficiaire). À TMI 30 %+ : les deux, PER d'abord jusqu'au plafond optimal."),
    ("Peut-on débloquer un PER avant la retraite ?",
     "Oui dans 6 cas : achat de la résidence principale (le plus utilisé), invalidité, décès du conjoint, surendettement, fin de droits chômage, liquidation judiciaire. Pour la résidence principale, le capital sort imposé au barème mais les gains au PFU — souvent intéressant quand même."),
    ("Sortie en capital ou en rente à la retraite ?",
     "Capital (possible à 100 % depuis la loi PACTE) : imposé au barème sur les versements + PFU 30 % sur les gains, mais vous gardez la main. Rente : sécurise un revenu à vie mais fiscalité RVTG et capital perdu au décès (sauf option réversion). 80 % des épargnants choisissent le capital, souvent fractionné sur plusieurs années pour lisser la TMI."),
],
'simulateur-assurance-vie.html': [
    ("Quelle est la fiscalité de l'assurance-vie après 8 ans ?",
     "Abattement annuel de 4 600 € (célibataire) ou 9 200 € (couple) sur les gains retirés, puis 7,5 % d'IR (+ 17,2 % PS) jusqu'à 150 000 € de versements, 12,8 % au-delà. En pilotant les rachats sous l'abattement, on retire chaque année des gains avec 17,2 % de PS seulement."),
    ("Fonds euros ou unités de compte : comment répartir ?",
     "Le fonds € (2-3 % garanti) protège, les UC (ETF actions, ~6-7 % espérés mais volatils) font croître. Règle d'horizon : 80-100 % UC à 20 ans de l'objectif, glissement progressif vers le fonds € à l'approche. Le simulateur teste différentes allocations sur votre durée."),
    ("L'assurance-vie est-elle vraiment hors succession ?",
     "Pour les versements avant 70 ans : oui, chaque bénéficiaire reçoit jusqu'à 152 500 € sans aucun droit, hors actif successoral. Après 70 ans : abattement global réduit à 30 500 € sur les versements (les gains restent exonérés). D'où la règle : alimenter massivement avant 70 ans."),
    ("Quels frais surveiller sur un contrat ?",
     "Frais de versement (0 % sur les contrats en ligne, jusqu'à 4,5 % en agence — à fuir), frais de gestion (0,5-0,6 % en ligne vs 1 % en agence), frais d'arbitrage et frais des supports (préférer les ETF à 0,2-0,4 % aux OPCVM maison à 2 %). Sur 25 ans, 1 % de frais en plus = ~20 % de capital final en moins."),
    ("Peut-on perdre de l'argent en assurance-vie ?",
     "Sur le fonds € non (capital garanti, hors frais). Sur les UC oui : elles suivent les marchés, -30 % possible une année donnée. C'est le prix du rendement long terme. L'assurance-vie est une enveloppe fiscale, pas un placement : le risque dépend de ce que vous mettez dedans."),
],
'calculateur-plus-value-immobiliere.html': [
    ("Comment calculer la plus-value imposable sur un bien immobilier ?",
     "Prix de vente − prix d'acquisition majoré (frais d'achat réels ou forfait 7,5 % + travaux réels ou forfait 15 % si détention > 5 ans). Sur la plus-value brute s'appliquent ensuite les abattements pour durée, puis 19 % d'IR et 17,2 % de PS, plus la surtaxe au-delà de 50 000 €."),
    ("Au bout de combien d'années est-on exonéré ?",
     "22 ans de détention pour l'impôt sur le revenu (19 %), 30 ans pour les prélèvements sociaux (17,2 %). Entre 22 et 30 ans, seuls les PS restent dus, avec un abattement de 9 %/an à partir de la 23e année. La résidence principale est exonérée immédiatement, sans condition de durée."),
    ("La résidence principale est-elle toujours exonérée ?",
     "Oui, à condition d'être votre résidence principale effective au moment de la vente. En cas de déménagement avant la vente, l'exonération tient si la vente intervient dans un délai « normal » (environ 1 an, apprécié par l'administration). Les dépendances vendues simultanément sont aussi exonérées."),
    ("Le forfait travaux de 15 % est-il automatique ?",
     "Oui si vous détenez le bien depuis plus de 5 ans, sans aucun justificatif. Si vos travaux réels (construction, agrandissement, amélioration — pas l'entretien) dépassent 15 % du prix d'achat ET que vous avez les factures d'entreprises, le réel est plus avantageux. Les travaux faits soi-même ne comptent pas."),
    ("Qu'est-ce que la surtaxe sur les plus-values élevées ?",
     "Une taxe additionnelle de 2 à 6 % sur la part de plus-value imposable dépassant 50 000 € : 2 % de 50 à 100 k€, 3 % de 100 à 150 k€, jusqu'à 6 % au-delà de 250 k€. Elle s'ajoute aux 36,2 % — le taux total peut atteindre 42,2 % sur les grosses plus-values."),
],
}


def jsonld(faq_pairs):
    data = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}}
            for q, a in faq_pairs
        ],
    }
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'


def html_block(faq_pairs):
    items = ''
    for q, a in faq_pairs:
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


def main():
    count = 0
    for fname, pairs in FAQ.items():
        p = ROOT / fname
        if not p.exists():
            print(f'  ✗ {fname}'); continue
        txt = p.read_text(encoding='utf-8')
        changed = False
        if '"FAQPage"' not in txt:
            txt = txt.replace('</head>', jsonld(pairs) + '\n</head>', 1)
            changed = True
        if 'ci-faq' not in txt:
            block = html_block(pairs)
            anchor = '<aside class="ci-readmore"'
            if anchor in txt:
                txt = txt.replace(anchor, block + '\n' + anchor, 1)
            elif '<footer class="footer">' in txt:
                txt = txt.replace('<footer class="footer">', block + '\n<footer class="footer">', 1)
            changed = True
        if changed:
            p.write_text(txt, encoding='utf-8')
            count += 1
            print(f'  ✓ {fname}')
    print(f'\n{count} outils avec FAQ vague 2')


if __name__ == '__main__':
    main()
