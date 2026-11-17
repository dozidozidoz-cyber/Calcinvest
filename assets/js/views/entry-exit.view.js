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

  // Ordre d'affichage des actifs préchargés
  const PREFERRED = ['sp500', 'nasdaq', 'msci_world', 'cac40', 'nikkei', 'cw8', 'eimi', 'paeem', 'gold', 'silver', 'oil_brent', 'btc', 'eth', 'sol'];
  const SHORT = { sp500: 'S&P 500', nasdaq: 'Nasdaq', msci_world: 'MSCI World', cac40: 'CAC 40', nikkei: 'Nikkei', cw8: 'CW8', eimi: 'EIMI', paeem: 'Euro Stoxx 50', panx: 'PANX', cspx: 'CSPX', gold: 'Or', silver: 'Argent', oil_brent: 'Brent', oil_wti: 'WTI', btc: 'Bitcoin', eth: 'Ether', sol: 'Solana', bnb: 'BNB', xrp: 'XRP' };
  const TICKER_RE = /^[A-Z0-9.\-^=]{1,15}$/;
  const HORIZON_LABEL = { 0.25: '1 sem.', 0.5: '2 sem.', 1: '1 mois', 3: '3 mois', 6: '6 mois', 12: '1 an', 24: '2 ans' };
  const STYLE_DESC = {
    position: 'Tenue de plusieurs mois ; filtres de tendance et achats sur repli.',
    swing: 'Tenue de quelques jours à quelques semaines ; RSI 2, cassures, objectif en R.'
  };
  const MODE_DESC = {
    dist: 'Chaque signal est un trade isolé : statistiques de la règle.',
    capital: 'Un seul capital, une position à la fois, gains réinvestis : comparaison avec l\'achat-conservation.'
  };
  const BH_COLOR = '#111827';

  const cache = new Map();
  let seriesIndex = [];
  let state = { asset: 'sp500', ticker: null };
  let current = null;
  let loadToken = 0;
  let runTimer = null;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (x, d) => x.toFixed(d).replace('.', ',');
  const pct = (x, d) => Number.isFinite(x) ? (x >= 0 ? '+' : '−') + num(Math.abs(x * 100), d == null ? 1 : d) + ' %' : '—';
  const pctPlain = x => Number.isFinite(x) ? Math.round(x * 100) + ' %' : '—';
  const rFmt = x => Number.isFinite(x) ? (x >= 0 ? '+' : '−') + num(Math.abs(x), 2) + ' R' : '—';
  const months = m => !Number.isFinite(m) ? '—' : m < 1 ? Math.max(1, Math.round(m * 21)) + ' séances' : num(m, 1) + ' mois';
  const money = x => Number.isFinite(x) ? Math.round(x).toLocaleString('fr-FR') + ' €' : '—';
  const cls = x => Number.isFinite(x) ? (x >= 0 ? 'ee-pos' : 'ee-neg') : '';
  const exitDesc = (ex, k) => ex.desc.replace(/k × ATR/g, num(k, k % 1 ? 1 : 0) + ' × ATR');

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

  const styleKey = () => ($('ee-style').value === 'swing' ? 'swing' : 'position');

  function renderAssetPills() {
    const ids = PREFERRED.filter(id => seriesIndex.some(s => s.id === id));
    $('ee-asset-pills').innerHTML = ids.map(id =>
      `<button class="pill${!state.ticker && state.asset === id ? ' active' : ''}" data-value="${esc(id)}" type="button">${esc(SHORT[id] || id)}</button>`
    ).join('') + (state.ticker ? `<button class="pill active" type="button" disabled>${esc(state.ticker)}</button>` : '');
  }

  function renderStyleControls() {
    const st = EE.STYLES[styleKey()];
    document.querySelectorAll('#ee-style-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.value === styleKey()));
    $('ee-style-desc').textContent = STYLE_DESC[styleKey()];
    if (!st.entries.includes($('ee-entry').value)) $('ee-entry').value = 'all';
    const cur = $('ee-entry').value;
    $('ee-entry-pills').innerHTML = st.entries.map(key => {
      const r = EE.ENTRY_RULES.find(x => x.key === key);
      return `<button class="pill${key === cur ? ' active' : ''}" data-value="${key}" type="button">${esc(r.label)}</button>`;
    }).join('');
    if (!st.horizons.includes(parseFloat($('ee-h').value))) $('ee-h').value = String(st.defaults.horizonMonths);
    const h = parseFloat($('ee-h').value);
    $('ee-h-pills').innerHTML = st.horizons.map(v =>
      `<button class="pill${v === h ? ' active' : ''}" data-value="${v}" type="button">${HORIZON_LABEL[v] || v + ' mois'}</button>`
    ).join('');
    updateDescs();
  }

  function updateDescs() {
    const r = EE.ENTRY_RULES.find(x => x.key === $('ee-entry').value);
    let txt = r ? r.desc : '';
    txt = $('ee-tf').value === 'daily' ? txt.replace(' (200 jours / 40 semaines)', ' (200 jours)') : txt.replace(' (200 jours / 40 semaines)', ' (40 semaines)');
    if ($('ee-tf').value === 'weekly') txt = txt.replace(/(\d+) barres/g, '$1 semaines');
    $('ee-entry-desc').textContent = txt;
    $('ee-mode-desc').textContent = MODE_DESC[$('ee-mode').value === 'capital' ? 'capital' : 'dist'];
  }

  function setStyle(key) {
    $('ee-style').value = key;
    const d = EE.STYLES[key].defaults;
    $('ee-tf').value = d.timeframe;
    $('ee-k').value = d.k;
    $('ee-h').value = String(d.horizonMonths);
    renderStyleControls();
    syncPillsToInputs();
    scheduleRun();
  }

  function params() {
    return {
      style: styleKey(),
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

  let lastResult = null;

  function run() {
    if (!current) return;
    const p = params();
    const mode = $('ee-mode').value === 'capital' ? 'capital' : 'dist';
    updateDescs();
    CI.setUrlParams({
      a: state.ticker ? null : state.asset, t: state.ticker || null,
      s: p.style, m: mode, tf: p.timeframe, e: p.entryRule, k: p.k, h: p.horizonMonths, f: p.feePct
    });
    const label = state.ticker || SHORT[state.asset] || state.asset;
    const entryLbl = (EE.ENTRY_RULES.find(r => r.key === p.entryRule) || {}).label;
    $('ee-sum').textContent = `${label} · ${EE.STYLES[p.style].label} · ${entryLbl} · ${EE.TIMEFRAMES[p.timeframe].label} · stop ${num(p.k, p.k % 1 ? 1 : 0)} ATR · ${HORIZON_LABEL[p.horizonMonths] || p.horizonMonths + ' mois'} · frais ${num(p.feePct, 2)} %`;

    const r = EE.run(current, p);
    lastResult = r;
    if (r.error) {
      $('ee-summary').textContent = r.error;
      ['ee-cards', 'ee-tbody', 'ee-thead', 'ee-legend'].forEach(id => { $(id).innerHTML = ''; });
      $('ee-cards-meta').textContent = '—';
      $('ee-chart-meta').textContent = '—';
      $('ee-warn').style.display = 'none';
      clearChart();
      return;
    }
    if (mode === 'capital') {
      renderCapitalSummary(r, label, entryLbl);
      renderCapitalCards(r);
      renderCapitalChart(r);
      renderCapitalTable(r);
    } else {
      renderDistSummary(r, label, entryLbl);
      renderDistCards(r);
      renderDistChart(r);
      renderDistTable(r);
    }
  }

  function showWarn(text) {
    const w = $('ee-warn');
    w.textContent = text || '';
    w.style.display = text ? 'block' : 'none';
  }

  /* — Distribution — */

  function renderDistSummary(r, label, entryLbl) {
    const s = r.byExit;
    const hold = s.hold;
    if (!hold.n) {
      $('ee-summary').innerHTML = `La règle « ${esc(entryLbl)} » ne s'est jamais déclenchée sur ${esc(label)} entre ${CI.fmtDate(r.firstEntry)} et ${CI.fmtDate(r.lastEntry)}.`;
      showWarn('');
      return;
    }
    const exits = r.exitRules;
    const best = exits.reduce((a, ex) => (s[ex.key].median > s[a.key].median ? ex : a), exits[0]);
    const bestR = exits.filter(ex => ex.key !== 'hold').reduce((a, ex) => (!a || s[ex.key].meanR > s[a.key].meanR ? ex : a), null);
    const hz = HORIZON_LABEL[r.horizonMonths] || HORIZON_LABEL[Math.round(r.horizonMonths * 4) / 4] || num(r.horizonMonths, 1) + ' mois';
    $('ee-summary').innerHTML =
      `Sur <strong>${hold.n.toLocaleString('fr-FR')} entrées</strong> simulées entre ${CI.fmtDate(r.firstEntry)} et ${CI.fmtDate(r.lastEntry)}, ` +
      `conserver ${esc(hz)} a donné un gain médian de <strong class="${cls(hold.median)}">${pct(hold.median)}</strong>, ` +
      `avec ${pctPlain(hold.pctLoss)} d'entrées perdantes et une baisse maximale médiane de <strong class="ee-neg">${pct(hold.medianMaxDD)}</strong> en cours de route. ` +
      `Meilleur gain médian : <strong>${esc(best.label)}</strong> (${pct(s[best.key].median)}). ` +
      (bestR ? `Meilleure espérance par trade : <strong>${esc(bestR.label)}</strong> (${rFmt(s[bestR.key].meanR)}).` : '');
    if (hold.n < 30) showWarn(`⚠ Seulement ${hold.n} entrées : trop peu pour conclure.`);
    else if (r.years < 5) showWarn(`⚠ ${num(r.years, 1)} ans d'entrées seulement : cela ne fait que quelques périodes réellement indépendantes. Le résultat dépend surtout d'un ou deux épisodes de marché.`);
    else showWarn('');
  }

  function stat(lbl, val, klass) {
    return `<div><div class="lbl">${lbl}</div><div class="val ${klass || ''}">${val}</div></div>`;
  }

  function card(color, title, desc, body, dashed) {
    const dot = dashed ? `<span class="ee-dot" style="background:transparent;border:2px dashed ${color}"></span>` : `<span class="ee-dot" style="background:${color}"></span>`;
    return `<div class="ee-card"><div class="ee-card-head">${dot}${esc(title)}</div><div class="ee-card-desc">${esc(desc)}</div>${body}</div>`;
  }

  function renderDistCards(r) {
    $('ee-cards-title').textContent = 'Résultats par règle de sortie';
    $('ee-cards-meta').textContent = `${r.byExit.hold.n.toLocaleString('fr-FR')} entrées · horizon ${r.horizon} barres`;
    $('ee-cards').innerHTML = r.exitRules.map(ex => {
      const s = r.byExit[ex.key];
      const desc = exitDesc(ex, r.k);
      if (!s.n) return card(ex.color, ex.label, desc, '<div style="color:var(--text-4);font-size:12px">Aucune entrée</div>');
      return card(ex.color, ex.label, desc, `<div class="ee-stats">
        ${stat('Gain médian', pct(s.median), cls(s.median))}
        ${stat('Gain moyen', pct(s.mean), cls(s.mean))}
        ${stat('Perdants', pctPlain(s.pctLoss))}
        ${stat('Pire 5 %', pct(s.p5), 'ee-neg')}
        ${stat('Espérance', rFmt(s.meanR), cls(s.meanR))}
        ${stat('Durée moyenne', months(s.avgMonths))}
        ${stat('Par mois investi', pct(s.perMonthInvested, 2), cls(s.perMonthInvested))}
        ${stat('Baisse max médiane', pct(s.medianMaxDD), 'ee-neg')}
      </div>`);
    }).join('');
  }

  function clearChart() {
    const c = $('ee-chart');
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }

  function downsample(len, max) {
    const stride = Math.max(1, Math.ceil(len / max));
    const idx = [];
    for (let i = 0; i < len; i += stride) idx.push(i);
    if (idx[idx.length - 1] !== len - 1) idx.push(len - 1);
    return { idx, stride };
  }

  function legend(items) {
    $('ee-legend').innerHTML = items.map(it =>
      `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:0;border-top:3px ${it.dash ? 'dashed' : 'solid'} ${it.color}"></span>${esc(it.label)}</span>`
    ).join('');
  }

  function renderDistChart(r) {
    $('ee-chart-title').textContent = 'Résultat selon la date d\'entrée';
    $('ee-chart-note').textContent = 'Chaque point est une entrée simulée : en abscisse sa date, en ordonnée son rendement final (en %) selon la règle de sortie.';
    const t = r.timeline;
    if (!t.dates.length) {
      clearChart();
      $('ee-chart-meta').textContent = 'Aucune entrée';
      $('ee-legend').innerHTML = '';
      return;
    }
    const { idx, stride } = downsample(t.dates.length, 600);
    const labels = idx.map(i => t.dates[i].slice(0, 7));
    const datasets = r.exitRules.map(ex => ({
      label: ex.label, data: idx.map(i => t[ex.key][i]), color: ex.color, width: ex.key === 'hold' ? 2 : 1.4
    }));
    CI.drawChart('ee-chart', labels, datasets, { yFormat: v => (v >= 0 ? '+' : '') + Math.round(v) + ' %' });
    $('ee-chart-meta').textContent = t.dates.length.toLocaleString('fr-FR') + ' entrées' + (stride > 1 ? ' (1 sur ' + stride + ' affichée)' : '');
    legend(r.exitRules.map(ex => ({ label: ex.label, color: ex.color })));
  }

  function renderDistTable(r) {
    $('ee-table-meta').textContent = 'Gain médian · perdants · espérance';
    $('ee-table-note').textContent = 'Cliquez une ligne pour l\'afficher en détail. La baisse maximale est celle subie en conservant la position, entre l\'achat et l\'horizon.';
    $('ee-thead').innerHTML = '<tr><th>Règle d\'entrée</th><th>Entrées</th>' + r.exitRules.map(ex => `<th>${esc(ex.label)}</th>`).join('') + '<th>Baisse max médiane</th></tr>';
    $('ee-tbody').innerHTML = r.entryRules.map(en => {
      const row = r.byEntry[en.key];
      const n = row.hold.n;
      const cell = st => st.n ? `<span class="${cls(st.median)}" style="font-weight:600">${pct(st.median)}</span><span class="sub">${pctPlain(st.pctLoss)} perdants · ${rFmt(st.meanR)}</span>` : '—';
      return `<tr data-entry="${en.key}" class="${en.key === r.entryRule ? 'is-active' : ''}" tabindex="0">
        <td><strong>${esc(en.label)}</strong></td>
        <td>${n ? n.toLocaleString('fr-FR') : '0'}${n && n < 30 ? '<span class="sub">trop peu</span>' : ''}</td>
        ${r.exitRules.map(ex => '<td>' + cell(row[ex.key]) + '</td>').join('')}
        <td>${n ? '<span class="ee-neg">' + pct(row.hold.medianMaxDD) + '</span>' : '—'}</td>
      </tr>`;
    }).join('');
  }

  /* — Capital réinvesti — */

  function renderCapitalSummary(r, label, entryLbl) {
    const pf = r.portfolio, bh = r.buyHold;
    const exits = r.exitRules;
    const traded = exits.filter(ex => pf[ex.key].trades > 0);
    if (!traded.length) {
      $('ee-summary').innerHTML = `La règle « ${esc(entryLbl)} » ne s'est jamais déclenchée sur ${esc(label)} : le capital serait resté en liquidités.`;
      showWarn('');
      return;
    }
    const best = traded.reduce((a, ex) => (pf[ex.key].cagr > pf[a.key].cagr ? ex : a), traded[0]);
    const ratio = x => x.maxDD < 0 ? x.cagr / -x.maxDD : Infinity;
    const calm = traded.reduce((a, ex) => (ratio(pf[ex.key]) > ratio(pf[a.key]) ? ex : a), traded[0]);
    const b = pf[best.key];
    $('ee-summary').innerHTML =
      `En réinvestissant le capital de trade en trade du ${CI.fmtDate(r.dates[r.firstIdx])} au ${CI.fmtDate(r.lastDate)} (${num(r.portfolioYears, 1)} ans), ` +
      `<strong>100 €</strong> deviennent <strong>${money(100 * b.final)}</strong> avec « ${esc(entryLbl)} » + <strong>${esc(best.label)}</strong> ` +
      `(<span class="${cls(b.cagr)}">${pct(b.cagr)}</span> par an, baisse maximale <span class="ee-neg">${pct(b.maxDD)}</span>, ${b.trades} trades), ` +
      `contre <strong>${money(100 * bh.final)}</strong> en achat-conservation (<span class="${cls(bh.cagr)}">${pct(bh.cagr)}</span> par an, baisse maximale <span class="ee-neg">${pct(bh.maxDD)}</span>). ` +
      `Meilleur rendement par point de baisse : <strong>${esc(calm.label)}</strong> (${num(ratio(pf[calm.key]), 2)} contre ${num(ratio(bh), 2)} pour l'achat-conservation).`;
    const minTrades = Math.min(...traded.map(ex => pf[ex.key].trades));
    if (minTrades < 30) showWarn(`⚠ Certaines combinaisons ne comptent que ${minTrades} trades : le résultat dépend de quelques trades et de la date de départ.`);
    else if (r.portfolioYears < 5) showWarn(`⚠ ${num(r.portfolioYears, 1)} ans de données seulement : un ou deux épisodes de marché font l'essentiel du résultat.`);
    else showWarn('');
  }

  function capitalStats(x, isBH) {
    return `<div class="ee-stats">
      ${stat('100 € deviennent', money(100 * x.final), cls(x.final - 1))}
      ${stat('Par an (CAGR)', pct(x.cagr), cls(x.cagr))}
      ${stat('Baisse max', pct(x.maxDD), 'ee-neg')}
      ${stat('Temps investi', pctPlain(x.exposure))}
      ${isBH ? '' : stat('Trades', x.trades + (Number.isFinite(x.tradesPerYear) ? ' <span style="font-size:11px;color:var(--text-4)">(' + num(x.tradesPerYear, 1) + '/an)</span>' : ''))}
      ${isBH ? '' : stat('Gagnants', pctPlain(x.winRate))}
      ${isBH ? '' : stat('Espérance', rFmt(x.meanR), cls(x.meanR))}
      ${isBH ? '' : stat('Pire trade', pct(x.worstTrade), 'ee-neg')}
    </div>`;
  }

  function renderCapitalCards(r) {
    $('ee-cards-title').textContent = 'Capital réinvesti par règle de sortie';
    $('ee-cards-meta').textContent = `du ${CI.fmtDate(r.dates[r.firstIdx])} au ${CI.fmtDate(r.lastDate)}`;
    const bh = card(BH_COLOR, 'Achat-conservation', 'Référence : acheté au début de la période, jamais vendu.', capitalStats(r.buyHold, true), true);
    $('ee-cards').innerHTML = bh + r.exitRules.map(ex => {
      const x = r.portfolio[ex.key];
      return card(ex.color, ex.label, exitDesc(ex, r.k), x.trades ? capitalStats(x, false) : '<div style="color:var(--text-4);font-size:12px">Aucun trade</div>');
    }).join('');
  }

  function renderCapitalChart(r) {
    $('ee-chart-title').textContent = 'Évolution de 100 € (échelle logarithmique)';
    $('ee-chart-note').textContent = 'Échelle logarithmique : une même pente représente le même rendement en %, quel que soit le niveau. Les paliers plats sont les périodes en liquidités.';
    const len = r.dates.length - r.firstIdx;
    const { idx, stride } = downsample(len, 600);
    const at = i => r.firstIdx + i;
    const labels = idx.map(i => r.dates[at(i)].slice(0, 7));
    const lg = v => Math.log10(100 * v);
    const datasets = r.exitRules.map(ex => ({
      label: ex.label, data: idx.map(i => lg(r.portfolio[ex.key].equity[at(i)])), color: ex.color, width: 1.5
    }));
    datasets.unshift({ label: 'Achat-conservation', data: idx.map(i => lg(r.buyHold.equity[at(i)])), color: BH_COLOR, width: 2, dash: [5, 4] });
    CI.drawChart('ee-chart', labels, datasets, {
      yFormat: v => {
        const x = Math.pow(10, v);
        return x >= 10000 ? CI.fmtCompact(x) : Math.round(x).toLocaleString('fr-FR') + ' €';
      }
    });
    $('ee-chart-meta').textContent = r.dates.length - r.firstIdx + ' barres' + (stride > 1 ? ' (1 sur ' + stride + ' affichée)' : '');
    legend([{ label: 'Achat-conservation', color: BH_COLOR, dash: true }].concat(r.exitRules.map(ex => ({ label: ex.label, color: ex.color }))));
  }

  function renderCapitalTable(r) {
    const bh = r.buyHold;
    $('ee-table-meta').textContent = `Rendement annuel · baisse max · trades — achat-conservation : ${pct(bh.cagr)} / an, baisse max ${pct(bh.maxDD)}`;
    $('ee-table-note').textContent = 'Cliquez une ligne pour l\'afficher en détail. En vert, les combinaisons qui battent l\'achat-conservation en rendement annuel.';
    $('ee-thead').innerHTML = '<tr><th>Règle d\'entrée</th>' + r.exitRules.map(ex => `<th>${esc(ex.label)}</th>`).join('') + '</tr>';
    $('ee-tbody').innerHTML = r.entryRules.map(en => {
      const row = r.portfolioByEntry[en.key];
      const cell = x => x.trades ? `<span class="${x.cagr > bh.cagr ? 'ee-pos' : (x.cagr < 0 ? 'ee-neg' : '')}" style="font-weight:600">${pct(x.cagr)}</span><span class="sub">baisse ${pct(x.maxDD, 0)} · ${x.trades} trades</span>` : '—';
      return `<tr data-entry="${en.key}" class="${en.key === r.entryRule ? 'is-active' : ''}" tabindex="0">
        <td><strong>${esc(en.label)}</strong></td>
        ${r.exitRules.map(ex => '<td>' + cell(row[ex.key]) + '</td>').join('')}
      </tr>`;
    }).join('');
  }

  function pickEntry(key) {
    $('ee-entry').value = key;
    document.querySelectorAll('#ee-entry-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.value === key));
    scheduleRun();
  }

  /* ─── Init ────────────────────────────────────────────────── */

  function applyUrl() {
    const g = k => CI.getUrlParam(k);
    const style = g('s') === 'swing' ? 'swing' : 'position';
    $('ee-style').value = style;
    const d = EE.STYLES[style].defaults;
    $('ee-tf').value = d.timeframe; $('ee-k').value = d.k; $('ee-h').value = String(d.horizonMonths);
    if (g('m') === 'capital') $('ee-mode').value = 'capital';
    const tf = g('tf'), e = g('e'), k = parseFloat(g('k')), h = parseFloat(g('h')), f = parseFloat(g('f'));
    if (tf === 'daily' || tf === 'weekly') $('ee-tf').value = tf;
    if (EE.STYLES[style].entries.includes(e)) $('ee-entry').value = e;
    if (Number.isFinite(k) && k >= 0.5 && k <= 10) $('ee-k').value = k;
    if (EE.STYLES[style].horizons.includes(h)) $('ee-h').value = String(h);
    if (Number.isFinite(f) && f >= 0 && f <= 2) $('ee-fee').value = f;
    const t = (g('t') || '').toUpperCase();
    if (TICKER_RE.test(t)) return { asset: null, ticker: t };
    const a = g('a');
    if (a && seriesIndex.some(s => s.id === a)) return { asset: a, ticker: null };
    return { asset: 'sp500', ticker: null };
  }

  function syncPillsToInputs() {
    ['ee-tf', 'ee-k', 'ee-fee', 'ee-mode'].forEach(id => {
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
    renderStyleControls();
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
    $('ee-style-pills').addEventListener('click', e => {
      const b = e.target.closest('.pill[data-value]');
      if (b && b.dataset.value !== styleKey()) setStyle(b.dataset.value);
    });
    $('ee-entry-pills').addEventListener('click', e => {
      const b = e.target.closest('.pill[data-value]');
      if (b) pickEntry(b.dataset.value);
    });
    $('ee-h-pills').addEventListener('click', e => {
      const b = e.target.closest('.pill[data-value]');
      if (!b) return;
      $('ee-h').value = b.dataset.value;
      document.querySelectorAll('#ee-h-pills .pill').forEach(x => x.classList.toggle('active', x === b));
      scheduleRun();
    });
    ['ee-tf', 'ee-k', 'ee-fee', 'ee-mode'].forEach(id => $(id).addEventListener('input', scheduleRun));
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
