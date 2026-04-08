
const SUPABASE_URL = 'REPLACE_WITH_YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'REPLACE_WITH_YOUR_SUPABASE_ANON_KEY';
const SCHEDULE_SLUG = 'wnmu1hd-may-2026';
const LOCAL_STORAGE_KEY = 'wnmu1hd_may2026_shareboard_v3';

let supabase = null;
let marks = {};
let useSupabase = false;
let syncTimer = null;

const statusEl = document.getElementById('sync-status');
const editorEl = document.getElementById('editor-name');
const refreshBtn = document.getElementById('refresh-marks');

function setStatus(mode, text){
  if (!statusEl) return;
  statusEl.className = 'sync-status ' + mode;
  statusEl.textContent = text;
}

function safeJsonParse(raw, fallback) {
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}

function loadLocalMarks(){
  return safeJsonParse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}', {});
}
function saveLocalMarks(nextMarks){
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextMarks));
}

function getEditorName(){
  return (editorEl?.value || localStorage.getItem(LOCAL_STORAGE_KEY + '_editor') || '').trim();
}
function saveEditorName(){
  if (editorEl) localStorage.setItem(LOCAL_STORAGE_KEY + '_editor', editorEl.value.trim());
}

function applyMarks(){
  document.querySelectorAll('[data-key]').forEach(el => {
    const key = el.getAttribute('data-key');
    const marked = !!marks[key]?.is_marked;
    if (el.matches('input.markbox')) {
      el.checked = marked;
    } else {
      el.classList.toggle('marked', marked);
    }
  });
}

async function connectSupabase(){
  if (typeof window.supabase === 'undefined') {
    setStatus('local', 'Local mode');
    return false;
  }
  if (SUPABASE_URL.includes('REPLACE_WITH') || SUPABASE_ANON_KEY.includes('REPLACE_WITH')) {
    setStatus('local', 'Local mode');
    return false;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  useSupabase = true;
  setStatus('online', 'Shared mode');
  return true;
}

async function loadSharedMarks(){
  if (!useSupabase || !supabase) return;
  setStatus('saving', 'Loading shared marks...');
  const { data, error } = await supabase
    .from('schedule_marks')
    .select('entry_key,is_marked,note,updated_at,updated_by')
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

async function saveSharedMark(key, isMarked){
  if (!useSupabase || !supabase) return;
  setStatus('saving', 'Saving...');
  const payload = {
    schedule_slug: SCHEDULE_SLUG,
    entry_key: key,
    is_marked: isMarked,
    updated_by: getEditorName() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('schedule_marks').upsert(payload, { onConflict: 'schedule_slug,entry_key' });
  if (error) {
    console.error(error);
    setStatus('error', 'Supabase save failed');
    return;
  }
  setStatus('online', 'Shared mode');
}

function wireBoxes(){
  document.querySelectorAll('input.markbox').forEach(box => {
    box.addEventListener('change', async () => {
      const key = box.getAttribute('data-key');
      marks[key] = {
        ...(marks[key] || {}),
        entry_key: key,
        is_marked: box.checked,
        updated_by: getEditorName() || null,
        updated_at: new Date().toISOString(),
      };
      if (!box.checked && !marks[key]?.note) {
        delete marks[key];
      }
      applyMarks();
      if (useSupabase) {
        await saveSharedMark(key, box.checked);
      } else {
        saveLocalMarks(marks);
        setStatus('local', 'Local mode');
      }
    });
  });
}

function clearMarks(){
  marks = {};
  saveLocalMarks(marks);
  applyMarks();
  setStatus(useSupabase ? 'online' : 'local', useSupabase ? 'Shared mode' : 'Local mode');
}
window.clearMarks = clearMarks;

function toggleSeasonOnly(){
  document.body.classList.toggle('season-only');
  const on = document.body.classList.contains('season-only');
  document.querySelectorAll('td.program:not(.season-start), table.companion tr:not(.season-start)[data-key]').forEach(el => {
    el.style.opacity = on ? '0.45' : '';
  });
}
window.toggleSeasonOnly = toggleSeasonOnly;

async function init(){
  if (editorEl) {
    editorEl.value = localStorage.getItem(LOCAL_STORAGE_KEY + '_editor') || '';
    editorEl.addEventListener('change', saveEditorName);
  }
  marks = loadLocalMarks();
  applyMarks();
  wireBoxes();

  refreshBtn?.addEventListener('click', async () => {
    if (useSupabase) await loadSharedMarks();
  });

  const connected = await connectSupabase();
  if (connected) {
    await loadSharedMarks();
  }
}

init();
