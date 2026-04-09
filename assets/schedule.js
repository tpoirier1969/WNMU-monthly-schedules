
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

  let supabase = null;
  let useSupabase = false;
  let marks = {};
  let activeEditKey = null;
  let pollTimer = null;
  let lastSyncTs = null;
  let panelOpen = false;
  let domIndex = null;
  let noteButtonsInjected = false;

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
  function notePeek(note){ return notePreview(note, 52); }
  function toDateIso(text){
    if (!text) return '';
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  }
  function fmtDayHeader(iso){
    if (!iso) return 'Outside month';
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' });
  }
  function escapeHtml(s){
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

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
  function showWarning(text) {
    if (!shareWarningEl) return;
    shareWarningEl.innerHTML = text;
    shareWarningEl.hidden = false;
  }
  function hideWarning(){ if (shareWarningEl) shareWarningEl.hidden = true; }

  function shouldSuppressSeasonStart(timeText) {
    const match = String(timeText || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!match) return false;
    let hour = parseInt(match[1], 10) % 12;
    const minute = parseInt(match[2], 10);
    if (match[3].toUpperCase() === 'PM') hour += 12;
    const total = hour * 60 + minute;
    return total >= 120 && total <= 420;
  }

  function suppressOvernightSeasonStarts() {
    document.querySelectorAll('.season-start[data-time]').forEach((el) => {
      if (shouldSuppressSeasonStart(el.getAttribute('data-time'))) {
        el.classList.remove('season-start');
        el.dataset.seasonSuppressed = '1';
      }
    });
  }

  function sanitizeOutsideMonth() {
    const targetMonth = /^\d{4}-\d{2}$/.test(SCHEDULE_SLUG) ? SCHEDULE_SLUG : '';
    if (!targetMonth) return;
    document.querySelectorAll('th.outside').forEach((th) => { th.innerHTML = ' '; });
    document.querySelectorAll('tr[data-date]').forEach((tr) => {
      const d = tr.getAttribute('data-date') || '';
      if (d && !d.startsWith(targetMonth)) tr.remove();
    });
    document.querySelectorAll('td.program[data-date]').forEach((td) => {
      const d = td.getAttribute('data-date') || '';
      if (d && !d.startsWith(targetMonth)) {
        const rowspan = td.getAttribute('rowspan') || '1';
        td.className = 'outside-empty';
        td.setAttribute('rowspan', rowspan);
        td.textContent = '';
        [...td.attributes].forEach((attr) => { if (attr.name.startsWith('data-')) td.removeAttribute(attr.name); });
      }
    });
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

  function metaForKey(key) {
    const el = document.querySelector(`td.program[data-key="${key}"], tr[data-key="${key}"]`);
    if (!el) return { title: 'Program note', when: '' };
    const title = el.getAttribute('data-title') || el.querySelector('.title')?.textContent?.trim() || 'Program note';
    const day = el.getAttribute('data-day') || '';
    const date = el.getAttribute('data-date') || '';
    const time = el.getAttribute('data-time') || '';
    return { title, when: [day, date, time].filter(Boolean).join(' | ') };
  }

  function openNoteModal(key) {
    activeEditKey = key;
    panelOpen = true;
    const meta = metaForKey(key);
    const rec = decodedRecord(recordFor(key));
    q('note-panel-title').textContent = `Edit: ${meta.title}`;
    q('note-panel-meta').textContent = meta.when;
    const area = q('note-textarea');
    if (area) {
      area.value = rec.noteText;
      area.setAttribute('spellcheck', 'false');
      area.setAttribute('autocomplete', 'off');
      area.setAttribute('autocorrect', 'off');
      area.setAttribute('autocapitalize', 'off');
    }
    setCategoryBoxes(rec.category);
    q('note-panel')?.classList.remove('hidden');
    window.setTimeout(() => area?.focus(), 20);
  }

  function closeNoteModal() {
    activeEditKey = null;
    panelOpen = false;
    q('note-panel')?.classList.add('hidden');
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

  function addRightTimeRail() {
    document.querySelectorAll('table.grid').forEach((table) => {
      const headRow = table.querySelector('thead tr');
      if (headRow && !headRow.querySelector('th.time-right')) {
        const th = document.createElement('th');
        th.className = 'time time-right';
        th.textContent = 'Time';
        headRow.appendChild(th);
      }
      table.querySelectorAll('tbody tr').forEach((tr) => {
        if (tr.querySelector('td.time-right-cell')) return;
        const firstTime = tr.querySelector('td.time');
        if (!firstTime) return;
        const td = document.createElement('td');
        td.className = 'time time-right-cell';
        td.textContent = firstTime.textContent;
        tr.appendChild(td);
      });
    });
  }

  function ensureDailySummaries() {
    document.querySelectorAll('section.week').forEach((section) => {
      let wrap = section.querySelector('.week-summaries');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'week-summaries';
        const heads = section.querySelectorAll('table.grid thead th:not(.time):not(.time-right)');
        heads.forEach((th) => {
          const dateText = th.querySelector('.date-line')?.textContent?.trim() || '';
          const iso = toDateIso(dateText);
          const card = document.createElement('div');
          card.className = 'day-summary' + (!iso ? ' outside-day' : '');
          card.dataset.date = iso;
          card.innerHTML = `<h3>${fmtDayHeader(iso)}</h3><div class="sum-body"><div class="sum-empty">Nothing checked</div></div>`;
          wrap.appendChild(card);
        });
        const anchor = section.querySelector('.controls.export-controls.bottom-export');
        if (anchor) section.insertBefore(wrap, anchor); else section.appendChild(wrap);
      }
    });
  }

  function renderDailySummaries() {
    document.querySelectorAll('.week-summaries .day-summary').forEach((card) => {
      const iso = card.dataset.date || '';
      const body = card.querySelector('.sum-body');
      if (!body) return;
      if (!iso) { body.innerHTML = '<div class="sum-empty">Outside month</div>'; return; }
      const items = [];
      document.querySelectorAll(`td.program[data-date="${iso}"][data-key], tr[data-date="${iso}"][data-key]`).forEach((el) => {
        const key = el.getAttribute('data-key');
        const rec = decodedRecord(recordFor(key));
        if (!rec.is_marked) return;
        const title = el.getAttribute('data-title') || el.querySelector('.title')?.textContent?.trim() || 'Program';
        const time = el.getAttribute('data-time') || '';
        items.push({ time, title, note: rec.noteText, category: rec.category });
      });
      items.sort((a,b)=>a.time.localeCompare(b.time));
      if (!items.length) {
        body.innerHTML = '<div class="sum-empty">Nothing checked</div>';
      } else {
        body.innerHTML = '<ul>' + items.map((item) => `<li class="${item.category ? 'sum-'+item.category : ''}"><span class="sum-time">${escapeHtml(item.time)}</span> ${escapeHtml(item.title)}${item.note ? `<span class="sum-note">${escapeHtml(item.note)}</span>` : '<span class="sum-note">No note</span>'}</li>`).join('') + '</ul>';
      }
    });
  }

  function ensureNoteButtons() {
    if (noteButtonsInjected) return;
    document.querySelectorAll('.title-row').forEach((row) => {
      if (row.querySelector('.note-btn')) return;
      const box = row.querySelector('.markbox');
      const key = box?.dataset.key || row.closest('[data-key]')?.getAttribute('data-key');
      if (!key) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'note-btn';
      btn.dataset.key = key;
      btn.textContent = 'Note';
      if (box) row.insertBefore(btn, box); else row.appendChild(btn);
    });
    noteButtonsInjected = true;
  }

  function buildDomIndex() {
    const index = new Map();
    const add = (key, bucket, el) => {
      if (!key || !el) return;
      if (!index.has(key)) index.set(key, { entries: [], boxes: [], buttons: [] });
      index.get(key)[bucket].push(el);
    };
    document.querySelectorAll('td.program[data-key], tr[data-key]').forEach((el) => add(el.getAttribute('data-key'), 'entries', el));
    document.querySelectorAll('input.markbox[data-key]').forEach((el) => add(el.dataset.key, 'boxes', el));
    document.querySelectorAll('.note-btn[data-key]').forEach((el) => add(el.dataset.key, 'buttons', el));
    domIndex = index;
  }

  function updateNoteIndicatorForEntry(el, note) {
    if (!el) return;
    let peek = el.querySelector(':scope > .note-peek');
    if (!peek && el.matches('tr')) peek = el.querySelector('.note-peek');
    if (!note) {
      if (peek) peek.hidden = true;
      return;
    }
    if (!peek) {
      peek = document.createElement('div');
      peek.className = el.matches('tr') ? 'note-peek note-peek-inline' : 'note-peek';
      if (el.matches('tr')) {
        const holder = el.querySelector('.title-cell') || el.querySelector('td:nth-child(4)') || el.lastElementChild;
        if (!holder) return;
        holder.appendChild(peek);
      } else {
        el.appendChild(peek);
      }
    }
    peek.hidden = false;
    peek.textContent = `Note: ${notePeek(note)}`;
  }

  function setCategoryClass(el, category) {
    if (!el) return;
    CATEGORY_CLASSES.forEach((cat) => el.classList.remove(`cat-${cat}`));
    if (category) el.classList.add(`cat-${category}`);
  }

  function renderEntryState(key) {
    const rec = decodedRecord(recordFor(key));
    const marked = rec.is_marked;
    const note = rec.noteText;
    const category = rec.category;
    const refs = domIndex?.get(key) || { entries: [], boxes: [], buttons: [] };
    refs.entries.forEach((el) => {
      el.classList.toggle('marked', marked);
      el.classList.toggle('has-note', !!note);
      setCategoryClass(el, category);
      updateNoteIndicatorForEntry(el, note);
    });
    refs.boxes.forEach((box) => {
      box.checked = marked;
    });
    refs.buttons.forEach((btn) => {
      btn.classList.toggle('has-note', !!note);
      btn.classList.toggle('is-marked', marked);
      setCategoryClass(btn, category);
      btn.textContent = note ? 'Note*' : 'Note';
    });
  }

  function applyMarks(keysToRender) {
    ensureNoteButtons();
    if (!domIndex) buildDomIndex();
    const keys = keysToRender ? Array.from(keysToRender) : Object.keys(marks || {});
    if (keys.length) keys.forEach((key) => renderEntryState(key));
    renderDailySummaries();
  }

  function loadLocalMarks() {
    try {
      const parsed = JSON.parse(storageGet(LOCAL_STORAGE_KEY, '{}') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }
  function saveLocalMarks() { storageSet(LOCAL_STORAGE_KEY, JSON.stringify(marks)); }

  async function persistRecord(key) {
    saveLocalMarks();
    if (!useSupabase || !supabase) {
      stampStatus('Local mode');
      return;
    }
    const rec = recordFor(key);
    try {
      if (!rec) {
        const { error } = await supabase.from(TABLE_NAME).delete()
          .eq('project_scope', PROJECT_SCOPE).eq('channel_slug', CHANNEL_SLUG).eq('schedule_slug', SCHEDULE_SLUG).eq('entry_key', key);
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

  async function loadSharedMarks() {
    if (!useSupabase || !supabase || panelOpen) return;
    try {
      const { data, error } = await supabase.from(TABLE_NAME)
        .select('entry_key,is_marked,note,updated_at,updated_by')
        .eq('project_scope', PROJECT_SCOPE).eq('channel_slug', CHANNEL_SLUG).eq('schedule_slug', SCHEDULE_SLUG);
      if (error) throw error;
      const next = {};
      const changedKeys = new Set();
      for (const row of (data || [])) {
        next[row.entry_key] = row;
        const prev = marks[row.entry_key];
        if (!prev || prev.is_marked !== row.is_marked || prev.note !== row.note) changedKeys.add(row.entry_key);
      }
      Object.keys(marks).forEach((key) => { if (!(key in next)) changedKeys.add(key); });
      marks = next;
      ensureAutoSeedMarks().forEach((key) => changedKeys.add(key));
      if (changedKeys.size) applyMarks(changedKeys);
      else renderDailySummaries();
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
      if (document.visibilityState === 'visible' && !panelOpen) loadSharedMarks();
    }, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !panelOpen) loadSharedMarks();
    });
  }

  function upsertRecord(key, patch) {
    const current = recordFor(key) || { entry_key: key, is_marked: false, note: '' };
    const next = { ...current, ...patch, entry_key: key, updated_by: getEditorName() || null, updated_at: new Date().toISOString() };
    marks[key] = next;
  }

  async function saveNoteFromModal() {
    if (!activeEditKey) return;
    const key = activeEditKey;
    const noteText = cleanNote(q('note-textarea')?.value || '');
    const category = getSelectedCategory();
    const currentMarked = !!recordFor(key)?.is_marked;
    upsertRecord(key, { note: encodeNotePayload(noteText, category), is_marked: currentMarked || !!category || !!noteText });
    renderEntryState(key);
    renderDailySummaries();
    await persistRecord(key);
    closeNoteModal();
  }

  async function clearNoteFromModal() {
    if (!activeEditKey) return;
    const key = activeEditKey;
    const currentMarked = !!recordFor(key)?.is_marked;
    upsertRecord(key, { note: '', is_marked: currentMarked });
    renderEntryState(key);
    renderDailySummaries();
    await persistRecord(key);
    closeNoteModal();
  }

  function wireDelegates() {
    document.addEventListener('click', (event) => {
      const noteBtn = event.target.closest('.note-btn');
      if (noteBtn?.dataset.key) {
        event.preventDefault();
        event.stopPropagation();
        openNoteModal(noteBtn.dataset.key);
      }
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

  function toggleSeasonOnly() {
    document.body.classList.toggle('season-only');
    const on = document.body.classList.contains('season-only');
    document.querySelectorAll('td.program:not(.season-start), table.companion tr:not(.season-start)[data-key]').forEach((el) => {
      el.style.opacity = on ? '0.45' : '';
    });
  }

  async function init() {
    try { sanitizeOutsideMonth(); } catch (e) { console.error('sanitizeOutsideMonth failed', e); }
    try { suppressOvernightSeasonStarts(); } catch (e) { console.error('suppressOvernightSeasonStarts failed', e); }
    try { marks = loadLocalMarks(); } catch (e) { console.error('loadLocalMarks failed', e); }
    try {
      if (editorEl) {
        editorEl.value = storageGet(LOCAL_EDITOR_KEY, '');
        editorEl.addEventListener('change', () => storageSet(LOCAL_EDITOR_KEY, editorEl.value || ''));
      }
    } catch (e) { console.error('editor init failed', e); }
    try {
      addRightTimeRail();
      ensureDailySummaries();
      ensureNoteButtons();
      buildDomIndex();
      ensureAutoSeedMarks();
      applyMarks();
    } catch (e) { console.error('initial render failed', e); }
    try { wireDelegates(); } catch (e) { console.error('wireDelegates failed', e); }
    q('note-save-btn')?.addEventListener('click', saveNoteFromModal);
    q('note-clear-btn')?.addEventListener('click', clearNoteFromModal);
    q('note-close-btn')?.addEventListener('click', closeNoteModal);
    refreshBtn?.addEventListener('click', () => loadSharedMarks());
    clearBtn?.addEventListener('click', clearMarks);
    seasonBtn?.addEventListener('click', toggleSeasonOnly);
    const connected = await connectSupabase();
    if (connected) {
      await loadSharedMarks();
      ensureAutoSeedMarks();
      applyMarks();
      startPolling();
    }
    window.openNoteModal = openNoteModal;
  }

  init().catch((e) => console.error('schedule init failed', e));
})();
