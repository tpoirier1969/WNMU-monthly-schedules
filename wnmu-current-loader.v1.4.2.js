(function () {
  const CONFIG = window.WNMU_MONTHLY_PAGE_CONFIG;
  if (!CONFIG) return;

  const BUILD_VERSION = 'v1.4.2';
  const TABLES = {
    importedMonths: 'wnmu_monthly_schedules_imported_months',
    currentMonths: 'wnmu_monthly_schedules_current_months'
  };
  const JSON_CACHE_PREFIX = 'wnmu_json_cache_v1_3_1';
  const LIVE_PAGES = {
    '13.1': 'index131.v1.4.1.html',
    '13.3': 'index133.v1.4.1.html'
  };

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
