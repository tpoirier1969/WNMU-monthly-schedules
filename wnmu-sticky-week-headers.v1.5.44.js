(function () {
  'use strict';
  const VERSION = 'v1.5.44-sticky-legend-header-baseline';
  window.WNMU_STICKY_WEEK_HEADERS_VERSION = VERSION;

  function ensureStyles() {
    if (document.getElementById('wnmuStickyWeekHeadersStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuStickyWeekHeadersStyles';
    style.textContent = `
      /* v1.5.44: baseline only. The fixed framework owns the stronger schedule-page sticky block. */
      table.screen-week-grid thead {
        position: sticky;
        top: 0;
        z-index: 90;
        background: #eef3f8;
      }
      table.screen-week-grid thead th { background: #eef3f8; }
      .week-grid-wrap { overflow: visible; }
      @media print {
        table.screen-week-grid thead { position: static !important; box-shadow: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function start() { ensureStyles(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
