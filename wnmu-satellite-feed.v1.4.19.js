(function () {
  const VERSION = 'v1.4.19-satellite-feed-default-tag';
  const TAG = 'satelliteFeed';

  function ensureConfig() {
    const cfg = window.WNMU_MONTHLY_PAGE_CONFIG;
    if (!cfg) return null;

    cfg.buildVersion = 'v1.4.19';

    cfg.tagOrder = Array.isArray(cfg.tagOrder) ? cfg.tagOrder.filter(key => key !== TAG) : [];
    cfg.tagOrder.push(TAG);

    cfg.tagPriority = Array.isArray(cfg.tagPriority) ? cfg.tagPriority.filter(key => key !== TAG) : [];
    // Lowest-priority color: every other checked tag supersedes Satellite Feed.
    cfg.tagPriority.push(TAG);

    cfg.tagMeta = cfg.tagMeta || {};
    cfg.tagMeta[TAG] = {
      label: 'Satellite Feed',
      color: 'var(--satellite-feed)'
    };

    const newRules = [
      // Start-time based. A show that starts before 1:00 and runs into this block is NOT tagged.
      { tag: TAG, weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], range: ['01:00', '06:30'] },
      { tag: TAG, weekdays: ['Sunday'], range: ['01:00', '08:30'] },

      { tag: TAG, weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], range: ['08:30', '13:30'] },

      { tag: TAG, weekdays: ['Monday'], range: ['20:00', '21:00'] },
      { tag: TAG, weekdays: ['Monday'], range: ['22:00', '23:30'] },

      { tag: TAG, weekdays: ['Tuesday', 'Wednesday', 'Friday'], range: ['20:00', '23:30'] }
    ];

    const oldRules = Array.isArray(cfg.autoTagRules) ? cfg.autoTagRules.filter(rule => rule?.tag !== TAG) : [];
    cfg.autoTagRules = oldRules.concat(newRules);

    window.WNMU_SATELLITE_FEED_TAG_VERSION = VERSION;
    return cfg;
  }

  function injectStyles() {
    if (document.getElementById('wnmuSatelliteFeedStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuSatelliteFeedStyles';
    style.textContent = `
      :root {
        --satellite-feed: #e6e6e6;
      }
      .check-satellite-feed {
        background: color-mix(in srgb, var(--satellite-feed) 82%, white);
      }
    `;
    document.head.appendChild(style);
  }

  function insertCheckbox() {
    const form = document.getElementById('contextMenuForm');
    const rectTools = form?.querySelector('.rect-tools');
    if (!form || form.querySelector('input[name="satelliteFeed"]')) return;

    const label = document.createElement('label');
    label.className = 'check-row check-satellite-feed';
    label.innerHTML = '<input type="checkbox" name="satelliteFeed"> <span>Satellite Feed</span>';

    if (rectTools) form.insertBefore(label, rectTools);
    else form.appendChild(label);
  }

  function start() {
    ensureConfig();
    injectStyles();
    insertCheckbox();
  }

  ensureConfig();
  injectStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
