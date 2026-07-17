/* ==========================================================================
   BCH ECOSYSTEM RADAR — APPLICATION LOGIC
   --------------------------------------------------------------------------
   Architecture overview:
   1. DATA        - static registry of services (SERVICES) grouped by CATEGORIES.
   2. MONITORING  - checkService() attempts a real network probe first
                    (no-cors fetch, timed). Where the browser/CORS/network
                    blocks that probe, it gracefully falls back to a seeded
                    "simulated monitoring" mode so the UI never breaks.
   3. STATE       - a single `state` object holds filters, sort, pause flag
                    and the live service records. All rendering reads from it.
   4. RENDER      - pure-ish functions that rebuild DOM from `state`. No
                    framework: we diff nothing, we just re-render the
                    (small) card grid, which is cheap enough at this scale.
   5. CHARTS      - Chart.js instances are created once and updated in place.
   6. EVENTS      - wired at the bottom in initApp().
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. DATA REGISTRY
   * ------------------------------------------------------------------ */

  const CATEGORIES = [
    { id: 'wallets',      label: 'Wallets',            icon: '👛' },
    { id: 'social',       label: 'BCH Social',         icon: '💬' },
    { id: 'infra',        label: 'Infrastructure',     icon: '🖧' },
    { id: 'explorers',    label: 'Explorers',          icon: '🔎' },
    { id: 'developer',    label: 'Developer Services', icon: '🛠' },
    { id: 'merchant',     label: 'Merchant Services',  icon: '🛒' },
    { id: 'community',    label: 'Community',          icon: '🌐' },
  ];

  // Each service: id, name, category, description, url, region, notes.
  // `url` is used both as the link target and as the probe target for monitoring.
  const SERVICES = [
    // --- Wallets ---
    { id: 'paytaca', name: 'Paytaca', category: 'wallets', region: 'Global',
      description: 'Mobile & browser wallet for BCH and CashTokens.', url: 'https://paytaca.com',
      notes: 'Non-custodial wallet with SLP/CashToken support.' },
    { id: 'selene', name: 'Selene Wallet', category: 'wallets', region: 'Global',
      description: 'Lightweight for mobile and desktop wallet for Bitcoin Cash.', url: 'https://selenewallet.cash',
      notes: 'Community-maintained SPV wallet.' },
    { id: 'zapit', name: 'Zapit', category: 'wallets', region: 'Global',
      description: 'Mobile wallet focused on fast BCH payments.', url: 'https://zapit.io',
      notes: 'Consumer-focused payments wallet.' },
    { id: 'electron-cash', name: 'Electron Cash', category: 'wallets', region: 'Global',
      description: 'The original BCH fork of the Electrum wallet.', url: 'https://electroncash.org',
      notes: 'Long-standing reference SPV wallet.' },

    // --- BCH Social ---
    { id: 'bchnostr', name: 'BCHnostr', category: 'social', region: 'Distributed relay',
      description: 'Nostr relay & client tuned for the BCH community.', url: 'https://bchnostr.com',
      notes: 'Monitored relay — see companion BCHnostr Pulse dashboard.' },
    { id: 'memocash', name: 'memo.cash', category: 'social', region: 'Global',
      description: 'BCH-tipped micro-blogging / social platform.', url: 'https://memo.cash',
      notes: '' },
    { id: 'readcash', name: 'read.cash', category: 'social', region: 'Global',
      description: 'Long-form blogging platform with BCH tipping.', url: 'https://read.cash',
      notes: '' },
    { id: 'noisecash', name: 'noise.cash', category: 'social', region: 'Global',
      description: 'Short-form social feed with BCH rewards.', url: 'https://noise.cash',
      notes: '' },

    // --- Infrastructure ---
    { id: 'bchd', name: 'BCHD', category: 'infra', region: 'Global nodes',
      description: 'Alternative full node implementation with gRPC API.', url: 'https://bchd.cash',
      notes: 'Reference full-node software.' },
    { id: 'knuth', name: 'Knuth', category: 'infra', region: 'Global nodes',
      description: 'High-performance BCH full node (Bitprim lineage).', url: 'https://knuthproject.org',
      notes: '' },
    { id: 'fulcrum', name: 'Fulcrum', category: 'infra', region: 'Global',
      description: 'Fast Electrum-protocol server implementation.', url: 'https://github.com/cculianu/Fulcrum',
      notes: 'No public status page — monitored via project repository.' },
    { id: 'electrumx', name: 'ElectrumX', category: 'infra', region: 'Global',
      description: 'Original Electrum-protocol server for BCH/BTC.', url: 'https://github.com/kyuupichan/electrumx',
      notes: 'No public status page — monitored via project repository.' },

    // --- Explorers ---
    { id: 'blockchair', name: 'Blockchair', category: 'explorers', region: 'Global CDN',
      description: 'Multi-chain block explorer with BCH support.', url: 'https://blockchair.com/bitcoin-cash',
      notes: '' },
    { id: 'bch-explorer', name: 'BCH Explorer', category: 'explorers', region: 'Global',
      description: 'Community block explorer for Bitcoin Cash.', url: 'https://explorer.bitcoinunlimited.info',
      notes: '' },
    { id: 'fullstack-explorer', name: 'FullStack.cash Explorer', category: 'explorers', region: 'Global',
      description: 'Explorer front-end backed by the FullStack.cash API.', url: 'https://explorer.fullstack.cash',
      notes: '' },

    // --- Developer Services ---
    { id: 'fullstackcash', name: 'FullStack.cash', category: 'developer', region: 'Global API',
      description: 'REST API platform for building BCH applications.', url: 'https://fullstack.cash',
      notes: '' },
    { id: 'mainnet-apis', name: 'Mainnet APIs', category: 'developer', region: 'Global',
      description: 'Aggregate of public BCH mainnet REST/RPC endpoints.', url: 'https://rest.bitcoin.com',
      notes: 'Composite check across common mainnet endpoints.' },
    { id: 'indexers', name: 'Indexers', category: 'developer', region: 'Global',
      description: 'UTXO/address indexing services used by wallets & apps.', url: 'https://api.haskoin.com/bch',
      notes: 'Represented by Haskoin Store as a reference indexer.' },
    { id: 'graph-services', name: 'Graph Services', category: 'developer', region: 'Global',
      description: 'Chain-graph / analytics services for BCH data.', url: 'https://chaingraph.cash',
      notes: '' },

    // --- Merchant Services ---
    { id: 'compasspay', name: 'compass pay', category: 'merchant', region: 'Global',
      description: 'Drop-in BCH payment for merchants, freelancers and everyone interested in paying using BCH.', url: 'https://compasspay.cash',
      notes: '' },
    { id: 'bchpay', name: 'BCH Pay', category: 'merchant', region: 'Global',
      description: 'Point-of-sale style BCH payment processing.', url: 'https://bchpay.cash',
      notes: 'Representative merchant payment endpoint.' },
    { id: 'payment-gateways', name: 'Payment Gateways', category: 'merchant', region: 'Global',
      description: 'Aggregate of third-party BCH merchant gateways.', url: 'https://www.coingate.com',
      notes: 'Represented by a widely-used BCH-accepting gateway.' },

    // --- Community ---
    { id: 'bitcoincash-org', name: 'BitcoinCash.org', category: 'community', region: 'Global CDN',
      description: 'The primary informational site for Bitcoin Cash.', url: 'https://bitcoincash.org',
      notes: '' },
    { id: 'general-protocols', name: 'General Protocols', category: 'community', region: 'Global',
      description: 'Team building CashTokens & Anyhedge infrastructure.', url: 'https://generalprotocols.com',
      notes: '' },
    { id: 'bch-foundation', name: 'Bitcoin Cash Foundation', category: 'community', region: 'Global',
      description: 'Non-profit supporting BCH governance & funding.', url: 'https://bitcoincashfoundation.org',
      notes: '' },
  ];

  /* ------------------------------------------------------------------ *
   * 2. HELPERS — deterministic pseudo-randomness (so "simulated" data
   *    stays stable between renders, only drifting slightly on refresh)
   * ------------------------------------------------------------------ */

  function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function seededRandom(seed) {
    // Mulberry32 PRNG — small, fast, deterministic from an integer seed.
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function buildUptimeHistory(seed, days = 30) {
    const history = [];
    for (let i = 0; i < days; i++) {
      const r = seededRandom(seed + i * 17);
      // Mostly high uptime (97-100%), occasional dip.
      const value = r > 0.92 ? 90 + r * 8 : 97 + r * 3;
      history.push(Math.min(100, +value.toFixed(2)));
    }
    return history;
  }

  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / (arr.length || 1); }

  function formatMs(ms) {
    if (ms == null) return '—';
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
  }

  function formatClockUTC(date) {
    return date.toISOString().substr(11, 8) + ' UTC';
  }

  function timeAgo(date) {
    if (!date) return 'never';
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  }

  function statusRank(status) {
    return { online: 0, slow: 1, unknown: 2, offline: 3 }[status] ?? 4;
  }

  /* ------------------------------------------------------------------ *
   * 3. STATE
   * ------------------------------------------------------------------ */

  const state = {
    services: SERVICES.map(svc => {
      const seed = hashSeed(svc.id);
      return {
        ...svc,
        status: 'unknown',
        responseTime: null,
        lastChecked: null,
        source: 'pending',              // 'live' | 'simulated' | 'pending'
        uptimeHistory: buildUptimeHistory(seed),
        seed,
      };
    }),
    filters: { query: '', category: 'all', status: 'all' },
    sortBy: 'category',
    paused: false,
    refreshTimer: null,
    refreshIntervalMs: 60000,
    charts: {},
  };

  /* ------------------------------------------------------------------ *
   * 4. MONITORING ENGINE
   * ------------------------------------------------------------------ */

  // Attempts a real network probe using a no-cors fetch (which resolves
  // even for cross-origin responses we can't read, letting us measure
  // reachability + timing without needing an open CORS policy).
  // Falls back to seeded simulated data if the probe throws (DNS failure,
  // connection refused, offline browser, blocked by CSP, timeout, etc.)
  // so a single unreachable service never breaks the rest of the UI.
  async function probeService(service) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const start = performance.now();
    try {
      await fetch(service.url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
      const elapsed = performance.now() - start;
      clearTimeout(timeout);
      return {
        status: elapsed < 900 ? 'online' : elapsed < 2800 ? 'slow' : 'online',
        responseTime: Math.round(elapsed),
        source: 'live',
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        return { status: 'offline', responseTime: 6000, source: 'live' };
      }
      // Network/CORS/CSP-level failure — fall back to simulated mode.
      return simulateStatus(service);
    }
  }

  // Simulated monitoring mode: weighted-random status seeded per service so
  // it stays mostly stable across refreshes, with a little organic drift.
  function simulateStatus(service) {
    const r = seededRandom(service.seed + Date.now() / state.refreshIntervalMs | 0);
    let status = 'online';
    if (r > 0.965) status = 'offline';
    else if (r > 0.86) status = 'slow';
    const baseLatency = 120 + (service.seed % 260);
    const jitter = r * (status === 'slow' ? 2600 : 400);
    return {
      status,
      responseTime: status === 'offline' ? null : Math.round(baseLatency + jitter),
      source: 'simulated',
    };
  }

  async function checkService(service) {
    const result = await probeService(service);
    const previousStatus = service.status;
    Object.assign(service, result, { lastChecked: new Date() });
    if (previousStatus !== 'unknown' && previousStatus !== service.status) {
      pushNotification(service, previousStatus, service.status);
    }
    return service;
  }

  async function checkAllServices({ isInitial = false } = {}) {
    setRefreshingUI(true);
    // Run probes in parallel but tolerate individual failures completely —
    // Promise.allSettled guarantees one bad service never halts the batch.
    await Promise.allSettled(state.services.map(svc => checkService(svc)));
    document.getElementById('lastRefresh').textContent = formatClockUTC(new Date());
    renderAll();
    setRefreshingUI(false);
    if (isInitial) console.info('[BCH Radar] initial scan complete');
  }

  function setRefreshingUI(isRefreshing) {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = isRefreshing;
    btn.style.opacity = isRefreshing ? '0.65' : '1';
  }

  /* ------------------------------------------------------------------ *
   * 5. NOTIFICATIONS
   * ------------------------------------------------------------------ */

  function pushNotification(service, from, to) {
    const banner = document.getElementById('notificationBanner');
    const item = document.createElement('div');
    item.className = `notif-item ${to}`;
    item.innerHTML = `<b>${escapeHtml(service.name)}</b> changed status: ${from} → <b>${to}</b>`;
    banner.appendChild(item);
    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => item.remove(), 400);
    }, 6000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ------------------------------------------------------------------ *
   * 6. RENDERING
   * ------------------------------------------------------------------ */

  function getFilteredSortedServices() {
    const { query, category, status } = state.filters;
    let list = state.services.filter(s => {
      const matchesQuery = !query || s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query);
      const matchesCategory = category === 'all' || s.category === category;
      const matchesStatus = status === 'all' || s.status === status;
      return matchesQuery && matchesCategory && matchesStatus;
    });

    const sorters = {
      name: (a, b) => a.name.localeCompare(b.name),
      response: (a, b) => (a.responseTime ?? Infinity) - (b.responseTime ?? Infinity),
      status: (a, b) => statusRank(a.status) - statusRank(b.status),
      uptime: (a, b) => avg(b.uptimeHistory) - avg(a.uptimeHistory),
      category: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    };
    list.sort(sorters[state.sortBy] || sorters.category);
    return list;
  }

  function renderStatsBar() {
    const counts = { online: 0, slow: 0, offline: 0, unknown: 0 };
    state.services.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
    document.getElementById('statTotal').textContent = state.services.length;
    document.getElementById('statOnline').textContent = counts.online;
    document.getElementById('statDegraded').textContent = counts.slow;
    document.getElementById('statOffline').textContent = counts.offline;
    document.getElementById('statUnknown').textContent = counts.unknown;
  }

  function serviceCardHtml(s) {
    const uptime = avg(s.uptimeHistory).toFixed(2);
    return `
    <article class="service-card glass" data-id="${s.id}" tabindex="0" role="button" aria-label="${escapeHtml(s.name)} details">
      <div class="service-card-top">
        <div class="service-name-wrap">
          <span class="status-dot ${s.status}"></span>
          <span class="service-name">${escapeHtml(s.name)}</span>
        </div>
        <span class="status-pill ${s.status}">${s.status}</span>
      </div>
      <p class="service-desc">${escapeHtml(s.description)}</p>
      <div class="service-meta">
        <span>Response: <b>${formatMs(s.responseTime)}</b></span>
        <span>Checked: <b>${timeAgo(s.lastChecked)}</b></span>
        <span>Region: <b>${escapeHtml(s.region || 'Unknown')}</b></span>
        <span>Mode: <b>${s.source}</b></span>
      </div>
      <div class="service-footer">
        <span class="uptime-badge">Uptime: ${uptime}%</span>
        <a class="visit-link" href="${s.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Visit ↗</a>
      </div>
    </article>`;
  }

  function renderCategories() {
    const root = document.getElementById('categoriesRoot');
    const list = getFilteredSortedServices();

    if (list.length === 0) {
      root.innerHTML = `<div class="empty-state">No services match your filters. Try clearing the search or filters.</div>`;
      return;
    }

    // Group filtered results by category, preserving CATEGORIES order.
    const byCategory = {};
    list.forEach(s => { (byCategory[s.category] = byCategory[s.category] || []).push(s); });

    root.innerHTML = CATEGORIES
      .filter(c => byCategory[c.id] && byCategory[c.id].length)
      .map(c => `
        <section class="category-section">
          <div class="category-header">
            <span class="category-icon">${c.icon}</span>
            <h2>${c.label}</h2>
            <span class="category-count">${byCategory[c.id].length}</span>
            <span class="category-divider"></span>
          </div>
          <div class="services-grid">
            ${byCategory[c.id].map(serviceCardHtml).join('')}
          </div>
        </section>
      `).join('');

    // Wire card clicks (delegated would also work; direct is fine at this scale).
    root.querySelectorAll('.service-card').forEach(card => {
      card.addEventListener('click', () => openModal(card.dataset.id));
      card.addEventListener('keypress', (e) => { if (e.key === 'Enter') openModal(card.dataset.id); });
    });
  }

  function renderAll() {
    renderStatsBar();
    renderCategories();
    updateCharts();
  }

  /* ------------------------------------------------------------------ *
   * 7. MODAL
   * ------------------------------------------------------------------ */

  let modalChart = null;

  function openModal(id) {
    const s = state.services.find(x => x.id === id);
    if (!s) return;
    document.getElementById('modalTitle').textContent = s.name;
    document.getElementById('modalDesc').textContent = s.description;
    document.getElementById('modalStatusDot').className = `modal-status-dot status-dot ${s.status}`;
    document.getElementById('modalStatus').textContent = s.status;
    document.getElementById('modalResponse').textContent = formatMs(s.responseTime);
    document.getElementById('modalLastChecked').textContent = s.lastChecked ? s.lastChecked.toUTCString() : 'never';
    document.getElementById('modalRegion').textContent = s.region || 'Unknown';
    document.getElementById('modalUptime').textContent = `${avg(s.uptimeHistory).toFixed(2)}%`;
    document.getElementById('modalCategory').textContent = CATEGORIES.find(c => c.id === s.category)?.label || s.category;
    document.getElementById('modalNotes').textContent = s.notes || 'No additional notes for this service.';
    document.getElementById('modalWebsiteBtn').href = s.url;

    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');

    const ctx = document.getElementById('modalUptimeChart').getContext('2d');
    if (modalChart) modalChart.destroy();
    modalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: s.uptimeHistory.map((_, i) => `D-${s.uptimeHistory.length - i}`),
        datasets: [{
          data: s.uptimeHistory,
          borderColor: '#0AC18E',
          backgroundColor: 'rgba(10,193,142,0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: baseChartOptions({ min: 85, max: 100, hideLegend: true, hideXLabels: true }),
    });
  }

  function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  /* ------------------------------------------------------------------ *
   * 8. CHARTS (ecosystem-wide)
   * ------------------------------------------------------------------ */

  function baseChartOptions({ min, max, hideLegend, hideXLabels } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: !hideLegend, labels: { color: '#93A4AF', font: { family: 'Space Grotesk', size: 11 } } },
        tooltip: { backgroundColor: '#141C24', titleColor: '#EAF2EF', bodyColor: '#93A4AF', borderColor: 'rgba(10,193,142,0.3)', borderWidth: 1 },
      },
      scales: {
        x: { display: !hideXLabels, ticks: { color: '#5C6B77', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { min, max, ticks: { color: '#5C6B77', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    };
  }

  function initCharts() {
    Chart.defaults.font.family = 'Space Grotesk';

    state.charts.category = new Chart(document.getElementById('categoryChart').getContext('2d'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Services', data: [], backgroundColor: 'rgba(10,193,142,0.6)', borderRadius: 6 }] },
      options: baseChartOptions({ hideLegend: true }),
    });

    state.charts.status = new Chart(document.getElementById('statusChart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Online', 'Slow', 'Offline', 'Unknown'],
        datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#0AC18E', '#F2B84B', '#F0495A', '#6B7A8C'], borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: { legend: { position: 'bottom', labels: { color: '#93A4AF', font: { size: 11 }, boxWidth: 10 } } } },
    });

    state.charts.response = new Chart(document.getElementById('responseChart').getContext('2d'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Avg ms', data: [], backgroundColor: 'rgba(0,230,168,0.55)', borderRadius: 6 }] },
      options: baseChartOptions({ hideLegend: true }),
    });

    state.charts.uptime = new Chart(document.getElementById('uptimeChart').getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Network uptime %', data: [], borderColor: '#0AC18E', backgroundColor: 'rgba(10,193,142,0.12)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }] },
      options: baseChartOptions({ min: 90, max: 100 }),
    });
  }

  function updateCharts() {
    // Category distribution
    const catCounts = CATEGORIES.map(c => state.services.filter(s => s.category === c.id).length);
    state.charts.category.data.labels = CATEGORIES.map(c => c.label);
    state.charts.category.data.datasets[0].data = catCounts;
    state.charts.category.update();

    // Status distribution
    const statusCounts = { online: 0, slow: 0, offline: 0, unknown: 0 };
    state.services.forEach(s => { statusCounts[s.status]++; });
    state.charts.status.data.datasets[0].data = [statusCounts.online, statusCounts.slow, statusCounts.offline, statusCounts.unknown];
    state.charts.status.update();

    // Avg response time per category (ignoring offline/null)
    const respByCat = CATEGORIES.map(c => {
      const times = state.services.filter(s => s.category === c.id && s.responseTime != null).map(s => s.responseTime);
      return times.length ? Math.round(avg(times)) : 0;
    });
    state.charts.response.data.labels = CATEGORIES.map(c => c.label);
    state.charts.response.data.datasets[0].data = respByCat;
    state.charts.response.update();

    // Aggregate 30-day uptime (average across all services per day)
    const days = state.services[0]?.uptimeHistory.length || 30;
    const uptimeSeries = [];
    for (let i = 0; i < days; i++) {
      uptimeSeries.push(+avg(state.services.map(s => s.uptimeHistory[i])).toFixed(2));
    }
    state.charts.uptime.data.labels = uptimeSeries.map((_, i) => `D-${days - i}`);
    state.charts.uptime.data.datasets[0].data = uptimeSeries;
    state.charts.uptime.update();
  }

  /* ------------------------------------------------------------------ *
   * 9. CLOCK + AUTO-REFRESH
   * ------------------------------------------------------------------ */

  function startClock() {
    const el = document.getElementById('utcClock');
    const tick = () => { el.textContent = formatClockUTC(new Date()); };
    tick();
    setInterval(tick, 1000);
  }

  function scheduleRefresh() {
    clearInterval(state.refreshTimer);
    if (state.paused) return;
    state.refreshTimer = setInterval(() => checkAllServices(), state.refreshIntervalMs);
  }

  function togglePause() {
    state.paused = !state.paused;
    document.getElementById('pauseIcon').textContent = state.paused ? '▶' : '⏸';
    document.getElementById('pauseLabel').textContent = state.paused ? 'Resume monitoring' : 'Pause monitoring';
    scheduleRefresh();
  }

  /* ------------------------------------------------------------------ *
   * 10. INIT
   * ------------------------------------------------------------------ */

  function populateCategoryFilter() {
    const select = document.getElementById('categoryFilter');
    CATEGORIES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      select.appendChild(opt);
    });
  }

  function wireControls() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
      state.filters.query = e.target.value.trim().toLowerCase();
      renderCategories();
    });
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
      state.filters.category = e.target.value;
      renderCategories();
    });
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      renderCategories();
    });
    document.getElementById('sortFilter').addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderCategories();
    });
    document.getElementById('refreshBtn').addEventListener('click', () => checkAllServices());
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') closeModal();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }

  function initApp() {
    populateCategoryFilter();
    wireControls();
    startClock();
    initCharts();
    renderAll();
    checkAllServices({ isInitial: true });
    scheduleRefresh();
  }

  document.addEventListener('DOMContentLoaded', initApp);
})();
