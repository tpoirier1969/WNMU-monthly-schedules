(function () {
  'use strict';

  const VERSION = 'v1.5.2-one-menu-stable-target-save';
  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  const SATELLITE_KEY = 'satelliteFeed';
  const TAG_FALLBACK = {
    newSeries: { label: 'New Series', color: '#fff2a8' },
    highlight: { label: 'Highlight', color: '#b9dcff' },
    oneOff: { label: 'One Off', color: '#ffd9b5' },
    monthlyTopic: { label: 'Monthly topic', color: '#d7c4ff' },
    fundraiser: { label: 'Fundraiser', color: '#ffc7d1' },
    programmersChoice: { label: "Programmer's Choice", color: '#c9f4d2' },
    holiday: { label: 'Holiday', color: '#fde2e2' },
    noteworthy: { label: 'Noteworthy', color: '#fff0bd' },
    educational: { label: 'Educational', color: '#cce7ff' },
    local: { label: 'Local', color: '#d6f5d6' },
    michigan: { label: 'Michigan', color: '#d5e8ff' },
    arts: { label: 'Arts', color: '#ead9ff' },
    satelliteFeed: { label: 'Satellite Feed', color: '#e6e6e6' }
  };

  let selectedTarget = null;
  let readyWaits = 0;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function channelCode() { return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1'); }
  function monthKey() {
    return (window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey) || new URLSearchParams(location.search).get('month') || '';
  }
  function storageKey() { return cfg().storageKey || ''; }
  function canonicalStoreKey() { const base = storageKey(); return base ? `${base}::cellOverrides.v1.5.0` : ''; }
  function manualMetaKey() { const base = storageKey(); return base ? `${base}::manualRectMeta.v1.4.17` : ''; }
  function oldBlankStoreKeys() {
    const base = storageKey();
    return base ? [
      `${base}::blankSlotMarks.v1.4.30`, `${base}::blankSlotMarks.v1.4.29`, `${base}::blankSlotMarks.v1.4.28`,
      `${base}::blankSlotSatelliteOverrides.v1.4.28`, `${base}::blankSlotSatelliteOverrides.v1.4.26`
    ] : [];
  }

  function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function css(value) { return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'); }
  function readJson(key, fallback) { try { const raw = key && localStorage.getItem(key); if (!raw) return fallback; const parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' ? parsed : fallback; } catch { return fallback; } }
  function writeJson(key, value) { if (key) localStorage.setItem(key, JSON.stringify(value || {})); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function slotToTime(slot) { const h = Math.floor(slot / 2); return `${pad(h)}:${slot % 2 ? '30' : '00'}`; }
  function timeToSlot(time) { const m = String(time || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return -1; return Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0); }
  function nearestDuration(value) { const n = Number(value) || 30; return DURATIONS.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, DURATIONS[0]); }
  function makeKey(date, time) { const m = monthKey() || String(date || '').slice(0, 7); return `${channelCode()}__${m}__${date}__${time}`; }
  function parseEntryId(entryId) { const m = String(entryId || '').match(/^(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})__/); return m ? { date: m[1], time: m[2] } : null; }

  function parseMonthDay(label, fallbackYear) {
    const months = { jan:'01', january:'01', feb:'02', february:'02', mar:'03', march:'03', apr:'04', april:'04', may:'05', jun:'06', june:'06', jul:'07', july:'07', aug:'08', august:'08', sep:'09', sept:'09', september:'09', oct:'10', october:'10', nov:'11', november:'11', dec:'12', december:'12' };
    const m = String(label || '').trim().toLowerCase().replace(/,/g, '').match(/^([a-z]+)\s+(\d{1,2})$/);
    return m && months[m[1]] ? `${fallbackYear}-${months[m[1]]}-${pad(Number(m[2]))}` : '';
  }
  function currentYear() { return Number(String(monthKey() || '').split('-')[0]) || new Date().getFullYear(); }
  function headerDates(table) {
    const year = currentYear();
    return Array.from(table.querySelectorAll('thead th:not(.time-col)')).map(th => {
      const lines = (th.innerText || th.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
      return parseMonthDay(lines[lines.length - 1] || '', year);
    });
  }
  function tagOrderBase() {
    const list = Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : Object.keys(TAG_FALLBACK).filter(k => k !== SATELLITE_KEY);
    if (channelCode() === '13.3') return list.filter(tag => tag !== 'michigan');
    if (channelCode() === '13.1') return list.filter(tag => tag !== 'arts');
    return list;
  }
  function allMenuTags() { return [...tagOrderBase(), SATELLITE_KEY]; }
  function tagMeta(tag) { return (cfg().tagMeta && cfg().tagMeta[tag]) || TAG_FALLBACK[tag] || { label: tag, color: '#ddd' }; }
  function tagClassName(tag) { return `check-${String(tag).replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`; }

  function dateTimeFromBlankCell(cell) {
    if (!cell) return null;
    if (cell.dataset.wnmuDate && cell.dataset.wnmuTime) return { date: cell.dataset.wnmuDate, time: cell.dataset.wnmuTime };
    if (cell.dataset.blankDate && cell.dataset.blankTime) return { date: cell.dataset.blankDate, time: cell.dataset.blankTime };
    const table = cell.closest('table.screen-week-grid');
    const row = cell.closest('tr');
    if (!table || !row) return null;
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const rowIndex = rows.indexOf(row);
    if (rowIndex < 0) return null;
    const dates = headerDates(table);
    const cellRect = cell.getBoundingClientRect();
    const center = cellRect.left + cellRect.width / 2;
    const headers = Array.from(table.querySelectorAll('thead th:not(.time-col)'));
    let bestIndex = -1, bestDistance = Infinity;
    headers.forEach((th, idx) => {
      const r = th.getBoundingClientRect();
      const dist = Math.abs((r.left + r.width / 2) - center);
      if (dist < bestDistance) { bestDistance = dist; bestIndex = idx; }
    });
    const date = dates[bestIndex];
    return date ? { date, time: slotToTime(rowIndex) } : null;
  }

  function clickedProgramDateTime(cell, event) {
    const parsed = parseEntryId(cell?.dataset?.entryId || '');
    if (!parsed) return null;
    const span = Math.max(1, Number(cell.rowSpan || cell.getAttribute('rowspan') || 1));
    if (!event || span <= 1) return parsed;
    const rect = cell.getBoundingClientRect();
    const slotH = Math.max(1, rect.height / span);
    const offset = Math.max(0, Math.min(span - 1, Math.floor((event.clientY - rect.top) / slotH)));
    const startSlot = timeToSlot(parsed.time);
    if (startSlot < 0) return parsed;
    return { date: parsed.date, time: slotToTime(startSlot + offset) };
  }

  function targetFromCell(cell, event) {
    if (!cell || !cell.classList.contains('program-cell') || cell.classList.contains('outside')) return null;
    let dateTime = null, sourceType = 'blank', entryId = '';
    if (cell.dataset.entryId) { entryId = cell.dataset.entryId; dateTime = clickedProgramDateTime(cell, event); sourceType = 'program'; }
    else { dateTime = dateTimeFromBlankCell(cell); }
    if (!dateTime || !dateTime.date || !dateTime.time) return null;
    const key = makeKey(dateTime.date, dateTime.time);
    cell.dataset.wnmuCellKey = key; cell.dataset.wnmuDate = dateTime.date; cell.dataset.wnmuTime = dateTime.time;
    return { key, date: dateTime.date, time: dateTime.time, cell, entryId, sourceType };
  }

  function cellForDayInRow(row, dayIndex) {
    const cells = Array.from(row.children).filter(td => !td.classList.contains('time-col'));
    if (!cells.length) return null;
    const headers = Array.from(row.closest('table')?.querySelectorAll('thead th:not(.time-col)') || []);
    const headerRect = headers[dayIndex]?.getBoundingClientRect();
    if (!headerRect) return cells[dayIndex] || null;
    const center = headerRect.left + headerRect.width / 2;
    let best = null, dist = Infinity;
    cells.forEach(cell => { const r = cell.getBoundingClientRect(); const d = Math.abs((r.left + r.width / 2) - center); if (d < dist) { dist = d; best = cell; } });
    return best;
  }
  function targetForDateTime(date, time) {
    const mk = makeKey(date, time);
    const programCell = document.querySelector(`.program-cell[data-entry-id^="${css(`${date}__${time}__`)}"]`);
    if (programCell) return targetFromCell(programCell);
    const slot = timeToSlot(time);
    if (slot < 0) return null;
    for (const table of Array.from(document.querySelectorAll('table.screen-week-grid'))) {
      const dayIndex = headerDates(table).indexOf(date);
      if (dayIndex < 0) continue;
      const row = Array.from(table.querySelectorAll('tbody tr'))[slot];
      if (!row) continue;
      const cell = cellForDayInRow(row, dayIndex);
      if (!cell || cell.classList.contains('outside')) continue;
      const target = targetFromCell(cell);
      if (target && target.key === mk) return target;
      if (target && target.cell?.dataset?.entryId) {
        // The requested time may sit inside a row-spanned program cell. Keep the visible cell, but target the requested airtime.
        return { ...target, key: mk, date, time };
      }
    }
    return null;
  }
  function targetFromMenu(menu) {
    const key = menu?.dataset.wnmuCellKey || '';
    if (selectedTarget && selectedTarget.key === key) return selectedTarget;
    const date = menu?.dataset.wnmuDate || '';
    const time = menu?.dataset.wnmuTime || '';
    if (date && time) return targetForDateTime(date, time) || selectedTarget;
    return selectedTarget;
  }

  function readCanonicalStore() { return readJson(canonicalStoreKey(), {}); }
  function readCanonicalRecord(key) { const rec = readCanonicalStore()[key]; return rec && typeof rec === 'object' ? rec : null; }
  function readBaseRecord(key) { const rec = readJson(storageKey(), {})[key]; return rec && typeof rec === 'object' ? rec : null; }
  function canonicalFromBase(target) {
    const base = readBaseRecord(target.key);
    if (!base || !base.cellOverrideV15) return null;
    if (base.cleared) return { cleared: true };
    return { text: base.text || base.rectNote?.text || '', durationMin: base.durationMin || base.rectNote?.durationMin || 30, tags: base.tags || {}, canonical: true, baseCanonical: true };
  }
  function writeCanonicalRecord(target, note) {
    const duration = nearestDuration(note.durationMin || 30);
    const cleanTags = note.tags || {};
    const record = { channelCode: channelCode(), monthKey: monthKey() || target.date.slice(0, 7), date: target.date, time: target.time, sourceType: target.sourceType, sourceEntryId: target.entryId || '', text: note.text || '', durationMin: duration, tags: cleanTags, cleared: !!note.cleared, updatedAt: new Date().toISOString() };
    const store = readCanonicalStore();
    store[target.key] = record;
    writeJson(canonicalStoreKey(), store);

    // Also mirror into the main marks object so the existing Supabase sync sees the save.
    const mainKey = storageKey();
    if (mainKey) {
      const main = readJson(mainKey, {});
      main[target.key] = { cellOverrideV15: true, ...record, rectNote: record.cleared ? null : { x: 4, y: 4, w: 92, h: 92, text: record.text, durationMin: duration, anchor: 'left' }, tags: cleanTags };
      if (target.entryId) {
        const existing = main[target.entryId] && typeof main[target.entryId] === 'object' ? main[target.entryId] : {};
        main[target.entryId] = { ...existing, tags: { ...(existing.tags || {}), ...cleanTags }, rectNote: record.cleared ? null : { x: 4, y: 4, w: 92, h: 92, text: record.text, durationMin: duration, anchor: 'left', cellOverrideV15: true } };
      }
      writeJson(mainKey, main);
    }
  }

  function legacyProgramNote(target) {
    if (!target || !target.date || !target.time || !storageKey()) return null;
    const marks = readJson(storageKey(), {}), meta = readJson(manualMetaKey(), {});
    const ids = [];
    if (target.entryId) ids.push(target.entryId);
    const prefix = `${target.date}__${target.time}__`;
    Object.keys(marks).forEach(key => { if (key.startsWith(prefix) && !ids.includes(key)) ids.push(key); });
    for (const entryId of ids) {
      const item = marks[entryId];
      const rect = item && typeof item === 'object' ? item.rectNote : null;
      if (!rect || typeof rect !== 'object') continue;
      const extra = meta[entryId] && typeof meta[entryId] === 'object' ? meta[entryId] : {};
      return { text: rect.text || item.text || '', durationMin: nearestDuration(extra.durationMin || rect.durationMin || Math.max(1, Number(target.cell?.rowSpan || 1)) * 30), tags: item.tags || {}, legacy: 'program', legacyEntryId: entryId };
    }
    return null;
  }
  function legacyBlankNote(target) {
    if (!target || !target.date || !target.time) return null;
    const oldKey = `${channelCode()}__${target.date}__${target.time}__blank-slot`;
    for (const key of oldBlankStoreKeys()) {
      const mark = readJson(key, {})[oldKey];
      if (mark && typeof mark === 'object' && mark.rectNote && mark.rectNote.text) return { text: mark.rectNote.text || '', durationMin: nearestDuration(mark.rectNote.durationMin || 30), tags: mark.tags || {}, satelliteFeed: mark.satelliteFeed, legacy: 'blank' };
    }
    return null;
  }
  function readEffectiveNote(target) {
    if (!target) return null;
    const canon = readCanonicalRecord(target.key) || canonicalFromBase(target);
    if (canon) return canon.cleared ? null : { text: canon.text || '', durationMin: nearestDuration(canon.durationMin || 30), tags: canon.tags || {}, canonical: true };
    return legacyBlankNote(target) || legacyProgramNote(target);
  }

  function readTagsFromMenu(menu) {
    const tags = {};
    allMenuTags().forEach(tag => { const input = menu?.querySelector(`input[name="${css(tag)}"]`); if (input?.checked) tags[tag] = true; });
    return tags;
  }
  function ensureOverlayLayer() { let layer = document.getElementById('wnmuCellOverrideLayer'); if (!layer) { layer = document.createElement('div'); layer.id = 'wnmuCellOverrideLayer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); } return layer; }

  function durationHeightFromRows(cell, durationMin) {
    const table = cell.closest('table.screen-week-grid'), row = cell.closest('tr');
    if (!table || !row) return Math.max(22, cell.getBoundingClientRect().height - 4);
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const startIndex = rows.indexOf(row);
    if (startIndex < 0) return Math.max(22, cell.getBoundingClientRect().height - 4);
    const slots = Math.max(1, Math.round(nearestDuration(durationMin) / 30));
    const startRect = rows[startIndex]?.getBoundingClientRect();
    if (startRect && rows[startIndex + slots]) return Math.max(22, rows[startIndex + slots].getBoundingClientRect().top - startRect.top - 4);
    const nextRect = rows[startIndex + 1]?.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const rowHeight = nextRect && startRect ? Math.max(16, nextRect.top - startRect.top) : Math.max(18, cellRect.height / Math.max(1, Number(cell.rowSpan || 1)));
    return Math.max(22, rowHeight * slots - 4);
  }
  function cellVisualTopForTarget(target) {
    const rect = target.cell.getBoundingClientRect();
    const start = parseEntryId(target.entryId || '') || { time: target.time };
    const delta = Math.max(0, timeToSlot(target.time) - timeToSlot(start.time));
    const span = Math.max(1, Number(target.cell.rowSpan || target.cell.getAttribute('rowspan') || 1));
    const slotH = rect.height / span;
    return rect.top + Math.min(delta, span - 1) * slotH;
  }
  function paintOverlay(target, note) {
    if (!target?.cell) return;
    const layer = ensureOverlayLayer();
    layer.querySelectorAll(`[data-wnmu-cell-key="${css(target.key)}"]`).forEach(el => el.remove());
    target.cell.classList.remove('wnmu-has-cell-override');
    if (!note || !(note.text || Object.values(note.tags || {}).some(Boolean))) return;
    const rect = target.cell.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    target.cell.classList.add('wnmu-has-cell-override');
    const box = document.createElement('div');
    box.className = 'wnmu-cell-override-box';
    box.dataset.wnmuCellKey = target.key;
    box.style.left = `${window.scrollX + rect.left + 4}px`;
    box.style.top = `${window.scrollY + cellVisualTopForTarget(target) + 2}px`;
    box.style.width = `${Math.max(44, rect.width - 8)}px`;
    box.style.height = `${durationHeightFromRows(target.cell, note.durationMin)}px`;
    const tags = Object.keys(note.tags || {}).filter(tag => note.tags[tag]);
    const pills = tags.length ? `<div class="wnmu-cell-override-tags">${tags.map(tag => `<span>${esc(tagMeta(tag).label || tag)}</span>`).join('')}</div>` : '';
    const text = note.text ? `<div class="wnmu-cell-override-text">${esc(note.text)}</div>` : '';
    box.innerHTML = `${pills}${text}<div class="wnmu-cell-override-duration">${nearestDuration(note.durationMin || 30)} min</div>`;
    layer.appendChild(box);
  }
  function removeOverlay(target) { if (!target) return; ensureOverlayLayer().querySelectorAll(`[data-wnmu-cell-key="${css(target.key)}"]`).forEach(el => el.remove()); target.cell?.classList.remove('wnmu-has-cell-override'); }
  function buildDurationRadios(selected, name) { const chosen = nearestDuration(selected || 30); return DURATIONS.map(min => `<label class="wnmu-cell-pill"><input type="radio" name="${name}" value="${min}" ${min === chosen ? 'checked' : ''}><span>${min}</span></label>`).join(''); }
  function cellTitle(target) { return target?.cell?.querySelector?.('.program-title')?.textContent?.trim() || (target?.sourceType === 'program' ? 'Scheduled program cell' : 'Blank schedule cell'); }

  function cellMenuHtml(target, note) {
    const tags = { ...(note?.tags || {}) };
    if (note?.satelliteFeed) tags[SATELLITE_KEY] = true;
    const tagRows = allMenuTags().map(tag => `<label class="check-row ${esc(tagClassName(tag))}"><input type="checkbox" name="${esc(tag)}" ${tags[tag] ? 'checked' : ''}> <span>${esc(tagMeta(tag).label || tag)}</span></label>`).join('');
    const typeLabel = target.sourceType === 'program' ? `Program: ${cellTitle(target)}` : 'Blank schedule slot';
    const noteSource = note?.canonical ? 'saved v1.5 note' : (note?.legacy ? `older ${note.legacy} note` : 'no saved note yet');
    const defaultDuration = note?.durationMin || Math.max(30, Number(target.cell?.rowSpan || 1) * 30);
    return `<div class="context-menu-head"><div><h3>Schedule cell note</h3><div class="context-menu-meta">${esc(typeLabel)} • ${esc(target.date)} • ${esc(target.time)} • ${esc(noteSource)}</div></div><button type="button" class="menu-close" id="wnmuCellCloseBtn" aria-label="Close">×</button></div><form class="wnmu-cell-form" id="wnmuCellForm"><div class="wnmu-cell-tag-grid">${tagRows}</div><fieldset class="wnmu-cell-note-tools"><legend>White override box</legend><div class="manual-rect-label">Box length</div><div class="wnmu-cell-duration-options">${buildDurationRadios(defaultDuration, 'wnmuCellDuration')}</div><label class="manual-rect-label" for="wnmuCellText">Box note text</label><textarea id="wnmuCellText" class="manual-rect-text" rows="3" placeholder="Type what should show in this schedule slot">${esc(note?.text || '')}</textarea><div class="manual-rect-help">This note belongs to the date/time cell, so it can override a last-minute schedule change without depending on the old program title.</div></fieldset><div class="rect-actions"><button type="button" class="btn ghost" id="wnmuCellSaveBtn">Save box note</button><button type="button" class="btn ghost" id="wnmuCellClearBtn">Clear box note</button></div><div id="wnmuCellStatus" class="blank-save-status" aria-live="polite"></div></form>`;
  }
  function ensureCellMenu() { let menu = document.getElementById('wnmuCellMenu'); if (!menu) { menu = document.createElement('aside'); menu.id = 'wnmuCellMenu'; menu.className = 'context-menu hidden wnmu-cell-menu'; menu.setAttribute('aria-hidden', 'true'); document.body.appendChild(menu); } return menu; }
  function positionMenu(menu, x, y) { menu.classList.remove('hidden'); menu.setAttribute('aria-hidden', 'false'); menu.style.left = '0px'; menu.style.top = '0px'; const r = menu.getBoundingClientRect(); menu.style.left = `${Math.max(12, Math.min(x, window.innerWidth - r.width - 12))}px`; menu.style.top = `${Math.max(12, Math.min(y, window.innerHeight - r.height - 12))}px`; }
  function hideCellMenu() { const menu = document.getElementById('wnmuCellMenu'); if (menu) { menu.classList.add('hidden'); menu.setAttribute('aria-hidden', 'true'); } }
  function hideOldContextMenu() { const old = document.getElementById('contextMenu'); if (old) { old.classList.add('hidden'); old.setAttribute('aria-hidden', 'true'); old.style.zIndex = '1'; } }
  function openCellMenu(target, event) {
    selectedTarget = target; hideOldContextMenu();
    const menu = ensureCellMenu();
    const note = readEffectiveNote(target) || { text: '', durationMin: Math.max(30, Number(target.cell?.rowSpan || 1) * 30), tags: {} };
    menu.dataset.wnmuCellKey = target.key; menu.dataset.wnmuDate = target.date; menu.dataset.wnmuTime = target.time;
    menu.innerHTML = cellMenuHtml(target, note);
    menu.querySelector('#wnmuCellCloseBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); hideCellMenu(); });
    menu.querySelector('#wnmuCellSaveBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); saveFromCellMenu(); });
    menu.querySelector('#wnmuCellClearBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); clearFromCellMenu(); });
    positionMenu(menu, event.clientX, event.clientY);
  }
  function saveFromCellMenu() {
    const menu = document.getElementById('wnmuCellMenu');
    const target = targetFromMenu(menu);
    if (!target) { const status = menu?.querySelector('#wnmuCellStatus'); if (status) status.textContent = 'No schedule cell selected. Right-click the cell again.'; return false; }
    selectedTarget = target;
    const text = String(menu?.querySelector('#wnmuCellText')?.value || '').trim();
    const duration = nearestDuration(menu?.querySelector('input[name="wnmuCellDuration"]:checked')?.value || Math.max(30, Number(target.cell?.rowSpan || 1) * 30));
    const tags = readTagsFromMenu(menu);
    try {
      writeCanonicalRecord(target, { text, durationMin: duration, tags });
      const reread = readEffectiveNote(target);
      paintOverlay(target, { text, durationMin: duration, tags });
      window.WNMU_LAST_CELL_NOTE_SAVE = { target: { key: target.key, date: target.date, time: target.time, entryId: target.entryId || '', sourceType: target.sourceType }, text, durationMin: duration, tags, reread, savedAt: new Date().toISOString() };
      const status = menu?.querySelector('#wnmuCellStatus'); if (status) status.textContent = reread ? 'Box note saved.' : 'Save wrote, but readback did not find the note.';
      return true;
    } catch (err) {
      const status = menu?.querySelector('#wnmuCellStatus'); if (status) status.textContent = `Save failed: ${err.message || err}`;
      console.error('WNMU cell note save failed', err);
      return false;
    }
  }
  function clearFromCellMenu() {
    const menu = document.getElementById('wnmuCellMenu'); const target = targetFromMenu(menu); if (!target) return;
    selectedTarget = target; writeCanonicalRecord(target, { text: '', durationMin: 30, tags: {}, cleared: true }); removeOverlay(target);
    const status = menu?.querySelector('#wnmuCellStatus'); if (status) status.textContent = 'Box note cleared.';
  }

  function restoreVisibleNotes() {
    if (!storageKey() || !document.querySelector('table.screen-week-grid')) return false;
    Object.values(readCanonicalStore()).forEach(rec => { if (!rec || rec.cleared || rec.channelCode !== channelCode()) return; if (rec.monthKey && monthKey() && rec.monthKey !== monthKey()) return; const target = targetForDateTime(rec.date, rec.time); if (target) paintOverlay(target, rec); });
    const main = readJson(storageKey(), {});
    Object.entries(main).forEach(([key, item]) => {
      if (!item || typeof item !== 'object') return;
      if (item.cellOverrideV15 && item.date && item.time && !item.cleared) { const target = targetForDateTime(item.date, item.time); if (target && !readCanonicalRecord(target.key)) paintOverlay(target, item); return; }
      if (!item.rectNote) return; const dt = parseEntryId(key); if (!dt) return; const target = targetForDateTime(dt.date, dt.time); if (!target || readCanonicalRecord(target.key)) return; const note = legacyProgramNote(target); if (note) paintOverlay(target, note);
    });
    oldBlankStoreKeys().forEach(storeKey => { const store = readJson(storeKey, {}); Object.entries(store).forEach(([oldKey, mark]) => { if (!mark?.rectNote?.text) return; const m = String(oldKey).match(/^(13\.1|13\.3)__(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})__blank-slot$/); if (!m || m[1] !== channelCode()) return; const target = targetForDateTime(m[2], m[3]); if (!target || readCanonicalRecord(target.key)) return; paintOverlay(target, { text: mark.rectNote.text, durationMin: mark.rectNote.durationMin || 30, tags: { ...(mark.tags || {}), ...(mark.satelliteFeed ? { [SATELLITE_KEY]: true } : {}) } }); }); });
    return true;
  }
  function waitForReadyThenRestore() {
    if (restoreVisibleNotes()) {
      window.setTimeout(restoreVisibleNotes, 1800);
      window.setTimeout(restoreVisibleNotes, 4200);
      return;
    }
    readyWaits += 1;
    if (readyWaits < 40) window.setTimeout(waitForReadyThenRestore, 250);
  }

  function injectStyles() {
    if (document.getElementById('wnmuCellInteractionsV152Styles')) return;
    const style = document.createElement('style'); style.id = 'wnmuCellInteractionsV152Styles';
    style.textContent = `#wnmuCellOverrideLayer{position:absolute;left:0;top:0;width:0;height:0;z-index:2147481000;pointer-events:none}.wnmu-cell-override-box{position:absolute;box-sizing:border-box;background:rgba(255,255,255,.96);border:2px solid rgba(12,18,32,.86);color:#111;border-radius:4px;box-shadow:0 2px 7px rgba(0,0,0,.22);padding:5px 6px 16px;overflow:hidden;font:12px/1.22 system-ui,sans-serif;pointer-events:none}.wnmu-cell-override-text{white-space:normal;overflow:hidden;font-weight:700}.wnmu-cell-override-tags{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:3px}.wnmu-cell-override-tags span{display:inline-flex;align-items:center;border:1px solid rgba(0,0,0,.25);border-radius:999px;padding:1px 5px;font-size:9px;font-weight:800;background:rgba(255,255,255,.72)}.wnmu-cell-override-duration{position:absolute;right:4px;bottom:2px;font-size:9px;opacity:.62}.program-cell.wnmu-has-cell-override>.draw-rect-note,.program-cell.wnmu-has-cell-override>.wnmu-blank-slot-content{display:none!important}#contextMenu{z-index:1}#wnmuCellMenu.wnmu-cell-menu{position:fixed;z-index:2147483600!important;min-width:400px;max-width:470px}.wnmu-cell-form{display:block}.wnmu-cell-tag-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}.wnmu-cell-tag-grid .check-row{min-height:39px;margin:0;box-sizing:border-box;display:flex;align-items:center;gap:8px;border-radius:9px}.wnmu-cell-note-tools{border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:10px;margin:10px 0;background:rgba(255,255,255,.06)}.wnmu-cell-note-tools legend{font-weight:800}.wnmu-cell-duration-options{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0 8px}.wnmu-cell-pill{display:inline-flex;align-items:center;gap:3px;font-size:12px;border:1px solid rgba(255,255,255,.24);border-radius:999px;padding:4px 7px;cursor:pointer}.wnmu-cell-pill input{margin:0}.manual-rect-text{width:100%;box-sizing:border-box;border-radius:8px;border:1px solid rgba(255,255,255,.28);padding:7px;resize:vertical;font:13px/1.3 system-ui,sans-serif;color:#111;background:#fff}.manual-rect-label{font-size:12px;font-weight:800;margin:6px 0 5px}.manual-rect-help{margin-top:6px;font-size:11px;opacity:.75;line-height:1.25}@media print{#wnmuCellOverrideLayer{display:none!important}}`;
    document.head.appendChild(style);
  }
  function installHandlers() {
    document.addEventListener('contextmenu', event => { const cell = event.target.closest?.('.program-cell'); if (!cell || cell.classList.contains('outside')) return; const target = targetFromCell(cell, event); if (!target) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); openCellMenu(target, event); }, true);
    document.addEventListener('click', event => { const menu = document.getElementById('wnmuCellMenu'); if (!menu || menu.classList.contains('hidden')) return; if (menu.contains(event.target)) return; hideCellMenu(); }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideCellMenu(); });
  }
  function start() { injectStyles(); installHandlers(); ensureOverlayLayer(); window.WNMU_CELL_INTERACTIONS_VERSION = VERSION; window.setTimeout(waitForReadyThenRestore, 450); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
