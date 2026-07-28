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

  if (sectionId === 'library')  {
    const limitEl = document.getElementById('libLimit');
    if (limitEl) limitEl.value = libLimit;
    loadRpdbConfig().then(() => loadLibrary()); loadLibraryCounts(); loadYearsFilter();
  }
  if (sectionId === 'sources')  loadSourceManager();
  if (sectionId === 'catalogs') loadCatalogManager();
  if (sectionId === 'sync')     { loadAutoRefreshStatus(); loadSyncHistory(); }
  if (sectionId === 'failures') loadFailed();
  if (sectionId === 'config')   loadConfig();
  if (sectionId === 'overview') { loadStats(); loadOverview(); }
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

// ═══════════════════════════ OVERVIEW ══════════════════════════════════

async function loadOverview() {
  try {
    const r = await fetch('/api/overview');
    const d = await r.json();

    // Dernière sync
    if (d.lastSync) {
      const s = d.lastSync;
      const date = new Date(s.started_at);
      document.getElementById('ovLastSyncDate').textContent =
        date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) + ' ' +
        date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
      const dur = s.duration_seconds ? `${s.duration_seconds}s` : '—';
      const ok  = s.status === 'completed';
      const icon = ok ? '✓' : '✗';
      document.getElementById('ovLastSyncStats').innerHTML =
        `<span style="color:var(--${ok ? 'success' : 'danger'})">${icon}</span> ` +
        `${(s.matched_items || 0)} matchées · ${(s.failed_items || 0)} échecs · ${dur}`;
    } else {
      document.getElementById('ovLastSyncDate').textContent = t('sync_none');
    }

    // Releases en attente
    const failedEl = document.getElementById('ovFailedCount');
    failedEl.textContent = d.failedCount.toLocaleString();
    failedEl.style.color = d.failedCount > 0 ? 'var(--warning)' : 'var(--success)';
    document.getElementById('ovFailed').classList.toggle('ov-has-alert', d.failedCount > 0);

    // Sources RSS
    document.getElementById('ovSourcesCount').textContent = d.sourcesCount.toLocaleString();

    // Derniers ajouts par catégorie — vue liste compacte
    const container = document.getElementById('ovRecentGrid');
    const cats = [
      { key: 'films',         label: t('stat_films'),         badge: 'films',         items: d.recentByCat?.films         || [] },
      { key: 'documentaires', label: t('stat_documentaires'), badge: 'documentaires', items: d.recentByCat?.documentaires || [] },
      { key: 'series',        label: t('stat_series'),        badge: 'series',        items: d.recentByCat?.series        || [] },
      { key: 'emissions',     label: t('stat_emissions'),     badge: 'emissions',     items: d.recentByCat?.emissions     || [] },
      { key: 'animés',        label: t('stat_animes'),        badge: 'animés',        items: d.recentByCat?.animes        || [] },
      { key: 'concerts',      label: t('stat_concerts'),      badge: 'concerts',      items: d.recentByCat?.concerts      || [] },
      { key: 'spectacles',    label: t('stat_spectacles'),    badge: 'spectacles',    items: d.recentByCat?.spectacles    || [] }
    ].filter(c => c.items.length > 0);

    if (cats.length === 0) {
      container.innerHTML = `<p class="text-muted">${t('library_no_results')}</p>`;
      return;
    }

    const renderRow = (m) => {
      const title = escHtml(m.title || m.name || m.imdb_id || '—');
      const year  = m.year ? `<span class="ov-row-year">${m.year}</span>` : '';
      const imdb  = m.imdb_id
        ? `<a class="ov-row-imdb" href="https://www.imdb.com/title/${escHtml(m.imdb_id)}" target="_blank">${escHtml(m.imdb_id)}</a>`
        : '';
      return `<li class="ov-row">
        <span class="ov-row-title" title="${title}">${title}</span>
        <span class="ov-row-meta">${year}${imdb}</span>
      </li>`;
    };

    container.innerHTML = cats.map(c => `
      <details class="ov-cat-details">
        <summary class="ov-cat-summary">
          <span class="ov-cat-chevron">▶</span>
          <span class="badge badge-${c.badge}">${escHtml(c.label)}</span>
          <span class="ov-cat-count">${c.items.length} titre${c.items.length > 1 ? 's' : ''}</span>
        </summary>
        <ul class="ov-list">${c.items.slice(0, 10).map(renderRow).join('')}</ul>
      </details>
    `).join('');
  } catch (e) { console.error('loadOverview', e); }
}

// ═══════════════════════════ STATS ═════════════════════════════════════

