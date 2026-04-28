(function () {
  'use strict';
  const VERSION = 'v1.5.19-lean-visible-week-rollups-current-cache-only';
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
    link.href = `month-rollup.v1.5.19.html?channel=${encodeURIComponent(channel)}&month=${encodeURIComponent(month)}&v=1.5.19`;
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


  function ensureLeanRollupStyles() {
    if (document.getElementById('wnmuLeanWeekRollupStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuLeanWeekRollupStyles';
    style.textContent = `
      .wnmu-lean-week-rollup {
        padding: 9px 11px !important;
        border-radius: 10px !important;
        background: #fbfcfe !important;
        box-shadow: none !important;
      }
      .wnmu-lean-week-rollup h4 {
        margin: 0 0 6px 0 !important;
        font-size: 12px !important;
        line-height: 1.2 !important;
      }
      .wnmu-lean-rollup-list {
        display: grid;
        gap: 2px;
      }
      .wnmu-lean-rollup-day {
        display: grid;
        grid-template-columns: 104px minmax(0, 1fr);
        gap: 8px;
        align-items: start;
        border-top: 1px solid rgba(207,216,227,.75);
        padding: 3px 0;
        min-height: 21px;
        font-size: 11px;
        line-height: 1.22;
      }
      .wnmu-lean-rollup-day:first-child { border-top: 0; }
      .wnmu-lean-rollup-label {
        color: var(--brand, #203864);
        font-weight: 800;
        white-space: nowrap;
      }
      .wnmu-lean-rollup-items {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .wnmu-lean-rollup-item {
        min-width: 0;
      }
      .wnmu-lean-rollup-empty {
        color: var(--muted, #5a6a7b);
        font-style: italic;
      }
      .wnmu-lean-week-rollup .rollup-line {
        line-height: 1.2 !important;
      }
      .wnmu-lean-week-rollup .meta {
        color: var(--muted, #5a6a7b);
      }
      @media (max-width: 900px) {
        .wnmu-lean-rollup-day {
          grid-template-columns: 1fr;
          gap: 1px;
        }
      }
      @media print {
        .wnmu-lean-week-rollup {
          padding: 3px 4px !important;
        }
        .wnmu-lean-rollup-day {
          grid-template-columns: 70px minmax(0, 1fr);
          gap: 4px;
          padding: 1px 0;
          min-height: 0;
          font-size: 6px;
          line-height: 1.0;
        }
        .wnmu-lean-week-rollup h4 {
          font-size: 8px !important;
          margin-bottom: 2px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function cloneRollupLine(node) {
    const clone = node.cloneNode(true);
    clone.classList.add('wnmu-lean-rollup-item');
    return clone;
  }

  function convertWeekRollupBox(box) {
    try {
      if (!box || box.dataset.wnmuLeanRollup === '1' || !box.classList.contains('rollup-box')) return;
      const host = box.closest('.week-rollup-host');
      if (!host) return;
      const title = box.querySelector('h4')?.textContent?.trim() || 'Week rollup';
      const days = Array.from(box.querySelectorAll('.day-rollup'));
      if (!days.length) return;
      const lean = document.createElement('section');
      lean.className = 'rollup-box wnmu-lean-week-rollup';
      lean.dataset.wnmuLeanRollup = '1';
      const h = document.createElement('h4');
      h.textContent = title;
      lean.appendChild(h);
      const list = document.createElement('div');
      list.className = 'wnmu-lean-rollup-list';
      days.forEach(day => {
        const row = document.createElement('div');
        row.className = 'wnmu-lean-rollup-day';
        const label = document.createElement('div');
        label.className = 'wnmu-lean-rollup-label';
        label.textContent = day.querySelector('h5')?.textContent?.trim() || 'Day';
        const items = document.createElement('div');
        items.className = 'wnmu-lean-rollup-items';
        const lines = Array.from(day.querySelectorAll('.rollup-line'));
        if (lines.length) {
          lines.forEach(line => items.appendChild(cloneRollupLine(line)));
        } else {
          const empty = document.createElement('div');
          empty.className = 'wnmu-lean-rollup-empty';
          empty.textContent = day.querySelector('.rollup-empty')?.textContent?.trim() || 'None checked';
          items.appendChild(empty);
        }
        row.appendChild(label);
        row.appendChild(items);
        list.appendChild(row);
      });
      lean.appendChild(list);
      box.replaceWith(lean);
    } catch (err) {
      console.warn('WNMU lean week rollup conversion skipped.', err);
    }
  }

  function convertVisibleWeekRollups() {
    ensureLeanRollupStyles();
    document.querySelectorAll('.week-rollup-host > .rollup-box:not(.wnmu-lean-week-rollup)').forEach(convertWeekRollupBox);
  }

  function installLeanRollupObserver() {
    ensureLeanRollupStyles();
    convertVisibleWeekRollups();
    const root = document.getElementById('weekGrids') || document.body;
    if (!root || root.dataset.wnmuLeanRollupObserver === '1') return;
    root.dataset.wnmuLeanRollupObserver = '1';
    const observer = new MutationObserver(mutations => {
      let shouldRun = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node && node.nodeType === 1 && (
            node.classList?.contains('rollup-box') ||
            node.querySelector?.('.week-rollup-host > .rollup-box')
          )) {
            shouldRun = true;
            break;
          }
        }
        if (shouldRun) break;
      }
      if (shouldRun) requestAnimationFrame(convertVisibleWeekRollups);
    });
    observer.observe(root, { childList: true, subtree: true });
    window.WNMU_LEAN_WEEK_ROLLUP_OBSERVER = observer;
  }

  function start() {
    installLeanRollupObserver();
    const orphanPanel = document.querySelector('.month-panel');
    if (orphanPanel) orphanPanel.remove();
    updateRollupLink();
    keepCurrentMonthJsonCacheOnly();
    [300, 900, 1800, 3500, 7000].forEach(ms => originalSetTimeout(() => {
      updateRollupLink();
      keepCurrentMonthJsonCacheOnly();
      convertVisibleWeekRollups();
      const legacy = document.getElementById('legacySharedMarksPanel');
      if (legacy) legacy.remove();
      const monthRollup = document.getElementById('monthRollup');
      if (monthRollup) monthRollup.replaceChildren();
    }, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
