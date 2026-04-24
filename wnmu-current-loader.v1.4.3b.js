(function () {
  const CONFIG = window.WNMU_MONTHLY_PAGE_CONFIG;
  if (!CONFIG) return;

  const BUILD_VERSION = 'v1.4.3b';
  const archiveId = new URLSearchParams(window.location.search).get('archive');
  const TABLES = {
    importedMonths: 'wnmu_monthly_schedules_imported_months',
    currentMonths: 'wnmu_monthly_schedules_current_months',
    sharedMarks: 'wnmu_monthly_schedules_shared_marks',
    legacySharedMarks: 'wnmu_sched_shared_marks',
    archives: 'wnmu_monthly_archives'
  };
  const JSON_CACHE_PREFIX = 'wnmu_json_cache_v1_3_1';
  const LIVE_PAGES = {
    '13.1': 'index131.v1.4.1.html',
    '13.3': 'index133.v1.4.1.html'
  };
  let activeMonthKey = null;
  let sharedMarksSyncInstalled = false;
  let sharedMarksLastRaw = null;
  let sharedMarksSyncTimer = null;

  function esc(text) {
    return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function monthLabel(monthKey) {
    const [y, m] = String(monthKey).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function getCfg() {
    return window.WNMU_SHAREBOARD_SUPABASE;
  }
  function ensureCfg() {
    const cfg = getCfg();
    if (!cfg?.url || !cfg?.anonKey) throw new Error('config.js is missing Supabase credentials.');
    return cfg;
  }
  async function restSelect(pathAndQuery) {
    const cfg = ensureCfg();
    const res = await fetch(`${cfg.url}${pathAndQuery}`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      cache: 'no-store'
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase read failed (${res.status}) ${txt}`.trim());
    }
    return res.json();
  }

  async function restWrite(pathAndQuery, body, method = 'POST') {
    const cfg = ensureCfg();
    const res = await fetch(`${cfg.url}${pathAndQuery}`, {
      method,
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase write failed (${res.status}) ${txt}`.trim());
    }
    return res.json().catch(() => null);
  }
  function cacheJson(file, kind, data) {
    try {
      const key = `${JSON_CACHE_PREFIX}::${kind}::${CONFIG.buildVersion}::${file}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }
  function dateWeekday(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  function normalizeScheduleShape(schedule) {
    if (!schedule || typeof schedule !== 'object') return schedule;
    (schedule.days || []).forEach(day => {
      const dayName = day.dayName || day.day || dateWeekday(day.date);
      day.dayName = dayName;
      day.day = day.day || dayName;
      (day.entries || []).forEach(entry => {
        const entryDayName = entry.dayName || entry.day || dayName || dateWeekday(entry.date);
        entry.dayName = entryDayName;
        entry.day = entry.day || entryDayName;
      });
    });
    (schedule.weeks || []).forEach(week => {
      (week || []).forEach(day => {
        const dayName = day.dayName || day.day || dateWeekday(day.date);
        day.dayName = dayName;
        day.day = day.day || dayName;
      });
    });
    return schedule;
  }
  function normalizeVerificationShape(verification) {
    if (!verification || typeof verification !== 'object') return verification || {};
    (verification.dailyCoverage || []).forEach(day => {
      const dayName = day.dayName || day.day || dateWeekday(day.date);
      day.dayName = dayName;
      day.day = day.day || dayName;
    });
    return verification;
  }

  function renderMonthNavFromRows(rows, currentByChannel, channelCode, selectedMonth) {
    const host = document.getElementById('monthNav');
    if (!host) return;
    const months = rows
      .filter(row => row.channel_code === channelCode)
      .sort((a, b) => b.month_key.localeCompare(a.month_key));
    if (!months.length) {
      host.textContent = 'No imported months are available for this channel yet.';
      return;
    }
    host.innerHTML = months.map(row => {
      const isCurrent = currentByChannel[channelCode] === row.month_key;
      const isSelected = selectedMonth === row.month_key;
      const bits = [];
      if (isSelected) bits.push('viewing');
      if (isCurrent) bits.push('current');
      const suffix = bits.length ? ` <span style="opacity:.7">(${bits.join(', ')})</span>` : '';
      return `<a href="?month=${encodeURIComponent(row.month_key)}" style="color:${isSelected ? '#fff' : '#cfd7ff'};text-decoration:${isSelected ? 'underline' : 'none'}">${esc(row.label || monthLabel(row.month_key))}</a>${suffix}`;
    }).join(' &nbsp;·&nbsp; ');
  }
  function renderAltChannelLinkFromRows(rows, currentByChannel, selectedMonth) {
    const link = document.getElementById('otherChannelLink');
    if (!link) return;
    const otherCode = CONFIG.channelCode === '13.1' ? '13.3' : '13.1';
    const otherRows = rows.filter(row => row.channel_code === otherCode);
    const hasSameMonth = otherRows.some(row => row.month_key === selectedMonth);
    const fallbackMonth = currentByChannel[otherCode] || otherRows.map(row => row.month_key).sort().slice(-1)[0] || '';
    const otherMonth = hasSameMonth ? selectedMonth : fallbackMonth;
    link.href = `${LIVE_PAGES[otherCode]}${otherMonth ? `?month=${encodeURIComponent(otherMonth)}` : ''}`;
    link.textContent = `Go to ${otherCode}`;
  }
  function buildRegistryLike(rows, currentByChannel) {
    const registry = { version: BUILD_VERSION, current: currentByChannel, channels: {} };
    rows.forEach(row => {
      if (!registry.channels[row.channel_code]) registry.channels[row.channel_code] = { label: row.channel_label, months: {} };
      registry.channels[row.channel_code].months[row.month_key] = {
        label: row.label,
        pageTitle: row.page_title,
        storageKey: row.storage_key,
        source: 'supabase'
      };
    });
    return registry;
  }
  async function loadSupabaseMonth() {
    const monthsSelect = 'id,channel_code,channel_label,month_key,label,page_title,storage_key,published_at,updated_at';
    const rows = await restSelect(`/rest/v1/${TABLES.importedMonths}?select=${monthsSelect}&order=month_key.desc&limit=500`);
    const currentRows = await restSelect(`/rest/v1/${TABLES.currentMonths}?select=channel_code,month_key`);
    const currentByChannel = {};
    (currentRows || []).forEach(row => { currentByChannel[row.channel_code] = row.month_key; });
    const selectedMonth = new URLSearchParams(window.location.search).get('month') || currentByChannel[CONFIG.channelCode];
    activeMonthKey = selectedMonth;
    if (!selectedMonth) throw new Error(`No current imported month is set for ${CONFIG.channelLabel}.`);
    const detailRows = await restSelect(`/rest/v1/${TABLES.importedMonths}?select=*&channel_code=eq.${encodeURIComponent(CONFIG.channelCode)}&month_key=eq.${encodeURIComponent(selectedMonth)}&limit=1`);
    if (!Array.isArray(detailRows) || !detailRows.length) throw new Error(`No imported month was found in Supabase for ${CONFIG.channelLabel} ${selectedMonth}.`);
    const row = detailRows[0];
    const schedule = normalizeScheduleShape(row.schedule_json);
    const verification = normalizeVerificationShape(row.verification_json || {});
    const scheduleFile = `supabase-imported-months/${CONFIG.channelCode}/${selectedMonth}/schedule-${row.updated_at || row.published_at || 'live'}.json`;
    const verificationFile = `supabase-imported-months/${CONFIG.channelCode}/${selectedMonth}/verification-${row.updated_at || row.published_at || 'live'}.json`;
    CONFIG.scheduleFile = scheduleFile;
    CONFIG.verificationFile = verificationFile;
    CONFIG.storageKey = row.storage_key || `${CONFIG.channelLabel.toLowerCase()}-${selectedMonth}-marks`;
    cacheJson(scheduleFile, 'schedule', schedule);
    cacheJson(verificationFile, 'verification', verification);

    const registry = buildRegistryLike(Array.isArray(rows) ? rows : [], currentByChannel);
    window.WNMU_CURRENT_MONTH_META = {
      monthKey: selectedMonth,
      registry,
      monthMeta: {
        label: row.label || monthLabel(selectedMonth),
        pageTitle: row.page_title || `${CONFIG.channelLabel} ${monthLabel(selectedMonth)}`,
        storageKey: CONFIG.storageKey,
        source: 'supabase'
      }
    };
    const heading = row.page_title || `${CONFIG.channelLabel} ${row.label || monthLabel(selectedMonth)}`;
    document.title = `${heading} Weekly Grids`;
    setText('pageHeading', heading);
    setText('pageSub', `${row.label || monthLabel(selectedMonth)} • loaded from Supabase imported months.`);
    renderMonthNavFromRows(Array.isArray(rows) ? rows : [], currentByChannel, CONFIG.channelCode, selectedMonth);
    renderAltChannelLinkFromRows(Array.isArray(rows) ? rows : [], currentByChannel, selectedMonth);
    return true;
  }

  async function fetchJson(path) {
    const candidates = [path];
    if (!path.includes('.v.')) {
      candidates.push(path.replace('.v1.4.1.', '.v.1.4.1.').replace('.v1.4.1', '.v.1.4.1'));
      candidates.push(path.replace('.v1.4.0.', '.v.1.4.0.').replace('.v1.4.0', '.v.1.4.0'));
    }
    let lastErr = null;
    for (const candidate of candidates) {
      try {
        const res = await fetch(`${candidate}?cachebust=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Could not load ${candidate} (${res.status})`);
        return await res.json();
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error(`Could not load ${path}`);
  }
  function renderMonthNavFromRegistry(registry, channelCode, selectedMonth) {
    const host = document.getElementById('monthNav');
    if (!host) return;
    const months = Object.entries((registry.channels?.[channelCode]?.months) || {})
      .sort((a, b) => b[0].localeCompare(a[0]));
    if (!months.length) {
      host.textContent = 'No imported months are available for this channel yet.';
      return;
    }
    host.innerHTML = months.map(([monthKey, meta]) => {
      const isCurrent = registry.current?.[channelCode] === monthKey;
      const isSelected = selectedMonth === monthKey;
      const bits = [];
      if (isSelected) bits.push('viewing');
      if (isCurrent) bits.push('current');
      const suffix = bits.length ? ` <span style="opacity:.7">(${bits.join(', ')})</span>` : '';
      return `<a href="?month=${encodeURIComponent(monthKey)}" style="color:${isSelected ? '#fff' : '#cfd7ff'};text-decoration:${isSelected ? 'underline' : 'none'}">${esc(meta.label || monthLabel(monthKey))}</a>${suffix}`;
    }).join(' &nbsp;·&nbsp; ');
  }
  function renderAltChannelLinkFromRegistry(registry, selectedMonth) {
    const link = document.getElementById('otherChannelLink');
    if (!link) return;
    const otherCode = CONFIG.channelCode === '13.1' ? '13.3' : '13.1';
    const months = registry.channels?.[otherCode]?.months || {};
    const otherMonth = months[selectedMonth] ? selectedMonth : (registry.current?.[otherCode] || Object.keys(months).sort().slice(-1)[0] || '');
    link.href = `${LIVE_PAGES[otherCode]}${otherMonth ? `?month=${encodeURIComponent(otherMonth)}` : ''}`;
    link.textContent = `Go to ${otherCode}`;
  }
  async function loadRegistryFallback() {
    const registry = await fetchJson(CONFIG.registryFile || 'data/month-registry.v1.4.1.json');
    const selectedMonth = new URLSearchParams(window.location.search).get('month') || registry.current?.[CONFIG.channelCode];
    activeMonthKey = selectedMonth;
    const monthMeta = registry.channels?.[CONFIG.channelCode]?.months?.[selectedMonth];
    if (!selectedMonth || !monthMeta) throw new Error(`No imported month was found for ${CONFIG.channelLabel}.`);
    CONFIG.scheduleFile = monthMeta.scheduleFile;
    CONFIG.verificationFile = monthMeta.verificationFile;
    CONFIG.storageKey = monthMeta.storageKey || `${CONFIG.channelLabel.toLowerCase()}-${selectedMonth}-marks`;
    try {
      const [schedule, verification] = await Promise.all([
        fetchJson(monthMeta.scheduleFile),
        fetchJson(monthMeta.verificationFile)
      ]);
      cacheJson(monthMeta.scheduleFile, 'schedule', normalizeScheduleShape(schedule));
      cacheJson(monthMeta.verificationFile, 'verification', normalizeVerificationShape(verification));
    } catch (err) {
      console.warn('Fallback month pre-cache failed; renderer will try direct JSON fetch.', err);
    }
    window.WNMU_CURRENT_MONTH_META = { monthKey: selectedMonth, registry, monthMeta };
    const heading = monthMeta.pageTitle || `${CONFIG.channelLabel} ${monthMeta.label || monthLabel(selectedMonth)}`;
    document.title = `${heading} Weekly Grids`;
    setText('pageHeading', heading);
    setText('pageSub', `${monthMeta.label || monthLabel(selectedMonth)} • loaded from bundled imported-month fallback.`);
    renderMonthNavFromRegistry(registry, CONFIG.channelCode, selectedMonth);
    renderAltChannelLinkFromRegistry(registry, selectedMonth);
  }

  function getChannelSlug() {
    if (CONFIG.channelCode === '13.1') return 'wnmu1hd';
    if (CONFIG.channelCode === '13.3') return 'wnmu3pl';
    return String(CONFIG.channelLabel || CONFIG.channelCode || 'wnmu').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  function readLocalSharedState() {
    if (!CONFIG.storageKey) return {};
    try {
      const parsed = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  function writeLocalSharedState(state) {
    if (!CONFIG.storageKey || !state || typeof state !== 'object') return;
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
      sharedMarksLastRaw = JSON.stringify(state);
    } catch (err) {
      console.warn('Could not seed local WNMU marks state.', err);
    }
  }
  function stateEntryLooksEmpty(value) {
    if (!value || typeof value !== 'object') return true;
    if (value.rectNote) return false;
    if (value.note || value.whiteout) return false;
    const tags = value.tags && typeof value.tags === 'object' ? value.tags : value;
    return !Object.values(tags || {}).some(v => v === true);
  }
  function normalizeStateEntry(value) {
    if (!value || typeof value !== 'object') return {};
    return value;
  }
  async function fetchV2SharedMarks() {
    if (!activeMonthKey) return {};
    const rows = await restSelect(`/rest/v1/${TABLES.sharedMarks}?select=entry_key,mark_json,source,legacy_note,legacy_entry_key,legacy_is_marked,updated_at&channel_code=eq.${encodeURIComponent(CONFIG.channelCode)}&month_key=eq.${encodeURIComponent(activeMonthKey)}&limit=2000`);
    const state = {};
    const legacyRows = [];
    (rows || []).forEach(row => {
      if (row?.mark_json?.legacy_unmapped) legacyRows.push(row);
      else if (row.entry_key) state[row.entry_key] = normalizeStateEntry(row.mark_json || {});
    });
    if (legacyRows.length) window.WNMU_LEGACY_SHARED_MARKS = (window.WNMU_LEGACY_SHARED_MARKS || []).concat(legacyRows.map(row => ({
      source: row.source || 'v2-legacy',
      entry_key: row.legacy_entry_key || row.entry_key,
      is_marked: !!row.legacy_is_marked,
      note: row.legacy_note || '',
      updated_at: row.updated_at || ''
    })));
    return state;
  }
  async function fetchArchiveSnapshotState() {
    if (!activeMonthKey) return {};
    const wantedLabel = monthLabel(activeMonthKey).toLowerCase();
    const rows = await restSelect(`/rest/v1/${TABLES.archives}?select=id,archive_name,channel_code,storage_key,snapshot_json,stats_json,created_at&channel_code=eq.${encodeURIComponent(CONFIG.channelCode)}&order=created_at.desc&limit=10`);
    const picked = (rows || []).find(row => {
      const archiveName = String(row.archive_name || '').toLowerCase();
      const storageKey = String(row.storage_key || '').toLowerCase();
      return archiveName.includes(wantedLabel) || storageKey.includes(activeMonthKey.replace('-', '')) || storageKey.includes(activeMonthKey);
    });
    if (!picked || !picked.snapshot_json || typeof picked.snapshot_json !== 'object') return {};
    window.WNMU_SHARED_MARKS_ARCHIVE_SOURCE = picked;
    return picked.snapshot_json;
  }
  function parseLegacyNoteText(raw) {
    const text = String(raw || '');
    if (text.startsWith('__WNMU_NOTE__')) {
      try {
        const obj = JSON.parse(text.slice('__WNMU_NOTE__'.length));
        const bits = [];
        if (obj.category) bits.push(`[${obj.category}]`);
        if (obj.text) bits.push(obj.text);
        return bits.join(' ').trim() || text;
      } catch {}
    }
    return text;
  }
  async function fetchLegacySharedRows() {
    if (!activeMonthKey) return [];
    try {
      const rows = await restSelect(`/rest/v1/${TABLES.legacySharedMarks}?select=project_scope,channel_slug,schedule_slug,entry_key,is_marked,note,updated_by,updated_at&project_scope=eq.wnmu_schedule_shareboard&channel_slug=eq.${encodeURIComponent(getChannelSlug())}&schedule_slug=eq.${encodeURIComponent(activeMonthKey)}&limit=2000`);
      window.WNMU_LEGACY_SHARED_MARKS = (rows || []).map(row => ({
        source: 'legacy-table',
        entry_key: row.entry_key,
        is_marked: !!row.is_marked,
        note: row.note || '',
        note_label: parseLegacyNoteText(row.note || ''),
        updated_by: row.updated_by || '',
        updated_at: row.updated_at || ''
      }));
      return rows || [];
    } catch (err) {
      console.warn('Legacy shared marks table was not available.', err);
      return [];
    }
  }
  async function upsertSharedState(state, source = 'browser-localstorage') {
    if (!activeMonthKey || !state || typeof state !== 'object') return;
    const rows = Object.entries(state)
      .filter(([entryKey, value]) => entryKey && value && typeof value === 'object' && !stateEntryLooksEmpty(value))
      .map(([entryKey, value]) => ({
        channel_code: CONFIG.channelCode,
        channel_slug: getChannelSlug(),
        month_key: activeMonthKey,
        entry_key: entryKey,
        mark_json: value,
        source,
        updated_at: new Date().toISOString()
      }));
    if (rows.length) await restWrite(`/rest/v1/${TABLES.sharedMarks}?on_conflict=channel_code,month_key,entry_key`, rows);
    if (source === 'browser-localstorage') {
      try {
        const existing = await restSelect(`/rest/v1/${TABLES.sharedMarks}?select=entry_key,mark_json&channel_code=eq.${encodeURIComponent(CONFIG.channelCode)}&month_key=eq.${encodeURIComponent(activeMonthKey)}&limit=2000`);
        const missing = (existing || [])
          .filter(row => row.entry_key && !String(row.entry_key).startsWith('legacy::') && !(row.entry_key in state) && !row.mark_json?.legacy_unmapped)
          .map(row => ({
            channel_code: CONFIG.channelCode,
            channel_slug: getChannelSlug(),
            month_key: activeMonthKey,
            entry_key: row.entry_key,
            mark_json: {},
            source: 'browser-cleared',
            updated_at: new Date().toISOString()
          }));
        if (missing.length) await restWrite(`/rest/v1/${TABLES.sharedMarks}?on_conflict=channel_code,month_key,entry_key`, missing);
      } catch (err) {
        console.warn('Shared marks clear mirror skipped.', err);
      }
    }
  }
  async function upsertLegacyRows(rows) {
    if (!activeMonthKey || !Array.isArray(rows) || !rows.length) return;
    const payload = rows.map(row => ({
      channel_code: CONFIG.channelCode,
      channel_slug: getChannelSlug(),
      month_key: activeMonthKey,
      entry_key: `legacy::${row.entry_key}`,
      mark_json: { legacy_unmapped: true },
      legacy_project_scope: row.project_scope || 'wnmu_schedule_shareboard',
      legacy_entry_key: row.entry_key,
      legacy_is_marked: !!row.is_marked,
      legacy_note: row.note || null,
      source: 'legacy-wnmu_sched_shared_marks',
      updated_at: row.updated_at || new Date().toISOString()
    }));
    await restWrite(`/rest/v1/${TABLES.sharedMarks}?on_conflict=channel_code,month_key,entry_key`, payload);
  }
  async function preloadSharedMarks() {
    if (archiveId || !activeMonthKey || !CONFIG.storageKey) return;
    try {
      const localState = readLocalSharedState();
      let sharedState = {};
      try { sharedState = await fetchV2SharedMarks(); } catch (err) { console.warn('v2 shared marks preload skipped.', err); }
      let archiveState = {};
      if (!Object.keys(sharedState).length) {
        try { archiveState = await fetchArchiveSnapshotState(); } catch (err) { console.warn('Archive snapshot preload skipped.', err); }
      }
      const legacyRows = await fetchLegacySharedRows();
      try { await upsertLegacyRows(legacyRows); } catch (err) { console.warn('Legacy shared marks mirror skipped.', err); }
      const merged = { ...archiveState, ...sharedState, ...localState };
      if (Object.keys(merged).length) {
        writeLocalSharedState(merged);
        try { await upsertSharedState(merged, Object.keys(sharedState).length ? 'merged-v2-local' : (Object.keys(archiveState).length ? 'archive-snapshot-local' : 'local-preload')); } catch (err) { console.warn('Initial shared marks mirror skipped.', err); }
      }
    } catch (err) {
      console.warn('Shared marks preload failed without blocking schedule load.', err);
    }
  }
  function queueSharedMarksSync(raw) {
    if (archiveId || !activeMonthKey || !CONFIG.storageKey || raw === sharedMarksLastRaw) return;
    sharedMarksLastRaw = raw;
    window.clearTimeout(sharedMarksSyncTimer);
    sharedMarksSyncTimer = window.setTimeout(async () => {
      try {
        const parsed = JSON.parse(raw || '{}');
        await upsertSharedState(parsed, 'browser-localstorage');
      } catch (err) {
        console.warn('Shared marks sync failed.', err);
      }
    }, 700);
  }
  function installSharedMarksSync() {
    if (sharedMarksSyncInstalled || archiveId || !CONFIG.storageKey) return;
    sharedMarksSyncInstalled = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      const result = originalSetItem.apply(this, arguments);
      try {
        if (key === CONFIG.storageKey) queueSharedMarksSync(String(value || '{}'));
      } catch (err) {
        console.warn('Shared marks localStorage hook failed.', err);
      }
      return result;
    };
    sharedMarksLastRaw = localStorage.getItem(CONFIG.storageKey) || '{}';
    window.setInterval(() => {
      try {
        const raw = localStorage.getItem(CONFIG.storageKey) || '{}';
        if (raw !== sharedMarksLastRaw) queueSharedMarksSync(raw);
      } catch {}
    }, 10000);
  }
  function installLegacyNotesPanel() {
    window.setTimeout(() => {
      const rows = (window.WNMU_LEGACY_SHARED_MARKS || []).filter(row => row && (row.note || row.legacy_note || row.is_marked || row.legacy_is_marked));
      if (!rows.length) return;
      const host = document.getElementById('monthRollup') || document.getElementById('weekGrids');
      if (!host || document.getElementById('legacySharedMarksPanel')) return;
      const panel = document.createElement('section');
      panel.id = 'legacySharedMarksPanel';
      panel.className = 'rollup-box';
      panel.style.marginTop = '1rem';
      const displayRows = rows.slice(0, 80);
      panel.innerHTML = `
        <h4>Legacy shared May notes preserved in Supabase</h4>
        <div class="rollup-empty">These are older shared-note rows from the previous WNMU shareboard table. They are preserved and mirrored, but some may not attach to the rebuilt grid because the old page used different entry keys.</div>
        <ul class="month-rollup-list">
          ${displayRows.map(row => {
            const note = esc(row.note_label || parseLegacyNoteText(row.note || row.legacy_note || ''));
            const flag = row.is_marked || row.legacy_is_marked ? 'marked' : 'note only';
            const when = esc(row.updated_at || '');
            return `<li><div class="rollup-line"><strong>${esc(flag)}</strong>${note ? ` • ${note}` : ''}<span class="meta"> • ${when}</span></div></li>`;
          }).join('')}
        </ul>`;
      host.appendChild(panel);
    }, 2500);
  }
  function loadRenderer() {
    const script = document.createElement('script');
    script.src = `${CONFIG.sharedRendererFile}?loader=${BUILD_VERSION}`;
    script.defer = true;
    document.body.appendChild(script);
  }
  async function boot() {
    try {
      try {
        await loadSupabaseMonth();
      } catch (supabaseErr) {
        console.warn('Supabase imported-month load failed; falling back to bundled registry JSON.', supabaseErr);
        await loadRegistryFallback();
      }
      await preloadSharedMarks();
      installSharedMarksSync();
      installLegacyNotesPanel();
      loadRenderer();
    } catch (err) {
      console.error(err);
      setText('pageHeading', `${CONFIG.channelLabel} current schedule`);
      const sub = document.getElementById('pageSub');
      if (sub) sub.textContent = `Imported-month load failed: ${err.message}`;
      ['versionFlag', 'coverageFlag', 'daysFlag'].forEach(id => setText(id, 'load error'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
