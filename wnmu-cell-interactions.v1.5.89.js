(function () {
  'use strict';

  const VERSION = 'v1.5.89-cell-menu-single-source-tag-state';
  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  const SATELLITE_KEY = 'satelliteFeed';
  const OTHER_KEY = 'other';
  const TAG_FALLBACK = {
    newSeries: { label: 'New Series', color: '#fff2a8' },
    highlight: { label: 'Highlight', color: '#ff9f1c' },
    oneOff: { label: 'One Off', color: '#ffd9b5' },
    monthlyTopic: { label: 'Monthly topic', color: '#d7c4ff' },
    other: { label: 'Custom', color: '#f3eef7' },
    fundraiser: { label: 'Fundraiser', color: '#ff4d5a' },
    programmersChoice: { label: "Programmer's Choice", color: '#c9f4d2' },
    holiday: { label: 'Holiday', color: '#fde2e2' },
    educational: { label: 'Educational', color: '#cce7ff' },
    local: { label: 'Local', color: '#d6f5d6' },
    michigan: { label: 'Michigan', color: '#d5e8ff' },
    arts: { label: 'Arts', color: '#ead9ff' },
    satelliteFeed: { label: 'PBS Feed', color: '#e6e6e6' }
  };

  let selectedTarget = null;
  let readyWaits = 0;
  let relayoutTimer = 0;

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
    const source = Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : Object.keys(TAG_FALLBACK);
    let list = source.filter(Boolean);
    if (!list.includes('highlight')) list.unshift('highlight');
    if (!list.includes(SATELLITE_KEY)) list.splice(Math.min(1, list.length), 0, SATELLITE_KEY);
    if (channelCode() === '13.3') list = list.filter(tag => tag !== 'michigan');
    if (channelCode() === '13.1') list = list.filter(tag => tag !== 'arts');
    // The custom tag is an internal storage key. The menu shows a text editor and
    // the grid renders the typed text, never the literal fallback label "Custom".
    if (!list.includes(OTHER_KEY)) list.splice(Math.min(5, list.length), 0, OTHER_KEY);
    return Array.from(new Set(list));
  }
  function allMenuTags() { return tagOrderBase(); }
  function tagMeta(tag) { return (cfg().tagMeta && cfg().tagMeta[tag]) || TAG_FALLBACK[tag] || { label: tag, color: '#ddd' }; }
  function tagClassName(tag) { return `check-${String(tag).replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`; }
  function cleanOtherLabel(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 64); }
  function tagDisplayLabel(tag, otherLabel = '') {
    if (tag === OTHER_KEY) return cleanOtherLabel(otherLabel);
    return tagMeta(tag).label || tag;
  }
  function customTagInput(menu) { return menu?.querySelector?.('[data-wnmu-custom-tag-input], #wnmuCellCustomTagText, #wnmuProgramCustomTagText') || null; }
  function readCustomOtherLabelFromMenu(menu) { return cleanOtherLabel(customTagInput(menu)?.value || menu?.dataset?.wnmuOtherLabel || ''); }
  function customTagEditIsActive(menu) { const input = customTagInput(menu); return !!(input && document.activeElement === input); }
  function satelliteApi() { return window.WNMU_SATELLITE_FEED_API || null; }
  function effectiveSatelliteForTarget(target) {
    const entryId = target?.entryId || target?.cell?.dataset?.entryId || '';
    if (!entryId) return false;
    try { return !!satelliteApi()?.effectiveSatellite?.(entryId, target.cell); } catch { return false; }
  }
  function setSatelliteForTarget(target, checked) {
    const entryId = target?.entryId || target?.cell?.dataset?.entryId || '';
    if (!entryId) return false;
    try {
      if (satelliteApi()?.setOverride) {
        satelliteApi().setOverride(entryId, !!checked);
        return true;
      }
    } catch (err) { console.warn('PBS Feed override failed.', err); }
    return false;
  }
  function repaintSatelliteFeedsSoon(delay = 20) {
    window.setTimeout(() => {
      try {
        if (satelliteApi()?.repaint) satelliteApi().repaint();
        else if (window.WNMU_REPAINT_SATELLITE_FEEDS) window.WNMU_REPAINT_SATELLITE_FEEDS();
      } catch {}
    }, delay);
  }
  function updateOtherMenuLabel(menu, otherLabel = '', options = {}) {
    const clean = cleanOtherLabel(otherLabel);
    if (menu) menu.dataset.wnmuOtherLabel = clean;
    const input = customTagInput(menu);
    // Do not let background populate/repaint replace text while the user is typing.
    if (input && input.value !== clean && (options.force || !customTagEditIsActive(menu))) input.value = clean;
  }


  function noteOtherLabel(note) {
    return cleanOtherLabel(note?.otherLabel || note?.planningOtherLabel || note?.customPlanningLabel || note?.customTagLabel || note?.otherText || note?.rectNote?.otherLabel || note?.rectNote?.planningOtherLabel || '');
  }

  function normalizeNoteForDisplay(note) {
    if (!note || typeof note !== 'object') return null;
    const otherLabel = noteOtherLabel(note);
    const tags = normalizeTagsForStorage(note.tags || {});
    if (otherLabel) tags[OTHER_KEY] = true;
    return { ...note, tags, otherLabel, planningOtherLabel: otherLabel, customPlanningLabel: otherLabel, customTagLabel: otherLabel };
  }

  function normalizeTagsForExplicitStorage(tags, otherLabel = '') {
    const out = {};
    allMenuTags().forEach(tag => {
      if (tag === SATELLITE_KEY) return;
      if (tag === OTHER_KEY) out[tag] = !!cleanOtherLabel(otherLabel);
      else out[tag] = !!(tags && tags[tag]);
    });
    return out;
  }

  function hasAnyExplicitTagState(tags) {
    if (!tags || typeof tags !== 'object') return false;
    return allMenuTags().some(tag => tag !== SATELLITE_KEY && typeof tags[tag] === 'boolean');
  }

  function labelToTagMap() {
    const out = {};
    Object.entries(cfg().tagMeta || {}).forEach(([tag, meta]) => {
      const label = String(meta?.label || tag).trim();
      if (label && tag !== SATELLITE_KEY) out[label] = tag;
    });
    Object.entries(TAG_FALLBACK).forEach(([tag, meta]) => {
      const label = String(meta?.label || tag).trim();
      if (label && tag !== SATELLITE_KEY && !out[label]) out[label] = tag;
    });
    out['PBS Feed'] = SATELLITE_KEY;
    out['Satellite Feed'] = SATELLITE_KEY;
    return out;
  }

  function tagsFromVisiblePills(cell) {
    const map = labelToTagMap();
    const out = {};
    allMenuTags().forEach(tag => { if (tag !== SATELLITE_KEY) out[tag] = false; });
    Array.from(cell?.querySelectorAll?.('.tag-pill') || []).forEach(pill => {
      const custom = cleanOtherLabel(pill.getAttribute('data-wnmu-custom-tag-label') || '');
      if (custom) { out[OTHER_KEY] = true; return; }
      const label = cleanOtherLabel(pill.textContent || '');
      const tag = map[label];
      if (tag && tag !== SATELLITE_KEY) out[tag] = true;
    });
    return out;
  }

  function storedRecordForTarget(target) {
    const main = readJson(storageKey(), {});
    const ids = [];
    if (target?.entryId) ids.push(target.entryId);
    if (target?.key) ids.push(target.key);
    if (target?.date && target?.time) {
      const prefix = `${target.date}__${target.time}__`;
      Object.keys(main).forEach(key => { if (key.startsWith(prefix) && !ids.includes(key)) ids.push(key); });
    }
    for (const id of ids) {
      const rec = main[id];
      if (rec && typeof rec === 'object' && (rec.tags || rec.rectNote || rec.text || noteOtherLabel(rec))) return rec;
    }
    const canonical = target?.key ? readCanonicalRecord(target.key) : null;
    if (canonical) return canonical;
    return null;
  }

  function readEffectivePlanningState(target, note = null) {
    const explicit = storedRecordForTarget(target) || note || null;
    const otherLabel = cleanOtherLabel(noteOtherLabel(explicit) || noteOtherLabel(note));
    if (hasAnyExplicitTagState(explicit?.tags)) {
      const tags = normalizeTagsForExplicitStorage(explicit.tags || {}, otherLabel);
      if (otherLabel) tags[OTHER_KEY] = true;
      tags[SATELLITE_KEY] = effectiveSatelliteForTarget(target);
      return { tags, otherLabel, explicit: true };
    }

    let tags = null;
    try {
      const apiTags = window.WNMU_AUTO_TAG_HELPERS_API?.effectiveTagsForCell?.(target?.cell);
      if (apiTags && typeof apiTags === 'object') tags = normalizeTagsForExplicitStorage(apiTags, otherLabel);
    } catch {}
    if (!tags) tags = normalizeTagsForExplicitStorage(tagsFromVisiblePills(target?.cell), otherLabel);
    if (note?.tags && hasAnyExplicitTagState(note.tags)) tags = normalizeTagsForExplicitStorage(note.tags, otherLabel);
    if (otherLabel) tags[OTHER_KEY] = true;
    tags[SATELLITE_KEY] = effectiveSatelliteForTarget(target);
    return { tags, otherLabel, explicit: false };
  }

  function ensureProgramTagsWrap(cell) {
    const content = cell?.querySelector?.('.program-content') || cell;
    if (!content) return null;
    let wrap = content.querySelector?.(':scope > .program-tags');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'program-tags';
      content.appendChild(wrap);
    }
    return wrap;
  }

  function forceCustomTagDisplayForCell(cell, label) {
    if (!cell) return;
    const clean = cleanOtherLabel(label || cell.dataset?.wnmuOtherLabel || cell.dataset?.wnmuCustomPlanningTag || '');
    if (clean) {
      cell.dataset.wnmuOtherLabel = clean;
      cell.dataset.wnmuCustomPlanningTag = clean;
    } else {
      delete cell.dataset.wnmuOtherLabel;
      delete cell.dataset.wnmuCustomPlanningTag;
    }
    let found = false;
    const wraps = Array.from(cell.querySelectorAll?.('.program-tags') || []);
    wraps.forEach(wrap => {
      Array.from(wrap.querySelectorAll('.tag-pill')).forEach(pill => {
        const text = cleanOtherLabel(pill.textContent || '');
        const customAttr = cleanOtherLabel(pill.getAttribute('data-wnmu-custom-tag-label') || '');
        const isCustomPlaceholder = !!customAttr || text === 'Custom' || text === 'Other';
        if (!isCustomPlaceholder) return;
        if (!clean) { pill.remove(); return; }
        pill.textContent = clean;
        pill.setAttribute('data-wnmu-custom-tag-label', clean);
        pill.style.setProperty('--tag-color', tagMeta(OTHER_KEY).color || '#f3eef7');
        found = true;
      });
      if (!wrap.textContent.trim()) wrap.remove();
    });
    if (clean && !found) {
      const wrap = ensureProgramTagsWrap(cell);
      if (!wrap) return;
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = clean;
      pill.setAttribute('data-wnmu-custom-tag-label', clean);
      pill.style.setProperty('--tag-color', tagMeta(OTHER_KEY).color || '#f3eef7');
      wrap.appendChild(pill);
    }
  }

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
  function targetFromOverlayBox(box) {
    if (!box) return null;
    const key = box.dataset.wnmuCellKey || '';
    const date = box.dataset.wnmuDate || '';
    const time = box.dataset.wnmuTime || '';
    if (!key || !date || !time) return null;
    const target = targetForDateTime(date, time);
    if (!target) return { key, date, time, cell: null, entryId: '', sourceType: 'unknown' };
    target.key = key;
    target.date = date;
    target.time = time;
    target.sourceType = box.dataset.wnmuSourceType || target.sourceType || 'unknown';
    return target;
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
    return { text: base.text || base.rectNote?.text || '', durationMin: base.durationMin || base.rectNote?.durationMin || 30, tags: base.tags || {}, otherLabel: cleanOtherLabel(base.otherLabel || base.planningOtherLabel || base.customPlanningLabel || base.customTagLabel || base.otherText || ''), canonical: true, baseCanonical: true };
  }
  function writeCanonicalRecord(target, note) {
    const duration = nearestDuration(note.durationMin || 30);
    const otherLabel = cleanOtherLabel(note.otherLabel || note.planningOtherLabel || note.customPlanningLabel || note.customTagLabel || note.otherText || '');
    let cleanTags = normalizeTagsForExplicitStorage(note.tags || {}, otherLabel);
    const record = { channelCode: channelCode(), monthKey: monthKey() || target.date.slice(0, 7), date: target.date, time: target.time, sourceType: target.sourceType, sourceEntryId: target.entryId || '', text: note.text || '', durationMin: duration, tags: cleanTags, otherLabel, planningOtherLabel: otherLabel, customPlanningLabel: otherLabel, customTagLabel: otherLabel, cleared: !!note.cleared, updatedAt: new Date().toISOString() };
    const store = readCanonicalStore();
    store[target.key] = record;
    writeJson(canonicalStoreKey(), store);

    // Also mirror into the main marks object so the existing Supabase sync sees the save.
    const mainKey = storageKey();
    if (mainKey) {
      const main = readJson(mainKey, {});
      main[target.key] = { cellOverrideV15: true, ...record, rectNote: record.cleared ? null : { x: 4, y: 4, w: 92, h: 92, text: record.text, durationMin: duration, anchor: 'left', otherLabel, planningOtherLabel: otherLabel, customPlanningLabel: otherLabel, customTagLabel: otherLabel }, tags: cleanTags };
      if (target.entryId) {
        const existing = main[target.entryId] && typeof main[target.entryId] === 'object' ? main[target.entryId] : {};
        // Replace the tag state, do not merge. Merging is what made old wrong tags
        // such as Fundraiser impossible to clear from the new menu.
        main[target.entryId] = { ...existing, tags: cleanTags, otherLabel, planningOtherLabel: otherLabel, customPlanningLabel: otherLabel, customTagLabel: otherLabel, rectNote: record.cleared ? null : { x: 4, y: 4, w: 92, h: 92, text: record.text, durationMin: duration, anchor: 'left', cellOverrideV15: true, otherLabel, planningOtherLabel: otherLabel, customPlanningLabel: otherLabel, customTagLabel: otherLabel } };
      }
      writeJson(mainKey, main);
    }
  }

  function legacyProgramNote(target) {
    if (!target || !target.date || !target.time || !storageKey()) return null;
    const marks = readJson(storageKey(), {}), meta = readJson(manualMetaKey(), {});
    const ids = [];
    if (target.entryId) ids.push(target.entryId);
    if (target.key) ids.push(target.key);
    const prefix = `${target.date}__${target.time}__`;
    Object.keys(marks).forEach(key => { if (key.startsWith(prefix) && !ids.includes(key)) ids.push(key); });
    for (const entryId of ids) {
      const item = marks[entryId];
      if (!item || typeof item !== 'object') continue;
      const rect = item.rectNote && typeof item.rectNote === 'object' ? item.rectNote : null;
      const extra = meta[entryId] && typeof meta[entryId] === 'object' ? meta[entryId] : {};
      if (rect || item.tags || item.text || noteOtherLabel(item)) {
        return {
          text: rect?.text || item.text || '',
          durationMin: nearestDuration(extra.durationMin || rect?.durationMin || item.durationMin || Math.max(1, Number(target.cell?.rowSpan || 1)) * 30),
          tags: item.tags || {},
          otherLabel: noteOtherLabel(item),
          legacy: 'program',
          legacyEntryId: entryId
        };
      }
    }
    return null;
  }
  function legacyBlankNote(target) {
    if (!target || !target.date || !target.time) return null;
    const oldKey = `${channelCode()}__${target.date}__${target.time}__blank-slot`;
    for (const key of oldBlankStoreKeys()) {
      const mark = readJson(key, {})[oldKey];
      if (mark && typeof mark === 'object' && mark.rectNote && mark.rectNote.text) return { text: mark.rectNote.text || '', durationMin: nearestDuration(mark.rectNote.durationMin || 30), tags: mark.tags || {}, otherLabel: cleanOtherLabel(mark.otherLabel || mark.planningOtherLabel || mark.customPlanningLabel || mark.customTagLabel || mark.otherText || ''), satelliteFeed: mark.satelliteFeed, legacy: 'blank' };
    }
    return null;
  }
  function readEffectiveNote(target) {
    if (!target) return null;
    const canon = readCanonicalRecord(target.key) || canonicalFromBase(target);
    if (canon) return canon.cleared ? null : normalizeNoteForDisplay({ text: canon.text || '', durationMin: nearestDuration(canon.durationMin || 30), tags: canon.tags || {}, otherLabel: noteOtherLabel(canon), canonical: true });
    return normalizeNoteForDisplay(legacyBlankNote(target) || legacyProgramNote(target));
  }

  function readTagsFromMenu(menu) {
    const tags = {};
    allMenuTags().forEach(tag => {
      if (tag === OTHER_KEY) return;
      const input = menu?.querySelector(`input[name="${css(tag)}"]`);
      tags[tag] = !!input?.checked;
    });
    const customLabel = readCustomOtherLabelFromMenu(menu);
    tags[OTHER_KEY] = !!customLabel;
    return tags;
  }
  function explicitFalseTags() { const out = {}; allMenuTags().forEach(tag => { if (tag !== SATELLITE_KEY) out[tag] = false; }); return out; }
  function normalizeTagsForStorage(tags) {
    const out = {};
    allMenuTags().forEach(tag => {
      if (tag === SATELLITE_KEY) return;
      if (tags && tags[tag] === true) out[tag] = true;
    });
    return out;
  }
  function activeTagKeys(tags, includeSatellite = true) { return allMenuTags().filter(tag => !!(tags && tags[tag]) && (includeSatellite || tag !== SATELLITE_KEY)); }
  function dominantTag(tags) { const active = activeTagKeys(tags, false); const base = Array.isArray(cfg().tagPriority) ? cfg().tagPriority : tagOrderBase(); const priority = ['highlight', ...base.filter(tag => tag !== 'highlight')]; return priority.find(tag => active.includes(tag)) || active[0] || ''; }
  function tagPillHtml(tag, otherLabel = '') {
    const label = tagDisplayLabel(tag, otherLabel);
    const customAttr = tag === OTHER_KEY && cleanOtherLabel(otherLabel) ? ` data-wnmu-custom-tag-label="${esc(cleanOtherLabel(otherLabel))}"` : '';
    return `<span class="tag-pill"${customAttr} style="--tag-color:${esc(tagMeta(tag).color || '#ddd')}">${esc(label)}</span>`;
  }
  function applyCellTagVisual(target, tags, otherLabel = '') {
    const cell = target?.cell;
    if (!cell) return;
    let cleanTags = normalizeTagsForStorage(tags || {});
    const otherText = cleanOtherLabel(otherLabel);
    if (otherText) {
      cleanTags[OTHER_KEY] = true;
      cell.dataset.wnmuOtherLabel = otherText;
      cell.dataset.wnmuCustomPlanningTag = otherText;
    } else {
      delete cell.dataset.wnmuOtherLabel;
      delete cell.dataset.wnmuCustomPlanningTag;
    }
    const active = activeTagKeys(cleanTags, false).filter(tag => tag !== OTHER_KEY || otherText);
    const isSat = !!cleanTags[SATELLITE_KEY];
    cell.classList.toggle('marked', active.length > 0);
    if (active.length) {
      const dom = active.includes(dominantTag(cleanTags)) ? dominantTag(cleanTags) : active[0];
      cell.style.setProperty('--mark-background', tagMeta(dom).color || '#fff');
      cell.style.backgroundColor = '';
    } else {
      cell.style.removeProperty('--mark-background');
      cell.style.backgroundColor = isSat ? TAG_FALLBACK.satelliteFeed.color : '';
    }
    const content = cell.querySelector?.('.program-content');
    if (content) {
      content.querySelectorAll(':scope > .program-tags').forEach(el => el.remove());
      if (active.length) {
        const wrap = document.createElement('div');
        wrap.className = 'program-tags';
        wrap.innerHTML = active.slice(0, 6).map(tag => tagPillHtml(tag, otherText)).join('');
        content.appendChild(wrap);
      }
    }
    forceCustomTagDisplayForCell(cell, otherText);
  }
  function overlayHostForTarget(target) {
    // Keep note overlays inside the schedule grid host instead of the whole week/page shell.
    // Notes should cover schedule cells only, not page chrome, headings, menus, or panels.
    return target?.cell?.closest?.('.screen-host')
      || target?.cell?.closest?.('table.screen-week-grid')?.parentElement
      || document.getElementById('weekGrids')
      || document.body;
  }

  function ensureOverlayLayer(target) {
    const host = overlayHostForTarget(target);
    let layer = host.querySelector?.(':scope > .wnmu-cell-override-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'wnmu-cell-override-layer';
      layer.setAttribute('aria-hidden', 'true');
      host.appendChild(layer);
    }
    return layer;
  }

  function allOverlayLayers() {
    return Array.from(document.querySelectorAll('.wnmu-cell-override-layer'));
  }

  function removeOverlayElementsForKey(key) {
    allOverlayLayers().forEach(layer => {
      layer.querySelectorAll(`[data-wnmu-cell-key="${css(key)}"]`).forEach(el => el.remove());
    });
  }

  function removeOverlayElementsForDateTime(date, time) {
    allOverlayLayers().forEach(layer => {
      layer.querySelectorAll('.wnmu-cell-override-box').forEach(box => {
        if (box.dataset.wnmuDate === date && box.dataset.wnmuTime === time) box.remove();
      });
    });
  }

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
    removeOverlayElementsForKey(target.key);
    const layer = ensureOverlayLayer(target);
    target.cell.classList.remove('wnmu-has-cell-override');
    const normalized = normalizeNoteForDisplay(note);
    if (!normalized) return;
    const customLabel = noteOtherLabel(normalized);
    const noteTags = normalizeTagsForStorage(normalized.tags || {});
    if (customLabel) noteTags[OTHER_KEY] = true;
    if (!(normalized.text || Object.values(noteTags || {}).some(Boolean))) return;
    const rect = target.cell.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    target.cell.classList.add('wnmu-has-cell-override');
    const box = document.createElement('div');
    box.className = 'wnmu-cell-override-box';
    box.dataset.wnmuCellKey = target.key;
    box.dataset.wnmuDate = target.date || '';
    box.dataset.wnmuTime = target.time || '';
    box.dataset.wnmuSourceType = target.sourceType || '';
    if (target.entryId) box.dataset.wnmuEntryId = target.entryId;
    box.title = `Right-click to edit this box note (${target.date || ''} ${target.time || ''})`;
    const layerRect = layer.getBoundingClientRect();
    const visualTop = cellVisualTopForTarget(target);
    box.style.left = `${rect.left - layerRect.left + 4}px`;
    box.style.top = `${visualTop - layerRect.top + 2}px`;
    box.style.width = `${Math.max(44, rect.width - 8)}px`;
    box.style.height = `${durationHeightFromRows(target.cell, normalized.durationMin)}px`;
    const tags = Object.keys(noteTags || {}).filter(tag => noteTags[tag] && (tag !== OTHER_KEY || customLabel));
    const pills = tags.length ? `<div class="wnmu-cell-override-tags">${tags.map(tag => `<span data-wnmu-overlay-tag="${esc(tag)}">${esc(tagDisplayLabel(tag, customLabel))}</span>`).join('')}</div>` : '';
    const text = normalized.text ? `<div class="wnmu-cell-override-text">${esc(normalized.text)}</div>` : '';
    box.innerHTML = `${pills}${text}<div class="wnmu-cell-override-duration">${nearestDuration(normalized.durationMin || 30)} min</div>`;
    layer.appendChild(box);
    forceCustomTagDisplayForCell(target.cell, customLabel);
  }
  function removeOverlay(target) { if (!target) return; removeOverlayElementsForKey(target.key); target.cell?.classList.remove('wnmu-has-cell-override'); }
  function buildDurationRadios(selected, name) { const chosen = nearestDuration(selected || 30); return DURATIONS.map(min => `<label class="wnmu-cell-pill"><input type="radio" name="${name}" value="${min}" ${min === chosen ? 'checked' : ''}><span>${min}</span></label>`).join(''); }
  function cellTitle(target) { return target?.cell?.querySelector?.('.program-title')?.textContent?.trim() || (target?.sourceType === 'program' ? 'Scheduled program cell' : 'Blank schedule cell'); }

  function cellMenuHtml(target, note) {
    const tags = { ...(note?.tags || {}) };
    tags[SATELLITE_KEY] = effectiveSatelliteForTarget(target);
    const otherLabel = cleanOtherLabel(note?.otherLabel || note?.planningOtherLabel || note?.customPlanningLabel || note?.customTagLabel || note?.otherText || '');
    const tagRows = allMenuTags().filter(tag => tag !== OTHER_KEY).map(tag => `<label class="check-row ${esc(tagClassName(tag))}"><input type="checkbox" name="${esc(tag)}" ${tags[tag] ? 'checked' : ''}> <span>${esc(tagMeta(tag).label || tag)}</span></label>`).join('');
    const typeLabel = target.sourceType === 'program' ? `Program: ${cellTitle(target)}` : 'Blank schedule slot';
    const noteSource = note?.canonical ? 'saved v1.5 note' : (note?.legacy ? `older ${note.legacy} note` : 'no saved note yet');
    const defaultDuration = note?.durationMin || Math.max(30, Number(target.cell?.rowSpan || 1) * 30);
    return `<div class="context-menu-head"><div><h3>Schedule cell note</h3><div class="context-menu-meta">${esc(typeLabel)} • ${esc(target.date)} • ${esc(target.time)} • ${esc(noteSource)}</div></div><button type="button" class="menu-close" id="wnmuCellCloseBtn" aria-label="Close">×</button></div><form class="wnmu-cell-form" id="wnmuCellForm"><fieldset class="wnmu-cell-note-tools"><legend>White override box</legend><div class="manual-rect-label">Box size / length</div><div class="wnmu-cell-duration-options" role="radiogroup" aria-label="Box note length">${buildDurationRadios(defaultDuration, 'wnmuCellDuration')}</div><label class="manual-rect-label" for="wnmuCellText">Box note text</label><textarea id="wnmuCellText" class="manual-rect-text" rows="3" placeholder="Type what should show in this schedule slot">${esc(note?.text || '')}</textarea><div class="manual-rect-help">Choose how many minutes the white box should cover. This controls the drawn box height.</div></fieldset><div class="manual-rect-label">Planning tags</div><div class="wnmu-cell-tag-grid">${tagRows}</div><label class="manual-rect-label" for="wnmuCellCustomTagText">Custom planning tag</label><div class="wnmu-custom-tag-row"><input id="wnmuCellCustomTagText" data-wnmu-custom-tag-input="true" class="manual-rect-text wnmu-custom-tag-input" type="text" maxlength="64" placeholder="Type custom tag…" value="${esc(otherLabel)}"><button type="button" class="btn ghost" id="wnmuCustomTagClearBtn">Clear custom tag</button></div><div class="manual-rect-help">This custom label shows as its own planning tag on the grid. Clear the field to remove it.</div><div class="rect-actions"><button type="button" class="btn ghost" id="wnmuCellSaveBtn">Save box note</button><button type="button" class="btn ghost" id="wnmuCellClearBtn">Clear box note</button></div><div id="wnmuCellStatus" class="blank-save-status" aria-live="polite"></div></form>`;
  }
  function ensureCellMenu() {
    let menu = document.getElementById('wnmuCellMenu');
    if (!menu) {
      menu = document.createElement('aside');
      menu.id = 'wnmuCellMenu';
      menu.className = 'context-menu hidden wnmu-cell-menu';
      menu.setAttribute('aria-hidden', 'true');
      menu.setAttribute('inert', '');
      document.body.appendChild(menu);
    }
    return menu;
  }
  function positionMenu(menu, x, y, avoidRect = null) {
    menu.removeAttribute('inert');
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const r = menu.getBoundingClientRect();
    const margin = 12;
    const clampLeft = value => Math.max(margin, Math.min(value, window.innerWidth - r.width - margin));
    const clampTop = value => Math.max(margin, Math.min(value, window.innerHeight - r.height - margin));
    let left = x + margin;
    let top = y + margin;
    if (avoidRect) {
      const candidates = [
        { left: avoidRect.right + margin, top: avoidRect.top },
        { left: avoidRect.left - r.width - margin, top: avoidRect.top },
        { left: avoidRect.left, top: avoidRect.bottom + margin },
        { left: avoidRect.left, top: avoidRect.top - r.height - margin },
        { left: x + margin, top: y + margin }
      ];
      const fits = item => item.left >= margin && item.top >= margin && item.left + r.width <= window.innerWidth - margin && item.top + r.height <= window.innerHeight - margin;
      const picked = candidates.find(fits) || candidates[candidates.length - 1];
      left = picked.left;
      top = picked.top;
    }
    menu.style.left = `${clampLeft(left)}px`;
    menu.style.top = `${clampTop(top)}px`;
  }
  function makeMenuDraggable(menu) {
    if (!menu || menu.dataset.wnmuDraggable === 'true') return;
    menu.dataset.wnmuDraggable = 'true';
    let drag = null;
    menu.addEventListener('pointerdown', event => {
      const head = event.target.closest?.('.context-menu-head');
      if (!head || event.target.closest?.('button,input,textarea,select,label')) return;
      const rect = menu.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      try { menu.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });
    menu.addEventListener('pointermove', event => {
      if (!drag) return;
      const rect = menu.getBoundingClientRect();
      const left = Math.max(8, Math.min(event.clientX - drag.dx, window.innerWidth - rect.width - 8));
      const top = Math.max(8, Math.min(event.clientY - drag.dy, window.innerHeight - rect.height - 8));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    });
    const stop = event => { if (!drag) return; drag = null; try { menu.releasePointerCapture(event.pointerId); } catch {} };
    menu.addEventListener('pointerup', stop);
    menu.addEventListener('pointercancel', stop);
  }
  function safeBlurInside(el) {
    try {
      if (el && el.contains(document.activeElement) && document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    } catch {}
  }
  function hideCellMenu() {
    const menu = document.getElementById('wnmuCellMenu');
    if (menu) {
      safeBlurInside(menu);
      menu.classList.add('hidden');
      menu.setAttribute('aria-hidden', 'true');
      menu.setAttribute('inert', '');
    }
  }
  function hideOldContextMenu() {
    const old = document.getElementById('contextMenu');
    if (old) {
      safeBlurInside(old);
      old.classList.add('hidden');
      old.setAttribute('aria-hidden', 'true');
      old.setAttribute('inert', '');
      old.style.zIndex = '1';
      old.style.display = 'none';
    }
  }
  function writeProgramPlanningTags(target, tags, otherLabel) {
    const key = storageKey();
    if (!key || !target) return false;
    const entryId = target?.entryId || target?.cell?.dataset?.entryId || '';
    const rawTags = { ...(tags || {}) };
    const satelliteChecked = !!rawTags[SATELLITE_KEY];
    delete rawTags[SATELLITE_KEY];
    const cleanOther = cleanOtherLabel(otherLabel || '');
    const cleanTags = normalizeTagsForExplicitStorage(rawTags, cleanOther);

    if (entryId) {
      const all = readJson(key, {});
      const existing = all[entryId] && typeof all[entryId] === 'object' ? all[entryId] : {};
      const next = {
        ...existing,
        tags: cleanTags,
        otherLabel: cleanOther,
        planningOtherLabel: cleanOther,
        customPlanningLabel: cleanOther,
        customTagLabel: cleanOther
      };
      if (existing.rectNote && typeof existing.rectNote === 'object') {
        next.rectNote = { ...existing.rectNote, otherLabel: cleanOther, planningOtherLabel: cleanOther, customPlanningLabel: cleanOther, customTagLabel: cleanOther };
      }
      const hasActiveTag = Object.values(cleanTags).some(Boolean);
      const hasExplicitFalse = Object.values(cleanTags).some(v => v === false);
      if (!hasActiveTag && !hasExplicitFalse && !cleanOther && !next.rectNote && !next.text && !next.cellOverrideV15) delete all[entryId];
      else all[entryId] = next;
      writeJson(key, all);
      setSatelliteForTarget(target, satelliteChecked);
      if (target.cell) {
        if (cleanOther) target.cell.dataset.wnmuOtherLabel = cleanOther;
        else { delete target.cell.dataset.wnmuOtherLabel; delete target.cell.dataset.wnmuCustomPlanningTag; }
        applyCellTagVisual(target, cleanTags, cleanOther);
        forceCustomTagDisplayForCell(target.cell, cleanOther);
      }
      repaintSatelliteFeedsSoon(30);
      window.dispatchEvent(new CustomEvent('wnmu:cell-planning-tags-saved', { detail: { entryId, version: VERSION } }));
      return true;
    }

    // Blank/manual cells do not have the old renderer's entryId. Store their
    // planning tags in the canonical cell override record instead of silently
    // dropping them; this was the main reason custom tags worked sometimes only.
    const existingNote = readEffectiveNote(target) || {};
    const hasSomething = cleanOther || Object.values(cleanTags).some(Boolean) || existingNote.text;
    if (hasSomething) {
      writeCanonicalRecord(target, {
        text: existingNote.text || '',
        durationMin: existingNote.durationMin || Math.max(30, Number(target.cell?.rowSpan || 1) * 30),
        tags: cleanTags,
        otherLabel: cleanOther
      });
      if (target.cell) {
        applyCellTagVisual(target, cleanTags, cleanOther);
        paintOverlay(target, { text: existingNote.text || '', durationMin: existingNote.durationMin || 30, tags: cleanTags, otherLabel: cleanOther });
      }
      return true;
    }

    writeCanonicalRecord(target, { text: '', durationMin: 30, tags: {}, otherLabel: '', cleared: true });
    removeOverlay(target);
    if (target.cell) applyCellTagVisual(target, {}, '');
    return true;
  }

  function savePlanningTagsOnlyFromMenu(menu) {
    const target = targetFromMenu(menu);
    if (!target) return false;
    const tags = readTagsFromMenu(menu);
    const otherLabel = readCustomOtherLabelFromMenu(menu);
    tags[OTHER_KEY] = !!otherLabel;
    return writeProgramPlanningTags(target, tags, otherLabel);
  }

  function openCellMenu(target, event) {
    selectedTarget = target; hideOldContextMenu();
    const menu = ensureCellMenu();
    const baseNote = readEffectiveNote(target) || { text: '', durationMin: Math.max(30, Number(target.cell?.rowSpan || 1) * 30), tags: {} };
    const planningState = readEffectivePlanningState(target, baseNote);
    const note = { ...baseNote, tags: planningState.tags, otherLabel: planningState.otherLabel, planningOtherLabel: planningState.otherLabel, customPlanningLabel: planningState.otherLabel, customTagLabel: planningState.otherLabel };
    menu.dataset.wnmuCellKey = target.key; menu.dataset.wnmuDate = target.date; menu.dataset.wnmuTime = target.time;
    menu.innerHTML = cellMenuHtml(target, note);
    updateOtherMenuLabel(menu, planningState.otherLabel, { force: true });
    const customInput = customTagInput(menu);
    if (customInput) {
      let customSaveTimer = 0;
      customInput.addEventListener('input', () => {
        const liveLabel = cleanOtherLabel(customInput.value);
        if (menu) menu.dataset.wnmuOtherLabel = liveLabel;
        const liveTarget = targetFromMenu(menu);
        if (liveTarget?.cell) {
          const liveTags = readTagsFromMenu(menu);
          liveTags[OTHER_KEY] = !!liveLabel;
          applyCellTagVisual(liveTarget, liveTags, liveLabel);
          forceCustomTagDisplayForCell(liveTarget.cell, liveLabel);
        }
        window.clearTimeout(customSaveTimer);
        customSaveTimer = window.setTimeout(() => savePlanningTagsOnlyFromMenu(menu), 250);
      });
      customInput.addEventListener('blur', () => savePlanningTagsOnlyFromMenu(menu));
    }
    menu.querySelector('#wnmuCustomTagClearBtn')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      updateOtherMenuLabel(menu, '', { force: true });
      savePlanningTagsOnlyFromMenu(menu);
      customInput?.focus?.();
    });
    menu.querySelector('.wnmu-cell-tag-grid')?.addEventListener('change', () => savePlanningTagsOnlyFromMenu(menu));
    menu.querySelector('#wnmuCellCloseBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); savePlanningTagsOnlyFromMenu(menu); hideCellMenu(); });
    menu.querySelector('#wnmuCellSaveBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); saveFromCellMenu(); });
    menu.querySelector('#wnmuCellClearBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); clearFromCellMenu(); });
    makeMenuDraggable(menu);
    positionMenu(menu, event.clientX, event.clientY, target.cell?.getBoundingClientRect?.() || null);
  }
  function saveFromCellMenu() {
    const menu = document.getElementById('wnmuCellMenu');
    const target = targetFromMenu(menu);
    if (!target) { const status = menu?.querySelector('#wnmuCellStatus'); if (status) status.textContent = 'No schedule cell selected. Right-click the cell again.'; return false; }
    selectedTarget = target;
    const text = String(menu?.querySelector('#wnmuCellText')?.value || '').trim();
    const duration = nearestDuration(menu?.querySelector('input[name="wnmuCellDuration"]:checked')?.value || Math.max(30, Number(target.cell?.rowSpan || 1) * 30));
    const tags = readTagsFromMenu(menu);
    const otherLabel = readCustomOtherLabelFromMenu(menu);
    tags[OTHER_KEY] = !!otherLabel;
    if (target?.cell) { if (otherLabel) target.cell.dataset.wnmuOtherLabel = otherLabel; else delete target.cell.dataset.wnmuOtherLabel; }
    updateOtherMenuLabel(menu, otherLabel);
    writeProgramPlanningTags(target, tags, otherLabel);
    try {
      writeCanonicalRecord(target, { text, durationMin: duration, tags, otherLabel });
      const reread = readEffectiveNote(target);
      removeOverlayElementsForDateTime(target.date, target.time);
      paintOverlay(target, { text, durationMin: duration, tags, otherLabel, planningOtherLabel: otherLabel });
      applyCellTagVisual(target, tags, otherLabel);
      forceCustomTagDisplayForCell(target.cell, otherLabel);
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
    selectedTarget = target;
    writeProgramPlanningTags(target, explicitFalseTags(), '');
    writeCanonicalRecord(target, { text: '', durationMin: 30, tags: explicitFalseTags(), otherLabel: '', cleared: true });
    removeOverlay(target);
    // Remove any duplicate visual remnants for the same date/time that came from older storage keys.
    removeOverlayElementsForDateTime(target.date, target.time);
    target.cell?.classList.remove('wnmu-has-cell-override');
    if (target.cell) { delete target.cell.dataset.wnmuOtherLabel; delete target.cell.dataset.wnmuCustomPlanningTag; }
    applyCellTagVisual(target, explicitFalseTags());
    const status = menu?.querySelector('#wnmuCellStatus'); if (status) status.textContent = 'Box note and visible tags cleared.';
  }

  function sanitizeUneditableCells() {
    // If a cell cannot produce a stable right-click target, remove any visible
    // tag/note decorations this interaction layer can safely remove. This avoids
    // showing markup the user cannot affect from the menu.
    document.querySelectorAll('td.program-cell:not(.outside)').forEach(cell => {
      const target = targetFromCell(cell);
      if (target && target.key && target.date && target.time) {
        cell.dataset.wnmuActionable = 'true';
        return;
      }
      cell.dataset.wnmuActionable = 'false';
      cell.classList.remove('marked', 'wnmu-has-cell-override', 'wnmu-blank-satellite-feed', 'wnmu-blank-tagged');
      cell.style.removeProperty('--mark-background');
      cell.style.backgroundColor = '';
      cell.querySelectorAll(':scope > .draw-rect-note, :scope > .wnmu-blank-slot-content, .program-tags').forEach(el => el.remove());
    });
  }

  function restoreVisibleNotes() {
    sanitizeUneditableCells();
    if (!storageKey() || !document.querySelector('table.screen-week-grid')) return false;
    Object.values(readCanonicalStore()).forEach(rec => { if (!rec || rec.cleared || rec.channelCode !== channelCode()) return; if (rec.monthKey && monthKey() && rec.monthKey !== monthKey()) return; const target = targetForDateTime(rec.date, rec.time); if (target) paintOverlay(target, rec); });
    const main = readJson(storageKey(), {});
    Object.entries(main).forEach(([key, item]) => {
      if (!item || typeof item !== 'object') return;
      if (item.cellOverrideV15 && item.date && item.time && !item.cleared) { const target = targetForDateTime(item.date, item.time); if (target && !readCanonicalRecord(target.key)) paintOverlay(target, item); return; }
      if (!item.rectNote) return; const dt = parseEntryId(key); if (!dt) return; const target = targetForDateTime(dt.date, dt.time); if (!target || readCanonicalRecord(target.key)) return; const note = legacyProgramNote(target); if (note) paintOverlay(target, note);
    });
    oldBlankStoreKeys().forEach(storeKey => { const store = readJson(storeKey, {}); Object.entries(store).forEach(([oldKey, mark]) => { if (!mark?.rectNote?.text) return; const m = String(oldKey).match(/^(13\.1|13\.3)__(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})__blank-slot$/); if (!m || m[1] !== channelCode()) return; const target = targetForDateTime(m[2], m[3]); if (!target || readCanonicalRecord(target.key)) return; paintOverlay(target, { text: mark.rectNote.text, durationMin: mark.rectNote.durationMin || 30, tags: { ...(mark.tags || {}), ...(mark.satelliteFeed ? { [SATELLITE_KEY]: true } : {}) }, otherLabel: cleanOtherLabel(mark.otherLabel || mark.planningOtherLabel || mark.customPlanningLabel || mark.customTagLabel || mark.otherText || '') }); }); });
    return true;
  }
  function waitForReadyThenRestore() {
    if (restoreVisibleNotes()) {
      window.setTimeout(restoreVisibleNotes, 2200);
      return;
    }
    readyWaits += 1;
    if (readyWaits < 24) window.setTimeout(waitForReadyThenRestore, 300);
  }

  function injectStyles() {
    if (document.getElementById('wnmuCellInteractionsV1512Styles')) return;
    const style = document.createElement('style'); style.id = 'wnmuCellInteractionsV1512Styles';
    style.textContent = `td.program-cell[data-wnmu-actionable="false"]{background:#fff!important}.program-cell[data-wnmu-actionable="false"] .program-tags,.program-cell[data-wnmu-actionable="false"]>.draw-rect-note,.program-cell[data-wnmu-actionable="false"]>.wnmu-blank-slot-content{display:none!important}.week-grid-wrap,.screen-host{position:relative}.wnmu-cell-override-layer{position:absolute;left:0;top:0;right:0;bottom:0;z-index:20;pointer-events:none;overflow:visible}.screen-host>.wnmu-cell-override-layer{z-index:20}.wnmu-cell-override-box{position:absolute;box-sizing:border-box;background:rgba(255,255,255,.96);border:2px solid rgba(12,18,32,.86);color:#111;border-radius:4px;box-shadow:0 2px 7px rgba(0,0,0,.22);padding:5px 6px 16px;overflow:hidden;font:12px/1.22 system-ui,sans-serif;pointer-events:auto}.wnmu-cell-override-text{white-space:normal;overflow:hidden;font-weight:700}.wnmu-cell-override-tags{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:3px}.wnmu-cell-override-tags span{display:inline-flex;align-items:center;border:1px solid rgba(0,0,0,.25);border-radius:999px;padding:1px 5px;font-size:9px;font-weight:800;background:rgba(255,255,255,.72)}.wnmu-cell-override-box{cursor:context-menu}.wnmu-cell-override-duration{position:absolute;right:4px;bottom:2px;font-size:9px;opacity:.62}.program-cell.wnmu-has-cell-override>.draw-rect-note,.program-cell.wnmu-has-cell-override>.wnmu-blank-slot-content{display:none!important}#contextMenu{display:none!important;z-index:1}#wnmuCellMenu.wnmu-cell-menu{position:fixed;z-index:2147483647!important;min-width:420px;max-width:500px;max-height:calc(100vh - 28px);overflow:auto}.wnmu-cell-form{display:block}.wnmu-cell-tag-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}.wnmu-cell-tag-grid .check-row{min-height:39px;margin:0;box-sizing:border-box;display:flex;align-items:center;gap:8px;border-radius:9px}.wnmu-cell-note-tools{border:2px solid rgba(255,255,255,.32);border-radius:10px;padding:11px;margin:10px 0;background:rgba(255,255,255,.08)}.wnmu-cell-note-tools legend{font-weight:800}.wnmu-cell-duration-options{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0 8px}.wnmu-cell-pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:5px 8px;cursor:pointer;background:rgba(255,255,255,.08)}.wnmu-cell-pill input{margin:0}.manual-rect-text{width:100%;box-sizing:border-box;border-radius:8px;border:1px solid rgba(255,255,255,.28);padding:7px;resize:vertical;font:13px/1.3 system-ui,sans-serif;color:#111;background:#fff}.wnmu-custom-tag-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin:6px 0 2px;padding:8px;border:2px solid rgba(17,52,95,.38);border-radius:10px;background:rgba(255,255,255,.92)}.wnmu-custom-tag-input{border:2px solid #17345f!important;background:#fff!important;box-shadow:inset 0 1px 2px rgba(15,23,42,.12)!important}.wnmu-custom-tag-input:focus{outline:3px solid rgba(49,95,140,.22)!important;outline-offset:1px!important}.manual-rect-label{font-size:12px;font-weight:800;margin:6px 0 5px}.manual-rect-help{margin-top:6px;font-size:11px;opacity:.75;line-height:1.25}table.screen-week-grid thead th{z-index:100}.panel-head,.topbar,.flagbar{position:relative;z-index:120}.wnmu-diag-panel{z-index:2147483200!important}.wnmu-component-versions{z-index:2147483000!important}@media print{.wnmu-cell-override-layer{display:none!important}}`;
    document.head.appendChild(style);
  }
  function relayoutVisibleOverlays() {
    const boxes = allOverlayLayers().flatMap(layer => Array.from(layer.querySelectorAll('.wnmu-cell-override-box')));
    boxes.forEach(box => {
      const date = box.dataset.wnmuDate || '';
      const time = box.dataset.wnmuTime || '';
      if (!date || !time) return;
      const target = targetForDateTime(date, time);
      if (!target) return;
      const note = readEffectiveNote(target);
      if (!note) return;
      paintOverlay(target, note);
    });
  }
  function scheduleRelayoutVisibleOverlays(delay = 140) {
    window.clearTimeout(relayoutTimer);
    relayoutTimer = window.setTimeout(() => window.requestAnimationFrame(relayoutVisibleOverlays), delay);
  }
  function installHandlers() {
    document.addEventListener('contextmenu', event => {
      const overlayBox = event.target.closest?.('.wnmu-cell-override-box');
      if (overlayBox) {
        const target = targetFromOverlayBox(overlayBox);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        selectedTarget = target;
        openCellMenu(target, event);
        return;
      }

      const cell = event.target.closest?.('.program-cell');
      if (!cell || cell.classList.contains('outside')) return;
      const target = targetFromCell(cell, event);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      selectedTarget = target;
      openCellMenu(target, event);
    }, true);
    document.addEventListener('click', event => { const menu = document.getElementById('wnmuCellMenu'); if (!menu || menu.classList.contains('hidden')) return; if (menu.contains(event.target)) return; hideCellMenu(); }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideCellMenu(); });
  }
  function start() {
    hideOldContextMenu();
    injectStyles();
    installHandlers();
    window.WNMU_CELL_INTERACTIONS_VERSION = VERSION;
    window.addEventListener('resize', () => scheduleRelayoutVisibleOverlays(220), { passive: true });
    window.addEventListener('wnmu:remote-storage-loaded', () => {
      const menu = document.getElementById('wnmuCellMenu');
      if (menu && !menu.classList.contains('hidden') && customTagEditIsActive(menu)) return;
      window.setTimeout(restoreVisibleNotes, 80);
      window.setTimeout(() => scheduleRelayoutVisibleOverlays(0), 160);
    });
    window.setTimeout(waitForReadyThenRestore, 450);
    window.setTimeout(sanitizeUneditableCells, 1400);
    window.setTimeout(() => scheduleRelayoutVisibleOverlays(0), 2200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