async function loadStats() {
  try {
    const r = await fetch('/api/stats');
    const d = await r.json();
    document.getElementById('statFilms').textContent     = d.films.toLocaleString();
    document.getElementById('statDocs').textContent      = d.documentaires.toLocaleString();
    document.getElementById('statSeries').textContent    = d.series.toLocaleString();
    document.getElementById('statEmissions').textContent  = d.emissions.toLocaleString();
    document.getElementById('statAnimes').textContent     = (d.animes || 0).toLocaleString();
    document.getElementById('statConcerts').textContent   = (d.concerts || 0).toLocaleString();
    document.getElementById('statSpectacles').textContent = (d.spectacles || 0).toLocaleString();
    document.getElementById('statTotal').textContent      = d.total.toLocaleString();
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
let libLimit = parseInt(localStorage.getItem('libLimit')) || 25;
let libCatalog = '';
let libSearch = '';
let libSort = 'date_desc';
let libYear = '';
let libView = 'grid';     // 'grid' | 'list'
let libMode = 'media';    // 'media' | 'releases'
let libSearchTimer = null;
let libLoading = false;
let libLoadingPending = false; // un chargement a été demandé pendant qu'un autre était en cours

// RPDB
let rpdbEnabled = false;
let rpdbApiKey = '';

async function loadRpdbConfig() {
  try {
    const r = await fetch('/api/config');
    const cfg = await r.json();
    rpdbEnabled = cfg.rpdb_enabled === 'true';
    rpdbApiKey  = cfg.rpdb_api_key || '';
  } catch (e) { /* silencieux */ }
}

function posterUrl(imdbId, tmdbPoster) {
  if (rpdbEnabled && rpdbApiKey && imdbId) {
    return `https://api.ratingposterdb.com/${rpdbApiKey}/imdb/poster-default/${imdbId}.jpg`;
  }
  return tmdbPoster || null;
}

// Releases mode state
let libRlzPage = 1;
let libRlzLimit = 50;
let libRlzSearch = '';
let libRlzLoading = false;

function debounceLibSearch() {
  clearTimeout(libSearchTimer);
  libSearchTimer = setTimeout(() => {
    const val = document.getElementById('libSearch').value.trim();
    if (libMode === 'releases') {
      libRlzSearch = val; libRlzPage = 1; loadReleases();
    } else {
      libSearch = val; libPage = 1; loadLibrary();
    }
  }, 350);
}
window.debounceLibSearch = debounceLibSearch;

function onLimitChange() {
  const val = parseInt(document.getElementById('libLimit').value) || 25;
  localStorage.setItem('libLimit', val);
  if (libMode === 'releases') {
    libRlzLimit = val; libRlzPage = 1; loadReleases();
  } else {
    libLimit = val; libPage = 1; loadLibrary();
  }
}
window.onLimitChange = onLimitChange;

function onSortChange() {
  libSort = document.getElementById('libSort').value;
  libPage = 1;
  loadLibrary();
}
window.onSortChange = onSortChange;

function selectYear(y) {
  libYear = y;
  libPage = 1;
  // Sync quick pills
  document.querySelectorAll('.year-qpill').forEach(b => {
    b.classList.toggle('active', b.dataset.year === y);
  });
  // Clear text input if we clicked a pill
  const inp = document.getElementById('libYearInput');
  if (inp && y !== inp.value) inp.value = '';
  loadLibrary();
}
window.selectYear = selectYear;

let libYearInputTimer = null;
function debounceYearInput(val) {
  clearTimeout(libYearInputTimer);
  // Deactivate all quick pills
  document.querySelectorAll('.year-qpill').forEach(b => b.classList.remove('active'));
  libYearInputTimer = setTimeout(() => {
    const v = val.trim();
    // Validate: single year (4 digits) or range (YYYY-YYYY)
    if (!v || /^\d{4}$/.test(v) || /^\d{4}-\d{4}$/.test(v)) {
      libYear = v;
      libPage = 1;
      loadLibrary();
    }
  }, 600);
}
window.debounceYearInput = debounceYearInput;

function setLibView(mode) {
  document.querySelectorAll('.vt-btn').forEach(b => b.classList.toggle('active', b.dataset.vt === mode));
  const prevView = libView;
  libView = mode; // 'grid' | 'list'
  // Re-render without re-fetching if we already have data
  if (prevView !== mode) {
    const grid = document.getElementById('libraryGrid');
    if (grid && grid.dataset.lastData) renderMediaContent(JSON.parse(grid.dataset.lastData));
  }
}
window.setLibView = setLibView;

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
  if (libLoading) { libLoadingPending = true; return; }
  if (libMode === 'releases') { loadReleases(); return; }
  libLoading = true;
  libLoadingPending = false;
  // Always sync limit from DOM to avoid state drift after tab switching
  const limitEl = document.getElementById('libLimit');
  if (limitEl) libLimit = parseInt(limitEl.value) || libLimit;
  const grid = document.getElementById('libraryGrid');
  grid.innerHTML = '<p class="text-muted" style="padding:20px">' + t('sync_loading') + '</p>';

  try {
    const params = new URLSearchParams({ page: libPage, limit: libLimit, sort: libSort });
    if (libCatalog)  params.append('catalog',  libCatalog);
    if (libSearch)   params.append('search',   libSearch);
    if (libYear)     params.append('year',     libYear);

    const r = await fetch('/api/media/list?' + params);
    const d = await r.json();
    renderMediaContent(d);
  } catch (e) {
    grid.innerHTML = '<p class="text-muted">Erreur de chargement</p>';
    console.error('loadLibrary', e);
  } finally {
    libLoading = false;
    // Si un changement de filtre est survenu pendant le chargement, relancer
    if (libLoadingPending) { libLoadingPending = false; loadLibrary(); }
  }
}

async function loadLibraryCounts() {
  try {
    const r = await fetch('/api/stats');
    const d = await r.json();
    const total = d.total || 0;
    const counts = {
      '': total,
      'films': d.films || 0,
      'documentaires': d.documentaires || 0,
      'series': d.series || 0,
      'emissions': d.emissions || 0,
      'animés': d.animes || 0,
      'concerts': d.concerts || 0,
      'spectacles': d.spectacles || 0
    };
    const ids = {
      '': 'tabCountAll', 'films': 'tabCountFilms', 'documentaires': 'tabCountDocs',
      'series': 'tabCountSeries', 'emissions': 'tabCountEmissions', 'animés': 'tabCountAnimes',
      'concerts': 'tabCountConcerts', 'spectacles': 'tabCountSpectacles'
    };
    for (const [cat, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) el.textContent = counts[cat] ? counts[cat].toLocaleString() : '';
    }
  } catch (e) { /* silencieux */ }
}


function loadYearsFilter() {
  const container = document.getElementById('libYearQuick');
  if (!container) return;
  const now = new Date().getFullYear();
  const quick = [
    { label: 'En cours', year: String(now) },
    { label: String(now - 1), year: String(now - 1) },
    { label: String(now - 2), year: String(now - 2) },
    { label: String(now - 3), year: String(now - 3) },
  ];
  // "Toutes" pill first
  const allActive = !libYear ? ' active' : '';
  container.innerHTML = `<button class="year-qpill${allActive}" data-year="" onclick="selectYear('')">Toutes</button>` +
    quick.map(q => {
      const active = libYear === q.year ? ' active' : '';
      return `<button class="year-qpill${active}" data-year="${q.year}" onclick="selectYear('${q.year}')">${escHtml(q.label)}</button>`;
    }).join('');
  // Restore input value if we had a custom year
  const inp = document.getElementById('libYearInput');
  if (inp && libYear && !quick.find(q => q.year === libYear)) inp.value = libYear;
}

function renderMediaContent(data) {
  const grid = document.getElementById('libraryGrid');
  grid.dataset.lastData = JSON.stringify(data);
  if (libView === 'list') renderMediaList(data);
  else renderMediaGrid(data);
}

function renderSourceBadges(names = [], limit = 2) {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return '<span class="text-muted">—</span>';
  const visible = unique.slice(0, limit)
    .map(name => `<span class="source-name-badge" title="${escHtml(name)}">${escHtml(name)}</span>`)
    .join(' ');
  return `${visible}${unique.length > limit ? ` <span class="source-more">+${unique.length - limit}</span>` : ''}`;
}

function renderMediaList(data) {
  const grid  = document.getElementById('libraryGrid');
  const pager = document.getElementById('libraryPager');

  if (!data.items || data.items.length === 0) {
    grid.innerHTML  = '<p class="text-muted" style="padding:20px">' + t('library_no_results') + '</p>';
    grid.className  = 'media-list-view';
    pager.innerHTML = '';
    return;
  }

  grid.className = 'media-list-view';
  grid.innerHTML = `<table class="media-list-table">
    <thead><tr>
      <th>Titre</th><th>Releases</th><th>Sources</th><th>Année</th><th>Catégorie</th><th>Ajouté le</th>
    </tr></thead>
    <tbody>
      ${data.items.map(m => {
        const badgeCls = 'catalog-badge badge-' + m.catalog_type;
        const mediaJson = escHtml(JSON.stringify(m));
        const thumb = posterUrl(m.imdb_id, m.poster);
        const rlzArr = m.release_names || [];
        const more = (m.release_count || 0) - rlzArr.length;
        const total = m.release_count || 0;
        const rlzCell = rlzArr.length
          ? `<span class="mlt-rlz-name">${escHtml(rlzArr[0])}</span>${total > 1 ? `<span class="mlt-rlz-more" title="Cliquer pour voir toutes les releases">+${total - 1} · voir tout →</span>` : ''}`
          : `<span class="text-muted" style="font-size:11px">—</span>`;
        return `<tr class="media-list-row" onclick="openDrawer('${escHtml(m.imdb_id)}', JSON.parse(this.dataset.media))" data-media="${mediaJson}" title="${escHtml(m.name)}">
          <td class="mlt-title">
            ${thumb ? `<img class="mlt-thumb" src="${escHtml(thumb)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<span class="mlt-thumb-ph"></span>'}
            <span>${escHtml(m.name)}</span>
          </td>
          <td class="mlt-rlz-cell">${rlzCell}</td>
          <td class="media-sources-cell">${renderSourceBadges(m.source_names)}</td>
          <td class="mlt-year">${m.year || '—'}</td>
          <td><span class="${badgeCls}">${m.catalog_type}</span></td>
          <td class="mlt-date">${fmtDate(m.first_seen_at)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;

  renderLibPager(data, pager);
}

function renderMediaGrid(data) {
  const grid  = document.getElementById('libraryGrid');
  const pager = document.getElementById('libraryPager');

  if (!data.items || data.items.length === 0) {
    grid.innerHTML  = '<p class="text-muted" style="padding:20px">' + t('library_no_results') + '</p>';
    grid.className  = 'media-grid';
    pager.innerHTML = '';
    return;
  }

  grid.className = 'media-grid';
  grid.innerHTML = data.items.map(m => {
    const poster = posterUrl(m.imdb_id, m.poster);
    const posterHtml = poster
      ? `<img class="media-poster" src="${escHtml(poster)}" alt="${escHtml(m.name)}" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const phStyle = poster ? 'style="display:none"' : '';
    const badgeCls = 'catalog-badge badge-' + m.catalog_type;
    const mediaJson = escHtml(JSON.stringify(m));

    return `<div class="media-card" onclick="openDrawer('${escHtml(m.imdb_id)}', JSON.parse(this.dataset.media))" data-media="${mediaJson}">
      ${posterHtml}
      <div class="media-poster-placeholder" ${phStyle}></div>
      <div class="media-info">
        <div class="media-title" title="${escHtml(m.name)}">${escHtml(m.name)}</div>
        <div class="media-meta">
          <span class="media-year">${m.year || '—'}</span>
          <span class="media-rlz">${m.release_count || 0} rlz</span>
        </div>
        <div style="margin-top:5px"><span class="${badgeCls}">${m.catalog_type}</span></div>
        ${m.source_names?.length ? `<div class="media-card-sources">${renderSourceBadges(m.source_names, 1)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  renderLibPager(data, pager);
}

function renderLibPager(data, pager) {
  pager.innerHTML = '';
  const label = libMode === 'releases' ? 'releases' : 'médias';
  if (data.total > 0) {
    const info = document.createElement('span');
    info.className = 'pager-info';
    info.textContent = `${data.total.toLocaleString()} ${label}`;
    pager.appendChild(info);
  }

  if (data.pages > 1) {
    const prev = document.createElement('button');
    prev.className = 'pager-btn';
    prev.textContent = '←';
    prev.title = 'Page précédente';
    prev.disabled = data.page <= 1;
    prev.onclick = () => {
      if (libMode === 'releases') { libRlzPage = data.page - 1; loadReleases(); }
      else { libPage = data.page - 1; loadLibrary(); }
    };
    pager.appendChild(prev);

    const pageInfo = document.createElement('span');
    pageInfo.className = 'pager-info';
    pageInfo.textContent = `${data.page} / ${data.pages}`;
    pager.appendChild(pageInfo);

    const next = document.createElement('button');
    next.className = 'pager-btn';
    next.textContent = '→';
    next.title = 'Page suivante';
    next.disabled = data.page >= data.pages;
    next.onclick = () => {
      if (libMode === 'releases') { libRlzPage = data.page + 1; loadReleases(); }
      else { libPage = data.page + 1; loadLibrary(); }
    };
    pager.appendChild(next);

    const jumpWrap = document.createElement('span');
    jumpWrap.className = 'pager-jump';
    const jumpInput = document.createElement('input');
    jumpInput.type = 'number'; jumpInput.min = 1; jumpInput.max = data.pages;
    jumpInput.value = data.page; jumpInput.className = 'pager-jump-input';
    jumpInput.title = 'Aller à la page…';
    const jumpBtn = document.createElement('button');
    jumpBtn.className = 'pager-btn'; jumpBtn.textContent = 'OK';
    jumpBtn.onclick = () => {
      const p = parseInt(jumpInput.value);
      if (p >= 1 && p <= data.pages) {
        if (libMode === 'releases') { libRlzPage = p; loadReleases(); }
        else { libPage = p; loadLibrary(); }
      }
    };
    jumpInput.addEventListener('keydown', e => { if (e.key === 'Enter') jumpBtn.click(); });
    jumpWrap.appendChild(jumpInput); jumpWrap.appendChild(jumpBtn);
    pager.appendChild(jumpWrap);
  }
}

// ─── Releases flat view ────────────────────────────────────────────────────

async function loadReleases() {
  if (libRlzLoading) return;
  libRlzLoading = true;
  const grid  = document.getElementById('libraryGrid');
  const pager = document.getElementById('libraryPager');
  grid.className = 'media-list-view';
  grid.innerHTML = '<p class="text-muted" style="padding:20px">' + t('sync_loading') + '</p>';
  try {
    const params = new URLSearchParams({ page: libRlzPage, limit: libRlzLimit });
    if (libRlzSearch) params.append('search', libRlzSearch);
    const r = await fetch('/api/releases/list?' + params);
    const d = await r.json();
    renderReleasesList(d, pager);
  } catch (e) {
    grid.innerHTML = '<p class="text-muted">Erreur de chargement</p>';
    console.error('loadReleases', e);
  } finally { libRlzLoading = false; }
}

function renderReleasesList(data, pager) {
  const grid = document.getElementById('libraryGrid');
  grid.className = 'media-list-view';

  if (!data.items || data.items.length === 0) {
    grid.innerHTML  = '<p class="text-muted" style="padding:20px">' + t('library_no_results') + '</p>';
    if (pager) pager.innerHTML = '';
    return;
  }

  grid.innerHTML = `<table class="media-list-table">
    <thead><tr>
      <th>Média</th><th>Release</th><th>Source</th><th>Qualité</th><th>Hash</th><th>Ajouté le</th>
    </tr></thead>
    <tbody>
      ${data.items.map(r => {
        const badgeCls = 'catalog-badge badge-' + (r.catalog_type || 'films');
        return `<tr>
          <td class="mlt-title" style="min-width:160px">
            ${r.media_poster ? `<img class="mlt-thumb" src="${escHtml(r.media_poster)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<span class="mlt-thumb-ph"></span>'}
            <span>${r.media_name ? escHtml(r.media_name) : '<span class="text-muted">—</span>'}${r.media_year ? ` <span class="mlt-year">(${r.media_year})</span>` : ''}</span>
          </td>
          <td style="font-size:11px;max-width:280px;word-break:break-word">${escHtml(r.release_name)}</td>
          <td style="font-size:11px;white-space:nowrap">${r.source_name ? `<span class="source-name-badge">${escHtml(r.source_name)}</span>` : '<span class="text-muted">—</span>'}</td>
          <td>${r.quality ? `<span class="quality-badge">${escHtml(r.quality)}</span>` : '<span class="text-muted">—</span>'}</td>
          <td>${r.hash ? `<span class="hash-mono" title="${escHtml(r.hash)}">${r.hash.substring(0, 10)}…</span>` : '<span class="text-muted">—</span>'}</td>
          <td class="mlt-date">${fmtDate(r.added_at)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;

  if (pager) renderLibPager(data, pager);
}

// ═══════════════════════════ DRAWER ════════════════════════════════════

function openDrawer(imdbId, media) {
  const drawer   = document.getElementById('releasesDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const info     = document.getElementById('drawerInfo');
  const body     = document.getElementById('drawerBody');

  const badgeCls = 'catalog-badge badge-' + media.catalog_type;
  const cats = [
    { v: 'films',         l: 'Films' },
    { v: 'series',        l: 'Séries' },
    { v: 'documentaires', l: 'Documentaires' },
    { v: 'emissions',     l: 'Émissions' },
    { v: 'animés',        l: 'Animés' },
    { v: 'concerts',      l: 'Concerts' },
    { v: 'spectacles',    l: 'Spectacles' }
  ];
  const catOptions = cats.map(c =>
    `<option value="${c.v}"${media.catalog_type === c.v ? ' selected' : ''}>${c.l}</option>`
  ).join('');

  info.innerHTML = `
    <div class="drawer-title">${escHtml(media.name)}${media.year ? ` <span style="font-weight:400;color:var(--text-muted)">(${media.year})</span>` : ''}</div>
    <div class="drawer-subtitle" style="margin-top:6px">
      <span class="${badgeCls}" style="margin-right:8px" id="drawerCatalogBadge">${media.catalog_type}</span>
      ${media.vote_average ? `⭐ ${Number(media.vote_average).toFixed(1)} &nbsp;·&nbsp; ` : ''}
      IMDB: <a href="https://www.imdb.com/title/${escHtml(imdbId)}" target="_blank">${escHtml(imdbId)}</a>
    </div>
    ${media.description ? `<p style="margin-top:10px;font-size:13px;color:var(--text-muted);line-height:1.6">${escHtml(media.description.substring(0, 220))}${media.description.length > 220 ? '…' : ''}</p>` : ''}
    ${media.source_names?.length ? `<div class="drawer-source-list">${renderSourceBadges(media.source_names, 4)}</div>` : ''}
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select id="drawerCatalogSelect" class="select-sm" style="font-size:12px">${catOptions}</select>
      <button class="btn-sm" onclick="changeCatalog('${escHtml(imdbId)}')" style="font-size:12px">Appliquer</button>
      <span id="drawerCatalogMsg" style="font-size:12px"></span>
    </div>
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
      body.innerHTML = `
        <p class="text-muted" style="margin-bottom:12px">${releases.length} release${releases.length > 1 ? 's' : ''}</p>
        <div style="overflow-x:auto">
        <table class="releases-table">
          <thead><tr>
            <th data-i18n="library_col_name">Nom</th>
            <th>Source</th>
            <th data-i18n="library_col_quality">Qualité</th>
            <th data-i18n="library_col_date">Date</th>
          </tr></thead>
          <tbody>
            ${releases.map(r => `<tr>
              <td style="font-size:11px">${escHtml(r.release_name)}</td>
              <td>${r.source_name ? renderSourceBadges([r.source_name], 1) : '<span class="text-muted">—</span>'}</td>
              <td>${r.quality ? `<span class="quality-badge">${escHtml(r.quality)}</span>` : '<span class="text-muted">—</span>'}</td>
              <td style="white-space:nowrap;font-size:11px;color:var(--text-muted)">${fmtDate(r.added_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>
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

async function changeCatalog(imdbId) {
  const select = document.getElementById('drawerCatalogSelect');
  const msg    = document.getElementById('drawerCatalogMsg');
  const badge  = document.getElementById('drawerCatalogBadge');
  if (!select || !msg) return;

  const newCat = select.value;
  msg.textContent = '…';
  msg.style.color = 'var(--text-muted)';

  try {
    const r = await fetch('/api/media/' + encodeURIComponent(imdbId) + '/catalog', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ catalog_type: newCat })
    });
    const d = await r.json();
    if (r.ok) {
      msg.style.color  = 'var(--success)';
      msg.textContent  = '✓ Modifié';
      // Mettre à jour le badge sans fermer le drawer
      if (badge) {
        badge.className = 'catalog-badge badge-' + newCat;
        badge.textContent = newCat;
      }
      loadStats();
      loadLibraryCounts();
      // Recharger la grille en arrière-plan pour refléter le changement
      setTimeout(() => loadLibrary(), 400);
    } else {
      msg.style.color = 'var(--danger)';
      msg.textContent = '✗ ' + (d.error || 'Erreur');
    }
  } catch (e) {
    msg.style.color = 'var(--danger)';
    msg.textContent = '✗ Erreur réseau';
  }
}
window.changeCatalog = changeCatalog;

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

    container.innerHTML = `<div style="overflow-x:auto"><table class="sources-table">
      <thead><tr>
        <th data-i18n="sources_url">Flux RSS</th>
        <th data-i18n="sources_by_cat">Par catégorie</th>
        <th data-i18n="sources_releases">Releases</th>
        <th data-i18n="sources_media">Médias</th>
        <th data-i18n="sources_last_seen">Dernier ajout</th>
        <th data-i18n="sources_errors">Erreurs</th>
        <th>Catalogue</th>
      </tr></thead>
      <tbody>
        ${d.map(s => {
          const hasError = s.error_count > 0;
          const rowCls = hasError && s.release_count === 0 ? 'source-row-error' : hasError ? 'source-row-warn' : '';
          const cats = [
            s.films_count         ? `<span class="src-cat badge-films">Films ${s.films_count}</span>` : '',
            s.documentaires_count ? `<span class="src-cat badge-documentaires">Docs ${s.documentaires_count}</span>` : '',
            s.series_count        ? `<span class="src-cat badge-series">Séries ${s.series_count}</span>` : '',
            s.emissions_count     ? `<span class="src-cat badge-emissions">Émissions ${s.emissions_count}</span>` : '',
            s.animes_count        ? `<span class="src-cat badge-animés">Animés ${s.animes_count}</span>` : '',
            s.concerts_count      ? `<span class="src-cat badge-concerts">Concerts ${s.concerts_count}</span>` : '',
            s.spectacles_count    ? `<span class="src-cat badge-spectacles">Spectacles ${s.spectacles_count}</span>` : '',
          ].filter(Boolean).join(' ');

          const errCell = hasError
            ? `<span class="source-error-badge" title="${escHtml(s.last_error_msg || '')}">
                ${s.error_count} ✗${s.last_http_status ? ` <small>HTTP ${s.last_http_status}</small>` : ''}
               </span>
               <br><span style="font-size:11px;color:var(--text-muted)">${fmtDate(s.last_error_at)}</span>`
            : '<span style="color:var(--success)">✓</span>';

          return `<tr class="${rowCls}">
            <td>
              ${s.name
                ? `<span class="source-name">${escHtml(s.name)}</span>`
                : `<span class="source-url" title="${escHtml(s.source_url)}">${escHtml(trimUrl(s.source_url))}</span>`
              }
            </td>
            <td>${cats || '<span class="text-muted">—</span>'}</td>
            <td><span class="source-num">${(s.release_count || 0).toLocaleString()}</span></td>
            <td><span class="source-num">${(s.media_count || 0).toLocaleString()}</span></td>
            <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${s.last_seen ? fmtDate(s.last_seen) : '—'}</td>
            <td>${errCell}</td>
            <td><button class="btn-sm" onclick="createCatalogForSource('${encodeURIComponent(s.source_url).replace(/'/g, '%27')}','${encodeURIComponent(s.name || '').replace(/'/g, '%27')}')">Créer</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
    applyI18nToElement(container);
  } catch (e) {
    container.innerHTML = '<p class="text-muted">Erreur de chargement</p>';
    console.error('loadSources', e);
  }
}
window.loadSources = loadSources;

async function createCatalogForSource(encodedUrl, encodedName) {
  await loadCatalogManager();
  navigate('catalogs');
  resetCatalogForm();
  const url = decodeURIComponent(encodedUrl);
  const name = decodeURIComponent(encodedName);
  document.getElementById('catalogName').value = name ? `${name} — Films` : 'Nouveau catalogue';
  const checkbox = [...document.querySelectorAll('#catalogSourceChoices input')]
    .find(input => input.value === url);
  if (checkbox) checkbox.checked = true;
  document.getElementById('catalogName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
window.createCatalogForSource = createCatalogForSource;

// ═══════════════════════════ CATALOGUES ═══════════════════════════════

let catalogManagerData = { catalogs: [], pastebins: [], rss: [], stremio: [], newznab: [] };

function csvValues(id) {
  return (document.getElementById(id)?.value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function selectedValues(id) {
  return [...(document.getElementById(id)?.selectedOptions || [])].map(option => Number(option.value));
}

function catalogPayload() {
  return {
    name: document.getElementById('catalogName').value.trim(),
    type: document.getElementById('catalogMediaType').value,
    source_urls: [...document.querySelectorAll('#catalogSourceChoices input:checked')].map(input => input.value),
    filters: {
      year_mode: document.getElementById('catalogYearMode').value,
      years: csvValues('catalogYears'),
      year_min: document.getElementById('catalogYearMin').value || null,
      year_max: document.getElementById('catalogYearMax').value || null,
      keywords_include: csvValues('catalogKeywordsInclude'),
      keywords_exclude: csvValues('catalogKeywordsExclude'),
      genres_include: selectedValues('catalogGenresInclude'),
      genres_exclude: selectedValues('catalogGenresExclude')
    }
  };
}

async function loadCatalogManager() {
  try {
    const [catalogRes, pasteRes, rssRes, stremioRes, newznabRes] = await Promise.all([
      fetch('/api/catalogs'), fetch('/api/pastebins'), fetch('/api/rss-sources'),
      fetch('/api/stremio-sources'), fetch('/api/newznab-sources')
    ]);
    const [catalogs, pastebins, rss, stremio, newznab] = await Promise.all([
      catalogRes.json(), pasteRes.json(), rssRes.json(), stremioRes.json(), newznabRes.json()
    ]);
    catalogManagerData = { catalogs, pastebins, rss, stremio, newznab };
    renderRssSources();
    renderPastebins();
    renderNewznabSources();
    renderStremioSources();
    renderCatalogSourceChoices();
    renderCatalogs();
  } catch (error) {
    console.error('loadCatalogManager', error);
  }
}
window.loadCatalogManager = loadCatalogManager;

async function loadSourceManager() {
  await Promise.all([loadCatalogManager(), loadSources()]);
}
window.loadSourceManager = loadSourceManager;

function renderRssSources() {
  const container = document.getElementById('rssSourceList');
  if (!container) return;
  if (!catalogManagerData.rss.length) {
    container.innerHTML = `<p class="text-muted">${t('sources_rss_none')}</p>`;
    return;
  }
  container.innerHTML = catalogManagerData.rss.map(source => `
    <div class="manager-row">
      <div class="manager-row-main">
        <div class="manager-row-title">${escHtml(source.name || 'RSS')} ${source.paused ? '⏸' : '●'}</div>
        <div class="manager-row-meta" title="${escHtml(source.url)}">${escHtml(source.url)} · ${escHtml(source.force || 'auto')}</div>
      </div>
      <div class="manager-row-actions">
        <button class="btn-sm" onclick="createCatalogForSource('${encodeURIComponent(source.url).replace(/'/g, '%27')}','${encodeURIComponent(source.name || '').replace(/'/g, '%27')}')">${t('sources_catalog_action')}</button>
        <button class="btn-sm" onclick="toggleRssSource('${source.id}', ${!source.paused})">${source.paused ? t('sources_resume') : t('sources_pause')}</button>
        <button class="btn-danger btn-sm" onclick="deleteRssSource('${source.id}')">${t('sources_delete')}</button>
      </div>
    </div>`).join('');
}

async function addRssSource() {
  const response = await fetch('/api/rss-sources', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.getElementById('rssSourceName').value,
      url: document.getElementById('rssSourceUrl').value.trim(),
      force: document.getElementById('rssSourceForce').value
    })
  });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Erreur');
  document.getElementById('rssSourceName').value = '';
  document.getElementById('rssSourceUrl').value = '';
  await loadSourceManager();
}
window.addRssSource = addRssSource;

async function toggleRssSource(id, paused) {
  const response = await fetch(`/api/rss-sources/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused })
  });
  if (!response.ok) alert((await response.json()).error || 'Erreur');
  loadSourceManager();
}
window.toggleRssSource = toggleRssSource;

async function deleteRssSource(id) {
  if (!confirm('Supprimer cette source RSS ? Les médias déjà indexés sont conservés.')) return;
  await fetch(`/api/rss-sources/${id}`, { method: 'DELETE' });
  loadSourceManager();
}
window.deleteRssSource = deleteRssSource;

function renderPastebins() {
  const container = document.getElementById('pastebinList');
  if (!catalogManagerData.pastebins.length) {
    container.innerHTML = `<p class="text-muted">${t('sources_pastebin_none')}</p>`;
    return;
  }
  container.innerHTML = catalogManagerData.pastebins.map(source => `
    <div class="manager-row">
      <div class="manager-row-main">
        <div class="manager-row-title">${escHtml(source.name || 'Pastebin')} ${source.paused ? '⏸' : '●'}</div>
        <div class="manager-row-meta" title="${escHtml(source.url)}">${escHtml(source.url)}</div>
      </div>
      <div class="manager-row-actions">
        <button class="btn-sm" onclick="createCatalogForSource('${encodeURIComponent(source.url).replace(/'/g, '%27')}','${encodeURIComponent(source.name || '').replace(/'/g, '%27')}')">${t('sources_catalog_action')}</button>
        <button class="btn-sm" onclick="togglePastebin('${source.id}', ${!source.paused})">${source.paused ? t('sources_resume') : t('sources_pause')}</button>
        <button class="btn-danger btn-sm" onclick="deletePastebin('${source.id}')">${t('sources_delete')}</button>
      </div>
    </div>`).join('');
}

function renderCatalogSourceChoices(selected = []) {
  const sources = [
    ...catalogManagerData.rss,
    ...catalogManagerData.pastebins.map(source => ({ ...source, kind: 'Pastebin' })),
    ...catalogManagerData.newznab.flatMap(source => (source.catalogs || []).map(catalog => ({
      name: `${source.name} — ${catalog.name}`,
      url: catalog.source_key,
      kind: 'API Newznab',
      paused: source.paused
    }))),
    ...catalogManagerData.stremio.flatMap(source => (source.catalogs || []).map(catalog => ({
      name: `${source.name} — ${catalog.name}`,
      url: catalog.source_key,
      kind: 'Catalogue Stremio',
      paused: source.paused || catalog.enabled === false
    })))
  ];
  const container = document.getElementById('catalogSourceChoices');
  container.innerHTML = sources.length ? sources.filter(source => !source.paused).map(source => `
    <label class="catalog-source-choice">
      <input type="checkbox" value="${escHtml(source.url)}" ${selected.includes(source.url) ? 'checked' : ''}>
      <span><strong>${escHtml(source.name || source.url)}</strong><br><small class="text-muted">${source.kind}</small></span>
    </label>`).join('') : '<span class="text-muted">Ajoutez d’abord une source RSS ou Pastebin.</span>';
}

function renderCatalogs() {
  const container = document.getElementById('catalogList');
  if (!catalogManagerData.catalogs.length) {
    container.innerHTML = `<p class="text-muted">${t('catalogs_none')}</p>`;
    return;
  }
  container.innerHTML = catalogManagerData.catalogs.map(catalog => {
    const years = catalog.filters?.years?.length
      ? `${catalog.filters.year_mode === 'exclude' ? 'hors ' : ''}${catalog.filters.years.join(', ')}`
      : t('catalogs_all_years');
    return `<div class="manager-row">
      <div class="manager-row-main">
        <div class="manager-row-title">${catalog.enabled ? '●' : '⏸'} ${escHtml(catalog.name)}</div>
        <div class="manager-row-meta">${catalog.type === 'movie' ? t('stat_films') : t('stat_series')} · ${escHtml(years)} · ${catalog.source_urls.length ? `${catalog.source_urls.length} ${t('catalogs_source_count')}` : t('catalogs_all_sources')}</div>
      </div>
      <div class="manager-row-actions">
        <button class="btn-sm" onclick="editCatalog('${catalog.id}')">${t('catalogs_edit')}</button>
        <button class="btn-sm" onclick="toggleCatalog('${catalog.id}', ${!catalog.enabled})">${catalog.enabled ? t('sources_pause') : t('sources_resume')}</button>
        <button class="btn-danger btn-sm" onclick="deleteCatalog('${catalog.id}')">${t('sources_delete')}</button>
      </div>
    </div>`;
  }).join('');
}

async function previewPastebin() {
  const url = document.getElementById('pastebinUrl').value.trim();
  const output = document.getElementById('pastebinPreview');
  if (!url) return;
  output.textContent = 'Analyse en cours…';
  const response = await fetch('/api/pastebins/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, maxPages: 25 })
  });
  const data = await response.json();
  output.textContent = response.ok
    ? `${data.items.toLocaleString()} médias · ${data.visited} pages${data.duplicates ? ` · ${data.duplicates.toLocaleString()} doublons retirés` : ''} · ${Object.entries(data.categories).map(([k,v]) => `${k}: ${v}`).join(' · ')}${data.truncated ? ' · aperçu limité' : ''}`
    : (data.error || 'Erreur');
}
window.previewPastebin = previewPastebin;

async function addPastebin() {
  const response = await fetch('/api/pastebins', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.getElementById('pastebinName').value,
      url: document.getElementById('pastebinUrl').value.trim()
    })
  });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Erreur');
  document.getElementById('pastebinName').value = '';
  document.getElementById('pastebinUrl').value = '';
  document.getElementById('pastebinPreview').textContent = '';
  await loadCatalogManager();
}
window.addPastebin = addPastebin;

async function togglePastebin(id, paused) {
  await fetch(`/api/pastebins/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused })
  });
  loadCatalogManager();
}
window.togglePastebin = togglePastebin;

