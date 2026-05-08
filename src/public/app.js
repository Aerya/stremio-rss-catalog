/**
 * Stremio RSS Catalog — App JS
 * Gère toute la logique client : navigation, chargement des données, UI.
 */

// ═══════════════════════════ NAVIGATION ════════════════════════════════

function navigate(sectionId) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.remove('active'));

  const section = document.getElementById('section-' + sectionId);
  if (section) section.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (sectionId === 'library')  loadLibrary();
  if (sectionId === 'sources')  loadSources();
  if (sectionId === 'sync')     { loadAutoRefreshStatus(); loadSyncHistory(); }
  if (sectionId === 'failures') loadFailed();
  if (sectionId === 'config')   loadConfig();
  if (sectionId === 'overview') loadStats();
}

document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.section));
});

// ═══════════════════════════ THEME ═════════════════════════════════════

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  document.getElementById('themeBtn').textContent = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('theme', next);
}

function applyTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = saved === 'dark' ? '🌙' : '☀️';
}

// ═══════════════════════════ LOGOUT ════════════════════════════════════

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

// ═══════════════════════════ STATS ═════════════════════════════════════

async function loadStats() {
  try {
    const r = await fetch('/api/stats');
    const d = await r.json();
    document.getElementById('statFilms').textContent     = d.films.toLocaleString();
    document.getElementById('statDocs').textContent      = d.documentaires.toLocaleString();
    document.getElementById('statSeries').textContent    = d.series.toLocaleString();
    document.getElementById('statEmissions').textContent = d.emissions.toLocaleString();
    document.getElementById('statTotal').textContent     = d.total.toLocaleString();
  } catch (e) { console.error('loadStats', e); }
}

function loadInstallUrl() {
  const url = `${location.protocol}//${location.host}/manifest.json`;
  document.getElementById('installUrl').textContent = url;
}

window.copyInstallUrl = function () {
  const url = document.getElementById('installUrl').textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => alert(t('install_copied')));
  } else {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    alert(t('install_copied'));
  }
};

// ═══════════════════════════ LIBRARY ═══════════════════════════════════

let libPage = 1;
let libCatalog = '';
let libSearch = '';
let libSearchTimer = null;
let libLoading = false;

function debounceLibSearch() {
  clearTimeout(libSearchTimer);
  libSearchTimer = setTimeout(() => {
    libSearch = document.getElementById('libSearch').value.trim();
    libPage = 1;
    loadLibrary();
  }, 350);
}
window.debounceLibSearch = debounceLibSearch;

document.querySelectorAll('.tab-btn[data-catalog]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    libCatalog = btn.dataset.catalog;
    libPage = 1;
    loadLibrary();
  });
});

async function loadLibrary() {
  if (libLoading) return;
  libLoading = true;
  const grid = document.getElementById('libraryGrid');
  grid.innerHTML = '<p class="text-muted" style="padding:20px">' + t('sync_loading') + '</p>';

  try {
    const params = new URLSearchParams({ page: libPage, limit: 24 });
    if (libCatalog) params.append('catalog', libCatalog);
    if (libSearch)  params.append('search',  libSearch);

    const r = await fetch('/api/media/list?' + params);
    const d = await r.json();
    renderMediaGrid(d);
  } catch (e) {
    grid.innerHTML = '<p class="text-muted">Erreur de chargement</p>';
    console.error('loadLibrary', e);
  } finally { libLoading = false; }
}

