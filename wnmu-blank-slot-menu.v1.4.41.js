(function () {
  'use strict';

  const VERSION = 'v1.4.41-event-driven-blank-slot-menu';
  const SAT_COLOR = '#e6e6e6';
  const DEFAULT_TAGS = ['newSeries','highlight','oneOff','monthlyTopic','fundraiser','programmersChoice','holiday','noteworthy','educational','local','michigan','arts'];
  const DEFAULT_META = {
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
  const CLASS_BY_TAG = {
    newSeries: 'check-new-series',
    highlight: 'check-highlight',
    oneOff: 'check-one-off',
    monthlyTopic: 'check-monthly-topic',
    fundraiser: 'check-fundraiser',
    programmersChoice: 'check-programmers-choice',
    holiday: 'check-holiday',
    noteworthy: 'check-noteworthy',
    educational: 'check-educational',
    local: 'check-local',
    michigan: 'check-michigan',
    arts: 'check-arts'
  };

  let active = null;
  let bootRestoreDone = false;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function channelCode() { return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1'); }
  function storageKey() { return cfg().storageKey || ''; }
  function marksKey() { return storageKey() ? `${storageKey()}::blankSlotMarks.v1.4.30` : ''; }
  function monthKey() {
    return String(window.WNMU_CURRENT_MONTH_META?.monthKey || new URLSearchParams(location.search).get('month') || '');
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function slotToTime(slot) { const h = Math.floor(slot / 2); return `${pad(h)}:${slot % 2 ? '30' : '00'}`; }
  function timeToSlot(time) {
    const [hh, mm] = String(time || '').split(':').map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
    return hh * 2 + (mm >= 30 ? 1 : 0);
  }
  function weekday(date) {
    const d = new Date(`${date}T00:00:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  function formatTime(time) {
    const [hh, mm] = String(time || '00:00').split(':').map(Number);
    const d = new Date(2026, 0, 1, hh || 0, mm || 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }
  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }
  function readJson(key, fallback) {
    if (!key) return fallback;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch { return fallback; }
  }
  function writeJson(key, value) {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(value || {}));
  }
  function readMarks() { return readJson(marksKey(), {}); }
  function writeMarks(marks) { writeJson(marksKey(), marks || {}); }
  function slotKey(date, time) { return `${channelCode()}__${date}__${time}__blank-slot`; }
  function parseSlotKey(key) {
    const m = String(key || '').match(/^(13\.1|13\.3)__(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})__blank-slot$/);
    return m ? { channel: m[1], date: m[2], time: m[3] } : null;
  }
  function tagOrder() {
    const fromCfg = Array.isArray(cfg().tagOrder) ? cfg().tagOrder : [];
    const allowed = new Set(DEFAULT_TAGS);
    const list = fromCfg.length ? fromCfg.filter(k => allowed.has(k)) : DEFAULT_TAGS.slice();
    if (channelCode() === '13.3') return list.filter(k => k !== 'michigan');
    return list.filter(k => k !== 'arts');
  }
  function tagMeta(key) { return (cfg().tagMeta && cfg().tagMeta[key]) || DEFAULT_META[key] || { label: key, color: '#ddd' }; }
  function tagPriority() {
    const order = tagOrder();
    const fromCfg = Array.isArray(cfg().tagPriority) ? cfg().tagPriority.filter(k => order.includes(k)) : [];
    return fromCfg.length ? fromCfg : order;
  }
  function tagLabels(tags) { return tagOrder().filter(k => tags && tags[k]).map(k => tagMeta(k).label || k); }
  function dominantTagColor(tags) {
    const activeTag = tagPriority().find(k => tags && tags[k]);
    return activeTag ? tagMeta(activeTag).color : '';
  }
  function inRange(time, start, end) {
    const t = timeToSlot(time);
    return t >= timeToSlot(start) && t <= timeToSlot(end);
  }
  function defaultSatellite(date, time) {
    const wd = weekday(date);
    if (channelCode() === '13.3') {
      return (wd === 'Sunday' && (inRange(time, '00:00', '09:30') || inRange(time, '15:00', '23:30'))) ||
        (['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(wd) && (inRange(time, '00:00', '17:30') || inRange(time, '22:00', '23:30'))) ||
        (wd === 'Saturday' && (inRange(time, '00:00', '16:30') || inRange(time, '22:00', '23:30')));
    }
    return (['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].includes(wd) && inRange(time, '01:00', '06:30')) ||
      (wd === 'Sunday' && inRange(time, '01:00', '08:30')) ||
      (['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(wd) && inRange(time, '08:30', '13:30')) ||
      (wd === 'Monday' && (inRange(time, '20:00', '21:00') || inRange(time, '22:00', '23:30'))) ||
      (['Tuesday','Wednesday','Friday'].includes(wd) && inRange(time, '20:00', '23:30')) ||
      (wd === 'Thursday' && time === '23:00') ||
      (wd === 'Saturday' && ['13:30','14:00','23:00'].includes(time)) ||
      (wd === 'Sunday' && ['20:00','21:00','22:00'].includes(time));
  }
  function markFor(date, time) {
    const key = slotKey(date, time);
    const mark = readMarks()[key] || {};
    const tags = mark.tags && typeof mark.tags === 'object' ? mark.tags : {};
    const satDefault = defaultSatellite(date, time);
    return {
      key,
      tags: { ...tags },
      satelliteFeed: typeof mark.satelliteFeed === 'boolean' ? mark.satelliteFeed : satDefault,
      rectNote: mark.rectNote && typeof mark.rectNote === 'object' ? { ...mark.rectNote } : null
    };
  }
  function saveMark(date, time, mark) {
    const key = slotKey(date, time);
    const satDefault = defaultSatellite(date, time);
    const marks = readMarks();
    const payload = {};
    const cleanTags = {};
    tagOrder().forEach(tag => { if (mark.tags && mark.tags[tag]) cleanTags[tag] = true; });
    if (Object.keys(cleanTags).length) payload.tags = cleanTags;
    if (typeof mark.satelliteFeed === 'boolean' && mark.satelliteFeed !== satDefault) payload.satelliteFeed = !!mark.satelliteFeed;
    if (mark.rectNote && (mark.rectNote.text || mark.rectNote.durationMin)) payload.rectNote = mark.rectNote;
    if (Object.keys(payload).length) marks[key] = payload;
    else delete marks[key];
    writeMarks(marks);
    return payload;
  }

  function headerDates(table) {
    const year = (monthKey().split('-')[0] || new Date().getFullYear());
    const months = {jan:'01',january:'01',feb:'02',february:'02',mar:'03',march:'03',apr:'04',april:'04',may:'05',jun:'06',june:'06',jul:'07',july:'07',aug:'08',august:'08',sep:'09',sept:'09',september:'09',oct:'10',october:'10',nov:'11',november:'11',dec:'12',december:'12'};
    return Array.from(table.querySelectorAll('thead th:not(.time-col)')).map(th => {
      const lines = (th.innerText || th.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
      const clean = (lines[lines.length - 1] || '').toLowerCase().replace(/,/g, '');
      const m = clean.match(/^([a-z]+)\s+(\d{1,2})$/);
      return m && months[m[1]] ? `${year}-${months[m[1]]}-${pad(Number(m[2]))}` : '';
    });
  }
  function locateBlankCell(cell) {
    const table = cell?.closest?.('table.screen-week-grid');
    const row = cell?.closest?.('tbody tr');
    if (!table || !row || cell.dataset.entryId || cell.classList.contains('outside')) return null;
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const rowIndex = rows.indexOf(row);
    if (rowIndex < 0) return null;
    const dates = headerDates(table);
    const headers = Array.from(table.querySelectorAll('thead th:not(.time-col)'));
    const cellRect = cell.getBoundingClientRect();
    const center = cellRect.left + cellRect.width / 2;
    let bestIdx = -1, bestDist = Infinity;
    headers.forEach((th, idx) => {
      const r = th.getBoundingClientRect();
      const d = Math.abs((r.left + r.width / 2) - center);
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    });
    const date = dates[bestIdx];
    if (!date) return null;
    const time = slotToTime(rowIndex);
    cell.classList.add('wnmu-blank-slot-cell');
    cell.dataset.blankSlot = 'true';
    cell.dataset.blankDate = date;
    cell.dataset.blankTime = time;
    cell.dataset.blankSlotKey = slotKey(date, time);
    return { cell, table, date, time, key: slotKey(date, time) };
  }
  function findCellFor(date, time) {
    const wantedSlot = timeToSlot(time);
    if (wantedSlot < 0) return null;
    const tables = Array.from(document.querySelectorAll('table.screen-week-grid'));
    for (const table of tables) {
      const dates = headerDates(table);
      const dayIndex = dates.indexOf(date);
      if (dayIndex < 0) continue;
      const row = table.querySelectorAll('tbody tr')[wantedSlot];
      if (!row) continue;
      const header = table.querySelectorAll('thead th:not(.time-col)')[dayIndex];
      if (!header) continue;
      const hRect = header.getBoundingClientRect();
      const cells = Array.from(row.querySelectorAll('td.program-cell:not(.outside):not([data-entry-id])'));
      let best = null, bestDist = Infinity;
      cells.forEach(cell => {
        const r = cell.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dist = Math.abs((r.left + r.width / 2) - (hRect.left + hRect.width / 2));
        if (dist < bestDist) { best = cell; bestDist = dist; }
      });
      if (best) return locateBlankCell(best)?.cell || best;
    }
    return null;
  }

  function ensureLayer() {
    let layer = document.getElementById('wnmuBlankSlotLayerV141');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'wnmuBlankSlotLayerV141';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }
  function removeOverlay(key) {
    document.querySelectorAll(`.wnmu-blank-v141-box[data-blank-slot-key="${cssEscape(key)}"]`).forEach(el => el.remove());
  }
  function renderCell(cell, mark) {
    if (!cell || !mark) return;
    const tagColor = dominantTagColor(mark.tags);
    const isSat = !!mark.satelliteFeed;
    cell.classList.toggle('wnmu-blank-satellite-feed', isSat && !tagColor);
    cell.classList.toggle('wnmu-blank-tagged', !!tagColor);
    cell.style.backgroundColor = tagColor || (isSat ? SAT_COLOR : '');
    let label = cell.querySelector(':scope > .wnmu-blank-slot-content');
    if (!label) {
      label = document.createElement('div');
      label.className = 'wnmu-blank-slot-content';
      cell.appendChild(label);
    }
    const labels = tagLabels(mark.tags);
    const note = mark.rectNote?.text ? 'Box note' : '';
    const sat = isSat && !tagColor ? 'Satellite Feed' : '';
    label.textContent = [labels.join(', '), note, sat].filter(Boolean).join(' • ');
    label.style.display = mark.rectNote?.text ? 'none' : '';
    cell.title = [weekday(cell.dataset.blankDate), cell.dataset.blankDate, cell.dataset.blankTime, labels.join(', '), sat, note].filter(Boolean).join(' • ');
    renderOverlay(cell, mark);
  }
  function renderOverlay(cell, mark) {
    const key = cell?.dataset?.blankSlotKey || mark?.key;
    if (!key) return;
    removeOverlay(key);
    if (!mark?.rectNote?.text) return;
    const rect = cell.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const duration = Number(mark.rectNote.durationMin || 30);
    const slots = Math.max(1, Math.round(duration / 30));
    const row = cell.closest('tr');
    const rowRect = row?.getBoundingClientRect?.();
    const baseHeight = Math.max(18, rowRect?.height || rect.height || 0);
    const box = document.createElement('div');
    const labels = tagLabels(mark.tags);
    box.className = 'wnmu-blank-v141-box';
    box.dataset.blankSlotKey = key;
    box.style.left = `${Math.round(rect.left + window.scrollX + 4)}px`;
    box.style.top = `${Math.round(rect.top + window.scrollY + 2)}px`;
    box.style.width = `${Math.max(46, Math.round(rect.width - 8))}px`;
    box.style.height = `${Math.max(22, Math.round(baseHeight * slots - 4))}px`;
    box.innerHTML = `${labels.length ? `<div class="wnmu-blank-v141-tags">${labels.map(l => `<span>${escapeHtml(l)}</span>`).join('')}</div>` : ''}<div class="wnmu-blank-v141-text">${escapeHtml(mark.rectNote.text)}</div><div class="wnmu-blank-v141-duration">${duration} min</div>`;
    ensureLayer().appendChild(box);
  }

  function durationOptions(selected) {
    return [30,60,90,120,150,180,210].map(min => `<label class="blank-slot-pill"><input type="radio" name="blankRectDuration" value="${min}" ${Number(selected) === min ? 'checked' : ''}><span>${min}</span></label>`).join('');
  }
  function ensureMenu() {
    let menu = document.getElementById('blankSlotContextMenu');
    if (menu) return menu;
    menu = document.createElement('aside');
    menu.id = 'blankSlotContextMenu';
    menu.className = 'context-menu hidden blank-slot-menu';
    menu.setAttribute('aria-hidden', 'true');
    document.body.appendChild(menu);
    return menu;
  }
  function hideMenu() {
    const menu = document.getElementById('blankSlotContextMenu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
  }
  function setStatus(message, kind) {
    const el = document.getElementById('blankSaveStatus');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.kind = kind || 'ok';
  }
  function buildMenu(menu, mark) {
    const rows = tagOrder().map(key => {
      const meta = tagMeta(key);
      return `<label class="check-row ${CLASS_BY_TAG[key] || ''}"><input type="checkbox" name="${escapeHtml(key)}" ${mark.tags[key] ? 'checked' : ''}><span>${escapeHtml(meta.label || key)}</span></label>`;
    }).join('');
    const duration = mark.rectNote?.durationMin || 30;
    const text = mark.rectNote?.text || '';
    menu.innerHTML = `
      <div class="context-menu-head">
        <div><h3>Blank schedule slot</h3><div id="blankSlotMenuMeta" class="context-menu-meta"></div></div>
        <button type="button" id="blankSlotCloseBtn" class="menu-close" aria-label="Close">×</button>
      </div>
      <form class="context-menu-form blank-slot-form">
        ${rows}
        <label class="check-row check-satellite-feed"><input type="checkbox" name="blankSatelliteFeed" ${mark.satelliteFeed ? 'checked' : ''}><span>Satellite Feed</span></label>
        <fieldset class="rect-tools blank-slot-rect-tools">
          <legend>Box note</legend>
          <div class="rect-status">Add or edit a white box note for this blank slot.</div>
          <div class="manual-rect-duration-tools">
            <div class="manual-rect-label">Box note length</div>
            <div class="manual-rect-duration-options">${durationOptions(duration)}</div>
            <label class="manual-rect-label" for="blankRectText">Box note text</label>
            <textarea id="blankRectText" class="manual-rect-text" rows="3" placeholder="Type the note to draw in the blank slot">${escapeHtml(text)}</textarea>
          </div>
          <div class="rect-actions">
            <button type="button" id="blankSaveRectBtn" class="btn ghost">Save box note</button>
            <button type="button" id="blankClearRectBtn" class="btn ghost">Clear box note</button>
          </div>
          <div id="blankSaveStatus" class="blank-save-status" aria-live="polite"></div>
        </fieldset>
      </form>`;
    menu.querySelector('#blankSlotCloseBtn')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); hideMenu(); });
    menu.querySelector('#blankSaveRectBtn')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); saveFromMenu(); });
    menu.querySelector('#blankClearRectBtn')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); clearNoteFromMenu(); });
    menu.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener('change', () => saveFromMenu(false)));
    menu.querySelector('#blankRectText')?.addEventListener('input', () => setStatus('Unsaved box note text.', 'pending'));
    menu.querySelectorAll('input[name="blankRectDuration"]').forEach(input => input.addEventListener('change', () => setStatus('Unsaved box note length.', 'pending')));
  }
  function currentMenuState() {
    const menu = document.getElementById('blankSlotContextMenu');
    const tags = {};
    tagOrder().forEach(key => { tags[key] = !!menu?.querySelector(`input[name="${cssEscape(key)}"]`)?.checked; });
    const satelliteFeed = !!menu?.querySelector('input[name="blankSatelliteFeed"]')?.checked;
    const duration = Number(menu?.querySelector('input[name="blankRectDuration"]:checked')?.value || 30);
    const text = String(menu?.querySelector('#blankRectText')?.value || '').trim();
    return { tags, satelliteFeed, rectNote: text ? { text, durationMin: duration, anchor: 'left' } : null };
  }
  function saveFromMenu(showBoxStatus = true) {
    if (!active?.cell || !active.date || !active.time) { setStatus('No blank slot selected. Right-click the blank cell again.', 'error'); return false; }
    const mark = currentMenuState();
    const payload = saveMark(active.date, active.time, mark);
    const reread = markFor(active.date, active.time);
    renderCell(active.cell, reread);
    if (showBoxStatus) setStatus(mark.rectNote?.text ? 'Box note saved.' : 'Blank-slot settings saved.', 'ok');
    window.WNMU_LAST_BLANK_SLOT_SAVE = { ...active, mark: payload, savedAt: new Date().toISOString() };
    return true;
  }
  function clearNoteFromMenu() {
    if (!active?.cell || !active.date || !active.time) { setStatus('No blank slot selected. Right-click the blank cell again.', 'error'); return; }
    const mark = currentMenuState();
    mark.rectNote = null;
    const textarea = document.getElementById('blankRectText');
    if (textarea) textarea.value = '';
    saveMark(active.date, active.time, mark);
    renderCell(active.cell, markFor(active.date, active.time));
    setStatus('Box note cleared.', 'ok');
  }
  function openMenu(cell, event) {
    const located = locateBlankCell(cell);
    if (!located) return;
    active = located;
    const mark = markFor(located.date, located.time);
    renderCell(cell, mark);
    const menu = ensureMenu();
    buildMenu(menu, mark);
    const meta = menu.querySelector('#blankSlotMenuMeta');
    if (meta) meta.textContent = `${weekday(located.date)} ${located.date} • ${formatTime(located.time)}`;
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(event.clientX, window.innerWidth - r.width - 12))}px`;
    menu.style.top = `${Math.max(12, Math.min(event.clientY, window.innerHeight - r.height - 12))}px`;
  }

  function restoreVisibleSavedNotesOnce() {
    if (bootRestoreDone || !marksKey()) return;
    bootRestoreDone = true;
    const marks = readMarks();
    const keys = Object.keys(marks).filter(key => marks[key]?.rectNote?.text && parseSlotKey(key)?.channel === channelCode()).slice(0, 200);
    if (!keys.length) return;
    keys.forEach(key => {
      const parsed = parseSlotKey(key);
      if (!parsed) return;
      const cell = findCellFor(parsed.date, parsed.time);
      if (!cell) return;
      const located = locateBlankCell(cell);
      if (!located) return;
      renderCell(cell, markFor(parsed.date, parsed.time));
    });
  }

  function injectStyles() {
    if (document.getElementById('wnmuBlankSlotMenuV141Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuBlankSlotMenuV141Styles';
    style.textContent = `
      td.program-cell:not([data-entry-id]), .wnmu-blank-slot-cell { cursor: context-menu; position: relative; }
      .wnmu-blank-slot-cell.wnmu-blank-satellite-feed { background:#e6e6e6!important; background-color:#e6e6e6!important; }
      .wnmu-blank-slot-content { position:absolute; right:4px; bottom:3px; max-width:calc(100% - 8px); font-size:9px; color:rgba(0,0,0,.42); pointer-events:none; z-index:2; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .blank-slot-menu { z-index:2147483001; min-width:360px; max-width:460px; }
      .blank-slot-menu.hidden { display:none!important; }
      .blank-slot-menu .check-row { display:flex; gap:8px; align-items:center; padding:5px 6px; border-radius:8px; }
      .blank-slot-menu .check-new-series{background:#fff2a8}.blank-slot-menu .check-highlight{background:#b9dcff}.blank-slot-menu .check-one-off{background:#ffd9b5}.blank-slot-menu .check-monthly-topic{background:#d7c4ff}.blank-slot-menu .check-fundraiser{background:#ffc7d1}.blank-slot-menu .check-programmers-choice{background:#c9f4d2}.blank-slot-menu .check-holiday{background:#fde2e2}.blank-slot-menu .check-noteworthy{background:#fff0bd}.blank-slot-menu .check-educational{background:#cce7ff}.blank-slot-menu .check-local{background:#d6f5d6}.blank-slot-menu .check-michigan{background:#d5e8ff}.blank-slot-menu .check-arts{background:#ead9ff}.blank-slot-menu .check-satellite-feed{background:#e6e6e6}
      .blank-slot-rect-tools{border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:10px;margin-top:10px}.manual-rect-duration-options{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}.blank-slot-pill{display:inline-flex;align-items:center;gap:3px;font-size:12px;border:1px solid rgba(255,255,255,.24);border-radius:999px;padding:4px 7px;cursor:pointer}.manual-rect-text{width:100%;box-sizing:border-box;border-radius:8px;border:1px solid rgba(255,255,255,.28);padding:7px;resize:vertical;font:13px/1.3 system-ui,sans-serif;color:#111;background:#fff}.blank-save-status{min-height:1.2em;margin-top:6px;font-size:12px}.blank-save-status[data-kind="ok"]{color:#bdf8c8}.blank-save-status[data-kind="error"]{color:#ffd0d0}.blank-save-status[data-kind="pending"]{color:#fff2a8}
      #wnmuBlankSlotLayerV141{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000}.wnmu-blank-v141-box{position:absolute;box-sizing:border-box;background:rgba(255,255,255,.96);color:#111;border:2px solid rgba(10,20,40,.78);border-radius:4px;box-shadow:0 2px 7px rgba(0,0,0,.22);overflow:hidden;padding:4px 5px 14px;font:12px/1.2 system-ui,sans-serif;pointer-events:none}.wnmu-blank-v141-tags{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:3px}.wnmu-blank-v141-tags span{font-size:8px;line-height:1;background:#eee;border:1px solid #bbb;border-radius:999px;padding:2px 4px}.wnmu-blank-v141-text{white-space:normal;overflow:hidden}.wnmu-blank-v141-duration{position:absolute;right:4px;bottom:2px;font-size:9px;opacity:.58}
      @media print{#wnmuBlankSlotLayerV141{display:none!important}.blank-slot-menu{display:none!important}}
    `;
    document.head.appendChild(style);
  }
  function installHandlers() {
    document.addEventListener('contextmenu', event => {
      const cell = event.target.closest?.('td.program-cell, .program-cell');
      if (!cell || cell.dataset.entryId || cell.classList.contains('outside')) return;
      const located = locateBlankCell(cell);
      if (!located) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openMenu(cell, event);
    }, true);
    document.addEventListener('click', event => {
      const menu = document.getElementById('blankSlotContextMenu');
      if (!menu || menu.classList.contains('hidden')) return;
      if (menu.contains(event.target)) return;
      hideMenu();
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideMenu(); }, true);
  }
  function setVersionHint() {
    window.WNMU_BLANK_SLOT_MENU_VERSION = VERSION;
    const flag = document.getElementById('versionFlag');
    if (flag) flag.textContent = `${flag.textContent} • blank slot menu 1.4.41`;
  }
  function start() {
    injectStyles();
    installHandlers();
    setVersionHint();
    // One targeted startup pass: only tries to restore cells that already have saved blank-slot notes.
    window.setTimeout(restoreVisibleSavedNotesOnce, 1200);
    window.setTimeout(restoreVisibleSavedNotesOnce, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
