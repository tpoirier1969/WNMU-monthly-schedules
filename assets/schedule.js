
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
  const HOVER_DELAY_MS = 240;

  let supabase = null;
  let useSupabase = false;
  let marks = {};
  let activeEditKey = null;
  let hoverTimer = null;
  let hoverAnchor = null;
  let hoverKey = null;
  let pollTimer = null;
  let lastSyncTs = null;
  let modalOpen = false;
  let scrollRaf = 0;

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
  function recordFor(key){ return key ? marks[key] || null : null; }
  function notePreview(note, n=80){ const t = cleanNote(note); return t.length > n ? `${t.slice(0,n-3)}...` : t; }
  function notePeek(note){ return notePreview(note, 46); }

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
    return total >= 120 && total <= 390;
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

  function ensureModal() {
    if (q('note-modal-shell')) return;
    const shell = document.createElement('div');
    shell.innerHTML = `
      <div class="note-modal-shell hidden" id="note-modal-shell">
        <div class="note-modal-backdrop" data-note-close="1"></div>
        <div class="note-modal" role="dialog" aria-modal="true" aria-labelledby="note-modal-title">
          <div class="note-modal-head">
            <div>
              <h3 id="note-modal-title">Program note</h3>
              <div class="note-modal-meta" id="note-modal-meta"></div>
            </div>
            <button type="button" class="note-close" data-note-close="1">Close</button>
          </div>
          <textarea id="note-textarea" rows="6" placeholder="Type a note for this airing..."></textarea>
          <div class="note-modal-actions">
            <button type="button" id="note-save-btn">Save note</button>
            <button type="button" id="note-clear-btn">Remove note</button>
            <button type="button" id="note-cancel-btn" data-note-close="1">Done</button>
          </div>
        </div>
      </div>
      <div class="note-tooltip hidden" id="note-tooltip"></div>`;
    document.body.appendChild(shell);
    q('note-modal-shell').addEventListener('click', (event) => {
      if (event.target.closest('[data-note-close="1"]')) closeNoteModal();
    });
    q('note-save-btn')?.addEventListener('click', saveNoteFromModal);
    q('note-clear-btn')?.addEventListener('click', clearNoteFromModal);
    q('note-cancel-btn')?.addEventListener('click', closeNoteModal);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideTooltip();
        if (!q('note-modal-shell')?.classList.contains('hidden')) closeNoteModal();
      }
    });
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
    ensureModal();
    hideTooltip();
    activeEditKey = key;
    modalOpen = true;
    const meta = metaForKey(key);
    const rec = recordFor(key) || {};
    q('note-modal-title').textContent = `Note: ${meta.title}`;
    q('note-modal-meta').textContent = meta.when;
    q('note-textarea').value = cleanNote(rec.note);
    q('note-modal-shell').classList.remove('hidden');
    document.body.classList.add('modal-open');
    window.setTimeout(() => q('note-textarea')?.focus(), 20);
  }

  function closeNoteModal() {
    activeEditKey = null;
    modalOpen = false;
    q('note-modal-shell')?.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  function ensureNoteButtons() {
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
  }

  function updateNoteIndicatorForEntry(el, note) {
    if (!el) return;
    let peek = el.querySelector(':scope > .note-peek');
    if (!peek && el.matches('tr')) peek = el.querySelector('.note-peek');
    if (!note) {
      peek?.remove();
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
    peek.textContent = `Note: ${notePeek(note)}`;
  }

  function renderEntryState(key) {
    const rec = recordFor(key) || {};
    const marked = !!rec.is_marked;
    const note = cleanNote(rec.note);
    document.querySelectorAll(`td.program[data-key="${key}"], tr[data-key="${key}"]`).forEach((el) => {
      el.classList.toggle('marked', marked);
      el.classList.toggle('has-note', !!note);
      if (note) el.dataset.note = note;
      else delete el.dataset.note;
      el.removeAttribute('title');
      updateNoteIndicatorForEntry(el, note);
    });
    document.querySelectorAll(`input.markbox[data-key="${key}"]`).forEach((box) => {
      box.checked = marked;
    });
    document.querySelectorAll(`.note-btn[data-key="${key}"]`).forEach((btn) => {
      btn.classList.toggle('has-note', !!note);
      btn.classList.toggle('is-marked', marked);
      btn.textContent = note ? 'Note*' : 'Note';
      btn.title = note ? `Edit note: ${notePreview(note, 60)}` : 'Add or edit note';
    });
  }

  function applyMarks() {
    ensureNoteButtons();
    const keys = new Set();
    document.querySelectorAll('td.program[data-key], tr[data-key]').forEach((el) => {
      const key = el.getAttribute('data-key');
      if (key) keys.add(key);
    });
    keys.forEach((key) => renderEntryState(key));
    document.querySelectorAll('input.markbox[data-key]').forEach((box) => {
      if (!(box.dataset.key in marks)) box.checked = false;
    });
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
          note: cleanNote(rec.note) || null,
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
    if (!useSupabase || !supabase) return;
    try {
      const { data, error } = await supabase.from(TABLE_NAME)
        .select('entry_key,is_marked,note,updated_at,updated_by')
        .eq('project_scope', PROJECT_SCOPE).eq('channel_slug', CHANNEL_SLUG).eq('schedule_slug', SCHEDULE_SLUG);
      if (error) throw error;
      const next = {};
      for (const row of (data || [])) next[row.entry_key] = row;
      marks = next;
      applyMarks();
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
      if (document.visibilityState === 'visible') loadSharedMarks();
    }, 5000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadSharedMarks();
    });
  }

  function upsertRecord(key, patch) {
    const current = recordFor(key) || { entry_key: key, is_marked: false, note: '' };
    const next = { ...current, ...patch, entry_key: key, updated_by: getEditorName() || null, updated_at: new Date().toISOString() };
    if (!next.is_marked && !cleanNote(next.note)) delete marks[key];
    else marks[key] = next;
  }

  async function saveNoteFromModal() {
    if (!activeEditKey) return;
    const key = activeEditKey;
    const note = cleanNote(q('note-textarea')?.value || '');
    const currentMarked = !!(recordFor(key)?.is_marked || document.querySelector(`input.markbox[data-key="${key}"]`)?.checked);
    upsertRecord(key, { note, is_marked: currentMarked });
    renderEntryState(key);
    await persistRecord(key);
    closeNoteModal();
  }

  async function clearNoteFromModal() {
    if (!activeEditKey) return;
    const key = activeEditKey;
    const currentMarked = !!recordFor(key)?.is_marked;
    upsertRecord(key, { note: '', is_marked: currentMarked });
    renderEntryState(key);
    await persistRecord(key);
    closeNoteModal();
  }

  function hideTooltip() {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverAnchor = null;
    hoverKey = null;
    q('note-tooltip')?.classList.add('hidden');
  }
  function placeTooltip(anchor) {
    const tt = q('note-tooltip');
    if (!tt || !anchor || modalOpen) return;
    const rect = anchor.getBoundingClientRect();
    const top = window.scrollY + rect.top - tt.offsetHeight - 10;
    const left = window.scrollX + Math.min(rect.left, window.innerWidth - tt.offsetWidth - 20);
    tt.style.top = `${Math.max(window.scrollY + 10, top)}px`;
    tt.style.left = `${Math.max(window.scrollX + 10, left)}px`;
  }
  function showTooltip(anchor) {
    if (modalOpen) return;
    const key = anchor?.getAttribute('data-key');
    const note = cleanNote(recordFor(key)?.note);
    const tt = q('note-tooltip');
    if (!key || !note || !tt) return;
    hoverAnchor = anchor;
    hoverKey = key;
    tt.textContent = note;
    tt.classList.remove('hidden');
    placeTooltip(anchor);
  }
  function queueTooltip(anchor) {
    if (modalOpen) return;
    const key = anchor?.getAttribute('data-key');
    if (!key || !cleanNote(recordFor(key)?.note)) return;
    if (hoverKey === key && !q('note-tooltip')?.classList.contains('hidden')) return;
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => showTooltip(anchor), HOVER_DELAY_MS);
  }

  function targetEntryElement(start) {
    return start?.closest?.('td.program[data-key], tr[data-key]') || null;
  }

  function wireDelegates() {
    document.addEventListener('click', (event) => {
      const noteBtn = event.target.closest('.note-btn');
      if (noteBtn?.dataset.key) {
        event.preventDefault();
        event.stopPropagation();
        openNoteModal(noteBtn.dataset.key);
        return;
      }
      const row = event.target.closest('.title-row');
      if (row && !event.target.closest('.markbox')) {
        const key = row.querySelector('.markbox')?.dataset.key || row.closest('[data-key]')?.getAttribute('data-key');
        if (key) {
          event.preventDefault();
          openNoteModal(key);
        }
      }
    });

    document.addEventListener('change', async (event) => {
      const box = event.target.closest('input.markbox');
      if (!box) return;
      const key = box.dataset.key;
      if (!key) return;
      if (box.checked) {
        upsertRecord(key, { is_marked: true });
        renderEntryState(key);
        openNoteModal(key);
        await persistRecord(key);
      } else {
        upsertRecord(key, { is_marked: false });
        renderEntryState(key);
        await persistRecord(key);
      }
    });

    document.addEventListener('mouseover', (event) => {
      if (modalOpen) return;
      const entry = targetEntryElement(event.target);
      if (!entry) return;
      const from = targetEntryElement(event.relatedTarget);
      if (from === entry) return;
      queueTooltip(entry);
    });
    document.addEventListener('mouseout', (event) => {
      const entry = targetEntryElement(event.target);
      if (!entry) return;
      const to = targetEntryElement(event.relatedTarget);
      if (to === entry) return;
      hideTooltip();
    });
    document.addEventListener('focusin', (event) => {
      if (modalOpen) return;
      const entry = targetEntryElement(event.target);
      if (entry) queueTooltip(entry);
    });
    document.addEventListener('focusout', (event) => {
      const entry = targetEntryElement(event.target);
      if (entry) hideTooltip();
    });
    window.addEventListener('scroll', () => {
      if (modalOpen || !hoverAnchor || q('note-tooltip')?.classList.contains('hidden')) return;
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        placeTooltip(hoverAnchor);
      });
    }, { passive:true });
  }

  function clearMarks() {
    const next = {};
    Object.entries(marks).forEach(([key, rec]) => {
      const note = cleanNote(rec.note);
      if (note) next[key] = { ...rec, is_marked: false };
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
    try { ensureModal(); } catch (e) { console.error('ensureModal failed', e); }
    try { marks = loadLocalMarks(); } catch (e) { console.error('loadLocalMarks failed', e); }
    try {
      if (editorEl) {
        editorEl.value = storageGet(LOCAL_EDITOR_KEY, '');
        editorEl.addEventListener('change', () => storageSet(LOCAL_EDITOR_KEY, editorEl.value || ''));
      }
    } catch (e) { console.error('editor init failed', e); }
    try { applyMarks(); } catch (e) { console.error('applyMarks failed', e); }
    try { wireDelegates(); } catch (e) { console.error('wireDelegates failed', e); }
    refreshBtn?.addEventListener('click', () => loadSharedMarks());
    clearBtn?.addEventListener('click', clearMarks);
    seasonBtn?.addEventListener('click', toggleSeasonOnly);
    const connected = await connectSupabase();
    if (connected) {
      await loadSharedMarks();
      startPolling();
    }
    window.openNoteModal = openNoteModal;
    window.clearMarks = clearMarks;
    window.toggleSeasonOnly = toggleSeasonOnly;
  }

  init().catch((e) => console.error('schedule init failed', e));
})();
