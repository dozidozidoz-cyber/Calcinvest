/* ============================================================
   CalcInvest — Retraite VIEW (DOM binding)
   Régime général + Agirc-Arrco
   ============================================================ */
(function () {
  'use strict';

  const RETR = window.CalcRetraite;
  const num  = window.FIN.num;

  let lastParams = null;
  let lastResult = null;

  /* ------------------------------------------------------------
     Insight box helper
     ------------------------------------------------------------ */
  const INSIGHT_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5l-1.6-4.4L2 7.5l4.4-1.6z" stroke-linejoin="round"/></svg>';
  function setInsight(sectionId, html) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    let box = section.querySelector(':scope > .insight');
    if (!box) {
      box = document.createElement('div');
      box.className = 'insight';
      box.innerHTML = '<div class="insight-icon">' + INSIGHT_ICON + '</div><div class="insight-text"></div>';
      section.appendChild(box);
    }
    const txt = box.querySelector('.insight-text');
    if (txt) txt.innerHTML = html;
  }

  /* ------------------------------------------------------------
     Read form
     ------------------------------------------------------------ */
  function readForm() {
    const $ = (id) => document.getElementById(id);
    const v = (id) => { const el = $(id); return el ? num(el.value) : 0; };
    return {
      anneeNaissance:      v('r-naissance')      || 1985,
      anneeDebutCarriere:  v('r-debut-carriere') || 2010,
      ageDepart:           v('r-age-depart')     || 64,
      salaireBrutAnnuel:   v('r-salaire')        || 35000,
      croissanceSalaire:   v('r-croissance')     || 1.5,
      trimDejaValides:     v('r-trim-deja')      || 0,
      pointsAgircArrco:    v('r-points')         || 0,
      trimAvant20Ans:      v('r-trim-avant-20')  || 0,
      anneeActuelle:       new Date().getFullYear()
    };
  }

  function writeForm(p) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('r-naissance',     p.anneeNaissance);
    set('r-debut-carriere', p.anneeDebutCarriere);
    set('r-age-depart',    p.ageDepart);
    set('r-salaire',       p.salaireBrutAnnuel);
    set('r-croissance',    p.croissanceSalaire);
    set('r-trim-deja',     p.trimDejaValides);
    set('r-points',        p.pointsAgircArrco);
    set('r-trim-avant-20', p.trimAvant20Ans);
  }

  /* ------------------------------------------------------------
     URL state
     ------------------------------------------------------------ */
  const URL_KEYS = ['anneeNaissance', 'anneeDebutCarriere', 'ageDepart', 'salaireBrutAnnuel', 'croissanceSalaire', 'trimDejaValides', 'pointsAgircArrco', 'trimAvant20Ans'];

  function syncUrl(p) {
    const out = {};
    URL_KEYS.forEach((k) => { out[k] = p[k]; });
    CI.setUrlParams(out);
  }

  function loadFromUrl() {
    const defaults = {
      anneeNaissance:    1985,
      anneeDebutCarriere: 2010,
      ageDepart:         64,
      salaireBrutAnnuel: 35000,
      croissanceSalaire: 1.5,
      trimDejaValides:   60,
      pointsAgircArrco:  2000,
      trimAvant20Ans:    0
    };
    URL_KEYS.forEach((k) => {
      const v = CI.getUrlParam(k);
      if (v !== null) defaults[k] = num(v);
    });
    return defaults;
  }

  /* ------------------------------------------------------------
     A01 — Synthèse
     ------------------------------------------------------------ */
  function renderA01(p, r) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('rs-pension-brute',  CI.fmtMoney(r.pensionMensuelleBrute, 0) + '/mois');
    set('rs-pension-nette',  CI.fmtMoney(r.pensionMensuelleNette, 0) + '/mois');
    set('rs-pension-rg',     CI.fmtMoney(r.pensionRegimeGeneralMensuelle, 0));
    set('rs-pension-agirc',  CI.fmtMoney(r.pensionAgircMensuelle, 0));
    set('rs-taux-rg',        (r.taux * 100).toFixed(2) + ' %');
    set('rs-trim',           r.trimValides + ' / ' + r.trimRequis);
    set('rs-sam',            CI.fmtMoney(r.sam, 0));
    set('rs-points',         Math.round(r.pointsAgircArrco));
    set('rs-taux-rempl',     r.tauxRemplacementNet.toFixed(0) + ' %');
    set('rs-annee-depart',   r.anneeDepart);
    set('rs-age-legal',      r.ageLegal.toFixed(2) + ' ans');

    // Pension annuelle pour contexte
    set('rs-pension-annuelle', CI.fmtMoney(r.pensionAnnuelleNette, 0) + '/an');

    // Accordion summary
    const sum = document.getElementById('r-sum-params');
    if (sum) {
      const age = new Date().getFullYear() - p.anneeNaissance;
      sum.textContent =
        age + ' ans · ' + CI.fmtNum(p.salaireBrutAnnuel, 0) + ' €/an · départ ' + p.ageDepart + ' ans';
    }

    // Insight
    const decoteSurcote = r.taux > 0.5
      ? `Surcote : <span class="pos">+${((r.taux - 0.5) * 100).toFixed(2)} pts</span> grâce à ${r.trimSurplus} trim. supplémentaires.`
      : r.taux < 0.5
        ? `Décote : <span class="neg">−${((0.5 - r.taux) * 100).toFixed(2)} pts</span> car ${r.trimManquants} trim. manquants.`
        : `Taux plein atteint sans décote ni surcote.`;
    setInsight('ra-synthese',
      `Pour un départ à <strong>${p.ageDepart} ans</strong> avec ${r.trimValides}/${r.trimRequis} trim. validés, ` +
      `ta pension nette estimée est de <em>${CI.fmtMoney(r.pensionMensuelleNette, 0)}/mois</em> ` +
      `(soit ${r.tauxRemplacementNet.toFixed(0)} % de ton dernier salaire net). ${decoteSurcote} ` +
      `<span class="muted">Source : règles CNAV + Agirc-Arrco 2025. Pour une projection officielle, consulte info-retraite.fr.</span>`
    );
  }

  /* ------------------------------------------------------------
     A02 — Compare departures (62 → 68)
     ------------------------------------------------------------ */
  function renderA02(p) {
    const cmp = RETR.compareDepart(p);

    const cards = document.getElementById('ra2-cards');
    if (cards) {
      cards.innerHTML = cmp.map((c) => {
        const isCurrent = c.age === p.ageDepart;
        const border = isCurrent ? 'var(--accent)' : 'var(--border-soft)';
        const badge = isCurrent ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:700">CHOIX</span>' : '';
        const ratio = c.pensionMensuelleBrute / cmp[0].pensionMensuelleBrute;
        return `<div style="background:var(--bg-elev);border:2px solid ${border};border-radius:var(--r);padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:13px;font-weight:600">${c.age} ans</div>${badge}
          </div>
          <div style="font-size:20px;font-weight:700">${CI.fmtMoney(c.pensionMensuelleBrute, 0)}<span style="font-size:11px;font-weight:400;color:var(--text-3)">/mois brut</span></div>
          <div style="font-size:11px;color:var(--text-3);margin-top:3px">Taux : ${(c.taux * 100).toFixed(1)} % · ×${ratio.toFixed(2)} vs 62 ans</div>
        </div>`;
      }).join('');
    }

    requestAnimationFrame(() => {
      const labels = cmp.map((c) => c.age + ' ans');
      const data   = cmp.map((c) => c.pensionMensuelleBrute);
      CI.drawChart('ra2-chart', labels, [
        { label: 'Pension brute mensuelle', data, color: '#34D399', fill: true, width: 2.5 }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    const r62 = cmp.find((c) => c.age === 62);
    const r67 = cmp.find((c) => c.age === 67);
    const gain = r67.pensionMensuelleBrute - r62.pensionMensuelleBrute;
    setInsight('ra-prolongation',
      `Reporter ton départ de <strong>62 → 67 ans</strong> augmente ta pension brute de ` +
      `<em>${CI.fmtMoney(r62.pensionMensuelleBrute, 0)}</em> à <em>${CI.fmtMoney(r67.pensionMensuelleBrute, 0)}</em> mensuel ` +
      `(<span class="pos">+${CI.fmtMoney(gain, 0)}/mois</span>). ` +
      `<span class="muted">À 67 ans, le taux plein est automatique sans condition de durée.</span>`
    );
  }

  /* ------------------------------------------------------------
     A03 — Rachat de trimestres
     ------------------------------------------------------------ */
  let la3NbTrim = 8;
  let la3Cout = 5200;

  function renderA03(p) {
    const r = RETR.calcRachatTrimestres(p, la3NbTrim, la3Cout);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('ra3-cout-total',  CI.fmtMoney(r.coutTotal, 0));
    set('ra3-gain-mens',   (r.gainMensuelNet >= 0 ? '+' : '') + CI.fmtMoney(r.gainMensuelNet, 0) + '/mois');
    set('ra3-gain-total',  CI.fmtMoney(r.gainTotalNet, 0));
    set('ra3-rentab',      isFinite(r.anneesRentabilite)
      ? r.anneesRentabilite.toFixed(1) + ' ans'
      : 'Non rentable');
    set('ra3-pension-avant', CI.fmtMoney(r.pensionAvant.pensionMensuelleBrute, 0));
    set('ra3-pension-apres', CI.fmtMoney(r.pensionApres.pensionMensuelleBrute, 0));

    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };
    cls('ra3-gain-mens', r.gainMensuelNet > 0 ? 'pos' : 'neg');
    cls('ra3-rentab',    r.anneesRentabilite < 12 ? 'pos' : r.anneesRentabilite < 20 ? 'warn' : 'neg');

    // Insight
    let verdict;
    if (r.gainMensuelNet < 5) {
      verdict = `<span class="warn">Rachat peu pertinent ici</span> : tu es déjà au taux plein ou proche. Le coût ne génère qu'un gain marginal.`;
    } else if (r.anneesRentabilite < 12) {
      verdict = `<span class="pos">Rachat très rentable</span> — tu rentabilises en ${r.anneesRentabilite.toFixed(1)} ans, soit avant ${Math.round(p.ageDepart + r.anneesRentabilite)} ans.`;
    } else if (r.anneesRentabilite < 20) {
      verdict = `<span class="warn">Rachat moyennement rentable</span> — rentabilité atteinte vers ${Math.round(p.ageDepart + r.anneesRentabilite)} ans, à pondérer avec ton espérance de vie.`;
    } else {
      verdict = `<span class="neg">Rachat peu rentable</span> — tu ne rentabilises qu'après ${r.anneesRentabilite.toFixed(0)} ans, donc après 80+ ans.`;
    }
    setInsight('ra-rachat',
      `Pour racheter <strong>${la3NbTrim} trim.</strong> à ${CI.fmtMoney(la3Cout, 0)}/trim (option taux + durée), tu dépenses ` +
      `<em>${CI.fmtMoney(r.coutTotal, 0)}</em> et gagnes ` +
      `<span class="${r.gainMensuelNet > 0 ? 'pos' : 'neg'}">${CI.fmtMoney(r.gainMensuelNet, 0)}/mois nets</span>. ${verdict} ` +
      `<span class="muted">Le coût réel dépend de ton âge et tes revenus (option : taux uniquement, ou taux + durée).</span>`
    );
  }

  /* ------------------------------------------------------------
     A04 — Carrière longue
     ------------------------------------------------------------ */
  function renderA04(p) {
    const r = RETR.calcCarriereLongue(p);
    const wrapper = document.getElementById('ra4-content');
    if (!wrapper) return;

    if (!r.eligible) {
      wrapper.innerHTML = `<div class="info-box" style="margin:0">
        <div class="info-box-title">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 11h.01"/></svg>
          Non éligible
        </div>
        Carrière débutée à <strong>${r.ageDebut} ans</strong>. Le dispositif "carrière longue" s'applique aux personnes ayant commencé à travailler avant 21 ans <em>et</em> validé au moins 5 trim. avant leur 20e anniversaire (4 si né au dernier trim.).
        Saisis ton nombre de trim. validés avant 20 ans dans le formulaire pour vérifier.
      </div>`;
      setInsight('ra-carriere-longue',
        `<span class="muted">Le dispositif "carrière longue" permet un départ anticipé jusqu'à 6 ans avant l'âge légal pour ceux qui ont commencé tôt. Vérifie tes 5 trim. avant 20 ans sur ton relevé CNAV.</span>`);
      return;
    }

    const ecart = r.ecartMensuel;
    wrapper.innerHTML = `
      <div class="stats-row">
        <div class="stat">
          <div class="stat-label">Âge de départ possible</div>
          <div class="stat-value pos">${r.ageDepartPossible} ans</div>
          <div class="stat-sub">Soit ${r.gainAnneesAnticipees} ans plus tôt</div>
        </div>
        <div class="stat">
          <div class="stat-label">Pension à âge anticipé</div>
          <div class="stat-value info">${CI.fmtMoney(r.pensionMensuelleAnticipee, 0)}/mois</div>
          <div class="stat-sub">Brute</div>
        </div>
        <div class="stat">
          <div class="stat-label">Pension à âge normal</div>
          <div class="stat-value">${CI.fmtMoney(r.pensionNormale.pensionMensuelleBrute, 0)}/mois</div>
          <div class="stat-sub">Brute</div>
        </div>
        <div class="stat">
          <div class="stat-label">Différence</div>
          <div class="stat-value warn">−${CI.fmtMoney(ecart, 0)}/mois</div>
          <div class="stat-sub">Coût de l'anticipation</div>
        </div>
      </div>
    `;
    setInsight('ra-carriere-longue',
      `Tu as commencé à travailler à <strong>${r.ageDebut} ans</strong> avec ${p.trimAvant20Ans} trim. avant 20 ans → ` +
      `tu peux partir à <strong>${r.ageDepartPossible} ans</strong> au lieu de ${p.ageDepart}. ` +
      `Ta pension sera de <em>${CI.fmtMoney(r.pensionMensuelleAnticipee, 0)}</em> nets/mois ` +
      `(vs ${CI.fmtMoney(r.pensionNormale.pensionMensuelleBrute, 0)} à ${p.ageDepart} ans). ` +
      `<span class="muted">À pondérer avec les ${r.gainAnneesAnticipees} années de pension perçue plus tôt.</span>`
    );
  }

  /* ------------------------------------------------------------
     A05 — Sensibilité salaire
     ------------------------------------------------------------ */
  function renderA05(p) {
    const arr = RETR.calcSensibiliteSalaire(p);

    const tbody = document.getElementById('ra5-tbody');
    if (tbody) {
      tbody.innerHTML = arr.map((s) => {
        return `<tr>
          <td style="padding:8px 12px;font-weight:600">${s.croissance.toFixed(1)} %/an</td>
          <td style="padding:8px 12px">${CI.fmtMoney(s.sam, 0)}</td>
          <td style="padding:8px 12px;font-weight:700">${CI.fmtMoney(s.pensionMensuelleBrute, 0)}/mois</td>
          <td style="padding:8px 12px;color:var(--text-3)">${CI.fmtMoney(s.pensionMensuelleNette, 0)}/mois</td>
        </tr>`;
      }).join('');
    }

    requestAnimationFrame(() => {
      const labels = arr.map((s) => s.croissance.toFixed(1) + ' %');
      const data = arr.map((s) => s.pensionMensuelleBrute);
      CI.drawChart('ra5-chart', labels, [
        { label: 'Pension brute', data, color: '#FBBF24', fill: true, width: 2.5 }
      ], { yFormat: (v) => CI.fmtCompact(v) });
    });

    const ref = arr.find((s) => Math.abs(s.croissance - p.croissanceSalaire) < 0.1) || arr[2];
    const at0 = arr[0];
    const at4 = arr[4];
    const ratio = at4.pensionMensuelleBrute / at0.pensionMensuelleBrute;
    setInsight('ra-sensibilite',
      `Avec une croissance salariale de <strong>0 %/an</strong> ta pension serait <em>${CI.fmtMoney(at0.pensionMensuelleBrute, 0)}/mois</em>, ` +
      `vs <em>${CI.fmtMoney(at4.pensionMensuelleBrute, 0)}/mois</em> à <strong>4 %/an</strong> ` +
      `(<span class="pos">×${ratio.toFixed(2)}</span>). ` +
      `<span class="muted">Pour le SAM, ce sont les 25 meilleures années qui comptent — donc viser une progression de carrière, même modeste mais constante, paie sur le très long terme.</span>`
    );
  }

  /* ------------------------------------------------------------
     run() + actions
     ------------------------------------------------------------ */
  function run() {
    const p = readForm();
    const r = RETR.calcRetraite(p);
    lastParams = p;
    lastResult = r;
    renderA01(p, r);
    renderA02(p);
    renderA03(p);
    renderA04(p);
    renderA05(p);
    syncUrl(p);
  }

  function share()  { if (lastParams) syncUrl(lastParams); CI.copyShareUrl(); }
  function print()  { window.print(); }
  function reset()  { window.location.search = ''; }
  function save()   {
    if (!lastResult) { CI.toast('Lance un calcul d\'abord', 'error'); return; }
    CI.promptSave('Retraite', lastParams, 'Mon plan retraite', () => {});
  }
  function exportPDF() {
    if (!lastResult) { CI.toast('Lance un calcul d\'abord', 'error'); return; }
    const p = lastParams;
    const summary = `Né en ${p.anneeNaissance} · ${CI.fmtNum(p.salaireBrutAnnuel, 0)} €/an · départ ${p.ageDepart} ans`;
    CI.exportPDF({
      title:    'CalcInvest — Retraite',
      summary:  summary,
      sectionIds: ['ra-synthese','ra-prolongation','ra-rachat','ra-carriere-longue','ra-sensibilite'],
      fileName: 'calcinvest-retraite'
    });
  }

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    window.runRetraite       = run;
    window.shareRetraite     = share;
    window.printRetraite     = print;
    window.resetRetraite     = reset;
    window.saveRetraite      = save;
    window.exportRetraitePDF = exportPDF;

    writeForm(loadFromUrl());
    CI.initAll();

    // Recompute global on input change
    document.querySelectorAll('#r-params input, #r-params select').forEach((el) => {
      el.addEventListener('input',  run);
      el.addEventListener('change', run);
    });

    // A03 : nb trim + coût
    ['ra3-nb-trim', 'ra3-cout'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          la3NbTrim = num(document.getElementById('ra3-nb-trim').value) || 8;
          la3Cout   = num(document.getElementById('ra3-cout').value)   || 5200;
          if (lastParams) renderA03(lastParams);
        });
      }
    });

    setTimeout(run, 30);
  });
})();
