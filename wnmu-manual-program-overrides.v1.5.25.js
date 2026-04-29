(function () {
  'use strict';
  const VERSION = 'v1.5.25-manual-program-overrides-table';
  const TABLE = 'wnmu_monthly_schedule_overrides';
  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  const state = {
    readyKey: '',
    hydrated: false,
    tableAvailable: false,
    loadError: '',
    syncTimer: null,
    lastRawByKey: new Map(),
    patched: false
  };

  window.WNMU_MANUAL_PROGRAM_OVERRIDES_VERSION = VERSION;
  window.WNMU_MANUAL_PROGRAM_OVERRIDES_STATUS = state;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function supabaseCfg() { return window.WNMU_SHAREBOARD_SUPABASE || {}; }
  function channelCode() { return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1'); }
  function monthKey() { return (window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey) || new URLSearchParams(location.search).get('month') || ''; }
  function storageKey() { return cfg().storageKey || ''; }
  function canonicalStoreKey() { const base = storageKey(); return base ? `${base}::cellOverrides.v1.5.0` : ''; }
  function readyKey() { return `${channelCode()}::${monthKey()}::${storageKey()}`; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function nearestDuration(value) { const n = Number(value) || 30; return DURATIONS.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, DURATIONS[0]); }
  function canonicalKeyFor(date, time) { return `${channelCode()}__${monthKey() || String(date).slice(0,7)}__${date}__${time}`; }
  function parseDateTimeFromKey(key) {
    const m = String(key || '').match(/__(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})(?:$|__)/);
    return m ? { date: m[1], time: m[2] } : null;
  }
  function allTags() {
    const base = Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : [];
    if (!base.includes('satelliteFeed')) base.push('satelliteFeed');
    return base;
  }
  function normalizeTags(tags) {
    const out = {};
    allTags().forEach(tag => { out[tag] = !!(tags && tags[tag]); });
    return out;
  }
  function readJson(key, fallback) { try { const raw = key && localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function writeJson(key, value) { try { if (key) localStorage.setItem(key, JSON.stringify(value || {})); } catch (err) { console.warn('WNMU override local write skipped.', err); } }
  async function rest(pathAndQuery, options) {
    const c = supabaseCfg();
    if (!c.url || !c.anonKey) throw new Error('config.js is missing Supabase credentials.');
    const res = await fetch(`${c.url}${pathAndQuery}`, {
      ...options,
      headers: {
        apikey: c.anonKey,
        Authorization: `Bearer ${c.anonKey}`,
        'Content-Type': 'application/json',
        ...(options && options.headers ? options.headers : {})
      }
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Manual program override table request failed (${res.status}) ${txt}`.trim());
    }
    return res.json().catch(() => null);
  }

  function recordFromLocal(key, raw) {
    if (!raw || typeof raw !== 'object') return null;
    const parsed = parseDateTimeFromKey(key) || {};
    const date = raw.date || parsed.date || '';
    const time = raw.time || parsed.time || '';
    if (!date || !time) return null;
    const text = String(raw.text || raw.rectNote?.text || raw.note || '').trim();
    const cleared = !!raw.cleared || (!text && !!raw.cellOverrideV15);
    const entryKey = raw.key || canonicalKeyFor(date, time);
    return {
      channel_code: channelCode(),
      month_key: monthKey(),
      entry_key: entryKey,
      date,
      slot_time: time,
      duration_min: nearestDuration(raw.durationMin || raw.rectNote?.durationMin || 30),
      source_entry_id: raw.sourceEntryId || raw.entryId || raw.source_entry_id || '',
      override_type: 'manual_program',
      title_text: cleared ? null : text,
      tags_json: normalizeTags(raw.tags || {}),
      is_active: !cleared && !!text,
      updated_by: 'schedule-page'
    };
  }

  function localRowsForSync(includeCleared) {
    const rowsByKey = new Map();
    const main = readJson(storageKey(), {});
    const canon = readJson(canonicalStoreKey(), {});
    function add(key, raw, priority) {
      const row = recordFromLocal(key, raw);
      if (!row) return;
      if (!includeCleared && !row.is_active) return;
      const existing = rowsByKey.get(row.entry_key);
      if (!existing || priority > existing.priority) rowsByKey.set(row.entry_key, { ...row, priority });
    }
    Object.entries(main || {}).forEach(([key, raw]) => add(key, raw, 1));
    Object.entries(canon || {}).forEach(([key, raw]) => add(key, raw, 2));
    return Array.from(rowsByKey.values()).map(({ priority, ...row }) => row);
  }

  function tableRowToLocalRecord(row) {
    const key = row.entry_key || canonicalKeyFor(row.date, row.slot_time);
    const text = String(row.title_text || '').trim();
    return {
      channelCode: row.channel_code,
      monthKey: row.month_key,
      date: row.date,
      time: row.slot_time,
      sourceType: 'manual_program',
      sourceEntryId: row.source_entry_id || '',
      text,
      durationMin: nearestDuration(row.duration_min || 30),
      tags: normalizeTags(row.tags_json || {}),
      cleared: !row.is_active || !text,
      updatedAt: row.updated_at || new Date().toISOString(),
      manualProgramOverrideV1524: true,
      key
    };
  }

  function mergeTableRowsIntoLocal(rows) {
    const canonicalKey = canonicalStoreKey();
    const mainKey = storageKey();
    if (!canonicalKey || !mainKey) return 0;
    const canon = readJson(canonicalKey, {});
    const main = readJson(mainKey, {});
    let changed = 0;
    (rows || []).forEach(row => {
      if (!row || !row.entry_key || row.is_active === false || !row.title_text) return;
      const rec = tableRowToLocalRecord(row);
      const key = rec.key || row.entry_key;
      const existing = canon[key] || main[key];
      const existingText = String(existing?.text || existing?.rectNote?.text || '').trim();
      const existingUpdated = Date.parse(existing?.updatedAt || existing?.updated_at || '0') || 0;
      const rowUpdated = Date.parse(row.updated_at || '0') || 0;
      // Table is shared truth, but don't stomp a clearly newer unsynced local edit.
      if (existingText && existingUpdated > rowUpdated + 1500) return;
      canon[key] = rec;
      main[key] = {
        ...(main[key] && typeof main[key] === 'object' ? main[key] : {}),
        cellOverrideV15: true,
        ...rec,
        rectNote: { x: 4, y: 4, w: 92, h: 92, text: rec.text, durationMin: rec.durationMin, anchor: 'left', cellOverrideV15: true },
        tags: rec.tags
      };
      changed += 1;
    });
    if (changed) {
      writeJson(canonicalKey, canon);
      writeJson(mainKey, main);
      window.dispatchEvent(new CustomEvent('wnmu:manual-program-overrides-updated', { detail: { changed, source: 'table-hydrate' } }));
    }
    return changed;
  }

  async function loadTableOverrides() {
    const channel = channelCode();
    const month = monthKey();
    if (!channel || !month || !storageKey()) return false;
    const select = 'id,channel_code,month_key,entry_key,date,slot_time,duration_min,source_entry_id,override_type,title_text,tags_json,is_active,updated_at';
    const rows = await rest(`/rest/v1/${TABLE}?select=${select}&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}&is_active=eq.true&order=date.asc&order=slot_time.asc&limit=2000`, { cache: 'no-store' });
    state.tableAvailable = true;
    state.loadError = '';
    mergeTableRowsIntoLocal(Array.isArray(rows) ? rows : []);
    return true;
  }

  async function upsertRows(rows) {
    const activeRows = (rows || []).filter(row => row && row.entry_key && row.month_key && row.channel_code);
    if (!activeRows.length) return 0;
    await rest(`/rest/v1/${TABLE}?on_conflict=channel_code,month_key,entry_key`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(activeRows)
    });
    state.tableAvailable = true;
    return activeRows.length;
  }

  async function syncLocalToTable(includeCleared) {
    if (!monthKey() || !storageKey()) return;
    const rows = localRowsForSync(!!includeCleared);
    if (!rows.length) return;
    try {
      const count = await upsertRows(rows);
      window.WNMU_LAST_MANUAL_OVERRIDE_SYNC = { count, at: new Date().toISOString(), includeCleared: !!includeCleared };
    } catch (err) {
      state.tableAvailable = false;
      state.loadError = err.message || String(err);
      console.warn('Manual program override table sync skipped.', err);
    }
  }

  function queueSync(includeCleared, delay) {
    window.clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(() => syncLocalToTable(includeCleared), delay || 500);
  }

  function patchStorage() {
    if (state.patched) return;
    state.patched = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function wnmuManualOverrideSetItem(key, value) {
      const result = original.apply(this, arguments);
      try {
        const sk = storageKey();
        const ck = canonicalStoreKey();
        if (key && (key === sk || key === ck)) {
          state.lastRawByKey.set(key, String(value || '{}'));
          queueSync(true, 350);
        }
      } catch (err) {
        console.warn('Manual override storage hook skipped.', err);
      }
      return result;
    };
  }

  function tryHydrate() {
    const rk = readyKey();
    if (!rk.includes('::') || !monthKey() || !storageKey()) return;
    if (state.readyKey !== rk) {
      state.readyKey = rk;
      state.hydrated = false;
    }
    if (state.hydrated) return;
    state.hydrated = true;
    loadTableOverrides()
      .then(() => syncLocalToTable(false))
      .catch(err => {
        state.tableAvailable = false;
        state.loadError = err.message || String(err);
        console.warn('Manual program override table load skipped.', err);
      });
  }

  function start() {
    patchStorage();
    tryHydrate();
    [250, 750, 1500, 3000, 6000, 10000].forEach(ms => window.setTimeout(tryHydrate, ms));
    window.addEventListener('wnmu:manual-program-overrides-request-sync', () => queueSync(true, 50));
    window.addEventListener('beforeunload', () => { try { syncLocalToTable(true); } catch {} });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
