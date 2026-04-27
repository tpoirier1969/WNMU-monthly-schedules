(function () {
  'use strict';

  const VERSION = 'v1.4.37-upper-layer-blank-box-hotfix';
  const MARK_SUFFIX = '::blankSlotMarks.v1.4.30';
  const LEGACY_SUFFIXES = [
    '::blankSlotMarks.v1.4.29',
    '::blankSlotMarks.v1.4.28',
    '::blankSlotSatelliteOverrides.v1.4.28',
    '::blankSlotSatelliteOverrides.v1.4.26'
  ];

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

  let lastBlankSlot = null;
  let renderTimer = null;
  let observer = null;

  function cfg() {
    return window.WNMU_MONTHLY_PAGE_CONFIG || {};
  }

  function channelCode() {
    const configured = cfg().channelCode;
    if (configured) return configured;
    if (document.title.includes('WNMU3PL')) return '13.3';
    return '13.1';
  }

  function currentMonthKey() {
    const fromMeta = String(window.WNMU_CURRENT_MONTH_META?.monthKey || '').trim();
    if (/^\d{4}-\d{2}$/.test(fromMeta)) return fromMeta;
    const fromQuery = String(new URLSearchParams(location.search).get('month') || '').trim();
    if (/^\d{4}-\d{2}$/.test(fromQuery)) return fromQuery;
    return '';
  }

  function currentYear() {
    const mk = currentMonthKey();
    if (mk) return Number(mk.slice(0, 4));
    return new Date().getFullYear();
  }

  function storageBase() {
    return String(cfg().storageKey || '').trim();
  }

  function primaryMarksKey() {
    const base = storageBase();
    if (base) return `${base}${MARK_SUFFIX}`;

    const existing = localStorageKeys().find(key => {
      if (!key.endsWith(MARK_SUFFIX)) return false;
      const marks = readJson(key, {});
      return Object.keys(marks).some(isCurrentSlotKey);
    });
    if (existing) return existing;

    const channel = channelCode().replace(/[^\d.]/g, '') || '13.1';
    const month = currentMonthKey() || 'current';
    return `wnmuMonthlySchedules::${channel}::${month}${MARK_SUFFIX}`;
  }

  function localStorageKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key) keys.push(key);
      }
    } catch (err) {
      console.warn(`${VERSION}: could not list localStorage keys`, err);
    }
    return keys;
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

  function isCurrentSlotKey(key) {
    const channel = channelCode();
    const month = currentMonthKey();
    const text = String(key || '');
    if (!text.startsWith(`${channel}__`)) return false;
    if (month && !text.startsWith(`${channel}__${month}-`)) return false;
    return text.endsWith('__blank-slot');
  }

  function readAllBlankMarks() {
    const keys = new Set();
    const base = storageBase();
    if (base) {
      keys.add(`${base}${MARK_SUFFIX}`);
      LEGACY_SUFFIXES.forEach(suffix => keys.add(`${base}${suffix}`));
    }

    localStorageKeys().forEach(key => {
      if (key.endsWith(MARK_SUFFIX) || LEGACY_SUFFIXES.some(suffix => key.endsWith(suffix))) keys.add(key);
    });

    const out = {};
    keys.forEach(key => {
      const marks = readJson(key, {});
      Object.entries(marks).forEach(([slotKey, value]) => {
        if (!isCurrentSlotKey(slotKey)) return;
        if (value && typeof value === 'object') out[slotKey] = value;
      });
    });
    return out;
  }

  function writeBlankMark(slot, next) {
    const key = primaryMarksKey();
    const marks = readJson(key, {});
    const payload = {};
    const cleanTags = {};

    TAG_ORDER.forEach(tag => {
      if (next.tags && next.tags[tag]) cleanTags[tag] = true;
    });

    if (Object.keys(cleanTags).length) payload.tags = cleanTags;
    if (typeof next.satelliteFeed === 'boolean') payload.satelliteFeed = next.satelliteFeed;
    if (next.rectNote && String(next.rectNote.text || '').trim()) {
      payload.rectNote = {
        text: String(next.rectNote.text || '').trim(),
        durationMin: Number(next.rectNote.durationMin || 30) || 30,
        anchor: 'left'
      };
    }

    if (Object.keys(payload).length) marks[slot.key] = payload;
    else delete marks[slot.key];

    writeJson(key, marks);
    window.WNMU_LAST_BLANK_SLOT_SAVE = {
      ...slot,
      mark: payload,
      savedAt: new Date().toISOString(),
      savedBy: VERSION,
      storageKey: key
    };
    return payload;
  }

  function pad(num) {
    return String(num).padStart(2, '0');
  }

  function slotToTime(slot) {
    const hour = Math.floor(slot / 2);
    return `${pad(hour)}:${slot % 2 ? '30' : '00'}`;
  }

  function slotKey(date, time) {
    return `${channelCode()}__${date}__${time}__blank-slot`;
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

  function annotateTables() {
    document.querySelectorAll('table.screen-week-grid').forEach(table => {
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
        }
      });
    });
  }

  function cellFromEvent(event) {
    return event.target?.closest?.('td.program-cell, .program-cell') || null;
  }

  function isBlankCell(cell) {
    return !!cell && cell.classList.contains('program-cell') && !cell.dataset.entryId && !cell.classList.contains('outside');
  }

  function rememberBlankCell(cell) {
    if (!isBlankCell(cell)) return null;
    annotateTables();
    if (!cell.dataset.blankDate || !cell.dataset.blankTime || !cell.dataset.blankSlotKey) return null;
    lastBlankSlot = {
      date: cell.dataset.blankDate,
      time: cell.dataset.blankTime,
      key: cell.dataset.blankSlotKey
    };
    return lastBlankSlot;
  }

  function menuStateFromDom() {
    const menu = document.getElementById('blankSlotContextMenu');
    const tags = {};
    TAG_ORDER.forEach(tag => {
      const input = menu?.querySelector(`input[name="${tag}"]`);
      if (input?.checked) tags[tag] = true;
    });

    const satInput = menu?.querySelector('input[name="blankSatelliteFeed"]');
    const durationInput = menu?.querySelector('input[name="blankRectDuration"]:checked');
    const text = String(menu?.querySelector('#blankRectText')?.value || '').trim();

    return {
      tags,
      satelliteFeed: !!satInput?.checked,
      rectNote: text ? {
        text,
        durationMin: Number(durationInput?.value || 30) || 30,
        anchor: 'left'
      } : null
    };
  }

  function setStatus(message, kind) {
    const menu = document.getElementById('blankSlotContextMenu');
    let el = document.getElementById('blankSaveStatus');
    if (!el && menu) {
      el = document.createElement('div');
      el.id = 'blankSaveStatus';
      el.className = 'blank-save-status';
      el.setAttribute('aria-live', 'polite');
      menu.querySelector('.blank-slot-rect-tools')?.appendChild(el);
    }
    if (!el) return;
    el.textContent = message || '';
    el.dataset.kind = kind || 'ok';
  }

  function clearBlankSlot(slot) {
    const key = primaryMarksKey();
    const marks = readJson(key, {});
    delete marks[slot.key];
    writeJson(key, marks);
    renderNow();
  }

  function ensureOverlayLayer() {
    let layer = document.getElementById('wnmuBlankTopOverlayLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'wnmuBlankTopOverlayLayer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function activeTags(tags) {
    return TAG_ORDER.filter(tag => tags && tags[tag]);
  }

  function dominantTag(tags) {
    return activeTags(tags)[0] || '';
  }

  function tagLabel(tag) {
    return TAG_META[tag]?.label || tag;
  }

  function tagColor(tag) {
    return TAG_META[tag]?.color || '#e6e6e6';
  }

  function cellsForKey(key) {
    return Array.from(document.querySelectorAll('.wnmu-blank-slot-cell'))
      .filter(cell => cell.dataset.blankSlotKey === key);
  }

  function applyCellSuppression(marks) {
    document.querySelectorAll('.wnmu-blank-slot-cell.wnmu-has-blank-note-box').forEach(cell => {
      const key = cell.dataset.blankSlotKey;
      if (!key || !marks[key]?.rectNote?.text) cell.classList.remove('wnmu-has-blank-note-box');
    });

    Object.entries(marks).forEach(([key, mark]) => {
      if (!mark?.rectNote?.text) return;
      cellsForKey(key).forEach(cell => {
        cell.classList.add('wnmu-has-blank-note-box');
        cell.title = `${cell.dataset.blankDate || ''} ${cell.dataset.blankTime || ''} • Box note: ${mark.rectNote.text}`.trim();
      });
    });
  }

  function renderOverlayBox(layer, key, mark, cell) {
    const noteText = String(mark?.rectNote?.text || '').trim();
    if (!noteText) return;

    const rect = cell.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const rowRect = cell.closest('tr')?.getBoundingClientRect?.();
    const baseHeight = Math.max(18, rowRect?.height || rect.height || 0);
    const duration = Math.max(30, Number(mark.rectNote.durationMin || 30) || 30);
    const slots = Math.max(1, Math.round(duration / 30));
    const tags = activeTags(mark.tags || {});
    const domTag = dominantTag(mark.tags || {});
    const accent = domTag ? tagColor(domTag) : '#111';

    const box = document.createElement('div');
    box.className = 'wnmu-blank-top-note-box';
    box.dataset.blankSlotKey = key;
    box.style.left = `${rect.left + 3}px`;
    box.style.top = `${rect.top + 2}px`;
    box.style.width = `${Math.max(46, rect.width - 6)}px`;
    box.style.height = `${Math.max(24, baseHeight * slots - 4)}px`;
    box.style.borderLeftColor = accent;

    const tagHtml = tags.length ? `<div class="wnmu-blank-top-tags">${tags.map(tag => {
      return `<span class="wnmu-blank-top-tag" style="background:${escapeHtml(tagColor(tag))}">${escapeHtml(tagLabel(tag))}</span>`;
    }).join('')}</div>` : '';

    box.innerHTML = `
      ${tagHtml}
      <div class="wnmu-blank-top-note-text">${escapeHtml(noteText)}</div>
      <div class="wnmu-blank-top-note-duration">${duration} min</div>
    `;
    layer.appendChild(box);
  }

  function renderNow() {
    annotateTables();
    const marks = readAllBlankMarks();
    applyCellSuppression(marks);

    const layer = ensureOverlayLayer();
    layer.querySelectorAll('.wnmu-blank-top-note-box').forEach(el => el.remove());

    Object.entries(marks).forEach(([key, mark]) => {
      if (!mark?.rectNote?.text) return;
      const cell = cellsForKey(key)[0];
      if (!cell) return;
      renderOverlayBox(layer, key, mark, cell);
    });

    window.WNMU_BLANK_OVERLAY_HOTFIX = {
      version: VERSION,
      lastRenderAt: new Date().toISOString(),
      renderedCount: layer.querySelectorAll('.wnmu-blank-top-note-box').length,
      marksKey: primaryMarksKey()
    };
  }

  function scheduleRender(delay) {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderNow, Number(delay) || 60);
  }

  function installStyles() {
    if (document.getElementById('wnmuBlankOverlayHotfixV1437Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuBlankOverlayHotfixV1437Styles';
    style.textContent = `
      #wnmuBlankTopOverlayLayer {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        pointer-events: none !important;
        z-index: 2147483000 !important;
        overflow: visible !important;
      }

      .wnmu-blank-top-note-box {
        position: fixed !important;
        box-sizing: border-box !important;
        z-index: 2147483001 !important;
        background: #fff !important;
        color: #111 !important;
        border: 2px solid #111 !important;
        border-left-width: 8px !important;
        border-radius: 3px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,.24) !important;
        padding: 4px 6px !important;
        overflow: hidden !important;
        font: 700 11px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .wnmu-blank-top-tags {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 2px !important;
        margin-bottom: 3px !important;
      }

      .wnmu-blank-top-tag {
        display: inline-block !important;
        color: #111 !important;
        border: 1px solid rgba(0,0,0,.25) !important;
        border-radius: 999px !important;
        padding: 1px 5px !important;
        max-width: 100% !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        font-size: 9px !important;
        font-weight: 800 !important;
      }

      .wnmu-blank-top-note-text {
        white-space: pre-wrap !important;
        overflow-wrap: anywhere !important;
      }

      .wnmu-blank-top-note-duration {
        position: absolute !important;
        right: 4px !important;
        bottom: 2px !important;
        font-size: 8px !important;
        font-weight: 700 !important;
        color: rgba(0,0,0,.48) !important;
      }

      .wnmu-has-blank-note-box > .wnmu-blank-slot-content,
      .wnmu-has-blank-note-box .wnmu-blank-slot-content {
        display: none !important;
      }

      #blankSlotContextMenu {
        z-index: 2147483002 !important;
      }

      #blankSaveStatus[data-kind="ok"] { color: #145c22 !important; font-weight: 800 !important; }
      #blankSaveStatus[data-kind="pending"] { color: #6f4c00 !important; font-weight: 800 !important; }
      #blankSaveStatus[data-kind="error"] { color: #9b111e !important; font-weight: 800 !important; }
    `;
    document.head.appendChild(style);
  }

  function installEventHandlers() {
    document.addEventListener('contextmenu', event => {
      const cell = cellFromEvent(event);
      if (isBlankCell(cell)) rememberBlankCell(cell);
    }, true);

    document.addEventListener('pointerdown', event => {
      const menu = document.getElementById('blankSlotContextMenu');
      if (menu && menu.contains(event.target)) event.stopPropagation();
    }, true);

    document.addEventListener('mousedown', event => {
      const menu = document.getElementById('blankSlotContextMenu');
      if (menu && menu.contains(event.target)) event.stopPropagation();
    }, true);

    document.addEventListener('click', event => {
      const menu = document.getElementById('blankSlotContextMenu');
      const saveBtn = event.target?.closest?.('#blankSaveRectBtn');
      const clearBtn = event.target?.closest?.('#blankClearRectBtn');
      if (!saveBtn && !clearBtn) {
        if (menu && menu.contains(event.target)) event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const slot = lastBlankSlot;
      if (!slot) {
        setStatus('No blank slot selected. Right-click the blank cell again.', 'error');
        return;
      }

      if (clearBtn) {
        clearBlankSlot(slot);
        const textBox = document.getElementById('blankRectText');
        if (textBox) textBox.value = '';
        setStatus('Box note cleared.', 'ok');
        scheduleRender(20);
        return;
      }

      const mark = menuStateFromDom();
      const saved = writeBlankMark(slot, mark);
      const savedText = saved.rectNote?.text || '';
      if (savedText) setStatus('Box note saved and drawn on top layer.', 'ok');
      else setStatus('Blank-slot settings saved.', 'ok');

      renderNow();
      scheduleRender(120);
      scheduleRender(400);
    }, true);

    window.addEventListener('scroll', () => scheduleRender(20), true);
    window.addEventListener('resize', () => scheduleRender(20));
    window.addEventListener('orientationchange', () => scheduleRender(80));
    window.addEventListener('storage', () => scheduleRender(80));
  }

  function installObserver() {
    if (observer) return;
    const target = document.getElementById('weekGrids') || document.body;
    observer = new MutationObserver(mutations => {
      const overlayOnly = mutations.every(mutation => {
        const targetEl = mutation.target && mutation.target.nodeType === 1 ? mutation.target : null;
        if (targetEl?.closest?.('#wnmuBlankTopOverlayLayer')) return true;
        const nodes = [...mutation.addedNodes, ...mutation.removedNodes].filter(node => node.nodeType === 1);
        return nodes.length > 0 && nodes.every(node => {
          return node.id === 'wnmuBlankTopOverlayLayer' || node.closest?.('#wnmuBlankTopOverlayLayer');
        });
      });
      if (!overlayOnly) scheduleRender(120);
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function start() {
    installStyles();
    installEventHandlers();
    installObserver();
    window.setTimeout(renderNow, 100);
    window.setTimeout(renderNow, 500);
    window.setTimeout(renderNow, 1200);
    window.WNMU_BLANK_OVERLAY_HOTFIX_VERSION = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
