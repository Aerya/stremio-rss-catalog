/**
 * Stremio RSS Catalog Dashboard Logic
 * Handles all client-side interactions, data loading, and UI updates.
 */

// --- Global Functions (attached to window for HTML access) ---

window.copyInstallUrl = function () {
    const urlToCopy = document.getElementById('installUrl').textContent;

    // Modern API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(urlToCopy).then(function () {
            alert(t('install_copied'));
        }).catch(function (err) {
            console.error('Async: Could not copy text: ', err);
            fallbackCopyTextToClipboard(urlToCopy);
        });
    } else {
        fallbackCopyTextToClipboard(urlToCopy);
    }
};

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        var successful = document.execCommand('copy');
        if (successful) {
            alert(t('install_copied'));
        } else {
            alert(t('install_copy_error'));
        }
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
        alert(t('install_copy_error'));
    }

    document.body.removeChild(textArea);
}

// ====== Dynamic RSS Feed Fields ======

let rssFieldCounter = 0;

function addRssField(value, force) {
    rssFieldCounter++;
    const container = document.getElementById('additionalRssContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'form-group';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    row.id = 'rss-field-' + rssFieldCounter;

    const input = document.createElement('input');
    input.type = 'url';
    input.className = 'additional-rss-url';
    input.placeholder = 'https://domain.tld/rssnew?cats=...&key=...';
    input.style.flex = '1';
    input.style.minWidth = '0';
    if (value) input.value = value;

    const selectWrapper = document.createElement('div');
    selectWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 3px; flex-shrink: 0;';

    const selectLabel = document.createElement('label');
    selectLabel.textContent = 'Catalogue';
    selectLabel.style.cssText = 'font-size: 11px; color: #888; margin: 0;';

    const select = document.createElement('select');
    select.className = 'additional-rss-force';
    select.style.cssText = 'width: 160px; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px; cursor: pointer;';
    [
        { value: 'auto', label: 'Tout' },
        { value: 'films', label: 'Films' },
        { value: 'series', label: 'Séries' },
        { value: 'documentaires', label: 'Documentaires' }
    ].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        select.appendChild(o);
    });
    if (force) select.value = force;

    selectWrapper.appendChild(selectLabel);
    selectWrapper.appendChild(select);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = t('config_rss_remove_btn');
    removeBtn.style.cssText = 'background: #e53e3e; color: white; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 13px; white-space: nowrap;';
    removeBtn.onclick = function () { row.remove(); };

    row.appendChild(input);
    row.appendChild(selectWrapper);
    row.appendChild(removeBtn);
    container.appendChild(row);
}

function removeRssField(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function getAdditionalRssUrls() {
    const rows = document.querySelectorAll('#additionalRssContainer .form-group');
    const urls = [];
    rows.forEach(row => {
        const input = row.querySelector('.additional-rss-url');
        const select = row.querySelector('.additional-rss-force');
        if (input && input.value && input.value.trim()) {
            urls.push({ url: input.value.trim(), force: select ? select.value : 'auto' });
        }
    });
    return urls;
}

window.toggleTheme = function () {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Update button text
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
        btn.textContent = newTheme === 'dark' ? 'Ta gueule !' : 'Ça va être tout noir !';
    }
};

