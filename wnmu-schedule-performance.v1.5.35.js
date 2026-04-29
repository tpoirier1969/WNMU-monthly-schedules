(function () {
  'use strict';
  const VERSION = 'v1.5.35-episode-field-width';
  window.WNMU_SCHEDULE_PERFORMANCE_VERSION = VERSION;
  window.WNMU_DISABLE_INLINE_MONTH_ROLLUP = true;

  function looksLikeMonthRollupCallback(cb) {
    try {
      const text = String(cb || '');
      return text.includes('renderMonthRollup') || text.includes('checked-item rollup') || text.includes('monthRollup');
    } catch {
      return false;
    }
  }

  // The old shared renderer has the month rollup inside its private closure.
  // Rather than touching tag/note behavior, block only that scheduled callback and any attempted append into #monthRollup.
  const originalRequestIdleCallback = window.requestIdleCallback;
  if (typeof originalRequestIdleCallback === 'function' && !window.__WNMU_ROLLUP_RIC_PATCHED__) {
    window.__WNMU_ROLLUP_RIC_PATCHED__ = true;
    window.requestIdleCallback = function patchedRequestIdleCallback(callback, options) {
      if (window.WNMU_DISABLE_INLINE_MONTH_ROLLUP && looksLikeMonthRollupCallback(callback)) return 0;
      return originalRequestIdleCallback.call(this, callback, options);
    };
  }

  const originalSetTimeout = window.setTimeout;
  if (!window.__WNMU_ROLLUP_TIMEOUT_PATCHED__) {
    window.__WNMU_ROLLUP_TIMEOUT_PATCHED__ = true;
    window.setTimeout = function patchedSetTimeout(callback, delay) {
      if (window.WNMU_DISABLE_INLINE_MONTH_ROLLUP && looksLikeMonthRollupCallback(callback)) return 0;
      return originalSetTimeout.apply(this, arguments);
    };
  }

  const originalAppendChild = Element.prototype.appendChild;
  if (!window.__WNMU_ROLLUP_APPEND_PATCHED__) {
    window.__WNMU_ROLLUP_APPEND_PATCHED__ = true;
    Element.prototype.appendChild = function patchedAppendChild(node) {
      try {
        if (window.WNMU_DISABLE_INLINE_MONTH_ROLLUP && this && this.id === 'monthRollup') return node;
        if (node && node.id === 'legacySharedMarksPanel') return node;
      } catch {}
      return originalAppendChild.call(this, node);
    };
  }

  function channelPage(channel) {
    return channel === '13.3' ? 'index133.v1.4.1.html' : 'index131.v1.4.1.html';
  }

  function updateRollupLink() {
    const link = document.getElementById('monthRollupLink');
    if (!link) return;
    const cfg = window.WNMU_MONTHLY_PAGE_CONFIG || {};
    const meta = window.WNMU_CURRENT_MONTH_META || {};
    const channel = cfg.channelCode || (document.title.includes('WNMU3PL') ? '13.3' : '13.1');
    const month = meta.monthKey || new URLSearchParams(location.search).get('month') || '';
    if (!month) {
      link.classList.add('disabled');
      link.setAttribute('aria-disabled', 'true');
      link.href = '#';
      return;
    }
    link.classList.remove('disabled');
    link.removeAttribute('aria-disabled');
    link.href = `month-rollup.v1.5.35.html?channel=${encodeURIComponent(channel)}&month=${encodeURIComponent(month)}&v=1.5.35`;
  }

  function keepCurrentMonthJsonCacheOnly() {
    try {
      const cfg = window.WNMU_MONTHLY_PAGE_CONFIG || {};
      const meta = window.WNMU_CURRENT_MONTH_META || {};
      const channel = cfg.channelCode || '';
      const month = meta.monthKey || new URLSearchParams(location.search).get('month') || '';
      if (!month) return;
      const prefix = 'wnmu_json_cache_v1_3_1::';
      const keepNeedles = [
        channel && month ? `/${channel}/${month}/` : '',
        month
      ].filter(Boolean);
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i) || '';
        if (!key.startsWith(prefix)) continue;
        const keep = keepNeedles.some(needle => key.includes(needle));
        if (!keep) toRemove.push(key);
      }
      toRemove.forEach(key => localStorage.removeItem(key));
      window.WNMU_LAST_CACHE_PRUNE = { keptMonth: month, channel, removed: toRemove.length, at: new Date().toISOString() };
    } catch (err) {
      console.warn('WNMU cache prune skipped.', err);
    }
  }



  function widenEpisodeFields() {
    try {
      if (document.getElementById('wnmuEpisodeFieldWidthStyles')) return;
      const style = document.createElement('style');
      style.id = 'wnmuEpisodeFieldWidthStyles';
      style.textContent = `
        /* v1.5.35: make Episode # controls about four characters wider without disturbing other compact fields. */
        input[id*="episode" i],
        input[name*="episode" i],
        input[aria-label*="episode" i],
        input[title*="episode" i],
        input[placeholder*="episode" i],
        select[id*="episode" i],
        select[name*="episode" i],
        textarea[id*="episode" i],
        textarea[name*="episode" i],
        .episode-field,
        .episode-number-field,
        .field-episode,
        .wnmu-episode-field {
          min-width: 16ch !important;
        }
        label:has(input[id*="episode" i]),
        label:has(input[name*="episode" i]),
        label:has(select[id*="episode" i]),
        label:has(select[name*="episode" i]) {
          min-width: calc(16ch + 2rem) !important;
        }
      `;
      document.head.appendChild(style);
    } catch (err) {
      console.warn('WNMU episode field width tweak skipped.', err);
    }
  }

  function start() {
    widenEpisodeFields();
    const orphanPanel = document.querySelector('.month-panel');
    if (orphanPanel) orphanPanel.remove();
    updateRollupLink();
    keepCurrentMonthJsonCacheOnly();
    [300, 900, 1800, 3500, 7000].forEach(ms => originalSetTimeout(() => {
      updateRollupLink();
      widenEpisodeFields();
      keepCurrentMonthJsonCacheOnly();
      const legacy = document.getElementById('legacySharedMarksPanel');
      if (legacy) legacy.remove();
      const monthRollup = document.getElementById('monthRollup');
      if (monthRollup) monthRollup.replaceChildren();
    }, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
