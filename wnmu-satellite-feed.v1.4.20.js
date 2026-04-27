(function () {
  const VERSION = 'v1.4.20-satellite-feed-visual-fast';
  const TAG = 'satelliteFeed';
  const OFF_TAG = 'satelliteFeedOff';
  const SATELLITE_COLOR = '#e6e6e6';
  let selectedEntryId = '';
  let paintTimer = null;

  function getConfig() {
    return window.WNMU_MONTHLY_PAGE_CONFIG || null;
  }

  function getStorageKey() {
    return getConfig()?.storageKey || '';
  }

  function readJson(key, fallback) {
    if (!key) return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(value || {}));
  }

  function marks() {
    return readJson(getStorageKey(), {});
  }

  function timeToSlot(time) {
    const [hh, mm] = String(time || '').split(':').map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
    return hh * 2 + (mm >= 30 ? 1 : 0);
  }

  function weekday(date) {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }

  function entryInfoFromId(entryId) {
    const parts = String(entryId || '').split('__');
    return { date: parts[0] || '', time: parts[1] || '', weekday: weekday(parts[0] || '') };
  }

  function inRange(time, start, end) {
    const t = timeToSlot(time);
    return t >= timeToSlot(start) && t <= timeToSlot(end);
  }

  function matchesRule(info, rule) {
    if (!info.date || !info.time) return false;
    if (rule.channel && getConfig()?.channelCode !== rule.channel) return false;
    if (rule.weekdays && !rule.weekdays.includes(info.weekday)) return false;
    if (rule.times && !rule.times.includes(info.time)) return false;
    if (rule.range && !inRange(info.time, rule.range[0], rule.range[1])) return false;
    return true;
  }

  function satelliteRules() {
    const base = [
      // Start-time based. A show that starts before 1:00 and runs into this period is not tagged.
      { weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], range: ['01:00', '06:30'] },
      { weekdays: ['Sunday'], range: ['01:00', '08:30'] },

      { weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], range: ['08:30', '13:30'] },

      { weekdays: ['Monday'], range: ['20:00', '21:00'] },
      { weekdays: ['Monday'], range: ['22:00', '23:30'] },
      { weekdays: ['Tuesday', 'Wednesday', 'Friday'], range: ['20:00', '23:30'] }
    ];

    const only131 = [
      { channel: '13.1', weekdays: ['Thursday'], times: ['23:00'] },
      { channel: '13.1', weekdays: ['Saturday'], times: ['13:30', '14:00', '23:00'] },
      { channel: '13.1', weekdays: ['Sunday'], times: ['20:00', '21:00', '22:00'] }
    ];

    return base.concat(only131);
  }

  function defaultSatelliteForEntry(entryId) {
    const info = entryInfoFromId(entryId);
    return satelliteRules().some(rule => matchesRule(info, rule));
  }

  function explicitSatelliteValue(entryId) {
    const state = marks()[entryId];
    if (!state || typeof state !== 'object') return null;
    const tags = state.tags && typeof state.tags === 'object' ? state.tags : state;
    if (tags[OFF_TAG] === true || state[OFF_TAG] === true || state[TAG] === false) return false;
    if (tags[TAG] === true || state[TAG] === true) return true;
    return null;
  }

  function effectiveSatelliteForEntry(entryId) {
    const explicit = explicitSatelliteValue(entryId);
    if (explicit !== null) return explicit;
    return defaultSatelliteForEntry(entryId);
  }

  function cleanStateIfEmpty(allMarks, entryId) {
    const state = allMarks[entryId];
    if (!state || typeof state !== 'object') return;
    const tags = state.tags && typeof state.tags === 'object' ? state.tags : null;
    if (tags) {
      delete tags[TAG];
      delete tags[OFF_TAG];
      if (!Object.keys(tags).length) delete state.tags;
    } else {
      delete state[TAG];
      delete state[OFF_TAG];
    }

    const hasRect = !!state.rectNote;
    const hasNote = !!state.note || !!state.whiteout;
    const remainingTags = state.tags && typeof state.tags === 'object'
      ? Object.values(state.tags).some(v => v === true || v === false)
      : Object.values(state).some(v => v === true);
    if (!hasRect && !hasNote && !remainingTags && !Object.keys(state).length) delete allMarks[entryId];
  }

  function setSatelliteOverride(entryId, checked) {
    const key = getStorageKey();
    if (!key || !entryId) return;
    const all = marks();
    const state = all[entryId] && typeof all[entryId] === 'object' ? { ...all[entryId] } : {};
    const tags = state.tags && typeof state.tags === 'object' ? { ...state.tags } : {};

    const defaultValue = defaultSatelliteForEntry(entryId);
    delete tags[TAG];
    delete tags[OFF_TAG];
    delete state[TAG];
    delete state[OFF_TAG];

    if (checked !== defaultValue) {
      if (checked) tags[TAG] = true;
      else {
        // Truthy off-marker keeps the override eligible for Supabase mirroring.
        tags[OFF_TAG] = true;
        tags[TAG] = false;
      }
    }

    if (Object.keys(tags).length) state.tags = tags;
    else delete state.tags;

    all[entryId] = state;
    if (!Object.keys(state).length) delete all[entryId];
    writeJson(key, all);
    schedulePaint();
  }

  function ensureConfigIsLightweight() {
    const cfg = getConfig();
    if (!cfg) return;
    cfg.buildVersion = 'v1.4.20';

    // v1.4.20 intentionally does NOT add Satellite Feed to tagOrder.
    // That keeps rollups and checkbox changes fast; the gray shading is handled
    // as a lightweight visual layer instead of hundreds of ordinary checked tags.
    if (Array.isArray(cfg.tagOrder)) cfg.tagOrder = cfg.tagOrder.filter(key => key !== TAG && key !== OFF_TAG);
    if (Array.isArray(cfg.tagPriority)) cfg.tagPriority = cfg.tagPriority.filter(key => key !== TAG && key !== OFF_TAG);
    if (cfg.tagMeta) {
      delete cfg.tagMeta[TAG];
      delete cfg.tagMeta[OFF_TAG];
    }
    if (Array.isArray(cfg.autoTagRules)) cfg.autoTagRules = cfg.autoTagRules.filter(rule => rule?.tag !== TAG && rule?.tag !== OFF_TAG);

    window.WNMU_SATELLITE_FEED_TAG_VERSION = VERSION;
  }

  function injectStyles() {
    if (document.getElementById('wnmuSatelliteFeedV1420Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuSatelliteFeedV1420Styles';
    style.textContent = `
      :root {
        --satellite-feed: ${SATELLITE_COLOR};
      }

      .check-satellite-feed {
        background: color-mix(in srgb, var(--satellite-feed) 82%, white);
      }

      .program-cell.wnmu-satellite-feed:not(.marked) {
        background: var(--satellite-feed) !important;
      }

      .program-cell.wnmu-satellite-feed:not(.marked) .program-content {
        background: transparent;
      }

      .program-cell.wnmu-satellite-feed:not(.marked)::before {
        content: "Satellite Feed";
        position: absolute;
        right: 5px;
        bottom: 3px;
        font-size: 9px;
        color: rgba(0,0,0,.42);
        z-index: 1;
        pointer-events: none;
      }

      .program-cell.wnmu-satellite-feed.marked::before {
        content: "";
        display: none;
      }

      /* More consistent grid density: episode and length share one compact line. */
      .screen-week-grid .program-title {
        margin-bottom: 2px;
        line-height: 1.12;
      }

      .screen-week-grid .program-episode,
      .screen-week-grid .program-duration {
        display: inline;
        font-size: 11px;
        line-height: 1.08;
      }

      .screen-week-grid .program-episode + .program-duration::before {
        content: " • ";
      }

      .screen-week-grid .program-tags {
        margin-top: 3px;
        gap: 3px;
      }

      .screen-week-grid .tag-pill {
        padding: 2px 5px;
      }

      .screen-week-grid .program-cell {
        min-height: 52px;
      }

      @media print {
        .program-cell.wnmu-satellite-feed:not(.marked) {
          background: #e6e6e6 !important;
        }
        .program-cell.wnmu-satellite-feed:not(.marked)::before {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function insertCheckbox() {
    const form = document.getElementById('contextMenuForm');
    if (!form || form.querySelector('input[name="satelliteFeed"]')) return;

    const rectTools = form.querySelector('.rect-tools');
    const label = document.createElement('label');
    label.className = 'check-row check-satellite-feed';
    label.innerHTML = '<input type="checkbox" name="satelliteFeed"> <span>Satellite Feed</span>';

    if (rectTools) form.insertBefore(label, rectTools);
    else form.appendChild(label);
  }

  function updateMenuCheckbox() {
    const input = document.querySelector('input[name="satelliteFeed"]');
    if (!input || !selectedEntryId) return;
    input.checked = effectiveSatelliteForEntry(selectedEntryId);
  }

  function installMenuHooks() {
    document.addEventListener('contextmenu', event => {
      const cell = event.target.closest?.('.program-cell[data-entry-id]');
      if (!cell) return;
      selectedEntryId = cell.dataset.entryId || '';
      window.setTimeout(() => {
        insertCheckbox();
        updateMenuCheckbox();
      }, 0);
    }, true);

    document.addEventListener('change', event => {
      const input = event.target.closest?.('input[name="satelliteFeed"]');
      if (!input || !selectedEntryId) return;
      event.stopPropagation();
      setSatelliteOverride(selectedEntryId, !!input.checked);
    }, true);
  }

  function paintSatelliteCells() {
    document.querySelectorAll('.program-cell[data-entry-id]').forEach(cell => {
      const entryId = cell.dataset.entryId || '';
      const on = effectiveSatelliteForEntry(entryId);
      cell.classList.toggle('wnmu-satellite-feed', !!on);
      cell.dataset.satelliteFeed = on ? 'true' : 'false';
    });
  }

  function schedulePaint() {
    window.clearTimeout(paintTimer);
    paintTimer = window.setTimeout(paintSatelliteCells, 80);
  }

  function installObservers() {
    const host = document.getElementById('weekGrids') || document.body;
    const observer = new MutationObserver(schedulePaint);
    observer.observe(host, { childList: true, subtree: true });
    window.addEventListener('resize', schedulePaint);
    window.setInterval(schedulePaint, 4000);
  }

  function start() {
    ensureConfigIsLightweight();
    injectStyles();
    insertCheckbox();
    installMenuHooks();
    installObservers();
    schedulePaint();

    const flag = document.getElementById('versionFlag');
    if (flag && !flag.textContent.includes('satellite visual')) {
      flag.textContent = `${flag.textContent} • satellite visual 1.4.20`;
    }
  }

  ensureConfigIsLightweight();
  injectStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
