/* ============================================================
   CalcInvest — Configs de wizards "Mode débutant guidé"
   Charge ce fichier après common.js sur les pages calculateurs.
   Chaque wizard mappe ses réponses aux IDs du formulaire
   du calculateur, puis déclenche le run() existant.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     Auto-injection du bouton "Mode débutant guidé" selon la page
     ------------------------------------------------------------ */
  function injectWizardButton() {
    const path = window.location.pathname;
    let openFn = null;
    let calcKey = null;
    if (path.includes('simulateur-interets-composes')) {
      openFn  = 'openCompoundWizard';
      calcKey = 'compound';
    } else if (path.includes('calculateur-fire')) {
      openFn  = 'openFireWizard';
      calcKey = 'fire';
    } else if (path.includes('simulateur-rendement-locatif')) {
      openFn  = 'openLocatifWizard';
      calcKey = 'locatif';
    }
    if (!openFn) return;

    // Container : juste avant l'accordion paramètres ou en haut du main
    const target = document.querySelector('.page-header');
    if (!target || document.getElementById('wizard-cta')) return;

    const cta = document.createElement('div');
    cta.id = 'wizard-cta';
    cta.style.cssText = 'margin-top:14px;padding:14px 18px;background:linear-gradient(135deg, var(--accent-soft), var(--accent-mid));border:1px solid var(--accent-soft);border-radius:var(--r);display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap';
    cta.innerHTML = '<div style="display:flex;align-items:center;gap:12px">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:var(--accent);color:#000;display:flex;align-items:center;justify-content:center;font-size:18px">🧭</div>' +
      '<div>' +
        '<div style="font-weight:700;font-size:14px;color:var(--text)">Première fois ici ?</div>' +
        '<div style="font-size:12px;color:var(--text-2)">Mode débutant guidé : 4-6 questions pour préremplir les paramètres.</div>' +
      '</div>' +
    '</div>' +
    '<button class="btn btn-primary" id="wizard-cta-btn" data-fn="' + openFn + '" style="white-space:nowrap">Lancer le guide →</button>';

    target.appendChild(cta);
    document.getElementById('wizard-cta-btn').addEventListener('click', () => {
      if (typeof window[openFn] === 'function') window[openFn]();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Petit délai pour que les autres scripts setUp tout
    setTimeout(injectWizardButton, 50);
  });

  /* ------------------------------------------------------------
     Helper : applique answers aux inputs et déclenche un input event
     ------------------------------------------------------------ */
  function applyToForm(mapping, answers) {
    Object.keys(mapping).forEach((answerKey) => {
      const inputId = mapping[answerKey];
      const el = document.getElementById(inputId);
      if (el && answers[answerKey] != null) {
        el.value = answers[answerKey];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  /* ============================================================
     1. INTÉRÊTS COMPOSÉS
     ============================================================ */
  window.openCompoundWizard = function () {
    CI.wizard({
      title: 'Mode débutant — Intérêts composés',
      steps: [
        {
          id: 'initial',
          question: 'Combien tu peux placer aujourd\'hui ?',
          helpText: 'Capital de départ que tu vas placer dès maintenant. Si tu n\'as rien, mets 0 et utilise les versements mensuels.',
          inputType: 'number', suffix: '€', defaultValue: 1000, min: 0,
          presets: [
            { label: '0', value: 0 },
            { label: '1 000', value: 1000 },
            { label: '10 000', value: 10000 },
            { label: '50 000', value: 50000 }
          ]
        },
        {
          id: 'monthly',
          question: 'Combien tu peux mettre de côté chaque mois ?',
          helpText: 'Versement mensuel régulier. Une bonne règle : 10-20 % de ton salaire net.',
          inputType: 'number', suffix: '€/mois', defaultValue: 200, min: 0,
          presets: [
            { label: '50', value: 50 },
            { label: '200', value: 200 },
            { label: '500', value: 500 },
            { label: '1 000', value: 1000 }
          ]
        },
        {
          id: 'years',
          question: 'Pendant combien d\'années tu veux faire ça ?',
          helpText: 'Plus c\'est long, plus l\'effet boule de neige est puissant. La retraite est une bonne référence.',
          inputType: 'number', suffix: 'ans', defaultValue: 20, min: 1, max: 50,
          presets: [
            { label: '5', value: 5 },
            { label: '10', value: 10 },
            { label: '20', value: 20 },
            { label: '30', value: 30 }
          ]
        },
        {
          id: 'rate',
          question: 'Quel rendement tu vises ?',
          helpText: 'Indicatif : Livret A 3 % · Assurance-vie fonds € 2-3 % · Actions long terme 6-8 % · ETF S&P 500 historique 9 %.',
          inputType: 'number', suffix: '%/an', defaultValue: 7, min: 0, max: 25, step: 0.5,
          presets: [
            { label: 'Livret A (3 %)', value: 3 },
            { label: 'Prudent (5 %)', value: 5 },
            { label: 'Actions (7 %)', value: 7 },
            { label: 'Aggressif (10 %)', value: 10 }
          ]
        }
      ],
      onComplete: (answers) => {
        applyToForm({
          initial: 'c-initial',
          monthly: 'c-monthly',
          years:   'c-years',
          rate:    'c-rate'
        }, answers);
        CI.toast('Paramètres appliqués · explore les analyses ci-dessous', 'success');
      }
    });
  };

  /* ============================================================
     2. FIRE — Indépendance financière
     ============================================================ */
  window.openFireWizard = function () {
    CI.wizard({
      title: 'Mode débutant — FIRE',
      steps: [
        {
          id: 'age',
          question: 'Quel âge tu as aujourd\'hui ?',
          helpText: 'Plus tu commences tôt, moins tu auras besoin d\'épargner mensuellement pour atteindre le FIRE.',
          inputType: 'number', suffix: 'ans', defaultValue: 30, min: 18, max: 70,
          presets: [
            { label: '25', value: 25 },
            { label: '30', value: 30 },
            { label: '40', value: 40 },
            { label: '50', value: 50 }
          ]
        },
        {
          id: 'expenses',
          question: 'Combien tu dépenses par an actuellement ?',
          helpText: 'Total annuel : loyer/prêt + courses + transports + loisirs + impôts. C\'est ce que tu devras couvrir après le FIRE.',
          inputType: 'number', suffix: '€/an', defaultValue: 30000, min: 5000,
          presets: [
            { label: '20 000', value: 20000 },
            { label: '30 000', value: 30000 },
            { label: '50 000', value: 50000 },
            { label: '80 000', value: 80000 }
          ]
        },
        {
          id: 'savings',
          question: 'Combien tu as déjà épargné ?',
          helpText: 'Total de ton patrimoine financier (livrets + AV + bourse + crypto, hors immobilier de résidence).',
          inputType: 'number', suffix: '€', defaultValue: 20000, min: 0,
          presets: [
            { label: '0', value: 0 },
            { label: '10 000', value: 10000 },
            { label: '50 000', value: 50000 },
            { label: '200 000', value: 200000 }
          ]
        },
        {
          id: 'monthly',
          question: 'Combien tu peux épargner par mois ?',
          helpText: 'Plus ton taux d\'épargne est élevé, plus tu atteins le FIRE rapidement (50 % d\'épargne ≈ FIRE en 17 ans).',
          inputType: 'number', suffix: '€/mois', defaultValue: 1500, min: 0,
          presets: [
            { label: '500', value: 500 },
            { label: '1 000', value: 1000 },
            { label: '2 000', value: 2000 },
            { label: '4 000', value: 4000 }
          ]
        },
        {
          id: 'rate',
          question: 'Quel rendement annuel pour ton portefeuille ?',
          helpText: 'Hypothèse classique FIRE : 7 %/an (S&P 500 historique). Plus prudent : 5 %.',
          inputType: 'number', suffix: '%/an', defaultValue: 7, min: 1, max: 15, step: 0.5,
          presets: [
            { label: 'Prudent (5 %)', value: 5 },
            { label: 'Standard (7 %)', value: 7 },
            { label: 'Aggressif (9 %)', value: 9 }
          ]
        }
      ],
      onComplete: (answers) => {
        applyToForm({
          age:      'fi-age',
          expenses: 'fi-expenses',
          savings:  'fi-savings',
          monthly:  'fi-monthly',
          rate:     'fi-return'
        }, answers);
        CI.toast('Paramètres appliqués · découvre ton chemin vers FIRE', 'success');
      }
    });
  };

  /* ============================================================
     3. RENDEMENT LOCATIF
     ============================================================ */
  window.openLocatifWizard = function () {
    CI.wizard({
      title: 'Mode débutant — Rendement locatif',
      steps: [
        {
          id: 'price',
          question: 'Quel est le prix du bien ?',
          helpText: 'Prix d\'achat affiché. Sans les frais de notaire (calculés automatiquement à 8 % par défaut).',
          inputType: 'number', suffix: '€', defaultValue: 200000, min: 30000,
          presets: [
            { label: '100 k', value: 100000 },
            { label: '200 k', value: 200000 },
            { label: '350 k', value: 350000 },
            { label: '500 k', value: 500000 }
          ]
        },
        {
          id: 'rent',
          question: 'Quel loyer mensuel tu peux espérer ?',
          helpText: 'Loyer hors charges. Bon repère : entre 0.4 % et 0.6 % du prix d\'achat par mois (rendement brut 5-7 %).',
          inputType: 'number', suffix: '€/mois', defaultValue: 900, min: 100,
          presets: [
            { label: '500', value: 500 },
            { label: '900', value: 900 },
            { label: '1 500', value: 1500 },
            { label: '2 500', value: 2500 }
          ]
        },
        {
          id: 'loan',
          question: 'Combien tu vas emprunter ?',
          helpText: 'Montant total emprunté à la banque. Un apport de 10-20 % du prix est généralement attendu.',
          inputType: 'number', suffix: '€', defaultValue: 180000, min: 0,
          presets: [
            { label: 'Tout cash (0)', value: 0 },
            { label: '80 % du prix', value: 160000 },
            { label: '90 % du prix', value: 180000 },
            { label: '100 %', value: 200000 }
          ]
        },
        {
          id: 'loanYears',
          question: 'Sur combien d\'années tu rembourses ?',
          helpText: '20 ans est le standard. 25 ans réduit la mensualité mais coûte plus en intérêts.',
          inputType: 'number', suffix: 'ans', defaultValue: 20, min: 5, max: 30,
          presets: [
            { label: '15', value: 15 },
            { label: '20', value: 20 },
            { label: '25', value: 25 }
          ]
        },
        {
          id: 'loanRate',
          question: 'Quel taux d\'intérêt ?',
          helpText: 'Taux nominal annuel hors assurance. En 2025 : ~3-4 % pour un bon dossier sur 20 ans.',
          inputType: 'number', suffix: '%/an', defaultValue: 3.5, min: 0, max: 10, step: 0.1,
          presets: [
            { label: '3 %', value: 3 },
            { label: '3.5 %', value: 3.5 },
            { label: '4 %', value: 4 }
          ]
        },
        {
          id: 'regime',
          question: 'Quel régime fiscal ?',
          helpText: 'LMNP réel (location meublée) est souvent le plus avantageux grâce aux amortissements. Réel foncier pour location nue avec gros travaux.',
          inputType: 'select',
          defaultValue: 'lmnp-reel',
          options: [
            { value: 'micro-foncier', label: 'Micro-foncier (location nue, abattement 30 %)' },
            { value: 'reel-foncier',  label: 'Réel foncier (location nue, charges réelles)' },
            { value: 'lmnp-micro',    label: 'LMNP Micro-BIC (meublé, abattement 50 %)' },
            { value: 'lmnp-reel',     label: 'LMNP Réel (meublé, amortissements)' }
          ]
        }
      ],
      onComplete: (answers) => {
        applyToForm({
          price:     'l-price',
          rent:      'l-rent',
          loan:      'l-loan',
          loanYears: 'l-loanyears',
          loanRate:  'l-loanrate',
          regime:    'l-regime'
        }, answers);
        CI.toast('Paramètres appliqués · explore les 10 analyses', 'success');
      }
    });
  };
})();
