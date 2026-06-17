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
    } else if (path.includes('simulateur-per')) {
      openFn  = 'openPerWizard';
      calcKey = 'per';
    } else if (path.includes('simulateur-retraite')) {
      openFn  = 'openRetraiteWizard';
      calcKey = 'retraite';
    } else if (path.includes('simulateur-pret')) {
      openFn  = 'openLoanWizard';
      calcKey = 'pret';
    } else if (path.includes('simulateur-decumulation')) {
      openFn  = 'openDecumulationWizard';
      calcKey = 'decumulation';
    } else if (path.includes('simulateur-assurance-vie')) {
      openFn  = 'openAvWizard';
      calcKey = 'assurance-vie';
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

  /* ============================================================
     4. PER — Plan d'Épargne Retraite
     ============================================================ */
  window.openPerWizard = function () {
    CI.wizard({
      title: 'Mode débutant — PER',
      steps: [
        {
          id: 'age',
          question: 'Quel âge as-tu aujourd\'hui ?',
          helpText: 'Plus tu ouvres tôt, plus le capital a le temps de croître avant la retraite.',
          inputType: 'number', suffix: 'ans', defaultValue: 35, min: 18, max: 70,
          presets: [
            { label: '25', value: 25 },
            { label: '35', value: 35 },
            { label: '45', value: 45 },
            { label: '55', value: 55 }
          ]
        },
        {
          id: 'tmi',
          question: 'Quelle est ta tranche marginale d\'imposition (TMI) ?',
          helpText: 'Le taux d\'imposition de ton dernier euro de revenu. C\'est lui qui détermine l\'économie d\'impôt du PER : un versement de 1 000 € te fait économiser TMV × 1 000 € d\'impôt.',
          inputType: 'select', defaultValue: '30',
          options: [
            { value: '0',  label: '0 % — non imposable' },
            { value: '11', label: '11 % — revenus modestes' },
            { value: '30', label: '30 % — cas le plus courant' },
            { value: '41', label: '41 % — hauts revenus' },
            { value: '45', label: '45 % — très hauts revenus' }
          ]
        },
        {
          id: 'monthly',
          question: 'Combien tu peux verser par mois sur ton PER ?',
          helpText: 'Versement régulier. Les versements sont déductibles dans la limite de ton plafond annuel (≈ 10 % de tes revenus).',
          inputType: 'number', suffix: '€/mois', defaultValue: 200, min: 0,
          presets: [
            { label: '50', value: 50 },
            { label: '200', value: 200 },
            { label: '500', value: 500 },
            { label: '1 000', value: 1000 }
          ]
        },
        {
          id: 'retireAge',
          question: 'À quel âge tu comptes partir en retraite ?',
          helpText: 'Le PER est bloqué jusqu\'à la retraite (sauf accidents de la vie et achat de résidence principale).',
          inputType: 'number', suffix: 'ans', defaultValue: 64, min: 55, max: 70,
          presets: [
            { label: '62', value: 62 },
            { label: '64', value: 64 },
            { label: '67', value: 67 }
          ]
        },
        {
          id: 'rate',
          question: 'Quel rendement annuel pour ton PER ?',
          helpText: 'Dépend de la gestion : fonds € sécurisé 2-3 %, gestion pilotée équilibrée 4-5 %, ETF actions 6-7 %.',
          inputType: 'number', suffix: '%/an', defaultValue: 5, min: 0, max: 12, step: 0.5,
          presets: [
            { label: 'Prudent (3 %)', value: 3 },
            { label: 'Équilibré (5 %)', value: 5 },
            { label: 'Dynamique (7 %)', value: 7 }
          ]
        }
      ],
      onComplete: (answers) => {
        applyToForm({
          age:       'per-age',
          tmi:       'per-tmi-in',
          monthly:   'per-monthly',
          retireAge: 'per-retire-age',
          rate:      'per-return'
        }, answers);
        CI.toast('Paramètres appliqués · regarde l\'économie d\'impôt', 'success');
      }
    });
  };

  /* ============================================================
     5. RETRAITE — Pension estimée
     ============================================================ */
  window.openRetraiteWizard = function () {
    CI.wizard({
      title: 'Mode débutant — Retraite',
      steps: [
        {
          id: 'birthYear',
          question: 'Quelle est ton année de naissance ?',
          helpText: 'Elle détermine ton âge légal de départ et le nombre de trimestres requis.',
          inputType: 'number', suffix: '', defaultValue: 1985, min: 1950, max: 2005,
          presets: [
            { label: '1970', value: 1970 },
            { label: '1980', value: 1980 },
            { label: '1990', value: 1990 },
            { label: '2000', value: 2000 }
          ]
        },
        {
          id: 'careerStart',
          question: 'En quelle année as-tu commencé à travailler ?',
          helpText: 'Premier emploi déclaré (même job étudiant régulier). Sert à compter tes trimestres et détecter une carrière longue.',
          inputType: 'number', suffix: '', defaultValue: 2008, min: 1965, max: 2025,
          presets: [
            { label: '1995', value: 1995 },
            { label: '2005', value: 2005 },
            { label: '2015', value: 2015 }
          ]
        },
        {
          id: 'salary',
          question: 'Quel est ton salaire brut annuel actuel ?',
          helpText: 'Salaire brut, primes incluses. Sert de base pour projeter ta pension.',
          inputType: 'number', suffix: '€/an', defaultValue: 40000, min: 12000,
          presets: [
            { label: '25 000', value: 25000 },
            { label: '40 000', value: 40000 },
            { label: '60 000', value: 60000 },
            { label: '90 000', value: 90000 }
          ]
        },
        {
          id: 'departureAge',
          question: 'À quel âge tu veux partir ?',
          helpText: 'Partir avant le taux plein applique une décote ; rester au-delà donne une surcote.',
          inputType: 'number', suffix: 'ans', defaultValue: 64, min: 60, max: 70,
          presets: [
            { label: '62', value: 62 },
            { label: '64', value: 64 },
            { label: '67', value: 67 }
          ]
        },
        {
          id: 'growth',
          question: 'Croissance annuelle de ton salaire ?',
          helpText: 'Augmentation moyenne attendue jusqu\'à la retraite (au-delà de l\'inflation). 1-2 % est réaliste sur une carrière.',
          inputType: 'number', suffix: '%/an', defaultValue: 1.5, min: 0, max: 5, step: 0.5,
          presets: [
            { label: '0 %', value: 0 },
            { label: '1 %', value: 1 },
            { label: '1.5 %', value: 1.5 },
            { label: '2.5 %', value: 2.5 }
          ]
        }
      ],
      onComplete: (answers) => {
        applyToForm({
          birthYear:    'r-naissance',
          careerStart:  'r-debut-carriere',
          salary:       'r-salaire',
          departureAge: 'r-age-depart',
          growth:       'r-croissance'
        }, answers);
        CI.toast('Paramètres appliqués · découvre ta pension estimée', 'success');
      }
    });
  };

  /* ============================================================
     6. PRÊT IMMOBILIER
     ============================================================ */
  window.openLoanWizard = function () {
    CI.wizard({
      title: 'Mode débutant — Prêt immobilier',
      steps: [
        {
          id: 'prix',
          question: 'Quel est le prix du bien ?',
          helpText: 'Prix d\'achat affiché, hors frais de notaire.',
          inputType: 'number', suffix: '€', defaultValue: 250000, min: 30000,
          presets: [
            { label: '150 k', value: 150000 },
            { label: '250 k', value: 250000 },
            { label: '350 k', value: 350000 },
            { label: '500 k', value: 500000 }
          ]
        },
        {
          id: 'apport',
          question: 'Quel apport tu mets ?',
          helpText: 'Somme que tu finances toi-même. Les banques attendent souvent 10-20 % du prix. Le montant emprunté = prix − apport.',
          inputType: 'number', suffix: '€', defaultValue: 30000, min: 0,
          presets: [
            { label: '0', value: 0 },
            { label: '25 000', value: 25000 },
            { label: '50 000', value: 50000 },
            { label: '80 000', value: 80000 }
          ]
        },
        {
          id: 'duree',
          question: 'Sur combien d\'années tu rembourses ?',
          helpText: '20 ans est le standard. Plus long = mensualité plus faible mais coût total plus élevé.',
          inputType: 'number', suffix: 'ans', defaultValue: 25, min: 5, max: 30,
          presets: [
            { label: '15', value: 15 },
            { label: '20', value: 20 },
            { label: '25', value: 25 }
          ]
        },
        {
          id: 'taux',
          question: 'Quel taux d\'intérêt ?',
          helpText: 'Taux nominal annuel hors assurance. En 2026 : ~3-4 % pour un bon dossier sur 20-25 ans.',
          inputType: 'number', suffix: '%/an', defaultValue: 3.5, min: 0, max: 10, step: 0.1,
          presets: [
            { label: '3 %', value: 3 },
            { label: '3.5 %', value: 3.5 },
            { label: '4 %', value: 4 }
          ]
        },
        {
          id: 'revenus',
          question: 'Quels sont tes revenus nets mensuels ?',
          helpText: 'Revenus du foyer après impôts. Sert à calculer ton taux d\'endettement (limite recommandée : 35 %).',
          inputType: 'number', suffix: '€/mois', defaultValue: 3500, min: 0,
          presets: [
            { label: '2 000', value: 2000 },
            { label: '3 500', value: 3500 },
            { label: '5 000', value: 5000 },
            { label: '8 000', value: 8000 }
          ]
        }
      ],
      onComplete: (answers) => {
        answers.capital = Math.max(0, (answers.prix || 0) - (answers.apport || 0));
        applyToForm({
          prix:    'loan-prix-bien',
          apport:  'loan-apport',
          capital: 'loan-capital',
          duree:   'loan-duree',
          taux:    'loan-taux',
          revenus: 'loan-revenus'
        }, answers);
        CI.toast('Paramètres appliqués · voici ta mensualité', 'success');
      }
    });
  };

  /* ============================================================
     7. DÉCUMULATION — Retraits à la retraite
     ============================================================ */
  window.openDecumulationWizard = function () {
    CI.wizard({
      title: 'Mode débutant — Décumulation',
      steps: [
        {
          id: 'capital',
          question: 'Quel capital as-tu accumulé pour ta retraite ?',
          helpText: 'Total de ton patrimoine financier disponible au moment où tu commences à retirer.',
          inputType: 'number', suffix: '€', defaultValue: 500000, min: 10000,
          presets: [
            { label: '200 k', value: 200000 },
            { label: '500 k', value: 500000 },
            { label: '750 k', value: 750000 },
            { label: '1 M', value: 1000000 }
          ]
        },
        {
          id: 'withdrawal',
          question: 'Combien tu veux retirer par mois ?',
          helpText: 'Revenu mensuel que tu veux tirer de ton capital. La règle des 4 %/an est un bon repère de départ.',
          inputType: 'number', suffix: '€/mois', defaultValue: 2000, min: 100,
          presets: [
            { label: '1 000', value: 1000 },
            { label: '2 000', value: 2000 },
            { label: '3 000', value: 3000 },
            { label: '4 000', value: 4000 }
          ]
        },
        {
          id: 'rate',
          question: 'Quel rendement annuel de ton capital ?',
          helpText: 'Pendant la phase de retrait on reste souvent prudent. Équilibré 4-5 %, prudent 3 %.',
          inputType: 'number', suffix: '%/an', defaultValue: 5, min: 0, max: 12, step: 0.1,
          presets: [
            { label: 'Prudent (3 %)', value: 3 },
            { label: 'Équilibré (5 %)', value: 5 },
            { label: 'Dynamique (7 %)', value: 7 }
          ]
        },
        {
          id: 'inflation',
          question: 'Quelle inflation tu anticipes ?',
          helpText: 'Tes retraits sont revalorisés de l\'inflation chaque année pour garder ton pouvoir d\'achat.',
          inputType: 'number', suffix: '%/an', defaultValue: 2, min: 0, max: 6, step: 0.1,
          presets: [
            { label: '1 %', value: 1 },
            { label: '2 %', value: 2 },
            { label: '3 %', value: 3 }
          ]
        },
        {
          id: 'envelope',
          question: 'Dans quelle enveloppe est ton capital ?',
          helpText: 'La fiscalité des retraits varie fortement selon l\'enveloppe : c\'est ce qui reste vraiment dans ta poche.',
          inputType: 'select', defaultValue: 'cto',
          options: [
            { value: 'cto',     label: 'CTO — flat tax 30 % sur les gains' },
            { value: 'pea-5',   label: 'PEA > 5 ans — 17,2 % de PS seulement' },
            { value: 'av-8',    label: 'Assurance-vie > 8 ans — ~24,7 %' },
            { value: 'livret',  label: 'Livret A / LDDS — 0 %' },
            { value: 'none',    label: 'Brut (sans impôt)' }
          ]
        }
      ],
      onComplete: (answers) => {
        applyToForm({
          capital:    'dc-capital',
          withdrawal: 'dc-retrait',
          rate:       'dc-rendement',
          inflation:  'dc-inflation',
          envelope:   'dc-envelope'
        }, answers);
        CI.toast('Paramètres appliqués · combien de temps ton capital tient', 'success');
      }
    });
  };

  /* ============================================================
     8. ASSURANCE-VIE
     ============================================================ */
  window.openAvWizard = function () {
    CI.wizard({
      title: 'Mode débutant — Assurance-vie',
      steps: [
        {
          id: 'k0',
          question: 'Quel versement initial ?',
          helpText: 'Somme placée à l\'ouverture du contrat. Tu peux mettre peu et compléter avec des versements mensuels.',
          inputType: 'number', suffix: '€', defaultValue: 20000, min: 0,
          presets: [
            { label: '5 000', value: 5000 },
            { label: '20 000', value: 20000 },
            { label: '50 000', value: 50000 },
            { label: '100 000', value: 100000 }
          ]
        },
        {
          id: 'monthly',
          question: 'Combien tu verses par mois ?',
          helpText: 'Versement programmé régulier. Tu peux le modifier ou le stopper à tout moment.',
          inputType: 'number', suffix: '€/mois', defaultValue: 200, min: 0,
          presets: [
            { label: '0', value: 0 },
            { label: '100', value: 100 },
            { label: '300', value: 300 },
            { label: '600', value: 600 }
          ]
        },
        {
          id: 'years',
          question: 'Pendant combien d\'années ?',
          helpText: 'L\'assurance-vie devient fiscalement très avantageuse après 8 ans de détention.',
          inputType: 'number', suffix: 'ans', defaultValue: 20, min: 1, max: 40,
          presets: [
            { label: '8', value: 8 },
            { label: '15', value: 15 },
            { label: '20', value: 20 },
            { label: '30', value: 30 }
          ]
        },
        {
          id: 'allocUC',
          question: 'Quelle part en unités de compte (actions) ?',
          helpText: 'UC = potentiel de rendement plus élevé mais avec risque de perte. Le reste va sur le fonds € (sécurisé). 0 % = 100 % sécurisé.',
          inputType: 'number', suffix: '%', defaultValue: 50, min: 0, max: 100,
          presets: [
            { label: '0 % (sécurisé)', value: 0 },
            { label: '30 %', value: 30 },
            { label: '50 %', value: 50 },
            { label: '70 %', value: 70 }
          ]
        },
        {
          id: 'rUC',
          question: 'Quel rendement pour la part UC ?',
          helpText: 'Rendement annuel espéré des unités de compte (actions/ETF). Historique long terme : 6-7 %.',
          inputType: 'number', suffix: '%/an', defaultValue: 6, min: 0, max: 12, step: 0.1,
          presets: [
            { label: 'Prudent (4 %)', value: 4 },
            { label: 'Standard (6 %)', value: 6 },
            { label: 'Dynamique (8 %)', value: 8 }
          ]
        }
      ],
      onComplete: (answers) => {
        applyToForm({
          k0:      'av-k0',
          monthly: 'av-monthly',
          years:   'av-years',
          allocUC: 'av-alloc-uc',
          rUC:     'av-r-uc'
        }, answers);
        CI.toast('Paramètres appliqués · capital net et succession estimés', 'success');
      }
    });
  };
})();
