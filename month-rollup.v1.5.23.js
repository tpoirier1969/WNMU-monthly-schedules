(function () {
  'use strict';
  const VERSION = 'v1.5.23-standalone-month-rollup';
  window.WNMU_MONTH_ROLLUP_VERSION = VERSION;

  const TABLES = {
    importedMonths: 'wnmu_monthly_schedules_imported_months',
    currentMonths: 'wnmu_monthly_schedules_current_months',
    sharedMarks: 'wnmu_monthly_schedules_shared_marks'
  };

  const CHANNELS = {
    '13.1': {
      label: 'WNMU1HD',
      page: 'index131.v1.4.1.html',
      useSourceInId: false,
      tagOrder: ['newSeries','highlight','oneOff','monthlyTopic','fundraiser','programmersChoice','holiday','noteworthy','educational','local','michigan'],
      tagPriority: ['holiday','fundraiser','programmersChoice','michigan','local','educational','highlight','newSeries','noteworthy','oneOff','monthlyTopic'],
      suppressAllAutoRules: [],
      suppressNewSeriesRules: [
        { range: ['01:00', '07:00'] },
        { weekdays: ['Monday','Tuesday','Wednesday','Thursday','Friday'], range: ['08:30', '15:00'] }
      ],
      autoTagRules: [
        { tag: 'programmersChoice', weekdays: ['Sunday'], times: ['19:00'] },
        { tag: 'programmersChoice', weekdays: ['Saturday'], times: ['20:00'] },
        { tag: 'local', weekdays: ['Thursday'], times: ['20:00'] },
        { tag: 'local', weekdays: ['Friday'], times: ['15:00'] },
        { tag: 'local', weekdays: ['Saturday'], times: ['18:00'] },
        { tag: 'local', weekdays: ['Sunday'], times: ['14:00'] },
        { tag: 'michigan', weekdays: ['Thursday'], times: ['21:00','21:30','22:00','22:30'] },
        { tag: 'michigan', weekdays: ['Friday'], times: ['20:30'] },
        { tag: 'michigan', weekdays: ['Sunday'], times: ['12:30'] }
      ],
      tagMeta: {
        newSeries: 'New Series', highlight: 'Highlight', oneOff: 'One Off', monthlyTopic: 'Monthly topic', fundraiser: 'Fundraiser', programmersChoice: "Programmer's Choice", holiday: 'Holiday', noteworthy: 'Noteworthy', educational: 'Educational', local: 'Local', michigan: 'Michigan'
      }
    },
    '13.3': {
      label: 'WNMU3PL',
      page: 'index133.v1.4.1.html',
      useSourceInId: true,
      tagOrder: ['newSeries','highlight','oneOff','monthlyTopic','fundraiser','programmersChoice','holiday','noteworthy','educational','local','arts'],
      tagPriority: ['holiday','fundraiser','programmersChoice','arts','educational','highlight','newSeries','noteworthy','local','oneOff','monthlyTopic'],
      suppressAllAutoRules: [
        { range: ['00:00', '09:30'] },
        { weekdays: ['Monday','Tuesday','Wednesday','Thursday','Friday'], range: ['09:30', '17:30'] },
        { weekdays: ['Saturday'], range: ['09:30', '16:00'] }
      ],
      suppressNewSeriesRules: [],
      autoTagRules: [
        { tag: 'programmersChoice', weekdays: ['Sunday'], times: ['19:00'] },
        { tag: 'educational', weekdays: ['Saturday'], times: ['20:00'] },
        { tag: 'arts', weekdays: ['Saturday'], range: ['17:00', '20:00'] },
        { tag: 'arts', weekdays: ['Sunday'], range: ['10:00', '13:00'] }
      ],
      tagMeta: {
        newSeries: 'New Series', highlight: 'Highlight', oneOff: 'One Off', monthlyTopic: 'Monthly topic', fundraiser: 'Fundraiser', programmersChoice: "Programmer's Choice", holiday: 'Holiday', noteworthy: 'Noteworthy', educational: 'Educational', local: 'Local', arts: 'Arts'
      }
    }
  };

  const params = new URLSearchParams(location.search);
  let channel = params.get('channel') || params.get('ch') || '13.1';
  let month = params.get('month') || '';
  if (!CHANNELS[channel]) channel = '13.1';
  const CONFIG = CHANNELS[channel];

  function $(id) { return document.getElementById(id); }
  function esc(text) {
    return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }
  function slugify(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function monthLabel(monthKey) {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    if (!y || !m) return monthKey || 'Selected month';
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function fmtDate(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  }
  function fmtTime(timeStr) {
    const [hh, mm] = String(timeStr || '').split(':').map(Number);
    if (Number.isNaN(hh)) return timeStr || '';
    return new Date(2026, 0, 1, hh, mm || 0).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }
  function getWeekday(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  function timeToSlot(timeStr) {
    const [hh, mm] = String(timeStr || '').split(':').map(Number);
    return (hh || 0) * 2 + ((mm || 0) >= 30 ? 1 : 0);
  }
  function inRange(timeStr, start, end) {
    const t = timeToSlot(timeStr);
    return t >= timeToSlot(start) && t <= timeToSlot(end);
  }
  function ruleMatches(entry, rule) {
    const weekday = getWeekday(entry.date);
    if (rule.weekdays && !rule.weekdays.includes(weekday)) return false;
    if (rule.times && !rule.times.includes(entry.time)) return false;
    if (rule.range && !inRange(entry.time, rule.range[0], rule.range[1])) return false;
    if (rule.titleIncludes) {
      const title = String(entry.title || '').toLowerCase();
      if (!rule.titleIncludes.every(bit => title.includes(String(bit).toLowerCase()))) return false;
    }
    return true;
  }
  function matchesAny(entry, rules) { return (rules || []).some(rule => ruleMatches(entry, rule)); }
  function shouldApplyAuto(entry, tag) {
    if (matchesAny(entry, CONFIG.suppressAllAutoRules)) return false;
    if (tag === 'newSeries' && matchesAny(entry, CONFIG.suppressNewSeriesRules)) return false;
    return true;
  }
  function defaultTags(entry) {
    const tags = Object.fromEntries(CONFIG.tagOrder.map(tag => [tag, false]));
    if (entry.seasonStart && shouldApplyAuto(entry, 'newSeries')) tags.newSeries = true;
    (CONFIG.autoTagRules || []).forEach(rule => {
      if (shouldApplyAuto(entry, rule.tag) && ruleMatches(entry, rule)) tags[rule.tag] = true;
    });
    return tags;
  }
  function entryId(entry) {
    if (CONFIG.useSourceInId) {
      return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}__${slugify(entry.sourceDate || entry.date)}__${slugify(entry.sourceTime || entry.time)}`;
    }
    return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}`;
  }
  function cellKey(date, time) { return `${channel}__${month}__${date}__${time}`; }
  function parseCellKey(key) {
    const re = /^(13\.1|13\.3)__(\d{4}-\d{2})__(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})$/;
    const m = String(key || '').match(re);
    return m ? { channel: m[1], month: m[2], date: m[3], time: m[4] } : null;
  }
  function normalizeState(value) {
    if (!value || typeof value !== 'object') return { tags: {}, rectNote: null, text: '' };
    const tags = value.tags && typeof value.tags === 'object' ? value.tags : value;
    const rect = value.rectNote || null;
    return {
      tags: tags || {},
      rectNote: rect,
      text: value.text || rect?.text || value.note || '',
      durationMin: value.durationMin || rect?.durationMin || null
    };
  }
  function mergedTags(entry, state) {
    const base = defaultTags(entry);
    const saved = normalizeState(state).tags || {};
    const out = {};
    CONFIG.tagOrder.forEach(tag => { out[tag] = typeof saved[tag] === 'boolean' ? saved[tag] : !!base[tag]; });
    return out;
  }
  function activeLabels(tags) {
    return CONFIG.tagOrder.filter(tag => tags[tag]).map(tag => CONFIG.tagMeta[tag] || tag);
  }
  function cfg() {
    const c = window.WNMU_SHAREBOARD_SUPABASE;
    if (!c?.url || !c?.anonKey) throw new Error('config.js is missing Supabase credentials.');
    return c;
  }
  async function restSelect(pathAndQuery) {
    const c = cfg();
    const res = await fetch(`${c.url}${pathAndQuery}`, { headers: { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}` }, cache: 'no-store' });
    if (!res.ok) throw new Error(`Supabase read failed (${res.status}) ${await res.text().catch(() => '')}`.trim());
    return res.json();
  }
  async function loadCurrentMonthIfNeeded() {
    if (month) return;
    const rows = await restSelect(`/rest/v1/${TABLES.currentMonths}?select=channel_code,month_key&channel_code=eq.${encodeURIComponent(channel)}&limit=1`);
    month = rows?.[0]?.month_key || '';
    if (!month) throw new Error(`No current month found for ${channel}.`);
  }
  async function loadMonthRow() {
    const rows = await restSelect(`/rest/v1/${TABLES.importedMonths}?select=*&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}&limit=1`);
    if (!Array.isArray(rows) || !rows.length) throw new Error(`No imported month found for ${channel} ${month}.`);
    return rows[0];
  }
  function readLocalMarks(storageKey) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }
  async function loadSharedMarks() {
    try {
      const rows = await restSelect(`/rest/v1/${TABLES.sharedMarks}?select=entry_key,mark_json&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}&limit=3000`);
      const out = {};
      (rows || []).forEach(row => { if (row.entry_key && !row.mark_json?.legacy_unmapped) out[row.entry_key] = row.mark_json || {}; });
      return out;
    } catch (err) {
      console.warn('Shared marks read skipped.', err);
      return {};
    }
  }
  function allEntries(schedule) {
    const dayMap = {};
    (schedule.days || []).forEach(day => { dayMap[day.date] = day; });
    const out = [];
    (schedule.days || []).forEach(day => {
      (day.entries || []).forEach(entry => out.push({ ...entry, dayName: entry.dayName || entry.day || day.dayName || day.day || getWeekday(day.date), _id: entryId(entry) }));
    });
    out.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    return out;
  }
  function buildRows(entries, marks) {
    const usedMarkKeys = new Set();
    const rows = [];
    entries.forEach(entry => {
      const state = marks[entry._id] || marks[cellKey(entry.date, entry.time)] || {};
      if (marks[entry._id]) usedMarkKeys.add(entry._id);
      if (marks[cellKey(entry.date, entry.time)]) usedMarkKeys.add(cellKey(entry.date, entry.time));
      const tags = mergedTags(entry, state);
      const labels = activeLabels(tags);
      const norm = normalizeState(state);
      const note = norm.text || norm.rectNote?.text || '';
      const hasRect = !!norm.rectNote || !!note;
      if (labels.length || hasRect) {
        rows.push({ type: 'program', date: entry.date, time: entry.time, durationMin: entry.durationMin, title: entry.title, episode: entry.episode || '', code: entry.code || entry.nola || entry.nolaCode || '', tags: labels, note, sort: `${entry.date}${entry.time}` });
      }
    });

    Object.entries(marks).forEach(([key, value]) => {
      if (usedMarkKeys.has(key)) return;
      const parsed = parseCellKey(key);
      if (!parsed || parsed.channel !== channel || parsed.month !== month) return;
      const norm = normalizeState(value);
      const tags = activeLabels(CONFIG.tagOrder.reduce((acc, tag) => { acc[tag] = !!norm.tags?.[tag]; return acc; }, {}));
      const note = norm.text || norm.rectNote?.text || '';
      if (!tags.length && !note) return;
      rows.push({ type: 'blank', date: parsed.date, time: parsed.time, durationMin: norm.durationMin || 30, title: 'Blank schedule slot', episode: '', code: '', tags, note, sort: `${parsed.date}${parsed.time}` });
    });
    rows.sort((a, b) => a.sort.localeCompare(b.sort));
    return rows;
  }
  function render(row, rows, sourceInfo) {
    const title = `${CONFIG.label} ${monthLabel(month)} Month Rollup`;
    document.title = title;
    $('pageTitle').textContent = title;
    $('pageSub').textContent = `${rows.length} marked/tagged/note item${rows.length === 1 ? '' : 's'} • ${sourceInfo}`;
    $('scheduleLink').href = `${CONFIG.page}?month=${encodeURIComponent(month)}&v=1.5.23`;
    $('homeLink').href = 'index.html?v=1.5.23';
    $('versionBadge').textContent = `Month Rollup ${VERSION}`;
    const body = $('rollupBody');
    if (!rows.length) {
      body.innerHTML = `<div class="empty">No tagged programs or box notes found for ${esc(CONFIG.label)} ${esc(monthLabel(month))}.</div>`;
      return;
    }
    document.body.classList.toggle('many-items', rows.length > 34);
    body.innerHTML = `
      <table class="rollup-table">
        <thead><tr><th>Date</th><th>Time</th><th>Min</th><th>Program / slot</th><th>Tags</th><th>Box note</th></tr></thead>
        <tbody>${rows.map(item => `
          <tr class="${item.type === 'blank' ? 'blank-row' : ''}">
            <td>${esc(fmtDate(item.date))}</td>
            <td>${esc(fmtTime(item.time))}</td>
            <td>${esc(item.durationMin || '')}</td>
            <td><strong>${esc(item.title)}</strong>${item.episode ? `<div class="muted">${esc(item.episode)}</div>` : ''}${item.code ? `<div class="muted">${esc(item.code)}</div>` : ''}</td>
            <td>${item.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join(' ')}</td>
            <td>${esc(item.note || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }
  async function start() {
    try {
      $('status').textContent = 'Loading rollup…';
      await loadCurrentMonthIfNeeded();
      const row = await loadMonthRow();
      const schedule = row.schedule_json || {};
      const storageKey = row.storage_key || `${CONFIG.label.toLowerCase()}-${month}-marks`;
      const shared = await loadSharedMarks();
      const local = readLocalMarks(storageKey);
      const marks = { ...shared, ...local };
      const rows = buildRows(allEntries(schedule), marks);
      render(row, rows, Object.keys(shared).length ? 'shared Supabase marks + local overlay' : 'local/default marks');
      $('status').textContent = 'Ready.';
    } catch (err) {
      console.error(err);
      $('status').innerHTML = `<div class="error">${esc(err.message || err)}</div>`;
      $('rollupBody').innerHTML = '';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
