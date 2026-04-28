(function () {
  'use strict';
  const VERSION = 'v1.5.10-sticky-week-day-headers';
  window.WNMU_STICKY_WEEK_HEADERS_VERSION = VERSION;

  function ensureStyles() {
    if (document.getElementById('wnmuStickyWeekHeadersStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuStickyWeekHeadersStyles';
    style.textContent = `
      /* Keep each week's day/date header visible while that week is scrolling. */
      table.screen-week-grid thead th {
        position: sticky;
        top: 0;
        z-index: 90;
        background: #fff;
        box-shadow: 0 2px 0 rgba(0,0,0,.08), 0 3px 8px rgba(0,0,0,.08);
      }
      table.screen-week-grid thead th.time-col {
        z-index: 91;
      }
      .week-grid-wrap {
        overflow: visible;
      }
      @media print {
        table.screen-week-grid thead th { position: static !important; box-shadow: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function start() { ensureStyles(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
