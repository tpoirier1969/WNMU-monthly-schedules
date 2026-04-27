(function () {
  const VERSION = 'v1.4.23-channel-specific-satellite-feed';
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

  function writeMarks(value) {
    const key = storageKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(value || {}));
  }

  function timeToSlot(time) {
    const [hh, mm] = String(time || '').split(':').map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
    return hh * 2 + (mm >= 30 ? 1 : 0);
  }

  function getWeekday(date) {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }

  function entryInfo(entryId) {
    const parts = String(entryId || '').split('__');
    return {
      date: parts[0] || '',
      time: parts[1] || '',
      weekday: getWeekday(parts[0] || '')
    };
  }

  function inRange(time, start, end) {
    const t = timeToSlot(time);
    return t >= timeToSlot(start) && t <= timeToSlot(end);
  }

  function matchRule(info, rule) {
    if (!info.date || !info.time) return false;
    if (rule.channel && cfg().channelCode !== rule.channel) return false;
    if (rule.weekdays && !rule.weekdays.includes(info.weekday)) return false;
    if (rule.times && !rule.times.includes(info.time)) return false;
    if (rule.range && !inRange(info.time, rule.range[0], rule.range[1])) return false;
    return true;
  }

  function rulesForChannel() {
    if (cfg().channelCode === '13.3') {
      return [
        // 13.3 / WNMU3PL
        // “Until 10am” is treated as cells starting 00:00 through 09:30.
        // “To midnight” is treated as cells starting through 23:30.
        { channel: '13.3', weekdays: ['Sunday'], range: ['00:00', '09:30'] },
        { channel: '13.3', weekdays: ['Sunday'], range: ['15:00', '23:30'] },

        { channel: '13.3', weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], range: ['00:00', '17:30'] },
        { channel: '13.3', weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], range: ['22:00', '23:30'] },

        { channel: '13.3', weekdays: ['Saturday'], range: ['00:00', '16:30'] },
        { channel: '13.3', weekdays: ['Saturday'], range: ['22:00', '23:30'] }
      ];
    }

    return [
      // 13.1 / WNMU1HD
      // Start-time based. A show that starts before 1:00 and runs into this period is not tagged.
      { channel: '13.1', weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], range: ['01:00', '06:30'] },
      { channel: '13.1', weekdays: ['Sunday'], range: ['01:00', '08:30'] },
      { channel: '13.1', weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], range: ['08:30', '13:30'] },

      { channel: '13.1', weekdays: ['Monday'], range: ['20:00', '21:00'] },
      { channel: '13.1', weekdays: ['Monday'], range: ['22:00', '23:30'] },
      { channel: '13.1', weekdays: ['Tuesday', 'Wednesday', 'Friday'], range: ['20:00', '23:30'] },

      { channel: '13.1', weekdays: ['Thursday'], times: ['23:00'] },
      { channel: '13.1', weekdays: ['Saturday'], times: ['13:30', '14:00', '23:00'] },
      { channel: '13.1', weekdays: ['Sunday'], times: ['20:00', '21:00', '22:00'] }
    ];
  }

  function defaultSatellite(entryId) {
    const info = entryInfo(entryId);
    return rulesForChannel().some(rule => matchRule(info, rule));
  }

  function explicitSatellite(entryId) {
    const state = readMarks()[entryId];
    if (!state || typeof state !== 'object') return null;

    const tags = state.tags && typeof state.tags === 'object' ? state.tags : state;

    if (tags[SATELLITE_OFF_TAG] === true || state[SATELLITE_OFF_TAG] === true || tags[SATELLITE_TAG] === false || state[SATELLITE_TAG] === false) return false;
    if (tags[SATELLITE_TAG] === true || state[SATELLITE_TAG] === true) return true;

    return null;
  }

  function effectiveSatellite(entryId) {
    const explicit = explicitSatellite(entryId);
    return explicit === null ? defaultSatellite(entryId) : explicit;
  }

  function setOverride(entryId, checked) {
    const key = storageKey();
    if (!key || !entryId) return;

    const all = readMarks();
    const state = all[entryId] && typeof all[entryId] === 'object' ? { ...all[entryId] } : {};
    const tags = state.tags && typeof state.tags === 'object' ? { ...state.tags } : {};

    const def = defaultSatellite(entryId);

    delete tags[SATELLITE_TAG];
    delete tags[SATELLITE_OFF_TAG];
    delete state[SATELLITE_TAG];
    delete state[SATELLITE_OFF_TAG];

    if (checked !== def) {
      if (checked) tags[SATELLITE_TAG] = true;
      else {
        tags[SATELLITE_TAG] = false;
        tags[SATELLITE_OFF_TAG] = true;
      }
    }

    if (Object.keys(tags).length) state.tags = tags;
    else delete state.tags;

    if (Object.keys(state).length) all[entryId] = state;
    else delete all[entryId];

    writeMarks(all);
    updateCheckbox();
    paintEntry(entryId);
  }

  function configure() {
    const c = cfg();
    if (!c) return;

    c.buildVersion = 'v1.4.23';

    // Satellite Feed is deliberately kept out of the heavy renderer tag list
    // and month rollup. It remains visible as a popup checkbox here.
    if (Array.isArray(c.tagOrder)) c.tagOrder = c.tagOrder.filter(key => key !== SATELLITE_TAG && key !== SATELLITE_OFF_TAG);
    if (Array.isArray(c.tagPriority)) c.tagPriority = c.tagPriority.filter(key => key !== SATELLITE_TAG && key !== SATELLITE_OFF_TAG);
    if (c.tagMeta) {
      delete c.tagMeta[SATELLITE_TAG];
      delete c.tagMeta[SATELLITE_OFF_TAG];
    }
    if (Array.isArray(c.autoTagRules)) {
      c.autoTagRules = c.autoTagRules.filter(rule => rule?.tag !== SATELLITE_TAG && rule?.tag !== SATELLITE_OFF_TAG);
    }

    window.WNMU_SATELLITE_FEED_TAG_VERSION = VERSION;
  }

  function injectStyles() {
    if (document.getElementById('wnmuSatelliteFeedV1423Styles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuSatelliteFeedV1423Styles';
    style.textContent = `
      :root { --satellite-feed: #e6e6e6; }

      .check-satellite-feed {
        background: color-mix(in srgb, var(--satellite-feed) 82%, white);
      }

      .program-cell.wnmu-satellite-feed:not(.marked) {
        background: var(--satellite-feed) !important;
      }

      .program-cell.wnmu-satellite-feed:not(.marked)::before {
        content: "Satellite Feed";
        position: absolute;
        right: 5px;
        bottom: 3px;
        font-size: 9px;
        color: rgba(0,0,0,.38);
        pointer-events: none;
        z-index: 1;
      }

      .program-cell.wnmu-satellite-feed.marked::before {
        display: none;
      }

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

  function ensureCheckbox() {
    const form = document.getElementById('contextMenuForm');
    if (!form) return;
    if (form.querySelector('input[name="satelliteFeed"]')) return;

    const label = document.createElement('label');
    label.className = 'check-row check-satellite-feed';
    label.innerHTML = '<input type="checkbox" name="satelliteFeed"> <span>Satellite Feed</span>';

    const rectTools = form.querySelector('.rect-tools');
    if (rectTools) form.insertBefore(label, rectTools);
    else form.appendChild(label);
  }

  function updateCheckbox() {
    const input = document.querySelector('input[name="satelliteFeed"]');
    if (!input || !selectedEntryId) return;
    input.checked = effectiveSatellite(selectedEntryId);
  }

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function paintEntry(entryId, root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(`.program-cell[data-entry-id="${cssEscape(entryId)}"]`).forEach(cell => {
      const on = effectiveSatellite(entryId);
      cell.classList.toggle('wnmu-satellite-feed', !!on);
      cell.dataset.satelliteFeed = on ? 'true' : 'false';
    });
  }

  function paintRoot(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.program-cell[data-entry-id]').forEach(cell => {
      const entryId = cell.dataset.entryId || '';
      const on = effectiveSatellite(entryId);
      cell.classList.toggle('wnmu-satellite-feed', !!on);
      cell.dataset.satelliteFeed = on ? 'true' : 'false';
    });
  }

  function installHooks() {
    document.addEventListener('contextmenu', event => {
      const cell = event.target.closest?.('.program-cell[data-entry-id]');
      if (!cell) return;
      selectedCell = cell;
      selectedEntryId = cell.dataset.entryId || '';
      window.setTimeout(() => {
        ensureCheckbox();
        updateCheckbox();
      }, 0);
    }, true);

    document.addEventListener('change', event => {
      const input = event.target.closest?.('input[name="satelliteFeed"]');
      if (!input || !selectedEntryId) return;
      event.stopPropagation();
      setOverride(selectedEntryId, !!input.checked);
    }, true);
  }

  function installObserver() {
    const host = document.getElementById('weekGrids') || document.body;
    const observer = new MutationObserver(mutations => {
      let root = null;
      for (const mutation of mutations) {
        if (mutation.addedNodes && mutation.addedNodes.length) {
          root = mutation.target;
          break;
        }
      }
      if (!root) return;
      requestAnimationFrame(() => paintRoot(root));
    });
    observer.observe(host, { childList: true, subtree: true });
    window.addEventListener('resize', () => requestAnimationFrame(() => paintRoot(document.getElementById('weekGrids') || document)));
  }

  function start() {
    configure();
    injectStyles();
    ensureCheckbox();
    installHooks();
    installObserver();
    requestAnimationFrame(() => paintRoot(document));

    const flag = document.getElementById('versionFlag');
    if (flag && !flag.textContent.includes('satellite channel rules')) {
      flag.textContent = `${flag.textContent} • satellite channel rules 1.4.23`;
    }
  }

  configure();
  injectStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
