(function () {
  'use strict';
  const VERSION = 'v1.5.13-fixed-framework-scroll-area';
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
      body.wnmu-fixed-framework-active > main.page {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow: auto !important;
        -webkit-overflow-scrolling: touch;
        position: relative !important;
        z-index: 1 !important;
      }
      body.wnmu-fixed-framework-active table.screen-week-grid thead th {
        position: sticky !important;
        top: 0 !important;
        z-index: 140 !important;
      }
      body.wnmu-fixed-framework-active .wnmu-cell-override-layer { z-index: 20 !important; }
      body.wnmu-fixed-framework-active .wnmu-cell-override-box { z-index: 21 !important; }
      body.wnmu-fixed-framework-active #wnmuCellMenu.wnmu-cell-menu {
        position: fixed !important;
        z-index: 2147483647 !important;
      }
      body.wnmu-fixed-framework-active #wnmuComponentVersions,
      body.wnmu-fixed-framework-active .wnmu-component-versions { z-index: 2147483000 !important; }
      body.wnmu-fixed-framework-active .wnmu-diag-panel { z-index: 2147483200 !important; }
      @media print {
        html.wnmu-fixed-framework-html,
        html.wnmu-fixed-framework-html body,
        body.wnmu-fixed-framework-active {
          height: auto !important;
          overflow: visible !important;
          display: block !important;
        }
        body.wnmu-fixed-framework-active > main.page {
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