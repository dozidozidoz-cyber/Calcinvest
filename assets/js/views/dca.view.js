/* ============================================================
   CalcInvest — DCA VIEW v2
   Gère : scénarios, modes, toggles, 3 analyses implémentées
   ============================================================ */

(function () {
  'use strict';

  const { calcDCA, computeAssetStats, computeLumpVsDCA, computeVolatilityCAPE, computeMonteCarlo, computeRollingReturns, computeFiscalImpact, computeDecaissement, computeValueAveraging, monthDiff, addMonths, ymLabel } = window.CalcDCA;
  const num = window.FIN.num;

  // ---------- State ----------
  let manifest = null;
  let currentAsset = null;
  let currentData = null;
  const dataCache = {};
  let lastResult = null;
  let lastParams = null;
  let compAssetId = null;
  let compData = null;
  let fiscalTMI = 30;
  let fiscalStatut = 'seul';
  let da10Return = 7;
  let da10Horizon = 30;

  // ---------- Scénarios historiques ----------
  const SCENARIOS = [
    { id: 'aug1929', icon: '⚠', label: 'Août 1929', date: '1929-08', dd: '-84 %' },
    { id: 'mar1937', icon: '⚠', label: 'Mars 1937', date: '1937-03', dd: '-55 %' },
    { id: 'jan1973', icon: '⚠', label: 'Janv 1973', date: '1973-01', dd: '-43 %' },
    { id: 'sep1987', icon: '⚠', label: 'Sept 1987', date: '1987-09', dd: '-24 %' },
    { id: 'mar2000', icon: '⚠', label: 'Mars 2000', date: '2000-03', dd: '-42 %' },
    { id: 'oct2007', icon: '⚠', label: 'Oct 2007', date: '2007-10', dd: '-51 %' },
    { id: 'feb2020', icon: '⚠', label: 'Fév 2020', date: '2020-02', dd: '-19 %' },
    { id: 'jan2022', icon: '⚠', label: 'Janv 2022', date: '2022-01', dd: '-19 %' },
    { id: 'today', icon: '✓', label: "Aujourd'hui", date: null, dd: null },
    { id: 'custom', icon: '✎', label: 'Personnalisé', date: null, dd: null, custom: true }
  ];

  const GROUP_LABELS = {
    'index': 'Indices boursiers',
    'etf': 'ETF UCITS',
    'commodity': 'Matières premières'
  };

  /* ============================================================
     DATA LOADING
     ============================================================ */
  async function loadManifest() {
    // Cache-bust : manifest.json contrôle la liste des actifs disponibles
    // (badge SOON / actif). Doit toujours être frais, même si un vieux
    // service worker (v10-v13) le sert en cache-first.
    const res = await fetch('/assets/data/manifest.json?v=' + Date.now(), { cache: 'no-store' });
    manifest = await res.json();
  }
  async function loadData(id) {
    if (dataCache[id]) return dataCache[id];
    const res = await fetch(`/assets/data/${id}.json`);
    const data = await res.json();
    dataCache[id] = data;
    return data;
  }

  /* ============================================================
     RENDERERS - UI COMPONENTS
     ============================================================ */
  function renderScenarios() {
    const c = document.getElementById('d-scenarios');
    c.innerHTML = SCENARIOS.map((s) => `
      <button type="button" class="scenario-btn ${s.id === 'today' ? 'today' : ''}" data-id="${s.id}">
        <span class="s-icon">${s.icon}</span>
        <span class="s-label">${s.label}</span>
        ${s.dd ? `<span class="s-dd">${s.dd}</span>` : '<span class="s-dd" style="color:var(--accent)">→</span>'}
      </button>
    `).join('');
    c.querySelectorAll('.scenario-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyScenario(btn.dataset.id));
    });
  }

  function renderAssetPicker() {
    const c = document.getElementById('d-asset-picker');
    const byCat = {};
    manifest.assets.forEach((a) => {
      if (!byCat[a.category]) byCat[a.category] = [];
      byCat[a.category].push(a);
    });
    c.innerHTML = Object.keys(byCat).map((cat) => `
      <div>
        <div class="asset-group-title">${GROUP_LABELS[cat] || cat}</div>
        <div class="asset-grid">
          ${byCat[cat].map((a) => `
            <button type="button" class="asset-btn ${a.available ? '' : 'disabled'}" data-id="${a.id}" ${a.available ? '' : 'disabled'}>
              <span class="asset-dot" style="background:${a.color}"></span>
              <span class="asset-name">${a.name}</span>
              ${a.pea ? '<span class="asset-badge badge-pea">PEA</span>' : ''}
              ${!a.available ? '<span class="asset-badge badge-soon">SOON</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');
    c.querySelectorAll('.asset-btn:not(.disabled)').forEach((btn) => {
      btn.addEventListener('click', () => selectAsset(btn.dataset.id));
    });
  }

  function updatePickerActive() {
    document.querySelectorAll('.asset-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.id === (currentAsset && currentAsset.id));
    });
  }

  /* ============================================================
     ASSET & SCENARIO HANDLING
     ============================================================ */
  async function selectAsset(id) {
    const a = manifest.assets.find((x) => x.id === id);
    if (!a || !a.available) return;
    currentAsset = a;
    currentData = await loadData(id);
    updatePickerActive();
    updateFeatureToggles();
    clampDates();
    run();
  }

  function updateFeatureToggles() {
    // Dividendes : active seulement si la série a "dividends"
    const divSwitch = document.getElementById('d-opt-dividends');
    const divRow = divSwitch.parentElement;
    if (currentData && currentData.dividends) {
      divSwitch.classList.remove('disabled');
      divRow.style.opacity = '1';
      divRow.style.pointerEvents = 'auto';
    } else {
      divSwitch.classList.remove('on');
      divSwitch.classList.add('disabled');
      divRow.style.opacity = '0.5';
      divRow.style.pointerEvents = 'none';
    }
    // Inflation : idem avec cpi
    const infSwitch = document.getElementById('d-opt-inflation');
    const infRow = infSwitch.parentElement;
    if (currentData && currentData.cpi) {
      infSwitch.classList.remove('disabled');
      infRow.style.opacity = '1';
      infRow.style.pointerEvents = 'auto';
    } else {
      infSwitch.classList.remove('on');
      infSwitch.classList.add('disabled');
      infRow.style.opacity = '0.5';
      infRow.style.pointerEvents = 'none';
    }
  }

  function applyScenario(id) {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    document.querySelectorAll('.scenario-btn').forEach((b) => b.classList.toggle('active', b.dataset.id === id));

    if (!currentData) return;

    // "Personnalisé" → bascule en mode custom-range, prend toute la plage dispo
    if (s.custom) {
      setMode('custom-range');
      document.getElementById('d-start').value = currentData.start;
      document.getElementById('d-end').value = currentData.end;
      syncDurationFromRange();
      run();
      return;
    }

    // Sinon, mode durée fixe + date d'entrée du scénario
    setMode('fixed-duration');
    document.getElementById('d-duration').value = 20;

    let target;
    if (s.date) {
      target = s.date;
      if (target < currentData.start) target = currentData.start;
    } else {
      // Aujourd'hui : entrée = end - 20 ans
      target = addMonths(currentData.end, -20 * 12);
      if (target < currentData.start) target = currentData.start;
    }
    document.getElementById('d-start').value = target;
    run();
  }

  function setMode(modeId) {
    document.querySelectorAll('#d-mode button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === modeId);
    });
    updateModeInfo();
    updateModeUI();
  }

  function updateModeUI() {
    const mode = getMode();
    const endField = document.getElementById('d-end-field');
    const durStepper = document.getElementById('d-duration').closest('.field');
    if (mode === 'custom-range') {
      endField.hidden = false;
      durStepper.style.opacity = '0.55';
      durStepper.style.pointerEvents = 'none';
    } else {
      endField.hidden = true;
      durStepper.style.opacity = '';
      durStepper.style.pointerEvents = '';
    }
  }

  function syncDurationFromRange() {
    const s = document.getElementById('d-start').value;
    const e = document.getElementById('d-end').value;
    if (!s || !e) return;
    const months = monthDiff(s, e) + 1;
    if (months <= 0) return;
    document.getElementById('d-duration').value = Math.max(1, Math.round(months / 12));
    updateRangeHint();
  }

  function updateRangeHint() {
    const s = document.getElementById('d-start').value;
    const e = document.getElementById('d-end').value;
    const hint = document.getElementById('d-end-hint');
    if (!hint) return;
    if (!s || !e) { hint.textContent = 'Plage : —'; return; }
    const months = monthDiff(s, e) + 1;
    if (months <= 0) { hint.textContent = '⚠ Dates invalides'; return; }
    const yrs = (months / 12).toFixed(1);
    hint.textContent = `Plage : ${ymLabel(s)} → ${ymLabel(e)} (${yrs} ans)`;
  }

  /* ============================================================
     MODE & DEPLOYMENT
     ============================================================ */
  function getMode() {
    const btn = document.querySelector('#d-mode button.active');
    return btn ? btn.dataset.mode : 'fixed-duration';
  }
  function getDeployment() {
    const btn = document.querySelector('#d-deployment button.active');
    return btn ? btn.dataset.val : 'lump';
  }

  function updateModeInfo() {
    const mode = getMode();
    const info = document.getElementById('d-mode-info');
    const label = document.getElementById('d-date-label');
    if (mode === 'fixed-exit') {
      info.textContent = 'Sortie fixe : horizon + date de sortie = date d\'entrée recalculée';
      label.textContent = 'Date de sortie';
    } else if (mode === 'custom-range') {
      info.textContent = 'Plage perso : choisis librement entrée et sortie dans les données dispo';
      label.textContent = "Date d'entrée";
    } else {
      info.textContent = "Durée fixe : entrée + horizon définissent la sortie";
      label.textContent = "Date d'entrée";
    }
  }

  function updateDeploymentHint() {
    const dep = getDeployment();
    const el = document.getElementById('d-deployment-hint');
    el.textContent = dep === 'spread' ? 'Capital étalé uniformément sur les 12 premiers mois' : 'Capital investi entièrement au mois d\'entrée';
  }

  /* ============================================================
     DATES
     ============================================================ */
  function clampDates() {
    if (!currentData) return;
    const i = document.getElementById('d-start');
    i.min = currentData.start;
    i.max = currentData.end;
    if (!i.value || i.value < currentData.start || i.value > currentData.end) {
      i.value = addMonths(currentData.end, -20 * 12);
      if (i.value < currentData.start) i.value = currentData.start;
    }
    const e = document.getElementById('d-end');
    if (e) {
      e.min = currentData.start;
      e.max = currentData.end;
      if (!e.value || e.value < currentData.start || e.value > currentData.end) {
        e.value = currentData.end;
      }
    }
    // Show full data window in start-input hint title for discoverability
    i.title = `Données disponibles : ${currentData.start} → ${currentData.end}`;
    updateDateHint();
    updateRangeHint();
  }

  function updateDateHint() {
    const start = document.getElementById('d-start').value;
    const dur = num(document.getElementById('d-duration').value) || 20;
    const end = addMonths(start, dur * 12 - 1);
    const mode = getMode();
    const hint = document.getElementById('d-date-hint');
    if (mode === 'fixed-exit') {
      // En mode sortie fixe, on affiche l'entrée recalculée
      const entry = addMonths(start, -dur * 12 + 1);
      hint.textContent = `Entrée : ${ymLabel(entry)}`;
    } else {
      hint.textContent = `Sortie : ${ymLabel(end)}`;
    }
  }

  /* ============================================================
     CALC
     ============================================================ */
  function readForm() {
    const mode = getMode();
    let dur = num(document.getElementById('d-duration').value) || 20;
    let startDate = document.getElementById('d-start').value;
    let durationMonths = dur * 12;
    if (mode === 'fixed-exit') {
      startDate = addMonths(startDate, -dur * 12 + 1);
      if (startDate < currentData.start) startDate = currentData.start;
    } else if (mode === 'custom-range') {
      const endDate = document.getElementById('d-end').value;
      const months = monthDiff(startDate, endDate) + 1;
      if (months > 0) durationMonths = months;
    }
    return {
      assetId: currentAsset.id,
      mode,
      startDate,
      durationMonths,
      monthlyAmount: num(document.getElementById('d-monthly').value),
      initialAmount: num(document.getElementById('d-initial').value),
      deployment: getDeployment(),
      feesPct: num(document.getElementById('d-fees').value),
      cashRate: num(document.getElementById('d-cash').value),
      dividendsReinvested: document.getElementById('d-opt-dividends').classList.contains('on') && !document.getElementById('d-opt-dividends').classList.contains('disabled'),
      inflationAdjusted: document.getElementById('d-opt-inflation').classList.contains('on') && !document.getElementById('d-opt-inflation').classList.contains('disabled')
    };
  }

  /**
   * Slice currentData arrays to the form-selected window.
   * Toutes les analyses 02..06 doivent travailler sur cette fenêtre,
   * pas sur toute la série historique.
   */
  function getWindow(form) {
    if (!currentData || !form) return null;
    const startIdx = Math.max(0, monthDiff(currentData.start, form.startDate));
    const len = Math.max(2, form.durationMonths || 0);
    const endIdx = Math.min(currentData.prices.length - 1, startIdx + len - 1);
    if (endIdx <= startIdx) return null;
    const slice = (arr) => Array.isArray(arr) ? arr.slice(startIdx, endIdx + 1) : null;
    return {
      prices: slice(currentData.prices),
      dividends: slice(currentData.dividends),
      cpi: slice(currentData.cpi),
      pe10: slice(currentData.pe10),
      start: form.startDate,
      end: addMonths(form.startDate, endIdx - startIdx),
      months: endIdx - startIdx + 1
    };
  }

  function run() {
    if (!currentAsset || !currentData) return;
    const form = readForm();
    const r = calcDCA({
      prices: currentData.prices,
      dividends: currentData.dividends,
      cpi: currentData.cpi,
      seriesStart: currentData.start,
      startDate: form.startDate,
      durationMonths: form.durationMonths,
      monthlyAmount: form.monthlyAmount,
      initialAmount: form.initialAmount,
      deployment: form.deployment,
      feesPct: form.feesPct,
      cashRate: form.cashRate,
      dividendsReinvested: form.dividendsReinvested,
      inflationAdjusted: form.inflationAdjusted
    });
    if (!r || r.error) return;

    lastParams = form;
    lastResult = r;

    renderSummary(form, r);
    const renders = [renderAnalyse01, renderAnalyse02, renderAnalyse03, renderAnalyse04, renderAnalyse05, renderAnalyse06, renderAnalyse07, renderAnalyse08, renderAnalyse09, renderAnalyse10];
    renders.forEach((fn) => { try { fn(form, r); } catch (e) { console.error('[CalcInvest]', fn.name, e); } });
    updateDateHint();
    syncUrl(form);
  }

  /* ============================================================
     RENDERS
     ============================================================ */
  function renderSummary(form, r) {
    const el = document.getElementById('d-sum-params');
    el.textContent = `${currentAsset.name} · ${CI.fmtNum(form.monthlyAmount)} €/mois · ${r.durationYears.toFixed(0)} ans · ${form.startDate}`;
  }

  // ===== Analyse 01 =====
  function renderAnalyse01(form, r) {
    const curr = currentAsset.currency;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const color = (id, v) => { const el = document.getElementById(id); if (el) { el.classList.remove('pos','neg'); if (v > 0) el.classList.add('pos'); else if (v < 0) el.classList.add('neg'); } };

    set('ds-final', CI.fmtNum(r.finalValue, 0) + ' ' + curr);
    set('ds-final-real', r.inflationAdjusted ? `Pouvoir d'achat : ${CI.fmtNum(r.finalValueReal, 0)} ${curr}` : `Au ${ymLabel(addMonths(form.startDate, r.durationMonths - 1))}`);
    set('ds-invested', CI.fmtNum(r.totalInvested, 0) + ' ' + curr);
    set('ds-invested-sub', `${CI.fmtNum(form.monthlyAmount)}/mois + ${CI.fmtNum(form.initialAmount)} initial`);
    set('ds-gain', (r.finalGain >= 0 ? '+' : '') + CI.fmtNum(r.finalGain, 0) + ' ' + curr);
    set('ds-gain-pct', CI.fmtPct(r.finalGainPct, 1));
    color('ds-gain', r.finalGain);
    set('ds-tri', r.annualReturn != null ? CI.fmtPctPlain(r.annualReturn, 2) : '—');
    set('ds-cash-rate', CI.fmtPctPlain(form.cashRate, 1));
    set('ds-chart-meta', `${currentAsset.name} · ${r.durationYears.toFixed(0)} ans`);

    // Chart
    const monthly = r.series;
    const maxPoints = 300;
    const stride = Math.max(1, Math.ceil(monthly.portfolio.length / maxPoints));
    const idxs = [];
    for (let i = 0; i < monthly.portfolio.length; i += stride) idxs.push(i);
    if (idxs[idxs.length - 1] !== monthly.portfolio.length - 1) idxs.push(monthly.portfolio.length - 1);

    const labels = idxs.map((i) => addMonths(form.startDate, i).slice(0, 4));
    const pick = (arr) => idxs.map((i) => arr[i]);

    const datasets = [
      { label: 'Versé',       data: pick(monthly.invested), color: '#FBBF24', width: 1.8, dash: [4, 3] },
      { label: 'Cash',        data: pick(monthly.cash), color: '#60A5FA', width: 1.8 },
      { label: 'Sans frais',  data: pick(monthly.noFees), color: '#A78BFA', width: 1.5, dash: [2, 3] },
      { label: r.inflationAdjusted ? 'Réel (inflation)' : 'Portfolio', data: pick(r.inflationAdjusted ? monthly.real : monthly.portfolio), color: '#34D399', fill: true, width: 2.5 }
    ];

    requestAnimationFrame(() => CI.drawChart('d-chart', labels, datasets, { yFormat: (v) => CI.fmtCompact(v) }));
  }

  // ===== Analyse 03 : Stratégies de déploiement (DCA vs VA vs Lump Sum) =====
  function renderAnalyse03(form, r) {
    if (!currentData || !r) return;
    const win = getWindow(form);
    if (!win) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };
    const curr = currentAsset.currency;

    // 1) DCA = ce qui est déjà calculé par calcDCA → r
    const dcaFinal = r.finalValue;
    const dcaInv = r.totalInvested;

    // 2) Lump Sum = même montant total versé, mais TOUT au mois 1
    const lumpInitial = dcaInv; // capital initial = somme totale qui aurait été DCAée
    const lumpRes = calcDCA({
      prices: currentData.prices,
      dividends: currentData.dividends,
      cpi: null,
      seriesStart: currentData.start,
      startDate: form.startDate,
      durationMonths: form.durationMonths,
      monthlyAmount: 0,
      initialAmount: lumpInitial,
      deployment: 'lump',
      feesPct: form.feesPct,
      cashRate: 0,
      dividendsReinvested: form.dividendsReinvested,
      inflationAdjusted: false
    });

    // 3) Value Averaging
    const va = computeValueAveraging(currentData.prices, currentData.dividends || null, currentData.start, {
      startDate: form.startDate, durationMonths: form.durationMonths,
      monthlyAmount: form.monthlyAmount, initialAmount: form.initialAmount,
      feesPct: form.feesPct, dividendsReinvested: form.dividendsReinvested
    });

    if (!lumpRes || !va) return;

    const lumpFinal = lumpRes.finalValue;
    const vaFinal = va.finalValue;
    const vaInv = va.totalInvested;

    // Détermine le vainqueur
    const finals = [
      { id: 'dca', label: 'DCA', val: dcaFinal, color: '#34D399' },
      { id: 'va', label: 'Value Averaging', val: vaFinal, color: '#A78BFA' },
      { id: 'lump', label: 'Lump Sum', val: lumpFinal, color: '#F7931A' }
    ].sort((a, b) => b.val - a.val);
    const winner = finals[0];
    const runner = finals[1];
    const gap = winner.val - runner.val;
    const gapPct = (gap / runner.val) * 100;

    set('da3-winner', winner.label);
    set('da3-winner-sub', '+' + CI.fmtCompact(gap) + ' ' + curr + ' (+' + gapPct.toFixed(1) + ' % vs ' + runner.label + ')');
    const winEl = document.getElementById('da3-winner');
    if (winEl) winEl.style.color = winner.color;

    // Détails par stratégie
    const triFmt = (val) => CI.fmtCompact(val) + ' ' + curr;
    const triPct = (a, b) => b > 0 ? ((a / b - 1) * 100).toFixed(1) + ' %' : '—';

    set('da3-dca-final', triFmt(dcaFinal));
    set('da3-dca-detail', 'Versé ' + CI.fmtCompact(dcaInv) + ' · gain ' + triPct(dcaFinal, dcaInv));
    cls('da3-dca-final', winner.id === 'dca' ? 'pos' : '');

    set('da3-va-final', triFmt(vaFinal));
    set('da3-va-detail', 'Versé ' + CI.fmtCompact(vaInv) + ' · gain ' + triPct(vaFinal, vaInv));
    cls('da3-va-final', winner.id === 'va' ? 'pos' : '');

    set('da3-lump-final', triFmt(lumpFinal));
    set('da3-lump-detail', 'Versé ' + CI.fmtCompact(lumpInitial) + ' · gain ' + triPct(lumpFinal, lumpInitial));
    cls('da3-lump-final', winner.id === 'lump' ? 'pos' : '');

    set('da3-meta', `${currentAsset.name} · ${win.start} → ${win.end} · ${(form.durationMonths/12).toFixed(1)} ans`);

    requestAnimationFrame(() => drawTripleStratChart(r, va, lumpRes, form));
  }

  function drawTripleStratChart(rDca, rVa, rLump, form) {
    const canvas = document.getElementById('da3-chart');
    if (!canvas) return;
    const n = Math.min(
      rDca.series.portfolio.length,
      rVa.series.portfolio.length,
      rLump.series.portfolio.length
    );
    if (n < 2) return;
    const stride = Math.max(1, Math.ceil(n / 300));
    const idxs = [];
    for (let i = 0; i < n; i += stride) idxs.push(i);
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    const labels = idxs.map((i) => addMonths(form.startDate, i).slice(0, 4));
    CI.drawChart('da3-chart', labels, [
      // Lignes capital investi (en arrière-plan, mono dashées)
      { data: idxs.map((i) => rDca.series.invested[i]), color: '#94A3B8', width: 1, dash: [3, 3] },
      { data: idxs.map((i) => rVa.series.invested[i]), color: '#FBBF24', width: 1, dash: [3, 3] },
      // Portefeuilles (au-dessus)
      { data: idxs.map((i) => rLump.series.portfolio[i]), color: '#F7931A', width: 2 },
      { data: idxs.map((i) => rVa.series.portfolio[i]), color: '#A78BFA', width: 2 },
      { data: idxs.map((i) => rDca.series.portfolio[i]), color: '#34D399', fill: true, fillColor: 'rgba(52,211,153,0.08)', width: 2.5 }
    ], { yFormat: (v) => CI.fmtCompact(v) });
  }

  // ===== Analyse 02 : Rendements glissants (heatmap) =====
  const HEATMAP_DURATIONS = [1, 2, 3, 5, 10, 15, 20, 30];

  function lerpRGB(c1, c2, t) {
    return 'rgb(' +
      Math.round(c1[0] + (c2[0] - c1[0]) * t) + ',' +
      Math.round(c1[1] + (c2[1] - c1[1]) * t) + ',' +
      Math.round(c1[2] + (c2[2] - c1[2]) * t) + ')';
  }

  function cagrColor(cagr) {
    if (cagr === null || !isFinite(cagr)) return '#F1F4F8';
    const t = Math.max(-1, Math.min(1, cagr / 15));
    // Fond clair : on part d'un blanc cassé et on lerp vers la couleur signal
    if (t < 0) return lerpRGB([254, 242, 242], [220, 38, 38], -t);   // red-50 → red-600
    return lerpRGB([236, 253, 245], [4, 120, 87], t);                 // emerald-50 → emerald-700
  }

  function renderAnalyse02(form, r) {
    if (!currentData) return;
    const win = getWindow(form);
    if (!win) return;
    const rolling = computeRollingReturns(win.prices, win.start, HEATMAP_DURATIONS);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    // Référence : 10 ans si dispo, sinon plus long avec données
    const refDur = HEATMAP_DURATIONS.slice().reverse().find((d) => rolling.durationStats[d] && rolling.durationStats[d].count >= 3) || null;
    const dur10stats = rolling.durationStats[10];
    const refStats = dur10stats || (refDur ? rolling.durationStats[refDur] : null);
    const refLabel = dur10stats ? '10 ans' : (refDur ? refDur + ' ans' : '—');

    set('da2-dur-label', `Périodes ${refLabel} positives`);
    set('da2-best-label', `Meilleure entrée (${refLabel})`);
    set('da2-worst-label', `Pire entrée (${refLabel})`);

    if (refStats) {
      set('da2-pos10', refStats.positivePct.toFixed(0) + ' %');
      set('da2-pos10-sub', `${refStats.count} période${refStats.count > 1 ? 's' : ''} de ${refLabel}`);
      set('da2-best10', '+' + refStats.best.toFixed(1) + ' %/an');
      set('da2-best10-year', `Entrée ${refStats.bestYear}`);
      const worstSign = refStats.worst >= 0 ? '+' : '';
      set('da2-worst10', worstSign + refStats.worst.toFixed(1) + ' %/an');
      set('da2-worst10-year', `Entrée ${refStats.worstYear}`);
    }

    const safeD = HEATMAP_DURATIONS.find((d) => rolling.durationStats[d] && rolling.durationStats[d].positivePct >= 100);
    set('da2-safe', safeD ? safeD + ' ans' : '> 30 ans');

    if (rolling.entryYears.length) {
      set('da2-meta', `${win.start} → ${win.end} · ${rolling.entryYears[0]}–${rolling.entryYears[rolling.entryYears.length - 1]} · ${rolling.entryYears.length} entrées`);
    } else {
      set('da2-meta', `${win.start} → ${win.end} · plage trop courte pour des fenêtres glissantes`);
    }

    requestAnimationFrame(() => drawHeatmap(rolling));
  }

  function drawHeatmap(rolling) {
    const canvas = document.getElementById('da2-heatmap');
    if (!canvas || !rolling.entryYears.length) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(400, Math.floor(rect.width || canvas.offsetWidth || 600));
    const DURS = rolling.durations;
    const cellH = 34;
    const padL = 52, padR = 10, padT = 10, padB = 26;
    const H = padT + DURS.length * cellH + padB;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#FAFBFC';
    ctx.fillRect(0, 0, W, H);

    const years = rolling.entryYears;
    const numYears = years.length;
    const plotW = W - padL - padR;
    const cellW = plotW / numYears;

    DURS.forEach((d, di) => {
      const cy = padT + di * cellH;
      years.forEach((yr, xi) => {
        const cx = padL + xi * cellW;
        const cagr = rolling.data[yr][d];
        ctx.fillStyle = cagrColor(cagr);
        ctx.fillRect(cx, cy, Math.max(1, cellW - (cellW > 3 ? 0.5 : 0)), cellH - 1);

        if (cellW >= 30 && cagr !== null) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.font = `bold ${Math.min(10, Math.floor(cellW * 0.32))}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((cagr >= 0 ? '+' : '') + cagr.toFixed(0) + '%', cx + cellW / 2, cy + cellH / 2);
        }
      });

      ctx.fillStyle = '#94A3B8';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(d + ' ans', padL - 5, cy + cellH / 2);
    });

    // X labels
    const labelStep = Math.max(1, Math.ceil(numYears / 14));
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let xi = 0; xi < numYears; xi += labelStep) {
      const cx = padL + xi * cellW + cellW / 2;
      ctx.fillText(String(years[xi]), cx, padT + DURS.length * cellH + 4);
    }

    // Tooltip via closure
    const tooltip = document.getElementById('da2-tooltip');
    canvas.onmousemove = (e) => {
      const cr = canvas.getBoundingClientRect();
      const mx = e.clientX - cr.left;
      const my = e.clientY - cr.top;
      const xi = Math.floor((mx - padL) / cellW);
      const di = Math.floor((my - padT) / cellH);
      if (xi < 0 || xi >= numYears || di < 0 || di >= DURS.length) {
        tooltip.style.display = 'none'; return;
      }
      const yr = years[xi];
      const dur = DURS[di];
      const cagr = rolling.data[yr][dur];
      if (cagr === null) { tooltip.style.display = 'none'; return; }
      const totalGain = (Math.pow(1 + cagr / 100, dur) - 1) * 100;
      const color = cagr >= 0 ? 'var(--accent)' : 'var(--red)';
      tooltip.innerHTML =
        `<div style="color:var(--text-3);margin-bottom:5px">${yr} → ${yr + dur} · ${dur} an${dur > 1 ? 's' : ''}</div>` +
        `<div style="font-size:14px;font-weight:600;color:${color}">${cagr >= 0 ? '+' : ''}${cagr.toFixed(2)} %/an</div>` +
        `<div style="color:var(--text-3);margin-top:3px;font-size:11px">Gain total : ${cagr >= 0 ? '+' : ''}${totalGain.toFixed(0)} %</div>`;
      let tx = mx + 14, ty = my - 10;
      if (tx + 160 > cr.width) tx = mx - 170;
      if (ty < 0) ty = 4;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';
      tooltip.style.display = 'block';
    };
    canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
  }

  // ===== Analyse 04 : Rendements annuels =====
  function renderAnalyse04(form, r) {
    const win = getWindow(form);
    if (!win) return;
    const stats = computeAssetStats(win.prices, win.start);
    const s = stats.stats;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    if (s.best) {
      set('da4-best', '+' + s.best.pct.toFixed(1) + ' %');
      set('da4-best-year', s.best.year);
    }
    if (s.worst) {
      set('da4-worst', s.worst.pct.toFixed(1) + ' %');
      set('da4-worst-year', s.worst.year);
    }
    set('da4-median', (s.median >= 0 ? '+' : '') + s.median.toFixed(1) + ' %');
    set('da4-mean', `Moyenne ${s.mean >= 0 ? '+' : ''}${s.mean.toFixed(1)} %`);
    set('da4-pos', s.positivePct.toFixed(0) + ' %');
    set('da4-pos-sub', `${s.positive} sur ${s.total}`);

    if (stats.calYears.length) {
      set('da4-years-range', `${stats.calYears[0].year} → ${stats.calYears[stats.calYears.length - 1].year} · ${stats.calYears.length} ans · plage ${win.start} → ${win.end}`);
    } else {
      set('da4-years-range', `${win.start} → ${win.end} · plage trop courte`);
    }

    // Render histogram as bars (custom)
    renderYearBars(stats.calYears);
  }

  function renderYearBars(calYears) {
    const canvas = document.getElementById('da4-bars');
    if (!canvas || !calYears.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width));
    const H = Math.max(180, Math.floor(rect.height));
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const padL = 48, padR = 16, padT = 14, padB = 34;
    const w = W - padL - padR, h = H - padT - padB;

    let max = Math.max(...calYears.map((y) => y.pct));
    let min = Math.min(...calYears.map((y) => y.pct));
    max = Math.max(max, 10); min = Math.min(min, -10);
    const span = max - min;

    const yAt = (v) => padT + h - ((v - min) / span) * h;
    const zeroY = yAt(0);

    // Grid & labels
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.lineWidth = 1;
    const yTicks = [min, min / 2, 0, max / 2, max];
    yTicks.forEach((v) => {
      const y = yAt(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((v >= 0 ? '+' : '') + v.toFixed(0) + ' %', padL - 6, y);
    });

    // Bars
    const barW = Math.max(2, w / calYears.length - 1);
    calYears.forEach((y, i) => {
      const x = padL + (i / calYears.length) * w;
      const topY = yAt(Math.max(0, y.pct));
      const botY = yAt(Math.min(0, y.pct));
      ctx.fillStyle = y.pct >= 0 ? '#34D399' : '#F87171';
      ctx.fillRect(x, topY, barW, botY - topY);
    });

    // X labels (sparse)
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const tickStep = Math.max(1, Math.ceil(calYears.length / 10));
    for (let i = 0; i < calYears.length; i += tickStep) {
      const x = padL + (i / calYears.length) * w + barW / 2;
      ctx.fillText(String(calYears[i].year), x, padT + h + 6);
    }
  }

  // ===== Analyse 05 : Drawdown =====
  function renderAnalyse05(form, r) {
    const win = getWindow(form);
    if (!win) return;
    const stats = computeAssetStats(win.prices, win.start);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('da5-maxdd', '-' + stats.drawdown.maxPct.toFixed(1) + ' %');
    const ddIdx = stats.drawdown.atIdx;
    set('da5-maxdd-date', `en ${ymLabel(addMonths(win.start, ddIdx))} · plage ${win.start} → ${win.end}`);

    set('da5-simdd', '-' + r.maxDrawdownPct.toFixed(1) + ' %');
    if (r.recoveryMonths != null) {
      const yrs = Math.floor(r.recoveryMonths / 12);
      const mths = r.recoveryMonths % 12;
      set('da5-simdd-recovery', `Récupéré en ${yrs > 0 ? yrs + ' an' + (yrs > 1 ? 's ' : ' ') : ''}${mths} mois`);
    } else {
      set('da5-simdd-recovery', 'Pas encore récupéré');
    }

    // Compute drawdown series on the windowed prices
    const prices = win.prices;
    let peak = prices[0];
    const dd = prices.map((p) => { if (p > peak) peak = p; return -(peak - p) / peak * 100; });

    // Downsample
    const maxPts = 400;
    const stride = Math.max(1, Math.ceil(dd.length / maxPts));
    const sampled = [], labels = [];
    for (let i = 0; i < dd.length; i += stride) {
      sampled.push(dd[i]);
      labels.push(addMonths(win.start, i).slice(0, 4));
    }

    requestAnimationFrame(() => drawUnderwaterChart(sampled, labels));
  }

  function drawUnderwaterChart(sampled, labels) {
    const canvas = document.getElementById('da5-chart');
    if (!canvas || !sampled.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width || canvas.offsetWidth || 600));
    const H = Math.max(180, Math.floor(rect.height || 220));
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const padL = 52, padR = 14, padT = 14, padB = 30;
    const w = W - padL - padR, h = H - padT - padB;

    let yMin = Math.min(...sampled);
    let yMax = 0; // drawdown always ≤ 0
    if (yMin === yMax) yMin = -1;
    const span = yMax - yMin;
    yMin -= span * 0.05;
    yMax += span * 0.05;
    const yAt = (v) => padT + h - ((v - yMin) / (yMax - yMin)) * h;
    const xAt = (i) => padL + (sampled.length <= 1 ? w / 2 : (i / (sampled.length - 1)) * w);

    // Grid
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)'; ctx.lineWidth = 1;
    ctx.fillStyle = '#94A3B8'; ctx.font = '10px "JetBrains Mono", monospace';
    const nTicks = 5;
    for (let t = 0; t <= nTicks; t++) {
      const v = yMin + (yMax - yMin) * (t / nTicks);
      const y = yAt(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(0) + ' %', padL - 5, y);
    }

    // Zero line
    const zeroY = yAt(0);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(W - padR, zeroY); ctx.stroke();

    // Fill area under zero
    const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
    grad.addColorStop(0, 'rgba(248,113,113,0.35)');
    grad.addColorStop(1, 'rgba(248,113,113,0.04)');
    ctx.beginPath();
    sampled.forEach((v, i) => { const x = xAt(i), y = yAt(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.lineTo(xAt(sampled.length - 1), zeroY);
    ctx.lineTo(xAt(0), zeroY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    sampled.forEach((v, i) => { const x = xAt(i), y = yAt(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.strokeStyle = '#F87171'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.setLineDash([]); ctx.stroke();

    // X labels
    const tickStep = Math.max(1, Math.ceil(labels.length / 10));
    ctx.fillStyle = '#94A3B8'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '10px "JetBrains Mono", monospace';
    for (let i = 0; i < labels.length; i += tickStep) {
      ctx.fillText(String(labels[i]), xAt(i), padT + h + 5);
    }
  }

  // ===== Analyse 06 : Volatilité & CAPE =====
  function renderAnalyse06(form, r) {
    if (!currentData) return;
    const win = getWindow(form);
    if (!win) return;
    const hasCAPE = !!(win.pe10 && win.pe10.length);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    const vc = computeVolatilityCAPE(win.prices, win.start, hasCAPE ? win.pe10 : null);

    // Note CAPE
    const note = document.getElementById('da6-cape-note');
    if (note) note.style.display = hasCAPE ? 'none' : '';
    const capeCard = document.getElementById('da6-cape-card');
    if (capeCard) capeCard.style.display = hasCAPE ? '' : 'none';

    const s = vc.stats;

    // Volatilité stats
    set('da6-vol-current', s.currentVol != null ? s.currentVol.toFixed(1) + ' %' : '—');
    set('da6-vol-avg', 'Moy. historique : ' + (s.avgVol || 0).toFixed(1) + ' %');
    const volRatio = (s.avgVol > 0) ? (s.currentVol / s.avgVol) : 1;
    const volSignal = volRatio < 0.75 ? 'Calme' : volRatio < 1.25 ? 'Normal' : volRatio < 1.75 ? 'Élevée' : 'Très élevée';
    const volCls = volRatio < 0.75 ? 'pos' : volRatio < 1.25 ? 'info' : volRatio < 1.75 ? 'warn' : 'neg';
    set('da6-vol-signal', volSignal);
    set('da6-vol-signal-sub', ((volRatio - 1) * 100).toFixed(0) + ' % vs moyenne');
    cls('da6-vol-signal', volCls);
    cls('da6-vol-current', volCls);
    set('da6-vol-meta', currentAsset.name + ' · plage ' + win.start + ' → ' + win.end + ' · fenêtre 12 mois');

    // CAPE stats
    if (hasCAPE && s.currentCAPE != null && s.capeAvg != null) {
      set('da6-cape-current', s.currentCAPE.toFixed(1) + 'x');
      set('da6-cape-avg', 'Moy. historique : ' + s.capeAvg.toFixed(1) + 'x');
      const capeRatio = s.currentCAPE / s.capeAvg;
      const capePct = ((capeRatio - 1) * 100).toFixed(0);
      const capeLabel = capeRatio < 0.8 ? 'Sous-évalué' : capeRatio < 1.1 ? 'Juste valeur' : capeRatio < 1.5 ? 'Surévalué' : 'Très surévalué';
      const capeCls = capeRatio < 0.8 ? 'pos' : capeRatio < 1.1 ? 'info' : capeRatio < 1.5 ? 'warn' : 'neg';
      set('da6-valuation', capeLabel);
      set('da6-valuation-sub', (capePct >= 0 ? '+' : '') + capePct + ' % vs moyenne');
      cls('da6-valuation', capeCls);
      cls('da6-cape-current', capeCls);
      set('da6-cape-meta', 'CAPE actuel ' + s.currentCAPE.toFixed(1) + 'x · moy. ' + s.capeAvg.toFixed(1) + 'x');
    } else {
      set('da6-valuation', '—');
      set('da6-valuation-sub', 'Non disponible');
      set('da6-cape-current', '—');
    }

    // Downsample
    const maxPts = 400;
    const stride = Math.max(1, Math.ceil(vc.labels.length / maxPts));
    const sampledLabels = [], sampledVol = [], sampledCAPE = [], capeAvgLine = [];
    for (let i = 0; i < vc.labels.length; i += stride) {
      const cape = vc.capeSeries[i];
      if (hasCAPE && cape == null) continue;
      sampledLabels.push(vc.labels[i].slice(0, 4));
      sampledVol.push(vc.volSeries[i] || 0);
      if (hasCAPE) {
        sampledCAPE.push(cape || 0);
        capeAvgLine.push(s.capeAvg || 0);
      }
    }

    requestAnimationFrame(() => {
      drawVolatilityChart(sampledLabels, sampledVol);
      if (hasCAPE && sampledCAPE.length > 0) drawCAPEChart(sampledLabels, sampledCAPE, capeAvgLine);
    });
  }

  function drawVolatilityChart(labels, volData) {
    const canvas = document.getElementById('da6-vol-chart');
    if (!canvas || !volData.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width || canvas.offsetWidth || 600));
    const H = Math.max(180, Math.floor(rect.height || 220));
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    _drawLineAreaChart(ctx, W, H, labels, [
      { data: volData, color: '#A78BFA', fillColor: 'rgba(167,139,250,0.2)', lineWidth: 1.8 }
    ], (v) => v.toFixed(0) + ' %');
  }

  function drawCAPEChart(labels, capeData, avgLine) {
    const canvas = document.getElementById('da6-cape-chart');
    if (!canvas || !capeData.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width || canvas.offsetWidth || 600));
    const H = Math.max(180, Math.floor(rect.height || 220));
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    _drawLineAreaChart(ctx, W, H, labels, [
      { data: avgLine, color: '#FBBF24', lineWidth: 1.5, dash: [5, 4] },
      { data: capeData, color: '#60A5FA', fillColor: 'rgba(96,165,250,0.15)', lineWidth: 1.8 }
    ], (v) => v.toFixed(0) + 'x');
  }

  // Shared helper : draw a line+area chart on an already-sized canvas context
  function _drawLineAreaChart(ctx, W, H, labels, series, yFmt) {
    const padL = 52, padR = 14, padT = 14, padB = 30;
    const w = W - padL - padR, h = H - padT - padB;
    const n = labels.length;
    if (n < 2 || h <= 0) return;

    // Domain
    let yMin = Infinity, yMax = -Infinity;
    series.forEach((s) => s.data.forEach((v) => { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }));
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    if (yMin === yMax) yMax = yMin + 1;
    const span = yMax - yMin;
    yMin -= span * 0.05;
    yMax += span * 0.08;
    if (yMin > 0 && yMin < span * 0.2) yMin = 0;

    const xAt = (i) => padL + (i / (n - 1)) * w;
    const yAt = (v) => padT + h - ((v - yMin) / (yMax - yMin)) * h;

    // Grid
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)'; ctx.lineWidth = 1;
    ctx.fillStyle = '#94A3B8'; ctx.font = '10px "JetBrains Mono", monospace';
    for (let t = 0; t <= 5; t++) {
      const v = yMin + (yMax - yMin) * (t / 5);
      const y = yAt(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(yFmt ? yFmt(v) : v.toFixed(0), padL - 5, y);
    }

    // X labels
    const tickStep = Math.max(1, Math.ceil(n / 10));
    ctx.fillStyle = '#94A3B8'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i < n; i += tickStep) ctx.fillText(String(labels[i]), xAt(i), padT + h + 5);

    // Draw each series
    series.forEach((s) => {
      if (s.fillColor) {
        // Area fill
        const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
        grad.addColorStop(0, s.fillColor);
        grad.addColorStop(1, s.fillColor.replace(/[\d.]+\)$/, '0)'));
        ctx.beginPath();
        s.data.forEach((v, i) => { const x = xAt(i), y = yAt(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.lineTo(xAt(n - 1), yAt(yMin));
        ctx.lineTo(xAt(0), yAt(yMin));
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      // Line
      ctx.beginPath();
      s.data.forEach((v, i) => { const x = xAt(i), y = yAt(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth || 1.8;
      ctx.setLineDash(s.dash || []); ctx.lineJoin = 'round'; ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  // ===== Analyse 07 : Monte Carlo =====
  function renderAnalyse07(form, r) {
    if (!currentData) return;
    const win = getWindow(form);
    if (!win) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };
    const curr = currentAsset.currency;

    // Bootstrap des rendements UNIQUEMENT sur la fenêtre choisie par l'utilisateur,
    // pas sur toute l'histoire de l'actif.
    const mc = computeMonteCarlo(win.prices, win.dividends, {
      simulations: 1000,
      horizonYears: Math.max(1, Math.round(r.durationYears)),
      monthlyAmount: form.monthlyAmount,
      initialAmount: form.initialAmount,
      feesPct: form.feesPct,
      dividendsReinvested: form.dividendsReinvested
    });

    if (!mc) return;
    const fs = mc.finalStats;

    set('da7-n-sims', fs.simulations.toLocaleString('fr-FR'));
    set('da7-meta', currentAsset.name + ' · plage ' + win.start + ' → ' + win.end + ' · ' + Math.round(r.durationYears) + ' ans · ' + fs.simulations.toLocaleString('fr-FR') + ' simulations');

    const fmt = (v) => CI.fmtCompact(v) + ' ' + curr;
    const gainPct = (v) => ((v - fs.totalInvested) / fs.totalInvested * 100).toFixed(0) + ' %';
    const gainSign = (v) => v >= fs.totalInvested ? '+' : '';

    set('da7-p50', fmt(fs.p50));
    set('da7-p50-gain', gainSign(fs.p50) + gainPct(fs.p50) + ' vs investi');
    set('da7-p10', fmt(fs.p10));
    set('da7-p10-gain', gainSign(fs.p10) + gainPct(fs.p10) + ' vs investi');
    set('da7-p90', fmt(fs.p90));
    set('da7-p90-gain', '+' + gainPct(fs.p90) + ' vs investi');
    set('da7-prob', fs.probPositive.toFixed(0) + ' %');

    cls('da7-p50', fs.p50 >= fs.totalInvested ? 'pos' : 'neg');
    cls('da7-p10', fs.p10 >= fs.totalInvested ? 'pos' : 'neg');
    cls('da7-prob', fs.probPositive >= 80 ? 'pos' : fs.probPositive >= 50 ? 'info' : 'neg');

    requestAnimationFrame(() => drawMonteCarlo(mc, curr));
  }

  function drawMonteCarlo(mc, curr) {
    const canvas = document.getElementById('da7-chart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(400, Math.floor(rect.width || 600));
    const H = Math.max(250, Math.floor(rect.height || 300));
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const padL = 64, padR = 16, padT = 14, padB = 30;
    const w = W - padL - padR, h = H - padT - padB;

    const pd = mc.percentileData;
    const years = mc.years;
    // Prepend year 0 (initial)
    const inv0 = mc.investedLine[0] - (mc.investedLine[1] - mc.investedLine[0]);
    const allYears = [0, ...years];
    const allP10 = [mc.finalStats.totalInvested > 0 ? mc.investedLine[0] : 0, ...pd.p10];
    const allP25 = [allP10[0], ...pd.p25];
    const allP50 = [allP10[0], ...pd.p50];
    const allP75 = [allP10[0], ...pd.p75];
    const allP90 = [allP10[0], ...pd.p90];
    const allInv = [mc.investedLine[0], ...mc.investedLine];

    const allVals = [...allP10, ...allP90, ...allInv].filter(Boolean);
    const maxV = Math.max(...allVals) * 1.05;
    const minV = 0;

    const xAt = (i) => padL + (i / (allYears.length - 1)) * w;
    const yAt = (v) => padT + h - ((v - minV) / (maxV - minV)) * h;

    // Grid
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)'; ctx.lineWidth = 1;
    ctx.fillStyle = '#94A3B8'; ctx.font = '10px "JetBrains Mono", monospace';
    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const v = minV + (maxV - minV) * (t / yTicks);
      const y = yAt(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(CI.fmtCompact(v), padL - 5, y);
    }

    // Helper: draw filled band between two arrays
    const fillBand = (upper, lower, color) => {
      ctx.beginPath();
      upper.forEach((v, i) => { const x = xAt(i), y = yAt(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(xAt(i), yAt(lower[i]));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    // Helper: draw line
    const drawLine = (arr, color, width, dash) => {
      ctx.beginPath();
      arr.forEach((v, i) => { const x = xAt(i), y = yAt(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Bandes
    fillBand(allP90, allP10, 'rgba(52,211,153,0.08)');
    fillBand(allP75, allP25, 'rgba(52,211,153,0.18)');

    // Lignes percentiles
    drawLine(allP10, 'rgba(52,211,153,0.35)', 1, [3, 3]);
    drawLine(allP90, 'rgba(52,211,153,0.35)', 1, [3, 3]);
    drawLine(allP25, 'rgba(52,211,153,0.6)', 1.2);
    drawLine(allP75, 'rgba(52,211,153,0.6)', 1.2);
    drawLine(allP50, '#34D399', 2.5);

    // Capital investi
    drawLine(allInv, '#FBBF24', 1.8, [5, 4]);

    // X labels (années)
    ctx.fillStyle = '#94A3B8'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '10px "JetBrains Mono", monospace';
    allYears.forEach((yr, i) => {
      if (yr % 5 === 0) {
        ctx.fillText('an ' + yr, xAt(i), padT + h + 5);
      }
    });
  }

  // ===== Analyse 08 : Comparaison multi-actifs =====
  async function selectCompAsset(id) {
    if (id === compAssetId) {
      compAssetId = null; compData = null;
      document.querySelectorAll('#da8-picker .asset-btn').forEach((b) => b.classList.remove('active'));
      if (lastResult && lastParams) renderAnalyse08(lastParams, lastResult);
      return;
    }
    compAssetId = id;
    document.querySelectorAll('#da8-picker .asset-btn').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    compData = await loadData(id);
    if (lastResult && lastParams) run();
  }

  function renderCompPicker() {
    const c = document.getElementById('da8-picker');
    if (!c || !manifest) return;
    const byCat = {};
    manifest.assets.filter((a) => a.available).forEach((a) => {
      if (!byCat[a.category]) byCat[a.category] = [];
      byCat[a.category].push(a);
    });
    c.innerHTML = Object.keys(byCat).map((cat) => `
      <div>
        <div class="asset-group-title">${GROUP_LABELS[cat] || cat}</div>
        <div class="asset-grid">
          ${byCat[cat].map((a) => `
            <button type="button" class="asset-btn" data-id="${a.id}">
              <span class="asset-dot" style="background:${a.color}"></span>
              <span class="asset-name">${a.name}</span>
              ${a.pea ? '<span class="asset-badge badge-pea">PEA</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');
    c.querySelectorAll('.asset-btn').forEach((btn) => {
      btn.addEventListener('click', () => selectCompAsset(btn.dataset.id));
    });
  }

  function renderAnalyse08(form, r) {
    const emptyEl = document.getElementById('da8-empty');
    const contentEl = document.getElementById('da8-content');
    if (!compData || !compAssetId) {
      if (emptyEl) emptyEl.style.display = '';
      if (contentEl) contentEl.style.display = 'none';
      return;
    }

    const compAsset = manifest.assets.find((a) => a.id === compAssetId);
    const a8StartEl = document.getElementById('da8-start');
    const a8DurEl = document.getElementById('da8-duration');
    const a8StartDate = (a8StartEl && a8StartEl.value) ? a8StartEl.value : form.startDate;
    const a8DurationMonths = (a8DurEl && a8DurEl.value) ? (parseFloat(a8DurEl.value) || 10) * 12 : form.durationMonths;

    // Re-run main asset on the A8 period so comparison is on identical dates
    const r1 = calcDCA({
      prices: currentData.prices, dividends: currentData.dividends || null, cpi: null,
      seriesStart: currentData.start, startDate: a8StartDate,
      durationMonths: a8DurationMonths, monthlyAmount: form.monthlyAmount,
      initialAmount: form.initialAmount, deployment: form.deployment,
      feesPct: form.feesPct, cashRate: 0, dividendsReinvested: false, inflationAdjusted: false
    });
    const r2 = calcDCA({
      prices: compData.prices, dividends: compData.dividends || null, cpi: null,
      seriesStart: compData.start, startDate: a8StartDate,
      durationMonths: a8DurationMonths, monthlyAmount: form.monthlyAmount,
      initialAmount: form.initialAmount, deployment: form.deployment,
      feesPct: form.feesPct, cashRate: 0, dividendsReinvested: false, inflationAdjusted: false
    });

    if (!r2 || r2.error || !r2.series.portfolio.length) {
      if (emptyEl) { emptyEl.style.display = ''; emptyEl.innerHTML = '<div style="font-size:13px;color:var(--red);text-align:center">Données insuffisantes pour ' + (compAsset ? compAsset.name : 'cet actif') + ' sur cette période.</div>'; }
      if (contentEl) contentEl.style.display = 'none';
      return;
    }
    // Use r1 if it computed correctly, otherwise fall back to the full-sim r
    const ra = (r1 && !r1.error && r1.series.portfolio.length) ? r1 : r;

    if (emptyEl) emptyEl.style.display = 'none';
    if (contentEl) contentEl.style.display = '';

    const curr = currentAsset.currency;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    const win1 = ra.finalValue >= r2.finalValue;
    set('da8-l1', currentAsset.name); set('da8-l2', compAsset.name);
    set('da8-v1', CI.fmtCompact(ra.finalValue) + ' ' + curr);
    set('da8-v2', CI.fmtCompact(r2.finalValue) + ' ' + (compAsset.currency || '€'));
    set('da8-s1', 'TRI ' + (ra.annualReturn != null ? ra.annualReturn.toFixed(1) + ' %/an' : '—'));
    set('da8-s2', 'TRI ' + (r2.annualReturn != null ? r2.annualReturn.toFixed(1) + ' %/an' : '—'));
    cls('da8-v1', win1 ? 'pos' : '');
    cls('da8-v2', !win1 ? 'pos' : '');

    const tri1 = ra.annualReturn != null ? ra.annualReturn.toFixed(1) : '—';
    const tri2 = r2.annualReturn != null ? r2.annualReturn.toFixed(1) : '—';
    set('da8-cagr', tri1 + ' % vs ' + tri2 + ' %');
    set('da8-cagr-sub', currentAsset.name + ' vs ' + compAsset.name);

    const delta = ra.finalValue - r2.finalValue;
    set('da8-delta', CI.fmtCompact(Math.abs(delta)) + ' ' + curr);
    set('da8-delta-sub', (delta >= 0 ? currentAsset.name : compAsset.name) + ' surperforme');
    cls('da8-delta', delta >= 0 ? 'pos' : 'neg');
    set('da8-meta', a8StartDate + ' · ' + (a8DurationMonths / 12).toFixed(0) + ' ans · ' + CI.fmtNum(form.monthlyAmount) + '/mois');

    const leg1 = document.getElementById('da8-leg1'); if (leg1) leg1.textContent = currentAsset.name;
    const leg2 = document.getElementById('da8-leg2'); if (leg2) leg2.textContent = compAsset.name;

    // Tableau comparatif
    const tableEl = document.getElementById('da8-table');
    if (tableEl) {
      const cols = 'display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:6px;padding:5px 0';
      const head = 'color:var(--text-3);font-size:11px;border-bottom:1px solid var(--border-soft);padding-bottom:6px;margin-bottom:4px';
      const rows = [
        ['Valeur finale', CI.fmtNum(ra.finalValue, 0) + ' ' + curr, CI.fmtNum(r2.finalValue, 0) + ' ' + curr, ra.finalValue >= r2.finalValue ? 0 : 1],
        ['Capital investi', CI.fmtNum(ra.totalInvested, 0) + ' ' + curr, CI.fmtNum(r2.totalInvested, 0) + ' ' + curr, -1],
        ['Gain net', CI.fmtNum(ra.finalGain, 0) + ' ' + curr, CI.fmtNum(r2.finalGain, 0) + ' ' + curr, ra.finalGain >= r2.finalGain ? 0 : 1],
        ['TRI annualisé', tri1 + ' %', tri2 + ' %', (ra.annualReturn || 0) >= (r2.annualReturn || 0) ? 0 : 1],
        ['Drawdown max', '-' + ra.maxDrawdownPct.toFixed(1) + ' %', '-' + r2.maxDrawdownPct.toFixed(1) + ' %', ra.maxDrawdownPct <= r2.maxDrawdownPct ? 0 : 1],
      ];
      tableEl.innerHTML =
        `<div style="${cols};${head}"><span></span><span>${currentAsset.name}</span><span>${compAsset.name}</span></div>` +
        rows.map(([label, v1, v2, winner]) =>
          `<div style="${cols}"><span style="color:var(--text-3)">${label}</span><span style="color:${winner === 0 ? 'var(--accent)' : 'inherit'}">${v1}</span><span style="color:${winner === 1 ? 'var(--accent)' : 'inherit'}">${v2}</span></div>`
        ).join('');
    }

    requestAnimationFrame(() => drawComparisonChart(ra, r2, { ...form, startDate: a8StartDate, durationMonths: a8DurationMonths }));
  }

  function drawComparisonChart(r1, r2, form) {
    const canvas = document.getElementById('da8-chart');
    if (!canvas || !r1 || !r2) return;
    const n = Math.min(r1.series.portfolio.length, r2.series.portfolio.length);
    const base1 = r1.series.portfolio[0] || 1;
    const base2 = r2.series.portfolio[0] || 1;
    const stride = Math.max(1, Math.ceil(n / 300));
    const idxs = [];
    for (let i = 0; i < n; i += stride) idxs.push(i);
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    const labels = idxs.map((i) => addMonths(form.startDate, i).slice(0, 4));
    CI.drawChart('da8-chart', labels, [
      { data: idxs.map((i) => r1.series.invested[i] / base1 * 100), color: '#FBBF24', width: 1.5, dash: [4, 3] },
      { data: idxs.map((i) => r2.series.portfolio[i] / base2 * 100), color: '#60A5FA', width: 2 },
      { data: idxs.map((i) => r1.series.portfolio[i] / base1 * 100), color: '#34D399', fill: true, fillColor: 'rgba(52,211,153,0.1)', width: 2.5 }
    ], { yFormat: (v) => v.toFixed(0) });
  }

  // ===== Analyse 09 : Impact fiscal =====
  function renderAnalyse09(form, r) {
    if (!r) return;
    const fiscal = computeFiscalImpact(r.finalValue, r.totalInvested, r.durationYears, fiscalTMI, fiscalStatut);
    if (!fiscal || !fiscal.best) return;
    const curr = currentAsset.currency;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('da9-pv', '+' + CI.fmtNum(fiscal.plusValue, 0) + ' ' + curr);
    set('da9-best', fiscal.best.label);
    set('da9-best-sub', 'Net : ' + CI.fmtNum(fiscal.best.net, 0) + ' ' + curr);
    set('da9-saving', CI.fmtNum(fiscal.saving, 0) + ' ' + curr);
    set('da9-dur', r.durationYears.toFixed(0) + ' ans');
    set('da9-dur-sub', r.durationYears >= 8 ? '✓ PEA & AV actifs' : r.durationYears >= 5 ? '✓ PEA actif · AV non' : '⚠ PEA et AV non actifs');

    const cards = document.getElementById('da9-cards');
    if (cards) {
      cards.innerHTML = fiscal.scenarios.map((s) => {
        const isBest = s.id === fiscal.best.id;
        const isWorst = s.id === fiscal.worstId;
        const borderColor = isBest ? 'var(--accent)' : isWorst ? 'var(--red)' : 'var(--border-soft)';
        const badge = isBest
          ? '<span style="font-size:10px;background:var(--accent);color:#000;padding:2px 7px;border-radius:99px;font-weight:700">OPTIMAL</span>'
          : isWorst
          ? '<span style="font-size:10px;background:var(--red);color:#fff;padding:2px 7px;border-radius:99px;font-weight:700">DÉFAV.</span>'
          : '';
        return `<div style="background:var(--bg-elev);border:2px solid ${borderColor};border-radius:var(--r);padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:13px;font-weight:600;color:${isBest ? 'var(--accent)' : 'var(--text-1)'}">${s.label}</div>
            ${badge}
          </div>
          <div style="font-size:22px;font-weight:700;color:${isBest ? 'var(--accent)' : 'var(--text-1)'}">
            ${CI.fmtNum(s.net, 0)} <span style="font-size:13px;font-weight:400">${curr}</span>
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px">
            Impôts : ${CI.fmtNum(s.tax, 0)} ${curr} · Taux eff. : ${(s.effectiveRate * 100).toFixed(1)} %
          </div>
          <div style="font-size:11px;color:var(--text-4);margin-top:6px;font-style:italic">${s.condNote}</div>
        </div>`;
      }).join('');
    }
  }

  // ===== Analyse 10 : Plan de décaissement =====
  function renderAnalyse10(form, r) {
    if (!r) return;
    const curr = currentAsset.currency;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = 'stat-value ' + c; };

    const dc = computeDecaissement(r.finalValue, { rates: [0.03, 0.04, 0.05, 0.06], horizonYears: da10Horizon, annualReturn: da10Return, inflation: 0.02 });

    set('da10-capital', CI.fmtCompact(dc.capital) + ' ' + curr);
    set('da10-swr4', CI.fmtNum(dc.results[1].monthly, 0) + ' ' + curr + '/mois');
    set('da10-perp', dc.perpetualMonthly > 0 ? CI.fmtNum(dc.perpetualMonthly, 0) + ' ' + curr + '/mois' : '0 €/mois');
    set('da10-perp-sub', 'Rend. ' + da10Return + ' % − infl. 2 %');

    const r5 = dc.results[2];
    if (r5.depleted) {
      set('da10-dur5', r5.depletedYear + ' ans'); cls('da10-dur5', 'neg');
      set('da10-dur5-sub', 'Capital épuisé · retrait ' + CI.fmtNum(r5.monthly, 0) + ' €/mois');
    } else {
      set('da10-dur5', '> 30 ans'); cls('da10-dur5', 'pos');
      set('da10-dur5-sub', 'Capital restant : ' + CI.fmtCompact(r5.finalValue) + ' ' + curr);
    }

    set('da10-meta', CI.fmtCompact(dc.capital) + ' ' + curr + ' · rend. ' + da10Return + ' %/an');
    requestAnimationFrame(() => drawDecaissementChart(dc, curr));
  }

  function drawDecaissementChart(dc, curr) {
    const canvas = document.getElementById('da10-chart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(400, Math.floor(rect.width || canvas.offsetWidth || 600));
    const H = Math.max(250, Math.floor(rect.height || 280));
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const COLORS = ['#34D399', '#60A5FA', '#FBBF24', '#F87171'];
    const padL = 64, padR = 16, padT = 14, padB = 30;
    const w = W - padL - padR, h = H - padT - padB;

    const allVals = dc.results.flatMap((r) => r.yearly).filter((v) => v > 0);
    const maxV = Math.max(dc.capital, ...allVals) * 1.06;
    const minV = 0;
    const horizon = dc.horizonYears || da10Horizon;
    const xAt = (yr) => padL + (yr / horizon) * w;
    const yAt = (v) => padT + h - ((v - minV) / (maxV - minV)) * h;

    // Grid
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)'; ctx.lineWidth = 1;
    ctx.fillStyle = '#94A3B8'; ctx.font = '10px "JetBrains Mono", monospace';
    for (let t = 0; t <= 5; t++) {
      const v = minV + (maxV - minV) * (t / 5);
      const y = yAt(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(CI.fmtCompact(v), padL - 5, y);
    }
    // X labels
    const step = horizon <= 20 ? 4 : horizon <= 30 ? 5 : 10;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let yr = 0; yr <= horizon; yr += step) {
      ctx.fillText('an ' + yr, xAt(yr), padT + h + 5);
    }

    // Draw each rate series
    dc.results.forEach((res, ri) => {
      ctx.beginPath();
      res.yearly.forEach((v, yi) => {
        const x = xAt(yi), y = yAt(v);
        yi === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = COLORS[ri]; ctx.lineWidth = ri === 1 ? 2.5 : 1.8;
      ctx.setLineDash(ri === 1 ? [] : [5, 3]); ctx.lineJoin = 'round'; ctx.stroke();
      ctx.setLineDash([]);

      // Depletion marker
      if (res.depleted && res.depletedYear) {
        const x = xAt(res.depletedYear);
        ctx.beginPath(); ctx.arc(x, yAt(0), 4, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[ri]; ctx.fill();
      }
    });
  }

  /* ============================================================
     URL state
     ============================================================ */
  function syncUrl(form) {
    CI.setUrlParams({
      asset: form.assetId,
      start: form.startDate,
      dur: Math.round(form.durationMonths / 12),
      monthly: form.monthlyAmount,
      initial: form.initialAmount,
      mode: form.mode,
      dep: form.deployment,
      fees: form.feesPct,
      cash: form.cashRate,
      divs: form.dividendsReinvested ? 1 : 0,
      infl: form.inflationAdjusted ? 1 : 0
    });
  }

  /* ============================================================
     PUBLIC ACTIONS
     ============================================================ */
  window.runDCA = run;
  window.shareDCA = () => { if (lastParams) syncUrl(lastParams); CI.copyShareUrl(); };
  window.printDCA = () => window.print();
  window.resetDCA = () => { window.location.search = ''; };
  window.saveDCA = () => {
    if (!lastResult) return CI.toast("Lance un calcul d'abord", 'error');
    CI.promptSave('DCA', lastParams, `DCA ${currentAsset.name}`, () => {});
  };

  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    await loadManifest();
    renderScenarios();
    renderAssetPicker();
    renderCompPicker();
    CI.initAll();

    // A8 — période de comparaison
    ['da8-start', 'da8-duration'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { if (lastResult && lastParams) renderAnalyse08(lastParams, lastResult); });
    });

    // A9 — profil fiscal
    const tmiEl = document.getElementById('da9-tmi');
    if (tmiEl) tmiEl.addEventListener('change', () => {
      fiscalTMI = parseInt(tmiEl.value, 10) || 30;
      if (lastResult && lastParams) renderAnalyse09(lastParams, lastResult);
    });
    document.querySelectorAll('#da9-fiscal-statut button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#da9-fiscal-statut button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        fiscalStatut = b.dataset.val;
        if (lastResult && lastParams) renderAnalyse09(lastParams, lastResult);
      });
    });

    // A10 — horizon + rendement
    document.querySelectorAll('#da10-horizon button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#da10-horizon button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        da10Horizon = parseInt(b.dataset.val, 10) || 30;
        if (lastResult && lastParams) renderAnalyse10(lastParams, lastResult);
      });
    });
    const da10El = document.getElementById('da10-return');
    if (da10El) {
      da10El.addEventListener('input', () => {
        da10Return = parseFloat(da10El.value) || 7;
        if (lastResult && lastParams) renderAnalyse10(lastParams, lastResult);
      });
    }

    // Wire toggle rows
    document.querySelectorAll('[data-toggle]').forEach((row) => {
      row.addEventListener('click', () => {
        const sw = document.getElementById(row.dataset.toggle);
        if (sw.classList.contains('disabled')) return;
        sw.classList.toggle('on');
        run();
      });
    });

    // Mode toggle
    document.querySelectorAll('#d-mode button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#d-mode button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        updateModeInfo();
        updateModeUI();
        if (b.dataset.mode === 'custom-range') {
          // Reset range to full data window when entering custom mode
          if (currentData) {
            document.getElementById('d-start').value = currentData.start;
            document.getElementById('d-end').value = currentData.end;
            syncDurationFromRange();
          }
        }
        run();
      });
    });
    // End-date input (custom-range only)
    const endEl = document.getElementById('d-end');
    if (endEl) {
      endEl.addEventListener('change', () => {
        syncDurationFromRange();
        run();
      });
    }
    // Start-date sync in custom mode
    document.getElementById('d-start').addEventListener('change', () => {
      if (getMode() === 'custom-range') syncDurationFromRange();
    });
    document.querySelectorAll('#d-deployment button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#d-deployment button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        updateDeploymentHint();
        run();
      });
    });

    // Load URL state
    const urlAsset = CI.getUrlParam('asset') || 'sp500';
    const start = CI.getUrlParam('start');
    const dur = CI.getUrlParam('dur');
    const monthly = CI.getUrlParam('monthly');
    const initial = CI.getUrlParam('initial');

    if (monthly != null) document.getElementById('d-monthly').value = monthly;
    if (initial != null) document.getElementById('d-initial').value = initial;
    if (dur != null) document.getElementById('d-duration').value = dur;
    if (CI.getUrlParam('fees') != null) document.getElementById('d-fees').value = CI.getUrlParam('fees');
    if (CI.getUrlParam('cash') != null) document.getElementById('d-cash').value = CI.getUrlParam('cash');

    let initId = urlAsset;
    if (!manifest.assets.find((a) => a.id === initId && a.available)) {
      initId = manifest.assets.find((a) => a.available).id;
    }
    await selectAsset(initId);
    if (start) document.getElementById('d-start').value = start;
    clampDates();

    // Initialise la période A8 sur les valeurs du scénario principal
    const da8StartEl = document.getElementById('da8-start');
    const da8DurEl = document.getElementById('da8-duration');
    if (da8StartEl) da8StartEl.value = document.getElementById('d-start').value || '';
    if (da8DurEl) da8DurEl.value = document.getElementById('d-duration').value || '10';

    updateModeInfo();
    updateModeUI();
    updateDeploymentHint();

    // Bind inputs → run
    document.querySelectorAll('#page-dca input, #page-dca select').forEach((el) => {
      if (el.closest('.asset-picker')) return;
      el.addEventListener('input', run);
      el.addEventListener('change', run);
    });

    run();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('resize', () => lastResult && lastParams && run());
})();
