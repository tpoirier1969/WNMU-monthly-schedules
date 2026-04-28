(function () {
  'use strict';
  const VERSION = 'v1.5.21-manual-program-entries';
  window.WNMU_MANUAL_PROGRAMS_VERSION = VERSION;

  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  let refreshTimer = null;
  let observerInstalled = false;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function channelCode() { return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1'); }
  function monthKey() { return (window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey) || new URLSearchParams(location.search).get('month') || ''; }
  function storageKey() { return cfg().storageKey || ''; }
  function canonicalStoreKey() { const base = storageKey(); return base ? `${base}::cellOverrides.v1.5.0` : ''; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
  function css(value) { return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'); }
  function readJson(key, fallback) { try { const raw = key && localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function nearestDuration(value) { const n = Number(value) || 30; return DURATIONS.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, DURATIONS[0]); }
  function timeToSlot(time) { const m = String(time || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return -1; return Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0); }
  function slotToTime(slot) { const h = Math.floor(slot / 2) % 24; return `${pad(h)}:${slot % 2 ? '30' : '00'}`; }

  function allMenuTags() {
    const base = Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : [];
    if (!base.includes('satelliteFeed')) base.push('satelliteFeed');
    return base;
  }
  function tagMeta(tag) {
    const fallback = {
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
    return (cfg().tagMeta && cfg().tagMeta[tag]) || fallback[tag] || { label: tag, color: '#fff' };
  }
  function activeTagKeys(tags, includeSatellite) {
    return allMenuTags().filter(tag => !!(tags && tags[tag]) && (includeSatellite || tag !== 'satelliteFeed'));
  }
  function dominantTag(tags) {
    const active = activeTagKeys(tags, false);
    const priority = Array.isArray(cfg().tagPriority) ? cfg().tagPriority : allMenuTags();
    return priority.find(tag => active.includes(tag)) || active[0] || '';
  }
  function backgroundForTags(tags) {
    const dom = dominantTag(tags || {});
    return dom ? (tagMeta(dom).color || '#fff') : '#fff';
  }

  function canonicalRecords() {
    const key = canonicalStoreKey();
    const records = readJson(key, {});
    return records && typeof records === 'object' ? records : {};
  }
  function mainRecords() {
    const key = storageKey();
    const records = readJson(key, {});
    return records && typeof records === 'object' ? records : {};
  }
  function recordForKey(key) {
    if (!key) return null;
    const canon = canonicalRecords()[key];
    if (canon && typeof canon === 'object') return canon;
    const main = mainRecords()[key];
    if (main && typeof main === 'object') return main;
    return null;
  }
  function recordsWithText() {
    const out = [];
    const seen = new Set();
    const stores = [canonicalRecords(), mainRecords()];
    stores.forEach(store => {
      Object.entries(store || {}).forEach(([key, raw]) => {
        if (!raw || typeof raw !== 'object' || seen.has(key)) return;
        const text = String(raw.text || raw.rectNote?.text || '').trim();
        if (!text || raw.cleared) return;
        const date = raw.date || (String(key).match(/__(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})$/) || [])[1] || '';
        const time = raw.time || (String(key).match(/__(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})$/) || [])[2] || '';
        if (!date || !time) return;
        seen.add(key);
        out.push({ key, ...raw, text, date, time, durationMin: nearestDuration(raw.durationMin || raw.rectNote?.durationMin || 30), tags: normalizeTags(raw.tags || {}) });
      });
    });
    return out;
  }
  function normalizeTags(tags) {
    const out = {};
    allMenuTags().forEach(tag => { out[tag] = !!(tags && tags[tag]); });
    return out;
  }

  function ensureStyles() {
    if (document.getElementById('wnmuManualProgramsStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuManualProgramsStyles';
    style.textContent = `
      body.wnmu-manual-programs-active .wnmu-cell-override-box:not(.wnmu-manual-program-block) {
        display: none !important;
      }
      body.wnmu-manual-programs-active .wnmu-cell-override-box.wnmu-manual-program-block {
        background: var(--wnmu-manual-program-bg, #fff) !important;
        border: 1px solid rgba(17, 24, 39, .72) !important;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.34), 0 1px 3px rgba(0,0,0,.12) !important;
        color: var(--ink, #1d2733) !important;
        border-radius: 3px !important;
        padding: 5px 6px !important;
        overflow: hidden !important;
        pointer-events: auto !important;
      }
      .wnmu-manual-program-title { font-weight: 800; font-size: 12px; line-height: 1.15; margin: 0 0 3px; word-break: break-word; }
      .wnmu-manual-program-meta { font-size: 10px; line-height: 1.1; color: rgba(29,39,51,.72); margin-bottom: 3px; }
      .wnmu-manual-program-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
      .wnmu-manual-program-tags span { display: inline-flex; align-items: center; border: 1px solid rgba(32,56,100,.18); border-radius: 999px; background: rgba(255,255,255,.72); padding: 2px 5px; font-size: 9px; line-height: 1; }
      .wnmu-manual-covered-by-program { opacity: .22; }
      .wnmu-manual-covered-by-program .program-content { filter: grayscale(1); }
      @media print {
        body.wnmu-manual-programs-active .wnmu-cell-override-box.wnmu-manual-program-block { border-width: 1px !important; box-shadow: none !important; }
        .wnmu-manual-program-title { font-size: 7.5px; line-height: 1.05; }
        .wnmu-manual-program-meta, .wnmu-manual-program-tags span { font-size: 6px; }
      }
    `;
    document.head.appendChild(style);
  }

  function styleAndRewriteBox(box) {
    if (!box || !box.dataset) return;
    const rec = recordForKey(box.dataset.wnmuCellKey || '');
    const text = String(rec?.text || rec?.rectNote?.text || '').trim();
    if (!rec || rec.cleared || !text) {
      box.classList.remove('wnmu-manual-program-block');
      box.style.display = 'none';
      return;
    }
    const tags = normalizeTags(rec.tags || {});
    const duration = nearestDuration(rec.durationMin || rec.rectNote?.durationMin || 30);
    box.classList.add('wnmu-manual-program-block');
    box.style.display = '';
    box.style.setProperty('--wnmu-manual-program-bg', backgroundForTags(tags));
    box.title = `Manual program entry (${rec.date || box.dataset.wnmuDate || ''} ${rec.time || box.dataset.wnmuTime || ''})`;
    const active = activeTagKeys(tags, false);
    const tagHtml = active.length ? `<div class="wnmu-manual-program-tags">${active.slice(0, 6).map(tag => `<span>${esc(tagMeta(tag).label || tag)}</span>`).join('')}</div>` : '';
    box.innerHTML = `<div class="wnmu-manual-program-title">${esc(text)}</div><div class="wnmu-manual-program-meta">${duration} min</div>${tagHtml}`;
  }

  function headerDates(table) {
    const year = Number(String(monthKey() || '').split('-')[0]) || new Date().getFullYear();
    const months = { jan:'01', january:'01', feb:'02', february:'02', mar:'03', march:'03', apr:'04', april:'04', may:'05', jun:'06', june:'06', jul:'07', july:'07', aug:'08', august:'08', sep:'09', sept:'09', september:'09', oct:'10', october:'10', nov:'11', november:'11', dec:'12', december:'12' };
    return Array.from(table.querySelectorAll('thead th:not(.time-col)')).map(th => {
      const lines = (th.innerText || th.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
      const label = (lines[lines.length - 1] || '').toLowerCase().replace(/,/g, '');
      const m = label.match(/^([a-z]+)\s+(\d{1,2})$/);
      return m && months[m[1]] ? `${year}-${months[m[1]]}-${pad(Number(m[2]))}` : '';
    });
  }

  function cellByDateTime(date, time) {
    const exact = document.querySelector(`.screen-week-grid .program-cell[data-entry-id^="${css(`${date}__${time}__`)}"]`);
    if (exact) return exact;
    const slot = timeToSlot(time);
    if (slot < 0) return null;
    for (const table of Array.from(document.querySelectorAll('table.screen-week-grid'))) {
      const dates = headerDates(table);
      const dayIndex = dates.indexOf(date);
      if (dayIndex < 0) continue;
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const row = rows[slot];
      if (!row) continue;
      const headers = Array.from(table.querySelectorAll('thead th:not(.time-col)'));
      const headerRect = headers[dayIndex]?.getBoundingClientRect();
      const cells = Array.from(row.children).filter(td => !td.classList.contains('time-col'));
      if (!headerRect || !cells.length) return cells[dayIndex] || null;
      const center = headerRect.left + headerRect.width / 2;
      let best = null, dist = Infinity;
      cells.forEach(cell => { const r = cell.getBoundingClientRect(); const d = Math.abs((r.left + r.width / 2) - center); if (d < dist) { dist = d; best = cell; } });
      if (best) return best;
    }
    return null;
  }

  function markCoveredCells() {
    document.querySelectorAll('.wnmu-manual-covered-by-program').forEach(el => el.classList.remove('wnmu-manual-covered-by-program'));
    recordsWithText().forEach(rec => {
      const start = timeToSlot(rec.time);
      const slots = Math.max(1, Math.round(nearestDuration(rec.durationMin) / 30));
      for (let i = 0; i < slots; i += 1) {
        const t = slotToTime(start + i);
        const cell = cellByDateTime(rec.date, t);
        if (cell && !(i === 0 && cell.querySelector('.wnmu-manual-program-block'))) cell.classList.add('wnmu-manual-covered-by-program');
      }
    });
  }

  function rewriteMenuText(root) {
    const menu = root || document.getElementById('wnmuCellMenu');
    if (!menu) return;
    const replacements = [
      ['Schedule cell note', 'Schedule program entry'],
      ['White override box', 'Manual program entry'],
      ['Box size / length', 'Program length'],
      ['Box note text', 'Program title / replacement text'],
      ['Save box note', 'Save program'],
      ['Clear box note', 'Clear program'],
      ['No saved note yet', 'No manual program yet'],
      ['no saved note yet', 'no manual program yet'],
      ['Box note saved.', 'Program entry saved.'],
      ['Clear rectangle / note', 'Clear program entry'],
      ['Clear tags and rectangle note', 'Clear tags and program entry']
    ];
    const walk = document.createTreeWalker(menu, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    nodes.forEach(node => {
      let txt = node.nodeValue;
      replacements.forEach(([a, b]) => { txt = txt.split(a).join(b); });
      node.nodeValue = txt;
    });
    const textarea = menu.querySelector('#wnmuCellText');
    if (textarea) textarea.placeholder = 'Type the program title or replacement schedule instruction';
    const help = menu.querySelector('.manual-rect-help');
    if (help) help.textContent = 'This manual program replaces anything currently scheduled in the selected time block.';
  }

  function refresh() {
    ensureStyles();
    document.body.classList.add('wnmu-manual-programs-active');
    document.querySelectorAll('.wnmu-cell-override-box').forEach(styleAndRewriteBox);
    markCoveredCells();
    rewriteMenuText();
  }
  function queueRefresh(delay = 40) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, delay);
  }

  function installObserver() {
    if (observerInstalled) return;
    observerInstalled = true;
    const obs = new MutationObserver(muts => {
      let hit = false;
      for (const mut of muts) {
        if (mut.target?.id === 'wnmuCellMenu' || mut.target?.closest?.('#wnmuCellMenu')) hit = true;
        for (const node of mut.addedNodes || []) {
          if (node.nodeType === 1 && (node.matches?.('.wnmu-cell-override-box,#wnmuCellMenu') || node.querySelector?.('.wnmu-cell-override-box,#wnmuCellMenu'))) hit = true;
        }
      }
      if (hit) queueRefresh(20);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function start() {
    ensureStyles();
    installObserver();
    refresh();
    [250, 800, 1600, 3000, 6000].forEach(ms => window.setTimeout(refresh, ms));
    window.addEventListener('storage', event => { if (event.key === storageKey() || event.key === canonicalStoreKey()) queueRefresh(30); });
    window.addEventListener('beforeprint', refresh);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
