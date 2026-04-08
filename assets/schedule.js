const cfg = window.SHAREBOARD_CONFIG || {};
const SUPABASE_URL = cfg.supabaseUrl || '';
const SUPABASE_ANON_KEY = cfg.supabaseAnonKey || '';
const REQUIRE_SHARED = cfg.requireShared !== false;
const ENABLE_REALTIME = cfg.enableRealtime !== false;
const POLLING_MS = Number(cfg.pollingMs || 5000);

const PROJECT_SCOPE = window.SCHEDULE_CONTEXT?.projectScope || 'wnmu_schedule_shareboard';
const CHANNEL_SLUG = window.SCHEDULE_CONTEXT?.channelSlug || 'wnmu1hd';
const SCHEDULE_SLUG = window.SCHEDULE_CONTEXT?.scheduleSlug || '2026-05';
const TABLE_NAME = 'wnmu_sched_shared_marks';
const LOCAL_STORAGE_KEY = `${PROJECT_SCOPE}_${CHANNEL_SLUG}_${SCHEDULE_SLUG}_marks_v6`;
const LOCAL_EDITOR_KEY = `${PROJECT_SCOPE}_${CHANNEL_SLUG}_${SCHEDULE_SLUG}_editor_v6`;
const HOVER_DELAY_MS = 2000;

let supabase = null;
let useSupabase = false;
let marks = {};
let noteModal = null;
let noteTextarea = null;
let noteTitle = null;
let noteMeta = null;
let tooltipEl = null;
let hoverTimer = null;
let tooltipAnchor = null;
let activeEditKey = null;
let syncChannel = null;
let pollTimer = null;
let loadTimer = null;
let saveInFlight = 0;
let lastSyncTs = null;

const statusEl = document.getElementById('sync-status');
const editorEl = document.getElementById('editor-name');
const refreshBtn = document.getElementById('refresh-marks');
const shareWarningEl = document.getElementById('share-warning');

function setStatus(mode, text) {
  if (!statusEl) return;
  statusEl.className = `sync-status ${mode}`;
  statusEl.textContent = text;
}

function stampStatus(prefix) {
  const suffix = lastSyncTs ? ` · ${new Date(lastSyncTs).toLocaleTimeString([], {hour:'numeric', minute:'2-digit', second:'2-digit'})}` : '';
  setStatus(useSupabase ? 'live' : (REQUIRE_SHARED ? 'unconfigured' : 'local'), `${prefix}${suffix}`);
}

function showWarning(text) {
  if (!shareWarningEl) return;
  shareWarningEl.innerHTML = text;
  shareWarningEl.hidden = false;
}
function hideWarning() {
  if (!shareWarningEl) return;
  shareWarningEl.hidden = true;
}

function getEditorName() { return (editorEl?.value || '').trim(); }
function saveEditorName() { if (editorEl) localStorage.setItem(LOCAL_EDITOR_KEY, editorEl.value || ''); }

function loadLocalMarks() {
  try { return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}') || {}; }
  catch { return {}; }
}
function saveLocalMarks(data) { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data)); }
function recordFor(key) { return marks[key] || null; }
function cleanNote(note) { return (note || '').replace(/\r\n/g, '\n').trim(); }

function metaForKey(key) {
  const el = document.querySelector(`[data-key="${key}"]`);
  if (!el) return { title: 'Program note', when: '' };
  const title = el.getAttribute('data-title') || el.querySelector('.title')?.textContent?.trim() || 'Program note';
  const day = el.getAttribute('data-day') || '';
  const date = el.getAttribute('data-date') || '';
  const time = el.getAttribute('data-time') || '';
  return { title, when: [day, date, time].filter(Boolean).join(' | ') };
}

function hasNote(key) { return !!cleanNote(recordFor(key)?.note); }
function notePreview(note) {
  const clean = cleanNote(note);
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

function updateNoteButtons() {
  document.querySelectorAll('.note-btn').forEach((btn) => {
    const key = btn.dataset.key;
    const note = cleanNote(recordFor(key)?.note);
    const marked = !!recordFor(key)?.is_marked;
    btn.classList.toggle('has-note', !!note);
    btn.classList.toggle('is-marked', marked);
    btn.title = note ? `Edit note: ${notePreview(note)}` : 'Add or edit note';
    btn.textContent = note ? 'Note*' : 'Note';
  });
}

function applyMarks() {
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.getAttribute('data-key');
    const rec = recordFor(key);
    const marked = !!rec?.is_marked;
    const note = cleanNote(rec?.note);
    el.classList.toggle('marked', marked);
    el.classList.toggle('has-note', !!note);
    if (note) el.setAttribute('data-note', note); else el.removeAttribute('data-note');
  });
  document.querySelectorAll('input.markbox').forEach((box) => {
    const key = box.dataset.key;
    box.checked = !!recordFor(key)?.is_marked;
  });
  updateNoteButtons();
}

