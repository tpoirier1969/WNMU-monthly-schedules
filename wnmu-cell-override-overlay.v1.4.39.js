(function () {
  'use strict';

  const VERSION = 'v1.4.39-event-driven-cell-overrides';
  const BLANK_MARK_SUFFIX = '::blankSlotMarks.v1.4.30';
  const BLANK_LEGACY_SUFFIXES = [
    '::blankSlotMarks.v1.4.29',
    '::blankSlotMarks.v1.4.28',
    '::blankSlotSatelliteOverrides.v1.4.28',
    '::blankSlotSatelliteOverrides.v1.4.26'
  ];
  const PROGRAM_META_SUFFIX = '::manualRectMeta.v1.4.17';
  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  const TAG_ORDER = [
    'newSeries', 'highlight', 'oneOff', 'monthlyTopic', 'fundraiser',
    'programmersChoice', 'holiday', 'noteworthy', 'educational', 'local',
    'michigan', 'arts'
  ];
  const TAG_META = {
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
  let startupObserver = null;
  let startupSettleTimer = null;
  let startupFallbackTimer = null;
  let startupRestoreDone = false;
  let resizeTimer = null;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function channelCode() { return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1'); }
  function storageBase() { return String(cfg().storageKey || '').trim(); }
  function programMarksKey() { return storageBase(); }
  function programMetaKey() { return storageBase() ? `${storageBase()}${PROGRAM_META_SUFFIX}` : ''; }
  function currentMonthKey() {
    const meta = String(window.WNMU_CURRENT_MONTH_META?.monthKey || '').trim();
    if (/^\d{4}-\d{2}$/.test(meta)) return meta;
    const query = String(new URLSearchParams(location.search).get('month') || '').trim();
    if (/^\d{4}-\d{2}$/.test(query)) return query;
    return '';
  }
  function currentYear() {
    const mk = currentMonthKey();
    return mk ? Number(mk.slice(0, 4)) : new Date().getFullYear();
  }
  function pad(num) { return String(num).padStart(2, '0'); }
  function slotToTime(slot) {
    const hour = Math.floor(slot / 2);
    return `${pad(hour)}:${slot % 2 ? '30' : '00'}`;
  }
  function nearestDuration(value, fallback) {
    const wanted = Number(value || fallback || 30) || 30;
    return DURATIONS.reduce((best, next) => Math.abs(next - wanted) < Math.abs(best - wanted) ? next : best, DURATIONS[0]);
  }
  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function readJson(key, fallback) {
    if (!key) return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (err) {
      console.warn(`${VERSION}: could not read ${key}`, err);
      return fallback;
    }
  }
  function writeJson(key, value) {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(value || {}));
  }
  function localStorageKeysOnce() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key) out.push(key);
      }
    } catch (err) {
      console.warn(`${VERSION}: localStorage keys unavailable`, err);
    }
    return out;
  }
  function parseMonthDay(label) {
    const months = {
      jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
      apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
      aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10',
      nov: '11', november: '11', dec: '12', december: '12'
    };
    const clean = String(label || '').trim().toLowerCase().replace(/,/g, '');
    const match = clean.match(/^([a-z]+)\s+(\d{1,2})$/);
    if (!match) return '';
    const month = months[match[1]];
    if (!month) return '';
    return `${currentYear()}-${month}-${pad(Number(match[2]))}`;
  }
  function headerDates(table) {
    return Array.from(table.querySelectorAll('thead th:not(.time-col)')).map(th => {
      const lines = (th.innerText || th.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
      return parseMonthDay(lines[lines.length - 1] || '');
    });
  }
  function slotKey(date, time) { return `${channelCode()}__${date}__${time}__blank-slot`; }
  function isCurrentBlankSlotKey(key) {
    const channel = channelCode();
    const month = currentMonthKey();
    const text = String(key || '');
    if (!text.startsWith(`${channel}__`)) return false;
    if (month && !text.startsWith(`${channel}__${month}-`)) return false;
    return text.endsWith('__blank-slot');
  }
  function blankMarksKey() {
    const base = storageBase();
    if (base) return `${base}${BLANK_MARK_SUFFIX}`;
    const found = localStorageKeysOnce().find(key => {
      if (!key.endsWith(BLANK_MARK_SUFFIX)) return false;
      const marks = readJson(key, {});
      return Object.keys(marks).some(isCurrentBlankSlotKey);
    });
    if (found) return found;
    const channel = channelCode().replace(/[^\d.]/g, '') || '13.1';
    const month = currentMonthKey() || 'current';
    return `wnmuMonthlySchedules::${channel}::${month}${BLANK_MARK_SUFFIX}`;
  }
  function blankStorageKeysForStartup() {
    const keys = new Set();
    const base = storageBase();
    if (base) {
      keys.add(`${base}${BLANK_MARK_SUFFIX}`);
      BLANK_LEGACY_SUFFIXES.forEach(suffix => keys.add(`${base}${suffix}`));
    }
    localStorageKeysOnce().forEach(key => {
      if (key.endsWith(BLANK_MARK_SUFFIX) || BLANK_LEGACY_SUFFIXES.some(suffix => key.endsWith(suffix))) keys.add(key);
    });
    return Array.from(keys);
  }
  function readAllBlankMarksStartupOnly() {
    const out = {};
    blankStorageKeysForStartup().forEach(key => {
      const marks = readJson(key, {});
      Object.entries(marks).forEach(([blankKey, mark]) => {
        if (!isCurrentBlankSlotKey(blankKey)) return;
        if (mark && typeof mark === 'object') out[blankKey] = mark;
      });
    });
    return out;
  }
  function readBlankMark(blankKey) {
    const current = readJson(blankMarksKey(), {});
    if (current[blankKey]) return current[blankKey];
    // Targeted legacy fallback for the selected cell only, not a full-page scan.
    const base = storageBase();
    const keys = base ? BLANK_LEGACY_SUFFIXES.map(suffix => `${base}${suffix}`) : [];
    for (const key of keys) {
      const marks = readJson(key, {});
      if (marks[blankKey]) return marks[blankKey];
    }
    return {};
  }
  function pickTags(raw) {
    const tags = {};
    if (!raw || typeof raw !== 'object') return tags;
    TAG_ORDER.forEach(tag => { if (typeof raw[tag] === 'boolean') tags[tag] = raw[tag]; });
    return tags;
  }
  function readProgramMarks() { return readJson(programMarksKey(), {}); }
  function readProgramMeta() { return readJson(programMetaKey(), {}); }
  function getProgramMark(entryId) {
    const marks = readProgramMarks();
    const meta = readProgramMeta();
    const raw = marks[entryId] && typeof marks[entryId] === 'object' ? marks[entryId] : {};
    const rect = raw.rectNote && typeof raw.rectNote === 'object' ? { ...raw.rectNote, ...(meta[entryId] || {}) } : null;
    return { tags: raw.tags && typeof raw.tags === 'object' ? { ...raw.tags } : pickTags(raw), rectNote: rect };
  }
  function buildPayload(next) {
    const payload = {};
    const tags = {};
    TAG_ORDER.forEach(tag => { if (next.tags && next.tags[tag]) tags[tag] = true; });
    if (Object.keys(tags).length) payload.tags = tags;
    if (typeof next.satelliteFeed === 'boolean') payload.satelliteFeed = next.satelliteFeed;
    const noteText = String(next.rectNote?.text || '').trim();
    if (noteText) payload.rectNote = { text: noteText, durationMin: nearestDuration(next.rectNote.durationMin, 30), anchor: 'left' };
    return payload;
  }
  function writeBlankMark(target, next) {
    const key = blankMarksKey();
    const marks = readJson(key, {});
    const payload = buildPayload(next);
    if (Object.keys(payload).length) marks[target.key] = payload;
    else delete marks[target.key];
    writeJson(key, marks);
    window.WNMU_LAST_CELL_OVERRIDE_SAVE = { type: 'blank', target: { ...target, cell: undefined }, mark: payload, savedAt: new Date().toISOString(), savedBy: VERSION, storageKey: key };
    return payload;
  }
  function writeProgramMark(target, next) {
    const marksKey = programMarksKey();
    const metaKey = programMetaKey();
    const marks = readJson(marksKey, {});
    const meta = readJson(metaKey, {});
    const existing = marks[target.entryId] && typeof marks[target.entryId] === 'object' ? marks[target.entryId] : {};
    const payload = buildPayload(next);
    const merged = { ...existing };
    TAG_ORDER.forEach(tag => { delete merged[tag]; });
    if (payload.tags) merged.tags = payload.tags;
    else delete merged.tags;
    if (payload.rectNote) {
      merged.rectNote = {
        x: 4, y: 4, w: 92, h: 92,
        text: payload.rectNote.text,
        durationMin: payload.rectNote.durationMin,
        anchor: 'left',
        manualDuration: true,
        anchorMode: 'upper-left'
      };
      meta[target.entryId] = { durationMin: payload.rectNote.durationMin, anchor: 'left', manualDuration: true, anchorMode: 'upper-left' };
    } else {
      delete merged.rectNote;
      delete meta[target.entryId];
    }
    if (Object.keys(merged).length) marks[target.entryId] = merged;
    else delete marks[target.entryId];
    writeJson(marksKey, marks);
    writeJson(metaKey, meta);
    window.WNMU_LAST_CELL_OVERRIDE_SAVE = { type: 'program', target: { ...target, cell: undefined }, mark: merged, savedAt: new Date().toISOString(), savedBy: VERSION, storageKey: marksKey };
    return merged;
  }
  function isScheduleCell(cell) { return !!cell && cell.classList.contains('program-cell') && !cell.classList.contains('outside'); }
  function cellFromEvent(event) { return event.target?.closest?.('td.program-cell, .program-cell') || null; }
  function annotateCell(cell) {
    if (!isScheduleCell(cell)) return null;
    const table = cell.closest('table.screen-week-grid');
    const row = cell.closest('tr');
    if (!table || !row) return null;
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const rowIndex = rows.indexOf(row);
    if (rowIndex < 0) return null;
    const dates = headerDates(table);
    const headers = Array.from(table.querySelectorAll('thead th:not(.time-col)'));
    const cellRect = cell.getBoundingClientRect();
    const center = cellRect.left + cellRect.width / 2;
    let bestIndex = -1;
    let bestDistance = Infinity;
    headers.forEach((th, index) => {
      const rect = th.getBoundingClientRect();
      const dist = Math.abs(center - (rect.left + rect.width / 2));
      if (dist < bestDistance) { bestDistance = dist; bestIndex = index; }
    });
    const date = dates[bestIndex];
    const time = slotToTime(rowIndex);
    if (!date) return null;
    if (cell.dataset.entryId) {
      cell.dataset.overrideDate = date;
      cell.dataset.overrideTime = time;
      return { type: 'program', entryId: cell.dataset.entryId, cell, date, time, key: `program__${cell.dataset.entryId}` };
    }
    const key = slotKey(date, time);
    cell.classList.add('wnmu-blank-slot-cell');
    cell.dataset.blankSlot = 'true';
    cell.dataset.blankDate = date;
    cell.dataset.blankTime = time;
    cell.dataset.blankSlotKey = key;
    return { type: 'blank', date, time, key, cell };
  }
  function annotateTablesOnce() {
    document.querySelectorAll('table.screen-week-grid').forEach(table => {
      const dates = headerDates(table);
      const skip = new Array(7).fill(0);
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      rows.forEach((tr, slot) => {
        const time = slotToTime(slot);
        const cells = Array.from(tr.children).filter(td => !td.classList.contains('time-col'));
        let ptr = 0;
        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
          if (skip[dayIndex] > 0) { skip[dayIndex] -= 1; continue; }
          const cell = cells[ptr++];
          if (!cell) continue;
          const span = Math.max(1, Number(cell.rowSpan || cell.getAttribute('rowspan') || 1));
          if (span > 1) skip[dayIndex] = span - 1;
          if (cell.classList.contains('outside')) continue;
          const date = dates[dayIndex];
          if (!date) continue;
          if (cell.dataset.entryId) {
            cell.dataset.overrideDate = date;
            cell.dataset.overrideTime = time;
          } else {
            const key = slotKey(date, time);
            cell.classList.add('wnmu-blank-slot-cell');
            cell.dataset.blankSlot = 'true';
            cell.dataset.blankDate = date;
            cell.dataset.blankTime = time;
            cell.dataset.blankSlotKey = key;
          }
        }
      });
    });
  }
  function rememberTarget(cell) {
    const target = annotateCell(cell);
    if (target) selectedTarget = target;
    const blankMenu = document.getElementById('blankSlotContextMenu');
    const programMenu = document.getElementById('contextMenu');
    if (target?.type === 'blank' && blankMenu) blankMenu.dataset.overrideKey = target.key;
    if (target?.type === 'program' && programMenu) programMenu.dataset.overrideKey = target.key;
    return target;
  }
  function tagsFromMenu(menu) {
    const tags = {};
    TAG_ORDER.forEach(tag => {
      const input = menu?.querySelector(`input[name="${cssEscape(tag)}"]`);
      if (input?.checked) tags[tag] = true;
    });
    return tags;
  }
  function durationFromMenu(menu, isProgram) {
    const selector = isProgram ? 'input[name="manualRectDuration"]:checked' : 'input[name="blankRectDuration"]:checked';
    return nearestDuration(menu?.querySelector(selector)?.value || 30, 30);
  }
  function textFromMenu(menu, isProgram) {
    const selector = isProgram ? '#manualRectText' : '#blankRectText';
    return String(menu?.querySelector(selector)?.value || '').trim();
  }
  function menuStateFromBlankDom() {
    const menu = document.getElementById('blankSlotContextMenu');
    return { tags: tagsFromMenu(menu), satelliteFeed: !!menu?.querySelector('input[name="blankSatelliteFeed"]')?.checked, rectNote: { text: textFromMenu(menu, false), durationMin: durationFromMenu(menu, false), anchor: 'left' } };
  }
  function menuStateFromProgramDom() {
    const menu = document.getElementById('contextMenu');
    return { tags: tagsFromMenu(menu), rectNote: { text: textFromMenu(menu, true), durationMin: durationFromMenu(menu, true), anchor: 'left' } };
  }
  function setStatus(menuType, message, kind) {
    const isProgram = menuType === 'program';
    const menu = document.getElementById(isProgram ? 'contextMenu' : 'blankSlotContextMenu');
    const id = isProgram ? 'manualOverrideSaveStatus' : 'blankSaveStatus';
    let el = document.getElementById(id);
    if (!el && menu) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'cell-override-save-status';
      el.setAttribute('aria-live', 'polite');
      if (isProgram) menu.querySelector('#manualRectDurationTools, .rect-tools')?.appendChild(el);
      else menu.querySelector('.blank-slot-rect-tools, .rect-tools')?.appendChild(el);
    }
    if (!el) return;
    el.textContent = message || '';
    el.dataset.kind = kind || 'ok';
  }
  function hideMenuById(id) {
    const menu = document.getElementById(id);
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
  }
  function ensureProgramControls() {
    const menu = document.getElementById('contextMenu');
    const rectTools = menu?.querySelector('.rect-tools');
    if (!rectTools) return;
    let controls = document.getElementById('manualRectDurationTools');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'manualRectDurationTools';
      controls.className = 'manual-rect-duration-tools';
      controls.innerHTML = `
        <div class="manual-rect-label">Box note length</div>
        <div class="manual-rect-duration-options">
          ${DURATIONS.map(n => `<label class="manual-rect-pill"><input type="radio" name="manualRectDuration" value="${n}"><span>${n}</span></label>`).join('')}
        </div>
        <label class="manual-rect-label" for="manualRectText">Box note text</label>
        <textarea id="manualRectText" class="manual-rect-text" rows="3" placeholder="Type the note to draw over this cell"></textarea>
        <div class="manual-rect-help">Draws a white override box on the top layer, starting at the upper-left of this cell. Use it to replace or clarify last-minute schedule changes.</div>
        <div id="manualOverrideSaveStatus" class="cell-override-save-status" aria-live="polite"></div>
      `;
      rectTools.insertBefore(controls, rectTools.querySelector('.rect-actions') || null);
    }
    const drawBtn = document.getElementById('drawRectBtn');
    if (drawBtn) drawBtn.textContent = 'Save box note';
  }
  function fillProgramControls(target) {
    if (!target || target.type !== 'program') return;
    ensureProgramControls();
    const mark = getProgramMark(target.entryId);
    const spanDefault = Math.max(1, Number(target.cell?.rowSpan || 1)) * 30;
    const duration = nearestDuration(mark.rectNote?.durationMin, spanDefault);
    const durationInput = document.querySelector(`input[name="manualRectDuration"][value="${duration}"]`);
    if (durationInput) durationInput.checked = true;
    const textArea = document.getElementById('manualRectText');
    if (textArea) textArea.value = mark.rectNote?.text || '';
    setStatus('program', mark.rectNote?.text ? 'Existing box note loaded for editing.' : '', 'ok');
  }
  function fillBlankControls(target) {
    if (!target || target.type !== 'blank') return;
    const menu = document.getElementById('blankSlotContextMenu');
    if (!menu) return;
    const mark = readBlankMark(target.key);
    const duration = nearestDuration(mark.rectNote?.durationMin, 30);
    const durationInput = menu.querySelector(`input[name="blankRectDuration"][value="${duration}"]`);
    if (durationInput) durationInput.checked = true;
    const textArea = menu.querySelector('#blankRectText');
    if (textArea) textArea.value = mark.rectNote?.text || '';
    TAG_ORDER.forEach(tag => {
      const input = menu.querySelector(`input[name="${cssEscape(tag)}"]`);
      if (input && mark.tags && typeof mark.tags[tag] === 'boolean') input.checked = !!mark.tags[tag];
    });
    if (mark.rectNote?.text) setStatus('blank', 'Existing box note loaded for editing.', 'ok');
  }
  function currentOrRecoveredTarget(type) {
    if (selectedTarget && (!type || selectedTarget.type === type)) return selectedTarget;
    return null;
  }
  function clearTarget(target) {
    if (!target) return;
    if (target.type === 'blank') {
      const key = blankMarksKey();
      const marks = readJson(key, {});
      delete marks[target.key];
      writeJson(key, marks);
      setStatus('blank', 'Box note cleared.', 'ok');
    } else if (target.type === 'program') {
      const marksKey = programMarksKey();
      const marks = readJson(marksKey, {});
      const existing = marks[target.entryId] && typeof marks[target.entryId] === 'object' ? marks[target.entryId] : {};
      delete existing.rectNote;
      if (Object.keys(existing).length) marks[target.entryId] = existing;
      else delete marks[target.entryId];
      writeJson(marksKey, marks);
      const metaKey = programMetaKey();
      const meta = readJson(metaKey, {});
      delete meta[target.entryId];
      writeJson(metaKey, meta);
      const textArea = document.getElementById('manualRectText');
      if (textArea) textArea.value = '';
      setStatus('program', 'Box note cleared.', 'ok');
    }
    removeOverlayForTarget(target);
  }
  function visibleTags(tags) { return TAG_ORDER.filter(tag => tags && tags[tag]); }
  function tagLabel(tag) { return TAG_META[tag]?.label || tag; }
  function tagColor(tag) { return TAG_META[tag]?.color || '#e6e6e6'; }
  function ensureOverlayLayer() {
    let layer = document.getElementById('wnmuCellOverrideTopLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'wnmuCellOverrideTopLayer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }
  function overlayCellForBlankKey(blankKey) { return Array.from(document.querySelectorAll('.wnmu-blank-slot-cell')).find(cell => cell.dataset.blankSlotKey === blankKey) || null; }
  function overlayCellForEntryId(entryId) { return document.querySelector(`.program-cell[data-entry-id="${cssEscape(entryId)}"]`); }
  function targetOverlayKey(target) { return target?.type === 'program' ? `program__${target.entryId}` : target?.key; }
  function removeOverlayForKey(key) {
    if (!key) return;
    document.querySelectorAll(`.wnmu-cell-override-box[data-override-key="${cssEscape(key)}"]`).forEach(el => el.remove());
    document.querySelectorAll('.wnmu-has-cell-override-box').forEach(cell => {
      if ((cell.dataset.entryId && `program__${cell.dataset.entryId}` === key) || cell.dataset.blankSlotKey === key) {
        cell.classList.remove('wnmu-has-cell-override-box', 'wnmu-has-blank-note-box');
      }
    });
  }
  function removeOverlayForTarget(target) { removeOverlayForKey(targetOverlayKey(target)); }
  function renderOverlayBox(targetKey, mark, cell, type) {
    const noteText = String(mark?.rectNote?.text || '').trim();
    removeOverlayForKey(targetKey);
    if (!noteText || !cell) return false;
    const layer = ensureOverlayLayer();
    const rect = cell.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const rowRect = cell.closest('tr')?.getBoundingClientRect?.();
    const cellSlots = Math.max(1, Number(cell.rowSpan || 1));
    const baseHeight = Math.max(18, rowRect?.height || (rect.height / cellSlots) || rect.height || 0);
    const duration = nearestDuration(mark.rectNote.durationMin, cellSlots * 30);
    const slots = Math.max(1, Math.round(duration / 30));
    const tags = visibleTags(mark.tags || {});
    const accent = tags[0] ? tagColor(tags[0]) : '#111';
    const box = document.createElement('div');
    box.className = `wnmu-cell-override-box ${type === 'program' ? 'wnmu-cell-override-program' : 'wnmu-cell-override-blank'}`;
    box.dataset.overrideKey = targetKey;
    box.dataset.overrideType = type;
    box.style.left = `${window.scrollX + rect.left + 3}px`;
    box.style.top = `${window.scrollY + rect.top + 2}px`;
    box.style.width = `${Math.max(46, rect.width - 6)}px`;
    box.style.height = `${Math.max(24, baseHeight * slots - 4)}px`;
    box.style.borderLeftColor = accent;
    const tagHtml = tags.length ? `<div class="wnmu-cell-override-tags">${tags.map(tag => `<span class="wnmu-cell-override-tag" style="background:${escapeHtml(tagColor(tag))}">${escapeHtml(tagLabel(tag))}</span>`).join('')}</div>` : '';
    box.innerHTML = `${tagHtml}<div class="wnmu-cell-override-text">${escapeHtml(noteText)}</div><div class="wnmu-cell-override-duration">${duration} min</div>`;
    layer.appendChild(box);
    cell.classList.add('wnmu-has-cell-override-box');
    if (type === 'blank') cell.classList.add('wnmu-has-blank-note-box');
    return true;
  }
  function renderTarget(target) {
    if (!target) return false;
    let cell = target.cell && document.documentElement.contains(target.cell) ? target.cell : null;
    if (target.type === 'program') {
      if (!cell) cell = overlayCellForEntryId(target.entryId);
      const mark = getProgramMark(target.entryId);
      return renderOverlayBox(`program__${target.entryId}`, mark, cell, 'program');
    }
    if (!cell) cell = overlayCellForBlankKey(target.key);
    const mark = readBlankMark(target.key);
    return renderOverlayBox(target.key, mark, cell, 'blank');
  }
  function renderStartupExistingNotesOnce() {
    if (startupRestoreDone) return;
    startupRestoreDone = true;
    if (startupObserver) startupObserver.disconnect();
    window.clearTimeout(startupSettleTimer);
    window.clearTimeout(startupFallbackTimer);
    annotateTablesOnce();
    const layer = ensureOverlayLayer();
    layer.querySelectorAll('.wnmu-cell-override-box').forEach(el => el.remove());
    const blankMarks = readAllBlankMarksStartupOnly();
    const programMarks = readProgramMarks();
    const programMeta = readProgramMeta();
    let rendered = 0;
    Object.entries(blankMarks).forEach(([key, mark]) => {
      if (!mark?.rectNote?.text) return;
      const cell = overlayCellForBlankKey(key);
      if (cell && renderOverlayBox(key, mark, cell, 'blank')) rendered += 1;
    });
    Object.entries(programMarks).forEach(([entryId, raw]) => {
      if (!raw?.rectNote?.text) return;
      const cell = overlayCellForEntryId(entryId);
      if (!cell) return;
      const mark = { tags: raw.tags && typeof raw.tags === 'object' ? raw.tags : pickTags(raw), rectNote: { ...raw.rectNote, ...(programMeta[entryId] || {}) } };
      if (renderOverlayBox(`program__${entryId}`, mark, cell, 'program')) rendered += 1;
    });
    window.WNMU_CELL_OVERRIDE_OVERLAY = { version: VERSION, mode: 'startup-once-plus-targeted-right-click', renderedCount: rendered, lastRenderAt: new Date().toISOString() };
  }
  function installStartupObserver() {
    const target = document.getElementById('weekGrids') || document.body;
    if (!target || startupObserver) return;
    startupObserver = new MutationObserver(() => {
      if (startupRestoreDone) return;
      window.clearTimeout(startupSettleTimer);
      startupSettleTimer = window.setTimeout(renderStartupExistingNotesOnce, 650);
    });
    startupObserver.observe(target, { childList: true, subtree: true });
    startupFallbackTimer = window.setTimeout(renderStartupExistingNotesOnce, 4500);
  }
  function installStyles() {
    if (document.getElementById('wnmuCellOverrideOverlayV1439Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuCellOverrideOverlayV1439Styles';
    style.textContent = `
      #wnmuCellOverrideTopLayer {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 0 !important;
        height: 0 !important;
        pointer-events: none !important;
        z-index: 2147483000 !important;
        overflow: visible !important;
      }
      .wnmu-cell-override-box {
        position: absolute !important;
        box-sizing: border-box !important;
        z-index: 2147483001 !important;
        background: #fff !important;
        color: #111 !important;
        border: 2px solid #111 !important;
        border-left-width: 8px !important;
        border-radius: 3px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,.24) !important;
        padding: 4px 6px 14px !important;
        overflow: hidden !important;
        font: 700 11px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }
      .wnmu-cell-override-tags { display: flex !important; flex-wrap: wrap !important; gap: 2px !important; margin-bottom: 3px !important; }
      .wnmu-cell-override-tag { display: inline-block !important; color: #111 !important; border: 1px solid rgba(0,0,0,.25) !important; border-radius: 999px !important; padding: 1px 5px !important; max-width: 100% !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; font-size: 9px !important; font-weight: 800 !important; }
      .wnmu-cell-override-text { white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
      .wnmu-cell-override-duration { position: absolute !important; right: 4px !important; bottom: 2px !important; font-size: 8px !important; font-weight: 700 !important; color: rgba(0,0,0,.48) !important; }
      .wnmu-has-cell-override-box > .wnmu-blank-slot-content,
      .wnmu-has-blank-note-box > .wnmu-blank-slot-content,
      .wnmu-has-cell-override-box .wnmu-blank-slot-content,
      .wnmu-has-cell-override-box > .draw-rect-note { display: none !important; }
      #blankSlotContextMenu, #contextMenu { z-index: 2147483002 !important; }
      .manual-rect-duration-tools { border: 1px solid rgba(255,255,255,.22); border-radius: 10px; padding: 10px; margin: 10px 0; background: rgba(255,255,255,.06); }
      .manual-rect-label { font-size: 12px; font-weight: 800; margin: 6px 0 5px; }
      .manual-rect-duration-options { display: flex; flex-wrap: wrap; gap: 5px; }
      .manual-rect-pill { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; padding: 4px 7px; cursor: pointer; }
      .manual-rect-pill input { margin: 0; }
      .manual-rect-text { width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid rgba(255,255,255,.28); padding: 7px; resize: vertical; font: 13px/1.3 system-ui,sans-serif; color: #111; background: #fff; }
      .manual-rect-help { margin-top: 6px; font-size: 11px; opacity: .75; line-height: 1.25; }
      .cell-override-save-status[data-kind="ok"], #blankSaveStatus[data-kind="ok"] { color: #145c22 !important; font-weight: 800 !important; }
      .cell-override-save-status[data-kind="pending"], #blankSaveStatus[data-kind="pending"] { color: #6f4c00 !important; font-weight: 800 !important; }
      .cell-override-save-status[data-kind="error"], #blankSaveStatus[data-kind="error"] { color: #9b111e !important; font-weight: 800 !important; }
      @media print { .wnmu-cell-override-box { box-shadow: none !important; background: #fff !important; border-color: #111 !important; color: #000 !important; } }
    `;
    document.head.appendChild(style);
  }
  function installEventHandlers() {
    document.addEventListener('contextmenu', event => {
      const cell = cellFromEvent(event);
      if (!isScheduleCell(cell)) return;
      const target = rememberTarget(cell);
      if (!target) return;
      window.setTimeout(() => {
        if (target.type === 'program') fillProgramControls(target);
        else fillBlankControls(target);
        renderTarget(target);
      }, 80);
      window.setTimeout(() => {
        if (target.type === 'program') fillProgramControls(target);
        else fillBlankControls(target);
      }, 260);
    }, true);
    document.addEventListener('input', event => {
      if (event.target?.matches?.('#manualRectText')) setStatus('program', 'Unsaved box note text.', 'pending');
      if (event.target?.matches?.('#blankRectText')) setStatus('blank', 'Unsaved box note text.', 'pending');
    }, true);
    document.addEventListener('change', event => {
      if (event.target?.matches?.('input[name="manualRectDuration"]')) setStatus('program', 'Unsaved box note length.', 'pending');
      if (event.target?.matches?.('input[name="blankRectDuration"]')) setStatus('blank', 'Unsaved box note length.', 'pending');
    }, true);
    document.addEventListener('click', event => {
      if (event.target?.closest?.('#blankSlotCloseBtn')) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); hideMenuById('blankSlotContextMenu'); return;
      }
      if (event.target?.closest?.('#closeMenuBtn')) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); hideMenuById('contextMenu'); return;
      }
      const blankSave = event.target?.closest?.('#blankSaveRectBtn');
      const blankClear = event.target?.closest?.('#blankClearRectBtn');
      if (blankSave || blankClear) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        const target = currentOrRecoveredTarget('blank');
        if (!target) { setStatus('blank', 'No cell selected. Right-click the schedule cell again.', 'error'); return; }
        if (blankClear) { clearTarget(target); const textArea = document.getElementById('blankRectText'); if (textArea) textArea.value = ''; return; }
        const saved = writeBlankMark(target, menuStateFromBlankDom());
        setStatus('blank', saved.rectNote?.text ? 'Box note saved and drawn on top layer.' : 'Blank-slot settings saved.', 'ok');
        renderTarget(target);
        return;
      }
      const programSave = event.target?.closest?.('#drawRectBtn');
      const programClear = event.target?.closest?.('#clearRectBtn');
      if (programSave || programClear) {
        const target = currentOrRecoveredTarget('program');
        if (!target) return;
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        if (programClear) { clearTarget(target); return; }
        const saved = writeProgramMark(target, menuStateFromProgramDom());
        setStatus('program', saved.rectNote?.text ? 'Box note saved and drawn on top layer.' : 'Program settings saved.', 'ok');
        renderTarget(target);
      }
    }, true);
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        startupRestoreDone = false;
        renderStartupExistingNotesOnce();
      }, 200);
    });
  }
  function start() {
    installStyles();
    installEventHandlers();
    installStartupObserver();
    window.WNMU_CELL_OVERRIDE_OVERLAY_VERSION = VERSION;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