window.startSync = async function () {
    try {
        const response = await fetch('/api/sync', { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            document.getElementById('syncStatus').style.display = 'block';
            checkSyncStatus();
            if (!window.syncInterval) {
                window.syncInterval = setInterval(checkSyncStatus, 2000);
            }
        } else {
            alert(t('sync_error_label') + ': ' + data.error);
        }
    } catch (error) {
        alert(t('config_error_network'));
    }
};

window.logout = async function () {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
};

// --- Internal Logic ---

let syncInterval = null;

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();

        const cards = document.querySelectorAll('.stat-card .value');
        if (cards.length >= 4) {
            cards[0].textContent = stats.films;
            cards[1].textContent = stats.documentaires;
            cards[2].textContent = stats.series;
            cards[3].textContent = stats.total;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();

        for (const [key, value] of Object.entries(config)) {
            const field = document.getElementById(key);
            if (field) {
                if (field.type === 'checkbox') {
                    field.checked = value === 'true';
                } else {
                    field.value = value;
                }
            }
        }

        // Populate additional RSS fields
        if (config.rss_additional_urls) {
            try {
                const urls = JSON.parse(config.rss_additional_urls);
                const container = document.getElementById('additionalRssContainer');
                if (container) container.innerHTML = '';
                rssFieldCounter = 0;
                if (Array.isArray(urls)) {
                    urls.forEach(entry => {
                        if (!entry) return;
                        // Compat ancien format (string) et nouveau format (objet)
                        if (typeof entry === 'string') {
                            if (entry.trim()) addRssField(entry.trim(), 'auto');
                        } else if (entry.url && entry.url.trim()) {
                            addRssField(entry.url.trim(), entry.force || 'auto');
                        }
                    });
                }
            } catch (e) {
                console.error('Error parsing rss_additional_urls:', e);
            }
        }

        updateAutoRefreshStatus(config);
    } catch (error) {
        console.error('Error loading config:', error);
    }
}

function updateAutoRefreshStatus(config) {
    const enabled = config.auto_refresh_enabled === 'true';
    const interval = config.refresh_interval || '180';
    const statusSpan = document.getElementById('autoRefreshState');

    if (statusSpan) {
        if (enabled) {
            statusSpan.innerHTML = '<span style="color: #48bb78;">' + t('sync_auto_enabled').replace('{interval}', interval) + '</span>';
        } else {
            statusSpan.innerHTML = '<span style="color: #e53e3e;">' + t('sync_auto_disabled') + '</span>';
        }
    }
}

async function checkSyncStatus() {
    try {
        const response = await fetch('/api/sync/status');
        const status = await response.json();

        if (!status.running && window.syncInterval) {
            clearInterval(window.syncInterval);
            window.syncInterval = null;
            loadStats();
        }

        const syncStageEl = document.getElementById('syncStage');
        if (syncStageEl) syncStageEl.textContent = status.stage || t('sync_waiting');

        if (status.total > 0) {
            const percent = Math.round((status.progress / status.total) * 100);
            const fill = document.getElementById('progressFill');
            const text = document.getElementById('progressText');
            const details = document.getElementById('syncDetails');

            if (fill) fill.style.width = percent + '%';
            if (text) text.textContent = percent + '%';
            if (details) details.textContent = t('sync_progress') + ': ' + status.progress + '/' + status.total + ' | ' + t('sync_matched_label') + ': ' + status.matched + ' | ' + t('sync_unprocessed') + ': ' + status.failed;
        }

        if (status.completed || status.error) {
            const fill = document.getElementById('progressFill');
            const text = document.getElementById('progressText');

            if (fill) fill.style.width = '100%';
            if (text) text.textContent = status.error ? t('sync_error') : t('sync_completed');

            setTimeout(loadSyncHistory, 1000);
        }
    } catch (error) {
        console.error('Error checking sync status:', error);
    }
}