function buildNoteControls() {
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
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openNoteModal(key);
    });
    if (box) row.insertBefore(btn, box); else row.appendChild(btn);
  });
}

function buildModal() {
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
  noteModal = document.getElementById('note-modal-shell');
  noteTextarea = document.getElementById('note-textarea');
  noteTitle = document.getElementById('note-modal-title');
  noteMeta = document.getElementById('note-modal-meta');
  tooltipEl = document.getElementById('note-tooltip');

  noteModal.addEventListener('click', (event) => {
    if (event.target.closest('[data-note-close="1"]')) closeNoteModal();
  });
  document.getElementById('note-save-btn')?.addEventListener('click', saveNoteFromModal);
  document.getElementById('note-clear-btn')?.addEventListener('click', clearNoteFromModal);
  document.getElementById('note-cancel-btn')?.addEventListener('click', closeNoteModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideTooltip();
      if (noteModal && !noteModal.classList.contains('hidden')) closeNoteModal();
    }
  });
}

function openNoteModal(key) {
  activeEditKey = key;
  const meta = metaForKey(key);
  const rec = recordFor(key) || {};
  noteTitle.textContent = `Note: ${meta.title}`;
  noteMeta.textContent = meta.when;
  noteTextarea.value = cleanNote(rec.note);
  noteModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  window.setTimeout(() => noteTextarea.focus(), 20);
}

function closeNoteModal() {
  activeEditKey = null;
  noteModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

async function persistRecord(key) {
  const rec = recordFor(key);
  if (!useSupabase || !supabase) {
    saveLocalMarks(marks);
    stampStatus(REQUIRE_SHARED ? 'LOCAL ONLY' : 'Local mode');
    return;
  }
  saveInFlight += 1;
  setStatus('saving', 'Saving…');
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
    queueLoadSharedMarks(400);
  } catch (error) {
    console.error(error);
    setStatus('error', 'Supabase save failed');
  } finally {
    saveInFlight -= 1;
  }
}

async function saveNoteFromModal() {
  if (!activeEditKey) return;
  const key = activeEditKey;
  const note = cleanNote(noteTextarea.value);
  const current = recordFor(key) || { entry_key: key, is_marked: false };
  if (note || current.is_marked) {
    marks[key] = { ...current, entry_key: key, note, updated_by: getEditorName() || null, updated_at: new Date().toISOString() };
  } else {
    delete marks[key];
  }
  applyMarks();
  await persistRecord(key);
  closeNoteModal();
}

async function clearNoteFromModal() {
  if (!activeEditKey) return;
  const key = activeEditKey;
  const current = recordFor(key);
  if (!current) { closeNoteModal(); return; }
  current.note = '';
  current.updated_by = getEditorName() || null;
  current.updated_at = new Date().toISOString();
  if (!current.is_marked) delete marks[key]; else marks[key] = current;
  applyMarks();
  await persistRecord(key);
  closeNoteModal();
}

function hideTooltip() {
  window.clearTimeout(hoverTimer);
  hoverTimer = null;
  tooltipAnchor = null;
  tooltipEl?.classList.add('hidden');
}
function placeTooltip(anchor) {
  if (!tooltipEl || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const top = window.scrollY + rect.top - tooltipEl.offsetHeight - 10;
  const left = window.scrollX + Math.min(rect.left, window.innerWidth - tooltipEl.offsetWidth - 20);
  tooltipEl.style.top = `${Math.max(window.scrollY + 10, top)}px`;
  tooltipEl.style.left = `${Math.max(window.scrollX + 10, left)}px`;
}
function showTooltip(key, anchor) {
  const note = cleanNote(recordFor(key)?.note);
  if (!note || !tooltipEl) return;
  tooltipAnchor = anchor;
  tooltipEl.textContent = note;
  tooltipEl.classList.remove('hidden');
  placeTooltip(anchor);
}
function queueTooltip(anchor) {
  const key = anchor.getAttribute('data-key');
  if (!key || !hasNote(key)) return;
  window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => showTooltip(key, anchor), HOVER_DELAY_MS);
}
function wireTooltipTargets() {
  document.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('mouseenter', () => queueTooltip(el));
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('focusin', () => queueTooltip(el));
    el.addEventListener('focusout', hideTooltip);
  });
  window.addEventListener('scroll', () => {
    if (tooltipEl && tooltipAnchor && !tooltipEl.classList.contains('hidden')) placeTooltip(tooltipAnchor);
  }, { passive: true });
}

