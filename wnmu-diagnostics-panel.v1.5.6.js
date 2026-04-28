(function () {
  'use strict';
  const VERSION = 'v1.5.6-diagnostics-panel';
  const TABLES = {
    importedMonths: 'wnmu_monthly_schedules_imported_months',
    sharedMarks: 'wnmu_monthly_schedules_shared_marks'
  };
  const JSON_CACHE_PREFIX = 'wnmu_json_cache_v1_3_1';

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function currentMonthKey() { return window.WNMU_CURRENT_MONTH_META?.monthKey || new URLSearchParams(location.search).get('month') || ''; }
  function storageKey() { return cfg().storageKey || window.WNMU_CURRENT_MONTH_META?.monthMeta?.storageKey || ''; }
  function readJson(key, fallback) {
    try {
      const raw = key ? localStorage.getItem(key) : '';
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch { return fallback; }
  }
  function countEntries(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    return Object.values(obj).filter(value => value && typeof value === 'object' && JSON.stringify(value) !== '{}').length;
  }
  function countRectNotes(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    return Object.values(obj).filter(value => value && typeof value === 'object' && (value.rectNote || value.overrideText || value.text || value.note)).length;
  }
  function getSupabaseCfg() { return window.WNMU_SHAREBOARD_SUPABASE || {}; }
  async function restSelect(pathAndQuery) {
    const supa = getSupabaseCfg();
    if (!supa.url || !supa.anonKey) throw new Error('config.js is missing Supabase credentials.');
    const res = await fetch(`${supa.url}${pathAndQuery}`, {
      headers: { apikey: supa.anonKey, Authorization: `Bearer ${supa.anonKey}` },
      cache: 'no-store'
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase read failed (${res.status}) ${txt}`.trim());
    }
    return res.json();
  }
  function scriptRows() {
    return Array.from(document.scripts)
      .map(script => script.getAttribute('src') || '')
      .filter(Boolean)
      .filter(src => /wnmu|app\.13|archive|current-loader|postload|satellite|checkbox|builder|version|config/i.test(src))
      .map(src => {
        const file = src.split('/').pop().split('?')[0];
        const query = src.includes('?') ? src.split('?').slice(1).join('?') : '';
        const version = (file.match(/v\d+(?:\.\d+)+(?:\.\d+)?/) || query.match(/v?\d+(?:\.\d+)+/i) || [''])[0];
        return { file, version: version || '—' };
      });
  }
  async function fetchScheduleSummary() {
    const scheduleFile = cfg().scheduleFile;
    const verificationFile = cfg().verificationFile;
    const out = { scheduleStatus: scheduleFile ? 'attempting read…' : 'no schedule file set', dayCount: '—', programCount: '—', coverage: '—' };
    if (scheduleFile) {
      try {
        const res = await fetch(`${scheduleFile}${scheduleFile.includes('?') ? '&' : '?'}diag=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`schedule fetch ${res.status}`);
        const schedule = await res.json();
        const days = Array.isArray(schedule.days) ? schedule.days : [];
        out.dayCount = days.length;
        out.programCount = days.reduce((sum, day) => sum + (Array.isArray(day.entries) ? day.entries.length : 0), 0);
        out.scheduleStatus = 'readable';
      } catch (err) { out.scheduleStatus = `read failed: ${err.message || err}`; }
    }
    if (verificationFile) {
      try {
        const res = await fetch(`${verificationFile}${verificationFile.includes('?') ? '&' : '?'}diag=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`verification fetch ${res.status}`);
        const verification = await res.json();
        const checks = verification.checks || {};
        if (typeof checks.everyDayHas48CoveredSlots === 'boolean') out.coverage = checks.everyDayHas48CoveredSlots ? '48/48 covered for every day' : 'coverage warnings present';
        else if (Array.isArray(verification.dailyCoverage)) {
          const bad = verification.dailyCoverage.filter(day => Number(day.coveredSlots || day.actualCoveredSlots || 0) < 48).length;
          out.coverage = bad ? `${bad} day(s) under 48 slots` : `${verification.dailyCoverage.length} day(s) checked`;
        } else out.coverage = 'verification readable';
      } catch (err) { out.coverage = `verification read failed: ${err.message || err}`; }
    }
    return out;
  }
  async function fetchSupabaseSummary() {
    const channel = cfg().channelCode || 'unknown';
    const month = currentMonthKey();
    const out = { importedRow: 'not checked', sharedRows: 'not checked', sharedRectRows: 'not checked' };
    if (!channel || !month) { out.importedRow = 'missing channel/month'; return out; }
    try {
      const rows = await restSelect(`/rest/v1/${TABLES.importedMonths}?select=id,channel_code,month_key,updated_at,storage_key&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}&limit=1`);
      out.importedRow = Array.isArray(rows) && rows.length ? `yes (${rows[0].updated_at || 'no timestamp'})` : 'no';
    } catch (err) { out.importedRow = `check failed: ${err.message || err}`; }
    try {
      const rows = await restSelect(`/rest/v1/${TABLES.sharedMarks}?select=entry_key,mark_json,updated_at&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}&limit=2000`);
      const list = Array.isArray(rows) ? rows : [];
      out.sharedRows = String(list.length);
      out.sharedRectRows = String(list.filter(row => row?.mark_json && JSON.stringify(row.mark_json).toLowerCase().includes('rectnote')).length);
    } catch (err) { out.sharedRows = `check failed: ${err.message || err}`; out.sharedRectRows = '—'; }
    return out;
  }
  function localNotesSummary() {
    const key = storageKey();
    const mainMarks = readJson(key, {});
    const overrideKey = key ? `${key}::cellOverrides.v1.5.0` : '';
    const overrides = readJson(overrideKey, {});
    const blankKeys = key ? [`${key}::blankSlotMarks.v1.4.30`, `${key}::blankSlotMarks.v1.4.29`, `${key}::blankSlotMarks.v1.4.28`] : [];
    const blankCount = blankKeys.reduce((sum, k) => sum + countEntries(readJson(k, {})), 0);
    let jsonCacheCount = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i) || '';
      if (k.includes(JSON_CACHE_PREFIX) && k.includes(currentMonthKey())) jsonCacheCount += 1;
    }
    return { storageKey: key || 'not set yet', mainMarkCount: countEntries(mainMarks), mainRectCount: countRectNotes(mainMarks), overrideKey: overrideKey || 'not set yet', overrideCount: countEntries(overrides), blankLegacyCount: blankCount, jsonCacheCount };
  }
  function renderScriptsTable(rows) {
    if (!rows.length) return '<div class="wnmu-diag-empty">No matching scripts found.</div>';
    return `<table><thead><tr><th>Script</th><th>Version</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.file)}</td><td>${esc(row.version)}</td></tr>`).join('')}</tbody></table>`;
  }
  function section(title, body) { return `<section class="wnmu-diag-section"><h4>${esc(title)}</h4>${body}</section>`; }
  async function gatherDiagnostics() {
    const channel = cfg().channelCode || 'unknown';
    const label = cfg().channelLabel || '';
    const month = currentMonthKey() || 'unknown';
    const meta = window.WNMU_CURRENT_MONTH_META || {};
    const local = localNotesSummary();
    const [schedule, supabase] = await Promise.all([fetchScheduleSummary(), fetchSupabaseSummary()]);
    return [
      section('Page', `<dl><dt>Channel</dt><dd>${esc(channel)} ${label ? `• ${esc(label)}` : ''}</dd><dt>Loaded month</dt><dd>${esc(month)}</dd><dt>Schedule source</dt><dd>${esc(meta.monthMeta?.source || document.getElementById('pageSub')?.textContent || 'unknown')}</dd><dt>Page</dt><dd>${esc(location.pathname.split('/').pop() || 'index')}</dd></dl>`),
      section('Schedule data', `<dl><dt>Supabase month row</dt><dd>${esc(supabase.importedRow)}</dd><dt>Schedule JSON</dt><dd>${esc(schedule.scheduleStatus)}</dd><dt>Days</dt><dd>${esc(schedule.dayCount)}</dd><dt>Programs</dt><dd>${esc(schedule.programCount)}</dd><dt>Coverage</dt><dd>${esc(schedule.coverage)}</dd></dl>`),
      section('Notes / marks', `<dl><dt>Local storage key</dt><dd>${esc(local.storageKey)}</dd><dt>Main local mark records</dt><dd>${esc(local.mainMarkCount)}</dd><dt>Main local rectangle notes</dt><dd>${esc(local.mainRectCount)}</dd><dt>v1.5 override records</dt><dd>${esc(local.overrideCount)}</dd><dt>Legacy blank-slot records</dt><dd>${esc(local.blankLegacyCount)}</dd><dt>Supabase shared mark rows</dt><dd>${esc(supabase.sharedRows)}</dd><dt>Supabase rows containing rectNote</dt><dd>${esc(supabase.sharedRectRows)}</dd></dl>`),
      section('Loaded scripts', renderScriptsTable(scriptRows()))
    ].join('');
  }
  function clearMonthCachesAndReload() {
    const month = currentMonthKey();
    let removed = 0;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i) || '';
      if (key.includes(JSON_CACHE_PREFIX) && (!month || key.includes(month))) { localStorage.removeItem(key); removed += 1; }
    }
    const url = new URL(location.href);
    url.searchParams.set('v', `diag-reload-${Date.now()}-${removed}`);
    location.href = url.toString();
  }
  function ensurePanel() {
    if (document.getElementById('wnmuDiagnosticsPanel')) return;
    const style = document.createElement('style');
    style.id = 'wnmuDiagnosticsPanelStyles';
    style.textContent = `.wnmu-diag-button{border:1px solid rgba(255,255,255,.42);border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-weight:800;font:13px system-ui,sans-serif;padding:7px 11px;cursor:pointer;margin-left:8px}.wnmu-diag-button:hover{background:rgba(255,255,255,.22)}.wnmu-diag-panel{position:fixed;right:18px;top:18px;width:min(560px,calc(100vw - 36px));max-height:calc(100vh - 36px);overflow:auto;z-index:2147483200;background:#fff;color:#122037;border:1px solid #b8c6db;border-radius:16px;box-shadow:0 18px 46px rgba(0,0,0,.35);font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}.wnmu-diag-panel[hidden]{display:none!important}.wnmu-diag-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #dbe3ef;background:#f5f8fc;border-radius:16px 16px 0 0}.wnmu-diag-head h3{margin:0;color:#17345f;font-size:18px}.wnmu-diag-head p{margin:3px 0 0;color:#556;max-width:380px}.wnmu-diag-close{border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#53627a}.wnmu-diag-actions{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #e5ebf3}.wnmu-diag-actions button{border:1px solid #b8c6db;border-radius:10px;background:#fff;color:#17345f;font-weight:800;padding:8px 10px;cursor:pointer}.wnmu-diag-actions button.primary{background:#17345f;color:#fff;border-color:#17345f}.wnmu-diag-body{padding:14px 16px 18px}.wnmu-diag-section{border:1px solid #dce4ef;border-radius:12px;padding:11px 12px;margin:0 0 12px;background:#fff}.wnmu-diag-section h4{margin:0 0 8px;color:#0d4f38;font-size:14px}.wnmu-diag-section dl{display:grid;grid-template-columns:160px 1fr;gap:6px 10px;margin:0}.wnmu-diag-section dt{font-weight:800;color:#35465f}.wnmu-diag-section dd{margin:0;word-break:break-word}.wnmu-diag-section table{width:100%;border-collapse:collapse}.wnmu-diag-section th,.wnmu-diag-section td{text-align:left;border-top:1px solid #edf1f6;padding:5px 4px;vertical-align:top}.wnmu-diag-section th{color:#35465f}.wnmu-diag-empty{color:#777;font-style:italic}.wnmu-diag-status{padding:10px 16px;color:#53627a;border-bottom:1px solid #e5ebf3}@media(max-width:640px){.wnmu-diag-section dl{grid-template-columns:1fr}.wnmu-diag-panel{left:12px;right:12px;top:12px;width:auto}}@media print{.wnmu-diag-button,.wnmu-diag-panel{display:none!important}}`;
    document.head.appendChild(style);
    const panel = document.createElement('aside');
    panel.id = 'wnmuDiagnosticsPanel';
    panel.className = 'wnmu-diag-panel';
    panel.hidden = true;
    panel.innerHTML = `<div class="wnmu-diag-head"><div><h3>Diagnostics</h3><p>Fast sanity checks for loaded month, Supabase, scripts, and notes.</p></div><button type="button" class="wnmu-diag-close" id="wnmuDiagClose" aria-label="Close diagnostics">×</button></div><div class="wnmu-diag-actions"><button type="button" class="primary" id="wnmuDiagRefresh">Refresh diagnostics</button><button type="button" id="wnmuDiagReloadMonth">Reload current month from Supabase</button></div><div class="wnmu-diag-status" id="wnmuDiagStatus">Open the panel to run checks.</div><div class="wnmu-diag-body" id="wnmuDiagBody"></div>`;
    document.body.appendChild(panel);
    const flagbar = document.querySelector('.flagbar') || document.querySelector('.topbar');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'wnmuDiagOpen'; btn.className = 'wnmu-diag-button'; btn.textContent = 'Diagnostics';
    if (flagbar) flagbar.appendChild(btn); else document.body.appendChild(btn);
    async function openAndRefresh() {
      panel.hidden = false;
      document.getElementById('wnmuDiagStatus').textContent = 'Running diagnostics…';
      document.getElementById('wnmuDiagBody').innerHTML = '';
      try { document.getElementById('wnmuDiagBody').innerHTML = await gatherDiagnostics(); document.getElementById('wnmuDiagStatus').textContent = `Diagnostics refreshed at ${new Date().toLocaleTimeString()}.`; }
      catch (err) { document.getElementById('wnmuDiagStatus').textContent = `Diagnostics failed: ${err.message || err}`; }
    }
    btn.addEventListener('click', openAndRefresh);
    document.getElementById('wnmuDiagRefresh').addEventListener('click', openAndRefresh);
    document.getElementById('wnmuDiagReloadMonth').addEventListener('click', clearMonthCachesAndReload);
    document.getElementById('wnmuDiagClose').addEventListener('click', () => { if (panel.contains(document.activeElement)) document.activeElement.blur(); panel.hidden = true; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { if (panel.contains(document.activeElement)) document.activeElement.blur(); panel.hidden = true; } });
    window.WNMU_DIAGNOSTICS_PANEL_VERSION = VERSION;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensurePanel, { once: true });
  else ensurePanel();
})();
