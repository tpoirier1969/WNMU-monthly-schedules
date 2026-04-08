const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';
const PROJECT_SCOPE = 'wnmu_schedule_shareboard';
const CHANNEL_SLUG = 'wnmu1hd';
const SCHEDULE_SLUG = '2026-05';
const TABLE_NAME = 'wnmu_sched_shared_marks';
const LOCAL_STORAGE_KEY = `${PROJECT_SCOPE}_${CHANNEL_SLUG}_${SCHEDULE_SLUG}_marks_v5`;
const LOCAL_EDITOR_KEY = `${PROJECT_SCOPE}_${CHANNEL_SLUG}_${SCHEDULE_SLUG}_editor_v5`;
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

const statusEl = document.getElementById('sync-status');
const editorEl = document.getElementById('editor-name');
const refreshBtn = document.getElementById('refresh-marks');

function setStatus(mode, text) {
  if (!statusEl) return;
  statusEl.className = `sync-status ${mode}`;
  statusEl.textContent = text;
}

function getEditorName() {
  return (editorEl?.value || '').trim();
}

function saveEditorName() {
  if (!editorEl) return;
  localStorage.setItem(LOCAL_EDITOR_KEY, editorEl.value || '');
}

function loadLocalMarks() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveLocalMarks(data) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
}

function recordFor(key) {
  return marks[key] || null;
}

function cleanNote(note) {
  return (note || '').replace(/\r\n/g, '\n').trim();
}

function metaForKey(key) {
  const el = document.querySelector(`[data-key="${key}"]`);
  if (!el) return { title: 'Program note', when: '' };
  const title = el.getAttribute('data-title') || el.querySelector('.title')?.textContent?.trim() || 'Program note';
  const day = el.getAttribute('data-day') || '';
  const date = el.getAttribute('data-date') || '';
  const time = el.getAttribute('data-time') || '';
  const when = [day, date, time].filter(Boolean).join(' | ');
  return { title, when };
}

function hasNote(key) {
  return !!cleanNote(recordFor(key)?.note);
}