async function deletePastebin(id) {
  if (!confirm('Supprimer cette source Pastebin ?')) return;
  await fetch(`/api/pastebins/${id}`, { method: 'DELETE' });
  loadCatalogManager();
}
window.deletePastebin = deletePastebin;

function newznabPayload() {
  return {
    name: document.getElementById('newznabSourceName').value.trim(),
    url: document.getElementById('newznabSourceUrl').value.trim(),
    api_key: document.getElementById('newznabApiKey').value.trim(),
    movie_categories: document.getElementById('newznabMovieCategories').value.trim(),
    series_categories: document.getElementById('newznabSeriesCategories').value.trim(),
    max_items_per_category: Number(document.getElementById('newznabMaxItems').value) || 1000,
    request_delay_ms: Number(document.getElementById('newznabRequestDelay').value) || 750
  };
}

function renderNewznabSources() {
  const container = document.getElementById('newznabSourceList');
  if (!container) return;
  if (!catalogManagerData.newznab.length) {
    container.innerHTML = `<p class="text-muted">${t('sources_newznab_none')}</p>`;
    return;
  }
  container.innerHTML = catalogManagerData.newznab.map(source => `
    <div class="manager-row">
      <div class="manager-row-main">
        <div class="manager-row-title">${escHtml(source.name || 'Newznab')} ${source.paused ? '⏸' : '●'}</div>
        <div class="manager-row-meta manager-row-url" title="${escHtml(source.url)}">${escHtml(source.url)}</div>
        <div class="manager-row-meta">
          ${t('sources_newznab_categories_short')} :
          ${(source.catalogs || []).map(catalog => `${escHtml(catalog.name)} ${escHtml(catalog.category_ids)}`).join(' · ')}
          · ${source.max_items_per_category.toLocaleString()} ${t('sources_newznab_items_per_category')}
          · ${t('sources_newznab_page_size')} ${source.page_size}
          · ${source.request_delay_ms} ms
        </div>
      </div>
      <div class="manager-row-actions">
        ${(source.catalogs || []).map(catalog =>
          `<button class="btn-sm" onclick="createCatalogForSource('${encodeURIComponent(catalog.source_key).replace(/'/g, '%27')}','${encodeURIComponent(`${source.name} — ${catalog.name}`).replace(/'/g, '%27')}')">${t('sources_catalog_action')} ${escHtml(catalog.name)}</button>`
        ).join('')}
        <button class="btn-sm" onclick="renameNewznabSource('${source.id}','${encodeURIComponent(source.name || '').replace(/'/g, '%27')}')">${t('sources_rename')}</button>
        <button class="btn-sm" onclick="toggleNewznabSource('${source.id}', ${!source.paused})">${source.paused ? t('sources_resume') : t('sources_pause')}</button>
        <button class="btn-danger btn-sm" onclick="deleteNewznabSource('${source.id}')">${t('sources_delete')}</button>
      </div>
    </div>`).join('');
}

