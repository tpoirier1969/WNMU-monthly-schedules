(function () {
  'use strict';
  const VERSION = 'v1.5.20-scroll-smoothing-blue-outlined-day-headers-rollup-layout-restored';
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
        Chromium/Edge can skip layout/paint work for offscreen weeks. This is the
        biggest low-risk scroll smoothing win because the page can keep all week
        DOM available for notes/print, while the browser avoids repainting weeks
        that are nowhere near the viewport.
      */
      body.wnmu-fixed-framework-active .week-grid-wrap {
        overflow: visible !important;
        position: relative !important;
        content-visibility: auto;
        contain-intrinsic-size: 1250px;
      }

      body.wnmu-fixed-framework-active .screen-host {
        position: relative !important;
        overflow: visible !important;
        contain: paint;
      }

      body.wnmu-fixed-framework-active table.screen-week-grid {
        contain: paint;
      }

      body.wnmu-fixed-framework-active table.screen-week-grid thead th {
        position: sticky !important;
        top: 0 !important;
        z-index: 140 !important;
        /* Lighter sticky header paint than the older heavy drop shadow. */
        box-shadow: 0 1px 0 rgba(0,0,0,.10) !important;
        backface-visibility: hidden;
      }

      /* Match day/date headers to the pale blue time-column cells and outline them for readability. */
      body.wnmu-fixed-framework-active table.screen-week-grid thead th:not(.time-col) {
        background: #eef3f8 !important;
        color: var(--brand, #203864) !important;
        border-color: #111 !important;
        box-shadow: inset 0 0 0 1px #111 !important;
      }

      body.wnmu-fixed-framework-active .program-cell {
        backface-visibility: hidden;
      }

      body.wnmu-fixed-framework-active.wnmu-is-scrolling .program-cell,
      body.wnmu-fixed-framework-active.wnmu-is-scrolling .program-cell:hover,
      body.wnmu-fixed-framework-active.wnmu-is-scrolling .tag-pill,
      body.wnmu-fixed-framework-active.wnmu-is-scrolling .wnmu-cell-override-box {
        transition: none !important;
      }

      body.wnmu-fixed-framework-active.wnmu-is-scrolling .program-cell:hover {
        box-shadow: none !important;
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

  function installScrollState() {
    const scroller = document.querySelector('main.page');
    if (!scroller || scroller.dataset.wnmuScrollStateInstalled === '1') return;
    scroller.dataset.wnmuScrollStateInstalled = '1';
    let timer = 0;
    const clear = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.body.classList.remove('wnmu-is-scrolling'), 130);
    };
    scroller.addEventListener('scroll', () => {
      document.body.classList.add('wnmu-is-scrolling');
      clear();
    }, { passive: true });
    scroller.addEventListener('wheel', () => {
      document.body.classList.add('wnmu-is-scrolling');
      clear();
    }, { passive: true });
    scroller.addEventListener('touchmove', () => {
      document.body.classList.add('wnmu-is-scrolling');
      clear();
    }, { passive: true });
  }

  function activate() {
    if (!isSchedulePage()) return;
    ensureStyles();
    document.documentElement.classList.add('wnmu-fixed-framework-html');
    document.body.classList.add('wnmu-fixed-framework-active');
    installScrollState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once: true });
  else activate();
})();
