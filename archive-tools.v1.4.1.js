(function () {
  const TABLE_NAME = 'wnmu_monthly_archives';
  const LIVE_PAGES = {
    '13.1': 'index131.v1.4.1.html',
    '13.3': 'index133.v1.4.1.html'
  };

  function getCfg() {
    return window.WNMU_SHAREBOARD_SUPABASE;
  }

  function ensureCfg() {
    const cfg = getCfg();
    if (!cfg?.url || !cfg?.anonKey) throw new Error('config.js is missing or does not contain Supabase credentials.');
    return cfg;
  }

  async function restSelect(pathAndQuery) {
    const cfg = ensureCfg();
    const res = await fetch(`${cfg.url}${pathAndQuery}`, {
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': `Bearer ${cfg.anonKey}`
      },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`Supabase read failed (${res.status})`);
    return res.json();
  }

  async function restInsert(path, body) {
    const cfg = ensureCfg();
    const res = await fetch(`${cfg.url}${path}`, {
      method: 'POST',
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Supabase write failed (${res.status}) ${txt}`);
    }
    return res.json();
  }

  function h(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function summarizeSnapshot(snapshot) {
    let entries = 0;
    let tagHits = 0;
    let noteHits = 0;
    if (snapshot && typeof snapshot === 'object') {
      for (const value of Object.values(snapshot)) {
        entries += 1;
        const tags = value?.tags || value;
        if (tags && typeof tags === 'object') {
          for (const v of Object.values(tags)) if (v === true) tagHits += 1;
        }
        if (value?.rectNote) noteHits += 1;
      }
    }
    return { entry_count: entries, tag_count: tagHits, rect_count: noteHits };
  }

  function buildCompactGroup(title, code, rows) {
    const page = LIVE_PAGES[code] || 'index.archive.v1.2.2.html';
    const items = rows.map(row => {
      const created = new Date(row.created_at).toLocaleString();
      const note = row.archive_note ? ` — ${h(row.archive_note)}` : '';
      return `<li><a href="${page}?archive=${encodeURIComponent(row.id)}">${h(row.archive_name || 'Untitled archive')}</a><span class="archive-date">${h(created)}</span><span class="archive-note-inline">${note}</span></li>`;
    }).join('');
    return `
      <section class="archive-column">
        <h2>${h(title)}</h2>
        <ul class="archive-compact-list">${items || '<li class="archive-empty-inline">No archives yet.</li>'}</ul>
      </section>
    `;
  }

  async function renderArchiveHome() {
    const host = document.getElementById('archiveList');
    if (!host) return;
    try {
      const rows = await restSelect(`/rest/v1/${TABLE_NAME}?select=id,channel_code,channel_label,archive_name,archive_note,build_version,stats_json,created_at&order=created_at.desc&limit=500`);
      const groups = { '13.1': [], '13.3': [] };
      for (const row of Array.isArray(rows) ? rows : []) {
        if (groups[row.channel_code]) groups[row.channel_code].push(row);
      }
      host.innerHTML = `
        <div class="archive-two-col">
          ${buildCompactGroup('13.1 — WNMU1HD', '13.1', groups['13.1'])}
          ${buildCompactGroup('13.3 — WNMU3PL', '13.3', groups['13.3'])}
        </div>
      `;
    } catch (err) {
      host.innerHTML = `<div class="archive-error">${h(err.message || String(err))}</div>`;
      console.error(err);
    }
  }

  function bindArchiveButton() {
    const btn = document.getElementById('archiveSnapshotBtn');
    if (!btn) return;

    function getDebug() { return window.__WNMU_DEBUG__ || null; }

    btn.addEventListener('click', async () => {
      const debug = getDebug();
      if (!debug) {
        alert('The page is not ready yet.');
        return;
      }
      if (debug.isArchiveMode && debug.isArchiveMode()) {
        alert('This is already a read-only archive view.');
        return;
      }

      const config = debug.getConfig();
      const snapshot = debug.getMarks();
      const stats = summarizeSnapshot(snapshot);
      const defaultName = `${config.channelLabel} snapshot ${new Date().toLocaleString()}`;
      const archiveName = window.prompt('Archive name:', defaultName);
      if (archiveName === null) return;
      const archiveNote = window.prompt('Optional archive note:', '') ?? '';

      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = 'Saving archive…';
      try {
        const rows = await restInsert(`/rest/v1/${TABLE_NAME}`, [{
          channel_code: config.channelCode,
          channel_label: config.channelLabel,
          archive_name: archiveName.trim() || defaultName,
          archive_note: archiveNote.trim() || null,
          build_version: config.buildVersion,
          schedule_file: config.scheduleFile,
          verification_file: config.verificationFile,
          storage_key: config.storageKey,
          snapshot_json: snapshot,
          stats_json: stats
        }]);
        const saved = Array.isArray(rows) ? rows[0] : null;
        if (!saved?.id) throw new Error('Archive saved, but no id came back.');
        alert(`Archive saved.\n\n${saved.archive_name}\n${new Date(saved.created_at).toLocaleString()}`);
        window.location.href = `${window.location.pathname.split('/').pop()}?archive=${encodeURIComponent(saved.id)}`;
      } catch (err) {
        console.error(err);
        alert(err.message || String(err));
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });

    const waitForDebug = window.setInterval(() => {
      const debug = getDebug();
      if (!debug) return;
      if (debug.isArchiveMode && debug.isArchiveMode()) {
        btn.disabled = true;
        btn.textContent = 'Archive view';
      }
      window.clearInterval(waitForDebug);
    }, 150);
    window.setTimeout(() => window.clearInterval(waitForDebug), 6000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderArchiveHome();
    bindArchiveButton();
  });
})();
