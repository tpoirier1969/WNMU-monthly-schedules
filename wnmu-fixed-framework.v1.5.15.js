(function () {
  'use strict';
  const VERSION = 'v1.5.15-month-rollup-header-containment';
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

      body.wnmu-fixed-framework-active .weeks-panel {
        overflow: visible !important;
        min-height: 0 !important;
      }

      /*
        Keep the month rollup as ordinary page content. It must not become its
        own scroller, and its header/sign label must not float above the week
        grids or other app chrome. Unlike the week grid panel, this panel does
        not need overflow-visible behavior for sticky table headers.
      */
      body.wnmu-fixed-framework-active .month-panel {
        overflow: hidden !important;
        min-height: 0 !important;
        position: relative !important;
        z-index: 0 !important;
        clear: both !important;
      }

      body.wnmu-fixed-framework-active .month-panel .panel-head,
      body.wnmu-fixed-framework-active .month-panel .panel-head h2 {
        position: static !important;
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
      }

      body.wnmu-fixed-framework-active #monthRollup,
      body.wnmu-fixed-framework-active .month-rollup {
        overflow: visible !important;
        position: relative !important;
        z-index: 0 !important;
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
        body.wnmu-fixed-framework-active .month-panel .panel-head,
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
