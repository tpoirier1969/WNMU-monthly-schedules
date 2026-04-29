(function () {
  'use strict';
  const VERSION = 'v1.5.33-manual-programs-commit-button-persistence';
  window.WNMU_MANUAL_PROGRAMS_VERSION = VERSION;

  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  let refreshTimer = null;
  let observerInstalled = false;
  let lastSignature = '';

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function channelCode() { return cfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1'); }
  function monthKey() { return (window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey) || new URLSearchParams(location.search).get('month') || ''; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
  function slugify(text) { return String(text || 'manual-program').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'manual-program'; }
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
      newSeries: { label: 'New Series', color: '#fff2a8' }, highlight: { label: 'Highlight', color: '#b9dcff' }, oneOff: { label: 'One Off', color: '#ffd9b5' }, monthlyTopic: { label: 'Monthly topic', color: '#d7c4ff' }, fundraiser: { label: 'Fundraiser', color: '#ffc7d1' }, programmersChoice: { label: "Programmer's Choice", color: '#c9f4d2' }, holiday: { label: 'Holiday', color: '#fde2e2' }, noteworthy: { label: 'Noteworthy', color: '#fff0bd' }, educational: { label: 'Educational', color: '#cce7ff' }, local: { label: 'Local', color: '#d6f5d6' }, michigan: { label: 'Michigan', color: '#d5e8ff' }, arts: { label: 'Arts', color: '#ead9ff' }, satelliteFeed: { label: 'Satellite Feed', color: '#e6e6e6' }
    };
    return (cfg().tagMeta && cfg().tagMeta[tag]) || fallback[tag] || { label: tag, color: '#fff' };
  }
  function activeTagKeys(tags, includeSatellite) { return allMenuTags().filter(tag => !!(tags && tags[tag]) && (includeSatellite || tag !== 'satelliteFeed')); }
  function dominantTag(tags) { const active = activeTagKeys(tags, false); const priority = Array.isArray(cfg().tagPriority) ? cfg().tagPriority : allMenuTags(); return priority.find(tag => active.includes(tag)) || active[0] || ''; }
  function backgroundForTags(tags) { const dom = dominantTag(tags || {}); return dom ? (tagMeta(dom).color || '#fff') : '#fff'; }
  function normalizeTags(tags) { const out = {}; allMenuTags().forEach(tag => { out[tag] = !!(tags && tags[tag]); }); return out; }

  function committedRows() {
    const rows = Array.isArray(window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS) ? window.WNMU_COMMITTED_MANUAL_PROGRAM_ROWS : [];
    return rows.filter(row => row && row.is_active !== false && row.updated_by === 'schedule-page-commit' && String(row.title_text || row.text || '').trim()).map(row => {
      const date = row.date || '';
      const time = row.slot_time || row.time || '';
      const text = String(row.title_text || row.text || '').trim();
      return { key: row.entry_key || `${channelCode()}__${monthKey() || String(date).slice(0, 7)}__${date}__${time}`, text, date, time, durationMin: nearestDuration(row.duration_min || row.durationMin || 30), tags: normalizeTags(row.tags_json || row.tags || {}), updatedAt: row.updated_at || row.updatedAt || '' };
    }).filter(rec => rec.date && rec.time && rec.text).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || b.durationMin - a.durationMin);
  }

  function ensureStyles() {
    if (document.getElementById('wnmuManualProgramsStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuManualProgramsStyles';
    style.textContent = `
      .program-cell.wnmu-manual-program-cell { background: var(--mark-background, #fff) !important; box-shadow: inset 0 0 0 2px rgba(17,24,39,.45) !important; border-color: rgba(17,24,39,.78) !important; }
      .program-cell.wnmu-manual-program-cell .program-title { font-weight: 850; font-size: 12px; line-height: 1.18; }
      .program-cell.wnmu-manual-program-cell .program-duration::before { content: 'Committed program • '; font-weight: 700; color: rgba(29,39,51,.75); }
      .wnmu-manual-hidden-source { display: none !important; }
      .program-cell.wnmu-manual-program-cell[data-wnmu-date], .program-cell.wnmu-manual-program-cell[data-wnmu-time] { cursor: context-menu; }
      @media print { .program-cell.wnmu-manual-program-cell { box-shadow: inset 0 0 0 1px #111 !important; } .program-cell.wnmu-manual-program-cell .program-title { font-size: 8.5px; line-height: 1.05; } }
    `;
    document.head.appendChild(style);
  }

  function parseMonthDay(label, fallbackYear) {
    const months = { jan:'01', january:'01', feb:'02', february:'02', mar:'03', march:'03', apr:'04', april:'04', may:'05', jun:'06', june:'06', jul:'07', july:'07', aug:'08', august:'08', sep:'09', sept:'09', september:'09', oct:'10', october:'10', nov:'11', november:'11', dec:'12', december:'12' };
    const m = String(label || '').trim().toLowerCase().replace(/,/g, '').match(/^([a-z]+)\s+(\d{1,2})$/);
    return m && months[m[1]] ? `${fallbackYear}-${months[m[1]]}-${pad(Number(m[2]))}` : '';
  }
  function headerDates(table) {
    const year = Number(String(monthKey() || '').split('-')[0]) || new Date().getFullYear();
    return Array.from(table.querySelectorAll('thead th:not(.time-col)')).map(th => { const lines = (th.innerText || th.textContent || '').split('\n').map(s => s.trim()).filter(Boolean); return parseMonthDay(lines[lines.length - 1] || '', year); });
  }
  function tableForDate(date, selector) { for (const table of Array.from(document.querySelectorAll(selector))) { const dates = headerDates(table); const dayIndex = dates.indexOf(date); if (dayIndex >= 0) return { table, dates, dayIndex }; } return null; }
  function restoreTables() {
    document.querySelectorAll('.wnmu-manual-program-cell').forEach(cell => cell.remove());
    document.querySelectorAll('[data-wnmu-manual-original-rowspan]').forEach(cell => { const n = Number(cell.dataset.wnmuManualOriginalRowspan || 1) || 1; cell.rowSpan = n; delete cell.dataset.wnmuManualOriginalRowspan; });
    document.querySelectorAll('.wnmu-manual-hidden-source').forEach(cell => { cell.classList.remove('wnmu-manual-hidden-source'); cell.style.display = ''; });
  }
  function buildOccupancy(table) {
    const rows = Array.from(table.querySelectorAll('tbody tr')); const grid = rows.map(() => new Array(7).fill(null));
    rows.forEach((row, r) => { let col = 0; Array.from(row.children).forEach(cell => { if (cell.classList.contains('time-col') || cell.classList.contains('wnmu-manual-hidden-source')) return; while (col < 7 && grid[r][col]) col += 1; if (col >= 7) return; const span = Math.max(1, Number(cell.rowSpan || cell.getAttribute('rowspan') || 1)); const occ = { cell, row: r, col, span }; for (let rr = r; rr < Math.min(rows.length, r + span); rr += 1) grid[rr][col] = { ...occ, anchor: rr === r }; cell.dataset.wnmuManualGridRow = String(r); cell.dataset.wnmuManualGridCol = String(col); col += 1; }); });
    return { rows, grid };
  }
  function firstAnchorCellAtOrAfter(row, rowIndex, col, grid) { for (let c = col; c < 7; c += 1) { const occ = grid[rowIndex]?.[c]; if (occ && occ.anchor && occ.cell && occ.cell.parentElement === row && !occ.cell.classList.contains('wnmu-manual-hidden-source')) return occ.cell; } return null; }
  function createManualCell(rec, span, tableKind) {
    const td = document.createElement('td'); td.className = 'program-cell wnmu-manual-program-cell'; if (activeTagKeys(rec.tags, false).length) td.classList.add('marked'); td.rowSpan = span; td.dataset.entryId = `${rec.date}__${rec.time}__manual-program__${slugify(rec.text)}`; td.dataset.wnmuCellKey = rec.key; td.dataset.wnmuDate = rec.date; td.dataset.wnmuTime = rec.time; td.dataset.wnmuManualProgram = '1'; td.dataset.wnmuManualTableKind = tableKind || ''; td.style.setProperty('--mark-background', backgroundForTags(rec.tags));
    const active = activeTagKeys(rec.tags, false); const tags = active.length ? `<div class="program-tags">${active.slice(0, 6).map(tag => `<span class="tag-pill" style="--tag-color:${esc(tagMeta(tag).color || '#ddd')}">${esc(tagMeta(tag).label || tag)}</span>`).join('')}</div>` : '';
    td.innerHTML = `<div class="program-content"><div class="program-title">${esc(rec.text)}</div><div class="program-duration">${nearestDuration(rec.durationMin)} min</div>${tags}</div>`; return td;
  }
  function shortenPriorSpanIfNeeded(table, startRow, col) { let state = buildOccupancy(table); const occ = state.grid[startRow]?.[col]; if (occ && occ.row < startRow && occ.cell) { if (!occ.cell.dataset.wnmuManualOriginalRowspan) occ.cell.dataset.wnmuManualOriginalRowspan = String(occ.cell.rowSpan || occ.span || 1); occ.cell.rowSpan = Math.max(1, startRow - occ.row); state = buildOccupancy(table); } return state; }
  function hideCoveredAnchors(state, startRow, endRow, col) { const hidden = new Set(); for (let r = startRow; r < endRow; r += 1) { const occ = state.grid[r]?.[col]; if (!occ || !occ.cell || hidden.has(occ.cell)) continue; if (occ.row >= startRow && occ.row < endRow) { occ.cell.classList.add('wnmu-manual-hidden-source'); hidden.add(occ.cell); } } }
  function insertManualCell(table, dayIndex, rec, tableKind) {
    const start = timeToSlot(rec.time); if (start < 0) return false; const rows = Array.from(table.querySelectorAll('tbody tr')); if (!rows[start]) return false; const slots = Math.max(1, Math.round(nearestDuration(rec.durationMin) / 30)); const span = Math.min(slots, rows.length - start); if (span <= 0) return false; let state = shortenPriorSpanIfNeeded(table, start, dayIndex); const startRow = rows[start]; const before = firstAnchorCellAtOrAfter(startRow, start, dayIndex, state.grid); hideCoveredAnchors(state, start, start + span, dayIndex); const manualCell = createManualCell(rec, span, tableKind); if (before && before.parentElement === startRow) startRow.insertBefore(manualCell, before); else startRow.appendChild(manualCell); return true;
  }
  function applyToTables(selector, tableKind) {
    const records = committedRows(); const occupiedManual = new Set();
    records.forEach(rec => { const found = tableForDate(rec.date, selector); if (!found) return; const start = timeToSlot(rec.time); const slots = Math.max(1, Math.round(nearestDuration(rec.durationMin) / 30)); let overlaps = false; for (let i = 0; i < slots; i += 1) { const k = `${tableKind}::${rec.date}::${slotToTime(start + i)}`; if (occupiedManual.has(k)) overlaps = true; } if (overlaps) return; if (insertManualCell(found.table, found.dayIndex, rec, tableKind)) { for (let i = 0; i < slots; i += 1) occupiedManual.add(`${tableKind}::${rec.date}::${slotToTime(start + i)}`); } });
  }
  function rewriteMenuText(root) {
    const menu = root || document.getElementById('wnmuCellMenu'); if (!menu) return;
    const replacements = [['Schedule cell note','Schedule program entry'],['White override box','Staged program entry'],['Box size / length','Program length'],['Box note text','Program title / replacement text'],['Save box note','Save staged program'],['Clear box note','Clear staged program'],['No saved note yet','No staged program yet'],['no saved note yet','no staged program yet'],['Box note saved.','Staged program saved.'],['Clear rectangle / note','Clear staged program'],['Clear tags and rectangle note','Clear tags and staged program']];
    const walk = document.createTreeWalker(menu, NodeFilter.SHOW_TEXT); const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode); nodes.forEach(node => { let txt = node.nodeValue; replacements.forEach(([a,b]) => { txt = txt.split(a).join(b); }); node.nodeValue = txt; });
    const textarea = menu.querySelector('#wnmuCellText'); if (textarea) textarea.placeholder = 'Type the program title or replacement schedule instruction'; const help = menu.querySelector('.manual-rect-help'); if (help) help.textContent = 'Save keeps this as a staged overlay. Commit to Schedule writes it as the real schedule item and clears the overlay.';
  }
  function signature() { const tableCount = document.querySelectorAll('table.screen-week-grid, table.print-week-grid').length; const rowCount = document.querySelectorAll('table.screen-week-grid tbody tr, table.print-week-grid tbody tr').length; const recs = committedRows().map(r => `${r.key}|${r.text}|${r.durationMin}|${JSON.stringify(r.tags)}|${r.updatedAt}`).join('||'); return `${tableCount}:${rowCount}:${recs}`; }
  function refresh(force) { ensureStyles(); rewriteMenuText(); const sig = signature(); if (!force && sig === lastSignature && document.querySelector('.wnmu-manual-program-cell')) return; lastSignature = sig; restoreTables(); applyToTables('table.screen-week-grid', 'screen'); applyToTables('table.print-week-grid', 'print'); }
  function queueRefresh(delay = 40, force = false) { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(() => refresh(force), delay); }
  function installObserver() {
    if (observerInstalled) return;
    observerInstalled = true;
    const obs = new MutationObserver(muts => {
      let tableHit = false;
      let menuHit = false;
      for (const mut of muts) {
        // Menu status/text updates must NOT trigger full table rebuilds. That caused
        // the browser to churn during Commit to Schedule and could make the page appear frozen.
        if (mut.target?.closest?.('#wnmuCellMenu')) continue;
        for (const node of mut.addedNodes || []) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('#wnmuCellMenu') || node.querySelector?.('#wnmuCellMenu')) menuHit = true;
          if (node.matches?.('table.screen-week-grid,table.print-week-grid') || node.querySelector?.('table.screen-week-grid,table.print-week-grid')) tableHit = true;
        }
      }
      if (menuHit) window.setTimeout(() => rewriteMenuText(), 20);
      if (tableHit) queueRefresh(60, true);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.WNMU_MANUAL_PROGRAMS_REFRESH = function WNMU_MANUAL_PROGRAMS_REFRESH() { queueRefresh(10, true); };
  function start() { ensureStyles(); installObserver(); refresh(true); [250, 800, 1600, 3000, 6000].forEach(ms => window.setTimeout(() => refresh(true), ms)); window.addEventListener('wnmu:manual-program-overrides-updated', () => queueRefresh(30, true)); window.addEventListener('beforeprint', () => refresh(true)); window.addEventListener('afterprint', () => queueRefresh(50, true)); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
