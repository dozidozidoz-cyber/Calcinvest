/* ============================================================
   CalcInvest — View Backtest Entrée / Sortie
   Binding DOM de core/calc-entry-exit.js (ENTRYEXIT).
   Données : assets/data/daily/{id}.json (préchargées) ou
   /api/daily?symbol=XXX (n'importe quel ticker Yahoo).
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const EE = window.ENTRYEXIT;

  // Ordre d'affichage des actifs préchargés (les autres suivent)
  const PREFERRED = ['sp500', 'nasdaq', 'msci_world', 'cac40', 'nikkei', 'cw8', 'eimi', 'paeem', 'gold', 'silver', 'oil_brent', 'btc', 'eth', 'sol'];
  const SHORT = { sp500: 'S&P 500', nasdaq: 'Nasdaq', msci_world: 'MSCI World', cac40: 'CAC 40', nikkei: 'Nikkei', cw8: 'CW8', eimi: 'EIMI', paeem: 'Euro Stoxx 50', panx: 'PANX', cspx: 'CSPX', gold: 'Or', silver: 'Argent', oil_brent: 'Brent', oil_wti: 'WTI', btc: 'Bitcoin', eth: 'Ether', sol: 'Solana', bnb: 'BNB', xrp: 'XRP' };
  const TICKER_RE = /^[A-Z0-9.\-^=]{1,15}$/;

  const cache = new Map();
  let seriesIndex = [];
  let state = { asset: 'sp500', ticker: null };
  let current = null;   // série chargée
  let loadToken = 0;
  let runTimer = null;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x, d) => Number.isFinite(x) ? (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d == null ? 1 : d).replace('.', ',') + ' %' : '—';
  const pctPlain = x => Number.isFinite(x) ? Math.round(x * 100) + ' %' : '—';
  const months = m => Number.isFinite(m) ? (m < 1 ? Math.round(m * 30) + ' j' : m.toFixed(1).replace('.', ',') + ' mois') : '—';
  const cls = x => Number.isFinite(x) ? (x >= 0 ? 'ee-pos' : 'ee-neg') : '';

  function setStatus(msg, isErr) {
    const el = $('ee-status');
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
  }

  /* ─── Données ─────────────────────────────────────────────── */

  async function fetchJson(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    let body = null;
    try { body = await r.json(); } catch (_) { /* corps non JSON */ }
    if (!r.ok) throw new Error((body && body.error) || ('Erreur ' + r.status));
    return body;
  }

  async function loadSeries() {
    const key = state.ticker ? 't:' + state.ticker : 'a:' + state.asset;
    if (cache.has(key)) return cache.get(key);
    const data = state.ticker
      ? await fetchJson('/api/daily?symbol=' + encodeURIComponent(state.ticker))
      : await fetchJson('/assets/data/daily/' + encodeURIComponent(state.asset) + '.json');
    if (!data || !Array.isArray(data.c) || !data.c.length) throw new Error('Données vides');
    cache.set(key, data);
    return data;
  }

  async function select(next) {
    const previous = current ? state : null;
    state = next;
    const token = ++loadToken;
    renderAssetPills();
    setStatus(state.ticker ? 'Chargement de ' + state.ticker + '…' : '');
    try {
      const data = await loadSeries();
      if (token !== loadToken) return;
      current = data;
      const name = data.meta && data.meta.name ? data.meta.name : (state.ticker || state.asset);
      setStatus(name + ' · ' + data.points.toLocaleString('fr-FR') + ' séances du ' + CI.fmtDate(data.start) + ' au ' + CI.fmtDate(data.end) + (data.meta && data.meta.currency ? ' · ' + data.meta.currency : ''));
      run();
    } catch (e) {
      if (token !== loadToken) return;
      if (previous) {
        // On garde l'actif précédent affiché : seul le message d'erreur change
        state = previous;
        renderAssetPills();
        const prevLabel = previous.ticker || SHORT[previous.asset] || previous.asset;
        setStatus(e.message + ' — résultats affichés : ' + prevLabel + '.', true);
      } else {
        current = null;
        setStatus(e.message, true);
        $('ee-summary').textContent = 'Aucune donnée à analyser.';
      }
    }
  }

  /* ─── Contrôles ───────────────────────────────────────────── */

  function renderAssetPills() {
    const ids = PREFERRED.filter(id => seriesIndex.some(s => s.id === id));
    $('ee-asset-pills').innerHTML = ids.map(id =>
      `<button class="pill${!state.ticker && state.asset === id ? ' active' : ''}" data-value="${esc(id)}" type="button">${esc(SHORT[id] || id)}</button>`
    ).join('') + (state.ticker ? `<button class="pill active" type="button" disabled>${esc(state.ticker)}</button>` : '');
  }

  function renderEntryPills() {
    const cur = $('ee-entry').value;
    $('ee-entry-pills').innerHTML = EE.ENTRY_RULES.map(r =>
      `<button class="pill${r.key === cur ? ' active' : ''}" data-value="${r.key}" type="button">${esc(r.label)}</button>`
    ).join('');
    updateEntryDesc();
  }

  function updateEntryDesc() {
    const r = EE.ENTRY_RULES.find(x => x.key === $('ee-entry').value);
    let txt = r ? r.desc : '';
    if ($('ee-tf').value === 'daily') txt = txt.replace(' (40 semaines)', '');
    else txt = txt.replace('200 jours (40 semaines)', '40 semaines');
    $('ee-entry-desc').textContent = txt;
  }

  function params() {
    return {
      timeframe: $('ee-tf').value === 'daily' ? 'daily' : 'weekly',
      entryRule: $('ee-entry').value,
      k: Math.min(10, Math.max(0.5, parseFloat($('ee-k').value) || 3)),
      horizonMonths: parseFloat($('ee-h').value) || 12,
      feePct: Math.min(2, Math.max(0, parseFloat($('ee-fee').value) || 0))
    };
  }

  function scheduleRun() {
    clearTimeout(runTimer);
    runTimer = setTimeout(run, 150);
  }

  /* ─── Calcul + rendu ──────────────────────────────────────── */

  function run() {
    if (!current) return;
    const p = params();
    updateEntryDesc();
    CI.setUrlParams({
      a: state.ticker ? null : state.asset, t: state.ticker || null,
      tf: p.timeframe, e: p.entryRule, k: p.k, h: p.horizonMonths, f: p.feePct
    });
    const label = state.ticker || SHORT[state.asset] || state.asset;
    const entryLbl = (EE.ENTRY_RULES.find(r => r.key === p.entryRule) || {}).label;
    $('ee-sum').textContent = `${label} · ${entryLbl} · ${EE.TIMEFRAMES[p.timeframe].label} · stop ${String(p.k).replace('.', ',')} ATR · ${p.horizonMonths} mois · frais ${String(p.feePct).replace('.', ',')} %`;

    const r = EE.run(current, p);
    if (r.error) {
      $('ee-summary').textContent = r.error;
      $('ee-cards').innerHTML = '';
      $('ee-tbody').innerHTML = '';
      $('ee-cards-meta').textContent = '—';
      $('ee-chart-meta').textContent = '—';
      $('ee-legend').innerHTML = '';
      $('ee-warn').style.display = 'none';
      clearChart();
      return;
    }
    renderSummary(r, label, entryLbl);
    renderCards(r);
    renderChart(r);
    renderTable(r);
  }

  function renderSummary(r, label, entryLbl) {
    const s = r.byExit;
    const hold = s.hold;
    const warn = $('ee-warn');
    if (!hold.n) {
      $('ee-summary').innerHTML = `La règle « ${esc(entryLbl)} » ne s'est jamais déclenchée sur ${esc(label)} entre ${CI.fmtDate(r.firstEntry)} et ${CI.fmtDate(r.lastEntry)}.`;
      warn.style.display = 'none';
      return;
    }
    const best = EE.EXIT_RULES.reduce((a, ex) => (s[ex.key].median > s[a.key].median ? ex : a), EE.EXIT_RULES[0]);
    const safest = EE.EXIT_RULES.reduce((a, ex) => (s[ex.key].p5 > s[a.key].p5 ? ex : a), EE.EXIT_RULES[0]);
    $('ee-summary').innerHTML =
      `Sur <strong>${hold.n.toLocaleString('fr-FR')} entrées</strong> simulées entre ${CI.fmtDate(r.firstEntry)} et ${CI.fmtDate(r.lastEntry)}, ` +
      `conserver ${r.horizonMonths >= 12 ? Math.round(r.horizonMonths / 12) + ' an' + (r.horizonMonths >= 24 ? 's' : '') : Math.round(r.horizonMonths) + ' mois'} a donné un gain médian de <strong class="${cls(hold.median)}">${pct(hold.median)}</strong>, ` +
      `avec ${pctPlain(hold.pctLoss)} d'entrées perdantes et une baisse maximale médiane de <strong class="ee-neg">${pct(hold.medianMaxDD)}</strong> en cours de route. ` +
      `Meilleur gain médian : <strong>${esc(best.label)}</strong> (${pct(s[best.key].median)}). ` +
      `Pire 5 % le moins mauvais : <strong>${esc(safest.label)}</strong> (${pct(s[safest.key].p5)}).`;
    const indepYears = r.years;
    if (hold.n < 30 || indepYears < 5) {
      warn.textContent = hold.n < 30
        ? `⚠ Seulement ${hold.n} entrées : trop peu pour conclure.`
        : `⚠ ${indepYears.toFixed(1).replace('.', ',')} ans d'entrées seulement : cela ne fait que quelques périodes réellement indépendantes. Le résultat dépend surtout d'un ou deux épisodes de marché.`;
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }
  }

  function renderCards(r) {
    $('ee-cards-meta').textContent = `${r.byExit.hold.n.toLocaleString('fr-FR')} entrées · horizon ${r.horizon} barres`;
    $('ee-cards').innerHTML = EE.EXIT_RULES.map(ex => {
      const s = r.byExit[ex.key];
      const desc = ex.key === 'hold' ? ex.desc : ex.desc.replace('k × ATR', String(r.k).replace('.', ',') + ' × ATR');
      if (!s.n) return `<div class="ee-card"><div class="ee-card-head"><span class="ee-dot" style="background:${ex.color}"></span>${esc(ex.label)}</div><div class="ee-card-desc">${esc(desc)}</div><div style="color:var(--text-4);font-size:12px">Aucune entrée</div></div>`;
      return `<div class="ee-card">
        <div class="ee-card-head"><span class="ee-dot" style="background:${ex.color}"></span>${esc(ex.label)}</div>
        <div class="ee-card-desc">${esc(desc)}</div>
        <div class="ee-stats">
          <div><div class="lbl">Gain médian</div><div class="val ${cls(s.median)}">${pct(s.median)}</div></div>
          <div><div class="lbl">Gain moyen</div><div class="val ${cls(s.mean)}">${pct(s.mean)}</div></div>
          <div><div class="lbl">Perdants</div><div class="val">${pctPlain(s.pctLoss)}</div></div>
          <div><div class="lbl">Pire 5 %</div><div class="val ee-neg">${pct(s.p5)}</div></div>
          <div><div class="lbl">Durée moyenne</div><div class="val">${months(s.avgMonths)}</div></div>
          <div><div class="lbl">Par mois investi</div><div class="val ${cls(s.perMonthInvested)}">${pct(s.perMonthInvested, 2)}</div></div>
          <div><div class="lbl">Baisse max médiane</div><div class="val ee-neg">${pct(s.medianMaxDD)}</div></div>
          <div><div class="lbl">Pire trade</div><div class="val ee-neg">${pct(s.worst)}</div></div>
        </div>
      </div>`;
    }).join('');
  }

  function clearChart() {
    const c = $('ee-chart');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  }

  function renderChart(r) {
    const t = r.timeline;
    if (!t.dates.length) {
      clearChart();
      $('ee-chart-meta').textContent = 'Aucune entrée';
      $('ee-legend').innerHTML = '';
      return;
    }
    // Sous-échantillonnage pour garder le graphique lisible (≤ 600 points)
    const stride = Math.max(1, Math.ceil(t.dates.length / 600));
    const idx = [];
    for (let i = 0; i < t.dates.length; i += stride) idx.push(i);
    const labels = idx.map(i => t.dates[i].slice(0, 7));
    const datasets = EE.EXIT_RULES.map(ex => ({
      label: ex.label,
      data: idx.map(i => t[ex.key][i]),
      color: ex.color,
      width: ex.key === 'hold' ? 2 : 1.4
    }));
    CI.drawChart('ee-chart', labels, datasets, { yFormat: v => (v >= 0 ? '+' : '') + Math.round(v) + ' %' });
    $('ee-chart-meta').textContent = t.dates.length.toLocaleString('fr-FR') + ' entrées' + (stride > 1 ? ' (1 sur ' + stride + ' affichée)' : '');
    $('ee-legend').innerHTML = EE.EXIT_RULES.map(ex =>
      `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:3px;background:${ex.color};border-radius:2px"></span>${esc(ex.label)}</span>`
    ).join('');
  }

  function renderTable(r) {
    const cur = r.entryRule;
    $('ee-tbody').innerHTML = EE.ENTRY_RULES.map(en => {
      const row = r.byEntry[en.key];
      const n = row.hold.n;
      const cell = st => st.n ? `<span class="${cls(st.median)}" style="font-weight:600">${pct(st.median)}</span><span class="sub">${pctPlain(st.pctLoss)} perdants</span>` : '—';
      return `<tr data-entry="${en.key}" class="${en.key === cur ? 'is-active' : ''}" tabindex="0">
        <td><strong>${esc(en.label)}</strong></td>
        <td>${n ? n.toLocaleString('fr-FR') : '0'}${n && n < 30 ? '<span class="sub">trop peu</span>' : ''}</td>
        ${EE.EXIT_RULES.map(ex => '<td>' + cell(row[ex.key]) + '</td>').join('')}
        <td>${n ? '<span class="ee-neg">' + pct(row.hold.medianMaxDD) + '</span>' : '—'}</td>
      </tr>`;
    }).join('');
  }

  function pickEntry(key) {
    $('ee-entry').value = key;
    $('ee-entry').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelectorAll('#ee-entry-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.value === key));
  }

  /* ─── Init ────────────────────────────────────────────────── */

  function applyUrl() {
    const g = k => CI.getUrlParam(k);
    const tf = g('tf'), e = g('e'), k = parseFloat(g('k')), h = g('h'), f = parseFloat(g('f'));
    if (tf === 'daily' || tf === 'weekly') $('ee-tf').value = tf;
    if (EE.ENTRY_RULES.some(r => r.key === e)) $('ee-entry').value = e;
    if (Number.isFinite(k) && k >= 0.5 && k <= 10) $('ee-k').value = k;
    if (['3', '6', '12', '24'].includes(h)) $('ee-h').value = h;
    if (Number.isFinite(f) && f >= 0 && f <= 2) $('ee-fee').value = f;
    const t = (g('t') || '').toUpperCase();
    if (TICKER_RE.test(t)) return { asset: null, ticker: t };
    const a = g('a');
    if (a && seriesIndex.some(s => s.id === a)) return { asset: a, ticker: null };
    return { asset: 'sp500', ticker: null };
  }

  function syncPillsToInputs() {
    ['ee-tf', 'ee-k', 'ee-h', 'ee-fee'].forEach(id => {
      const v = String($(id).value);
      document.querySelectorAll(`.pills[data-target="${id}"] .pill`).forEach(b => b.classList.toggle('active', String(b.dataset.value) === v));
    });
  }

  async function init() {
    try {
      const idx = await fetchJson('/assets/data/daily/series.json');
      seriesIndex = idx.series || [];
    } catch (e) {
      setStatus('Liste des actifs indisponible : ' + e.message, true);
    }
    const start = applyUrl();
    renderEntryPills();
    if (window.CI && CI.initAll) CI.initAll();
    syncPillsToInputs();

    $('ee-asset-pills').addEventListener('click', e => {
      const b = e.target.closest('.pill[data-value]');
      if (!b) return;
      $('ee-ticker').value = '';
      select({ asset: b.dataset.value, ticker: null });
    });
    $('ee-ticker-form').addEventListener('submit', e => {
      e.preventDefault();
      const t = $('ee-ticker').value.trim().toUpperCase().replace(/\s/g, '');
      if (!TICKER_RE.test(t)) { setStatus('Ticker invalide. Exemples : AAPL, MC.PA (Paris), 0388.HK (Hong Kong), BTC-USD.', true); return; }
      select({ asset: null, ticker: t });
    });
    ['ee-entry', 'ee-tf', 'ee-k', 'ee-h', 'ee-fee'].forEach(id => $(id).addEventListener('input', scheduleRun));
    $('ee-tbody').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-entry]');
      if (tr) pickEntry(tr.dataset.entry);
    });
    $('ee-tbody').addEventListener('keydown', e => {
      const tr = e.target.closest('tr[data-entry]');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickEntry(tr.dataset.entry); }
    });
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(run, 200); });

    if (start.ticker) $('ee-ticker').value = start.ticker;
    select(start);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
