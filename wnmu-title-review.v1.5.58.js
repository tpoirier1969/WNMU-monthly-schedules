(function () {
  'use strict';
  const VERSION = 'v1.5.58-interactive-channel-title-review';
  const IMPORTED_TABLE = 'wnmu_monthly_schedules_imported_months';
  const CURRENT_TABLE = 'wnmu_monthly_schedules_current_months';
  const CORRECTION_KEY = 'wnmu_sales_title_corrections_v1';
  const CORRECTION_META_KEY = 'wnmu_sales_title_corrections_meta_v1';

  let lastResult = null;
  let lastMessage = '';

  function esc(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function cfg() { return window.WNMU_SHAREBOARD_SUPABASE || {}; }
  function pageCfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function norm(value) { return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function compact(value) { return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ''); }
  function simpleCaseKey(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function cleanTitle(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
  function channelCode() {
    const panel = document.getElementById('titleReviewPanel');
    return panel?.dataset?.titleReviewChannel || pageCfg().channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1');
  }
  function channelLabel() { return pageCfg().channelLabel || (channelCode() === '13.3' ? 'WNMU3PL' : 'WNMU1HD'); }
  function readCorrections() { try { return JSON.parse(localStorage.getItem(CORRECTION_KEY) || '{}') || {}; } catch { return {}; } }
  function writeCorrections(map) { localStorage.setItem(CORRECTION_KEY, JSON.stringify(map || {})); }
  function readCorrectionMeta() { try { return JSON.parse(localStorage.getItem(CORRECTION_META_KEY) || '{}') || {}; } catch { return {}; } }
  function writeCorrectionMeta(map) { localStorage.setItem(CORRECTION_META_KEY, JSON.stringify(map || {})); }

  function saveCorrection(from, to) {
    const raw = cleanTitle(from);
    const clean = cleanTitle(to);
    if (!raw || !clean) return false;
    const map = readCorrections();
    const meta = readCorrectionMeta();
    const n = norm(raw);
    const c = compact(raw);
    map[n] = clean;
    map[c] = clean;
    meta[n] = { from: raw, to: clean, updatedAt: new Date().toISOString(), source: 'schedule-page-review' };
    writeCorrections(map);
    writeCorrectionMeta(meta);
    return true;
  }
  function deleteCorrection(key) {
    const map = readCorrections();
    const meta = readCorrectionMeta();
    const item = meta[key] || null;
    delete meta[key];
    delete map[key];
    if (item?.from) {
      delete map[norm(item.from)];
      delete map[compact(item.from)];
    }
    writeCorrections(map);
    writeCorrectionMeta(meta);
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
  function titleOf(entry) { return cleanTitle(entry?.title || ''); }
  function allTitlesFromRow(row) {
    const titles = [];
    const sched = row?.schedule_json || {};
    (sched.days || []).forEach(day => (day.entries || []).forEach(entry => {
      const title = titleOf(entry);
      if (title) titles.push({ title, channel: row.channel_code, month: row.month_key, date: entry.date || day.date, time: entry.time || '' });
    }));
    return titles;
  }
  function occurrenceText(item) {
    const date = String(item?.date || '').slice(5).replace('-', '/');
    return [date, item?.time].filter(Boolean).join(' ');
  }
  function analyze(row) {
    const titles = allTitlesFromRow(row);
    const countsByTitle = new Map();
    const samplesByTitle = new Map();
    titles.forEach(item => {
      countsByTitle.set(item.title, (countsByTitle.get(item.title) || 0) + 1);
      if (!samplesByTitle.has(item.title)) samplesByTitle.set(item.title, []);
      if (samplesByTitle.get(item.title).length < 6) samplesByTitle.get(item.title).push(item);
    });

    const compactGroups = new Map();
    titles.forEach(item => {
      const k = compact(item.title); if (!k) return;
      if (!compactGroups.has(k)) compactGroups.set(k, new Map());
      const m = compactGroups.get(k); m.set(item.title, (m.get(item.title) || 0) + 1);
    });

    const variants = [];
    compactGroups.forEach(counts => {
      if (counts.size <= 1) return;
      const keys = new Set(Array.from(counts.keys()).map(simpleCaseKey));
      if (keys.size <= 1) return; // ignore all-caps/title-case differences only
      const variantsList = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).map(([title,count])=>({ title, count, samples: samplesByTitle.get(title) || [] }));
      variants.push({ preferred: variantsList[0].title, variants: variantsList });
    });

    const known = [];
    const built = knownCorrections();
    const seenKnown = new Set();
    titles.forEach(item => {
      const fixed = built[norm(item.title)] || built[compact(item.title)];
      if (fixed && fixed !== item.title) {
        const sig = `${item.title}=>${fixed}`;
        if (!seenKnown.has(sig)) {
          seenKnown.add(sig);
          known.push({ from:item.title, to:fixed, count: countsByTitle.get(item.title) || 1, samples: samplesByTitle.get(item.title) || [] });
        }
      }
    });

    return { titles, variants, known, row, channel: row?.channel_code || channelCode(), month: row?.month_key || '' };
  }
  function savedCorrections() {
    const meta = readCorrectionMeta();
    const map = readCorrections();
    const out = [];
    Object.keys(meta).sort().forEach(key => {
      const item = meta[key];
      if (item?.from && item?.to) out.push({ key, from: item.from, to: item.to, updatedAt: item.updatedAt || '' });
    });
    if (!out.length) {
      const seen = new Set();
      Object.keys(map).sort().forEach(key => {
        const to = map[key];
        const sig = `${key}=>${to}`;
        if (!seen.has(sig)) { seen.add(sig); out.push({ key, from: key, to }); }
      });
    }
    return out;
  }
  function rowButtonAttrs(from, to) {
    return `data-title-from="${esc(from)}" data-title-to="${esc(to)}"`;
  }
  function samplesHtml(samples) {
    const bits = (samples || []).slice(0, 5).map(occurrenceText).filter(Boolean);
    return bits.length ? `<span class="title-review-samples">${esc(bits.join(', '))}</span>` : '';
  }
  function renderEditor(from, to) {
    return `<div class="title-review-inline-editor" data-editor-for="${esc(norm(from))}">
      <label>Imported title<input type="text" class="title-review-from" value="${esc(from)}"></label>
      <label>Correct display title<input type="text" class="title-review-to" value="${esc(to || from)}"></label>
      <button type="button" class="title-review-save-inline">Save correction</button>
      <button type="button" class="title-review-cancel-inline">Cancel</button>
    </div>`;
  }
  function renderResult(result, note) {
    lastResult = result || lastResult;
    lastMessage = note || lastMessage;
    const root = document.getElementById('titleReviewOutput'); if (!root) return;
    const saved = savedCorrections();
    let html = note ? `<p class="title-review-note">${esc(note)}</p>` : '';
    html += `<div class="title-review-toolbar"><button type="button" id="scanTitleReviewBtnInline">Rescan ${esc(channelLabel())}</button><span>Click a title below to edit the correction. Saved corrections are display-only and feed the Sales View.</span></div>`;

    if (saved.length) {
      html += `<details class="title-review-group" open><summary>Saved corrections (${saved.length})</summary><div class="title-review-list">`;
      saved.slice(0, 100).forEach(item => {
        html += `<div class="title-review-row saved"><button type="button" class="title-review-title" ${rowButtonAttrs(item.from, item.to)}>${esc(item.from)}</button><span class="title-review-arrow">→</span><strong>${esc(item.to)}</strong><button type="button" class="title-review-remove" data-delete-title-key="${esc(item.key)}">Remove</button></div>`;
      });
      html += '</div></details>';
    }

    if (result) {
      html += `<details class="title-review-group" open><summary>Known corrections found (${result.known.length})</summary>`;
      if (result.known.length) {
        html += '<div class="title-review-list">' + result.known.slice(0,120).map(item => `<div class="title-review-row known"><button type="button" class="title-review-title" ${rowButtonAttrs(item.from, item.to)}>${esc(item.from)}</button><span class="title-review-count">${item.count}×</span><span class="title-review-arrow">→</span><strong>${esc(item.to)}</strong>${samplesHtml(item.samples)}</div>`).join('') + '</div>';
      } else html += '<p class="title-review-muted">No known corrections found for this channel/month.</p>';
      html += '</details>';

      html += `<details class="title-review-group" open><summary>Possible title variants (${result.variants.length})</summary>`;
      if (result.variants.length) {
        html += '<div class="title-review-list">';
        result.variants.slice(0,120).forEach(group => {
          html += `<div class="title-review-variant"><div class="title-review-preferred">Suggested preferred title: <strong>${esc(group.preferred)}</strong></div>`;
          group.variants.forEach(v => {
            const suggested = group.preferred || v.title;
            const cls = v.title === suggested ? 'preferred' : 'variant';
            html += `<div class="title-review-row ${cls}"><button type="button" class="title-review-title" ${rowButtonAttrs(v.title, suggested)}>${esc(v.title)}</button><span class="title-review-count">${v.count}×</span>${samplesHtml(v.samples)}</div>`;
          });
          html += '</div>';
        });
        html += '</div>';
      } else html += '<p class="title-review-muted">No spelling/punctuation variants beyond all-caps/title-case differences found.</p>';
      html += '</details>';
    } else {
      html += '<p class="title-review-muted">Scan this channel to see possible title cleanup items.</p>';
    }
    root.innerHTML = html;
    bindInside(root);
  }
  async function scanCurrent() {
    const root = document.getElementById('titleReviewOutput'); if (root) root.textContent = `Scanning ${channelLabel()} current imported month titles…`;
    const code = channelCode();
    const current = await rest(`/rest/v1/${CURRENT_TABLE}?select=channel_code,month_key&channel_code=eq.${encodeURIComponent(code)}&limit=1`);
    const cur = Array.isArray(current) ? current[0] : null;
    if (!cur?.month_key) throw new Error(`No current month pointer found for ${code}.`);
    const rows = await rest(`/rest/v1/${IMPORTED_TABLE}?select=channel_code,month_key,schedule_json,updated_at&channel_code=eq.${encodeURIComponent(code)}&month_key=eq.${encodeURIComponent(cur.month_key)}&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) throw new Error(`No imported month row found for ${code} ${cur.month_key}.`);
    const result = analyze(row);
    renderResult(result, `Scanned ${code} ${cur.month_key}. Corrections saved here will be used by the Sales View in this browser.`);
  }
  function showInlineEditor(button) {
    const from = button.getAttribute('data-title-from') || '';
    const to = button.getAttribute('data-title-to') || from;
    const row = button.closest('.title-review-row') || button.closest('.title-review-variant');
    if (!row) return;
    row.querySelectorAll('.title-review-inline-editor').forEach(el => el.remove());
    row.insertAdjacentHTML('beforeend', renderEditor(from, to));
    const editor = row.querySelector('.title-review-inline-editor');
    editor?.querySelector('.title-review-to')?.focus();
  }
  function bindInside(root) {
    root.querySelector('#scanTitleReviewBtnInline')?.addEventListener('click', () => scanCurrent().catch(err => renderResult(lastResult, `Title review scan failed: ${err.message || err}`)));
    root.querySelectorAll('[data-title-from]').forEach(btn => btn.addEventListener('click', () => showInlineEditor(btn)));
    root.querySelectorAll('[data-delete-title-key]').forEach(btn => btn.addEventListener('click', () => {
      deleteCorrection(btn.getAttribute('data-delete-title-key') || '');
      renderResult(lastResult, 'Removed correction.');
    }));
    root.querySelectorAll('.title-review-save-inline').forEach(btn => btn.addEventListener('click', () => {
      const editor = btn.closest('.title-review-inline-editor');
      const from = editor?.querySelector('.title-review-from')?.value || '';
      const to = editor?.querySelector('.title-review-to')?.value || '';
      if (saveCorrection(from, to)) renderResult(lastResult, `Saved correction: ${from} → ${to}`);
    }));
    root.querySelectorAll('.title-review-cancel-inline').forEach(btn => btn.addEventListener('click', () => {
      btn.closest('.title-review-inline-editor')?.remove();
    }));
  }
  function injectStyles() {
    if (document.getElementById('wnmuTitleReviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuTitleReviewStyles';
    style.textContent = `
      .title-review-panel{margin-bottom:1rem}.title-review-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}.title-review-head p{margin:.25rem 0 0;color:#536176}.title-review-output{font:14px/1.35 system-ui,sans-serif}.title-review-toolbar{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin:.65rem 0}.title-review-toolbar button,#scanTitleReviewBtn{padding:.5rem .75rem;border:1px solid #0d4f38;background:#0d4f38;color:#fff;border-radius:.5rem;font-weight:700;cursor:pointer}.title-review-group{border:1px solid #d2dbe7;border-radius:.7rem;background:#fff;margin:.75rem 0;padding:.55rem .75rem}.title-review-group summary{font-weight:800;cursor:pointer}.title-review-list{display:grid;gap:.35rem;margin:.65rem 0}.title-review-row{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;padding:.35rem .45rem;border-radius:.5rem;background:#f6f8fb}.title-review-row.saved{background:#eef7f1}.title-review-row.known{background:#fff9e8}.title-review-row.preferred{background:#edf7f0}.title-review-title{border:0;background:transparent;text-decoration:underline;cursor:pointer;color:#123c69;font-weight:700;text-align:left;padding:.15rem}.title-review-count{font-size:.85em;color:#536176}.title-review-arrow{color:#536176}.title-review-samples{font-size:.85em;color:#66758b}.title-review-variant{border:1px solid #e1e7f0;border-radius:.6rem;padding:.45rem;margin:.45rem 0;background:#fbfcfe}.title-review-preferred{font-size:.92em;margin-bottom:.35rem}.title-review-inline-editor{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr) auto auto;gap:.45rem;align-items:end;width:100%;padding:.55rem;background:#fff;border:1px solid #b8c3d2;border-radius:.55rem}.title-review-inline-editor label{display:flex;flex-direction:column;font-weight:700;font-size:.9em;gap:.2rem}.title-review-inline-editor input{padding:.5rem;border:1px solid #b8c3d2;border-radius:.45rem}.title-review-inline-editor button,.title-review-remove{border:1px solid #b8c3d2;background:#fff;border-radius:.45rem;padding:.45rem .55rem;cursor:pointer}.title-review-save-inline{background:#0d4f38!important;color:#fff!important;border-color:#0d4f38!important}.title-review-muted,.title-review-note{color:#536176}.title-review-remove{margin-left:auto}@media(max-width:850px){.title-review-head{display:block}.title-review-inline-editor{grid-template-columns:1fr}.title-review-remove{margin-left:0}}@media print{.title-review-panel{display:none!important}}
    `;
    document.head.appendChild(style);
  }
  function init() {
    injectStyles();
    const btn = document.getElementById('scanTitleReviewBtn');
    if (btn) btn.addEventListener('click', () => scanCurrent().catch(err => renderResult(lastResult, `Title review scan failed: ${err.message || err}`)));
    renderResult(null, `Review ${channelLabel()} title cleanup here before creating the Sales View.`);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
  window.WNMU_TITLE_REVIEW_VERSION = VERSION;
})();