async function previewNewznabSource() {
  const output = document.getElementById('newznabSourcePreview');
  const payload = newznabPayload();
  if (!payload.url || !payload.api_key) return;
  output.textContent = t('sources_newznab_testing');
  const response = await fetch('/api/newznab-sources/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json();
  output.textContent = response.ok
    ? `${t('sources_newznab_connection_ok')} · ${t('sources_newznab_server_limit')} ${data.server_max} · ${data.categories.length} ${t('sources_newznab_categories_available')}`
    : (data.error || 'Erreur');
}
window.previewNewznabSource = previewNewznabSource;

async function addNewznabSource() {
  const response = await fetch('/api/newznab-sources', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newznabPayload())
  });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Erreur');
  document.getElementById('newznabSourceName').value = '';
  document.getElementById('newznabSourceUrl').value = '';
  document.getElementById('newznabApiKey').value = '';
  document.getElementById('newznabSourcePreview').textContent = '';
  await loadSourceManager();
}
window.addNewznabSource = addNewznabSource;

async function renameNewznabSource(id, encodedName) {
  const name = prompt(t('sources_rename_prompt'), decodeURIComponent(encodedName));
  if (!name?.trim()) return;
  const response = await fetch(`/api/newznab-sources/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() })
  });
  if (!response.ok) return alert((await response.json()).error || 'Erreur');
  loadSourceManager();
}
window.renameNewznabSource = renameNewznabSource;

async function toggleNewznabSource(id, paused) {
  const response = await fetch(`/api/newznab-sources/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused })
  });
  if (!response.ok) alert((await response.json()).error || 'Erreur');
  loadSourceManager();
}
window.toggleNewznabSource = toggleNewznabSource;

