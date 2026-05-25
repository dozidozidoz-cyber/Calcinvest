/**
 * CalcInvest — Smart Money view
 * ==============================
 * Charge les JSON /assets/data/smart-money/*.json, render UI.
 */
(function () {
  'use strict';
  if (typeof CI === 'undefined' || typeof SM === 'undefined') {
    console.error('[smartmoney] common.js + calc-smartmoney.js requis');
    return;
  }

  var BASE = '/assets/data/smart-money/';
  var state = {
    manifest: null,
    selectedManager: null,
    selectedPolitician: null,
    selectedArkFund: null,
    managerCache: {},
    politicianCache: {},
    arkCache: null,
    prices: null,
    pricesLoaded: false,
  };

  function loadPrices() {
    if (state.pricesLoaded) return Promise.resolve(state.prices);
    return fetch(BASE + 'prices.json').then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (data) {
      state.prices = data.prices || {};
      state.pricesLoaded = true;
      return state.prices;
    }).catch(function () {
      state.prices = {};
      state.pricesLoaded = true;
      return {};
    });
  }

  // ---------- helpers ----------

  function fmtBig(v) {
    if (!v) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + ' B$';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + ' M$';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + ' k$';
    return v.toFixed(0) + ' $';
  }
  function fmtShares(n) {
    if (!n) return '—';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + ' M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + ' k';
    return String(n);
  }
  function fmtPct(p, dec) {
    if (p == null || isNaN(p)) return '—';
    return (p >= 0 ? '+' : '') + p.toFixed(dec == null ? 2 : dec) + ' %';
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function flagBadge(flag) {
    var map = {
      NEW:  { label: 'NEW',  cls: 'pos' },
      EXIT: { label: 'EXIT', cls: 'neg' },
      ADD:  { label: '▲ ADD', cls: 'pos' },
      TRIM: { label: '▼ TRIM', cls: 'warn' },
      HOLD: { label: '=', cls: '' },
    };
    var m = map[flag] || { label: flag, cls: '' };
    return '<span class="sm-badge ' + m.cls + '">' + m.label + '</span>';
  }

  function sourceBadge(source) {
    if (source === 'live_house_clerk') {
      return '<span class="sm-source-badge live"><span class="dot"></span>LIVE · disclosures-clerk.house.gov</span>';
    }
    if (source === 'wayback') {
      return '<span class="sm-source-badge archive"><span class="dot"></span>Archive Wayback Machine</span>';
    }
    return '';
  }

  function summaryTile(label, value, cls, sub) {
    cls = cls || '';
    sub = sub || '';
    return '<div class="sm-summary-tile">'
      + '<div class="sm-summary-tile-label">' + escapeHtml(label) + '</div>'
      + '<div class="sm-summary-tile-value ' + cls + '">' + value + '</div>'
      + (sub ? '<div class="sm-summary-tile-sub">' + sub + '</div>' : '')
      + '</div>';
  }

  function fetchJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + path);
      return r.json();
    });
  }

  // ---------- 13F ----------

  function loadManager(id) {
    if (state.managerCache[id]) return Promise.resolve(state.managerCache[id]);
    return fetchJSON(BASE + id + '.json').then(function (data) {
      state.managerCache[id] = data;
      return data;
    });
  }

  function renderManagerList() {
    var list = document.getElementById('sm-mgr-list');
    if (!list || !state.manifest) return;
    list.innerHTML = state.manifest.managers_13f.map(function (m) {
      return '<button class="sm-item" data-id="' + m.id + '">'
        + '<div class="sm-item-name">' + escapeHtml(m.name) + '</div>'
        + '<div class="sm-item-meta">' + escapeHtml(m.fund) + '</div>'
        + '</button>';
    }).join('');
    list.querySelectorAll('.sm-item').forEach(function (btn) {
      btn.addEventListener('click', function () { selectManager(btn.dataset.id); });
    });
  }

  function selectManager(id) {
    state.selectedManager = id;
    document.querySelectorAll('#sm-mgr-list .sm-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.id === id);
    });
    var panel = document.getElementById('sm-mgr-panel');
    panel.innerHTML = '<div class="sm-loading">Chargement…</div>';
    loadManager(id).then(renderManager).catch(function (e) {
      panel.innerHTML = '<div class="info-box neg">Erreur : ' + escapeHtml(e.message) + '</div>';
    });
  }

  function renderManager(data) {
    var panel = document.getElementById('sm-mgr-panel');
    var filings = data.filings || [];
    if (!filings.length) {
      panel.innerHTML = '<div class="info-box warn">Aucun filing disponible.</div>';
      return;
    }
    var curr = filings[0];
    var prev = filings[1] || null;
    var diff = SM.diffFilings(curr, prev);
    var topN = 10;
    var conc = SM.concentration(curr.positions, topN);
    var movers = SM.topMovers(diff, 5);

    var newCount = diff.filter(function (d) { return d.flag === 'NEW'; }).length;
    var exitCount = diff.filter(function (d) { return d.flag === 'EXIT'; }).length;

    panel.innerHTML = ''
      + '<div class="card" style="margin-bottom:16px">'
      +   '<div class="card-header">'
      +     '<div class="card-title">'
      +       '<div class="card-title-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="5"/><path d="M8 5v3l2 1"/></svg></div>'
      +       escapeHtml(data.meta.name) + ' · ' + escapeHtml(data.meta.fund)
      +     '</div>'
      +     '<div class="card-meta">13F-HR au ' + curr.period + ' · déposé le ' + curr.filed + '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="sm-summary-card">'
      +   summaryTile('Valeur portefeuille', fmtBig(curr.total_value), '', 'positions équity uniquement')
      +   summaryTile('Positions', String(curr.count), '', 'lignes 13F')
      +   summaryTile('Concentration top ' + topN, conc.toFixed(1) + ' %', '', 'sur valeur totale')
      +   summaryTile('Nouvelles positions', String(newCount), 'pos', 'vs trimestre précédent')
      +   summaryTile('Sorties', String(exitCount), 'neg', 'vs trimestre précédent')
      + '</div>'
      + (prev ? renderMovers(movers) : '')
      + renderPositionsTable(diff, prev);
  }

  function renderMovers(movers) {
    if (!movers.length) return '';
    return '<div class="card" style="margin-bottom:16px">'
      + '<div class="card-header">'
      +   '<div class="card-title">'
      +     '<div class="card-title-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12l4-4 3 3 5-6"/><path d="M14 8V5h-3"/></svg></div>'
      +     'Top mouvements vs trimestre précédent'
      +   '</div>'
      + '</div>'
      + '<div class="card-body">'
      + '<table class="data-table"><thead><tr>'
      + '<th>Position</th><th>Action</th><th>Δ valeur</th><th>Δ parts</th><th>Δ % port</th>'
      + '</tr></thead><tbody>'
      + movers.map(function (m) {
        var cls = m.dValue >= 0 ? 'pos' : 'neg';
        return '<tr>'
          + '<td><strong>' + escapeHtml(m.issuer) + '</strong></td>'
          + '<td>' + flagBadge(m.flag) + '</td>'
          + '<td class="' + cls + '">' + (m.dValue >= 0 ? '+' : '') + fmtBig(Math.abs(m.dValue)) + '</td>'
          + '<td class="' + cls + '">' + (m.dShares >= 0 ? '+' : '−') + fmtShares(Math.abs(m.dShares)) + '</td>'
          + '<td class="' + cls + '">' + fmtPct(m.dPct, 2) + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table></div></div>';
  }

  function renderPositionsTable(diff, prev) {
    var active = diff.filter(function (d) { return d.flag !== 'EXIT'; });
    return '<div class="card">'
      + '<div class="card-header">'
      +   '<div class="card-title">'
      +     '<div class="card-title-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M5 11h4"/></svg></div>'
      +     'Portefeuille complet'
      +   '</div>'
      +   '<div class="card-meta">' + active.length + ' positions</div>'
      + '</div>'
      + '<div class="card-body">'
      + '<div class="table-wrap"><table class="data-table"><thead><tr>'
      + '<th>#</th><th>Émetteur</th><th>Classe</th><th>% port</th><th>Valeur</th><th>Parts</th>'
      + (prev ? '<th>Mouvement</th><th>Δ parts</th>' : '')
      + '</tr></thead><tbody>'
      + active.map(function (p, i) {
        return '<tr>'
          + '<td>' + (i + 1) + '</td>'
          + '<td><strong>' + escapeHtml(p.issuer) + '</strong></td>'
          + '<td><span class="muted">' + escapeHtml(p.class) + '</span></td>'
          + '<td><strong>' + p.pct.toFixed(2) + ' %</strong></td>'
          + '<td>' + fmtBig(p.value) + '</td>'
          + '<td>' + fmtShares(p.shares) + '</td>'
          + (prev ? '<td>' + flagBadge(p.flag) + '</td>'
                  + '<td class="' + (p.dShares >= 0 ? 'pos' : 'neg') + '">'
                  + (p.flag === 'NEW' ? '—' : (p.dShares >= 0 ? '+' : '−') + fmtShares(Math.abs(p.dShares)))
                  + '</td>' : '')
          + '</tr>';
      }).join('')
      + '</tbody></table></div></div></div>';
  }

  // ---------- Politicians ----------

  function loadPolitician(id) {
    if (state.politicianCache[id]) return Promise.resolve(state.politicianCache[id]);
    return fetchJSON(BASE + id + '.json').then(function (data) {
      state.politicianCache[id] = data;
      return data;
    });
  }

  function renderPoliticianList() {
    var list = document.getElementById('sm-pol-list');
    if (!list || !state.manifest) return;
    list.innerHTML = state.manifest.politicians.map(function (p) {
      var partyCls = p.party === 'D' ? 'sm-party-d' : p.party === 'R' ? 'sm-party-r' : '';
      return '<button class="sm-item" data-id="' + p.id + '">'
        + '<div class="sm-item-name">' + escapeHtml(p.name) + '</div>'
        + '<div class="sm-item-meta">' + escapeHtml(p.chamber) + ' · <span class="' + partyCls + '">' + p.party + '-' + p.state + '</span></div>'
        + '</button>';
    }).join('');
    list.querySelectorAll('.sm-item').forEach(function (btn) {
      btn.addEventListener('click', function () { selectPolitician(btn.dataset.id); });
    });
  }

  function selectPolitician(id) {
    state.selectedPolitician = id;
    document.querySelectorAll('#sm-pol-list .sm-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.id === id);
    });
    var panel = document.getElementById('sm-pol-panel');
    panel.innerHTML = '<div class="sm-loading">Chargement…</div>';
    Promise.all([loadPolitician(id), loadPrices()]).then(function (results) {
      renderPolitician(results[0]);
    }).catch(function (e) {
      panel.innerHTML = '<div class="info-box warn">Erreur : ' + escapeHtml(e.message) + '</div>';
    });
  }

  function renderPolitician(data) {
    var panel = document.getElementById('sm-pol-panel');
    var txns = data.transactions || [];
    if (!txns.length) {
      panel.innerHTML = '<div class="info-box warn">Aucune transaction.</div>';
      return;
    }
    var sAll = SM.summarizeTxns(txns);
    var latestDate = txns[0] && txns[0].date ? txns[0].date : '—';

    // Stats agrégées via core (avec alpha vs S&P)
    var aggBuys  = SM.aggregatePerf(txns, state.prices, true);
    var aggAll   = SM.aggregatePerf(txns, state.prices, false);
    // Fallback : si pas d'achats trackés (que des ventes type Meuser), on utilise toutes les txns
    var agg = aggBuys || aggAll;
    var isAllSells = !aggBuys && aggAll;

    // Color helpers pour la perf moyenne
    var perfCls = function (v) { return v == null ? '' : v >= 0 ? 'pos' : 'neg'; };
    var fmtP = function (v) { return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + ' %'; };

    // Tuiles de résumé
    var summaryTiles = '';
    if (agg) {
      var perfLabel    = isAllSells ? 'Perf moyenne évitée' : 'Perf moyenne achats';
      var perfSub      = isAllSells ? 'ce qu\'il a manqué en vendant (' + agg.count + ' ventes)' : 'depuis chaque achat (' + agg.count + ' trades)';
      var winRateLabel = isAllSells ? 'Timing des ventes' : 'Win rate';
      var winRateSub   = isAllSells ? 'ventes au-dessus du marché' : 'achats gagnants';
      summaryTiles += summaryTile(perfLabel, fmtP(agg.avgReturn), perfCls(agg.avgReturn), perfSub);
      if (agg.avgAlpha != null) {
        var alphaSub = agg.avgAlpha >= 0
          ? (isAllSells ? 'mauvais timing vs marché' : 'bat le marché')
          : (isAllSells ? 'bon timing vs marché' : 'sous le marché');
        summaryTiles += summaryTile('Alpha vs S&P 500', fmtP(agg.avgAlpha), perfCls(isAllSells ? -agg.avgAlpha : agg.avgAlpha), alphaSub);
      }
      summaryTiles += summaryTile(winRateLabel, agg.winRate.toFixed(0) + ' %',
        agg.winRate >= 50 ? 'pos' : 'neg', winRateSub);
      summaryTiles += summaryTile('Meilleur trade', fmtP(agg.bestTrade.ret), 'pos',
        '<strong>' + escapeHtml(agg.bestTrade.ticker) + '</strong>');
      summaryTiles += summaryTile('Pire trade', fmtP(agg.worstTrade.ret), 'neg',
        '<strong>' + escapeHtml(agg.worstTrade.ticker) + '</strong>');
    } else {
      summaryTiles += summaryTile('Transactions totales', String(sAll.total), '', 'historique complet');
      summaryTiles += summaryTile('Dernière transaction', escapeHtml(latestDate), '', '');
    }

    panel.innerHTML = ''
      + '<div class="card" style="margin-bottom:16px">'
      +   '<div class="card-header">'
      +     '<div class="card-title">'
      +       '<div class="card-title-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="5" r="3"/><path d="M3 14c0-3 2-5 5-5s5 2 5 5"/></svg></div>'
      +       escapeHtml(data.meta.name)
      +     '</div>'
      +     '<div class="card-meta">' + escapeHtml(data.meta.chamber) + ' · '
      +       '<span class="' + (data.meta.party === 'D' ? 'sm-party-d' : 'sm-party-r') + '">' + data.meta.party + '-' + data.meta.state + '</span>'
      +       ' · ' + sAll.total + ' transactions · dernière le ' + escapeHtml(latestDate)
      +     '</div>'
      +   '</div>'
      +   '<div class="card-body" style="padding-top:10px">' + sourceBadge(data.data_source) + '</div>'
      + '</div>'
      + '<div class="sm-summary-card">' + summaryTiles + '</div>'
      + renderTxnTable(txns);
  }

  function renderTxnTable(txns) {
    return '<div class="card">'
      + '<div class="card-header">'
      +   '<div class="card-title">'
      +     '<div class="card-title-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M5 7h6M5 10h4"/></svg></div>'
      +     'Transactions détaillées'
      +   '</div>'
      +   '<div class="card-meta">' + Math.min(txns.length, 100) + ' affichées sur ' + txns.length + '</div>'
      + '</div>'
      + '<div class="card-body" style="padding-top:0">'
      + '<div class="table-wrap"><table class="data-table"><thead><tr>'
      + '<th>Date</th><th>Ticker</th><th>Actif</th><th>Type</th><th>Montant</th>'
      + '<th>Perf depuis*</th><th>vs S&P 500</th><th>Détenteur</th>'
      + '</tr></thead><tbody>'
      + txns.slice(0, 100).map(function (t) {
        var ttype = (t.type || '').toLowerCase();
        var isSell = ttype.indexOf('sale') >= 0 || ttype === 's' || ttype.indexOf('s (') === 0;
        var typeCls = isSell ? 'neg' : 'pos';
        var descHtml = t.description ? '<div style="font-size:11px;color:var(--text-2);margin-top:3px;line-height:1.4">' + escapeHtml(t.description) + '</div>' : '';
        var isoDate = t.date && t.date.indexOf('/') >= 0
          ? (function(){var p=t.date.split('/');return p[2]+'-'+p[0].padStart(2,'0')+'-'+p[1].padStart(2,'0');})()
          : t.date;
        var perf = SM.tradeReturn(state.prices, t.ticker, isoDate);
        var perfHtml = '<span class="muted">—</span>';
        var alphaHtml = '<span class="muted">—</span>';
        if (perf) {
          var pCls = perf.returnPct >= 0 ? 'pos' : 'neg';
          var eviteeCls = isSell ? 'evitee' : '';
          perfHtml = '<span class="sm-perf-cell ' + eviteeCls + '"><span class="' + pCls + '">'
            + (perf.returnPct >= 0 ? '+' : '') + perf.returnPct.toFixed(1) + ' %</span>'
            + (isSell ? '<span class="label-evitee">évitée</span>' : '') + '</span>';
          if (perf.alphaPct != null) {
            var aCls = perf.alphaPct >= 0 ? 'pos' : 'neg';
            alphaHtml = '<span class="sm-perf-cell ' + eviteeCls + '"><span class="' + aCls + '">'
              + (perf.alphaPct >= 0 ? '+' : '') + perf.alphaPct.toFixed(1) + ' %</span>'
              + '<span class="alpha">S&P : ' + (perf.benchmarkReturnPct >= 0 ? '+' : '')
              + perf.benchmarkReturnPct.toFixed(1) + ' %</span></span>';
          }
        }
        return '<tr>'
          + '<td>' + escapeHtml(t.date) + '</td>'
          + '<td><strong>' + escapeHtml(t.ticker || '—') + '</strong></td>'
          + '<td>' + escapeHtml(t.asset || '') + descHtml + '</td>'
          + '<td class="' + typeCls + '">' + escapeHtml(t.type || '') + '</td>'
          + '<td>' + escapeHtml(t.amount || '') + '</td>'
          + '<td>' + perfHtml + '</td>'
          + '<td>' + alphaHtml + '</td>'
          + '<td><span class="muted">' + escapeHtml(t.owner || '') + '</span></td>'
          + '</tr>';
      }).join('')
      + '</tbody></table></div>'
      + '<p style="font-size:11px;color:var(--text-2);margin:12px 0 0;line-height:1.6">'
      + '<strong>Perf depuis*</strong> = variation du close mensuel le plus proche de la date du trade jusqu\'au dernier close. '
      + '<strong>vs S&P 500</strong> = alpha (perf du titre − perf de l\'indice sur la même période). '
      + 'Positif = le politicien bat le marché. <strong>« évitée »</strong> sur les ventes = gain qu\'il aurait fait en gardant. '
      + 'Source prix : yfinance, certains tickers exotiques (options, mutual funds, délistés) sont indisponibles.'
      + '</p>'
      + '</div></div>';
  }

  // ---------- ARK ----------

  function loadArk() {
    if (state.arkCache) return Promise.resolve(state.arkCache);
    return fetchJSON(BASE + 'ark.json').then(function (data) {
      state.arkCache = data;
      return data;
    });
  }

  var ARK_DESCS = {
    ARKK: 'Innovation', ARKQ: 'Autonomous Tech & Robotics',
    ARKW: 'Next-Gen Internet', ARKG: 'Genomic Revolution',
    ARKF: 'Fintech Innovation', ARKX: 'Space Exploration',
  };

  function renderArkList() {
    var list = document.getElementById('sm-ark-list');
    if (!list || !state.manifest) return;
    list.innerHTML = state.manifest.ark_funds.map(function (f) {
      return '<button class="sm-item" data-id="' + f + '">'
        + '<div class="sm-item-name">' + f + '</div>'
        + '<div class="sm-item-meta">' + (ARK_DESCS[f] || 'ARK Invest') + '</div>'
        + '</button>';
    }).join('');
    list.querySelectorAll('.sm-item').forEach(function (btn) {
      btn.addEventListener('click', function () { selectArkFund(btn.dataset.id); });
    });
  }

  function selectArkFund(symbol) {
    state.selectedArkFund = symbol;
    document.querySelectorAll('#sm-ark-list .sm-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.id === symbol);
    });
    var panel = document.getElementById('sm-ark-panel');
    panel.innerHTML = '<div class="sm-loading">Chargement…</div>';
    loadArk().then(function (data) { renderArkFund(symbol, data); }).catch(function (e) {
      panel.innerHTML = '<div class="info-box warn">Erreur : ' + escapeHtml(e.message) + '</div>';
    });
  }

  function renderArkFund(symbol, data) {
    var panel = document.getElementById('sm-ark-panel');
    var fund = data.funds[symbol];
    if (!fund) { panel.innerHTML = '<div class="info-box warn">Pas de données pour ' + symbol + '.</div>'; return; }
    var holdings = fund.holdings || [];
    var totalValue = holdings.reduce(function (s, h) { return s + (h.value || 0); }, 0);
    var top10pct = holdings.slice(0, 10).reduce(function (s, h) { return s + (h.weight || 0); }, 0);

    panel.innerHTML = ''
      + '<div class="card" style="margin-bottom:16px">'
      +   '<div class="card-header">'
      +     '<div class="card-title">'
      +       '<div class="card-title-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2L2 6l6 4 6-4z"/><path d="M2 10l6 4 6-4"/></svg></div>'
      +       symbol + ' · ' + (ARK_DESCS[symbol] || 'ARK Invest')
      +     '</div>'
      +     '<div class="card-meta">Holdings au ' + escapeHtml(fund.as_of || '—') + ' · arkfunds.io</div>'
      +   '</div>'
      + '</div>'
      + '<div class="sm-summary-card">'
      +   summaryTile('AUM (mkt value)', fmtBig(totalValue), '', 'valeur marché des positions')
      +   summaryTile('Positions', String(holdings.length), '', 'lignes du fonds')
      +   summaryTile('Concentration top 10', top10pct.toFixed(1) + ' %', '', 'sur poids total')
      + '</div>'
      + '<div class="card">'
      + '<div class="card-header">'
      +   '<div class="card-title">'
      +     '<div class="card-title-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M5 11h4"/></svg></div>'
      +     'Portefeuille complet'
      +   '</div>'
      +   '<div class="card-meta">' + holdings.length + ' positions</div>'
      + '</div>'
      + '<div class="card-body" style="padding-top:0">'
      + '<div class="table-wrap"><table class="data-table"><thead><tr>'
      + '<th>#</th><th>Ticker</th><th>Société</th><th>% port</th><th>Valeur</th><th>Parts</th><th>Cours</th>'
      + '</tr></thead><tbody>'
      + holdings.map(function (h, i) {
        return '<tr>'
          + '<td>' + (i + 1) + '</td>'
          + '<td><strong>' + escapeHtml(h.ticker) + '</strong></td>'
          + '<td>' + escapeHtml(h.name) + '</td>'
          + '<td><strong>' + h.weight.toFixed(2) + ' %</strong></td>'
          + '<td>' + fmtBig(h.value) + '</td>'
          + '<td>' + fmtShares(h.shares) + '</td>'
          + '<td>$' + (h.share_price || 0).toFixed(2) + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table></div></div></div>';
  }

  // ---------- Cross-source search ----------

  function preloadAll() {
    if (!state.manifest) return Promise.resolve();
    var promises = [];
    state.manifest.managers_13f.forEach(function (m) { promises.push(loadManager(m.id)); });
    state.manifest.politicians.forEach(function (p) {
      promises.push(loadPolitician(p.id).catch(function () { return null; }));
    });
    promises.push(loadArk().catch(function () { return null; }));
    return Promise.all(promises);
  }

  function searchAll(query) {
    var q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    var results = { managers: [], ark: [], politicians: [] };

    // 13F managers
    state.manifest.managers_13f.forEach(function (m) {
      var data = state.managerCache[m.id];
      if (!data || !data.filings[0]) return;
      var matches = data.filings[0].positions.filter(function (p) {
        return (p.issuer || '').toLowerCase().indexOf(q) >= 0
            || (p.cusip || '').toLowerCase().indexOf(q) >= 0;
      });
      if (matches.length) results.managers.push({ meta: m, matches: matches, period: data.filings[0].period });
    });

    // ARK
    if (state.arkCache) {
      Object.keys(state.arkCache.funds || {}).forEach(function (fund) {
        var holds = (state.arkCache.funds[fund].holdings || []).filter(function (h) {
          return (h.ticker || '').toLowerCase().indexOf(q) >= 0
              || (h.name || '').toLowerCase().indexOf(q) >= 0;
        });
        if (holds.length) results.ark.push({ fund: fund, matches: holds, as_of: state.arkCache.funds[fund].as_of });
      });
    }

    // Politicians
    state.manifest.politicians.forEach(function (p) {
      var data = state.politicianCache[p.id];
      if (!data) return;
      var matches = (data.transactions || []).filter(function (t) {
        return (t.ticker || '').toLowerCase().indexOf(q) >= 0
            || (t.asset || '').toLowerCase().indexOf(q) >= 0;
      }).slice(0, 20);
      if (matches.length) results.politicians.push({ meta: p, matches: matches, total: (data.transactions||[]).length });
    });

    return results;
  }

  function renderSearchResults(query, r) {
    var panel = document.getElementById('sm-search-results');
    if (!r) { panel.innerHTML = ''; return; }
    var nothing = !r.managers.length && !r.ark.length && !r.politicians.length;
    if (nothing) {
      panel.innerHTML = '<div class="info-box">Aucun résultat pour <strong>' + escapeHtml(query) + '</strong>.</div>';
      return;
    }
    var html = '';

    if (r.managers.length) {
      html += '<div class="card" style="margin-bottom:14px">'
        + '<div class="card-title">Gérants 13F détenant ce titre (' + r.managers.length + ')</div>'
        + '<table class="data-table"><thead><tr><th>Gérant</th><th>Titre détenu</th><th>% port</th><th>Valeur</th><th>Parts</th><th>Filing</th></tr></thead><tbody>'
        + r.managers.flatMap(function (m) {
          return m.matches.map(function (p) {
            return '<tr>'
              + '<td><strong>' + escapeHtml(m.meta.name) + '</strong><br><span class="muted" style="font-size:11px">' + escapeHtml(m.meta.fund) + '</span></td>'
              + '<td>' + escapeHtml(p.issuer) + ' <span class="muted" style="font-size:11px">(' + escapeHtml(p.class) + ')</span></td>'
              + '<td><strong>' + p.pct.toFixed(2) + ' %</strong></td>'
              + '<td>' + fmtBig(p.value) + '</td>'
              + '<td>' + fmtShares(p.shares) + '</td>'
              + '<td><span class="muted">' + escapeHtml(m.period) + '</span></td>'
              + '</tr>';
          });
        }).join('')
        + '</tbody></table></div>';
    }

    if (r.ark.length) {
      html += '<div class="card" style="margin-bottom:14px">'
        + '<div class="card-title">Fonds ARK détenant ce titre (' + r.ark.length + ')</div>'
        + '<table class="data-table"><thead><tr><th>Fonds</th><th>Ticker</th><th>Société</th><th>% port</th><th>Valeur</th><th>As of</th></tr></thead><tbody>'
        + r.ark.flatMap(function (a) {
          return a.matches.map(function (h) {
            return '<tr>'
              + '<td><strong>' + escapeHtml(a.fund) + '</strong></td>'
              + '<td><strong>' + escapeHtml(h.ticker) + '</strong></td>'
              + '<td>' + escapeHtml(h.name) + '</td>'
              + '<td><strong>' + h.weight.toFixed(2) + ' %</strong></td>'
              + '<td>' + fmtBig(h.value) + '</td>'
              + '<td><span class="muted">' + escapeHtml(a.as_of || '') + '</span></td>'
              + '</tr>';
          });
        }).join('')
        + '</tbody></table></div>';
    }

    if (r.politicians.length) {
      html += '<div class="card" style="margin-bottom:14px">'
        + '<div class="card-title">Transactions de politiciens sur ce titre</div>'
        + '<table class="data-table"><thead><tr><th>Politicien</th><th>Date</th><th>Ticker</th><th>Type</th><th>Montant</th><th>Actif</th></tr></thead><tbody>'
        + r.politicians.flatMap(function (p) {
          return p.matches.map(function (t) {
            var typeCls = (t.type || '').toLowerCase().indexOf('sale') >= 0 ? 'neg' : 'pos';
            return '<tr>'
              + '<td><strong>' + escapeHtml(p.meta.name) + '</strong></td>'
              + '<td>' + escapeHtml(t.date || '') + '</td>'
              + '<td><strong>' + escapeHtml(t.ticker || '—') + '</strong></td>'
              + '<td class="' + typeCls + '">' + escapeHtml(t.type || '') + '</td>'
              + '<td>' + escapeHtml(t.amount || '') + '</td>'
              + '<td><span class="muted" style="font-size:12px">' + escapeHtml(t.asset || '') + '</span></td>'
              + '</tr>';
          });
        }).join('')
        + '</tbody></table></div>';
    }

    panel.innerHTML = html;
  }

  function initSearch() {
    var input = document.getElementById('sm-search-input');
    var clear = document.getElementById('sm-search-clear');
    if (!input) return;
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value;
      timer = setTimeout(function () {
        if (q.trim().length < 2) {
          document.getElementById('sm-search-results').innerHTML = '';
          return;
        }
        renderSearchResults(q, searchAll(q));
      }, 200);
    });
    clear.addEventListener('click', function () {
      input.value = '';
      document.getElementById('sm-search-results').innerHTML = '';
      input.focus();
    });
  }

  // ---------- Tabs ----------

  function initTabs() {
    document.querySelectorAll('.sm-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.dataset.target;
        document.querySelectorAll('.sm-tab').forEach(function (t) {
          t.classList.toggle('active', t === tab);
        });
        document.querySelectorAll('.sm-section').forEach(function (s) {
          s.style.display = s.id === target ? '' : 'none';
        });
        // Auto-sélection à l'ouverture du tab
        if (target === 'sm-tab-pol' && !state.selectedPolitician && state.manifest && state.manifest.politicians.length) {
          selectPolitician(state.manifest.politicians[0].id);
        }
        if (target === 'sm-tab-ark' && !state.selectedArkFund && state.manifest && state.manifest.ark_funds.length) {
          selectArkFund(state.manifest.ark_funds[0]);
        }
        if (target === 'sm-tab-search') {
          // Précharge toutes les sources la 1ère fois pour que la recherche soit instant
          preloadAll();
          var inp = document.getElementById('sm-search-input');
          if (inp) inp.focus();
        }
      });
    });
  }

  // ---------- Init ----------

  function init() {
    initTabs();
    initSearch();
    fetchJSON(BASE + 'manifest.json').then(function (m) {
      state.manifest = m;
      renderManagerList();
      renderPoliticianList();
      renderArkList();
      // Auto-select first manager
      if (m.managers_13f && m.managers_13f.length) {
        selectManager(m.managers_13f[0].id);
      }
    }).catch(function (e) {
      var err = document.getElementById('sm-error');
      if (err) err.textContent = 'Impossible de charger le manifest : ' + e.message;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