async function connectSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    useSupabase = false;
    if (REQUIRE_SHARED) {
      showWarning('<strong>Not shared yet.</strong> This board is running in local-only mode because Supabase credentials are blank or missing. Edit <code>assets/shareboard-config.js</code>, then refresh both browsers.');
      setStatus('unconfigured', 'NOT SHARED');
    } else {
      setStatus('local', 'Local mode');
    }
    return false;
  }
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    useSupabase = true;
    hideWarning();
    setStatus('polling', 'Connecting…');
    return true;
  } catch (error) {
    console.error(error);
    useSupabase = false;
    setStatus('error', 'Supabase init failed');
    return false;
  }
}

async function loadSharedMarks() {
  if (!useSupabase || !supabase) return;
  try {
    const { data, error } = await supabase.from(TABLE_NAME)
      .select('entry_key,is_marked,note,updated_at,updated_by,project_scope,channel_slug,schedule_slug')
      .eq('project_scope', PROJECT_SCOPE).eq('channel_slug', CHANNEL_SLUG).eq('schedule_slug', SCHEDULE_SLUG);
    if (error) throw error;
    const next = {};
    for (const row of data || []) next[row.entry_key] = row;
    marks = next;
    applyMarks();
    lastSyncTs = new Date().toISOString();
    stampStatus('Shared live');
  } catch (error) {
    console.error(error);
    setStatus('error', 'Supabase load failed');
  }
}

function queueLoadSharedMarks(delay = 150) {
  if (!useSupabase) return;
  window.clearTimeout(loadTimer);
  loadTimer = window.setTimeout(() => { loadSharedMarks(); }, delay);
}

function subscribeRealtime() {
  if (!useSupabase || !supabase || !ENABLE_REALTIME) return;
  try {
    syncChannel = supabase.channel(`shareboard:${PROJECT_SCOPE}:${CHANNEL_SLUG}:${SCHEDULE_SLUG}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME }, (payload) => {
        const row = payload.new || payload.old || {};
        if (row.project_scope !== PROJECT_SCOPE || row.channel_slug !== CHANNEL_SLUG || row.schedule_slug !== SCHEDULE_SLUG) return;
        queueLoadSharedMarks(120);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          lastSyncTs = new Date().toISOString();
          setStatus('live', 'Shared live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setStatus('polling', 'Shared via polling');
        }
      });
  } catch (error) {
    console.error(error);
    setStatus('polling', 'Shared via polling');
  }
}

function startPolling() {
  if (!useSupabase) return;
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && saveInFlight === 0) loadSharedMarks();
  }, Math.max(3000, POLLING_MS));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') queueLoadSharedMarks(50);
  });
}

function wireBoxes() {
  document.querySelectorAll('input.markbox').forEach((box) => {
    box.addEventListener('change', async () => {
      const key = box.dataset.key;
      const existing = recordFor(key) || { entry_key: key, note: '' };
      if (box.checked) {
        marks[key] = { ...existing, entry_key: key, is_marked: true, updated_by: getEditorName() || null, updated_at: new Date().toISOString() };
        applyMarks();
        await persistRecord(key);
        openNoteModal(key);
        return;
      }
      let note = cleanNote(existing.note);
      if (note) {
        const removeNote = window.confirm('Remove the saved note too? OK removes the note. Cancel keeps the note.');
        if (removeNote) note = '';
      }
      if (note) {
        marks[key] = { ...existing, entry_key: key, is_marked: false, note, updated_by: getEditorName() || null, updated_at: new Date().toISOString() };
      } else delete marks[key];
      applyMarks();
      await persistRecord(key);
    });
  });
}

function clearMarks() {
  const next = {};
  Object.entries(marks).forEach(([key, rec]) => {
    const note = cleanNote(rec.note);
    if (note) next[key] = { ...rec, is_marked: false };
  });
  marks = next;
  applyMarks();
  if (useSupabase) Promise.all(Object.keys(next).map((key) => persistRecord(key))).then(() => stampStatus('Shared live'));
  else saveLocalMarks(marks);
}
window.clearMarks = clearMarks;

function toggleSeasonOnly() {
  document.body.classList.toggle('season-only');
  const on = document.body.classList.contains('season-only');
  document.querySelectorAll('td.program:not(.season-start), table.companion tr:not(.season-start)[data-key]').forEach((el) => {
    el.style.opacity = on ? '0.45' : '';
  });
}
window.toggleSeasonOnly = toggleSeasonOnly;

async function init() {
  buildModal();
  buildNoteControls();
  if (editorEl) {
    editorEl.value = localStorage.getItem(LOCAL_EDITOR_KEY) || '';
    editorEl.addEventListener('change', saveEditorName);
  }
  marks = loadLocalMarks();
  applyMarks();
  wireBoxes();
  wireTooltipTargets();
  refreshBtn?.addEventListener('click', async () => {
    if (useSupabase) await loadSharedMarks();
  });
  const connected = await connectSupabase();
  if (connected) {
    await loadSharedMarks();
    subscribeRealtime();
    startPolling();
  }
}
init();