async function deleteNewznabSource(id) {
  if (!confirm(t('sources_newznab_delete_confirm'))) return;
  await fetch(`/api/newznab-sources/${id}`, { method: 'DELETE' });
  loadSourceManager();
}
window.deleteNewznabSource = deleteNewznabSource;

function renderStremioSources() {
  const container = document.getElementById('stremioSourceList');
  if (!container) return;
  if (!catalogManagerData.stremio.length) {
    container.innerHTML = `<p class="text-muted">${t('sources_stremio_none')}</p>`;
    return;
  }
  container.innerHTML = catalogManagerData.stremio.map(source => `
    <div class="manager-row">
      <div class="manager-row-main">
        <div class="manager-row-title">${escHtml(source.name)} ${source.paused ? '⏸' : '●'}</div>
        <div class="manager-row-meta manager-row-url" title="${escHtml(source.display_url)}">${escHtml(source.display_url)}</div>
        <div class="manager-row-meta">${(source.catalogs || []).length} catalogue(s)</div>
        <div style="margin-top:6px">${(source.catalogs || []).map(catalog =>
          `<span class="src-cat badge-${catalog.type === 'series' ? 'series' : 'films'}">${escHtml(catalog.name)}</span>`
        ).join(' ')}</div>
      </div>
      <div class="manager-row-actions">
        <button class="btn-sm" onclick="renameStremioSource('${source.id}','${encodeURIComponent(source.name || '').replace(/'/g, '%27')}')">${t('sources_rename')}</button>
        <button class="btn-sm" onclick="toggleStremioSource('${source.id}', ${!source.paused})">${source.paused ? t('sources_resume') : t('sources_pause')}</button>
        <button class="btn-danger btn-sm" onclick="deleteStremioSource('${source.id}')">${t('sources_delete')}</button>
      </div>
    </div>`).join('');
}