function renderMediaGrid(data) {
  const grid  = document.getElementById('libraryGrid');
  const pager = document.getElementById('libraryPager');

  if (!data.items || data.items.length === 0) {
    grid.innerHTML  = '<p class="text-muted" style="padding:20px">' + t('library_no_results') + '</p>';
    pager.innerHTML = '';
    return;
  }

  grid.innerHTML = data.items.map(m => {
    const posterHtml = m.poster
      ? `<img class="media-poster" src="${escHtml(m.poster)}" alt="${escHtml(m.name)}" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const phStyle = m.poster ? 'style="display:none"' : '';
    const emoji = { films: '🎬', documentaires: '📽️', series: '📺', emissions: '📡' }[m.catalog_type] || '🎬';
    const badgeCls = 'catalog-badge badge-' + m.catalog_type;
    const mediaJson = JSON.stringify(m).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `<div class="media-card" onclick="openDrawer('${escHtml(m.imdb_id)}', JSON.parse(this.dataset.media))" data-media="${mediaJson}">
      ${posterHtml}
      <div class="media-poster-placeholder" ${phStyle}>${emoji}</div>
      <div class="media-info">
        <div class="media-title" title="${escHtml(m.name)}">${escHtml(m.name)}</div>
        <div class="media-meta">
          <span class="media-year">${m.year || '—'}</span>
          <span class="media-rlz">${m.release_count || 0} rlz</span>
        </div>
        <div style="margin-top:5px"><span class="${badgeCls}">${m.catalog_type}</span></div>
      </div>
    </div>`;
  }).join('');

  // Pagination
  pager.innerHTML = '';
  if (data.pages > 1) {
    const prev = document.createElement('button');
    prev.className = 'pager-btn';
    prev.textContent = '← Préc.';
    prev.disabled = data.page <= 1;
    prev.onclick = () => { libPage = data.page - 1; loadLibrary(); };
    pager.appendChild(prev);

    const info = document.createElement('span');
    info.className = 'pager-info';
    info.textContent = `Page ${data.page} / ${data.pages}  (${data.total.toLocaleString()} médias)`;
    pager.appendChild(info);

    const next = document.createElement('button');
    next.className = 'pager-btn';
    next.textContent = 'Suiv. →';
    next.disabled = data.page >= data.pages;
    next.onclick = () => { libPage = data.page + 1; loadLibrary(); };
    pager.appendChild(next);
  } else if (data.total > 0) {
    const info = document.createElement('span');
    info.className = 'pager-info';
    info.textContent = `${data.total.toLocaleString()} médias`;
    pager.appendChild(info);
  }
}

// ═══════════════════════════ DRAWER ════════════════════════════════════

function openDrawer(imdbId, media) {
  const drawer   = document.getElementById('releasesDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const info     = document.getElementById('drawerInfo');
  const body     = document.getElementById('drawerBody');

  const badgeCls = 'catalog-badge badge-' + media.catalog_type;
  info.innerHTML = `
    <div class="drawer-title">${escHtml(media.name)}${media.year ? ` <span style="font-weight:400;color:var(--text-muted)">(${media.year})</span>` : ''}</div>
    <div class="drawer-subtitle" style="margin-top:6px">
      <span class="${badgeCls}" style="margin-right:8px">${media.catalog_type}</span>
      ${media.vote_average ? `⭐ ${Number(media.vote_average).toFixed(1)} &nbsp;·&nbsp; ` : ''}
      IMDB: <a href="https://www.imdb.com/title/${escHtml(imdbId)}" target="_blank">${escHtml(imdbId)}</a>
    </div>
    ${media.description ? `<p style="margin-top:10px;font-size:13px;color:var(--text-muted);line-height:1.6">${escHtml(media.description.substring(0, 220))}${media.description.length > 220 ? '…' : ''}</p>` : ''}
  `;

  body.innerHTML = '<p class="text-muted">' + t('sync_loading') + '</p>';
  backdrop.classList.add('open');
  drawer.classList.add('open');

  fetch('/api/media/' + encodeURIComponent(imdbId) + '/releases')
    .then(r => r.json())
    .then(releases => {
      if (!releases.length) {
        body.innerHTML = '<p class="text-muted">' + t('library_releases_none') + '</p>';
        return;
      }
      const src = releases.find(r => r.source_url)?.source_url;
      body.innerHTML = `
        <p class="text-muted" style="margin-bottom:12px">${releases.length} release${releases.length > 1 ? 's' : ''}</p>
        <div style="overflow-x:auto">
        <table class="releases-table">
          <thead><tr>
            <th data-i18n="library_col_name">Nom</th>
            <th data-i18n="library_col_quality">Qualité</th>
            <th data-i18n="library_col_hash">Hash</th>
            <th data-i18n="library_col_date">Date</th>
          </tr></thead>
          <tbody>
            ${releases.map(r => `<tr>
              <td style="font-size:11px;max-width:200px">${escHtml(r.release_name)}</td>
              <td>${r.quality ? `<span class="quality-badge">${escHtml(r.quality)}</span>` : '<span class="text-muted">—</span>'}</td>
              <td>${r.hash ? `<span class="hash-mono" title="${escHtml(r.hash)}">${r.hash.substring(0,10)}…</span>` : '<span class="text-muted">—</span>'}</td>
              <td style="white-space:nowrap;font-size:11px;color:var(--text-muted)">${fmtDate(r.added_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>
        ${src ? `<p style="margin-top:14px;font-size:12px;color:var(--text-muted)">Source : <span style="font-family:monospace">${escHtml(trimUrl(src))}</span></p>` : ''}
      `;
      applyI18nToElement(body);
    })
    .catch(() => { body.innerHTML = '<p class="text-muted">Erreur de chargement</p>'; });
}
window.openDrawer = openDrawer;

function closeDrawer() {
  document.getElementById('releasesDrawer').classList.remove('open');
  document.getElementById('drawerBackdrop').classList.remove('open');
}
window.closeDrawer = closeDrawer;

// ═══════════════════════════ SOURCES ═══════════════════════════════════

async function loadSources() {
  const container = document.getElementById('sourcesContainer');
  container.innerHTML = '<p class="text-muted">' + t('sync_loading') + '</p>';

  try {
    const r = await fetch('/api/sources/stats');
    const d = await r.json();

    if (!d.length) {
      container.innerHTML = '<p class="text-muted">' + t('sources_none') + '</p>';
      return;
    }

    container.innerHTML = `
      <div style="overflow-x:auto">
      <table class="sources-table">
        <thead><tr>
          <th data-i18n="sources_url">Flux RSS</th>
          <th data-i18n="sources_releases">Releases</th>
          <th data-i18n="sources_media">Médias</th>
          <th data-i18n="sources_last_seen">Dernier ajout</th>
        </tr></thead>
        <tbody>
          ${d.map(s => `<tr>
            <td><span class="source-url" title="${escHtml(s.source_url)}">${escHtml(trimUrl(s.source_url))}</span></td>
            <td><span class="source-num">${s.release_count.toLocaleString()}</span></td>
            <td><span class="source-num">${s.media_count.toLocaleString()}</span></td>
            <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${fmtDate(s.last_seen)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
    `;
    applyI18nToElement(container);
  } catch (e) {
    container.innerHTML = '<p class="text-muted">Erreur de chargement</p>';
    console.error('loadSources', e);
  }
}
window.loadSources = loadSources;

// ═══════════════════════════ SYNC ══════════════════════════════════════

let syncPoller = null;

async function loadAutoRefreshStatus() {
  try {
    const r = await fetch('/api/config');
    const cfg = await r.json();
    const enabled  = cfg.auto_refresh_enabled === 'true';
    const interval = cfg.refresh_interval || '180';
    const state = document.getElementById('autoRefreshState');
    if (enabled) {
      state.textContent = '✅ ' + t('sync_auto_enabled') + ' (' + interval + ' min)';
      state.style.color = 'var(--success)';
    } else {
      state.textContent = '⏸ ' + t('sync_auto_disabled');
      state.style.color = 'var(--text-muted)';
    }
  } catch (e) { console.error('loadAutoRefreshStatus', e); }
}

async function startSync() {
  try {
    const r = await fetch('/api/sync', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { alert(d.error || 'Erreur'); return; }
    document.getElementById('syncStatusBox').style.display = 'block';
    pollSync();
  } catch (e) { alert('Erreur réseau'); }
}
window.startSync = startSync;

function pollSync() {
  if (syncPoller) clearInterval(syncPoller);
  syncPoller = setInterval(async () => {
    try {
      const r  = await fetch('/api/sync/status');
      const st = await r.json();
      updateSyncUI(st);
      if (!st.running) {
        clearInterval(syncPoller);
        syncPoller = null;
        loadStats();
        loadSyncHistory();
      }
    } catch (e) { console.error('pollSync', e); }
  }, 1500);
}

function updateSyncUI(st) {
  if (!st) return;
  document.getElementById('syncStatusBox').style.display = 'block';
  document.getElementById('syncStage').textContent = st.stage || '';
  const pct = st.total ? Math.round((st.progress / st.total) * 100) : 0;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressText').textContent = pct + '%';
  document.getElementById('syncDetails').textContent =
    `Matched: ${st.matched || 0} | Failed: ${st.failed || 0} | Déjà en base: ${st.alreadyInDb || 0}`;
}

async function loadSyncHistory() {
  try {
    const rd = await fetch('/api/sync/history/dates');
    const dates = await rd.json();
    const sel = document.getElementById('dateFilter');
    const cur = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    dates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.date;
      opt.textContent = d.date + ' (' + d.count + ')';
      sel.appendChild(opt);
    });
    sel.value = cur;
  } catch (e) { console.error('loadDates', e); }
  loadSyncHistoryByDate();
}

async function loadSyncHistoryByDate() {
  const date = document.getElementById('dateFilter').value;
  const container = document.getElementById('syncHistoryContainer');
  container.innerHTML = '<p class="text-muted">' + t('sync_loading') + '</p>';
  try {
    const url = date
      ? '/api/sync/history/by-date?date=' + encodeURIComponent(date)
      : '/api/sync/history?limit=3';
    const r = await fetch(url);
    const data = await r.json();
    renderSyncHistory(container, data);
  } catch (e) { container.innerHTML = '<p class="text-muted">Erreur</p>'; }
}
window.loadSyncHistoryByDate = loadSyncHistoryByDate;

function renderSyncHistory(container, items) {
  if (!items.length) {
    container.innerHTML = '<p class="text-muted">' + t('sync_none') + '</p>';
    return;
  }
  container.innerHTML = items.map(s => {
    const cls  = s.status === 'error' ? 'error' : s.status === 'running' ? 'running' : '';
    const dur  = s.finished_at ? Math.round((s.finished_at - s.started_at) / 1000) + 's' : '—';
    const rate = s.total_items > 0 ? Math.round((s.matched_items / s.total_items) * 100) : 0;
    const statusStr = s.status === 'error'   ? '✗ ' + t('sync_error')
                    : s.status === 'running' ? '⏳ ' + t('sync_running')
                    : '✓ ' + t('sync_completed');
    return `<div class="history-item ${cls}">
      <div class="history-meta">
        ${new Date(s.started_at).toLocaleString()} — ${dur}
        &nbsp;·&nbsp; <strong>${statusStr}</strong>
        ${s.error_message ? `<br><span style="color:var(--danger)">${escHtml(s.error_message)}</span>` : ''}
      </div>
      <div class="history-stats">
        <div class="history-stat"><span class="history-stat-label">${t('sync_releases')}</span><span class="history-stat-value">${s.total_items}</span></div>
        <div class="history-stat"><span class="history-stat-label">${t('sync_matched')}</span><span class="history-stat-value">${s.matched_items}</span></div>
        <div class="history-stat"><span class="history-stat-label">${t('sync_match_rate')}</span><span class="history-stat-value">${rate}%</span></div>
        <div class="history-stat"><span class="history-stat-label">${t('sync_already_in_db')}</span><span class="history-stat-value">${s.already_in_db || 0}</span></div>
        <div class="history-stat"><span class="history-stat-label">${t('sync_films')}</span><span class="history-stat-value">${s.films_added || 0}</span></div>
        <div class="history-stat"><span class="history-stat-label">${t('sync_docs')}</span><span class="history-stat-value">${s.documentaires_added || 0}</span></div>
        <div class="history-stat"><span class="history-stat-label">${t('sync_series')}</span><span class="history-stat-value">${s.series_added || 0}</span></div>
        <div class="history-stat"><span class="history-stat-label">${t('sync_failed')}</span><span class="history-stat-value">${s.failed_items}</span></div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════ FAILED ════════════════════════════════════

async function loadFailed() {
  const container = document.getElementById('failedContainer');
  const countEl   = document.getElementById('failedCount');
  container.innerHTML = '<p class="text-muted">' + t('sync_loading') + '</p>';
  try {
    const r = await fetch('/api/failed?limit=200');
    const d = await r.json();
    const badge = document.getElementById('failuresBadge');
    if (d.total > 0) {
      badge.textContent = d.total > 99 ? '99+' : d.total;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
    countEl.textContent = d.total + ' release(s) non matchée(s)';

    if (!d.items.length) {
      container.innerHTML = '<p class="text-muted">' + t('failed_none') + '</p>';
      return;
    }
    container.innerHTML = `<div style="overflow-x:auto">
      <table class="failed-table">
        <thead><tr>
          <th>Release</th><th>Catalogue</th><th>Raison</th><th>Essais</th><th></th>
        </tr></thead>
        <tbody>
          ${d.items.map(f => `<tr id="failed-${f.id}">
            <td><strong style="font-size:12px">${escHtml(f.clean_name || f.release_name)}</strong>
            ${f.year ? `<br><span style="font-size:11px;color:var(--text-muted)">${f.year}</span>` : ''}</td>
            <td><span class="catalog-badge badge-${f.catalog_type || 'films'}">${f.catalog_type || '—'}</span></td>
            <td style="font-size:12px;color:var(--text-muted);max-width:200px">${escHtml(f.fail_reason || '—')}</td>
            <td style="text-align:center">${f.retry_count || 0}</td>
            <td><button class="btn-sm btn-danger" onclick="deleteFailed(${f.id})">✕</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>`;
  } catch (e) {
    container.innerHTML = '<p class="text-muted">Erreur de chargement</p>';
    console.error('loadFailed', e);
  }
}

async function deleteFailed(id) {
  await fetch('/api/failed/' + id, { method: 'DELETE' });
  const row = document.getElementById('failed-' + id);
  if (row) row.remove();
}
window.deleteFailed = deleteFailed;

async function retryFailed() {
  if (!confirm('Relancer le matching sur toutes les releases échouées ?')) return;
  try {
    const r = await fetch('/api/failed/retry', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { alert(d.error || 'Erreur'); return; }
    navigate('sync');
    document.getElementById('syncStatusBox').style.display = 'block';
    pollSync();
  } catch (e) { alert('Erreur réseau'); }
}
window.retryFailed = retryFailed;

async function clearFailed() {
  if (!confirm('Vider toutes les releases échouées ?')) return;
  await fetch('/api/failed', { method: 'DELETE' });
  loadFailed();
}
window.clearFailed = clearFailed;

// ═══════════════════════════ CONFIG ════════════════════════════════════

let rssFieldCounter = 0;

window.addRssField = function (value, force) {
  rssFieldCounter++;
  const container = document.getElementById('additionalRssContainer');
  if (!container) return;
  const id  = 'rss-field-' + rssFieldCounter;
  const div = document.createElement('div');
  div.className = 'rss-field-row';
  div.id = id;
  div.innerHTML = `
    <input type="url" class="additional-rss-url flex-1"
      placeholder="https://domain.tld/rssnew?cats=...&key=..."
      value="${escHtml(value || '')}">
    <select class="additional-rss-force select-catalog">
      <option value="auto"${(!force || force === 'auto') ? ' selected' : ''}>Tout</option>
      <option value="films"${force === 'films' ? ' selected' : ''}>Films</option>
      <option value="series"${force === 'series' ? ' selected' : ''}>Séries</option>
      <option value="documentaires"${force === 'documentaires' ? ' selected' : ''}>Documentaires</option>
      <option value="emissions"${force === 'emissions' ? ' selected' : ''}>Émissions TV</option>
    </select>
    <button type="button" class="btn-sm btn-danger"
      onclick="document.getElementById('${id}').remove()"
      data-i18n="config_rss_remove_btn">✕</button>
  `;
  container.appendChild(div);
};

// ═══════════════════════════ INTEGRATIONS ══════════════════════════════

window.addProwlarrFeed = function (force) {
  const url = (document.getElementById('prowlarr_url')?.value || '').trim().replace(/\/$/, '');
  const key = (document.getElementById('prowlarr_apikey')?.value || '').trim();
  if (!url || !key) { alert(t('integrations_missing_fields')); return; }
  const cat = force === 'films' ? '&cat=2000' : force === 'series' ? '&cat=5000' : '';
  addRssField(`${url}/api/v1/indexer/all/newznab?apikey=${key}&t=rss${cat}`, force === 'auto' ? 'auto' : force);
};

window.addNzbHydraFeed = function (cat) {
  const url = (document.getElementById('nzbhydra2_url')?.value || '').trim().replace(/\/$/, '');
  const key = (document.getElementById('nzbhydra2_apikey')?.value || '').trim();
  if (!url || !key) { alert(t('integrations_missing_fields')); return; }
  let rssUrl = `${url}/api?t=rss&apikey=${key}`;
  if (cat) rssUrl += `&cat=${cat}`;
  const force = cat === '2000' ? 'films' : cat === '5000' ? 'series' : 'auto';
  addRssField(rssUrl, force);
};

async function loadConfig() {
  try {
    const r = await fetch('/api/config');
    const cfg = await r.json();

    ['rss_films_url', 'rss_films_force', 'required_tags', 'tmdb_api_key', 'tvdb_api_key',
     'rpdb_api_key', 'proxy_protocol', 'proxy_host', 'proxy_port', 'proxy_username',
     'proxy_password', 'refresh_interval', 'discord_webhook_url',
     'prowlarr_url', 'prowlarr_apikey', 'nzbhydra2_url', 'nzbhydra2_apikey'].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.value = cfg[k] || '';
    });

    ['rpdb_enabled', 'proxy_enabled', 'auto_refresh_enabled',
     'discord_notifications_enabled', 'discord_enhanced_notifications_enabled',
     'discord_rpdb_posters_enabled'].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.checked = cfg[k] === 'true';
    });

    const container = document.getElementById('additionalRssContainer');
    container.innerHTML = '';
    rssFieldCounter = 0;
    try {
      const urls = JSON.parse(cfg.rss_additional_urls || '[]');
      urls.forEach(item => {
        if (typeof item === 'object') addRssField(item.url, item.force);
        else addRssField(item, 'auto');
      });
    } catch (e) { console.error('parse rss_additional_urls', e); }

  } catch (e) { console.error('loadConfig', e); }
}

async function saveConfig(e) {
  e.preventDefault();
  const msg = document.getElementById('configMsg');
  msg.textContent = '';

  const cfg = {};
  ['rss_films_url', 'rss_films_force', 'required_tags', 'tmdb_api_key', 'tvdb_api_key',
   'rpdb_api_key', 'proxy_protocol', 'proxy_host', 'proxy_port', 'proxy_username',
   'proxy_password', 'refresh_interval', 'discord_webhook_url',
   'prowlarr_url', 'prowlarr_apikey', 'nzbhydra2_url', 'nzbhydra2_apikey'].forEach(k => {
    const el = document.getElementById(k);
    if (el) cfg[k] = el.value;
  });

  ['rpdb_enabled', 'proxy_enabled', 'auto_refresh_enabled',
   'discord_notifications_enabled', 'discord_enhanced_notifications_enabled',
   'discord_rpdb_posters_enabled'].forEach(k => {
    const el = document.getElementById(k);
    if (el) cfg[k] = el.checked ? 'true' : 'false';
  });

  const urls = [];
  document.querySelectorAll('.rss-field-row').forEach(row => {
    const url   = row.querySelector('.additional-rss-url')?.value?.trim();
    const force = row.querySelector('.additional-rss-force')?.value || 'auto';
    if (url) urls.push({ url, force });
  });
  cfg.rss_additional_urls = JSON.stringify(urls);

  try {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    const d = await r.json();
    if (r.ok) {
      msg.textContent = '✓ ' + t('config_saved_ok');
      msg.className = 'config-msg ok';
    } else {
      msg.textContent = '✗ ' + (d.error || t('config_saved_err'));
      msg.className = 'config-msg err';
    }
  } catch {
    msg.textContent = '✗ Erreur réseau';
    msg.className = 'config-msg err';
  }
  setTimeout(() => { msg.textContent = ''; }, 4000);
}
window.saveConfig = saveConfig;

// ═══════════════════════════ HELPERS ═══════════════════════════════════

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(navigator.language, {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function trimUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    ['key', 'apikey', 'passkey', 'api_key', 'token', 'password', 'secret', 'rsskey'].forEach(p => {
      if (u.searchParams.has(p)) u.searchParams.set(p, '***');
    });
    return u.toString();
  } catch { return url; }
}

function applyI18nToElement(el) {
  if (!el) return;
  el.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.getAttribute('data-i18n');
    const val = typeof t === 'function' ? t(key) : null;
    if (val) node.textContent = val;
  });
}

// ═══════════════════════════ INIT ══════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  initI18n();
  loadStats();
  loadInstallUrl();

  // Vérifier si une sync est en cours au chargement
  fetch('/api/sync/status').then(r => r.json()).then(st => {
    if (st && st.running) {
      navigate('sync');
      updateSyncUI(st);
      pollSync();
    }
  }).catch(() => {});
});