function notePreview(note) {
  const clean = cleanNote(note);
  if (!clean) return '';
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
    btn.setAttribute('aria-label', note ? 'Edit note' : 'Add note');
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
    if (note) {
      el.setAttribute('data-note', note);
    } else {
      el.removeAttribute('data-note');
    }
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

    if (box) {
      row.insertBefore(btn, box);
    } else {
      row.appendChild(btn);
    }
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
    <div class="note-tooltip hidden" id="note-tooltip"></div>
  `;
  document.body.appendChild(shell);

  noteModal = document.getElementById('note-modal-shell');
  noteTextarea = document.getElementById('note-textarea');
  noteTitle = document.getElementById('note-modal-title');
  noteMeta = document.getElementById('note-modal-meta');
  tooltipEl = document.getElementById('note-tooltip');

  noteModal.addEventListener('click', (event) => {
    const close = event.target.closest('[data-note-close="1"]');
    if (close) closeNoteModal();
  });

  document.getElementById('note-save-btn')?.addEventListener('click', async () => {
    await saveNoteFromModal();
  });
  document.getElementById('note-clear-btn')?.addEventListener('click', async () => {
    await clearNoteFromModal();
  });
  document.getElementById('note-cancel-btn')?.addEventListener('click', closeNoteModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideTooltip();
      if (noteModal && !noteModal.classList.contains('hidden')) {
        closeNoteModal();
      }
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
  if (!rec) {
    if (useSupabase && supabase) {
      setStatus('saving', 'Removing...');
      const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('project_scope', PROJECT_SCOPE)
        .eq('channel_slug', CHANNEL_SLUG)
        .eq('schedule_slug', SCHEDULE_SLUG)
        .eq('entry_key', key);
      if (error) {
        console.error(error);
        setStatus('error', 'Supabase remove failed');
        return;
      }
      setStatus('online', 'Shared mode');
    } else {
      saveLocalMarks(marks);
      setStatus('local', 'Local mode');
    }
    return;
  }

  if (useSupabase && supabase) {
    setStatus('saving', 'Saving...');
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
    if (error) {
      console.error(error);
      setStatus('error', 'Supabase save failed');
      return;
    }
    setStatus('online', 'Shared mode');
  } else {
    saveLocalMarks(marks);
    setStatus('local', 'Local mode');
  }
}

async function saveNoteFromModal() {
  if (!activeEditKey) return;
  const key = activeEditKey;
  const note = cleanNote(noteTextarea.value);
  const current = recordFor(key) || { entry_key: key, is_marked: false };
  if (note || current.is_marked) {
    marks[key] = {
      ...current,
      entry_key: key,
      note,
      updated_by: getEditorName() || null,
      updated_at: new Date().toISOString(),
    };
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
  if (!current) {
    closeNoteModal();
    return;
  }
  current.note = '';
  current.updated_by = getEditorName() || null;
  current.updated_at = new Date().toISOString();
  if (!current.is_marked) {
    delete marks[key];
  } else {
    marks[key] = current;
  }
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
  hoverTimer = window.setTimeout(() => {
    showTooltip(key, anchor);
  }, HOVER_DELAY_MS);
}

function wireTooltipTargets() {
  document.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('mouseenter', () => queueTooltip(el));
    el.addEventListener('mouseleave', () => hideTooltip());
    el.addEventListener('focusin', () => queueTooltip(el));
    el.addEventListener('focusout', () => hideTooltip());
  });
  window.addEventListener('scroll', () => {
    if (tooltipEl && tooltipAnchor && !tooltipEl.classList.contains('hidden')) {
      placeTooltip(tooltipAnchor);
    }
  }, { passive: true });
}

async function connectSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    setStatus('local', 'Local mode');
    return false;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  useSupabase = true;
  setStatus('online', 'Shared mode');
  return true;
}

async function loadSharedMarks() {
  if (!useSupabase || !supabase) return;
  setStatus('saving', 'Loading shared marks...');
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('entry_key,is_marked,note,updated_at,updated_by')
    .eq('project_scope', PROJECT_SCOPE)
    .eq('channel_slug', CHANNEL_SLUG)
    .eq('schedule_slug', SCHEDULE_SLUG);

  if (error) {
    console.error(error);
    setStatus('error', 'Supabase load failed');
    return;
  }

  const next = {};
  for (const row of data || []) {
    next[row.entry_key] = row;
  }
  marks = next;
  applyMarks();
  setStatus('online', 'Shared mode');
}

function wireBoxes() {
  document.querySelectorAll('input.markbox').forEach((box) => {
    box.addEventListener('change', async () => {
      const key = box.dataset.key;
      const existing = recordFor(key) || { entry_key: key, note: '' };

      if (box.checked) {
        marks[key] = {
          ...existing,
          entry_key: key,
          is_marked: true,
          updated_by: getEditorName() || null,
          updated_at: new Date().toISOString(),
        };
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
        marks[key] = {
          ...existing,
          entry_key: key,
          is_marked: false,
          note,
          updated_by: getEditorName() || null,
          updated_at: new Date().toISOString(),
        };
      } else {
        delete marks[key];
      }

      applyMarks();
      await persistRecord(key);
    });
  });
}

function clearMarks() {
  const next = {};
  Object.entries(marks).forEach(([key, rec]) => {
    const note = cleanNote(rec.note);
    if (note) {
      next[key] = {
        ...rec,
        is_marked: false,
      };
    }
  });
  marks = next;
  applyMarks();
  if (useSupabase) {
    Promise.all(Object.keys(next).map((key) => persistRecord(key))).then(() => {
      setStatus('online', 'Shared mode');
    });
  } else {
    saveLocalMarks(marks);
    setStatus('local', 'Local mode');
  }
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
  }
}

init();
