
(function () {
  'use strict';
  const VERSION = 'v1.5.57-title-review-on-import';
  const IMPORTED_TABLE = 'wnmu_monthly_schedules_imported_months';
  const CURRENT_TABLE = 'wnmu_monthly_schedules_current_months';
  const CORRECTION_KEY = 'wnmu_sales_title_corrections_v1';

  function esc(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function cfg() { return window.WNMU_SHAREBOARD_SUPABASE || {}; }
  function norm(value) { return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function compact(value) { return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ''); }
  function simpleCaseKey(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function readCorrections() { try { return JSON.parse(localStorage.getItem(CORRECTION_KEY) || '{}') || {}; } catch { return {}; } }
  function writeCorrections(map) { localStorage.setItem(CORRECTION_KEY, JSON.stringify(map || {})); }
  function saveCorrection(from, to) {
    const raw = String(from || '').trim().replace(/\s+/g, ' ');
    const clean = String(to || '').trim().replace(/\s+/g, ' ');
    if (!raw || !clean) return false;
    const map = readCorrections();
    map[norm(raw)] = clean;
    map[compact(raw)] = clean;
    writeCorrections(map);
    return true;
  }
  function deleteCorrection(key) {
    const map = readCorrections();
    delete map[key];
    writeCorrections(map);
  }
  function knownCorrections() {
    return {
      'great get aways':'Great Getaways', 'greatgetaways':'Great Getaways',
      'mister rogers neighborhood':"Mister Rogers' Neighborhood", 'mister roger s neighborhood':"Mister Rogers' Neighborhood",
      'mister rogers neighbourhood':"Mister Rogers' Neighborhood", 'mr rogers neighborhood':"Mister Rogers' Neighborhood",
      'craftsmans legacy':"Craftsman's Legacy", 'craftsman s legacy':"Craftsman's Legacy",
      'lyla in the loop':'Lyla in the Loop', 'weather hunters':'Weather Hunters', 'classical stretch':'Classical Stretch',
      'life on earth':'Life on Earth', 'son of a butcher':'Son of a Butcher', 'prairie sportsman':'Prairie Sportsman',
      'in the americas':'In the Americas', 'arthur':'Arthur', 'wild kratts':'Wild Kratts'
    };
  }
  async function rest(path) {
    const c = cfg();
    if (!c.url || !c.anonKey) throw new Error('config.js is missing Supabase credentials.');
    const res = await fetch(`${c.url}${path}`, { headers:{ apikey:c.anonKey, Authorization:`Bearer ${c.anonKey}` }, cache:'no-store' });
    if (!res.ok) throw new Error(`Supabase read failed (${res.status}) ${await res.text()}`);
    return res.json();
  }
  function titleOf(entry) { return String(entry?.title || '').trim().replace(/\s+/g, ' '); }
  function allTitlesFromRows(rows) {
    const titles = [];
    (rows || []).forEach(row => {
      const sched = row.schedule_json || {};
      (sched.days || []).forEach(day => (day.entries || []).forEach(entry => {
        const t = titleOf(entry); if (t) titles.push({ title:t, channel:row.channel_code, month:row.month_key, date:entry.date || day.date, time:entry.time || '' });
      }));
    });
    return titles;
  }
  function analyze(rows) {
    const titles = allTitlesFromRows(rows);
    const groups = new Map();
    titles.forEach(item => {
      const k = compact(item.title); if (!k) return;
      if (!groups.has(k)) groups.set(k, new Map());
      const m = groups.get(k); m.set(item.title, (m.get(item.title) || 0) + 1);
    });
    const variants = [];
    groups.forEach(counts => {
      if (counts.size <= 1) return;
      const keys = new Set(Array.from(counts.keys()).map(simpleCaseKey));
      if (keys.size <= 1) return; // ignore all-caps/title-case differences only
      const variantsList = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).map(([title,count])=>({title,count}));
      variants.push({ preferred: variantsList[0].title, variants: variantsList });
    });
    const known = [];
    const built = knownCorrections();
    const seenKnown = new Set();
    titles.forEach(item => {
      const fixed = built[norm(item.title)] || built[compact(item.title)];
      if (fixed && fixed !== item.title) {
        const sig = `${item.title}=>${fixed}`;
        if (!seenKnown.has(sig)) { seenKnown.add(sig); known.push({ from:item.title, to:fixed }); }
      }
    });
    return { titles, variants, known, rows };
  }
  function correctionRowsHtml() {
    const map = readCorrections();
    const keys = Object.keys(map).sort();
    if (!keys.length) return '<p class="title-review-muted">No saved user corrections yet.</p>';
    return '<ul class="title-review-corrections">' + keys.map(key => `<li><code>${esc(key)}</code> → <strong>${esc(map[key])}</strong> <button type="button" data-delete-title-key="${esc(key)}">Remove</button></li>`).join('') + '</ul>';
  }
  function renderResult(result, note) {
    const root = document.getElementById('titleReviewOutput'); if (!root) return;
    let html = note ? `<p class="title-review-note">${esc(note)}</p>` : '';
    html += '<div class="title-review-form"><label>Imported/wrong title<input id="titleReviewWrong" type="text" placeholder="Great Get Aways"></label><label>Correct display title<input id="titleReviewCorrect" type="text" placeholder="Great Getaways"></label><button type="button" id="titleReviewSave">Save correction</button></div>';
    html += '<h3>Your saved corrections</h3>' + correctionRowsHtml();
    if (result) {
      html += `<h3>Known corrections found (${result.known.length})</h3>`;
      if (result.known.length) html += '<ul>' + result.known.slice(0,80).map(item => `<li>${esc(item.from)} → <strong>${esc(item.to)}</strong> <button type="button" data-fill-wrong="${esc(item.from)}" data-fill-correct="${esc(item.to)}">Use</button></li>`).join('') + '</ul>'; else html += '<p class="title-review-muted">No known corrections found in scanned schedule rows.</p>';
      html += `<h3>Possible title variants (${result.variants.length})</h3>`;
      if (result.variants.length) {
        html += '<ul>' + result.variants.slice(0,80).map(group => {
          const bits = group.variants.map(v => `${esc(v.title)} (${v.count}×)`).join(' / ');
          return `<li><strong>Likely:</strong> ${esc(group.preferred)} — ${bits} <button type="button" data-fill-wrong="${esc(group.variants[group.variants.length-1].title)}" data-fill-correct="${esc(group.preferred)}">Use least common → likely</button></li>`;
        }).join('') + '</ul>';
      } else html += '<p class="title-review-muted">No variants beyond case-only differences found.</p>';
    }
    root.innerHTML = html;
    bindInside(root);
  }
  async function scanCurrent() {
    const root = document.getElementById('titleReviewOutput'); if (root) root.textContent = 'Scanning current imported months…';
    const current = await rest(`/rest/v1/${CURRENT_TABLE}?select=channel_code,month_key&order=channel_code.asc`);
    let rows = [];
    for (const cur of current || []) {
      const one = await rest(`/rest/v1/${IMPORTED_TABLE}?select=channel_code,month_key,schedule_json,updated_at&channel_code=eq.${encodeURIComponent(cur.channel_code)}&month_key=eq.${encodeURIComponent(cur.month_key)}&limit=1`);
      rows.push(...(one || []));
    }
    const result = analyze(rows);
    renderResult(result, `Scanned ${rows.length} current imported month row(s). These corrections affect display in Sales View only; they do not rewrite imported schedule data.`);
  }
  function bindInside(root) {
    root.querySelector('#titleReviewSave')?.addEventListener('click', () => {
      const from = root.querySelector('#titleReviewWrong')?.value || '';
      const to = root.querySelector('#titleReviewCorrect')?.value || '';
      if (saveCorrection(from, to)) renderResult(null, 'Saved correction. Click “Scan current imported month titles” to refresh the review.');
    });
    root.querySelectorAll('[data-fill-wrong]').forEach(btn => btn.addEventListener('click', () => {
      root.querySelector('#titleReviewWrong').value = btn.getAttribute('data-fill-wrong') || '';
      root.querySelector('#titleReviewCorrect').value = btn.getAttribute('data-fill-correct') || '';
    }));
    root.querySelectorAll('[data-delete-title-key]').forEach(btn => btn.addEventListener('click', () => {
      deleteCorrection(btn.getAttribute('data-delete-title-key') || '');
      renderResult(null, 'Removed correction.');
    }));
  }
  function injectStyles() {
    if (document.getElementById('wnmuTitleReviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuTitleReviewStyles';
    style.textContent = `.title-review-form{display:grid;grid-template-columns:1fr 1fr auto;gap:.75rem;align-items:end;margin:.75rem 0}.title-review-form label{display:flex;flex-direction:column;font-weight:700;gap:.25rem}.title-review-form input{padding:.55rem;border:1px solid #b8c3d2;border-radius:.5rem}.title-review-form button,#scanTitleReviewBtn{padding:.55rem .75rem;border:1px solid #0d4f38;background:#0d4f38;color:#fff;border-radius:.5rem;font-weight:700;cursor:pointer}.title-review-muted,.title-review-note{color:#536176}.title-review-corrections button,[data-fill-wrong],[data-delete-title-key]{margin-left:.4rem;border:1px solid #b8c3d2;border-radius:.4rem;background:#fff;padding:.2rem .4rem;cursor:pointer}`;
    document.head.appendChild(style);
  }
  function init() {
    injectStyles();
    const btn = document.getElementById('scanTitleReviewBtn');
    if (btn) btn.addEventListener('click', () => scanCurrent().catch(err => renderResult(null, `Title review scan failed: ${err.message || err}`)));
    renderResult(null, 'Use this after publishing/importing a month, before opening the Sales View.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
  window.WNMU_TITLE_REVIEW_VERSION = VERSION;
})();
