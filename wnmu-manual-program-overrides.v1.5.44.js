(function () {
  'use strict';
  const VERSION = 'v1.5.44-true-imported-overwrite-preserved-scroll-refresh';
  const TABLE = 'wnmu_monthly_schedule_overrides'; // legacy only; v1.5.44 does not write or render override-table records.
  const IMPORTED_MONTHS_TABLE = 'wnmu_monthly_schedules_imported_months';
  const SHARED_MARKS_TABLE = 'wnmu_monthly_schedules_shared_marks';
  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  const state = { readyKey: '', hydrated: false, tableAvailable: false, loadError: '', menuObserverInstalled: false, committedRows: [], storageGuardInstalled: false, scrubbing: false, lastSharedCleanup: null, lastLocalCleanup: null };

  window.WNMU_MANUAL_PROGRAM_OVERRIDES_VERSION = VERSION;
  window.WNMU_MANUAL_PROGRAM_OVERRIDES_STATUS = state;
  window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS = window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS || [];

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function supabaseCfg() { return window.WNMU_SHAREBOARD_SUPABASE || {}; }
  function channelCode() { return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1'); }
  function monthKey() { return (window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey) || new URLSearchParams(location.search).get('month') || ''; }
  function storageKey() { return cfg().storageKey || ''; }
  function channelSlug() { if (channelCode() === '13.1') return 'wnmu1hd'; if (channelCode() === '13.3') return 'wnmu3pl'; return String(channelCode() || 'wnmu').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function canonicalStoreKey() { const base = storageKey(); return base ? `${base}::cellOverrides.v1.5.0` : ''; }
  function manualMetaKey() { const base = storageKey(); return base ? `${base}::manualRectMeta.v1.4.17` : ''; }
  function oldBlankStoreKeys() { const base = storageKey(); return base ? [ `${base}::blankSlotMarks.v1.4.30`, `${base}::blankSlotMarks.v1.4.29`, `${base}::blankSlotMarks.v1.4.28`, `${base}::blankSlotSatelliteOverrides.v1.4.28`, `${base}::blankSlotSatelliteOverrides.v1.4.26` ] : []; }
  function readyKey() { return `${channelCode()}::${monthKey()}`; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function nearestDuration(value) { const n = Number(value) || 30; return DURATIONS.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, DURATIONS[0]); }
  function timeToSlot(time) { const m = String(time || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return -1; return Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0); }
  function slotToTime(slot) { const h = Math.floor(slot / 2) % 24; return `${pad(h)}:${slot % 2 ? '30' : '00'}`; }
  function canonicalKeyFor(date, time) { return `${channelCode()}__${monthKey() || String(date).slice(0,7)}__${date}__${time}`; }
  function normalizeTime(value) {
    const raw = String(value || '').trim();
    let m = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m.?)?$/i);
    if (m) {
      let h = Number(m[1]);
      const min = Number(m[2]);
      const ap = String(m[3] || '').toLowerCase();
      if (ap === 'p' && h < 12) h += 12;
      if (ap === 'a' && h === 12) h = 0;
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return `${pad(h)}:${pad(min)}`;
    }
    m = raw.match(/^(\d{1,2})(?:\s*([ap])\.?m.?)$/i);
    if (m) {
      let h = Number(m[1]);
      const ap = String(m[2] || '').toLowerCase();
      if (ap === 'p' && h < 12) h += 12;
      if (ap === 'a' && h === 12) h = 0;
      if (h >= 0 && h <= 23) return `${pad(h)}:00`;
    }
    return '';
  }
  function parseDateTimeFromKey(key) {
    const text = String(key || '');
    let m = text.match(/(?:^|__)(\d{4}-\d{2}-\d{2})__(\d{1,2}:\d{2}(?:\s*[ap]\.?m.?)?)(?:$|__|[^0-9])/i);
    if (m) return { date: m[1], time: normalizeTime(m[2]) || m[2] };
    m = text.match(/^(?:13\.1|13\.3)__(\d{4}-\d{2}-\d{2})__(\d{1,2}:\d{2})(?:$|__|[^0-9])/i);
    if (m) return { date: m[1], time: normalizeTime(m[2]) || m[2] };
    m = text.match(/(\d{4}-\d{2}-\d{2}).{0,8}(\d{1,2}:\d{2})/);
    return m ? { date: m[1], time: normalizeTime(m[2]) || m[2] } : null;
  }
  function allTags() { const base = Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : []; if (!base.includes('satelliteFeed')) base.push('satelliteFeed'); return base; }
  function normalizeTags(tags) { const out = {}; allTags().forEach(tag => { out[tag] = !!(tags && tags[tag]); }); return out; }
  function readJson(key, fallback) { try { const raw = key && localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function writeJson(key, value) { try { if (key) localStorage.setItem(key, JSON.stringify(value || {})); } catch (err) { console.warn('WNMU override local write skipped.', err); } }
  function menuStatus(menu, text, isError) { let status = menu?.querySelector('#wnmuCommitStatus') || menu?.querySelector('#wnmuCellStatus'); if (!status && menu) { status = document.createElement('div'); status.id = 'wnmuCommitStatus'; status.className = 'blank-save-status'; menu.querySelector('form')?.appendChild(status); } if (status) { status.textContent = text || ''; status.style.color = isError ? '#8a1f1f' : ''; } }
  function setCommitBusy(menu, busy) {
    const btn = menu?.querySelector('#wnmuCommitProgramBtn');
    const remove = menu?.querySelector('#wnmuRemoveCommittedProgramBtn');
    if (btn) {
      btn.disabled = !!busy;
      btn.textContent = busy ? 'Committing…' : 'Commit to Schedule';
    }
    if (remove) remove.disabled = !!busy;
  }

  function repositionMenu(menu) {
    if (!menu || menu.classList.contains('hidden')) return;
    try {
      menu.style.position = 'fixed';
      const margin = 8;
      const rect = menu.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top;
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
      if (left > maxLeft) left = maxLeft;
      if (top > maxTop) top = maxTop;
      if (left < margin) left = margin;
      if (top < margin) top = margin;
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
    } catch (err) {
      console.warn('Commit menu reposition skipped.', err);
    }
  }



  function ensureCommitMenuStyles() {
    if (document.getElementById('wnmuCommitMenuFixStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuCommitMenuFixStyles';
    style.textContent = `
      #wnmuCellMenu.wnmu-cell-menu,
      #wnmuCellMenu {
        max-height: calc(100vh - 16px) !important;
        max-width: calc(100vw - 16px) !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain;
        box-sizing: border-box !important;
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
        margin: 5px 0 7px !important;
        padding: 5px 0 !important;
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
      .wnmu-cell-override-box {
        pointer-events: none !important;
      }
      #wnmuCellMenu .check-row {
        padding-top: 3px !important;
        padding-bottom: 3px !important;
        min-height: 28px !important;
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
    // v1.5.44: manual commits physically update imported month schedule_json.
    // Old override table rows are intentionally ignored so they cannot draw as a late overlay.
    state.tableAvailable = true;
    state.loadError = '';
    state.committedRows = [];
    window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS = [];
    return [];
  }

  function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
  function minutesFromTime(time) { const m = String(time || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }
  function timeFromMinutes(total) { const clamped = Math.max(0, Math.min(1440, Number(total) || 0)); if (clamped >= 1440) return '24:00'; return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`; }
  function endTimeFromSlot(slot) { return timeFromMinutes(slot * 30); }
  function durationTokenFromMinutes(minutes) { const m = Math.max(0, Number(minutes) || 0); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`; }
  function slotCountForDuration(minutes) { return Math.max(1, Math.round(nearestDuration(minutes) / 30)); }
  function entryStartSlot(entry) { return timeToSlot(entry?.time || ''); }
  function entrySlotCount(entry) { const explicit = Number(entry?.slotCount || 0); if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.round(explicit)); return slotCountForDuration(entry?.durationMin || 30); }
  function entryEndSlot(entry) { const start = entryStartSlot(entry); return start < 0 ? -1 : Math.min(48, start + entrySlotCount(entry)); }
  function rangesOverlap(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && bStart < aEnd; }
  function slugifyForEntryId(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'no-episode'; }
  function scheduleEntryId(entry) { return `${entry.date}__${entry.time}__${slugifyForEntryId(entry.title)}__${slugifyForEntryId(entry.episode || 'no-episode')}__${slugifyForEntryId(entry.sourceDate || entry.date)}__${slugifyForEntryId(entry.sourceTime || entry.time)}`; }
  function buildManualScheduleEntry(row, day) {
    const date = row.date;
    const time = rowTime(row);
    const durationMin = nearestDuration(row.duration_min || row.durationMin || 30);
    const slotCount = slotCountForDuration(durationMin);
    const startSlot = timeToSlot(time);
    return { date, day: day?.day || day?.dayName || '', dayName: day?.dayName || day?.day || '', time, title: rowTitle(row), episode: '', seasonStart: false, endTime: endTimeFromSlot(Math.min(48, startSlot + slotCount)), durationMin: slotCount * 30, slotCount, sourceDate: date, sourceTime: time, sourceStartTime: time, sourceEndTime: endTimeFromSlot(Math.min(48, startSlot + slotCount)), sourceDurationMin: slotCount * 30, sourceDurationToken: durationTokenFromMinutes(slotCount * 30), sourceStartToken: `${time}:00`, durationSource: 'manual-schedule-overwrite', inferredDuration: false, manualScheduleOverwrite: true, manualOverwriteVersion: VERSION, manualCommittedAt: new Date().toISOString() };
  }
  function splitEntryPreservingUncoveredSlots(entry, startSlot, endSlot, note) {
    const originalStart = entryStartSlot(entry);
    const originalEnd = entryEndSlot(entry);
    if (originalStart < 0 || originalEnd <= originalStart) return [];
    const pieces = [];
    const makePiece = (pieceStart, pieceEnd, pieceKind) => {
      if (pieceEnd <= pieceStart) return;
      const copy = cloneJson(entry);
      const slotCount = pieceEnd - pieceStart;
      copy.time = slotToTime(pieceStart);
      copy.endTime = endTimeFromSlot(pieceEnd);
      copy.durationMin = slotCount * 30;
      copy.slotCount = slotCount;
      copy.durationSource = copy.durationSource || 'manual-overwrite-split-preserved';
      copy.manualSplitPreserved = { reason: 'manual schedule overwrite preserved an unaffected portion of this imported program', originalTime: entry.time || '', originalEndTime: entry.endTime || endTimeFromSlot(originalEnd), piece: pieceKind, overwriteStart: slotToTime(startSlot), overwriteEnd: endTimeFromSlot(endSlot), note: note || '', at: new Date().toISOString() };
      pieces.push(copy);
    };
    if (originalStart < startSlot) makePiece(originalStart, Math.min(startSlot, originalEnd), 'before-overwrite');
    if (originalEnd > endSlot) makePiece(Math.max(endSlot, originalStart), originalEnd, 'after-overwrite');
    return pieces;
  }
  function recalcDayCoverage(day) {
    const occupied = Array(48).fill(false);
    const overlaps = new Set();
    (day.entries || []).forEach(entry => {
      const start = entryStartSlot(entry);
      const slots = entrySlotCount(entry);
      if (start < 0) return;
      for (let slot = start; slot < Math.min(48, start + slots); slot += 1) { if (occupied[slot]) overlaps.add(slot); occupied[slot] = true; }
    });
    const missingSlots = occupied.map((value, idx) => value ? null : idx).filter(value => value !== null);
    day.coveredSlots = 48 - missingSlots.length;
    day.missingSlots = missingSlots;
    day.continuous = missingSlots.length === 0;
    day.overlapSlots = Array.from(overlaps).sort((a, b) => a - b);
    return day;
  }
  function rebuildVerification(schedule, originalVerification) {
    const verification = originalVerification && typeof originalVerification === 'object' ? cloneJson(originalVerification) : {};
    const days = Array.isArray(schedule.days) ? schedule.days : [];
    const totalDays = days.length;
    verification.version = verification.version || `${schedule.channel || channelCode()} ${schedule.month || monthKey()} imported`;
    verification.checks = { ...(verification.checks || {}), expectedDayCount: verification.checks?.expectedDayCount || totalDays, actualDayCount: totalDays, everyDayHas48CoveredSlots: days.every(day => Number(day.coveredSlots) === 48), anyMissingSlots: days.some(day => Array.isArray(day.missingSlots) && day.missingSlots.length), anyOverlapSlots: days.some(day => Array.isArray(day.overlapSlots) && day.overlapSlots.length), everyDayHasContinuousCoverage: days.every(day => !!day.continuous) };
    verification.dailyCoverage = days.map(day => ({ date: day.date, day: day.day || day.dayName || '', dayName: day.dayName || day.day || '', coveredSlots: day.coveredSlots, missingSlots: Array.isArray(day.missingSlots) ? day.missingSlots : [], overlapSlots: Array.isArray(day.overlapSlots) ? day.overlapSlots : [], continuous: !!day.continuous, airings: Array.isArray(day.entries) ? day.entries.length : 0 }));
    verification.lastManualOverwriteAt = new Date().toISOString();
    verification.lastManualOverwriteVersion = VERSION;
    return verification;
  }
  function replaceScheduleRange(schedule, verification, row) {
    if (!schedule || typeof schedule !== 'object' || !Array.isArray(schedule.days)) throw new Error('Imported schedule_json has an unexpected shape; refusing to overwrite it.');
    const next = cloneJson(schedule);
    const day = (next.days || []).find(d => d && d.date === row.date);
    if (!day) throw new Error(`No imported schedule day found for ${row.date}; no data was changed.`);
    if (!Array.isArray(day.entries)) day.entries = [];
    const startSlot = timeToSlot(rowTime(row));
    const slotCount = slotCountForDuration(row.duration_min || row.durationMin || 30);
    const endSlot = Math.min(48, startSlot + slotCount);
    if (startSlot < 0 || endSlot <= startSlot) throw new Error('Commit time/duration could not be converted to a valid half-hour range.');
    const manualEntry = buildManualScheduleEntry(row, day);
    const preserved = [], replaced = [], untouched = [];
    for (const entry of day.entries) {
      const eStart = entryStartSlot(entry), eEnd = entryEndSlot(entry);
      if (eStart < 0 || eEnd <= eStart || !rangesOverlap(eStart, eEnd, startSlot, endSlot)) { untouched.push(entry); continue; }
      replaced.push(cloneJson(entry));
      preserved.push(...splitEntryPreservingUncoveredSlots(entry, startSlot, endSlot, rowTitle(row)));
    }
    day.entries = untouched.concat(preserved, [manualEntry]).sort((a, b) => minutesFromTime(a.time) - minutesFromTime(b.time));
    recalcDayCoverage(day);
    next.manualScheduleOverwriteLog = Array.isArray(next.manualScheduleOverwriteLog) ? next.manualScheduleOverwriteLog.slice(-49) : [];
    next.manualScheduleOverwriteLog.push({ version: VERSION, at: new Date().toISOString(), channelCode: channelCode(), monthKey: row.month_key || monthKey(), date: row.date, time: rowTime(row), durationMin: manualEntry.durationMin, title: manualEntry.title, replacedCount: replaced.length, preservedSplitCount: preserved.length, replacedEntries: replaced.map(entry => ({ date: entry.date, time: entry.time, title: entry.title, episode: entry.episode || '', durationMin: entry.durationMin, slotCount: entry.slotCount, endTime: entry.endTime || '' })) });
    next.lastManualOverwriteAt = new Date().toISOString();
    next.lastManualOverwriteVersion = VERSION;
    const nextVerification = rebuildVerification(next, verification);
    return { schedule: next, verification: nextVerification, manualEntry, replaced, preserved, changedDay: day };
  }
  function validateOverwrite(originalSchedule, result, row) {
    const targetDate = row.date;
    const origDays = originalSchedule.days || [], nextDays = result.schedule.days || [];
    if (origDays.length !== nextDays.length) throw new Error('Safety check failed: day count changed unexpectedly. No data was written.');
    for (let i = 0; i < origDays.length; i += 1) {
      if (origDays[i]?.date !== targetDate && JSON.stringify(origDays[i]) !== JSON.stringify(nextDays[i])) throw new Error(`Safety check failed: ${origDays[i]?.date || 'another day'} changed even though only ${targetDate} should change. No data was written.`);
    }
    const manual = result.manualEntry;
    const found = (result.changedDay.entries || []).find(entry => entry.time === manual.time && entry.title === manual.title && Number(entry.durationMin) === Number(manual.durationMin));
    if (!found) throw new Error('Safety check failed: replacement program was not present after rewrite. No data was written.');
    if ((result.changedDay.overlapSlots || []).length) throw new Error(`Safety check failed: rewritten day would have ${result.changedDay.overlapSlots.length} overlapped slot(s). No data was written.`);
    return true;
  }
  async function fetchImportedMonthRow(row) {
    const channel = row.channel_code || channelCode();
    const month = row.month_key || monthKey() || String(row.date || '').slice(0, 7);
    const rows = await rest(`/rest/v1/${IMPORTED_MONTHS_TABLE}?select=id,channel_code,month_key,schedule_json,verification_json,updated_at,published_at&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}&limit=1`, { cache: 'no-store' });
    if (!Array.isArray(rows) || !rows.length) throw new Error(`No imported month table row found for ${channel} ${month}. Nothing was changed.`);
    return rows[0];
  }
  async function patchImportedMonth(row, nextSchedule, nextVerification) {
    const channel = row.channel_code || channelCode();
    const month = row.month_key || monthKey() || String(row.date || '').slice(0, 7);
    const result = await rest(`/rest/v1/${IMPORTED_MONTHS_TABLE}?channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ schedule_json: nextSchedule, verification_json: nextVerification }) });
    return Array.isArray(result) ? result[0] : result;
  }
  function clearJsonCachesForMonth(channel, month) {
    try { Object.keys(localStorage || {}).forEach(key => { if (key.startsWith('wnmu_json_cache_v1_3_1::') && (key.includes(`supabase-imported-months/${channel}/${month}/schedule-`) || key.includes(`supabase-imported-months/${channel}/${month}/verification-`))) localStorage.removeItem(key); }); } catch (err) { console.warn('Could not clear local schedule JSON cache after overwrite.', err); }
  }
  async function upsertSharedMark(entryKey, markJson, source) {
    if (!entryKey || !markJson || typeof markJson !== 'object') return;
    if (!Object.keys(markJson.tags || {}).some(tag => markJson.tags[tag] === true) && !markJson.rectNote) return;
    await rest(`/rest/v1/${SHARED_MARKS_TABLE}?on_conflict=channel_code,month_key,entry_key`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify([{ channel_code: channelCode(), channel_slug: channelSlug(), month_key: monthKey() || String((entryKey.match(/\d{4}-\d{2}/) || [''])[0]), entry_key: entryKey, mark_json: markJson, source: source || 'manual-schedule-overwrite-commit', updated_at: new Date().toISOString() }]) });
  }
  async function saveTagsForManualEntry(row, manualEntry) {
    const entryKey = scheduleEntryId(manualEntry);
    const tags = normalizeTags(row.tags_json || row.tags || {});
    const hasTag = Object.keys(tags).some(tag => tags[tag] === true);
    if (!hasTag) return entryKey;
    const markJson = { tags };
    try { const key = storageKey(); if (key) { const stateObj = readJson(key, {}); stateObj[entryKey] = { ...(stateObj[entryKey] || {}), ...markJson }; writeJson(key, stateObj); } } catch (err) { console.warn('Manual overwrite tag local save skipped.', err); }
    try { await upsertSharedMark(entryKey, markJson, 'manual-schedule-overwrite-commit'); } catch (err) { console.warn('Manual overwrite tag shared save skipped.', err); }
    return entryKey;
  }
  async function upsertRow(row) {
    const imported = await fetchImportedMonthRow(row);
    const originalSchedule = imported.schedule_json;
    const result = replaceScheduleRange(originalSchedule, imported.verification_json || {}, row);
    validateOverwrite(originalSchedule, result, row);
    try { const backupKey = `wnmu_manual_overwrite_backup::${channelCode()}::${row.month_key || monthKey()}::${row.date}::${rowTime(row)}::${Date.now()}`; localStorage.setItem(backupKey, JSON.stringify({ version: VERSION, row, importedRowUpdatedAt: imported.updated_at || '', schedule_json: originalSchedule, verification_json: imported.verification_json || {} })); } catch (err) { console.warn('Local pre-overwrite backup skipped.', err); }
    await patchImportedMonth(row, result.schedule, result.verification);
    clearJsonCachesForMonth(row.channel_code || channelCode(), row.month_key || monthKey() || String(row.date).slice(0, 7));
    const newEntryKey = await saveTagsForManualEntry(row, result.manualEntry);
    window.WNMU_LAST_MANUAL_SCHEDULE_OVERWRITE = { version: VERSION, row, newEntryKey, replacedCount: result.replaced.length, preservedSplitCount: result.preserved.length, at: new Date().toISOString() };
    state.tableAvailable = true;
    return { ...row, source_entry_id: newEntryKey || row.source_entry_id || '', imported_month_overwritten: true, replaced_count: result.replaced.length, preserved_split_count: result.preserved.length };
  }
  async function deactivateRow(row) { throw new Error('Remove committed program is disabled in v1.5.44 because commits now overwrite imported schedule_json. Restore from backup/reimport if a committed replacement needs to be undone.'); }


  function normalizeCompareText(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function rowTime(row) { return normalizeTime(row?.slot_time || row?.time || '') || String(row?.slot_time || row?.time || ''); }
  function rowTitle(row) { return String(row && (row.title_text || row.text || row.title) || '').trim(); }
  function rowSourceEntryId(row) { return String(row?.source_entry_id || row?.sourceEntryId || '').trim(); }
  function rowMonth(row) { return row?.month_key || monthKey() || String(row?.date || '').slice(0, 7); }

  function committedRowKeys(row) {
    const keys = new Set();
    const date = row?.date;
    const time = rowTime(row);
    if (date && time) keys.add(canonicalKeyFor(date, time));
    if (row?.entry_key) keys.add(String(row.entry_key));
    const source = rowSourceEntryId(row);
    if (source) keys.add(source);
    return keys;
  }

  function recordDateTimeFromKeyRaw(key, raw) {
    const parsed = parseDateTimeFromKey(key) || {};
    const rect = raw && typeof raw === 'object' ? (raw.rectNote || raw.manualProgram || raw.manualProgramEntry || raw.programEntry || null) : null;
    const date = raw?.date || raw?.start_date || raw?.startDate || rect?.date || rect?.start_date || rect?.startDate || parsed.date || '';
    const time = normalizeTime(raw?.time || raw?.slot_time || raw?.slotTime || raw?.start_time || raw?.startTime || rect?.time || rect?.slot_time || rect?.slotTime || rect?.start_time || rect?.startTime || parsed.time || '');
    return { date, time };
  }

  function recordSourceEntryId(key, raw) {
    return String(raw?.source_entry_id || raw?.sourceEntryId || raw?.entryId || raw?.source_entry_key || raw?.legacy_entry_key || '').trim();
  }

  function recordMatchesCommittedRow(row, key, raw, allowExactEmpty = true) {
    if (!row || !row.date || !rowTime(row)) return false;
    const exactKeys = committedRowKeys(row);
    if (allowExactEmpty && exactKeys.has(String(key || ''))) return true;
    if (!shouldDeleteStagingRecord(raw)) return false;
    const rowDate = String(row.date);
    const rowStart = rowTime(row);
    const slotSet = new Set(coveredTimes(rowDate, rowStart, row.duration_min || row.durationMin || 30).map(slot => `${slot.date}__${slot.time}`));
    const info = recordDateTimeFromKeyRaw(key, raw);
    const source = recordSourceEntryId(key, raw);
    const rowSource = rowSourceEntryId(row);
    if (rowSource && source && source === rowSource) return true;
    const text = normalizeCompareText(textFromStagedRaw(raw));
    const title = normalizeCompareText(rowTitle(row));
    const sameStart = info.date === rowDate && info.time === rowStart;
    const startsInsideCommittedBlock = info.date && info.time && slotSet.has(`${info.date}__${info.time}`);
    if (sameStart && (!title || !text || text === title)) return true;
    if (title && text === title && startsInsideCommittedBlock) return true;
    return false;
  }

  async function fetchSharedMarksForMonth() {
    const channel = channelCode();
    const month = monthKey();
    if (!channel || !month) return [];
    return await rest(`/rest/v1/${SHARED_MARKS_TABLE}?select=entry_key,mark_json,source,legacy_entry_key,legacy_note,updated_at&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}&limit=4000`, { cache: 'no-store' });
  }

  async function deleteSharedMarkKeys(keys) {
    const clean = Array.from(keys || []).filter(Boolean);
    let deleted = 0;
    for (const entryKey of clean) {
      try {
        await rest(`/rest/v1/${SHARED_MARKS_TABLE}?channel_code=eq.${encodeURIComponent(channelCode())}&month_key=eq.${encodeURIComponent(monthKey())}&entry_key=eq.${encodeURIComponent(entryKey)}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' }
        });
        deleted += 1;
      } catch (err) {
        console.warn('Shared staged mark delete skipped for', entryKey, err);
      }
    }
    return deleted;
  }

  async function clearSharedStagingRange(row) {
    const date = row?.date;
    const time = rowTime(row);
    if (!date || !time) return 0;
    const keys = committedRowKeys(row);

    try {
      const existing = await fetchSharedMarksForMonth();
      (Array.isArray(existing) ? existing : []).forEach(shared => {
        if (!shared?.entry_key) return;
        if (recordMatchesCommittedRow(row, shared.entry_key, shared.mark_json || {}, true)) keys.add(shared.entry_key);
      });
    } catch (err) {
      console.warn('Shared staged mark lookup skipped before commit cleanup.', err);
    }

    if (!keys.size) return 0;
    const deleted = await deleteSharedMarkKeys(keys);
    state.lastSharedCleanup = { row: { date, time, title: rowTitle(row), entry_key: row.entry_key || '', source_entry_id: rowSourceEntryId(row) }, attempted: keys.size, deleted, at: new Date().toISOString() };
    return deleted;
  }

  async function clearSharedStagingForRows(rows) {
    let count = 0;
    for (const row of rows || []) count += await clearSharedStagingRange(row);
    return count;
  }

  function menuTarget(menu) { const date = menu?.dataset.wnmuDate || ''; const time = menu?.dataset.wnmuTime || ''; if (!date || !time) return null; return { date, time, key: menu.dataset.wnmuCellKey || canonicalKeyFor(date, time) }; }
  function safeName(name) { return window.CSS && CSS.escape ? CSS.escape(name) : String(name).replace(/["\\]/g, '\\$&'); }
  function readTagsFromMenu(menu) { const tags = {}; allTags().forEach(tag => { const input = menu?.querySelector(`input[name="${safeName(tag)}"]`); tags[tag] = !!input?.checked; }); return normalizeTags(tags); }
  function rowFromMenu(menu) {
    const target = menuTarget(menu);
    if (!target) throw new Error('No schedule cell selected. Right-click the cell again.');
    const staged = findStagedForTarget(target.date, target.time);
    const commitDate = staged?.date || target.date;
    const commitTime = staged?.time || target.time;
    const text = String(menu.querySelector('#wnmuCellText')?.value || staged?.text || '').trim();
    if (!text) throw new Error('Type a program title/replacement text before committing.');
    const duration = nearestDuration(menu.querySelector('input[name="wnmuCellDuration"]:checked')?.value || staged?.durationMin || 30);
    return { channel_code: channelCode(), month_key: monthKey() || commitDate.slice(0, 7), entry_key: canonicalKeyFor(commitDate, commitTime), date: commitDate, slot_time: commitTime, duration_min: duration, source_entry_id: menu.dataset.wnmuEntryId || staged?.sourceEntryId || '', override_type: 'manual_program', title_text: text, tags_json: readTagsFromMenu(menu), is_active: true, updated_by: 'schedule-page-commit' };
  }

  function sameSlot(row, date, time) { return String(row.date) === String(date) && String(row.slot_time || row.time) === String(time); }
  function committedFor(date, time) { return (window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS || []).find(row => row && row.is_active !== false && sameSlot(row, date, time)); }
  function mergeCommittedRow(row) { const rows = (window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS || []).filter(existing => existing.entry_key !== row.entry_key); rows.push(row); rows.sort((a, b) => `${a.date}${a.slot_time}`.localeCompare(`${b.date}${b.slot_time}`)); window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS = rows; state.committedRows = rows; }
  function removeCommittedRow(row) { const rows = (window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS || []).filter(existing => existing.entry_key !== row.entry_key); window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS = rows; state.committedRows = rows; }

  function coveredTimes(date, time, duration) { const start = timeToSlot(time); if (start < 0) return []; const slots = Math.max(1, Math.round(nearestDuration(duration) / 30)); const out = []; for (let i = 0; i < slots; i += 1) out.push({ date, time: slotToTime(start + i) }); return out; }
  let stagedMain = null; let stagedCanon = null; let stagedMeta = null; let stagedOldStores = null;
  function loadStagingStores() {
    stagedMain = readJson(storageKey(), {});
    stagedCanon = readJson(canonicalStoreKey(), {});
    stagedMeta = readJson(manualMetaKey(), {});
    stagedOldStores = oldBlankStoreKeys().map(key => ({ key, value: readJson(key, {}) }));
  }
  function flushStagingChanges() {
    if (stagedMain) writeJson(storageKey(), stagedMain);
    if (stagedCanon) writeJson(canonicalStoreKey(), stagedCanon);
    if (stagedMeta) writeJson(manualMetaKey(), stagedMeta);
    (stagedOldStores || []).forEach(store => writeJson(store.key, store.value));
    stagedMain = stagedCanon = stagedMeta = null; stagedOldStores = null;
  }

  function currentCommittedRows() {
    const rows = Array.isArray(window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS) ? window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS : state.committedRows;
    return (rows || []).filter(row => row && row.is_active !== false && row.updated_by === 'schedule-page-commit' && row.date && (row.slot_time || row.time));
  }

  function rowTitle(row) { return String(row && (row.title_text || row.text || row.title) || '').trim(); }

  function clearOverlayDomForRows(rows) {
    const slotSet = new Set();
    const titles = new Set();
    (rows || []).forEach(row => {
      const date = row.date;
      const time = row.slot_time || row.time;
      const duration = row.duration_min || row.durationMin || 30;
      if (rowTitle(row)) titles.add(rowTitle(row).toLowerCase());
      coveredTimes(date, time, duration).forEach(slot => slotSet.add(`${slot.date}__${slot.time}`));
    });
    document.querySelectorAll('.wnmu-cell-override-box').forEach(box => {
      const k = `${box.dataset.wnmuDate || ''}__${box.dataset.wnmuTime || ''}`;
      const txt = String(box.textContent || '').trim().toLowerCase();
      if (slotSet.has(k) || (txt && titles.has(txt))) box.remove();
    });
    document.querySelectorAll('.wnmu-cell-override-layer').forEach(layer => {
      if (!layer.querySelector('.wnmu-cell-override-box')) layer.remove();
    });
  }

  function scrubCommittedStaging(reason, flush = true) {
    if (state.scrubbing) return false;
    const rows = currentCommittedRows();
    if (!rows.length) return false;
    state.scrubbing = true;
    try {
      const changed = clearStagingForRows(rows, flush);
      clearOverlayDomForRows(rows);
      return changed;
    } finally {
      state.scrubbing = false;
    }
  }

  function cleanupLoadedRowsLocally(reason) {
    if (!storageKey()) return false;
    const rows = currentCommittedRows();
    if (!rows.length) return false;
    const changed = scrubCommittedStaging(reason || 'local-cleanup', true);
    state.lastLocalCleanup = { reason: reason || 'local-cleanup', storageKey: storageKey(), rows: rows.length, changed, at: new Date().toISOString() };
    return changed;
  }

  function scheduleCommittedScrub(reason) {
    [0, 60, 250, 900, 2200].forEach(ms => window.setTimeout(() => scrubCommittedStaging(reason, true), ms));
  }

  function installStorageGuard() {
    if (state.storageGuardInstalled) return;
    state.storageGuardInstalled = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function wnmuManualProgramSetItemGuard(key, value) {
      const result = originalSetItem.apply(this, arguments);
      try {
        if (!state.scrubbing && (key === storageKey() || key === canonicalStoreKey())) {
          window.setTimeout(() => scrubCommittedStaging('localStorage-write', true), 0);
        }
      } catch (err) {
        console.warn('WNMU committed overlay storage guard skipped.', err);
      }
      return result;
    };
  }

  function shouldDeleteStagingRecord(raw) {
    if (!raw || typeof raw !== 'object') return false;
    const rect = raw.rectNote || raw.manualProgram || raw.manualProgramEntry || raw.programEntry || null;
    return !!(raw.cellOverrideV15 || raw.whiteout || raw.text || raw.note || raw.title || raw.title_text || raw.manualProgramOverrideV1524 || raw.manualProgramOverrideV1526 || (rect && (rect.text || rect.note || rect.title || rect.title_text || rect.cellOverrideV15)));
  }

  function clearObjectKeysMatching(store, row, exactOnly = false) {
    if (!store || typeof store !== 'object') return false;
    let changed = false;
    Object.keys(store).forEach(key => {
      const raw = store[key];
      if (exactOnly) {
        const exactKeys = committedRowKeys(row);
        const parsed = parseDateTimeFromKey(key) || {};
        const exactStart = parsed.date === String(row.date) && normalizeTime(parsed.time || '') === rowTime(row);
        if (exactKeys.has(key) || exactStart) { delete store[key]; changed = true; }
        return;
      }
      if (recordMatchesCommittedRow(row, key, raw, true)) { delete store[key]; changed = true; }
    });
    return changed;
  }

  function clearStagingForCommittedRow(row, flush = true) {
    if (!storageKey()) return false;
    if (!stagedMain || !stagedCanon) loadStagingStores();
    let changed = false;
    changed = clearObjectKeysMatching(stagedCanon, row, false) || changed;
    changed = clearObjectKeysMatching(stagedMain, row, false) || changed;
    // The legacy metadata store does not always contain text, so delete only exact matching start/source keys.
    changed = clearObjectKeysMatching(stagedMeta, row, true) || changed;
    (stagedOldStores || []).forEach(store => { changed = clearObjectKeysMatching(store.value, row, false) || changed; });
    clearOverlayDom(coveredTimes(row.date, rowTime(row), row.duration_min || row.durationMin || 30));
    if (changed && flush) flushStagingChanges();
    if (changed) state.lastLocalCleanup = { row: { date: row.date, time: rowTime(row), title: rowTitle(row), entry_key: row.entry_key || '', source_entry_id: rowSourceEntryId(row) }, at: new Date().toISOString() };
    return changed;
  }

  function clearStagingRange(date, time, duration, flush = true, titleText = '', sourceEntryId = '') {
    return clearStagingForCommittedRow({ date, slot_time: time, duration_min: duration, title_text: titleText, source_entry_id: sourceEntryId, entry_key: canonicalKeyFor(date, time), month_key: monthKey() || String(date).slice(0, 7) }, flush);
  }

  function clearStagingForRows(rows, flush) {
    let changed = false;
    (rows || []).forEach(row => { if (clearStagingForCommittedRow(row, false)) changed = true; });
    if (changed && flush) flushStagingChanges();
    return changed;
  }

  function clearOverlayDom(slots) {
    const slotSet = new Set((slots || []).map(s => `${s.date}__${s.time}`));
    document.querySelectorAll('.wnmu-cell-override-box').forEach(box => { const k = `${box.dataset.wnmuDate || ''}__${box.dataset.wnmuTime || ''}`; if (slotSet.has(k)) box.remove(); });
    document.querySelectorAll('.wnmu-cell-override-layer').forEach(layer => { if (!layer.querySelector('.wnmu-cell-override-box')) layer.remove(); });
  }

  function textFromStagedRaw(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const rect = raw.rectNote || raw.manualProgram || raw.manualProgramEntry || raw.programEntry || null;
    return String(raw.title_text || raw.title || raw.text || raw.note || rect?.title_text || rect?.title || rect?.text || rect?.note || '').trim();
  }
  function durationFromStagedRaw(raw) {
    if (!raw || typeof raw !== 'object') return 30;
    const rect = raw.rectNote || raw.manualProgram || raw.manualProgramEntry || raw.programEntry || null;
    return nearestDuration(raw.duration_min || raw.durationMin || raw.lengthMin || raw.lengthMinutes || rect?.duration_min || rect?.durationMin || 30);
  }
  function tagsFromStagedRaw(raw) {
    if (!raw || typeof raw !== 'object') return {};
    return normalizeTags(raw.tags || raw.tags_json || raw.tagState || raw);
  }
  function stagedRecordFromKeyRaw(key, raw) {
    if (!raw || typeof raw !== 'object' || !shouldDeleteStagingRecord(raw)) return null;
    const parsed = parseDateTimeFromKey(key) || {};
    const rect = raw.rectNote || raw.manualProgram || raw.manualProgramEntry || raw.programEntry || null;
    const date = raw.date || raw.start_date || raw.startDate || rect?.date || rect?.start_date || rect?.startDate || parsed.date || '';
    const time = normalizeTime(raw.time || raw.slot_time || raw.slotTime || raw.start_time || raw.startTime || rect?.time || rect?.slot_time || rect?.slotTime || rect?.start_time || rect?.startTime || parsed.time || '');
    const text = textFromStagedRaw(raw);
    const durationMin = durationFromStagedRaw(raw);
    if (!date || !time || !text) return null;
    return { key, raw, date, time, text, durationMin, tags: tagsFromStagedRaw(raw), sourceEntryId: raw.source_entry_id || raw.sourceEntryId || raw.entryId || '' };
  }
  function stagedCoversSlot(staged, date, time) {
    if (!staged) return false;
    const slots = coveredTimes(staged.date, staged.time, staged.durationMin);
    return slots.some(slot => slot.date === date && slot.time === time);
  }
  function allStagedRecords() {
    if (!stagedMain || !stagedCanon) loadStagingStores();
    const out = [];
    const seen = new Set();
    for (const store of [stagedCanon, stagedMain]) {
      Object.entries(store || {}).forEach(([key, raw]) => {
        const rec = stagedRecordFromKeyRaw(key, raw);
        if (!rec) return;
        const sig = `${rec.date}__${rec.time}__${rec.text}`;
        if (seen.has(sig)) return;
        seen.add(sig);
        out.push(rec);
      });
    }
    return out.sort((a, b) => (b.durationMin - a.durationMin) || (a.date + a.time).localeCompare(b.date + b.time));
  }
  function findStagedForTarget(date, time) {
    return allStagedRecords().find(rec => stagedCoversSlot(rec, date, time)) || null;
  }
  function prefillStaged(menu) {
    const target = menuTarget(menu);
    if (!target) return null;
    const staged = findStagedForTarget(target.date, target.time);
    if (!staged) return null;
    const text = menu.querySelector('#wnmuCellText');
    if (text && !String(text.value || '').trim()) text.value = staged.text || '';
    const dur = nearestDuration(staged.durationMin || 30);
    const radio = menu.querySelector(`input[name="wnmuCellDuration"][value="${dur}"]`);
    if (radio) radio.checked = true;
    const tags = staged.tags || {};
    Object.keys(tags).forEach(tag => { const input = menu.querySelector(`input[name="${safeName(tag)}"]`); if (input && tags[tag]) input.checked = true; });
    menuStatus(menu, `Staged program found at ${staged.time}. Commit to Schedule will write it permanently and delete only this matching staged overlay.`);
    return staged;
  }
  function clearSupabaseJsonFetchShimCache(row) {
    try {
      const fn = window.WNMU_SUPABASE_JSON_FETCH_SHIM_CLEAR;
      if (typeof fn === 'function') fn(row?.channel_code || channelCode(), row?.month_key || monthKey() || String(row?.date || '').slice(0, 7));
    } catch (err) {
      console.warn('Supabase JSON fetch shim cache clear skipped.', err);
    }
  }

  function captureScheduleScrollState() {
    const scroller = document.querySelector('main.page') || document.scrollingElement || document.documentElement;
    const activeWeek = Array.from(document.querySelectorAll('.week-grid-wrap')).find(wrap => {
      const rect = wrap.getBoundingClientRect();
      return rect.bottom > 120 && rect.top < Math.max(window.innerHeight, 400);
    });
    return {
      scroller,
      top: scroller ? scroller.scrollTop : 0,
      left: scroller ? scroller.scrollLeft : 0,
      weekIndex: activeWeek?.dataset?.weekIndex || '',
      weekOffset: activeWeek ? Math.round(activeWeek.getBoundingClientRect().top) : null
    };
  }

  function restoreScheduleScrollState(saved) {
    if (!saved || !saved.scroller) return;
    const apply = () => {
      try {
        if (saved.weekIndex) {
          const wrap = document.querySelector(`.week-grid-wrap[data-week-index="${CSS.escape(saved.weekIndex)}"]`);
          if (wrap && saved.weekOffset !== null) {
            const nowTop = Math.round(wrap.getBoundingClientRect().top);
            saved.scroller.scrollTop += (nowTop - saved.weekOffset);
          } else {
            saved.scroller.scrollTop = saved.top;
          }
        } else {
          saved.scroller.scrollTop = saved.top;
        }
        saved.scroller.scrollLeft = saved.left || 0;
      } catch {
        try { saved.scroller.scrollTop = saved.top || 0; } catch {}
      }
    };
    [0, 40, 120, 300, 700, 1300].forEach(ms => window.setTimeout(() => window.requestAnimationFrame(apply), ms));
  }

  function closeMenuBeforeRendererReset() {
    try {
      const closeBtn = document.getElementById('closeMenuBtn');
      if (closeBtn) closeBtn.click();
      const menu = document.getElementById('contextMenu') || document.getElementById('wnmuCellMenu');
      if (menu) {
        menu.classList.add('hidden');
        menu.setAttribute('aria-hidden', 'true');
      }
    } catch (err) {
      console.warn('Menu close before soft schedule refresh skipped.', err);
    }
  }

  function softReloadSharedScheduleRenderer(row) {
    return new Promise((resolve, reject) => {
      try {
        closeMenuBeforeRendererReset();
        clearSupabaseJsonFetchShimCache(row);
        clearJsonCachesForMonth(row?.channel_code || channelCode(), row?.month_key || monthKey() || String(row?.date || '').slice(0, 7));
        const scrollState = captureScheduleScrollState();
        const rendererFile = cfg().sharedRendererFile || 'wnmu-monthly-shared.v1.3.1.js';
        const script = document.createElement('script');
        script.src = `${rendererFile}${rendererFile.includes('?') ? '&' : '?'}softRefresh=${encodeURIComponent(VERSION)}&t=${Date.now()}`;
        script.async = false;
        let settled = false;
        const finish = (ok, err) => {
          if (settled) return;
          settled = true;
          if (ok) restoreScheduleScrollState(scrollState);
          if (ok) resolve();
          else reject(err || new Error('The schedule grid soft refresh failed.'));
        };
        script.onload = () => {
          window.setTimeout(() => {
            restoreScheduleScrollState(scrollState);
            window.dispatchEvent(new CustomEvent('wnmu:schedule-grid-soft-refreshed', { detail: { version: VERSION, row, preservedScroll: true } }));
            finish(true);
          }, 0);
        };
        script.onerror = () => finish(false, new Error(`Could not reload ${rendererFile} after imported schedule overwrite.`));
        document.body.appendChild(script);
        window.setTimeout(() => finish(true), 6000);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function clearStagedFromMenu(menu) {
    if (menu?.dataset.wnmuCommitBusy === '1') return;
    try {
      menu.dataset.wnmuCommitBusy = '1';
      ensureCommitMenuStyles();
      setCommitBusy(menu, true);
      const target = menuTarget(menu);
      if (!target) throw new Error('No schedule cell selected. Right-click the covered cell again.');
      const staged = findStagedForTarget(target.date, target.time);
      const date = staged?.date || target.date;
      const time = staged?.time || target.time;
      const duration = nearestDuration(staged?.durationMin || menu.querySelector('input[name="wnmuCellDuration"]:checked')?.value || 30);
      menuStatus(menu, 'Clearing staged floating overlay…');
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const row = { date, slot_time: time, duration_min: duration };
      await clearSharedStagingRange(row);
      clearStagingRange(date, time, duration, true, staged?.text || '', staged?.sourceEntryId || '');
      window.dispatchEvent(new CustomEvent('wnmu:manual-program-overrides-updated', { detail: { changed: 1, source: 'clear-staged', row } }));
      if (typeof window.WNMU_MANUAL_PROGRAMS_REFRESH === 'function') window.WNMU_MANUAL_PROGRAMS_REFRESH();
      menuStatus(menu, 'Staged floating overlay cleared. The imported program underneath remains.');
      const text = menu.querySelector('#wnmuCellText');
      if (text && staged?.text && String(text.value || '').trim() === staged.text) text.value = '';
      const clearBtn = menu.querySelector('#wnmuClearStagedProgramBtn');
      if (clearBtn) clearBtn.hidden = true;
    } catch (err) {
      menuStatus(menu, err.message || String(err), true);
      console.error('Clear staged program failed', err);
    } finally {
      delete menu.dataset.wnmuCommitBusy;
      setCommitBusy(menu, false);
    }
  }


  async function commitFromMenu(menu) {
    if (menu?.dataset.wnmuCommitBusy === '1') return;
    try {
      menu.dataset.wnmuCommitBusy = '1';
      ensureCommitMenuStyles();
      setCommitBusy(menu, true);
      menuStatus(menu, 'Overwriting imported schedule data for this exact day/time range…');
      const row = rowFromMenu(menu);
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const committed = await upsertRow(row);
      await clearSharedStagingRange(committed);
      clearStagingForCommittedRow(committed, true);
      scheduleCommittedScrub('commit-overwrite');
      window.dispatchEvent(new CustomEvent('wnmu:manual-schedule-data-overwritten', { detail: { changed: 1, source: 'commit', row: committed } }));
      menuStatus(menu, `Imported schedule data overwritten. Replaced ${committed.replaced_count || 0} imported block(s); preserved ${committed.preserved_split_count || 0} split piece(s). Refreshing schedule grid…`);
      await softReloadSharedScheduleRenderer(committed);
      menuStatus(menu, `Imported schedule data overwritten and schedule grid refreshed without a page reload. Replaced ${committed.replaced_count || 0} imported block(s); preserved ${committed.preserved_split_count || 0} split piece(s).`);
    } catch (err) {
      menuStatus(menu, err.message || String(err), true);
      console.error('Manual imported-schedule overwrite failed', err);
    } finally {
      delete menu.dataset.wnmuCommitBusy;
      setCommitBusy(menu, false);
    }
  }

  async function removeFromMenu(menu) { try { const target = menuTarget(menu); if (!target) throw new Error('No schedule cell selected.'); const row = committedFor(target.date, target.time); if (!row) throw new Error('No committed program found for this slot.'); menuStatus(menu, 'Removing committed program…'); await deactivateRow({ ...row, is_active: false }); removeCommittedRow(row); window.dispatchEvent(new CustomEvent('wnmu:manual-program-overrides-updated', { detail: { changed: 1, source: 'remove', row } })); if (typeof window.WNMU_MANUAL_PROGRAMS_REFRESH === 'function') window.WNMU_MANUAL_PROGRAMS_REFRESH(); menuStatus(menu, 'Committed program removed. Original imported schedule is visible again.'); } catch (err) { menuStatus(menu, err.message || String(err), true); console.error('Manual program remove failed', err); } }

  function prefillCommitted(menu) {
    const target = menuTarget(menu);
    if (!target) return;
    const row = committedFor(target.date, target.time);
    const removeBtn = menu.querySelector('#wnmuRemoveCommittedProgramBtn');
    if (removeBtn) removeBtn.hidden = !row;
    if (!row) {
      delete menu.dataset.wnmuCommittedPrefillSig;
      prefillStaged(menu);
      repositionMenu(menu);
      return;
    }

    const sig = `${target.date}__${target.time}__${row.entry_key || ''}__${row.updated_at || ''}`;
    if (menu.dataset.wnmuCommittedPrefillSig === sig) {
      repositionMenu(menu);
      return;
    }
    menu.dataset.wnmuCommittedPrefillSig = sig;

    const text = menu.querySelector('#wnmuCellText');
    if (text && !String(text.value || '').trim()) text.value = row.title_text || '';
    const dur = nearestDuration(row.duration_min || 30);
    const radio = menu.querySelector(`input[name="wnmuCellDuration"][value="${dur}"]`);
    if (radio) radio.checked = true;
    const tags = row.tags_json || {};
    Object.keys(tags).forEach(tag => {
      const input = menu.querySelector(`input[name="${safeName(tag)}"]`);
      if (input) input.checked = !!tags[tag];
    });
    menuStatus(menu, 'Imported schedule item loaded. Change tags or text, then Commit to Schedule to overwrite that exact day/time range.');
    repositionMenu(menu);
  }
  function ensureCommitButton(menu) {
    if (!menu) return;
    ensureCommitMenuStyles();
    if (menu.querySelector('#wnmuCommitProgramBtn')) {
      prefillCommitted(menu);
      repositionMenu(menu);
      return;
    }
    const form = menu.querySelector('#wnmuCellForm') || menu.querySelector('form') || menu;
    const actions = document.createElement('div');
    actions.className = 'rect-actions wnmu-commit-actions';
    actions.innerHTML = '<button type="button" class="btn ghost" id="wnmuCommitProgramBtn">Commit to Schedule</button><button type="button" class="btn ghost" id="wnmuRemoveCommittedProgramBtn" hidden>Remove committed program</button>';
    const text = menu.querySelector('#wnmuCellText');
    const textHost = text ? (text.closest('.wnmu-cell-field, .wnmu-text-row, label, div') || text.parentElement) : null;
    if (textHost && textHost.parentElement) textHost.insertAdjacentElement('afterend', actions);
    else form.insertBefore(actions, form.firstChild || null);
    actions.querySelector('#wnmuCommitProgramBtn')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      commitFromMenu(menu);
    });
    actions.querySelector('#wnmuRemoveCommittedProgramBtn')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      removeFromMenu(menu);
    });
    prefillCommitted(menu);
    repositionMenu(menu);
  }
  function scheduleMenuEnsure(delay = 40) {
    window.setTimeout(() => {
      const menu = document.getElementById('wnmuCellMenu');
      if (menu && !menu.classList.contains('hidden')) {
        ensureCommitButton(menu);
        repositionMenu(menu);
      }
    }, delay);
  }

  function installMenuObserver() {
    if (state.menuObserverInstalled) return;
    state.menuObserverInstalled = true;

    const runBurst = () => {
      // Menu is reused and rebuilt in-place on right-click. Run a short burst
      // after actual openings, but do not run on checkbox clicks inside the menu.
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

    document.addEventListener('contextmenu', event => {
      if (event.target?.closest?.('.program-cell, .screen-week-grid td')) runBurst();
    }, true);

    window.addEventListener('resize', () => {
      const menu = document.getElementById('wnmuCellMenu');
      if (menu && !menu.classList.contains('hidden')) repositionMenu(menu);
    });

    window.addEventListener('wnmu:cell-menu-opened', runBurst);
    runBurst();
  }
  function tryHydrate() { const rk = readyKey(); if (!monthKey()) return; if (state.readyKey !== rk) { state.readyKey = rk; state.hydrated = false; state.committedRows = []; } if (state.hydrated) { cleanupLoadedRowsLocally('try-hydrate-local-followup'); return; } state.hydrated = true; loadTableOverrides().then(() => cleanupLoadedRowsLocally('table-load-local-followup')).catch(err => { state.tableAvailable = false; state.loadError = err.message || String(err); console.warn('Manual program override table load skipped.', err); }); }
  function start() { ensureCommitMenuStyles(); installStorageGuard(); installMenuObserver(); tryHydrate(); [120, 250, 500, 900, 1500, 3000, 6000, 10000].forEach(ms => window.setTimeout(() => { tryHydrate(); cleanupLoadedRowsLocally('startup-local-cleanup'); }, ms)); [1200, 3500, 7500, 12000].forEach(ms => window.setTimeout(() => scrubCommittedStaging('startup-scrub', true), ms)); window.addEventListener('wnmu:manual-program-overrides-refresh', () => { state.hydrated = false; tryHydrate(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
