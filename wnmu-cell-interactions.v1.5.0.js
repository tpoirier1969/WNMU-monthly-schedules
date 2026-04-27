(function () {
  'use strict';

  const VERSION = 'v1.5.0-cell-interactions-consolidated';
  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
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
    arts: { label: 'Arts', color: '#ead9ff' }
  };

  let selectedTarget = null;
  let restoreAttempts = 0;
  let restoreTimer = null;

  function cfg() {
    return window.WNMU_MONTHLY_PAGE_CONFIG || {};
  }

  function channelCode() {
    return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1');
  }

  function monthKey() {
    const metaMonth = window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey;
    const queryMonth = new URLSearchParams(location.search).get('month');
    return metaMonth || queryMonth || '';
  }

  function storageKey() {
    return cfg().storageKey || '';
  }

  function canonicalStoreKey() {
    const base = storageKey();
    return base ? `${base}::cellOverrides.v1.5.0` : '';
  }

  function oldBlankStoreKeys() {
    const base = storageKey();
    if (!base) return [];
    return [
      `${base}::blankSlotMarks.v1.4.30`,
      `${base}::blankSlotMarks.v1.4.29`,
      `${base}::blankSlotMarks.v1.4.28`,
      `${base}::blankSlotSatelliteOverrides.v1.4.28`,
      `${base}::blankSlotSatelliteOverrides.v1.4.26`
    ];
  }

  function manualMetaKey() {
    const base = storageKey();
    return base ? `${base}::manualRectMeta.v1.4.17` : '';
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function css(value) {
    if (window.CSS && CSS.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function readJson(key, fallback) {
    if (!key) return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(value || {}));
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function slotToTime(slot) {
    const h = Math.floor(slot / 2);
    return `${pad(h)}:${slot % 2 ? '30' : '00'}`;
  }

  function timeToSlot(time) {
    const match = String(time || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return -1;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
    return hh * 2 + (mm >= 30 ? 1 : 0);
  }

  function parseMonthDay(label, fallbackYear) {
    const months = {
      jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
      apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
      aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10',
      nov: '11', november: '11', dec: '12', december: '12'
    };
    const clean = String(label || '').trim().toLowerCase().replace(/,/g, '');
    const m = clean.match(/^([a-z]+)\s+(\d{1,2})$/);
    if (!m || !months[m[1]]) return '';
    return `${fallbackYear}-${months[m[1]]}-${pad(Number(m[2]))}`;
  }

  function currentYear() {
    const mk = monthKey();
    const y = String(mk || '').split('-')[0];
    return Number(y) || new Date().getFullYear();
  }

  function headerDates(table) {
    const year = currentYear();
    return Array.from(table.querySelectorAll('thead th:not(.time-col)')).map(th => {
      const lines = (th.innerText || th.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
      return parseMonthDay(lines[lines.length - 1] || '', year);
    });
  }

  function tagOrder() {
    const list = Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : Object.keys(TAG_FALLBACK);
    if (channelCode() === '13.3') return list.filter(tag => tag !== 'michigan');
    if (channelCode() === '13.1') return list.filter(tag => tag !== 'arts');
    return list;
  }

  function tagMeta(tag) {
    return (cfg().tagMeta && cfg().tagMeta[tag]) || TAG_FALLBACK[tag] || { label: tag, color: '#ddd' };
  }

  function nearestDuration(value) {
    const n = Number(value) || 30;
    return DURATIONS.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, DURATIONS[0]);
  }

  function makeKey(date, time) {
    const m = monthKey() || String(date || '').slice(0, 7);
    return `${channelCode()}__${m}__${date}__${time}`;
  }

  function parseEntryId(entryId) {
    const m = String(entryId || '').match(/^(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})__/);
    if (!m) return null;
    return { date: m[1], time: m[2] };
  }

  function dateTimeFromBlankCell(cell) {
    if (!cell) return null;
    if (cell.dataset.wnmuDate && cell.dataset.wnmuTime) {
      return { date: cell.dataset.wnmuDate, time: cell.dataset.wnmuTime };
    }
    if (cell.dataset.blankDate && cell.dataset.blankTime) {
      return { date: cell.dataset.blankDate, time: cell.dataset.blankTime };
    }
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
    let bestIndex = -1;
    let bestDistance = Infinity;
    headers.forEach((th, idx) => {
      const r = th.getBoundingClientRect();
      const dist = Math.abs((r.left + r.width / 2) - center);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = idx;
      }
    });
    const date = dates[bestIndex];
    if (!date) return null;
    return { date, time: slotToTime(rowIndex) };
  }

  function targetFromCell(cell) {
    if (!cell || !cell.classList.contains('program-cell') || cell.classList.contains('outside')) return null;
    let dateTime = null;
    let sourceType = 'blank';
    let entryId = '';
    if (cell.dataset.entryId) {
      entryId = cell.dataset.entryId;
      dateTime = parseEntryId(entryId);
      sourceType = 'program';
    } else {
      dateTime = dateTimeFromBlankCell(cell);
      sourceType = 'blank';
    }
    if (!dateTime || !dateTime.date || !dateTime.time) return null;
    const key = makeKey(dateTime.date, dateTime.time);
    cell.dataset.wnmuCellKey = key;
    cell.dataset.wnmuDate = dateTime.date;
    cell.dataset.wnmuTime = dateTime.time;
    return { key, date: dateTime.date, time: dateTime.time, cell, entryId, sourceType };
  }

  function readCanonicalStore() {
    return readJson(canonicalStoreKey(), {});
  }

  function writeCanonicalRecord(target, note) {
    const store = readCanonicalStore();
    store[target.key] = {
      channelCode: channelCode(),
      monthKey: monthKey() || target.date.slice(0, 7),
      date: target.date,
      time: target.time,
      sourceType: target.sourceType,
      sourceEntryId: target.entryId || '',
      text: note.text || '',
      durationMin: nearestDuration(note.durationMin || 30),
      tags: note.tags || {},
      cleared: !!note.cleared,
      updatedAt: new Date().toISOString()
    };
    writeJson(canonicalStoreKey(), store);
  }

  function readCanonicalRecord(key) {
    const store = readCanonicalStore();
    const rec = store[key];
    if (!rec || typeof rec !== 'object') return null;
    return rec;
  }

  function legacyProgramNote(target) {
    if (!target || !target.entryId || !storageKey()) return null;
    const marks = readJson(storageKey(), {});
    const meta = readJson(manualMetaKey(), {});
    const item = marks[target.entryId];
    const rect = item && typeof item === 'object' ? item.rectNote : null;
    if (!rect || typeof rect !== 'object') return null;
    const extra = meta[target.entryId] && typeof meta[target.entryId] === 'object' ? meta[target.entryId] : {};
    return {
      text: rect.text || '',
      durationMin: nearestDuration(extra.durationMin || rect.durationMin || Math.max(1, Number(target.cell?.rowSpan || 1)) * 30),
      tags: {},
      legacy: 'program'
    };
  }

  function legacyBlankNote(target) {
    if (!target || !target.date || !target.time) return null;
    const oldKey = `${channelCode()}__${target.date}__${target.time}__blank-slot`;
    for (const key of oldBlankStoreKeys()) {
      const store = readJson(key, {});
      const mark = store[oldKey];
      if (mark && typeof mark === 'object' && mark.rectNote && mark.rectNote.text) {
        return {
          text: mark.rectNote.text || '',
          durationMin: nearestDuration(mark.rectNote.durationMin || 30),
          tags: mark.tags || {},
          legacy: 'blank'
        };
      }
    }
    return null;
  }

  function readEffectiveNote(target) {
    if (!target) return null;
    const canon = readCanonicalRecord(target.key);
    if (canon) {
      if (canon.cleared) return null;
      return {
        text: canon.text || '',
        durationMin: nearestDuration(canon.durationMin || 30),
        tags: canon.tags || {},
        canonical: true
      };
    }
    return legacyBlankNote(target) || legacyProgramNote(target);
  }

  function readProgramTagsFromMenu(menu) {
    const tags = {};
    tagOrder().forEach(tag => {
      const input = menu?.querySelector(`input[name="${css(tag)}"]`);
      if (input && input.checked) tags[tag] = true;
    });
    return tags;
  }

  function ensureOverlayLayer() {
    let layer = document.getElementById('wnmuCellOverrideLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'wnmuCellOverrideLayer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }

  function durationHeightFromRows(cell, durationMin) {
    const table = cell.closest('table.screen-week-grid');
    const row = cell.closest('tr');
    if (!table || !row) return Math.max(22, cell.getBoundingClientRect().height - 4);
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const startIndex = rows.indexOf(row);
    const slots = Math.max(1, Math.round(nearestDuration(durationMin) / 30));
    const startRect = rows[startIndex]?.getBoundingClientRect();
    const endRow = rows[Math.min(rows.length - 1, startIndex + slots)];
    if (startRect && rows[startIndex + slots]) {
      const endRect = rows[startIndex + slots].getBoundingClientRect();
      return Math.max(22, endRect.top - startRect.top - 4);
    }
    const nextRect = rows[startIndex + 1]?.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const rowHeight = nextRect && startRect ? Math.max(16, nextRect.top - startRect.top) : Math.max(18, cellRect.height / Math.max(1, Number(cell.rowSpan || 1)));
    return Math.max(22, rowHeight * slots - 4);
  }

  function paintOverlay(target, note) {
    if (!target || !target.cell) return;
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
    box.style.top = `${window.scrollY + rect.top + 2}px`;
    box.style.width = `${Math.max(44, rect.width - 8)}px`;
    box.style.height = `${durationHeightFromRows(target.cell, note.durationMin)}px`;

    const tags = Object.keys(note.tags || {}).filter(tag => note.tags[tag]);
    const pills = tags.length ? `<div class="wnmu-cell-override-tags">${tags.map(tag => `<span>${esc(tagMeta(tag).label || tag)}</span>`).join('')}</div>` : '';
    const text = note.text ? `<div class="wnmu-cell-override-text">${esc(note.text)}</div>` : '';
    box.innerHTML = `${pills}${text}<div class="wnmu-cell-override-duration">${nearestDuration(note.durationMin || 30)} min</div>`;
    layer.appendChild(box);
  }

  function removeOverlay(target) {
    if (!target) return;
    const layer = ensureOverlayLayer();
    layer.querySelectorAll(`[data-wnmu-cell-key="${css(target.key)}"]`).forEach(el => el.remove());
    target.cell?.classList.remove('wnmu-has-cell-override');
  }

  function buildDurationRadios(selected, name) {
    const chosen = nearestDuration(selected || 30);
    return DURATIONS.map(min => `<label class="wnmu-cell-pill"><input type="radio" name="${name}" value="${min}" ${min === chosen ? 'checked' : ''}><span>${min}</span></label>`).join('');
  }

  function blankMenuHtml(target, note) {
    const tags = note?.tags || {};
    const tagRows = tagOrder().map(tag => {
      const meta = tagMeta(tag);
      return `<label class="check-row check-${esc(tag.replace(/[A-Z]/g, m => '-' + m.toLowerCase()))}"><input type="checkbox" name="${esc(tag)}" ${tags[tag] ? 'checked' : ''}> <span>${esc(meta.label || tag)}</span></label>`;
    }).join('');
    return `
      <div class="context-menu-head">
        <div><h3>Schedule cell note</h3><div class="context-menu-meta">${esc(target.date)} • ${esc(target.time)}</div></div>
        <button type="button" class="menu-close" id="wnmuCellCloseBtn" aria-label="Close">×</button>
      </div>
      <form class="context-menu-form" id="wnmuCellBlankForm">
        ${tagRows}
        <fieldset class="wnmu-cell-note-tools">
          <legend>White override box</legend>
          <div class="manual-rect-label">Box length</div>
          <div class="wnmu-cell-duration-options">${buildDurationRadios(note?.durationMin || 30, 'wnmuCellDuration')}</div>
          <label class="manual-rect-label" for="wnmuCellText">Box note text</label>
          <textarea id="wnmuCellText" class="manual-rect-text" rows="3" placeholder="Type what should show in this schedule slot">${esc(note?.text || '')}</textarea>
          <div class="manual-rect-help">This note belongs to the date/time cell, so it can override a last-minute schedule change without depending on the old program title.</div>
        </fieldset>
        <div class="rect-actions">
          <button type="button" class="btn ghost" id="wnmuCellSaveBtn">Save box note</button>
          <button type="button" class="btn ghost" id="wnmuCellClearBtn">Clear box note</button>
        </div>
        <div id="wnmuCellStatus" class="blank-save-status" aria-live="polite"></div>
      </form>`;
  }

  function ensureBlankMenu() {
    let menu = document.getElementById('wnmuCellMenu');
    if (menu) return menu;
    menu = document.createElement('aside');
    menu.id = 'wnmuCellMenu';
    menu.className = 'context-menu hidden wnmu-cell-menu';
    menu.setAttribute('aria-hidden', 'true');
    document.body.appendChild(menu);
    return menu;
  }

  function positionMenu(menu, x, y) {
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const r = menu.getBoundingClientRect();
    const left = Math.max(12, Math.min(x, window.innerWidth - r.width - 12));
    const top = Math.max(12, Math.min(y, window.innerHeight - r.height - 12));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function hideBlankMenu() {
    const menu = document.getElementById('wnmuCellMenu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
  }

  function openBlankMenu(target, event) {
    selectedTarget = target;
    const menu = ensureBlankMenu();
    const note = readEffectiveNote(target) || { text: '', durationMin: 30, tags: {} };
    menu.dataset.wnmuCellKey = target.key;
    menu.innerHTML = blankMenuHtml(target, note);
    menu.querySelector('#wnmuCellCloseBtn')?.addEventListener('click', hideBlankMenu);
    menu.querySelector('#wnmuCellSaveBtn')?.addEventListener('click', () => saveFromBlankMenu(target));
    menu.querySelector('#wnmuCellClearBtn')?.addEventListener('click', () => clearTargetNote(target, true));
    positionMenu(menu, event.clientX, event.clientY);
  }

  function saveFromBlankMenu(target) {
    const menu = document.getElementById('wnmuCellMenu');
    const actualTarget = target || selectedTarget;
    if (!actualTarget) return;
    const text = String(menu?.querySelector('#wnmuCellText')?.value || '').trim();
    const duration = nearestDuration(menu?.querySelector('input[name="wnmuCellDuration"]:checked')?.value || 30);
    const tags = readProgramTagsFromMenu(menu);
    writeCanonicalRecord(actualTarget, { text, durationMin: duration, tags });
    paintOverlay(actualTarget, { text, durationMin: duration, tags });
    const status = menu?.querySelector('#wnmuCellStatus');
    if (status) status.textContent = 'Box note saved.';
  }

  function injectProgramControls(menu, target) {
    if (!menu || !target) return;
    const tools = menu.querySelector('.rect-tools');
    if (!tools) return;
    const note = readEffectiveNote(target) || { text: '', durationMin: Math.max(30, Number(target.cell?.rowSpan || 1) * 30), tags: {} };
    if (document.getElementById('wnmuProgramCellTools')) {
      setProgramControls(note);
      return;
    }
    const panel = document.createElement('div');
    panel.id = 'wnmuProgramCellTools';
    panel.className = 'wnmu-cell-note-tools';
    panel.innerHTML = `
      <div class="manual-rect-label">White override box length</div>
      <div class="wnmu-cell-duration-options">${buildDurationRadios(note.durationMin || 30, 'wnmuProgramCellDuration')}</div>
      <label class="manual-rect-label" for="wnmuProgramCellText">White override box text</label>
      <textarea id="wnmuProgramCellText" class="manual-rect-text" rows="3" placeholder="Type what should show over this scheduled slot">${esc(note.text || '')}</textarea>
      <div class="manual-rect-help">Saves against this airtime, not just the current program title.</div>
      <div id="wnmuProgramCellStatus" class="blank-save-status" aria-live="polite"></div>`;
    tools.insertBefore(panel, tools.querySelector('.rect-actions') || null);
    const draw = menu.querySelector('#drawRectBtn');
    if (draw) draw.textContent = 'Save box note';
    const status = menu.querySelector('#rectStatus');
    if (status) status.textContent = note.text ? 'Box note loaded for this schedule cell.' : 'No white override box on this schedule cell yet.';
  }

  function setProgramControls(note) {
    const text = document.getElementById('wnmuProgramCellText');
    if (text) text.value = note?.text || '';
    const dur = nearestDuration(note?.durationMin || 30);
    const input = document.querySelector(`input[name="wnmuProgramCellDuration"][value="${dur}"]`);
    if (input) input.checked = true;
  }

  function saveFromProgramMenu() {
    const menu = document.getElementById('contextMenu');
    const target = selectedTarget;
    if (!target) return false;
    const text = String(document.getElementById('wnmuProgramCellText')?.value || '').trim();
    const duration = nearestDuration(document.querySelector('input[name="wnmuProgramCellDuration"]:checked')?.value || Math.max(30, Number(target.cell?.rowSpan || 1) * 30));
    const tags = readProgramTagsFromMenu(menu);
    writeCanonicalRecord(target, { text, durationMin: duration, tags });
    paintOverlay(target, { text, durationMin: duration, tags });
    const status = document.getElementById('wnmuProgramCellStatus');
    if (status) status.textContent = 'Box note saved.';
    return true;
  }

  function clearTargetNote(target, hideCustomMenu) {
    const actualTarget = target || selectedTarget;
    if (!actualTarget) return;
    writeCanonicalRecord(actualTarget, { text: '', durationMin: 30, tags: {}, cleared: true });
    removeOverlay(actualTarget);
    if (hideCustomMenu) hideBlankMenu();
    const status = document.getElementById('wnmuProgramCellStatus') || document.getElementById('wnmuCellStatus');
    if (status) status.textContent = 'Box note cleared.';
  }

  function targetForDateTime(date, time) {
    const mk = makeKey(date, time);
    const programCell = document.querySelector(`.program-cell[data-entry-id^="${css(`${date}__${time}__`)}"]`);
    if (programCell) return targetFromCell(programCell);
    const slot = timeToSlot(time);
    if (slot < 0) return null;
    const tables = Array.from(document.querySelectorAll('table.screen-week-grid'));
    for (const table of tables) {
      const dates = headerDates(table);
      const dayIndex = dates.indexOf(date);
      if (dayIndex < 0) continue;
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const row = rows[slot];
      if (!row) continue;
      const cell = cellForDayInRow(row, dayIndex);
      if (!cell || cell.classList.contains('outside')) continue;
      const target = targetFromCell(cell);
      if (target && target.key === mk) return target;
    }
    return null;
  }

  function cellForDayInRow(row, dayIndex) {
    const cells = Array.from(row.children).filter(td => !td.classList.contains('time-col'));
    if (!cells.length) return null;
    const headers = Array.from(row.closest('table')?.querySelectorAll('thead th:not(.time-col)') || []);
    if (!headers.length) return cells[dayIndex] || null;
    const headerRect = headers[dayIndex]?.getBoundingClientRect();
    if (!headerRect) return cells[dayIndex] || null;
    const center = headerRect.left + headerRect.width / 2;
    let best = null;
    let dist = Infinity;
    cells.forEach(cell => {
      const r = cell.getBoundingClientRect();
      const d = Math.abs((r.left + r.width / 2) - center);
      if (d < dist) {
        dist = d;
        best = cell;
      }
    });
    return best;
  }

  function restoreVisibleNotes() {
    restoreAttempts += 1;
    const canonical = readCanonicalStore();
    Object.entries(canonical).forEach(([key, rec]) => {
      if (!rec || rec.cleared || rec.channelCode !== channelCode()) return;
      if (rec.monthKey && monthKey() && rec.monthKey !== monthKey()) return;
      const target = targetForDateTime(rec.date, rec.time);
      if (target) paintOverlay(target, rec);
    });

    // Read legacy blank notes only once they can be mapped to visible date/time cells.
    oldBlankStoreKeys().forEach(storeKey => {
      const store = readJson(storeKey, {});
      Object.entries(store).forEach(([oldKey, mark]) => {
        if (!mark?.rectNote?.text) return;
        const m = String(oldKey).match(/^(13\.1|13\.3)__(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})__blank-slot$/);
        if (!m || m[1] !== channelCode()) return;
        const target = targetForDateTime(m[2], m[3]);
        if (!target || readCanonicalRecord(target.key)) return;
        paintOverlay(target, { text: mark.rectNote.text, durationMin: mark.rectNote.durationMin || 30, tags: mark.tags || {} });
      });
    });

    // Read legacy program notes that the old renderer can map by current entry id.
    const main = readJson(storageKey(), {});
    Object.entries(main).forEach(([entryId, item]) => {
      if (!item?.rectNote) return;
      const dt = parseEntryId(entryId);
      if (!dt) return;
      const target = targetForDateTime(dt.date, dt.time);
      if (!target || target.entryId !== entryId || readCanonicalRecord(target.key)) return;
      const note = legacyProgramNote(target);
      if (note) paintOverlay(target, note);
    });

    if (restoreAttempts < 8) {
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(restoreVisibleNotes, restoreAttempts < 4 ? 350 : 900);
    }
  }

  function injectStyles() {
    if (document.getElementById('wnmuCellInteractionsV150Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuCellInteractionsV150Styles';
    style.textContent = `
      #wnmuCellOverrideLayer { position:absolute; left:0; top:0; width:0; height:0; z-index:2147482000; pointer-events:none; }
      .wnmu-cell-override-box { position:absolute; box-sizing:border-box; background:rgba(255,255,255,.96); border:2px solid rgba(12,18,32,.86); color:#111; border-radius:4px; box-shadow:0 2px 7px rgba(0,0,0,.22); padding:5px 6px 16px; overflow:hidden; font:12px/1.22 system-ui,sans-serif; pointer-events:none; }
      .wnmu-cell-override-text { white-space:normal; overflow:hidden; font-weight:700; }
      .wnmu-cell-override-tags { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:3px; }
      .wnmu-cell-override-tags span { display:inline-flex; align-items:center; border:1px solid rgba(0,0,0,.25); border-radius:999px; padding:1px 5px; font-size:9px; font-weight:800; background:rgba(255,255,255,.72); }
      .wnmu-cell-override-duration { position:absolute; right:4px; bottom:2px; font-size:9px; opacity:.62; }
      .program-cell.wnmu-has-cell-override > .draw-rect-note,
      .program-cell.wnmu-has-cell-override > .wnmu-blank-slot-content { display:none!important; }
      .wnmu-cell-menu { z-index:2147483000; min-width:360px; max-width:460px; }
      .wnmu-cell-note-tools { border:1px solid rgba(255,255,255,.22); border-radius:10px; padding:10px; margin:10px 0; background:rgba(255,255,255,.06); }
      .wnmu-cell-note-tools legend { font-weight:800; }
      .wnmu-cell-duration-options { display:flex; flex-wrap:wrap; gap:5px; margin:5px 0 8px; }
      .wnmu-cell-pill { display:inline-flex; align-items:center; gap:3px; font-size:12px; border:1px solid rgba(255,255,255,.24); border-radius:999px; padding:4px 7px; cursor:pointer; }
      .wnmu-cell-pill input { margin:0; }
      .manual-rect-text { width:100%; box-sizing:border-box; border-radius:8px; border:1px solid rgba(255,255,255,.28); padding:7px; resize:vertical; font:13px/1.3 system-ui,sans-serif; color:#111; background:#fff; }
      .manual-rect-label { font-size:12px; font-weight:800; margin:6px 0 5px; }
      .manual-rect-help { margin-top:6px; font-size:11px; opacity:.75; line-height:1.25; }
      @media print { #wnmuCellOverrideLayer { display:none!important; } }
    `;
    document.head.appendChild(style);
  }

  function installHandlers() {
    document.addEventListener('contextmenu', event => {
      const cell = event.target.closest?.('.program-cell');
      if (!cell || cell.classList.contains('outside')) return;
      const target = targetFromCell(cell);
      if (!target) return;
      selectedTarget = target;
      if (!cell.dataset.entryId) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openBlankMenu(target, event);
        return;
      }
      window.setTimeout(() => {
        injectProgramControls(document.getElementById('contextMenu'), selectedTarget);
      }, 0);
    }, true);

    document.addEventListener('click', event => {
      const customMenu = document.getElementById('wnmuCellMenu');
      if (customMenu && !customMenu.classList.contains('hidden') && !customMenu.contains(event.target)) hideBlankMenu();

      if (event.target.closest?.('#drawRectBtn')) {
        if (document.getElementById('wnmuProgramCellTools')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          saveFromProgramMenu();
          const menu = document.getElementById('contextMenu');
          if (menu) {
            menu.classList.add('hidden');
            menu.setAttribute('aria-hidden', 'true');
          }
        }
      }

      if (event.target.closest?.('#clearRectBtn')) {
        if (selectedTarget && document.getElementById('wnmuProgramCellTools')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          clearTargetNote(selectedTarget, false);
        }
      }
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideBlankMenu();
    });
  }

  function start() {
    injectStyles();
    installHandlers();
    ensureOverlayLayer();
    window.WNMU_CELL_INTERACTIONS_VERSION = VERSION;
    window.setTimeout(restoreVisibleNotes, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
