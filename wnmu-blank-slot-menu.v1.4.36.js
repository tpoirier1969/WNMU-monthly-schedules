(function () {
  const VERSION = 'v1.4.36-blank-box-block-overlay';
  const SAT_COLOR = '#e6e6e6';
  const DEFAULT_TAGS = ['newSeries','highlight','oneOff','monthlyTopic','fundraiser','programmersChoice','holiday','noteworthy','educational','local','michigan','arts'];
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
  let activeBlank = null;
  let overlayTimer = null;

  function cfg() {
    return window.WNMU_MONTHLY_PAGE_CONFIG || {};
  }

  function channelCode() {
    return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1');
  }

  function storageKey() {
    return cfg().storageKey || '';
  }

  function marksKey() {
    const base = storageKey();
    return base ? `${base}::blankSlotMarks.v1.4.30` : '';
  }

  function legacyMarksKeys() {
    const base = storageKey();
    if (!base) return [];
    return [
      `${base}::blankSlotMarks.v1.4.29`,
      `${base}::blankSlotMarks.v1.4.28`,
      `${base}::blankSlotSatelliteOverrides.v1.4.28`,
      `${base}::blankSlotSatelliteOverrides.v1.4.26`
    ];
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

  function readBlankMarks() {
    const current = readJson(marksKey(), {});
    const out = { ...current };

    // Preserve any blank-slot work created by v1.4.29 during testing.
    legacyMarksKeys().forEach(key => {
      const legacy = readJson(key, {});
      Object.entries(legacy).forEach(([legacyKey, value]) => {
        if (!out[legacyKey] && value && typeof value === 'object') {
          out[legacyKey] = value;
        }
      });
    });

    return out;
  }

  function writeBlankMarks(marks) {
    writeJson(marksKey(), marks || {});
    scheduleOverlayRender();
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function slotToTime(slot) {
    const h = Math.floor(slot / 2);
    return `${pad(h)}:${slot % 2 ? '30' : '00'}`;
  }

  function timeToSlot(time) {
    const [hh, mm] = String(time || '').split(':').map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
    return hh * 2 + (mm >= 30 ? 1 : 0);
  }

  function inRange(time, start, end) {
    const t = timeToSlot(time);
    return t >= timeToSlot(start) && t <= timeToSlot(end);
  }

  function weekday(date) {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }

  function currentYear() {
    const fromMeta = String(window.WNMU_CURRENT_MONTH_META?.monthKey || '').split('-')[0];
    const fromQuery = String(new URLSearchParams(location.search).get('month') || '').split('-')[0];
    return Number(fromMeta || fromQuery) || new Date().getFullYear();
  }

  function parseMonthDay(label, fallbackYear) {
    const months = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', sept: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12'
    };
    const clean = String(label || '').trim().toLowerCase().replace(/,/g, '');
    const m = clean.match(/^([a-z]+)\s+(\d{1,2})$/);
    if (!m) return '';
    const month = months[m[1]];
    if (!month) return '';
    return `${fallbackYear}-${month}-${pad(Number(m[2]))}`;
  }

  function headerDates(table) {
    const year = currentYear();
    return Array.from(table.querySelectorAll('thead th:not(.time-col)')).map(th => {
      const lines = (th.innerText || th.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
      const dateLabel = lines[lines.length - 1] || '';
      return parseMonthDay(dateLabel, year);
    });
  }

  function matchRule(info, rule) {
    if (!info.date || !info.time) return false;
    if (rule.channel && channelCode() !== rule.channel) return false;
    if (rule.weekdays && !rule.weekdays.includes(info.weekday)) return false;
    if (rule.times && !rule.times.includes(info.time)) return false;
    if (rule.range && !inRange(info.time, rule.range[0], rule.range[1])) return false;
    return true;
  }

  function rulesForChannel() {
    if (channelCode() === '13.3') {
      return [
        { channel: '13.3', weekdays: ['Sunday'], range: ['00:00', '09:30'] },
        { channel: '13.3', weekdays: ['Sunday'], range: ['15:00', '23:30'] },
        { channel: '13.3', weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], range: ['00:00', '17:30'] },
        { channel: '13.3', weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], range: ['22:00', '23:30'] },
        { channel: '13.3', weekdays: ['Saturday'], range: ['00:00', '16:30'] },
        { channel: '13.3', weekdays: ['Saturday'], range: ['22:00', '23:30'] }
      ];
    }

    return [
      { channel: '13.1', weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], range: ['01:00', '06:30'] },
      { channel: '13.1', weekdays: ['Sunday'], range: ['01:00', '08:30'] },
      { channel: '13.1', weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], range: ['08:30', '13:30'] },
      { channel: '13.1', weekdays: ['Monday'], range: ['20:00', '21:00'] },
      { channel: '13.1', weekdays: ['Monday'], range: ['22:00', '23:30'] },
      { channel: '13.1', weekdays: ['Tuesday', 'Wednesday', 'Friday'], range: ['20:00', '23:30'] },
      { channel: '13.1', weekdays: ['Thursday'], times: ['23:00'] },
      { channel: '13.1', weekdays: ['Saturday'], times: ['13:30', '14:00', '23:00'] },
      { channel: '13.1', weekdays: ['Sunday'], times: ['20:00', '21:00', '22:00'] }
    ];
  }

  function defaultSatellite(date, time) {
    const info = { date, time, weekday: weekday(date) };
    return rulesForChannel().some(rule => matchRule(info, rule));
  }

  function slotKey(date, time) {
    return `${channelCode()}__${date}__${time}__blank-slot`;
  }

  function tagOrder() {
    const fromCfg = Array.isArray(cfg().tagOrder) ? cfg().tagOrder : [];
    const allowed = new Set(DEFAULT_TAGS);
    const list = fromCfg.length ? fromCfg.filter(key => allowed.has(key)) : DEFAULT_TAGS.slice();
    if (channelCode() === '13.3') return list.filter(key => key !== 'michigan');
    return list.filter(key => key !== 'arts');
  }

  function tagMeta(key) {
    return (cfg().tagMeta && cfg().tagMeta[key]) || DEFAULT_META[key] || { label: key, color: '#ddd' };
  }

  function tagPriority() {
    const order = tagOrder();
    const fromCfg = Array.isArray(cfg().tagPriority) ? cfg().tagPriority.filter(key => order.includes(key)) : [];
    return fromCfg.length ? fromCfg : order;
  }

  function readMarkFor(date, time) {
    const key = slotKey(date, time);
    const marks = readBlankMarks();
    const mark = marks[key] && typeof marks[key] === 'object' ? marks[key] : {};
    const tags = mark.tags && typeof mark.tags === 'object' ? mark.tags : {};
    const satDefault = defaultSatellite(date, time);
    const satelliteFeed = typeof mark.satelliteFeed === 'boolean' ? mark.satelliteFeed : satDefault;
    return {
      key,
      tags: { ...tags },
      satelliteFeed,
      rectNote: mark.rectNote && typeof mark.rectNote === 'object' ? { ...mark.rectNote } : null
    };
  }

  function writeMarkFor(date, time, next) {
    const key = slotKey(date, time);
    const marks = readBlankMarks();
    const satDefault = defaultSatellite(date, time);
    const payload = {};

    const cleanedTags = {};
    for (const tag of tagOrder()) {
      if (next.tags && next.tags[tag]) cleanedTags[tag] = true;
    }
    if (Object.keys(cleanedTags).length) payload.tags = cleanedTags;
    if (typeof next.satelliteFeed === 'boolean' && next.satelliteFeed !== satDefault) payload.satelliteFeed = next.satelliteFeed;
    if (next.rectNote && (next.rectNote.text || next.rectNote.durationMin)) payload.rectNote = next.rectNote;

    if (Object.keys(payload).length) marks[key] = payload;
    else delete marks[key];

    writeBlankMarks(marks);
  }

  function dominantTagColor(tags) {
    const active = tagPriority().find(key => tags && tags[key]);
    return active ? tagMeta(active).color : '';
  }

  function activeTagLabels(tags) {
    return tagOrder().filter(key => tags && tags[key]).map(key => tagMeta(key).label || key);
  }

  function paintBlankCell(cell) {
    const date = cell.dataset.blankDate;
    const time = cell.dataset.blankTime;
    if (!date || !time) return;

    const mark = readMarkFor(date, time);
    const tagColor = dominantTagColor(mark.tags);
    const isSat = !!mark.satelliteFeed;
    const labels = activeTagLabels(mark.tags);

    cell.classList.add('wnmu-blank-slot-cell');
    cell.classList.toggle('wnmu-blank-satellite-feed', isSat && !tagColor);
    cell.classList.toggle('wnmu-blank-tagged', !!tagColor);
    cell.dataset.satelliteFeed = isSat ? 'true' : 'false';

    if (tagColor) cell.style.backgroundColor = tagColor;
    else if (isSat) cell.style.backgroundColor = SAT_COLOR;
    else cell.style.backgroundColor = '';

    let inner = cell.querySelector('.wnmu-blank-slot-content');
    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'wnmu-blank-slot-content';
      cell.appendChild(inner);
    }

    const note = mark.rectNote?.text ? 'Box note' : '';
    const sat = isSat && !tagColor ? 'Satellite Feed' : '';
    const tagText = labels.join(', ');
    inner.textContent = [tagText, note, sat].filter(Boolean).join(' • ');
    cell.title = [weekday(date), date, time, tagText, sat, note].filter(Boolean).join(' • ');
    renderInlineBlankBox(cell, mark);
  }

  function removeInlineBlankBox(cell) {
    cell.querySelectorAll(':scope > .wnmu-blank-note-inline').forEach(el => el.remove());
  }

  function renderInlineBlankBox(cell, mark) {
    removeInlineBlankBox(cell);
    cell.classList.toggle('wnmu-has-blank-note-box', !!mark?.rectNote?.text);
    scheduleOverlayRender();
  }

  function annotateTable(table) {
    const dates = headerDates(table);
    const skip = new Array(7).fill(0);
    const rows = Array.from(table.querySelectorAll('tbody tr'));

    rows.forEach((tr, slot) => {
      const time = slotToTime(slot);
      const cells = Array.from(tr.children).filter(td => !td.classList.contains('time-col'));
      let ptr = 0;

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        if (skip[dayIndex] > 0) {
          skip[dayIndex] -= 1;
          continue;
        }

        const cell = cells[ptr++];
        if (!cell) continue;

        const span = Math.max(1, Number(cell.rowSpan || cell.getAttribute('rowspan') || 1));
        if (span > 1) skip[dayIndex] = span - 1;

        if (cell.dataset.entryId || cell.classList.contains('outside')) continue;

        const date = dates[dayIndex];
        if (!date) continue;

        cell.classList.add('wnmu-blank-slot-cell');
        cell.dataset.blankSlot = 'true';
        cell.dataset.blankDate = date;
        cell.dataset.blankTime = time;
        cell.dataset.blankSlotKey = slotKey(date, time);

        paintBlankCell(cell);
      }
    });
  }

  function annotateAndPaint(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('table.screen-week-grid').forEach(annotateTable);
    scope.querySelectorAll('.wnmu-blank-slot-cell').forEach(paintBlankCell);
    scheduleOverlayRender();
  }

  function ensureCellAnnotated(cell) {
    if (!cell || cell.dataset.entryId || cell.classList.contains('outside')) return false;
    if (cell.dataset.blankDate && cell.dataset.blankTime) {
      paintBlankCell(cell);
      return true;
    }

    const table = cell.closest('table.screen-week-grid');
    if (!table) return false;

    annotateTable(table);

    if (cell.dataset.blankDate && cell.dataset.blankTime) {
      paintBlankCell(cell);
      return true;
    }

    const row = cell.closest('tr');
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const rowIndex = rows.indexOf(row);
    if (rowIndex < 0) return false;

    const dates = headerDates(table);
    const cellRect = cell.getBoundingClientRect();
    const headers = Array.from(table.querySelectorAll('thead th:not(.time-col)'));
    let bestIndex = -1;
    let bestDistance = Infinity;
    const cellCenter = cellRect.left + cellRect.width / 2;

    headers.forEach((th, idx) => {
      const r = th.getBoundingClientRect();
      const center = r.left + r.width / 2;
      const dist = Math.abs(center - cellCenter);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = idx;
      }
    });

    const date = dates[bestIndex];
    if (!date) return false;

    const time = slotToTime(rowIndex);
    cell.classList.add('wnmu-blank-slot-cell');
    cell.dataset.blankSlot = 'true';
    cell.dataset.blankDate = date;
    cell.dataset.blankTime = time;
    cell.dataset.blankSlotKey = slotKey(date, time);
    paintBlankCell(cell);
    return true;
  }

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function cellsForBlankKey(key) {
    return Array.from(document.querySelectorAll('.wnmu-blank-slot-cell'))
      .filter(cell => cell.dataset.blankSlotKey === key);
  }

  function ensureOverlayLayer() {
    let layer = document.getElementById('wnmuBlankNoteOverlayLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'wnmuBlankNoteOverlayLayer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }


  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(time) {
    const [hh, mm] = String(time).split(':').map(Number);
    const d = new Date(2026, 0, 1, hh, mm);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function durationOptions(selected) {
    return [30,60,90,120,150,180,210].map(min => `
      <label class="blank-slot-pill">
        <input type="radio" name="blankRectDuration" value="${min}" ${Number(selected) === min ? 'checked' : ''}>
        <span>${min}</span>
      </label>
    `).join('');
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

  function setBlankSaveStatus(message, kind = 'ok') {
    const el = document.getElementById('blankSaveStatus');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.kind = kind;
  }


  function buildMenuContents(menu, mark) {
    const tagRows = tagOrder().map(key => {
      const meta = tagMeta(key);
      const cls = CLASS_BY_TAG[key] || `check-${key}`;
      return `<label class="check-row ${cls}">
        <input type="checkbox" name="${key}" ${mark.tags[key] ? 'checked' : ''}>
        <span>${escapeHtml(meta.label || key)}</span>
      </label>`;
    }).join('');

    const duration = mark.rectNote?.durationMin || 30;
    const text = mark.rectNote?.text || '';

    menu.innerHTML = `
      <div class="context-menu-head">
        <div>
          <h3 id="blankSlotMenuTitle">Blank schedule slot</h3>
          <div id="blankSlotMenuMeta" class="context-menu-meta"></div>
        </div>
        <button type="button" id="blankSlotCloseBtn" class="menu-close" aria-label="Close">×</button>
      </div>
      <form class="context-menu-form blank-slot-form">
        ${tagRows}
        <label class="check-row check-satellite-feed">
          <input type="checkbox" name="blankSatelliteFeed" ${mark.satelliteFeed ? 'checked' : ''}>
          <span>Satellite Feed</span>
        </label>

        <fieldset class="rect-tools blank-slot-rect-tools">
          <legend>Box note</legend>
          <div class="rect-status">Add a box note to this blank slot.</div>
          <div class="manual-rect-duration-tools">
            <div class="manual-rect-label">Box note length</div>
            <div class="manual-rect-duration-options">${durationOptions(duration)}</div>
            <label class="manual-rect-label" for="blankRectText">Box note text</label>
            <textarea id="blankRectText" class="manual-rect-text" rows="3" placeholder="Type the note to draw in the blank slot">${escapeHtml(text)}</textarea>
            <div class="manual-rect-help">Starts at the upper-left corner of this blank cell and extends downward for the chosen length.</div>
          </div>
          <div class="rect-actions">
            <button type="button" id="blankSaveRectBtn" class="btn ghost">Save box note</button>
            <button type="button" id="blankClearRectBtn" class="btn ghost">Clear box note</button>
          </div>
          <div id="blankSaveStatus" class="blank-save-status" aria-live="polite"></div>
        </fieldset>
      </form>
    `;

    menu.querySelector('#blankSlotCloseBtn')?.addEventListener('click', hideMenu);
    menu.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', () => saveMenuState());
    });
    menu.querySelector('#blankSaveRectBtn')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      saveMenuState();
    });

    menu.querySelector('#blankRectText')?.addEventListener('input', () => {
      setBlankSaveStatus('Unsaved box note text.', 'pending');
    });

    menu.querySelectorAll('input[name="blankRectDuration"]').forEach(input => {
      input.addEventListener('change', () => {
        setBlankSaveStatus('Unsaved box note length.', 'pending');
      });
    });

    menu.querySelector('#blankClearRectBtn')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const textarea = menu.querySelector('#blankRectText');
      if (textarea) textarea.value = '';
      const mark = getMenuState();
      mark.rectNote = null;
      writeMarkFor(activeBlank.date, activeBlank.time, mark);
      repaintActiveBlank();
    });
  }

  function getMenuState() {
    const menu = document.getElementById('blankSlotContextMenu');
    const tags = {};
    tagOrder().forEach(key => {
      const input = menu?.querySelector(`input[name="${cssEscape(key)}"]`);
      tags[key] = !!input?.checked;
    });

    const satInput = menu?.querySelector('input[name="blankSatelliteFeed"]');
    const durationInput = menu?.querySelector('input[name="blankRectDuration"]:checked');
    const text = String(menu?.querySelector('#blankRectText')?.value || '').trim();

    const rectNote = text ? {
      text,
      durationMin: Number(durationInput?.value || 30),
      anchor: 'left'
    } : null;

    return {
      tags,
      satelliteFeed: !!satInput?.checked,
      rectNote
    };
  }

  function saveMenuState() {
    if (!activeBlank) {
      setBlankSaveStatus('No blank slot selected.', 'error');
      return false;
    }

    const mark = getMenuState();
    const text = mark.rectNote?.text || '';

    try {
      writeMarkFor(activeBlank.date, activeBlank.time, mark);
      window.WNMU_LAST_BLANK_SLOT_SAVE = { ...activeBlank, mark, savedAt: new Date().toISOString() };

      // Verify that the write is readable right away.
      const reread = readMarkFor(activeBlank.date, activeBlank.time);
      const savedText = reread.rectNote?.text || '';
      const ok = text ? savedText === text : !savedText;

      repaintActiveBlank();

      if (text && ok) {
        setBlankSaveStatus('Box note saved.', 'ok');
      } else if (text && !ok) {
        setBlankSaveStatus('Save may have failed — note was not read back.', 'error');
      } else {
        setBlankSaveStatus('Blank-slot settings saved.', 'ok');
      }

      return ok;
    } catch (err) {
      console.error('Blank-slot box note save failed', err);
      setBlankSaveStatus(`Save failed: ${err.message || err}`, 'error');
      return false;
    }
  }

  function repaintActiveBlank() {
    if (!activeBlank) return;
    cellsForBlankKey(activeBlank.key).forEach(paintBlankCell);
    scheduleOverlayRender();
  }

  function openMenu(cell, event) {
    const date = cell.dataset.blankDate;
    const time = cell.dataset.blankTime;
    if (!date || !time) return;

    activeBlank = {
      date,
      time,
      key: slotKey(date, time)
    };

    const mark = readMarkFor(date, time);
    const menu = ensureMenu();
    buildMenuContents(menu, mark);

    const meta = menu.querySelector('#blankSlotMenuMeta');
    if (meta) meta.textContent = `${weekday(date)} ${date} • ${formatTime(time)}`;

    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    menu.style.left = '0px';
    menu.style.top = '0px';

    const rect = menu.getBoundingClientRect();
    const left = Math.min(event.clientX, window.innerWidth - rect.width - 12);
    const top = Math.min(event.clientY, window.innerHeight - rect.height - 12);
    menu.style.left = `${Math.max(12, left)}px`;
    menu.style.top = `${Math.max(12, top)}px`;
  }

  function hideMenu() {
    const menu = document.getElementById('blankSlotContextMenu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
  }

  function isBlankProgramCell(cell) {
    return !!cell
      && cell.classList.contains('program-cell')
      && !cell.dataset.entryId
      && !cell.classList.contains('outside');
  }

  function installContextHandler() {
    document.addEventListener('contextmenu', event => {
      const cell = event.target.closest?.('td.program-cell, .program-cell');
      if (!isBlankProgramCell(cell)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (!ensureCellAnnotated(cell)) return;
      openMenu(cell, event);
    }, true);

    document.addEventListener('click', event => {
      const menu = document.getElementById('blankSlotContextMenu');
      if (!menu || menu.classList.contains('hidden')) return;
      if (menu.contains(event.target)) return;
      hideMenu();
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideMenu();
    });
  }

  function renderBlankOverlays() {
    document.querySelectorAll('.wnmu-blank-note-overlay').forEach(el => el.remove());

    // Make sure blank cells have date/time/key before drawing note overlays.
    document.querySelectorAll('table.screen-week-grid').forEach(annotateTable);

    const marks = readBlankMarks();
    const layer = ensureOverlayLayer();

    Object.entries(marks).forEach(([key, mark]) => {
      if (!mark?.rectNote?.text) return;

      let cell = cellsForBlankKey(key)[0];
      if (!cell) {
        document.querySelectorAll('table.screen-week-grid').forEach(annotateTable);
        cell = cellsForBlankKey(key)[0];
      }
      if (!cell) return;

      cell.classList.add('wnmu-has-blank-note-box');

      const cellRect = cell.getBoundingClientRect();
      if (!cellRect.width || !cellRect.height) return;

      const row = cell.closest('tr');
      const rowRect = row?.getBoundingClientRect?.();
      const baseHeight = Math.max(18, rowRect?.height || 0, cellRect.height || 0);
      const duration = Number(mark.rectNote.durationMin || 30);
      const slots = Math.max(1, Math.round(duration / 30));

      const height = Math.max(22, baseHeight * slots - 4);
      const width = Math.max(46, cellRect.width - 8);
      const left = cellRect.left + 4;
      const top = cellRect.top + 2;

      const box = document.createElement('div');
      box.className = 'wnmu-blank-note-overlay';
      box.dataset.blankSlotKey = key;
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      box.innerHTML = `<div class="wnmu-blank-note-text">${escapeHtml(mark.rectNote.text)}</div><div class="wnmu-blank-note-duration">${duration} min</div>`;
      layer.appendChild(box);
    });
  }

  function scheduleOverlayRender() {
    window.clearTimeout(overlayTimer);
    overlayTimer = window.setTimeout(renderBlankOverlays, 80);
  }

  function injectStyles() {
    if (document.getElementById('wnmuBlankSlotMenuV1436Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuBlankSlotMenuV1436Styles';
    style.textContent = `
      td.program-cell:not([data-entry-id]),
      .wnmu-blank-slot-cell {
        cursor: context-menu;
        position: relative;
      }
      .wnmu-blank-slot-cell.wnmu-blank-satellite-feed {
        background: #e6e6e6 !important;
        background-color: #e6e6e6 !important;
      }
      .wnmu-has-blank-note-box > .wnmu-blank-slot-content {
        display: none !important;
      }

      .wnmu-blank-slot-content {
        position: absolute;
        right: 4px;
        bottom: 3px;
        max-width: calc(100% - 8px);
        font-size: 9px;
        color: rgba(0,0,0,.42);
        pointer-events: none;
        z-index: 2;
        text-align: right;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .blank-slot-menu {
        z-index: 9999;
        min-width: 360px;
        max-width: 460px;
      }

      /* v1.4.30: restore existing checkbox color styles for camelCase tags. */
      .blank-slot-menu .check-new-series,
      .blank-slot-menu .check-one-off,
      .blank-slot-menu .check-monthly-topic,
      .blank-slot-menu .check-programmers-choice,
      .blank-slot-menu .check-highlight,
      .blank-slot-menu .check-fundraiser,
      .blank-slot-menu .check-holiday,
      .blank-slot-menu .check-noteworthy,
      .blank-slot-menu .check-educational,
      .blank-slot-menu .check-local,
      .blank-slot-menu .check-michigan,
      .blank-slot-menu .check-arts,
      .blank-slot-menu .check-satellite-feed {
        border-radius: 8px;
      }

      .blank-slot-menu .check-new-series { background: color-mix(in srgb, #fff2a8 72%, white); }
      .blank-slot-menu .check-one-off { background: color-mix(in srgb, #ffd9b5 72%, white); }
      .blank-slot-menu .check-monthly-topic { background: color-mix(in srgb, #d7c4ff 72%, white); }
      .blank-slot-menu .check-programmers-choice { background: color-mix(in srgb, #c9f4d2 72%, white); }
      .blank-slot-menu .check-highlight { background: color-mix(in srgb, #b9dcff 72%, white); }
      .blank-slot-menu .check-fundraiser { background: color-mix(in srgb, #ffc7d1 72%, white); }
      .blank-slot-menu .check-holiday { background: color-mix(in srgb, #fde2e2 72%, white); }
      .blank-slot-menu .check-noteworthy { background: color-mix(in srgb, #fff0bd 72%, white); }
      .blank-slot-menu .check-educational { background: color-mix(in srgb, #cce7ff 72%, white); }
      .blank-slot-menu .check-local { background: color-mix(in srgb, #d6f5d6 72%, white); }
      .blank-slot-menu .check-michigan { background: color-mix(in srgb, #d5e8ff 72%, white); }
      .blank-slot-menu .check-arts { background: color-mix(in srgb, #ead9ff 72%, white); }
      .blank-slot-menu .check-satellite-feed { background: color-mix(in srgb, #e6e6e6 82%, white); }

      .blank-slot-rect-tools {
        border: 2px solid rgba(24, 55, 104, .35);
        border-radius: 12px;
        padding: 10px 12px 12px;
        margin-top: 10px;
        background: rgba(255,255,255,.08);
      }
      .blank-slot-rect-tools legend {
        padding: 0 6px;
        font-weight: 800;
        color: inherit;
      }
      .blank-slot-rect-tools .rect-status {
        margin: 2px 0 8px;
      }

      .blank-slot-pill {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 12px;
        border: 1px solid rgba(255,255,255,.24);
        border-radius: 999px;
        padding: 4px 7px;
        cursor: pointer;
        user-select: none;
      }
      .blank-slot-pill input { margin: 0; }

      .blank-save-status {
        min-height: 16px;
        margin-top: 6px;
        font-size: 12px;
        font-weight: 700;
      }
      .blank-save-status[data-kind="ok"] { color: #1f7a35; }
      .blank-save-status[data-kind="pending"] { color: #8a6400; }
      .blank-save-status[data-kind="error"] { color: #9b1c1c; }
      .week-grid-wrap { position: relative; }

      #wnmuBlankNoteOverlayLayer {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 9998;
      }
      .wnmu-blank-note-overlay,
        .wnmu-blank-note-inline {
        position: fixed;
        z-index: 9999;
        pointer-events: none;
        box-sizing: border-box;
        border: 2px solid rgba(10,20,40,.75);
        background: rgba(255,255,255,.99);
        color: #111;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,.18);
        overflow: hidden;
        padding: 4px 5px 14px;
        font: 12px/1.2 system-ui, sans-serif;
      }
      .wnmu-blank-note-text {
        white-space: normal;
        overflow: hidden;
      }
      .wnmu-blank-note-duration {
        position: absolute;
        right: 4px;
        bottom: 2px;
        font-size: 9px;
        opacity: .58;
      }
      .wnmu-blank-note-inline { display: none !important; }

      @media print {
        .blank-slot-menu { display: none !important; }
        .wnmu-blank-slot-content { display: none; }
        .wnmu-blank-note-overlay,
        .wnmu-blank-note-inline {
          box-shadow: none;
          background: #fff;
          border-color: #111;
          color: #000;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function installObserver() {
    const host = document.getElementById('weekGrids') || document.body;
    const observer = new MutationObserver(mutations => {
      let needs = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes && mutation.addedNodes.length) {
          needs = true;
          break;
        }
      }
      if (!needs) return;
      requestAnimationFrame(() => annotateAndPaint(host));
    });
    observer.observe(host, { childList: true, subtree: true });
  }

  function markVersion() {
    const flag = document.getElementById('versionFlag');
    if (!flag) return;
    if (!flag.textContent.includes('blank box block overlay 1.4.36')) {
      flag.textContent = `${flag.textContent} • blank box block overlay 1.4.36`;
    }
  }

  function start() {
    injectStyles();
    installContextHandler();
    installObserver();

    [100, 400, 900, 1800, 3500, 6000].forEach(ms => {
      setTimeout(() => {
        annotateAndPaint(document.getElementById('weekGrids') || document);
        markVersion();
      }, ms);
    });

    window.addEventListener('resize', () => annotateAndPaint(document.getElementById('weekGrids') || document));
    window.addEventListener('scroll', () => scheduleOverlayRender(), { passive: true });
    window.WNMU_BLANK_SLOT_CONTEXT_MENU_VERSION = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
