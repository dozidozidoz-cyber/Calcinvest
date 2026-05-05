/* ============================================================
   CalcInvest — Scénarios types pré-faits
   Cards "1 click → simu pré-remplie" en bas de chaque calculateur.
   5 profils types : étudiant 22 / cadre 30 / famille 40 / pré-retraité 55 / retraité 65.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     Helper : applique un objet { inputId: value } et déclenche input
     ------------------------------------------------------------ */
  function applyParams(params) {
    Object.keys(params).forEach((id) => {
      const el = document.getElementById(id);
      if (el && params[id] != null) {
        el.value = params[id];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    setTimeout(() => {
      const target = document.querySelector('.page-header');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  /* ------------------------------------------------------------
     Scénarios par calculateur
     id correspond à la slug d'URL (sans /simulateur- ou /calculateur-)
     ------------------------------------------------------------ */
  const SCENARIOS = {
    'interets-composes': [
      {
        emoji: '🎓', label: 'Étudiant 22 ans',
        desc: '0 € de capital, 100 €/mois mis de côté pendant 40 ans, ETF MSCI World à 7 %/an',
        params: { 'c-initial': 0, 'c-monthly': 100, 'c-rate': 7, 'c-years': 40, 'c-fees': 0.2, 'c-inflation': 2 }
      },
      {
        emoji: '💼', label: 'Jeune cadre 30 ans',
        desc: '10 k€ d\'épargne, 500 €/mois sur 30 ans à 7 %, frais ETF 0.2 %',
        params: { 'c-initial': 10000, 'c-monthly': 500, 'c-rate': 7, 'c-years': 30, 'c-fees': 0.2, 'c-inflation': 2 }
      },
      {
        emoji: '👨‍👩‍👦', label: 'Famille 40 ans',
        desc: '50 k€ patrimoine, 1 000 €/mois pendant 25 ans à 6 %, profil équilibré',
        params: { 'c-initial': 50000, 'c-monthly': 1000, 'c-rate': 6, 'c-years': 25, 'c-fees': 0.3, 'c-inflation': 2 }
      },
      {
        emoji: '🌅', label: 'Pré-retraité 55 ans',
        desc: '200 k€ accumulés, 2 000 €/mois sur 10 ans à 5 %, profil prudent',
        params: { 'c-initial': 200000, 'c-monthly': 2000, 'c-rate': 5, 'c-years': 10, 'c-fees': 0.3, 'c-inflation': 2 }
      },
      {
        emoji: '🏖️', label: 'Retraité 65 ans',
        desc: '500 k€ de capital, 0 versement, à 4 %/an sécurisé sur 20 ans',
        params: { 'c-initial': 500000, 'c-monthly': 0, 'c-rate': 4, 'c-years': 20, 'c-fees': 0.5, 'c-inflation': 2 }
      }
    ],

    'fire': [
      {
        emoji: '🎓', label: 'Étudiant 22 ans',
        desc: 'Dépenses 18 k€/an, démarre avec 0, épargne 600 €/mois (étudiant en alternance)',
        params: { 'fi-age': 22, 'fi-expenses': 18000, 'fi-savings': 0, 'fi-monthly': 600, 'fi-return': 7, 'fi-withdrawal': 4 }
      },
      {
        emoji: '💼', label: 'Jeune cadre 30 ans',
        desc: 'Dépenses 35 k€/an, 30 k€ déjà placés, 1 500 €/mois (taux d\'épargne 30 %)',
        params: { 'fi-age': 30, 'fi-expenses': 35000, 'fi-savings': 30000, 'fi-monthly': 1500, 'fi-return': 7, 'fi-withdrawal': 4 }
      },
      {
        emoji: '👨‍👩‍👦', label: 'Famille 40 ans',
        desc: 'Dépenses 50 k€/an (enfants), 100 k€ patrimoine, 2 000 €/mois',
        params: { 'fi-age': 40, 'fi-expenses': 50000, 'fi-savings': 100000, 'fi-monthly': 2000, 'fi-return': 7, 'fi-withdrawal': 4 }
      },
      {
        emoji: '🌅', label: 'Pré-retraité 55 ans',
        desc: 'Dépenses 40 k€/an, 400 k€ déjà accumulés, 3 000 €/mois — last sprint',
        params: { 'fi-age': 55, 'fi-expenses': 40000, 'fi-savings': 400000, 'fi-monthly': 3000, 'fi-return': 6, 'fi-withdrawal': 4 }
      },
      {
        emoji: '🏖️', label: 'Lean FIRE Asie SE',
        desc: 'Profil expat low-cost : 18 k€/an, 50 k€ épargnés, 2 000 €/mois objectif Bali/Thaïlande',
        params: { 'fi-age': 30, 'fi-expenses': 18000, 'fi-savings': 50000, 'fi-monthly': 2000, 'fi-return': 7, 'fi-withdrawal': 4 }
      }
    ],

    'rendement-locatif': [
      {
        emoji: '🏠', label: 'Studio étudiant Paris',
        desc: '180 k€, loyer 800 €, prêt 90 % sur 25 ans à 3.5 %, LMNP réel',
        params: {
          'l-price': 180000, 'l-rent': 800, 'l-loan': 162000, 'l-loanrate': 3.5, 'l-loanyears': 25,
          'l-regime': 'lmnp-reel', 'l-tmi': 30, 'l-vacancy': 5, 'l-propTax': 1500,
          'l-copro': 600, 'l-insurance': 250, 'l-maint': 1, 'l-holdYears': 20
        }
      },
      {
        emoji: '🏘️', label: 'T2 ville moyenne',
        desc: '120 k€, loyer 600 €, prêt 80 % sur 20 ans à 3 %, location nue réel',
        params: {
          'l-price': 120000, 'l-rent': 600, 'l-loan': 96000, 'l-loanrate': 3, 'l-loanyears': 20,
          'l-regime': 'reel-foncier', 'l-tmi': 30, 'l-vacancy': 7, 'l-propTax': 800,
          'l-copro': 400, 'l-insurance': 200, 'l-maint': 1, 'l-holdYears': 20
        }
      },
      {
        emoji: '🏡', label: 'Maison familiale T4',
        desc: '350 k€, loyer 1 600 €, prêt 75 % sur 25 ans à 3.7 %, location nue',
        params: {
          'l-price': 350000, 'l-rent': 1600, 'l-loan': 262500, 'l-loanrate': 3.7, 'l-loanyears': 25,
          'l-regime': 'reel-foncier', 'l-tmi': 30, 'l-vacancy': 5, 'l-propTax': 2400,
          'l-copro': 0, 'l-insurance': 400, 'l-maint': 1, 'l-holdYears': 25
        }
      },
      {
        emoji: '🏨', label: 'Meublé tourisme côte',
        desc: '220 k€, loyer 1 800 € (saisonnier), 70 % sur 20 ans, LMNP réel',
        params: {
          'l-price': 220000, 'l-rent': 1800, 'l-loan': 154000, 'l-loanrate': 3.5, 'l-loanyears': 20,
          'l-regime': 'lmnp-reel', 'l-tmi': 41, 'l-vacancy': 30, 'l-propTax': 1800,
          'l-copro': 800, 'l-insurance': 400, 'l-maint': 1.5, 'l-holdYears': 20
        }
      },
      {
        emoji: '💰', label: 'Cash buyer 100k',
        desc: 'Studio cash 100 k€, loyer 500 €, pas de crédit, micro-foncier',
        params: {
          'l-price': 100000, 'l-rent': 500, 'l-loan': 0, 'l-loanrate': 0, 'l-loanyears': 0,
          'l-regime': 'micro-foncier', 'l-tmi': 30, 'l-vacancy': 5, 'l-propTax': 1000,
          'l-copro': 500, 'l-insurance': 200, 'l-maint': 1, 'l-holdYears': 20
        }
      }
    ],

    'per': [
      {
        emoji: '💼', label: 'Cadre 30 ans, TMI 30 %',
        desc: '40 k salaire, 2 000 €/an versés, 35 ans d\'horizon, profil équilibré',
        params: { 'p-salary': 40000, 'p-yearly': 2000, 'p-tmi': 30, 'p-years': 35, 'p-rate': 6 }
      },
      {
        emoji: '👔', label: 'Cadre supérieur 45 ans, TMI 41 %',
        desc: '80 k salaire, 8 000 €/an, 20 ans d\'horizon — économie d\'IR 3 280 €/an',
        params: { 'p-salary': 80000, 'p-yearly': 8000, 'p-tmi': 41, 'p-years': 20, 'p-rate': 6 }
      },
      {
        emoji: '🩺', label: 'Profession libérale 50 ans, TMI 45 %',
        desc: '150 k revenus, 15 000 €/an, 15 ans — optimisation fiscale max',
        params: { 'p-salary': 150000, 'p-yearly': 15000, 'p-tmi': 45, 'p-years': 15, 'p-rate': 6 }
      },
      {
        emoji: '🌅', label: 'Pré-retraité 55 ans, TMI 30 %',
        desc: '50 k salaire, 5 000 €/an, 10 ans avant la retraite',
        params: { 'p-salary': 50000, 'p-yearly': 5000, 'p-tmi': 30, 'p-years': 10, 'p-rate': 5 }
      },
      {
        emoji: '🚀', label: 'Versement exceptionnel',
        desc: '60 k salaire, gros versement 10 000 €/an pendant 5 ans',
        params: { 'p-salary': 60000, 'p-yearly': 10000, 'p-tmi': 30, 'p-years': 5, 'p-rate': 6 }
      }
    ],

    'retraite': [
      {
        emoji: '💼', label: 'Cadre né 1985, salaire 50 k',
        desc: 'Début 2008 (23 ans), salaire actuel 50 k, départ 64 ans',
        params: {
          're-birth-year': 1985, 're-career-start': 2008, 're-salary': 50000,
          're-trim-validated': 64, 're-departure-age': 64, 're-salary-growth': 1.5
        }
      },
      {
        emoji: '👷', label: 'Carrière longue (début 18 ans)',
        desc: 'Né 1972, début 1990, salaire 38 k — départ anticipé possible',
        params: {
          're-birth-year': 1972, 're-career-start': 1990, 're-salary': 38000,
          're-trim-validated': 130, 're-departure-age': 62, 're-salary-growth': 1
        }
      },
      {
        emoji: '🩺', label: 'Cadre sup 55 ans, salaire 80 k',
        desc: 'Né 1971, début 1996 (25 ans, longues études), 80 k, départ 65 ans',
        params: {
          're-birth-year': 1971, 're-career-start': 1996, 're-salary': 80000,
          're-trim-validated': 110, 're-departure-age': 65, 're-salary-growth': 1.5
        }
      },
      {
        emoji: '⏰', label: 'Prolongation jusqu\'à 67 ans',
        desc: 'Né 1980, début 2005, 60 k — bénéficie de la surcote en restant 3 ans de plus',
        params: {
          're-birth-year': 1980, 're-career-start': 2005, 're-salary': 60000,
          're-trim-validated': 75, 're-departure-age': 67, 're-salary-growth': 1.5
        }
      },
      {
        emoji: '🎓', label: 'Démarrage tardif (28 ans)',
        desc: 'Né 1990, début 2018 (doctorat), 55 k — décote prévisible si départ 64 ans',
        params: {
          're-birth-year': 1990, 're-career-start': 2018, 're-salary': 55000,
          're-trim-validated': 30, 're-departure-age': 64, 're-salary-growth': 2
        }
      }
    ]
  };

  /* ------------------------------------------------------------
     Détection du calc actuel via pathname
     ------------------------------------------------------------ */
  function detectCalc() {
    const path = window.location.pathname;
    if (path.includes('simulateur-interets-composes'))   return 'interets-composes';
    if (path.includes('calculateur-fire'))                return 'fire';
    if (path.includes('simulateur-rendement-locatif'))    return 'rendement-locatif';
    if (path.includes('simulateur-per'))                  return 'per';
    if (path.includes('simulateur-retraite'))             return 'retraite';
    return null;
  }

  /* ------------------------------------------------------------
     Rendu : section "Cas pratiques" en bas du main, avant footer
     ------------------------------------------------------------ */
  function renderScenariosSection(calcKey) {
    const scenarios = SCENARIOS[calcKey];
    if (!scenarios || scenarios.length === 0) return;
    if (document.getElementById('scenarios-section')) return; // déjà injecté

    const main = document.querySelector('main.main, main') || document.body;
    const section = document.createElement('section');
    section.id = 'scenarios-section';
    section.style.cssText = 'margin-top:32px';
    section.innerHTML = '<div class="page-eyebrow" style="margin-bottom:14px">' +
      '<span class="page-eyebrow-icon" style="background:rgba(96,165,250,.15);border-color:rgba(96,165,250,.3);color:#60A5FA">' +
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3h10v10H3z"/><path d="M3 7h10M7 3v10"/></svg>' +
      '</span>' +
      'Cas pratiques · click pour pré-remplir' +
    '</div>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:14px">Profils types réalistes pour t\'inspirer ou comparer ta situation. Chaque card pré-remplit le formulaire et lance la simulation.</p>' +
    '<div id="scenarios-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px"></div>';

    main.appendChild(section);

    const grid = section.querySelector('#scenarios-grid');
    grid.innerHTML = scenarios.map((s, i) => (
      '<button type="button" class="card scenario-card" data-idx="' + i + '" style="text-align:left;padding:16px;cursor:pointer;background:var(--bg-elev);border:1px solid var(--border-soft);border-radius:var(--r);transition:all .2s;font-family:inherit;color:inherit">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<div style="font-size:22px;line-height:1">' + s.emoji + '</div>' +
          '<div style="font-weight:700;font-size:14px;color:var(--text)">' + s.label + '</div>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-3);line-height:1.5">' + s.desc + '</div>' +
        '<div style="margin-top:10px;font-size:11px;color:var(--accent);font-family:var(--font-mono);font-weight:600;letter-spacing:0.06em;text-transform:uppercase">Appliquer →</div>' +
      '</button>'
    )).join('');

    // Hover effect
    grid.querySelectorAll('.scenario-card').forEach((c) => {
      c.addEventListener('mouseenter', () => {
        c.style.borderColor = 'var(--accent)';
        c.style.background  = 'var(--accent-soft)';
        c.style.transform   = 'translateY(-2px)';
      });
      c.addEventListener('mouseleave', () => {
        c.style.borderColor = 'var(--border-soft)';
        c.style.background  = 'var(--bg-elev)';
        c.style.transform   = '';
      });
      c.addEventListener('click', () => {
        const idx = parseInt(c.dataset.idx, 10);
        const s = scenarios[idx];
        applyParams(s.params);
        if (window.CI && CI.toast) CI.toast('Scénario "' + s.label + '" appliqué', 'success');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const calcKey = detectCalc();
    if (calcKey) setTimeout(() => renderScenariosSection(calcKey), 60);
  });
})();
