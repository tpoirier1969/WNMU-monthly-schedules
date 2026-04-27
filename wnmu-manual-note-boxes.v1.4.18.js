(function () {
  'use strict';

  const VERSION = 'v1.4.18-event-driven-program-note-boxes';
  const DURATIONS = [30, 60, 90, 120, 150, 180, 210];
  let selectedCell = null;
  let selectedId = '';
  let storagePatched = false;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function storageKey() { return cfg().storageKey || ''; }
  function tagOrder() { return Array.isArray(cfg().tagOrder) ? cfg().tagOrder : []; }
  function tagMeta(key) { return (cfg().tagMeta && cfg().tagMeta[key]) || { label: key, color: '#eee' }; }
  function metaKey() { return storageKey() ? `${storageKey()}::manualRectMeta.v1.4.18` : ''; }
  function esc(str) { return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
  function css(str) { return window.CSS && CSS.escape ? CSS.escape(str) : String(str).replace(/["\\]/g, '\\$&'); }
  function readJson(key, fallback = {}) { try { const raw = key && localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function writeJson(key, value) { if (key) localStorage.setItem(key, JSON.stringify(value || {})); }
  function marks() { return readJson(storageKey(), {}); }
  function meta() { return readJson(metaKey(), {}); }
  function nearestDuration(value) {
    const n = Number(value) || 30;
    return DURATIONS.reduce((best, cur) => Math.abs(cur - n) < Math.abs(best - n) ? cur : best, DURATIONS[0]);
  }
  function rectFor(id) {
    const state = marks()[id] || {};
    const rect = state.rectNote;
    if (!rect) return null;
    return { ...rect, ...(meta()[id] || {}) };
  }
  function activeTagsFor(id) {
    const state = marks()[id] || {};
    const tags = state.tags && typeof state.tags === 'object' ? state.tags : state;
    return tagOrder().filter(key => tags && tags[key] === true);
  }
  function menuCheckedTags() {
    const menu = document.getElementById('contextMenu');
    return tagOrder().filter(key => !!menu?.querySelector(`input[name="${css(key)}"]`)?.checked);
  }

  function ensureControls() {
    const tools = document.querySelector('.rect-tools');
    if (!tools || document.getElementById('manualRectDurationTools')) return;
    const panel = document.createElement('div');
    panel.id = 'manualRectDurationTools';
    panel.className = 'manual-rect-duration-tools';
    panel.innerHTML = `
      <div class="manual-rect-label">Box note length</div>
      <div class="manual-rect-duration-options">
        ${DURATIONS.map(n => `<label class="manual-rect-pill"><input type="radio" name="manualRectDuration" value="${n}"><span>${n}</span></label>`).join('')}
      </div>
      <div class="manual-rect-label">Anchor</div>
      <div class="manual-rect-anchor-options">
        <label class="manual-rect-pill"><input type="radio" name="manualRectAnchor" value="left" checked><span>upper left</span></label>
        <label class="manual-rect-pill"><input type="radio" name="manualRectAnchor" value="right"><span>upper right</span></label>
      </div>
      <label class="manual-rect-label" for="manualRectText">Box note text</label>
      <textarea id="manualRectText" class="manual-rect-text" rows="3" placeholder="Type the note to draw over this schedule cell"></textarea>
      <div class="manual-rect-help">The box starts at the top of the cell you right-clicked. Height is calculated from the actual 30-minute grid rows.</div>
    `;
    tools.insertBefore(panel, tools.querySelector('.rect-actions') || null);
    const drawBtn = document.getElementById('drawRectBtn');
    if (drawBtn) drawBtn.textContent = 'Save box note';
  }

  function setControlsFor(id, cell) {
    ensureControls();
    const rect = id ? rectFor(id) : null;
    const defaultDuration = Math.max(1, Number(cell?.rowSpan || 1)) * 30;
    const duration = nearestDuration(rect?.durationMin || defaultDuration);
    const anchor = rect?.anchor === 'right' ? 'right' : 'left';
    const durationInput = document.querySelector(`input[name="manualRectDuration"][value="${duration}"]`);
    if (durationInput) durationInput.checked = true;
    const anchorInput = document.querySelector(`input[name="manualRectAnchor"][value="${anchor}"]`);
    if (anchorInput) anchorInput.checked = true;
    const text = document.getElementById('manualRectText');
    if (text) text.value = rect?.text || '';
    const status = document.getElementById('rectStatus');
    if (status) {
      status.textContent = rect ? `Box note saved. Length: ${duration} min. Anchor: upper ${anchor}.` : 'No box note on this program yet.';
    }
  }

  function patchStorageMerge() {
    if (storagePatched) return;
    storagePatched = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      try {
        if (key === storageKey()) {
          const extra = meta();
          const obj = JSON.parse(String(value || '{}'));
          Object.entries(extra).forEach(([id, noteMeta]) => {
            if (obj[id] && obj[id].rectNote) obj[id].rectNote = { ...obj[id].rectNote, ...noteMeta };
          });
          value = JSON.stringify(obj);
        }
      } catch {}
      return original.apply(this, [key, value]);
    };
  }

  function durationHeightForCell(cell, durationMin) {
    const rect = cell?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return 22;
    const slots = Math.max(1, Math.round(Number(durationMin || 30) / 30));
    const row = cell.closest('tr');
    const table = cell.closest('table.screen-week-grid');
    const rows = table ? Array.from(table.querySelectorAll('tbody tr')) : [];
    const rowIndex = rows.indexOf(row);
    if (rowIndex >= 0 && rows.length) {
      const endRow = rows[Math.min(rows.length - 1, rowIndex + slots - 1)];
      const endRect = endRow?.getBoundingClientRect?.();
      if (endRect && endRect.bottom > rect.top) return Math.max(22, Math.round(endRect.bottom - rect.top - 4));
    }
    const rowSpan = Math.max(1, Number(cell.rowSpan || 1));
    const slotHeight = rect.height / rowSpan;
    return Math.max(22, Math.round(slotHeight * slots - 4));
  }

  function ensureLayer() {
    let layer = document.getElementById('wnmuProgramNoteLayerV1418');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'wnmuProgramNoteLayerV1418';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }
  function removeOverlayFor(id) {
    if (!id) return;
    document.querySelectorAll(`.wnmu-program-note-v1418[data-entry-id="${css(id)}"]`).forEach(el => el.remove());
  }
  function renderOverlay(cell, rect) {
    if (!cell || !rect) return;
    const id = cell.dataset.entryId || '';
    if (!id) return;
    removeOverlayFor(id);
    const cr = cell.getBoundingClientRect();
    if (!cr.width || !cr.height) return;
    const duration = nearestDuration(rect.durationMin || Math.max(1, Number(cell.rowSpan || 1)) * 30);
    const height = durationHeightForCell(cell, duration);
    const width = Math.max(46, Math.round(cr.width - 8));
    const left = rect.anchor === 'right' ? Math.round(cr.right + window.scrollX - width - 4) : Math.round(cr.left + window.scrollX + 4);
    const top = Math.round(cr.top + window.scrollY + 2);
    const tagKeys = menuCheckedTags().length && selectedId === id ? menuCheckedTags() : activeTagsFor(id);
    const tagHtml = tagKeys.length ? `<div class="wnmu-program-note-tags">${tagKeys.map(key => `<span style="--tag-color:${esc(tagMeta(key).color || '#eee')}">${esc(tagMeta(key).label || key)}</span>`).join('')}</div>` : '';
    const box = document.createElement('div');
    box.className = 'wnmu-program-note-v1418';
    box.dataset.entryId = id;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    box.innerHTML = `${tagHtml}<div class="wnmu-program-note-text">${esc(rect.text || '')}</div><div class="wnmu-program-note-duration">${duration} min</div>`;
    ensureLayer().appendChild(box);
  }
  function renderExistingProgramNotesOnce() {
    const state = marks();
    Object.entries(state).forEach(([id, value]) => {
      if (!value?.rectNote) return;
      const cell = document.querySelector(`.program-cell[data-entry-id="${css(id)}"]`);
      if (!cell) return;
      renderOverlay(cell, rectFor(id));
    });
  }

  function saveProgramNote() {
    if (!selectedId || !selectedCell || !storageKey()) return false;
    const duration = nearestDuration(document.querySelector('input[name="manualRectDuration"]:checked')?.value || 30);
    const anchor = document.querySelector('input[name="manualRectAnchor"]:checked')?.value === 'right' ? 'right' : 'left';
    const text = String(document.getElementById('manualRectText')?.value || '').trim();
    const state = marks();
    const extra = meta();
    const entry = state[selectedId] && typeof state[selectedId] === 'object' ? state[selectedId] : {};
    entry.rectNote = { x: anchor === 'right' ? 6 : 4, y: 4, w: 90, h: 90, text, durationMin: duration, anchor, manualDuration: true, anchorMode: anchor === 'right' ? 'upper-right' : 'upper-left' };
    state[selectedId] = entry;
    extra[selectedId] = { durationMin: duration, anchor, manualDuration: true, anchorMode: entry.rectNote.anchorMode };
    writeJson(metaKey(), extra);
    writeJson(storageKey(), state);
    setControlsFor(selectedId, selectedCell);
    renderOverlay(selectedCell, entry.rectNote);
    const menu = document.getElementById('contextMenu');
    if (menu) { menu.classList.add('hidden'); menu.setAttribute('aria-hidden', 'true'); }
    window.WNMU_LAST_PROGRAM_NOTE_SAVE = { entryId: selectedId, durationMin: duration, anchor, savedAt: new Date().toISOString() };
    return true;
  }
  function clearProgramNote() {
    if (!selectedId || !storageKey()) return false;
    const state = marks();
    const extra = meta();
    if (state[selectedId]) delete state[selectedId].rectNote;
    delete extra[selectedId];
    writeJson(metaKey(), extra);
    writeJson(storageKey(), state);
    removeOverlayFor(selectedId);
    setControlsFor(selectedId, selectedCell);
    return true;
  }

  function injectStyles() {
    if (document.getElementById('wnmuManualNoteBoxesV1418Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuManualNoteBoxesV1418Styles';
    style.textContent = `
      .manual-rect-duration-tools{border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:10px;margin:10px 0;background:rgba(255,255,255,.06)}
      .manual-rect-label{font-size:12px;font-weight:800;margin:6px 0 5px}.manual-rect-duration-options,.manual-rect-anchor-options{display:flex;flex-wrap:wrap;gap:5px}.manual-rect-pill{display:inline-flex;align-items:center;gap:3px;font-size:12px;border:1px solid rgba(255,255,255,.24);border-radius:999px;padding:4px 7px;cursor:pointer}.manual-rect-pill input{margin:0}.manual-rect-text{width:100%;box-sizing:border-box;border-radius:8px;border:1px solid rgba(255,255,255,.28);padding:7px;resize:vertical;font:13px/1.3 system-ui,sans-serif;color:#111;background:#fff}.manual-rect-help{margin-top:6px;font-size:11px;opacity:.75;line-height:1.25}
      body.wnmu-program-note-overlay-active .program-cell>.draw-rect-note{display:none!important}#wnmuProgramNoteLayerV1418{position:absolute;left:0;top:0;width:0;height:0;z-index:2147482998;pointer-events:none}.wnmu-program-note-v1418{position:absolute;box-sizing:border-box;background:rgba(255,255,255,.96);color:#111;border:2px solid rgba(10,20,40,.78);border-radius:4px;box-shadow:0 2px 7px rgba(0,0,0,.22);overflow:hidden;padding:4px 5px 14px;font:12px/1.2 system-ui,sans-serif;pointer-events:none}.wnmu-program-note-tags{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:3px}.wnmu-program-note-tags span{font-size:8px;line-height:1;background:var(--tag-color,#eee);border:1px solid #aaa;border-radius:999px;padding:2px 4px}.wnmu-program-note-text{white-space:normal;overflow:hidden}.wnmu-program-note-duration{position:absolute;right:4px;bottom:2px;font-size:9px;opacity:.58}
      @media print{#wnmuProgramNoteLayerV1418{display:none!important}.manual-rect-duration-tools{display:none!important}}
    `;
    document.head.appendChild(style);
  }
  function installHandlers() {
    document.addEventListener('contextmenu', event => {
      const cell = event.target.closest?.('.program-cell[data-entry-id]');
      if (!cell) return;
      selectedCell = cell;
      selectedId = cell.dataset.entryId || '';
      window.setTimeout(() => setControlsFor(selectedId, selectedCell), 0);
    }, true);
    document.addEventListener('click', event => {
      if (event.target.closest?.('#drawRectBtn')) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); saveProgramNote(); return;
      }
      if (event.target.closest?.('#clearRectBtn,#clearMarksBtn')) {
        clearProgramNote();
      }
    }, true);
  }
  function setVersionHint() {
    window.WNMU_MANUAL_NOTE_BOXES_VERSION = VERSION;
    const flag = document.getElementById('versionFlag');
    if (flag && !flag.textContent.includes('program note boxes')) flag.textContent = `${flag.textContent} • program note boxes 1.4.18`;
  }
  function start() {
    document.body.classList.add('wnmu-program-note-overlay-active');
    injectStyles(); ensureControls(); patchStorageMerge(); installHandlers(); setVersionHint();
    window.setTimeout(renderExistingProgramNotesOnce, 1000);
    window.setTimeout(renderExistingProgramNotesOnce, 2500);
    window.setTimeout(renderExistingProgramNotesOnce, 5000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
