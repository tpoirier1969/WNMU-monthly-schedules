(function () {
  'use strict';
  const VERSION = 'v1.5.30-commit-button-persistence';
  const TABLE = 'wnmu_monthly_schedule_overrides';
  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  const state = { readyKey: '', hydrated: false, tableAvailable: false, loadError: '', menuObserverInstalled: false, committedRows: [] };

  window.WNMU_MANUAL_PROGRAM_OVERRIDES_VERSION = VERSION;
  window.WNMU_MANUAL_PROGRAM_OVERRIDES_STATUS = state;
  window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS = window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS || [];

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function supabaseCfg() { return window.WNMU_SHAREBOARD_SUPABASE || {}; }
  function channelCode() { return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1'); }
  function monthKey() { return (window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey) || new URLSearchParams(location.search).get('month') || ''; }
  function storageKey() { return cfg().storageKey || ''; }
  function canonicalStoreKey() { const base = storageKey(); return base ? `${base}::cellOverrides.v1.5.0` : ''; }
  function readyKey() { return `${channelCode()}::${monthKey()}::${storageKey()}`; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function nearestDuration(value) { const n = Number(value) || 30; return DURATIONS.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, DURATIONS[0]); }
  function timeToSlot(time) { const m = String(time || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return -1; return Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0); }
  function slotToTime(slot) { const h = Math.floor(slot / 2) % 24; return `${pad(h)}:${slot % 2 ? '30' : '00'}`; }
  function canonicalKeyFor(date, time) { return `${channelCode()}__${monthKey() || String(date).slice(0,7)}__${date}__${time}`; }
  function parseDateTimeFromKey(key) { const m = String(key || '').match(/(?:^|__)(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})(?:$|__)/); return m ? { date: m[1], time: m[2] } : null; }
  function allTags() { const base = Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : []; if (!base.includes('satelliteFeed')) base.push('satelliteFeed'); return base; }
  function normalizeTags(tags) { const out = {}; allTags().forEach(tag => { out[tag] = !!(tags && tags[tag]); }); return out; }
  function readJson(key, fallback) { try { const raw = key && localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function writeJson(key, value) { try { if (key) localStorage.setItem(key, JSON.stringify(value || {})); } catch (err) { console.warn('WNMU override local write skipped.', err); } }
  function menuStatus(menu, text, isError) { let status = menu?.querySelector('#wnmuCommitStatus') || menu?.querySelector('#wnmuCellStatus'); if (!status && menu) { status = document.createElement('div'); status.id = 'wnmuCommitStatus'; status.className = 'blank-save-status'; menu.querySelector('form')?.appendChild(status); } if (status) { status.textContent = text || ''; status.style.color = isError ? '#8a1f1f' : ''; } }
  function setCommitBusy(menu, busy) { const btn = menu?.querySelector('#wnmuCommitProgramBtn'); const remove = menu?.querySelector('#wnmuRemoveCommittedProgramBtn'); if (btn) { btn.disabled = !!busy; btn.textContent = busy ? 'Committing…' : 'Commit to Schedule'; } if (remove) remove.disabled = !!busy; }


  function ensureCommitMenuStyles() {
    if (document.getElementById('wnmuCommitMenuFixStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuCommitMenuFixStyles';
    style.textContent = `
      #wnmuCellMenu.wnmu-cell-menu,
      #wnmuCellMenu {
        max-height: calc(100vh - 24px) !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
      }
      #wnmuCellMenu #wnmuCellText,
      #wnmuCellMenu textarea[name="wnmuCellText"] {
        border: 2px solid #111 !important;
        border-radius: 8px !important;
        padding: 8px 9px !important;
        background: #fff !important;
        box-shadow: inset 0 1px 2px rgba(0,0,0,.08) !important;
      }
      #wnmuCellMenu .wnmu-commit-actions {
        display: flex !important;
        gap: 8px !important;
        flex-wrap: wrap !important;
        margin: 8px 0 10px !important;
        padding: 8px 0 !important;
        border-top: 1px solid #d7dee8 !important;
        border-bottom: 1px solid #d7dee8 !important;
        background: #fff !important;
      }
      #wnmuCellMenu #wnmuCommitProgramBtn {
        background: #17345f !important;
        border-color: #17345f !important;
        color: #fff !important;
        font-weight: 850 !important;
      }
      #wnmuCellMenu .check-row {
        padding-top: 5px !important;
        padding-bottom: 5px !important;
        min-height: 32px !important;
      }
      #wnmuCellMenu .wnmu-cell-tag-grid,
      #wnmuCellMenu .tag-grid,
      #wnmuCellMenu .context-menu-form,
      #wnmuCellMenu form {
        gap: 5px !important;
      }
      #wnmuCellMenu .wnmu-cell-section,
      #wnmuCellMenu .rect-tools {
        margin-top: 6px !important;
        margin-bottom: 6px !important;
      }
    `;
    document.head.appendChild(style);
  }


  async function rest(pathAndQuery, options) {
    const c = supabaseCfg();
    if (!c.url || !c.anonKey) throw new Error('config.js is missing Supabase credentials.');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${c.url}${pathAndQuery}`, {
        ...options,
        signal: controller.signal,
        headers: { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}`, 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) }
      });
      if (!res.ok) { const txt = await res.text().catch(() => ''); throw new Error(`Manual program override table request failed (${res.status}) ${txt}`.trim()); }
      return res.json().catch(() => null);
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('Manual program override table request timed out. Check Supabase/SQL and try again.');
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function loadTableOverrides() {
    const channel = channelCode(); const month = monthKey(); if (!channel || !month) return [];
    const select = 'id,channel_code,month_key,entry_key,date,slot_time,duration_min,source_entry_id,override_type,title_text,tags_json,is_active,updated_by,updated_at';
    const rows = await rest(`/rest/v1/${TABLE}?select=${select}&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}&is_active=eq.true&updated_by=eq.schedule-page-commit&order=date.asc&order=slot_time.asc&limit=2000`, { cache: 'no-store' });
    const clean = Array.isArray(rows) ? rows.filter(row => row && row.title_text && row.updated_by === 'schedule-page-commit') : [];
    state.tableAvailable = true; state.loadError = ''; state.committedRows = clean; window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS = clean;
    clearStagingForRows(clean, true);
    window.dispatchEvent(new CustomEvent('wnmu:manual-program-overrides-updated', { detail: { changed: clean.length, source: 'table-load' } }));
    return clean;
  }
  async function upsertRow(row) { const result = await rest(`/rest/v1/${TABLE}?on_conflict=channel_code,month_key,entry_key`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify([row]) }); state.tableAvailable = true; return Array.isArray(result) ? result[0] : row; }
  async function deactivateRow(row) { await rest(`/rest/v1/${TABLE}?on_conflict=channel_code,month_key,entry_key`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify([{ ...row, is_active: false, title_text: row.title_text || null, updated_by: 'schedule-page-remove' }]) }); }

  function menuTarget(menu) { const date = menu?.dataset.wnmuDate || ''; const time = menu?.dataset.wnmuTime || ''; if (!date || !time) return null; return { date, time, key: menu.dataset.wnmuCellKey || canonicalKeyFor(date, time) }; }
  function safeName(name) { return window.CSS && CSS.escape ? CSS.escape(name) : String(name).replace(/["\\]/g, '\\$&'); }
  function readTagsFromMenu(menu) { const tags = {}; allTags().forEach(tag => { const input = menu?.querySelector(`input[name="${safeName(tag)}"]`); tags[tag] = !!input?.checked; }); return normalizeTags(tags); }
  function rowFromMenu(menu) { const target = menuTarget(menu); if (!target) throw new Error('No schedule cell selected. Right-click the cell again.'); const text = String(menu.querySelector('#wnmuCellText')?.value || '').trim(); if (!text) throw new Error('Type a program title/replacement text before committing.'); const duration = nearestDuration(menu.querySelector('input[name="wnmuCellDuration"]:checked')?.value || 30); return { channel_code: channelCode(), month_key: monthKey() || target.date.slice(0, 7), entry_key: canonicalKeyFor(target.date, target.time), date: target.date, slot_time: target.time, duration_min: duration, source_entry_id: menu.dataset.wnmuEntryId || '', override_type: 'manual_program', title_text: text, tags_json: readTagsFromMenu(menu), is_active: true, updated_by: 'schedule-page-commit' }; }

  function sameSlot(row, date, time) { return String(row.date) === String(date) && String(row.slot_time || row.time) === String(time); }
  function committedFor(date, time) { return (window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS || []).find(row => row && row.is_active !== false && sameSlot(row, date, time)); }
  function mergeCommittedRow(row) { const rows = (window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS || []).filter(existing => existing.entry_key !== row.entry_key); rows.push(row); rows.sort((a, b) => `${a.date}${a.slot_time}`.localeCompare(`${b.date}${b.slot_time}`)); window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS = rows; state.committedRows = rows; }
  function removeCommittedRow(row) { const rows = (window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS || []).filter(existing => existing.entry_key !== row.entry_key); window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS = rows; state.committedRows = rows; }

  function coveredTimes(date, time, duration) { const start = timeToSlot(time); const slots = Math.max(1, Math.round(nearestDuration(duration) / 30)); const out = []; for (let i = 0; i < slots; i += 1) out.push({ date, time: slotToTime(start + i) }); return out; }
  let stagedMain = null; let stagedCanon = null;
  function loadStagingStores() { stagedMain = readJson(storageKey(), {}); stagedCanon = readJson(canonicalStoreKey(), {}); }
  function flushStagingChanges() { if (stagedMain) writeJson(storageKey(), stagedMain); if (stagedCanon) writeJson(canonicalStoreKey(), stagedCanon); stagedMain = stagedCanon = null; }
  function recordTouchesSlots(key, raw, slotSet) { const parsed = parseDateTimeFromKey(key) || {}; const date = raw?.date || parsed.date || ''; const time = raw?.time || parsed.time || ''; if (!date || !time) return false; return slotSet.has(`${date}__${time}`); }
  function shouldDeleteStagingRecord(raw) { if (!raw || typeof raw !== 'object') return false; return !!(raw.cellOverrideV15 || raw.rectNote || raw.text || raw.note || raw.manualProgramOverrideV1524 || raw.manualProgramOverrideV1526); }
  function clearStagingRange(date, time, duration, flush = true) { if (!stagedMain || !stagedCanon) loadStagingStores(); const slots = coveredTimes(date, time, duration); const slotSet = new Set(slots.map(s => `${s.date}__${s.time}`)); let changed = false; for (const store of [stagedCanon, stagedMain]) { Object.keys(store || {}).forEach(key => { const raw = store[key]; if (recordTouchesSlots(key, raw, slotSet) && shouldDeleteStagingRecord(raw)) { delete store[key]; changed = true; } }); } slots.forEach(slot => { const ck = canonicalKeyFor(slot.date, slot.time); if (stagedCanon && stagedCanon[ck]) { delete stagedCanon[ck]; changed = true; } if (stagedMain && stagedMain[ck]) { delete stagedMain[ck]; changed = true; } }); clearOverlayDom(slots); if (changed && flush) flushStagingChanges(); return changed; }
  function clearStagingForRows(rows, flush) { let changed = false; (rows || []).forEach(row => { const date = row.date; const time = row.slot_time || row.time; const duration = row.duration_min || row.durationMin || 30; if (!date || !time) return; if (clearStagingRange(date, time, duration, false)) changed = true; }); if (changed && flush) flushStagingChanges(); return changed; }
  function clearOverlayDom(slots) { const slotSet = new Set((slots || []).map(s => `${s.date}__${s.time}`)); document.querySelectorAll('.wnmu-cell-override-box').forEach(box => { const k = `${box.dataset.wnmuDate || ''}__${box.dataset.wnmuTime || ''}`; if (slotSet.has(k)) box.remove(); }); document.querySelectorAll('.wnmu-cell-override-layer').forEach(layer => { if (!layer.querySelector('.wnmu-cell-override-box')) layer.remove(); }); }

  async function commitFromMenu(menu) {
    if (menu?.dataset.wnmuCommitBusy === '1') return;
    try {
      menu.dataset.wnmuCommitBusy = '1';
      ensureCommitMenuStyles();
      setCommitBusy(menu, true);
      menuStatus(menu, 'Committing program to schedule table…');
      const row = rowFromMenu(menu);
      // Let the browser paint the busy state before Supabase/network work starts.
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const saved = await upsertRow(row);
      const committed = { ...row, ...(saved && typeof saved === 'object' ? saved : {}) };
      mergeCommittedRow(committed);
      clearStagingRange(row.date, row.slot_time, row.duration_min, true);
      window.dispatchEvent(new CustomEvent('wnmu:manual-program-overrides-updated', { detail: { changed: 1, source: 'commit', row: committed } }));
      window.setTimeout(() => { if (typeof window.WNMU_MANUAL_PROGRAMS_REFRESH === 'function') window.WNMU_MANUAL_PROGRAMS_REFRESH(); }, 25);
      menuStatus(menu, 'Committed to schedule table. Staged overlay data was cleared.');
    } catch (err) {
      menuStatus(menu, err.message || String(err), true);
      console.error('Manual program commit failed', err);
    } finally {
      delete menu.dataset.wnmuCommitBusy;
      setCommitBusy(menu, false);
    }
  }
  async function removeFromMenu(menu) { try { const target = menuTarget(menu); if (!target) throw new Error('No schedule cell selected.'); const row = committedFor(target.date, target.time); if (!row) throw new Error('No committed program found for this slot.'); menuStatus(menu, 'Removing committed program…'); await deactivateRow({ ...row, is_active: false }); removeCommittedRow(row); window.dispatchEvent(new CustomEvent('wnmu:manual-program-overrides-updated', { detail: { changed: 1, source: 'remove', row } })); if (typeof window.WNMU_MANUAL_PROGRAMS_REFRESH === 'function') window.WNMU_MANUAL_PROGRAMS_REFRESH(); menuStatus(menu, 'Committed program removed. Original imported schedule is visible again.'); } catch (err) { menuStatus(menu, err.message || String(err), true); console.error('Manual program remove failed', err); } }

  function prefillCommitted(menu) { const target = menuTarget(menu); if (!target) return; const row = committedFor(target.date, target.time); const removeBtn = menu.querySelector('#wnmuRemoveCommittedProgramBtn'); if (removeBtn) removeBtn.hidden = !row; if (!row) return; const text = menu.querySelector('#wnmuCellText'); if (text && !String(text.value || '').trim()) text.value = row.title_text || ''; const dur = nearestDuration(row.duration_min || 30); const radio = menu.querySelector(`input[name="wnmuCellDuration"][value="${dur}"]`); if (radio) radio.checked = true; const tags = row.tags_json || {}; Object.keys(tags).forEach(tag => { const input = menu.querySelector(`input[name="${safeName(tag)}"]`); if (input) input.checked = !!tags[tag]; }); menuStatus(menu, 'Committed program loaded. Edit fields, then Commit to Schedule to update it.'); }
  function ensureCommitButton(menu) {
    if (!menu) return;
    ensureCommitMenuStyles();
    if (menu.querySelector('#wnmuCommitProgramBtn')) { prefillCommitted(menu); return; }
    const form = menu.querySelector('#wnmuCellForm') || menu.querySelector('form') || menu;
    const actions = document.createElement('div');
    actions.className = 'rect-actions wnmu-commit-actions';
    actions.innerHTML = '<button type="button" class="btn ghost" id="wnmuCommitProgramBtn">Commit to Schedule</button><button type="button" class="btn ghost" id="wnmuRemoveCommittedProgramBtn" hidden>Remove committed program</button>';
    const text = menu.querySelector('#wnmuCellText');
    const textHost = text ? (text.closest('.wnmu-cell-field, .wnmu-text-row, label, div') || text.parentElement) : null;
    if (textHost && textHost.parentElement) textHost.insertAdjacentElement('afterend', actions);
    else form.insertBefore(actions, form.firstChild || null);
    actions.querySelector('#wnmuCommitProgramBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); commitFromMenu(menu); });
    actions.querySelector('#wnmuRemoveCommittedProgramBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); removeFromMenu(menu); });
    prefillCommitted(menu);
  }
  function scheduleMenuEnsure(delay = 40) {
    window.setTimeout(() => {
      const menu = document.getElementById('wnmuCellMenu');
      if (menu && !menu.classList.contains('hidden')) ensureCommitButton(menu);
    }, delay);
  }

  function installMenuObserver() {
    if (state.menuObserverInstalled) return;
    state.menuObserverInstalled = true;

    const runBurst = () => {
      // The menu is reused and rebuilt in-place on many right-clicks. One single
      // observer callback is not reliable enough because it may fire before the
      // base menu script finishes filling in the current cell fields.
      [20, 80, 180, 360, 700].forEach(scheduleMenuEnsure);
    };

    const obs = new MutationObserver(muts => {
      let shouldRun = false;
      for (const mut of muts) {
        if (mut.type === 'attributes' && mut.target?.id === 'wnmuCellMenu') shouldRun = true;
        if (mut.type === 'childList') {
          if (mut.target?.id === 'wnmuCellMenu') shouldRun = true;
          for (const node of mut.addedNodes || []) {
            if (node.nodeType === 1 && (node.matches?.('#wnmuCellMenu') || node.querySelector?.('#wnmuCellMenu'))) shouldRun = true;
          }
        }
        if (shouldRun) break;
      }
      if (shouldRun) runBurst();
    });

    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden']
    });

    // Catch normal menu openings and in-menu field rebuilds. This does not
    // trigger any table rebuild; it only ensures the commit/remove buttons exist.
    document.addEventListener('contextmenu', runBurst, true);
    document.addEventListener('pointerdown', event => {
      if (event.target?.closest?.('.program-cell, .screen-week-grid td, #wnmuCellMenu')) runBurst();
    }, true);
    document.addEventListener('click', event => {
      if (event.target?.closest?.('.program-cell, .screen-week-grid td, #wnmuCellMenu')) runBurst();
    }, true);
    window.addEventListener('wnmu:cell-menu-opened', runBurst);
    runBurst();
  }
  function tryHydrate() { const rk = readyKey(); if (!rk.includes('::') || !monthKey() || !storageKey()) return; if (state.readyKey !== rk) { state.readyKey = rk; state.hydrated = false; } if (state.hydrated) return; state.hydrated = true; loadTableOverrides().catch(err => { state.tableAvailable = false; state.loadError = err.message || String(err); console.warn('Manual program override table load skipped.', err); }); }
  function start() { ensureCommitMenuStyles(); installMenuObserver(); tryHydrate(); [250, 750, 1500, 3000, 6000, 10000].forEach(ms => window.setTimeout(tryHydrate, ms)); window.addEventListener('wnmu:manual-program-overrides-refresh', () => { state.hydrated = false; tryHydrate(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
