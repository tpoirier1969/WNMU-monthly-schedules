(function () {
  const VERSION = 'v1.4.22-lite-checkbox-updates';
  const SATELLITE_TAG = 'satelliteFeed';
  const SATELLITE_OFF_TAG = 'satelliteFeedOff';
  let selectedEntryId = '';
  let selectedCell = null;
  let storageWriteTimer = null;
  let pendingWrite = null;

  function cfg() {
    return window.WNMU_MONTHLY_PAGE_CONFIG || {};
  }

  function storageKey() {
    return cfg().storageKey || '';
  }

  function tagOrder() {
    return Array.isArray(cfg().tagOrder) ? cfg().tagOrder.filter(k => k !== SATELLITE_TAG && k !== SATELLITE_OFF_TAG) : [];
  }

  function tagPriority() {
    return Array.isArray(cfg().tagPriority) ? cfg().tagPriority.filter(k => k !== SATELLITE_TAG && k !== SATELLITE_OFF_TAG) : tagOrder();
  }

  function tagMeta() {
    return cfg().tagMeta || {};
  }

  function readMarks() {
    const key = storageKey();
    if (!key) return {};
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeMarksNow(allMarks) {
    const key = storageKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(allMarks || {}));
  }

  function debouncedWrite(allMarks) {
    pendingWrite = allMarks;
    window.clearTimeout(storageWriteTimer);
    storageWriteTimer = window.setTimeout(() => {
      writeMarksNow(pendingWrite || {});
      pendingWrite = null;
    }, 120);
  }

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeState(raw) {
    return raw && typeof raw === 'object' ? { ...raw } : {};
  }

  function getState(entryId) {
    return normalizeState(readMarks()[entryId]);
  }

  function currentMenuTags() {
    const out = {};
    const form = document.getElementById('contextMenuForm');
    if (!form) return out;

    for (const key of tagOrder()) {
      const input = form.querySelector(`input[name="${cssEscape(key)}"]`);
      if (input) out[key] = !!input.checked;
    }

    return out;
  }

  function stateTagsFromStorage(entryId) {
    const state = getState(entryId);
    const rawTags = state.tags && typeof state.tags === 'object' ? state.tags : state;
    const out = {};
    for (const key of tagOrder()) {
      if (typeof rawTags[key] === 'boolean') out[key] = rawTags[key];
    }
    return out;
  }

  function saveTagsForEntry(entryId, nextTags) {
    if (!entryId) return;
    const all = readMarks();
    const state = normalizeState(all[entryId]);
    const existingTags = state.tags && typeof state.tags === 'object' ? { ...state.tags } : {};

    for (const key of tagOrder()) delete existingTags[key];

    // Store the visible checkbox state directly. This avoids recomputing defaults
    // and lets the immediate cell update stay local.
    for (const key of tagOrder()) {
      existingTags[key] = !!nextTags[key];
    }

    if (Object.keys(existingTags).length) state.tags = existingTags;
    else delete state.tags;

    if (Object.keys(state).length) all[entryId] = state;
    else delete all[entryId];

    debouncedWrite(all);
  }

  function dominantColor(tags) {
    const active = Object.keys(tags || {}).filter(key => tags[key]);
    if (!active.length) return '#fff';
    const priority = tagPriority();
    const dominant = priority.find(key => active.includes(key)) || active[0];
    return tagMeta()[dominant]?.color || '#fff';
  }

  function makeTagPill(key) {
    const meta = tagMeta()[key] || { label: key, color: '#ddd' };
    const span = document.createElement('span');
    span.className = 'tag-pill';
    span.style.setProperty('--tag-color', meta.color || '#ddd');
    span.textContent = meta.label || key;
    return span;
  }

  function updateCellVisual(cell, tags) {
    if (!cell) return;
    const active = tagOrder().filter(key => tags[key]);
    cell.classList.toggle('marked', active.length > 0);
    cell.style.setProperty('--mark-background', dominantColor(tags));

    const content = cell.querySelector('.program-content');
    if (!content) return;

    let tagsBox = content.querySelector('.program-tags');
    if (!active.length) {
      if (tagsBox) tagsBox.remove();
      return;
    }

    if (!tagsBox) {
      tagsBox = document.createElement('div');
      tagsBox.className = 'program-tags';
      content.appendChild(tagsBox);
    }

    tagsBox.innerHTML = '';
    active.slice(0, 5).forEach(key => tagsBox.appendChild(makeTagPill(key)));
  }

  function updateRollupLineHints(entryId, tags) {
    // This is intentionally tiny. It updates visible cells immediately, but does
    // not rebuild every weekly/monthly rollup on each click. The next full page
    // load or renderer rebuild will reflect saved changes.
    const activeLabels = tagOrder()
      .filter(key => tags[key])
      .map(key => tagMeta()[key]?.label || key)
      .join(', ');
    document.querySelectorAll(`[data-entry-id="${cssEscape(entryId)}"]`).forEach(cell => {
      cell.dataset.fastTags = activeLabels;
    });
  }

  function applyMenuTagsToCurrentCell() {
    if (!selectedEntryId) return;
    const tags = currentMenuTags();
    saveTagsForEntry(selectedEntryId, tags);

    document.querySelectorAll(`.program-cell[data-entry-id="${cssEscape(selectedEntryId)}"]`).forEach(cell => {
      updateCellVisual(cell, tags);
    });

    updateRollupLineHints(selectedEntryId, tags);
    window.dispatchEvent(new CustomEvent('wnmu:lite-checkbox-updated', {
      detail: { entryId: selectedEntryId, tags }
    }));
  }

  function overrideMenuFromStorage(entryId) {
    const form = document.getElementById('contextMenuForm');
    if (!form || !entryId) return;

    const stored = stateTagsFromStorage(entryId);
    if (!Object.keys(stored).length) return;

    for (const [key, value] of Object.entries(stored)) {
      const input = form.querySelector(`input[name="${cssEscape(key)}"]`);
      if (input) input.checked = !!value;
    }
  }

  function installHooks() {
    document.addEventListener('contextmenu', event => {
      const cell = event.target.closest?.('.program-cell[data-entry-id]');
      if (!cell) return;
      selectedCell = cell;
      selectedEntryId = cell.dataset.entryId || '';
      window.setTimeout(() => overrideMenuFromStorage(selectedEntryId), 0);
    }, true);

    document.addEventListener('change', event => {
      const input = event.target.closest?.('#contextMenuForm input[type="checkbox"]');
      if (!input) return;

      // Satellite Feed is handled by the satellite script because it is a visual
      // overlay tag, not a normal planning tag.
      if (input.name === SATELLITE_TAG || input.name === SATELLITE_OFF_TAG) return;

      if (!selectedEntryId) return;

      // Prevent the older renderer from rerendering the whole week/rollup for a
      // single checkbox click. This is the actual speed fix.
      event.stopPropagation();
      event.stopImmediatePropagation();

      applyMenuTagsToCurrentCell();
    }, true);

    // If the old renderer does rebuild a week for another reason, reapply saved
    // local overrides only to cells that have explicitly stored tags.
    const host = document.getElementById('weekGrids') || document.body;
    const observer = new MutationObserver(mutations => {
      let sawCell = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes && mutation.addedNodes.length) {
          sawCell = true;
          break;
        }
      }
      if (!sawCell) return;

      window.requestAnimationFrame(() => {
        const all = readMarks();
        Object.entries(all).forEach(([entryId, state]) => {
          const tags = stateTagsFromStorage(entryId);
          if (!Object.keys(tags).length) return;
          document.querySelectorAll(`.program-cell[data-entry-id="${cssEscape(entryId)}"]`).forEach(cell => {
            updateCellVisual(cell, tags);
          });
        });
      });
    });
    observer.observe(host, { childList: true, subtree: true });
  }

  function injectStyles() {
    if (document.getElementById('wnmuLiteCheckboxV1422Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuLiteCheckboxV1422Styles';
    style.textContent = `
      .screen-week-grid .program-cell {
        contain: layout style;
      }

      .screen-week-grid .program-title {
        line-height: 1.1;
      }

      .screen-week-grid .program-episode,
      .screen-week-grid .program-duration {
        display: inline;
      }

      .screen-week-grid .program-episode + .program-duration::before {
        content: " • ";
      }
    `;
    document.head.appendChild(style);
  }

  function start() {
    injectStyles();
    installHooks();

    const flag = document.getElementById('versionFlag');
    if (flag && !flag.textContent.includes('lite checkboxes')) {
      flag.textContent = `${flag.textContent} • lite checkboxes 1.4.22`;
    }

    window.WNMU_LITE_CHECKBOX_VERSION = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