async function loadSyncHistory() {
    try {
        const response = await fetch('/api/sync/history?limit=3');
        const history = await response.json();

        const container = document.getElementById('syncHistoryContainer');
        if (!container) return;

        if (history.length === 0) {
            container.innerHTML = '<p style="color: #666;">' + t('sync_none') + '</p>';
            return;
        }

        container.innerHTML = history.map(sync => {
            const startDate = new Date(sync.started_at);
            const duration = sync.finished_at ? Math.round((sync.finished_at - sync.started_at) / 1000) : 0;
            const statusClass = sync.status === 'error' ? 'error' : (sync.status === 'running' ? 'running' : '');
            const statusText = sync.status === 'completed' ? t('sync_completed') : (sync.status === 'error' ? t('sync_error') : t('sync_running'));
            const matchRate = sync.total_items > 0 ? Math.round((sync.matched_items / sync.total_items) * 100) : 0;
            const newItems = (sync.matched_items - (sync.already_in_db || 0));

            return `
            <div class="history-item ${statusClass}">
                <div class="history-meta">
                    <strong>${startDate.toLocaleString()}</strong> | 
                    ${t('sync_duration')}: ${duration}s | 
                    ${t('sync_status')}: <strong>${statusText}</strong>
                    ${sync.error_message ? '<br><span style="color: #e53e3e;">' + t('sync_error_label') + ': ' + sync.error_message + '</span>' : ''}
                </div>
                <div class="history-stats">
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_releases')}</div>
                        <div class="history-stat-value">${sync.total_items}</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_matched')}</div>
                        <div class="history-stat-value" style="color: #48bb78;">${sync.matched_items}</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_match_rate')}</div>
                        <div class="history-stat-value">${matchRate}%</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_already_in_db')}</div>
                        <div class="history-stat-value" style="color: #718096;">${sync.already_in_db || 0}</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_new')}</div>
                        <div class="history-stat-value" style="color: #8b5cf6;">${newItems}</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_films')}</div>
                        <div class="history-stat-value" style="color: #667eea;">+${sync.films_added}</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_docs')}</div>
                        <div class="history-stat-value" style="color: #667eea;">+${sync.documentaires_added}</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_series')}</div>
                        <div class="history-stat-value" style="color: #ed8936;">+${sync.series_added || 0}</div>
                    </div>
                    <div class="history-stat">
                        <div class="history-stat-label">${t('sync_failed')}</div>
                        <div class="history-stat-value" style="color: #e53e3e;">${sync.failed_items}</div>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (error) {
        console.error('Error loading sync history:', error);
    }
}

async function loadSyncDates() {
    try {
        const response = await fetch('/api/sync/history/dates');
        const dates = await response.json();

        const select = document.getElementById('dateFilter');
        if (!select) return;

        const defaultOption = select.options[0];
        select.innerHTML = '';
        select.appendChild(defaultOption);

        dates.forEach(item => {
            const option = document.createElement('option');
            option.value = item.date;
            option.textContent = item.date + ' (' + item.count + ' sync' + (item.count > 1 ? 's' : '') + ')';
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading dates:', error);
    }
}

// Make available globally for the onchange event
window.loadSyncHistoryByDate = async function () {
    const dateEl = document.getElementById('dateFilter');
    if (!dateEl) return;

    const date = dateEl.value;

    if (!date) {
        loadSyncHistory();
        return;
    }

    try {
        const response = await fetch('/api/sync/history/by-date?date=' + date);
        const history = await response.json();

        const container = document.getElementById('syncHistoryContainer');
        if (!container) return;

        if (history.length === 0) {
            container.innerHTML = '<p style="color: #666;">' + t('sync_none_date') + '</p>';
            return;
        }

        // Reuse the same rendering logic (simplified for brevity, ideally refactor to a render function)
        container.innerHTML = history.map(sync => {
            // ... same rendering code as loadSyncHistory ...
            // For now, let's just call loadSyncHistory if the logic is identical, 
            // BUT the data source is different. 
            // To keep this file clean, I'll duplicate the render logic or create a helper.
            // Let's use a helper function for rendering.
            return renderSyncHistoryItem(sync);
        }).join('');
    } catch (error) {
        console.error('Error loading history by date:', error);
    }
};

function renderSyncHistoryItem(sync) {
    const startDate = new Date(sync.started_at);
    const duration = sync.finished_at ? Math.round((sync.finished_at - sync.started_at) / 1000) : 0;
    const statusClass = sync.status === 'error' ? 'error' : (sync.status === 'running' ? 'running' : '');
    const statusText = sync.status === 'completed' ? t('sync_completed') : (sync.status === 'error' ? t('sync_error') : t('sync_running'));
    const matchRate = sync.total_items > 0 ? Math.round((sync.matched_items / sync.total_items) * 100) : 0;
    const newItems = (sync.matched_items - (sync.already_in_db || 0));

    return `
    <div class="history-item ${statusClass}">
        <div class="history-meta">
            <strong>${startDate.toLocaleString()}</strong> | 
            ${t('sync_duration')}: ${duration}s | 
            ${t('sync_status')}: <strong>${statusText}</strong>
            ${sync.error_message ? '<br><span style="color: #e53e3e;">' + t('sync_error_label') + ': ' + sync.error_message + '</span>' : ''}
        </div>
        <div class="history-stats">
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_releases')}</div>
                <div class="history-stat-value">${sync.total_items}</div>
            </div>
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_matched')}</div>
                <div class="history-stat-value" style="color: #48bb78;">${sync.matched_items}</div>
            </div>
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_match_rate')}</div>
                <div class="history-stat-value">${matchRate}%</div>
            </div>
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_already_in_db')}</div>
                <div class="history-stat-value" style="color: #718096;">${sync.already_in_db || 0}</div>
            </div>
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_new')}</div>
                <div class="history-stat-value" style="color: #8b5cf6;">${newItems}</div>
            </div>
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_films')}</div>
                <div class="history-stat-value" style="color: #667eea;">+${sync.films_added}</div>
            </div>
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_docs')}</div>
                <div class="history-stat-value" style="color: #667eea;">+${sync.documentaires_added}</div>
            </div>
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_series')}</div>
                <div class="history-stat-value" style="color: #ed8936;">+${sync.series_added || 0}</div>
            </div>
            <div class="history-stat">
                <div class="history-stat-label">${t('sync_failed')}</div>
                <div class="history-stat-value" style="color: #e53e3e;">${sync.failed_items}</div>
            </div>
        </div>
    </div>`;
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Dashboard JS loaded');

    // 1. Theme Init
    try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.body.setAttribute('data-theme', savedTheme);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.setAttribute('data-theme', 'dark');
        }

        // Update button text based on current theme
        const currentTheme = document.body.getAttribute('data-theme');
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.textContent = currentTheme === 'dark' ? 'Ta gueule !' : 'Ça va être tout noir !';
        }
        // Init i18n
        initI18n();
    } catch (e) {
        console.error('Theme init error:', e);
    }

    // 2. Install URL Init
    function setInstallUrl() {
        const el = document.getElementById('installUrl');
        if (el) {
            const url = window.location.origin + '/manifest.json';
            el.innerHTML = url;
            console.log('✓ Install URL set to:', url);
        }
    }
    setInstallUrl();

    // 3. Config Form Listener
    const configForm = document.getElementById('configForm');
    if (configForm) {
        configForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const config = {};

            // Read all form fields (text inputs, selects, etc.)
            const formData = new FormData(e.target);
            for (const [key, value] of formData.entries()) {
                config[key] = value;
            }

            // Handle all checkboxes explicitly (checked or not)
            const checkboxes = [
                'proxy_enabled',
                'auto_refresh_enabled',
                'rpdb_enabled',
                'discord_notifications_enabled',
                'discord_enhanced_notifications_enabled',
                'discord_rpdb_posters_enabled'
            ];

            checkboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    config[id] = checkbox.checked ? 'true' : 'false';
                    console.log(`[Config] ${id}: ${config[id]}`);
                }
            });

            // Collect additional RSS URLs as JSON array
            config.rss_additional_urls = JSON.stringify(getAdditionalRssUrls());

            try {
                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });

                const data = await response.json();
                const msg = document.getElementById('configMessage');

                if (response.ok) {
                    msg.className = 'success';
                    msg.textContent = t('config_saved');
                    setTimeout(() => msg.textContent = '', 3000);
                    loadConfig();
                } else {
                    msg.className = 'error';
                    msg.textContent = '✗ ' + data.error;
                }
            } catch (error) {
                const msg = document.getElementById('configMessage');
                if (msg) {
                    msg.className = 'error';
                    msg.textContent = t('config_error_network');
                }
            }
        });
    }

    // 4. Initial Data Load
    loadStats();
    loadConfig();
    loadSyncHistory();
    loadSyncDates();

    // 5. Intervals
    setInterval(loadStats, 30000);
    setInterval(loadSyncHistory, 30000);
    setInterval(loadSyncDates, 60000);
});