async function previewStremioSource() {
  const url = document.getElementById('stremioSourceUrl').value.trim();
  const output = document.getElementById('stremioSourcePreview');
  if (!url) return;
  output.textContent = 'Analyse en cours…';
  const response = await fetch('/api/stremio-sources/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
  });
  const data = await response.json();
  output.textContent = response.ok
    ? `${data.name} · ${data.catalogs.length} catalogue(s) : ${data.catalogs.map(catalog => catalog.name).join(', ')}`
    : (data.error || 'Erreur');
}
window.previewStremioSource = previewStremioSource;

async function addStremioSource() {
  const response = await fetch('/api/stremio-sources', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: document.getElementById('stremioSourceName').value,
      url: document.getElementById('stremioSourceUrl').value.trim()
    })
  });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Erreur');
  document.getElementById('stremioSourceName').value = '';
  document.getElementById('stremioSourceUrl').value = '';
  document.getElementById('stremioSourcePreview').textContent = '';
  loadSourceManager();
}
window.addStremioSource = addStremioSource;

async function renameStremioSource(id, encodedName) {
  const name = prompt(t('sources_rename_prompt'), decodeURIComponent(encodedName));
  if (!name?.trim()) return;
  const response = await fetch(`/api/stremio-sources/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() })
  });
  if (!response.ok) return alert((await response.json()).error || 'Erreur');
  loadSourceManager();
}
window.renameStremioSource = renameStremioSource;

async function toggleStremioSource(id, paused) {
  await fetch(`/api/stremio-sources/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused })
  });
  loadSourceManager();
}
window.toggleStremioSource = toggleStremioSource;

async function deleteStremioSource(id) {
  if (!confirm('Supprimer ce manifeste Stremio ? Les médias déjà indexés sont conservés.')) return;
  await fetch(`/api/stremio-sources/${id}`, { method: 'DELETE' });
  loadSourceManager();
}
window.deleteStremioSource = deleteStremioSource;

async function previewCatalog() {
  const output = document.getElementById('catalogPreview');
  const response = await fetch('/api/catalogs/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catalogPayload())
  });
  const data = await response.json();
  output.textContent = response.ok
    ? `${data.count_at_least > 20 ? 'Plus de 20' : data.count_at_least} résultat(s)`
    : (data.error || 'Erreur');
}
window.previewCatalog = previewCatalog;

async function saveCatalog() {
  const id = document.getElementById('catalogEditId').value;
  const response = await fetch(id ? `/api/catalogs/${id}` : '/api/catalogs', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(catalogPayload())
  });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Erreur');
  resetCatalogForm();
  await loadCatalogManager();
}
window.saveCatalog = saveCatalog;

function editCatalog(id) {
  const catalog = catalogManagerData.catalogs.find(item => item.id === id);
  if (!catalog) return;
  document.getElementById('catalogEditId').value = catalog.id;
  document.getElementById('catalogFormTitle').textContent = t('catalogs_edit');
  document.getElementById('catalogName').value = catalog.name;
  document.getElementById('catalogMediaType').value = catalog.type;
  document.getElementById('catalogYearMode').value = catalog.filters?.year_mode || 'include';
  document.getElementById('catalogYears').value = (catalog.filters?.years || []).join(', ');
  document.getElementById('catalogYearMin').value = catalog.filters?.year_min || '';
  document.getElementById('catalogYearMax').value = catalog.filters?.year_max || '';
  document.getElementById('catalogKeywordsInclude').value = (catalog.filters?.keywords_include || []).join(', ');
  document.getElementById('catalogKeywordsExclude').value = (catalog.filters?.keywords_exclude || []).join(', ');
  for (const [id, values] of [
    ['catalogGenresInclude', catalog.filters?.genres_include || []],
    ['catalogGenresExclude', catalog.filters?.genres_exclude || []]
  ]) {
    [...document.getElementById(id).options].forEach(option => {
      option.selected = values.map(Number).includes(Number(option.value));
    });
  }
  renderCatalogSourceChoices(catalog.source_urls);
  document.getElementById('catalogName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
window.editCatalog = editCatalog;

async function toggleCatalog(id, enabled) {
  const response = await fetch(`/api/catalogs/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled })
  });
  if (!response.ok) alert((await response.json()).error || 'Erreur');
  loadCatalogManager();
}
window.toggleCatalog = toggleCatalog;

async function deleteCatalog(id) {
  if (!confirm('Supprimer ce catalogue ?')) return;
  await fetch(`/api/catalogs/${id}`, { method: 'DELETE' });
  loadCatalogManager();
}
window.deleteCatalog = deleteCatalog;

function resetCatalogForm() {
  document.getElementById('catalogEditId').value = '';
  document.getElementById('catalogFormTitle').textContent = t('catalogs_create');
  ['catalogName','catalogYears','catalogYearMin','catalogYearMax','catalogKeywordsInclude','catalogKeywordsExclude']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('catalogMediaType').value = 'movie';
  document.getElementById('catalogYearMode').value = 'include';
  for (const id of ['catalogGenresInclude', 'catalogGenresExclude']) {
    [...document.getElementById(id).options].forEach(option => { option.selected = false; });
  }
  document.getElementById('catalogPreview').textContent = '';
  renderCatalogSourceChoices();
}
window.resetCatalogForm = resetCatalogForm;

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
        loadOverview();
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
        ${new Date(s.started_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} — ${dur}
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
            <td style="white-space:nowrap">
              <button class="btn-sm btn-secondary" onclick="toggleOverride(${f.id})" title="Forcer un ID manuellement">ID</button>
              <button class="btn-sm btn-danger" onclick="deleteFailed(${f.id})">✕</button>
            </td>
          </tr>
          <tr id="override-row-${f.id}" class="override-row" style="display:none">
            <td colspan="5">
              <div class="override-form">
                <input id="override-input-${f.id}" class="override-input" placeholder="tt1234567 / 12345">
                <select id="override-type-${f.id}" class="override-select">
                  <option value="imdb">IMDB ID</option>
                  <option value="tmdb_movie">TMDB Film</option>
                  <option value="tmdb_tv">TMDB Série</option>
                  <option value="tvdb">TVDB ID</option>
                </select>
                <button class="btn-sm btn-primary" onclick="submitOverride(${f.id})">Appliquer</button>
                <span id="override-status-${f.id}" class="override-status"></span>
              </div>
            </td>
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

function toggleOverride(id) {
  const row = document.getElementById('override-row-' + id);
  if (!row) return;
  const visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : 'table-row';
  if (!visible) document.getElementById('override-input-' + id)?.focus();
}
window.toggleOverride = toggleOverride;

async function submitOverride(id) {
  const input  = document.getElementById('override-input-' + id);
  const select = document.getElementById('override-type-' + id);
  const status = document.getElementById('override-status-' + id);
  const idValue = input?.value?.trim();
  const idType  = select?.value;
  if (!idValue) { status.textContent = 'ID manquant'; status.className = 'override-status override-err'; return; }

  status.textContent = 'Recherche…';
  status.className = 'override-status';
  try {
    const r = await fetch('/api/failed/' + id + '/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_type: idType, id_value: idValue })
    });
    const d = await r.json();
    if (!r.ok) {
      status.textContent = d.error || 'Erreur';
      status.className = 'override-status override-err';
      return;
    }
    // Succès : retirer la ligne du tableau
    status.textContent = 'OK — ' + (d.name || d.imdb_id);
    status.className = 'override-status override-ok';
    setTimeout(() => {
      document.getElementById('failed-' + id)?.remove();
      document.getElementById('override-row-' + id)?.remove();
      // Mettre à jour le compteur
      const countEl = document.getElementById('failedCount');
      if (countEl) {
        const cur = parseInt(countEl.textContent) || 0;
        if (cur > 1) countEl.textContent = (cur - 1) + ' release(s) non matchée(s)';
        else countEl.textContent = '0 release(s) non matchée(s)';
      }
    }, 1500);
  } catch (e) {
    status.textContent = 'Erreur réseau';
    status.className = 'override-status override-err';
  }
}
window.submitOverride = submitOverride;

// ═══════════════════════════ PROXY TEST ════════════════════════════

async function testProxy() {
  const result = document.getElementById('proxyTestResult');
  const btn = document.querySelector('[onclick="testProxy()"]');
  result.textContent = '⏳ ' + t('sync_loading');
  result.style.color = 'var(--text-muted)';
  if (btn) btn.disabled = true;

  try {
    const r = await fetch('/api/proxy/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: document.getElementById('proxy_protocol')?.value || 'http',
        host:     document.getElementById('proxy_host')?.value?.trim(),
        port:     document.getElementById('proxy_port')?.value?.trim(),
        username: document.getElementById('proxy_username')?.value?.trim(),
        password: document.getElementById('proxy_password')?.value?.trim(),
      })
    });
    const d = await r.json();
    if (d.ok) {
      result.textContent = `✅ ${t('config_proxy_test_ok')} — IP : ${d.ip}`;
      result.style.color = 'var(--success)';
    } else {
      result.textContent = `❌ ${t('config_proxy_test_fail')} : ${d.error}`;
      result.style.color = 'var(--danger)';
    }
  } catch (e) {
    result.textContent = '❌ ' + t('login_error_network');
    result.style.color = 'var(--danger)';
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => { result.textContent = ''; }, 10000);
  }
}
window.testProxy = testProxy;

async function testApprise() {
  const msg = document.getElementById('appriseTestMsg');
  const btn = document.querySelector('[onclick="testApprise()"]');
  msg.textContent = '⏳ ' + t('sync_loading');
  msg.style.color = 'var(--text-muted)';
  if (btn) btn.disabled = true;

  try {
    const r = await fetch('/api/apprise/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_url: document.getElementById('apprise_server_url')?.value?.trim(),
        urls:       document.getElementById('apprise_urls')?.value?.trim()
      })
    });
    const d = await r.json();
    if (d.ok) {
      msg.textContent = '✅ ' + t('config_apprise_test_ok');
      msg.style.color = 'var(--success)';
    } else {
      msg.textContent = '❌ ' + (d.error || t('config_apprise_test_fail'));
      msg.style.color = 'var(--danger)';
    }
  } catch (e) {
    msg.textContent = '❌ ' + t('login_error_network');
    msg.style.color = 'var(--danger)';
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => { msg.textContent = ''; }, 10000);
  }
}
window.testApprise = testApprise;

// ═══════════════════════════ MAINTENANCE ═══════════════════════════════

async function reclassifyAnimes() {
  const btn    = document.getElementById('reclassifyAnimesBtn');
  const result = document.getElementById('reclassifyAnimesResult');
  btn.disabled = true;
  btn.textContent = '⏳ En cours…';
  result.style.display = 'none';

  try {
    const r = await fetch('/api/admin/reclassify-animes', { method: 'POST' });
    const d = await r.json();

    if (!r.ok) {
      result.innerHTML = `<span style="color:var(--danger)">✗ ${escHtml(d.error || 'Erreur')}</span>`;
    } else if (d.candidates === 0) {
      result.innerHTML = `<span style="color:var(--success)">✓ Aucun candidat trouvé — tous les médias sont déjà bien classés.</span>`;
    } else {
      const errHtml = d.errors?.length
        ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted)">${d.errors.length} erreur(s)</summary><ul style="font-size:11px;margin:4px 0 0 12px">${d.errors.map(e => `<li>${escHtml(e.name)} — ${escHtml(e.error)}</li>`).join('')}</ul></details>`
        : '';
      result.innerHTML = `
        <span style="color:var(--success)">✓ Terminé.</span>
        <span style="color:var(--text-muted);margin-left:8px">${d.candidates} candidats analysés · <strong>${d.reclassified}</strong> reclassifié(s) en animés · ${d.skipped} ignoré(s)</span>
        ${errHtml}`;
    }
    result.style.display = 'block';
    if (d.reclassified > 0) { loadStats(); loadLibraryCounts(); }
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger)">✗ Erreur réseau</span>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Lancer';
  }
}
window.reclassifyAnimes = reclassifyAnimes;

