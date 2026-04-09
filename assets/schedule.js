(function(){
  const cfg = window.WNMU_SHAREBOARD_SUPABASE || {};
  const SUPABASE_URL = cfg.url || '';
  const SUPABASE_ANON_KEY = cfg.anonKey || '';
  const PROJECT_SCOPE = window.SCHEDULE_CONTEXT?.projectScope || 'wnmu_schedule_shareboard';
  const CHANNEL_SLUG = window.SCHEDULE_CONTEXT?.channelSlug || 'wnmu1hd';
  const SCHEDULE_SLUG = window.SCHEDULE_CONTEXT?.scheduleSlug || '2026-05';
  const TABLE_NAME = 'wnmu_sched_shared_marks';
  const LOCAL_STORAGE_KEY = `${PROJECT_SCOPE}_${CHANNEL_SLUG}_${SCHEDULE_SLUG}_marks_v7`;
  const LOCAL_EDITOR_KEY = `${PROJECT_SCOPE}_${CHANNEL_SLUG}_${SCHEDULE_SLUG}_editor_v7`;
  const NOTE_JSON_PREFIX = '__WNMU_NOTE__';
  const CATEGORY_CLASSES = ['fundraiser','local','newseries','oneoff','highlight'];
  const SLOT_COUNT = 48;

  let supabase = null;
  let useSupabase = false;
  let marks = {};
  let activeEditKey = null;
  let activeHost = null;
  let pollTimer = null;
  let lastSyncTs = null;
  let editorOpen = false;
  let domIndex = null;
  let editorHome = null;

  const statusEl = document.getElementById('sync-status');
  const editorEl = document.getElementById('editor-name');
  const refreshBtn = document.getElementById('refresh-marks');
  const clearBtn = document.getElementById('clear-marks');
  const seasonBtn = document.getElementById('toggle-season-only');
  const shareWarningEl = document.getElementById('share-warning');

  function q(id){ return document.getElementById(id); }
  function storageGet(key, fallback='') { try { const v = window.localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function storageSet(key, value) { try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; } }
  function cleanNote(note){ return String(note || '').replace(/\r\n/g,'\n').trim(); }
  function getEditorName(){ return (editorEl?.value || '').trim(); }
  function notePreview(note, n=80){ const t = cleanNote(note); return t.length > n ? `${t.slice(0,n-3)}...` : t; }
  function notePeek(note){ return notePreview(note, 64); }
  function escapeHtml(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function dateOnly(d){ return d.toISOString().slice(0,10); }
  function addDays(iso, days){ const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days); return dateOnly(d); }
  function monthSlug(iso){ return (iso || '').slice(0,7); }
  function weekdayLabel(iso){ return new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday:'long' }); }
  function headerDateLabel(iso){ return new Date(`${iso}T12:00:00`).toLocaleDateString([], { month:'long', day:'numeric', year:'numeric' }); }
  function fmtDayHeader(iso){ return new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }); }
  function weekStartSunday(iso){ const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - d.getDay()); return dateOnly(d); }
  function minutesFromDuration(text){ const m = String(text || '').match(/(\d+)\s*m/i); return m ? parseInt(m[1], 10) : 30; }
  function slotLabel(slot){
    const total = slot * 30;
    let hour = Math.floor(total / 60);
    const minute = total % 60;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    let display = hour % 12;
    if (display === 0) display = 12;
    return `${display}:${String(minute).padStart(2,'0')} ${suffix}`;
  }
  function slotIndex(label){
    const match = String(label || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!match) return -1;
    let hour = parseInt(match[1], 10) % 12;
    const minute = parseInt(match[2], 10);
    if (match[3].toUpperCase() === 'PM') hour += 12;
    return Math.floor((hour * 60 + minute) / 30);
  }
  function bandClass(slot){
    const hour = (slot * 30) / 60;
    if (hour < 7) return 'overnight';
    if (hour < 14) return 'daytime';
    if (hour < 19) return 'afternoon';
    return 'primetime';
  }
  function holeKey(iso, timeLabel){ return `hole__${iso}__${timeLabel.replace(/[^0-9APM]/gi,'').toUpperCase()}`; }

  function parseNotePayload(raw) {
    const text = String(raw ?? '');
    if (text.startsWith(NOTE_JSON_PREFIX)) {
      try {
        const obj = JSON.parse(text.slice(NOTE_JSON_PREFIX.length));
        return {
          text: cleanNote(obj.text || ''),
          category: CATEGORY_CLASSES.includes(obj.category) ? obj.category : ''
        };
      } catch (e) {}
    }
    return { text: cleanNote(text), category: '' };
  }

  function encodeNotePayload(text, category) {
    const clean = cleanNote(text);
    const cat = CATEGORY_CLASSES.includes(category) ? category : '';
    if (!clean && !cat) return '';
    return NOTE_JSON_PREFIX + JSON.stringify({ text: clean, category: cat });
  }

  function decodedRecord(rec) {
    if (!rec) return { is_marked: false, noteText: '', category: '' };
    const payload = parseNotePayload(rec.note);
    return { is_marked: !!rec.is_marked, noteText: payload.text, category: payload.category };
  }

  function recordFor(key){ return key ? marks[key] || null : null; }

  function setStatus(mode, text) {
    if (!statusEl) return;
    statusEl.className = `sync-status ${mode}`;
    statusEl.textContent = text;
  }
  function stampStatus(prefix) {
    const stamp = lastSyncTs ? ` · ${new Date(lastSyncTs).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}` : '';
    setStatus(useSupabase ? 'live' : 'local', `${prefix}${stamp}`);
  }
  function showWarning(text) { if (shareWarningEl) { shareWarningEl.innerHTML = text; shareWarningEl.hidden = false; } }
  function hideWarning(){ if (shareWarningEl) shareWarningEl.hidden = true; }

  function shouldSuppressSeasonStart(timeText) {
    const slot = slotIndex(timeText);
    return slot >= 4 && slot <= 14; // 2:00 AM through 7:00 AM
  }

  function setCategoryBoxes(selectedCategory) {
    document.querySelectorAll('.catbox[data-category]').forEach((box) => {
      box.checked = box.dataset.category === selectedCategory;
    });
  }

  function getSelectedCategory() {
    const chosen = document.querySelector('.catbox[data-category]:checked');
    return chosen?.dataset.category || '';
  }

  function ensureEditorHome() {
    if (editorHome) return editorHome;
    editorHome = document.createElement('div');
    editorHome.id = 'note-editor-home';
    editorHome.hidden = true;
    document.body.appendChild(editorHome);
    return editorHome;
  }

  function createCellHtml(rec) {
    const categoryClass = '';
    const episodeHtml = rec.episode ? `<div class="episode">${escapeHtml(rec.episode)}</div>` : '';
    return `<td class="program ${rec.band}${rec.isHole ? ' hole' : ''}${rec.seasonStart ? ' season-start' : ''}" rowspan="${rec.rowspan}" data-date="${rec.date}" data-day="${escapeHtml(rec.day)}" data-duration="${rec.duration}m" data-episode="${escapeHtml(rec.episode || '')}" data-key="${escapeHtml(rec.key)}" data-time="${escapeHtml(rec.time)}" data-title="${escapeHtml(rec.title)}" data-kind="${rec.isHole ? 'hole' : 'program'}"><div class="title-row"><button class="note-btn${categoryClass}" data-key="${escapeHtml(rec.key)}" type="button">Note</button><span class="title">${escapeHtml(rec.title)}</span><input aria-label="Highlight ${escapeHtml(rec.title)}" class="markbox" data-key="${escapeHtml(rec.key)}" type="checkbox"/></div>${episodeHtml}<div class="duration">${rec.duration}m</div><div class="note-peek" hidden></div></td>`;
  }

  function captureWeekRecords(section) {
    const table = section.querySelector('table.grid');
    if (!table) return null;
    const rawCells = [...table.querySelectorAll('td[data-key]')];
    if (!rawCells.length) return null;
    const records = rawCells.map((cell) => {
      const duration = Math.max(30, minutesFromDuration(cell.dataset.duration || '') || (parseInt(cell.getAttribute('rowspan') || '1', 10) * 30));
      const slot = slotIndex(cell.dataset.time || '');
      return {
        key: cell.dataset.key,
        date: cell.dataset.date,
        day: cell.dataset.day || weekdayLabel(cell.dataset.date || ''),
        time: cell.dataset.time,
        slot,
        duration,
        rowspan: Math.max(1, Math.round(duration / 30)),
        title: cell.dataset.title || cell.querySelector('.title')?.textContent?.trim() || 'Program',
        episode: cell.dataset.episode || '',
        isHole: cell.classList.contains('hole') || (cell.dataset.kind === 'hole') || /schedule hole/i.test(cell.dataset.title || ''),
        band: ['overnight','daytime','afternoon','primetime'].find((c) => cell.classList.contains(c)) || bandClass(slot),
        seasonStart: cell.classList.contains('season-start') && !shouldSuppressSeasonStart(cell.dataset.time || ''),
      };
    }).filter((rec) => rec.date && rec.slot >= 0);
    if (!records.length) return null;
    const dates = [...new Set(records.map((r) => r.date))].sort();
    const weekStart = weekStartSunday(dates[0]);
    return { table, records, weekStart };
  }

  function normalizeWeekTables() {
    document.querySelectorAll('.week').forEach((section, idx) => {
      const data = captureWeekRecords(section);
      if (!data) return;
      const { table, records, weekStart } = data;
      const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      const slotMaps = Object.fromEntries(weekDates.map((iso) => [iso, new Array(SLOT_COUNT).fill(null)]));
      records.forEach((rec) => {
        const span = Math.max(1, rec.rowspan);
        for (let step = 0; step < span && rec.slot + step < SLOT_COUNT; step += 1) {
          slotMaps[rec.date][rec.slot + step] = step === 0 ? rec : { continuation: true, key: rec.key };
        }
      });
      const targetMonth = SCHEDULE_SLUG;
      let html = '<thead><tr><th class="time">Time</th>';
      weekDates.forEach((iso) => {
        if (monthSlug(iso) !== targetMonth) html += '<th class="outside-month-head"></th>';
        else html += `<th>${escapeHtml(weekdayLabel(iso))}<br/><span class="date-line">${escapeHtml(headerDateLabel(iso))}</span></th>`;
      });
      html += '<th class="time-right">Time</th></tr></thead><tbody>';
      const outsideRendered = new Set();
      for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
        html += `<tr><td class="time">${slotLabel(slot)}</td>`;
        weekDates.forEach((iso) => {
          if (monthSlug(iso) !== targetMonth) {
            if (!outsideRendered.has(iso)) {
              html += '<td class="outside-empty" rowspan="48"></td>';
              outsideRendered.add(iso);
            }
            return;
          }
          const item = slotMaps[iso][slot];
          if (item && item.continuation) return;
          if (item) {
            html += createCellHtml(item);
            return;
          }
          const hole = {
            key: holeKey(iso, slotLabel(slot)),
            date: iso,
            day: weekdayLabel(iso),
            time: slotLabel(slot),
            slot,
            duration: 30,
            rowspan: 1,
            title: 'SCHEDULE HOLE',
            episode: '',
            isHole: true,
            band: bandClass(slot),
            seasonStart: false,
          };
          html += createCellHtml(hole);
        });
        html += `<td class="time time-right-cell">${slotLabel(slot)}</td></tr>`;
      }
      html += '</tbody><tfoot><tr class="summary-row"><td class="time summary-spacer"></td>';
      weekDates.forEach((iso) => {
        if (monthSlug(iso) !== targetMonth) html += '<td class="summary-cell outside-summary"></td>';
        else html += `<td class="summary-cell" data-summary-date="${iso}"><div class="sum-empty">Nothing checked</div></td>`;
      });
      html += '<td class="time summary-spacer"></td></tr></tfoot>';
      table.innerHTML = html;
      section.querySelectorAll('.week-summaries').forEach((el) => el.remove());
      section.dataset.weekStart = weekStart;
      const h2 = section.querySelector('h2');
      if (h2) h2.textContent = `Week ${idx + 1}`;
    });
  }

  function buildDomIndex() {
    const index = new Map();
    const add = (key, bucket, el) => {
      if (!key || !el) return;
      if (!index.has(key)) index.set(key, { entries: [], boxes: [], buttons: [] });
      index.get(key)[bucket].push(el);
    };
    document.querySelectorAll('td[data-key], tr[data-key]').forEach((el) => add(el.getAttribute('data-key'), 'entries', el));
    document.querySelectorAll('input.markbox[data-key]').forEach((el) => add(el.dataset.key, 'boxes', el));
    document.querySelectorAll('.note-btn[data-key]').forEach((el) => add(el.dataset.key, 'buttons', el));
    domIndex = index;
  }

  function setCategoryClass(el, category) {
    if (!el) return;
    CATEGORY_CLASSES.forEach((cat) => el.classList.remove(`cat-${cat}`));
    if (category) el.classList.add(`cat-${category}`);
  }

  function updateNoteIndicatorForEntry(el, note) {
    if (!el) return;
    let peek = el.querySelector(':scope > .note-peek');
    if (!peek) peek = el.querySelector('.note-peek');
    if (!note) {
      if (peek) peek.hidden = true;
      return;
    }
    if (!peek) {
      peek = document.createElement('div');
      peek.className = 'note-peek';
      el.appendChild(peek);
    }
    peek.hidden = false;
    peek.textContent = `Note: ${notePeek(note)}`;
  }

  function renderEntryState(key) {
    const rec = decodedRecord(recordFor(key));
    const refs = domIndex?.get(key) || { entries: [], boxes: [], buttons: [] };
    refs.entries.forEach((el) => {
      el.classList.toggle('marked', rec.is_marked);
      el.classList.toggle('has-note', !!rec.noteText);
      setCategoryClass(el, rec.category);
      updateNoteIndicatorForEntry(el, rec.noteText);
    });
    refs.boxes.forEach((box) => { box.checked = rec.is_marked; });
    refs.buttons.forEach((btn) => {
      btn.classList.toggle('has-note', !!rec.noteText);
      btn.classList.toggle('is-marked', rec.is_marked);
      setCategoryClass(btn, rec.category);
      btn.textContent = rec.noteText ? 'Note*' : 'Note';
    });
  }

  function renderDailySummaries() {
    document.querySelectorAll('.summary-cell[data-summary-date]').forEach((cell) => {
      const iso = cell.dataset.summaryDate;
      const items = [];
      document.querySelectorAll(`td[data-date="${iso}"][data-key]`).forEach((el) => {
        const key = el.dataset.key;
        const rec = decodedRecord(recordFor(key));
        if (!rec.is_marked) return;
        items.push({
          time: el.dataset.time || '',
          title: el.dataset.title || 'Program',
          note: rec.noteText,
          category: rec.category,
        });
      });
      items.sort((a, b) => slotIndex(a.time) - slotIndex(b.time));
      if (!items.length) {
        cell.innerHTML = '<div class="sum-empty">Nothing checked</div>';
        return;
      }
      cell.innerHTML = '<ul>' + items.map((item) => `<li class="${item.category ? 'sum-' + item.category : ''}"><span class="sum-time">${escapeHtml(item.time)}</span><span class="sum-title">${escapeHtml(item.title)}</span><span class="sum-note">${escapeHtml(item.note || '')}</span></li>`).join('') + '</ul>';
    });
  }

  function applyMarks(keysToRender) {
    if (!domIndex) buildDomIndex();
    const keys = keysToRender ? Array.from(keysToRender) : Array.from(domIndex.keys());
    keys.forEach((key) => renderEntryState(key));
    renderDailySummaries();
  }

  function loadLocalMarks() {
    try {
      const parsed = JSON.parse(storageGet(LOCAL_STORAGE_KEY, '{}') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }
  function saveLocalMarks() { storageSet(LOCAL_STORAGE_KEY, JSON.stringify(marks)); }

  function upsertRecord(key, patch) {
    const current = recordFor(key) || { entry_key: key, is_marked: false, note: '' };
    marks[key] = { ...current, ...patch, entry_key: key, updated_by: getEditorName() || null, updated_at: new Date().toISOString() };
  }

  async function persistRecord(key) {
    saveLocalMarks();
    if (!useSupabase || !supabase) { stampStatus('Local mode'); return; }
    const rec = recordFor(key);
    try {
      if (!rec) {
        const { error } = await supabase.from(TABLE_NAME).delete().eq('project_scope', PROJECT_SCOPE).eq('channel_slug', CHANNEL_SLUG).eq('schedule_slug', SCHEDULE_SLUG).eq('entry_key', key);
        if (error) throw error;
      } else {
        const payload = {
          project_scope: PROJECT_SCOPE,
          channel_slug: CHANNEL_SLUG,
          schedule_slug: SCHEDULE_SLUG,
          entry_key: key,
          is_marked: !!rec.is_marked,
          note: rec.note || null,
          updated_by: getEditorName() || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from(TABLE_NAME).upsert(payload, { onConflict: 'project_scope,channel_slug,schedule_slug,entry_key' });
        if (error) throw error;
      }
      lastSyncTs = new Date().toISOString();
      stampStatus('Shared live');
    } catch (error) {
      console.error('persistRecord failed', error);
      setStatus('error', 'Shared save failed');
    }
  }

  function ensureAutoSeedMarks() {
    const seeded = [];
    document.querySelectorAll('.season-start[data-key]').forEach((el) => {
      const key = el.getAttribute('data-key');
      if (!key || marks[key]) return;
      const timeText = el.getAttribute('data-time') || '';
      if (shouldSuppressSeasonStart(timeText)) return;
      marks[key] = { entry_key: key, is_marked: true, note: encodeNotePayload('', 'newseries'), updated_by: null, updated_at: null, auto_seeded: true };
      seeded.push(key);
    });
    if (seeded.length) saveLocalMarks();
    return seeded;
  }

  async function loadSharedMarks() {
    if (!useSupabase || !supabase || editorOpen) return;
    try {
      const { data, error } = await supabase.from(TABLE_NAME)
        .select('entry_key,is_marked,note,updated_at,updated_by')
        .eq('project_scope', PROJECT_SCOPE).eq('channel_slug', CHANNEL_SLUG).eq('schedule_slug', SCHEDULE_SLUG);
      if (error) throw error;
      const next = {};
      const changed = new Set();
      for (const row of (data || [])) {
        next[row.entry_key] = row;
        const prev = marks[row.entry_key];
        if (!prev || prev.is_marked !== row.is_marked || prev.note !== row.note) changed.add(row.entry_key);
      }
      Object.keys(marks).forEach((key) => { if (!(key in next)) changed.add(key); });
      marks = next;
      ensureAutoSeedMarks().forEach((key) => changed.add(key));
      applyMarks(changed.size ? changed : undefined);
      lastSyncTs = new Date().toISOString();
      stampStatus('Shared live');
    } catch (error) {
      console.error('loadSharedMarks failed', error);
      setStatus('error', 'Shared load failed');
    }
  }

  async function connectSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
      useSupabase = false;
      showWarning('<strong>Not shared yet.</strong> This board is running in local-only mode because Supabase credentials are blank or missing.');
      setStatus('unconfigured', 'NOT SHARED');
      return false;
    }
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      useSupabase = true;
      hideWarning();
      setStatus('polling', 'Connecting…');
      return true;
    } catch (error) {
      console.error('connectSupabase failed', error);
      useSupabase = false;
      setStatus('error', 'Shared init failed');
      return false;
    }
  }

  function startPolling() {
    if (!useSupabase) return;
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !editorOpen) loadSharedMarks();
    }, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !editorOpen) loadSharedMarks();
    });
  }

  function closeNoteEditor() {
    const panel = q('note-panel');
    if (!panel) return;
    panel.classList.add('hidden');
    ensureEditorHome().appendChild(panel);
    if (activeHost) activeHost.classList.remove('editor-open');
    activeHost = null;
    activeEditKey = null;
    editorOpen = false;
  }

  function openNoteEditor(key) {
    const panel = q('note-panel');
    if (!panel) return;
    const host = (domIndex?.get(key)?.entries || [])[0];
    if (!host) return;
    if (activeHost && activeHost !== host) activeHost.classList.remove('editor-open');
    activeEditKey = key;
    activeHost = host;
    editorOpen = true;
    host.classList.add('editor-open');
    host.appendChild(panel);
    panel.classList.remove('hidden');
    q('note-panel-title').textContent = host.dataset.title || 'Edit note';
    q('note-panel-meta').textContent = `${host.dataset.day || ''} | ${host.dataset.date || ''} | ${host.dataset.time || ''}`;
    const rec = decodedRecord(recordFor(key));
    const area = q('note-textarea');
    if (area) {
      area.value = rec.noteText;
      area.setAttribute('spellcheck', 'false');
      area.setAttribute('autocomplete', 'off');
      area.setAttribute('autocorrect', 'off');
      area.setAttribute('autocapitalize', 'off');
      window.setTimeout(() => area.focus(), 20);
    }
    setCategoryBoxes(rec.category);
  }

  async function saveNoteFromEditor() {
    if (!activeEditKey) return;
    const key = activeEditKey;
    const noteText = cleanNote(q('note-textarea')?.value || '');
    const category = getSelectedCategory();
    const currentMarked = !!recordFor(key)?.is_marked;
    upsertRecord(key, { note: encodeNotePayload(noteText, category), is_marked: currentMarked || !!noteText || !!category });
    renderEntryState(key);
    renderDailySummaries();
    await persistRecord(key);
    closeNoteEditor();
  }

  async function clearNoteFromEditor() {
    if (!activeEditKey) return;
    const key = activeEditKey;
    const currentMarked = !!recordFor(key)?.is_marked;
    upsertRecord(key, { note: '', is_marked: currentMarked });
    renderEntryState(key);
    renderDailySummaries();
    await persistRecord(key);
    closeNoteEditor();
  }

  function toggleSeasonOnly() {
    document.body.classList.toggle('season-only');
    const on = document.body.classList.contains('season-only');
    document.querySelectorAll('td[data-key]:not(.season-start)').forEach((el) => {
      el.style.opacity = on ? '0.45' : '';
    });
  }

  function clearMarks() {
    const next = {};
    Object.entries(marks).forEach(([key, rec]) => {
      const payload = parseNotePayload(rec.note);
      if (payload.text || payload.category) next[key] = { ...rec, is_marked: false };
    });
    marks = next;
    applyMarks();
    saveLocalMarks();
    if (useSupabase) Object.keys(next).forEach((key) => { persistRecord(key); });
  }

  function wireDelegates() {
    document.addEventListener('click', (event) => {
      const noteBtn = event.target.closest('.note-btn');
      if (noteBtn?.dataset.key) {
        event.preventDefault();
        event.stopPropagation();
        if (activeEditKey === noteBtn.dataset.key && !q('note-panel')?.classList.contains('hidden')) closeNoteEditor();
        else openNoteEditor(noteBtn.dataset.key);
        return;
      }
      if (event.target.closest('#note-save-btn')) { event.preventDefault(); saveNoteFromEditor(); return; }
      if (event.target.closest('#note-clear-btn')) { event.preventDefault(); clearNoteFromEditor(); return; }
      if (event.target.closest('#note-close-btn')) { event.preventDefault(); closeNoteEditor(); return; }
    });

    document.addEventListener('change', async (event) => {
      const box = event.target.closest('input.markbox');
      if (box) {
        const key = box.dataset.key;
        if (!key) return;
        upsertRecord(key, { is_marked: box.checked });
        renderEntryState(key);
        renderDailySummaries();
        await persistRecord(key);
        return;
      }
      const catbox = event.target.closest('.catbox[data-category]');
      if (catbox && catbox.checked) {
        document.querySelectorAll('.catbox[data-category]').forEach((other) => {
          if (other !== catbox) other.checked = false;
        });
      }
    });
  }

  async function init() {
    ensureEditorHome();
    normalizeWeekTables();
    marks = loadLocalMarks();
    if (editorEl) {
      editorEl.value = storageGet(LOCAL_EDITOR_KEY, '');
      editorEl.addEventListener('change', () => storageSet(LOCAL_EDITOR_KEY, editorEl.value || ''));
    }
    buildDomIndex();
    ensureAutoSeedMarks();
    applyMarks();
    wireDelegates();
    refreshBtn?.addEventListener('click', () => loadSharedMarks());
    clearBtn?.addEventListener('click', clearMarks);
    seasonBtn?.addEventListener('click', toggleSeasonOnly);
    const connected = await connectSupabase();
    if (connected) {
      await loadSharedMarks();
      applyMarks();
      startPolling();
    }
    window.openNoteEditor = openNoteEditor;
  }

  init().catch((e) => console.error('schedule init failed', e));
})();
