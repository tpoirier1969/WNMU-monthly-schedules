(function () {
  const VERSION = 'v1.4.28-robust-blank-slot-menu';
  const SAT_COLOR = '#e6e6e6';
  let activeBlank = null;

  function cfg() {
    return window.WNMU_MONTHLY_PAGE_CONFIG || {};
  }

  function storageKey() {
    return cfg().storageKey || '';
  }

  function overrideKey() {
    const base = storageKey();
    return base ? `${base}::blankSlotSatelliteOverrides.v1.4.28` : '';
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
    if (rule.channel && cfg().channelCode !== rule.channel) return false;
    if (rule.weekdays && !rule.weekdays.includes(info.weekday)) return false;
    if (rule.times && !rule.times.includes(info.time)) return false;
    if (rule.range && !inRange(info.time, rule.range[0], rule.range[1])) return false;
    return true;
  }

  function rulesForChannel() {
    if (cfg().channelCode === '13.3') {
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
    return `${cfg().channelCode || 'channel'}__${date}__${time}__blank-slot`;
  }

  function effectiveSatellite(date, time) {
    const key = slotKey(date, time);
    const overrides = readJson(overrideKey(), {});
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return !!overrides[key];
    return defaultSatellite(date, time);
  }

  function setOverride(date, time, checked) {
    const key = slotKey(date, time);
    const def = defaultSatellite(date, time);
    const overrides = readJson(overrideKey(), {});
    if (checked === def) delete overrides[key];
    else overrides[key] = !!checked;
    writeJson(overrideKey(), overrides);
  }

  function paintBlankCell(cell) {
    const date = cell.dataset.blankDate;
    const time = cell.dataset.blankTime;
    if (!date || !time) return;

    const isSat = effectiveSatellite(date, time);
    cell.classList.add('wnmu-blank-slot-cell');
    cell.classList.toggle('wnmu-blank-satellite-feed', !!isSat);
    cell.dataset.satelliteFeed = isSat ? 'true' : 'false';
    cell.style.backgroundColor = isSat ? SAT_COLOR : '';
    cell.title = isSat ? 'Blank slot: Satellite Feed' : 'Blank schedule slot';
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

    // Fallback for odd table/rowspan layouts: derive from row time and visual column.
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

  function ensureMenu() {
    let menu = document.getElementById('blankSlotContextMenu');
    if (menu) return menu;

    menu = document.createElement('aside');
    menu.id = 'blankSlotContextMenu';
    menu.className = 'context-menu hidden blank-slot-menu';
    menu.setAttribute('aria-hidden', 'true');
    menu.innerHTML = `
      <div class="context-menu-head">
        <div>
          <h3 id="blankSlotMenuTitle">Blank schedule slot</h3>
          <div id="blankSlotMenuMeta" class="context-menu-meta"></div>
        </div>
        <button type="button" id="blankSlotCloseBtn" class="menu-close" aria-label="Close">×</button>
      </div>
      <form class="context-menu-form">
        <label class="check-row check-satellite-feed">
          <input type="checkbox" name="blankSatelliteFeed">
          <span>Satellite Feed</span>
        </label>
        <div class="rect-status">This is a blank schedule slot, so only blank-slot options are shown here.</div>
      </form>
    `;
    document.body.appendChild(menu);

    menu.querySelector('#blankSlotCloseBtn')?.addEventListener('click', hideMenu);
    menu.querySelector('input[name="blankSatelliteFeed"]')?.addEventListener('change', event => {
      if (!activeBlank) return;
      setOverride(activeBlank.date, activeBlank.time, !!event.target.checked);
      document.querySelectorAll(`.wnmu-blank-slot-cell[data-blank-slot-key="${cssEscape(activeBlank.key)}"]`).forEach(paintBlankCell);
    });

    return menu;
  }

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function formatTime(time) {
    const [hh, mm] = String(time).split(':').map(Number);
    const d = new Date(2026, 0, 1, hh, mm);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

    const menu = ensureMenu();
    const meta = menu.querySelector('#blankSlotMenuMeta');
    const input = menu.querySelector('input[name="blankSatelliteFeed"]');

    if (meta) meta.textContent = `${weekday(date)} ${date} • ${formatTime(time)}`;
    if (input) input.checked = effectiveSatellite(date, time);

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
      // v1.4.28: do NOT require .wnmu-blank-slot-cell.
      // Catch plain empty program cells too, annotate them immediately, then open.
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

  function injectStyles() {
    if (document.getElementById('wnmuBlankSlotMenuV1428Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuBlankSlotMenuV1428Styles';
    style.textContent = `
      td.program-cell:not([data-entry-id]),
      .wnmu-blank-slot-cell {
        cursor: context-menu;
      }
      .wnmu-blank-slot-cell.wnmu-blank-satellite-feed {
        background: ${SAT_COLOR} !important;
        background-color: ${SAT_COLOR} !important;
      }
      .wnmu-blank-slot-cell.wnmu-blank-satellite-feed::before {
        content: "Satellite Feed";
        display: block;
        text-align: right;
        padding: 3px 4px 0 0;
        font-size: 9px;
        color: rgba(0,0,0,.38);
        pointer-events: none;
      }
      .blank-slot-menu {
        z-index: 9999;
      }
      .blank-slot-menu .rect-status {
        margin-top: 8px;
      }
      @media print {
        .blank-slot-menu { display: none !important; }
        .wnmu-blank-slot-cell.wnmu-blank-satellite-feed::before { display: none; }
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
    if (!flag.textContent.includes('blank slots 1.4.28')) {
      flag.textContent = `${flag.textContent} • blank slots 1.4.28`;
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
    window.WNMU_BLANK_SLOT_CONTEXT_MENU_VERSION = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