async function reclassifyDocs() {
  const btn    = document.getElementById('reclassifyDocsBtn');
  const result = document.getElementById('reclassifyDocsResult');
  btn.disabled = true;
  btn.textContent = '⏳ En cours…';
  result.style.display = 'none';

  try {
    const r = await fetch('/api/admin/reclassify-docs', { method: 'POST' });
    const d = await r.json();

    if (!r.ok) {
      result.innerHTML = `<span style="color:var(--danger)">✗ ${escHtml(d.error || 'Erreur')}</span>`;
    } else if (d.reclassified === 0) {
      result.innerHTML = `<span style="color:var(--success)">✓ Aucun candidat trouvé — tous les médias sont déjà bien classés.</span>`;
    } else {
      result.innerHTML = `
        <span style="color:var(--success)">✓ Terminé.</span>
        <span style="color:var(--text-muted);margin-left:8px">${d.candidates} candidats analysés · <strong>${d.reclassified}</strong> reclassifié(s) en documentaires</span>`;
    }
    result.style.display = 'block';
    if (d.reclassified > 0) { loadStats(); loadLibraryCounts(); }
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger)">✗ Erreur réseau</span>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Lancer';
  }
}
window.reclassifyDocs = reclassifyDocs;

async function fixFalseDocs() {
  const btn    = document.getElementById('fixFalseDocsBtn');
  const result = document.getElementById('fixFalseDocsResult');
  btn.disabled = true;
  btn.textContent = '⏳ En cours…';
  result.style.display = 'none';

  try {
    const r = await fetch('/api/admin/fix-false-docs', { method: 'POST' });
    const d = await r.json();

    if (!r.ok) {
      result.innerHTML = `<span style="color:var(--danger)">✗ ${escHtml(d.error || 'Erreur')}</span>`;
    } else if (d.fixed === 0) {
      result.innerHTML = `<span style="color:var(--success)">✓ Aucun faux documentaire détecté.</span>`;
    } else {
      result.innerHTML = `
        <span style="color:var(--success)">✓ Terminé.</span>
        <span style="color:var(--text-muted);margin-left:8px">${d.candidates} candidats analysés · <strong>${d.fixed}</strong> faux documentaire(s) reclassifié(s) en Films / Séries</span>`;
    }
    result.style.display = 'block';
    if (d.fixed > 0) { loadStats(); loadLibraryCounts(); }
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger)">✗ Erreur réseau</span>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Lancer';
  }
}
window.fixFalseDocs = fixFalseDocs;

async function fixFalseEmissions() {
  const btn    = document.getElementById('fixFalseEmissionsBtn');
  const result = document.getElementById('fixFalseEmissionsResult');
  btn.disabled = true;
  btn.textContent = '⏳ En cours…';
  result.style.display = 'none';

  try {
    const r = await fetch('/api/admin/fix-false-emissions', { method: 'POST' });
    const d = await r.json();

    if (!r.ok) {
      result.innerHTML = `<span style="color:var(--danger)">✗ ${escHtml(d.error || 'Erreur')}</span>`;
    } else if (d.fixed === 0) {
      result.innerHTML = `<span style="color:var(--success)">✓ Aucune fausse émission détectée.</span>`;
    } else {
      result.innerHTML = `
        <span style="color:var(--success)">✓ Terminé.</span>
        <span style="color:var(--text-muted);margin-left:8px">${d.candidates} candidats analysés · <strong>${d.fixed}</strong> fausse(s) émission(s) reclassifiée(s) en Séries</span>`;
    }
    result.style.display = 'block';
    if (d.fixed > 0) { loadStats(); loadLibraryCounts(); }
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger)">✗ Erreur réseau</span>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Lancer';
  }
}
window.fixFalseEmissions = fixFalseEmissions;

