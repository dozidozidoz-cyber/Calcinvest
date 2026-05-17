/* ============================================================
   CalcInvest — View Simulateur de Prêt
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmtM = (n) => (window.CI && CI.fmtMoney) ? CI.fmtMoney(n, 0) : (Number.isFinite(n) ? Math.round(n).toLocaleString('fr-FR') + ' €' : '—');
  const fmtP = (n) => (window.CI && CI.fmtPctPlain) ? CI.fmtPctPlain(n, 2) : (Number.isFinite(n) ? n.toFixed(2) + ' %' : '—');

  function num(id, fb) {
    const el = $(id);
    if (!el) return fb;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fb;
  }
  function safeText(id, t) { const el = $(id); if (el) el.textContent = t; }
  function safeHtml(id, h) { const el = $(id); if (el) el.innerHTML = h; }

  function readParams() {
    return {
      mode:         document.querySelector('input[name="loan-mode"]:checked')?.value || 'capacite',
      // Capacité
      revenusNets:  num('loan-revenus', 3500),
      chargesExistantes: num('loan-charges', 0),
      tauxEndettement: num('loan-endettement', 35),
      // Prêt direct
      capital:      num('loan-capital', 200000),
      // Commun
      duree:        num('loan-duree', 25),
      tauxNominal:  num('loan-taux', 3.5),
      assuranceRate: num('loan-assurance', 0.36),
      // Opération
      prixBien:     num('loan-prix-bien', 250000),
      neuf:         document.querySelector('input[name="loan-neuf"]:checked')?.value === 'neuf',
      travaux:      num('loan-travaux', 0),
      apport:       num('loan-apport', 30000),
      // Anticipé
      montantAnticipe: num('loan-anticipe-montant', 20000),
      moisAnticipe: num('loan-anticipe-mois', 60)
    };
  }

  // ─── HERO ────────────────────────────────────────────
  function renderHero(p) {
    if (p.mode === 'capacite') {
      const r = LOAN.capaciteEmprunt(p);
      safeText('loan-hero-headline', fmtM(r.capitalMax));
      safeText('loan-hero-headline-label', 'Capital max empruntable');
      safeText('loan-hero-monthly', fmtM(r.mensualiteTotale) + '/mois');
      safeText('loan-hero-duration', p.duree + ' ans');
      safeText('loan-hero-rate', fmtP(p.tauxNominal) + ' nominal');
      const usure = r.tauxUsureAtteint
        ? `<span style="color:var(--red);font-weight:600">⚠ Taux supérieur au taux d'usure (${(LOAN.tauxUsureFor(p.duree)*100).toFixed(2)}%) — banque refusera</span>`
        : `Taux d'usure max sur ${p.duree} ans : ${(LOAN.tauxUsureFor(p.duree)*100).toFixed(2)}%`;
      safeHtml('loan-hero-msg', `
        Avec <strong>${fmtM(p.revenusNets)}/mois</strong> de revenus nets et un endettement plafonné à <strong>${p.tauxEndettement}%</strong>,
        vous pouvez emprunter jusqu'à <strong>${fmtM(r.capitalMax)}</strong> sur ${p.duree} ans
        (mensualité <strong>${fmtM(r.mensualiteTotale)}</strong> assurance comprise).<br/>${usure}
      `);
    } else {
      // Mode mensualité (capital fixé)
      const r = LOAN.simulerPret(p);
      safeText('loan-hero-headline', fmtM(r.mensualiteTotale) + '/mois');
      safeText('loan-hero-headline-label', 'Mensualité totale (assurance incluse)');
      safeText('loan-hero-monthly', fmtM(r.mensualitePret) + ' prêt + ' + fmtM(r.mensualiteAssurance) + ' assu');
      safeText('loan-hero-duration', p.duree + ' ans');
      safeText('loan-hero-rate', fmtP(p.tauxNominal) + ' nominal');
      safeHtml('loan-hero-msg', `
        Emprunter <strong>${fmtM(p.capital)}</strong> sur <strong>${p.duree} ans</strong> à <strong>${fmtP(p.tauxNominal)}</strong>
        revient à <strong>${fmtM(r.mensualiteTotale)}/mois</strong> assurance comprise.
        Coût total du crédit : <strong>${fmtM(r.coutTotalCredit)}</strong> (intérêts ${fmtM(r.totalInterets)} + assurance ${fmtM(r.totalAssurance)}).
      `);
    }
  }

  // ─── A01 Synthèse + amortissement ─────────────────────
  function renderA01(p) {
    const sim = p.mode === 'capacite'
      ? LOAN.simulerPret({ capital: LOAN.capaciteEmprunt(p).capitalMax, duree: p.duree, tauxNominal: p.tauxNominal, assuranceRate: p.assuranceRate })
      : LOAN.simulerPret(p);

    safeText('loan-stat-pmt-pret', fmtM(sim.mensualitePret));
    safeText('loan-stat-pmt-assu', fmtM(sim.mensualiteAssurance));
    safeText('loan-stat-pmt-total', fmtM(sim.mensualiteTotale));
    safeText('loan-stat-interets', fmtM(sim.totalInterets));
    safeText('loan-stat-assurance-totale', fmtM(sim.totalAssurance));
    safeText('loan-stat-cout-credit', fmtM(sim.coutTotalCredit));
    safeText('loan-stat-cout-total', fmtM(sim.coutTotalRemboursement));
    safeText('loan-stat-taeg', fmtP(sim.taeg));

    // Tableau année par année
    const tbody = $('loan-table-yearly');
    if (tbody && sim.yearly) {
      tbody.innerHTML = sim.yearly.map(y => `
        <tr>
          <td>A${y.year}</td>
          <td class="neg">${fmtM(y.interest)}</td>
          <td class="pos">${fmtM(y.principal)}</td>
          <td>${fmtM(y.insurance)}</td>
          <td><strong>${fmtM(y.balance)}</strong></td>
        </tr>
      `).join('');
    }

    // Chart amortissement (capital restant + intérêts cumulés)
    try {
      if (window.CI && CI.drawChart && sim.yearly && sim.yearly.length > 1) {
        const labels = sim.yearly.map(y => 'A' + y.year);
        const dataBal = sim.yearly.map(y => y.balance);
        let cumInt = 0;
        const dataInt = sim.yearly.map(y => { cumInt += y.interest; return cumInt; });
        CI.safeChart('loan-chart-amort', labels, [
          { data: dataBal, color: '#059669', fill: true, fillColor: 'rgba(5,150,105,0.18)', width: 2, label: 'Capital restant dû' },
          { data: dataInt, color: '#DC2626', width: 1.8, dash: [4,3],                              label: 'Intérêts cumulés' }
        ], { xLabel: 'Année', yLabel: '€', yFormat: (v) => CI.fmtCompact(v) });
      }
    } catch (e) { console.warn('[loan a01 chart]', e); }

    safeHtml('loan-insight-a01', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1"/></svg></div><div class="insight-text">
      Sur ${p.duree} ans, vous payerez <strong class="neg">${fmtM(sim.totalInterets)}</strong> d'intérêts à la banque
      et <strong>${fmtM(sim.totalAssurance)}</strong> d'assurance.
      Coût total du crédit : <strong>${fmtM(sim.coutTotalCredit)}</strong> soit <strong>${((sim.coutTotalCredit / sim.capital) * 100).toFixed(1)}%</strong> du capital emprunté.
      TAEG approximé : <strong>${fmtP(sim.taeg)}</strong>.
    </div>`);
  }

  // ─── A02 Comparaison durées ───────────────────────────
  function renderA02(p) {
    const capital = p.mode === 'capacite' ? LOAN.capaciteEmprunt(p).capitalMax : p.capital;
    const data = LOAN.comparerDurees({ capital, tauxNominal: p.tauxNominal, assuranceRate: p.assuranceRate });

    const tbody = $('loan-table-durees');
    if (tbody) {
      const minMens = Math.min(...data.map(d => d.mensualite));
      const minInter = Math.min(...data.map(d => d.totalInterets));
      tbody.innerHTML = data.map(d => `
        <tr ${d.duree === p.duree ? 'style="background:rgba(5,150,105,0.06)"' : ''}>
          <td><strong>${d.duree} ans</strong>${d.duree === p.duree ? ' <span style="color:#059669;font-size:11px">(votre choix)</span>' : ''}</td>
          <td class="${d.mensualite === minMens ? 'pos' : ''}">${fmtM(d.mensualite)}</td>
          <td class="${d.totalInterets === minInter ? 'pos' : 'neg'}">${fmtM(d.totalInterets)}</td>
          <td><strong>${fmtM(d.coutTotalRemboursement)}</strong></td>
        </tr>
      `).join('');
    }

    try {
      if (window.CI && CI.drawChart) {
        const labels = data.map(d => d.duree + ' ans');
        const dataInter = data.map(d => d.totalInterets);
        const dataMens = data.map(d => d.mensualite * 100); // scale pour visibilité
        CI.safeChart('loan-chart-durees', labels, [
          { data: dataInter, color: '#DC2626', fill: true, fillColor: 'rgba(220,38,38,0.20)', width: 2.5, label: 'Intérêts totaux' }
        ], { xLabel: 'Durée', yLabel: '€', yFormat: (v) => CI.fmtCompact(v) });
      }
    } catch (e) { console.warn('[loan a02 chart]', e); }

    safeHtml('loan-insight-a02', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="2 9 6 5 9 8 14 3"/></svg></div><div class="insight-text">
      Allonger la durée fait baisser la mensualité mais explose les intérêts.
      Sur ${fmtM(capital)} : passer de 15 à 30 ans = <strong>+${fmtM(data[data.length-1].totalInterets - data[0].totalInterets)}</strong> d'intérêts en plus.
      La durée optimale dépend de votre situation (cashflow vs coût total).
    </div>`);
  }

  // ─── A03 Coût opération ───────────────────────────────
  function renderA03(p) {
    const op = LOAN.coutOperation(p);
    safeText('loan-stat-op-prix', fmtM(op.prixBien));
    safeText('loan-stat-op-notaire', fmtM(op.fraisNotaire));
    safeText('loan-stat-op-travaux', fmtM(op.travaux));
    safeText('loan-stat-op-total', fmtM(op.coutTotal));
    safeText('loan-stat-op-apport', fmtM(op.apport));
    safeText('loan-stat-op-emprunt', fmtM(op.aEmprunter));
    safeText('loan-stat-op-ratio', op.ratioApport.toFixed(1) + ' %');

    // Bar chart répartition
    try {
      if (window.CI && CI.drawChart) {
        const labels = ['Prix bien', 'Frais notaire', 'Travaux', 'Frais garantie+dossier'];
        const data1 = [op.prixBien, op.fraisNotaire, op.travaux, op.fraisGarantie + op.fraisDossier];
        CI.safeChart('loan-chart-op', labels, [
          { data: data1, color: '#0E9F6E', fill: true, fillColor: 'rgba(14,159,110,0.18)', width: 2 }
        ], { yFormat: (v) => CI.fmtCompact(v) });
      }
    } catch (e) { console.warn('[loan a03 chart]', e); }

    const apportLow = op.ratioApport < 10;
    safeHtml('loan-insight-a03', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 7L8 3l5 4v7H3z"/></svg></div><div class="insight-text">
      Opération totale : <strong>${fmtM(op.coutTotal)}</strong> dont <strong>${fmtM(op.fraisNotaire)}</strong> de notaire (${op.neuf ? '~2.5% neuf' : '~7.5% ancien'}).
      Apport <strong>${fmtM(op.apport)}</strong> (${op.ratioApport.toFixed(1)}%) → vous empruntez <strong>${fmtM(op.aEmprunter)}</strong>.
      ${apportLow ? '<span class="warn">⚠ Apport &lt; 10% : la plupart des banques exigent 10% minimum, hors profil premium ou primo-accédant.</span>' : '<span class="pos">✓ Apport suffisant pour la majorité des dossiers.</span>'}
    </div>`);
  }

  // ─── A04 Remboursement anticipé ───────────────────────
  function renderA04(p) {
    const capital = p.mode === 'capacite' ? LOAN.capaciteEmprunt(p).capitalMax : p.capital;
    const r = LOAN.remboursementAnticipe(
      { capital, duree: p.duree, tauxNominal: p.tauxNominal, assuranceRate: p.assuranceRate },
      p.montantAnticipe, p.moisAnticipe
    );
    if (r.error) { safeHtml('loan-insight-a04', `<div class="insight-text neg">${r.error}</div>`); return; }

    safeText('loan-stat-ra-solde-avant', fmtM(r.soldeAvant));
    safeText('loan-stat-ra-solde-apres', fmtM(r.soldeApres));
    safeText('loan-stat-ra-annees-gagnees', r.anneesGagnees.toFixed(1) + ' ans');
    safeText('loan-stat-ra-interets-economises', fmtM(r.interetsEconomises));
    safeText('loan-stat-ra-penalite', fmtM(r.penalite));

    const netSaved = r.interetsEconomises - r.penalite;
    safeHtml('loan-insight-a04', `<div class="insight-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="2 9 6 5 9 8 14 3"/></svg></div><div class="insight-text">
      Rembourser <strong>${fmtM(p.montantAnticipe)}</strong> au mois ${p.moisAnticipe} (année ${Math.ceil(p.moisAnticipe/12)})
      vous fait gagner <strong class="pos">${r.anneesGagnees.toFixed(1)} ans</strong>
      et économiser <strong class="pos">${fmtM(r.interetsEconomises)}</strong> d'intérêts.
      Après pénalité (${fmtM(r.penalite)}), gain net : <strong class="${netSaved >= 0 ? 'pos' : 'neg'}">${fmtM(netSaved)}</strong>.
      Plus le remboursement est précoce, plus le gain est grand (les intérêts sont concentrés au début).
    </div>`);
  }

  // ─── EXPORT PDF ────────────────────────────────────────
  function exportPDF() {
    if (!window.CI || !CI.exportPDF) { console.warn('CI.exportPDF non chargé'); return; }
    const p = readParams();
    const summary = p.mode === 'capacite'
      ? `Capacité d'emprunt · revenus ${fmtM(p.revenusNets)}/mois · durée ${p.duree} ans · taux ${fmtP(p.tauxNominal)} · assurance ${fmtP(p.assuranceRate)}`
      : `Prêt ${fmtM(p.capital)} · ${p.duree} ans · taux ${fmtP(p.tauxNominal)} · assurance ${fmtP(p.assuranceRate)}`;
    CI.exportPDF({
      title: 'CalcInvest — Simulateur de Prêt Immobilier',
      summary,
      sectionIds: ['result-hero', 'a1', 'a2', 'a3', 'a4'],
      fileName: 'calcinvest-pret'
    });
  }

  // ─── RUN ──────────────────────────────────────────────
  function run() {
    if (!window.LOAN || !window.FIN) {
      console.error('[loan.view] core non chargé');
      return;
    }
    const p = readParams();

    // Update summary
    safeText('loan-sum-params',
      p.mode === 'capacite'
        ? `Capacité · ${fmtM(p.revenusNets)}/mois · ${p.duree} ans · ${fmtP(p.tauxNominal)}`
        : `Prêt ${fmtM(p.capital)} · ${p.duree} ans · ${fmtP(p.tauxNominal)}`);

    try { renderHero(p); } catch (e) { console.error('[hero]', e); }
    try { renderA01(p); }  catch (e) { console.error('[a01]', e); }
    try { renderA02(p); }  catch (e) { console.error('[a02]', e); }
    try { renderA03(p); }  catch (e) { console.error('[a03]', e); }
    try { renderA04(p); }  catch (e) { console.error('[a04]', e); }

    if (window.CI && CI.setUrlParams) {
      CI.setUrlParams({
        mode: p.mode, r: p.revenusNets, c: p.charges,
        k: p.capital, d: p.duree, t: p.tauxNominal, a: p.assuranceRate,
        px: p.prixBien, ap: p.apport, tx: p.travaux
      });
    }
  }

  // ─── INIT ─────────────────────────────────────────────
  function init() {
    try {
      if (window.CI && CI.initAll) CI.initAll();

      // Toggle visibility selon mode
      const updateMode = () => {
        const mode = document.querySelector('input[name="loan-mode"]:checked')?.value || 'capacite';
        document.querySelectorAll('[data-mode]').forEach(el => {
          const visible = el.dataset.mode.split(',').includes(mode);
          el.style.display = visible ? '' : 'none';
        });
        run();
      };
      document.querySelectorAll('input[name="loan-mode"]').forEach(r => r.addEventListener('change', updateMode));
      updateMode();

      ['loan-revenus','loan-charges','loan-endettement','loan-capital','loan-duree','loan-taux','loan-assurance',
       'loan-prix-bien','loan-travaux','loan-apport','loan-anticipe-montant','loan-anticipe-mois']
        .forEach(id => {
          const el = $(id);
          if (!el) return;
          el.addEventListener('change', run);
          if (el.tagName === 'INPUT') {
            el.addEventListener('input', () => { clearTimeout(el._t); el._t = setTimeout(run, 200); });
          }
        });
      document.querySelectorAll('input[name="loan-neuf"]').forEach(r => r.addEventListener('change', run));

      const btn = $('loan-btn-calc');
      if (btn) btn.addEventListener('click', run);

      const btnPdf = $('loan-btn-pdf');
      if (btnPdf) btnPdf.addEventListener('click', exportPDF);

      if (CI && CI.attachSaveButton) {
        CI.attachSaveButton({ btnId: 'loan-btn-save', type: 'pret', getParams: readParams, defaultName: 'Mon prêt immobilier' });
      }

      setTimeout(run, 30);
    } catch (e) {
      console.error('[loan.view init]', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
