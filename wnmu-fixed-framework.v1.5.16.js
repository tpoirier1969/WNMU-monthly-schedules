(function () {
  'use strict';
  const VERSION = 'v1.5.16-month-rollup-flow-repair';
  window.WNMU_FIXED_FRAMEWORK_VERSION = VERSION;

  function isSchedulePage() {
    return !!document.querySelector('.topbar') && !!document.getElementById('weekGrids') && !!document.querySelector('main.page');
  }

  function ensureStyles() {
    if (document.getElementById('wnmuFixedFrameworkStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuFixedFrameworkStyles';
    style.textContent = `
      html.wnmu-fixed-framework-html,
      html.wnmu-fixed-framework-html body { height: 100%; }

      body.wnmu-fixed-framework-active {
        height: 100vh !important;
        min-height: 100vh !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
      }

      body.wnmu-fixed-framework-active > .topbar {
        flex: 0 0 auto !important;
        position: relative !important;
        z-index: 900 !important;
      }

      body.wnmu-fixed-framework-active > #archiveBanner {
        flex: 0 0 auto !important;
        position: relative !important;
        z-index: 850 !important;
        max-height: 18vh;
        overflow: auto;
      }

      /*
        The app chrome stays fixed, but schedule content must behave like one
        normal document. Do not let the Week grids and Month checkbox rollup act
        like separate panes. main.page is the only vertical scroll container.
      */
      body.wnmu-fixed-framework-active > main.page {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
        position: relative !important;
        z-index: 1 !important;
        display: block !important;
      }

      body.wnmu-fixed-framework-active > main.page > .panel + .panel {
        margin-top: 16px !important;
      }

      body.wnmu-fixed-framework-active .weeks-panel {
        overflow: visible !important;
        min-height: 0 !important;
        position: relative !important;
        z-index: 1 !important;
      }

      /*
        Ordinary bottom-of-page content. No floating. No sticky. No second
        viewport. It starts after the week-grid area has reserved enough real
        height for its rendered tables.
      */
      body.wnmu-fixed-framework-active .month-panel {
        display: block !important;
        position: static !important;
        float: none !important;
        clear: both !important;
        overflow: hidden !important;
        min-height: 0 !important;
        z-index: auto !important;
      }

      body.wnmu-fixed-framework-active .month-panel .panel-head,
      body.wnmu-fixed-framework-active .month-panel .panel-head h2,
      body.wnmu-fixed-framework-active #monthRollup,
      body.wnmu-fixed-framework-active .month-rollup {
        position: static !important;
        float: none !important;
        clear: none !important;
        inset: auto !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
        bottom: auto !important;
        transform: none !important;
        z-index: auto !important;
      }

      body.wnmu-fixed-framework-active .week-grids,
      body.wnmu-fixed-framework-active .week-grid-wrap,
      body.wnmu-fixed-framework-active .week-rollup-host {
        overflow: visible !important;
        position: relative !important;
      }

      body.wnmu-fixed-framework-active .screen-host {
        position: relative !important;
        overflow: visible !important;
      }

      body.wnmu-fixed-framework-active table.screen-week-grid thead th {
        position: sticky !important;
        top: 0 !important;
        z-index: 140 !important;
      }

      body.wnmu-fixed-framework-active .wnmu-cell-override-layer {
        position: absolute !important;
        inset: 0 !important;
        z-index: 20 !important;
        pointer-events: none !important;
      }

      body.wnmu-fixed-framework-active .wnmu-cell-override-box {
        z-index: 21 !important;
        pointer-events: auto !important;
      }

      body.wnmu-fixed-framework-active #wnmuCellMenu.wnmu-cell-menu {
        position: fixed !important;
        z-index: 2147483647 !important;
      }

      body.wnmu-fixed-framework-active #contextMenu {
        position: fixed !important;
        z-index: 2147483000 !important;
      }

      body.wnmu-fixed-framework-active #wnmuComponentVersions,
      body.wnmu-fixed-framework-active .wnmu-component-versions {
        z-index: 2147483000 !important;
      }

      body.wnmu-fixed-framework-active .wnmu-diag-panel {
        z-index: 2147483200 !important;
      }

      @media print {
        html.wnmu-fixed-framework-html,
        html.wnmu-fixed-framework-html body,
        body.wnmu-fixed-framework-active {
          height: auto !important;
          overflow: visible !important;
          display: block !important;
        }

        body.wnmu-fixed-framework-active > main.page,
        body.wnmu-fixed-framework-active .weeks-panel,
        body.wnmu-fixed-framework-active .month-panel,
        body.wnmu-fixed-framework-active .screen-host {
          height: auto !important;
          overflow: visible !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function reserveWeekGridFlowHeight() {
    const grid = document.getElementById('weekGrids');
    if (!grid) return;

    const gridRect = grid.getBoundingClientRect();
    if (!gridRect || !gridRect.width) return;

    let maxBottom = 0;
    const selector = [
      '.week-grid-wrap',
      '.week-grid-wrap > h3',
      '.screen-host',
      'table.screen-week-grid',
      '.week-rollup-host',
      '.week-rollup-host .rollup-box'
    ].join(',');

    grid.querySelectorAll(selector).forEach(el => {
      const rect = el.getBoundingClientRect();
      if (!rect || rect.height <= 0) return;
      maxBottom = Math.max(maxBottom, rect.bottom - gridRect.top);
    });

    if (maxBottom > 0) {
      const nextMinHeight = Math.ceil(maxBottom + 18);
      const current = parseInt(grid.style.minHeight || '0', 10) || 0;
      if (Math.abs(current - nextMinHeight) > 4) {
        grid.style.minHeight = `${nextMinHeight}px`;
      }
    }
  }

  function installFlowRepair() {
    const grid = document.getElementById('weekGrids');
    if (!grid || grid.dataset.wnmuFlowRepairInstalled === 'true') return;
    grid.dataset.wnmuFlowRepairInstalled = 'true';

    const rerun = () => window.requestAnimationFrame(reserveWeekGridFlowHeight);
    [0, 80, 250, 700, 1400, 2800, 5000].forEach(delay => window.setTimeout(rerun, delay));

    try {
      const mo = new MutationObserver(rerun);
      mo.observe(grid, { childList: true, subtree: true });
    } catch {}

    try {
      const ro = new ResizeObserver(rerun);
      ro.observe(grid);
      grid.querySelectorAll('.week-grid-wrap, .screen-host, table.screen-week-grid').forEach(el => ro.observe(el));
    } catch {}

    window.addEventListener('resize', rerun, { passive: true });
  }

  function activate() {
    if (!isSchedulePage()) return;
    ensureStyles();
    document.documentElement.classList.add('wnmu-fixed-framework-html');
    document.body.classList.add('wnmu-fixed-framework-active');
    installFlowRepair();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once: true });
  else activate();
})();
