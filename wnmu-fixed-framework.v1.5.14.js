(function () {
  'use strict';
  const VERSION = 'v1.5.14-single-scroll-content-restore';
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
        The app framework/header stays fixed, but the schedule page content must
        behave like one normal page. Keep main.page as the ONLY vertical scrolling
        region so the month checkbox rollup remains at the natural bottom of the
        page instead of becoming a separate window/pane.
      */
      body.wnmu-fixed-framework-active > main.page {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
        position: relative !important;
        z-index: 1 !important;
      }

      body.wnmu-fixed-framework-active .weeks-panel,
      body.wnmu-fixed-framework-active .month-panel {
        overflow: visible !important;
        min-height: 0 !important;
      }

      body.wnmu-fixed-framework-active .week-grids,
      body.wnmu-fixed-framework-active .week-grid-wrap,
      body.wnmu-fixed-framework-active .week-rollup-host,
      body.wnmu-fixed-framework-active #monthRollup {
        overflow: visible !important;
      }

      /*
        Allow wide schedule grids to scroll horizontally when needed without
        creating a second vertical page. This keeps note overlays scoped inside
        the schedule work area while preserving one-page vertical flow.
      */
      body.wnmu-fixed-framework-active .screen-host {
        position: relative !important;
        overflow-x: auto !important;
        overflow-y: visible !important;
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

  function activate() {
    if (!isSchedulePage()) return;
    ensureStyles();
    document.documentElement.classList.add('wnmu-fixed-framework-html');
    document.body.classList.add('wnmu-fixed-framework-active');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once: true });
  else activate();
})();
