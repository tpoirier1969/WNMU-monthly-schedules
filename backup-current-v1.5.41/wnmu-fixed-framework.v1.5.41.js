(function () {
  'use strict';
  const VERSION = 'v1.5.41-simplified-sticky-headers-no-scroll-listener';
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
        display: grid !important;
        grid-template-columns: minmax(320px, 1fr) auto minmax(260px, auto) !important;
        align-items: start !important;
        column-gap: 18px !important;
        row-gap: 8px !important;
      }

      body.wnmu-fixed-framework-active > .topbar .flagbar {
        display: flex !important;
        align-items: flex-start !important;
        justify-content: center !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
        min-width: 0 !important;
      }

      body.wnmu-fixed-framework-active > .topbar .schedule-navline {
        text-align: right !important;
        white-space: nowrap !important;
        line-height: 1.5 !important;
      }

      body.wnmu-fixed-framework-active > .topbar .schedule-navline #exportPdfBtn {
        border: 0 !important;
        background: transparent !important;
        color: #0000ee !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding: 0 !important;
        font: inherit !important;
        font-weight: inherit !important;
        text-decoration: underline !important;
        display: inline !important;
      }

      @media (max-width: 1100px) {
        body.wnmu-fixed-framework-active > .topbar {
          grid-template-columns: 1fr !important;
        }
        body.wnmu-fixed-framework-active > .topbar .flagbar,
        body.wnmu-fixed-framework-active > .topbar .schedule-navline {
          justify-content: flex-start !important;
          text-align: left !important;
          white-space: normal !important;
        }
      }

      body.wnmu-fixed-framework-active > #archiveBanner {
        flex: 0 0 auto !important;
        position: relative !important;
        z-index: 850 !important;
        max-height: 18vh;
        overflow: auto;
      }

      /* The header/framework stays fixed. The schedule content itself is one normal scrolling page. */
      body.wnmu-fixed-framework-active > main.page {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        scroll-behavior: auto;
        position: relative !important;
        z-index: 1 !important;
        display: block !important;
        scrollbar-gutter: stable;
      }

      body.wnmu-fixed-framework-active .weeks-panel {
        overflow: visible !important;
        min-height: 0 !important;
        position: relative !important;
        z-index: 1 !important;
      }

      body.wnmu-fixed-framework-active .week-grids,
      body.wnmu-fixed-framework-active .week-rollup-host {
        overflow: visible !important;
        position: relative !important;
      }

      /*
        v1.5.41: favor smoother manual scrolling over deferred offscreen painting.
        The previous content-visibility/contain paint combo reduced initial paint cost,
        but Edge/Chromium can visibly chunk large sticky-header tables while scrolling.
      */
      body.wnmu-fixed-framework-active .week-grid-wrap {
        overflow: visible !important;
        position: relative !important;
        content-visibility: visible !important;
        contain-intrinsic-size: auto !important;
      }

      body.wnmu-fixed-framework-active .screen-host {
        position: relative !important;
        overflow: visible !important;
        contain: none !important;
      }

      body.wnmu-fixed-framework-active table.screen-week-grid {
        contain: none !important;
        table-layout: fixed !important;
      }

      /*
        v1.5.41: Use one sticky THEAD instead of seven independently sticky TH cells.
        This is simpler for Edge/Chromium to paint and keeps the day/date header flush
        with the top of the scroll pane so schedule rows do not peek through above it.
      */
      body.wnmu-fixed-framework-active table.screen-week-grid thead {
        position: sticky !important;
        top: 0 !important;
        z-index: 260 !important;
        transform: translateZ(0);
        background: #eef3f8 !important;
        box-shadow: 0 1px 0 #111 !important;
      }

      body.wnmu-fixed-framework-active table.screen-week-grid thead th {
        position: static !important;
        z-index: auto !important;
        background: #eef3f8 !important;
        color: var(--brand, #203864) !important;
        border-color: #111 !important;
        outline: 1px solid #111 !important;
        outline-offset: -1px !important;
        box-shadow: inset 0 0 0 1px #111 !important;
        backface-visibility: hidden;
      }

      body.wnmu-fixed-framework-active table.screen-week-grid thead th.time-col {
        z-index: auto !important;
      }

      /* Pale blue day/date headers with a black outline remain intact. */
      body.wnmu-fixed-framework-active table.screen-week-grid thead th:not(.time-col) {
        background: #eef3f8 !important;
      }

      body.wnmu-fixed-framework-active .program-cell {
        backface-visibility: hidden;
      }
      body.wnmu-fixed-framework-active .wnmu-cell-override-layer {
        position: absolute !important;
        inset: 0 !important;
        z-index: 40 !important;
        pointer-events: none !important;
      }

      body.wnmu-fixed-framework-active .wnmu-cell-override-box {
        z-index: 41 !important;
        pointer-events: auto !important;
      }

      body.wnmu-fixed-framework-active #wnmuCellMenu.wnmu-cell-menu {
        position: fixed !important;
        z-index: 2147483647 !important;
        max-height: calc(100vh - 24px) !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
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
        body.wnmu-fixed-framework-active .screen-host,
        body.wnmu-fixed-framework-active .week-grid-wrap,
        body.wnmu-fixed-framework-active table.screen-week-grid {
          height: auto !important;
          overflow: visible !important;
          content-visibility: visible !important;
          contain: none !important;
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