async function reclassifyAll() {
  const btn    = document.getElementById('reclassifyAllBtn');
  const result = document.getElementById('reclassifyAllResult');
  btn.disabled = true;
  btn.textContent = '⏳ En cours…';
  result.style.display = 'none';

  try {
    const r = await fetch('/api/reclassify', { method: 'POST' });
    const d = await r.json();

    if (!r.ok) {
      result.innerHTML = `<span style="color:var(--danger)">✗ ${escHtml(d.error || 'Erreur')}</span>`;
    } else if (d.reclassified === 0) {
      const skippedNote = d.skipped > 0 ? ` (${d.skipped} conservés — catégorie plus précise)` : '';
      result.innerHTML = `<span style="color:var(--success)">✓ Aucun changement — les ${d.total} médias sont déjà correctement classés${skippedNote}.</span>`;
    } else {
      const cats = { films: 'Films', documentaires: 'Docs', series: 'Séries', emissions: 'Émissions', 'animés': 'Animés' };
      const breakdown = Object.entries(d.byCategory || {})
        .map(([c, n]) => `${cats[c] || c} : +${n}`).join(' · ');
      const skippedNote = d.skipped > 0 ? ` · ${d.skipped} conservés (catégorie plus précise)` : '';
      result.innerHTML = `
        <span style="color:var(--success)">✓ Terminé.</span>
        <span style="color:var(--text-muted);margin-left:8px"><strong>${d.reclassified}</strong> reclassifié(s) sur ${d.total}</span>
        ${breakdown ? `<br><small style="color:var(--text-muted)">${breakdown}${skippedNote}</small>` : ''}`;
    }
    result.style.display = 'block';
    if (d.reclassified > 0) { loadStats(); loadLibraryCounts(); }
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger)">✗ Erreur réseau</span>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Lancer';
  }
}
window.reclassifyAll = reclassifyAll;

async function reclassifyConcerts() {
  const btn    = document.getElementById('reclassifyConcertsBtn');
  const result = document.getElementById('reclassifyConcertsResult');
  btn.disabled = true;
  btn.textContent = '⏳ En cours…';
  result.style.display = 'none';
  try {
    const r = await fetch('/api/admin/reclassify-concerts', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) {
      result.innerHTML = `<span style="color:var(--danger)">✗ ${escHtml(d.error || 'Erreur')}</span>`;
    } else if (d.reclassified === 0) {
      result.innerHTML = `<span style="color:var(--success)">✓ Aucun concert détecté parmi les ${d.candidates} candidats.</span>`;
    } else {
      result.innerHTML = `<span style="color:var(--success)">✓ ${d.reclassified} média(s) reclassifié(s) en concerts.</span>`;
      loadStats(); loadLibraryCounts();
    }
    result.style.display = 'block';
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger)">✗ Erreur réseau</span>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Lancer';
  }
}
window.reclassifyConcerts = reclassifyConcerts;

async function fixFalseConcerts() {
  const btn    = document.getElementById('fixFalseConcertsBtn');
  const result = document.getElementById('fixFalseConcertsResult');
  btn.disabled = true;
  btn.textContent = '⏳ En cours…';
  result.style.display = 'none';
  try {
    const r = await fetch('/api/admin/fix-false-concerts', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) {
      result.innerHTML = `<span style="color:var(--danger)">✗ ${escHtml(d.error || 'Erreur')}</span>`;
    } else if (d.fixed === 0) {
      result.innerHTML = `<span style="color:var(--success)">✓ Aucun faux concert détecté parmi les ${d.candidates} candidats.</span>`;
    } else {
      result.innerHTML = `<span style="color:var(--success)">✓ ${d.fixed} faux concert(s) remis en Films/Séries.</span>`;
      loadStats(); loadLibraryCounts();
    }
    result.style.display = 'block';
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger)">✗ Erreur réseau</span>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Lancer';
  }
}
window.fixFalseConcerts = fixFalseConcerts;

async function reclassifySpectacles() {
  const btn    = document.getElementById('reclassifySpectaclesBtn');
  const result = document.getElementById('reclassifySpectaclesResult');
  btn.disabled = true;
  btn.textContent = '⏳ En cours…';
  result.style.display = 'none';
  try {
    const r = await fetch('/api/admin/reclassify-spectacles', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) {
      result.innerHTML = `<span style="color:var(--danger)">✗ ${escHtml(d.error || 'Erreur')}</span>`;
    } else if (d.reclassified === 0) {
      result.innerHTML = `<span style="color:var(--success)">✓ Aucun spectacle détecté parmi les ${d.candidates} candidats.</span>`;
    } else {
      result.innerHTML = `<span style="color:var(--success)">✓ ${d.reclassified} média(s) reclassifié(s) en spectacles.</span>`;
      loadStats(); loadLibraryCounts();
    }
    result.style.display = 'block';
  } catch (e) {
    result.innerHTML = `<span style="color:var(--danger)">✗ Erreur réseau</span>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Lancer';
  }
}
window.reclassifySpectacles = reclassifySpectacles;

// ═══════════════════════════ CONFIG ════════════════════════════════════

let rssFieldCounter = 0;

window.addRssField = function (value, force, name) {
  rssFieldCounter++;
  const container = document.getElementById('additionalRssContainer');
  if (!container) return;
  const id  = 'rss-field-' + rssFieldCounter;
  const div = document.createElement('div');
  div.className = 'rss-field-block';
  div.id = id;
  div.innerHTML = `
    <div class="rss-field-row" style="margin-bottom:5px">
      <input type="text" class="additional-rss-name rss-name-input"
        placeholder="Nom du flux (ex: MonTracker)"
        value="${escHtml(name || '')}">
    </div>
    <div class="rss-field-row">
      <input type="url" class="additional-rss-url flex-1"
        placeholder="https://domain.tld/rssnew?cats=...&key=..."
        value="${escHtml(value || '')}">
      <select class="additional-rss-force select-catalog">
        <option value="auto"${(!force || force === 'auto') ? ' selected' : ''}>Tout</option>
        <option value="films"${force === 'films' ? ' selected' : ''}>Films</option>
        <option value="series"${force === 'series' ? ' selected' : ''}>Séries</option>
        <option value="documentaires"${force === 'documentaires' ? ' selected' : ''}>Documentaires</option>
        <option value="emissions"${force === 'emissions' ? ' selected' : ''}>Émissions TV</option>
        <option value="animés"${force === 'animés' ? ' selected' : ''}>Animés</option>
        <option value="concerts"${force === 'concerts' ? ' selected' : ''}>Concerts</option>
        <option value="spectacles"${force === 'spectacles' ? ' selected' : ''}>Spectacles</option>
      </select>
      <button type="button" class="btn-sm btn-danger"
        onclick="document.getElementById('${id}').remove()"
        data-i18n="config_rss_remove_btn">✕</button>
    </div>
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

    ['rss_films_name', 'rss_films_url', 'rss_films_force', 'required_tags', 'tmdb_api_key', 'tvdb_api_key',
     'mal_client_id', 'rpdb_api_key', 'omdb_api_key', 'proxy_protocol', 'proxy_host', 'proxy_port', 'proxy_username',
     'proxy_password', 'refresh_interval', 'discord_webhook_url',
     'prowlarr_url', 'prowlarr_apikey', 'nzbhydra2_url', 'nzbhydra2_apikey',
     'apprise_server_url', 'apprise_urls', 'notification_language'].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.value = cfg[k] || '';
    });

    ['rpdb_enabled', 'proxy_enabled', 'auto_refresh_enabled',
     'discord_notifications_enabled', 'discord_enhanced_notifications_enabled',
     'discord_rpdb_posters_enabled', 'apprise_enabled', 'anilist_enabled'].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.checked = cfg[k] === 'true';
    });

    const container = document.getElementById('additionalRssContainer');
    container.innerHTML = '';
    rssFieldCounter = 0;
    try {
      const urls = JSON.parse(cfg.rss_additional_urls || '[]');
      urls.forEach(item => {
        if (typeof item === 'object') addRssField(item.url, item.force, item.name);
        else addRssField(item, 'auto', '');
      });
    } catch (e) { console.error('parse rss_additional_urls', e); }

  } catch (e) { console.error('loadConfig', e); }
}

async function saveConfig(e) {
  e.preventDefault();
  const msg = document.getElementById('configMsg');
  msg.textContent = '';

  const cfg = {};
  ['rss_films_name', 'rss_films_url', 'rss_films_force', 'required_tags', 'tmdb_api_key', 'tvdb_api_key',
   'mal_client_id', 'rpdb_api_key', 'omdb_api_key', 'proxy_protocol', 'proxy_host', 'proxy_port', 'proxy_username',
   'proxy_password', 'refresh_interval', 'discord_webhook_url',
   'prowlarr_url', 'prowlarr_apikey', 'nzbhydra2_url', 'nzbhydra2_apikey',
   'apprise_server_url', 'apprise_urls', 'notification_language'].forEach(k => {
    const el = document.getElementById(k);
    if (el) cfg[k] = el.value;
  });

  ['rpdb_enabled', 'proxy_enabled', 'auto_refresh_enabled',
   'discord_notifications_enabled', 'discord_enhanced_notifications_enabled',
   'discord_rpdb_posters_enabled', 'apprise_enabled', 'anilist_enabled'].forEach(k => {
    const el = document.getElementById(k);
    if (el) cfg[k] = el.checked ? 'true' : 'false';
  });

  const urls = [];
  document.querySelectorAll('.rss-field-block').forEach(block => {
    const url   = block.querySelector('.additional-rss-url')?.value?.trim();
    const force = block.querySelector('.additional-rss-force')?.value || 'auto';
    const name  = block.querySelector('.additional-rss-name')?.value?.trim() || '';
    if (url) urls.push({ url, force, name });
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
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris'
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
  loadOverview();
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
