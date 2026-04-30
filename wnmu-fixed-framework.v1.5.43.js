(function () {
  'use strict';
  const VERSION = 'v1.5.43-legend-sticky-gap-color-cleanup';
  window.WNMU_FIXED_FRAMEWORK_VERSION = VERSION;

  const COLOR_OVERRIDES = {
    newSeries: '#fff3a3',
    newSeason: '#a7dfd8',
    highlight: '#f6a23a',
    oneOff: '#f2a6a0',
    fundraiser: 'var(--fundraiser)',
    programmersChoice: '#af9800',
    local: '#eaf8e8',
    michigan: '#e5f3ff'
  };

  function isSchedulePage() {
    return !!document.querySelector('.topbar') && !!document.getElementById('weekGrids') && !!document.querySelector('main.page');
  }
  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function tagMeta() { return cfg().tagMeta || {}; }
  function tagOrder() { return Array.isArray(cfg().tagOrder) ? cfg().tagOrder : []; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
  function labelFor(tag) { return tagMeta()[tag]?.label || tag; }
  function colorFor(tag) { return COLOR_OVERRIDES[tag] || tagMeta()[tag]?.color || '#fff'; }

  function ensureLegend() {
    const panel = document.querySelector('.weeks-panel');
    const head = panel?.querySelector(':scope > .panel-head');
    if (!panel || !head || document.getElementById('wnmuScheduleLegend')) return;
    const legend = document.createElement('div');
    legend.id = 'wnmuScheduleLegend';
    legend.className = 'wnmu-schedule-legend';
    const wanted = tagOrder().filter(tag => tagMeta()[tag] && !['monthlyTopic','noteworthy','holiday'].includes(tag));
    legend.innerHTML = `<strong>Legend:</strong> ${wanted.map(tag => `<span class="wnmu-legend-chip"><span class="wnmu-legend-swatch" style="background:${esc(colorFor(tag))}"></span>${esc(labelFor(tag))}</span>`).join('')}`;
    panel.insertBefore(legend, head);
  }

  function ensureStyles() {
    if (document.getElementById('wnmuFixedFrameworkStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuFixedFrameworkStyles';
    style.textContent = `
      :root {
        --new-series: ${COLOR_OVERRIDES.newSeries};
        --new-season: ${COLOR_OVERRIDES.newSeason};
        --highlight: ${COLOR_OVERRIDES.highlight};
        --one-off: ${COLOR_OVERRIDES.oneOff};
        --programmers-choice: ${COLOR_OVERRIDES.programmersChoice};
        --local: ${COLOR_OVERRIDES.local};
        --michigan: ${COLOR_OVERRIDES.michigan};
      }
      html.wnmu-fixed-framework-html, html.wnmu-fixed-framework-html body { height: 100%; }
      body.wnmu-fixed-framework-active { height:100vh!important; min-height:100vh!important; overflow:hidden!important; display:flex!important; flex-direction:column!important; }
      body.wnmu-fixed-framework-active > .topbar { flex:0 0 auto!important; position:relative!important; z-index:900!important; display:grid!important; grid-template-columns:minmax(320px,1fr) auto minmax(260px,auto)!important; align-items:start!important; column-gap:18px!important; row-gap:8px!important; }
      body.wnmu-fixed-framework-active > .topbar .flagbar { display:flex!important; align-items:flex-start!important; justify-content:center!important; flex-wrap:wrap!important; gap:8px!important; min-width:0!important; }
      body.wnmu-fixed-framework-active > .topbar .schedule-navline { text-align:right!important; white-space:nowrap!important; line-height:1.5!important; }
      body.wnmu-fixed-framework-active > .topbar .schedule-navline #exportPdfBtn { border:0!important; background:transparent!important; color:#0000ee!important; border-radius:0!important; box-shadow:none!important; padding:0!important; font:inherit!important; font-weight:inherit!important; text-decoration:underline!important; display:inline!important; }
      @media (max-width:1100px){ body.wnmu-fixed-framework-active > .topbar{grid-template-columns:1fr!important;} body.wnmu-fixed-framework-active > .topbar .flagbar, body.wnmu-fixed-framework-active > .topbar .schedule-navline{justify-content:flex-start!important;text-align:left!important;white-space:normal!important;} }
      body.wnmu-fixed-framework-active > #archiveBanner { flex:0 0 auto!important; position:relative!important; z-index:850!important; max-height:18vh; overflow:auto; }
      body.wnmu-fixed-framework-active > main.page { --wnmu-legend-height:34px; --wnmu-panel-head-height:72px; --wnmu-week-heading-height:42px; flex:1 1 auto!important; min-height:0!important; overflow-x:hidden!important; overflow-y:auto!important; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; scroll-behavior:auto; position:relative!important; z-index:1!important; display:block!important; scrollbar-gutter:stable; background:#f3f6fb!important; padding-top:0!important; margin-top:0!important; }
      body.wnmu-fixed-framework-active .weeks-panel { overflow:visible!important; min-height:0!important; position:relative!important; z-index:1!important; margin-top:0!important; padding-top:0!important; }
      body.wnmu-fixed-framework-active .wnmu-schedule-legend { position:sticky!important; top:0!important; z-index:350!important; display:flex!important; align-items:center!important; flex-wrap:wrap!important; gap:7px!important; margin:0!important; padding:7px 12px!important; min-height:20px!important; background:#f3f6fb!important; border-bottom:1px solid #c8d3e2!important; box-shadow:0 -22px 0 22px #f3f6fb, 0 1px 0 rgba(17,17,17,.15)!important; color:#17345f!important; font:12px/1.25 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif!important; }
      body.wnmu-fixed-framework-active .wnmu-legend-chip { display:inline-flex!important; align-items:center!important; gap:4px!important; white-space:nowrap!important; color:#172033!important; }
      body.wnmu-fixed-framework-active .wnmu-legend-swatch { width:16px!important; height:12px!important; border:1px solid rgba(17,17,17,.35)!important; border-radius:3px!important; display:inline-block!important; }
      body.wnmu-fixed-framework-active .weeks-panel > .panel-head { position:sticky!important; top:var(--wnmu-legend-height,34px)!important; z-index:340!important; margin:0!important; background:#f3f6fb!important; border-bottom:1px solid #c8d3e2!important; box-shadow:0 1px 0 rgba(17,17,17,.18)!important; }
      body.wnmu-fixed-framework-active .week-grids, body.wnmu-fixed-framework-active .week-rollup-host { overflow:visible!important; position:relative!important; }
      body.wnmu-fixed-framework-active .week-grid-wrap { overflow:visible!important; position:relative!important; content-visibility:visible!important; contain-intrinsic-size:auto!important; scroll-margin-top:calc(var(--wnmu-legend-height,34px) + var(--wnmu-panel-head-height,72px) + var(--wnmu-week-heading-height,42px) + 12px); }
      body.wnmu-fixed-framework-active .week-grid-wrap > h3 { position:sticky!important; top:calc(var(--wnmu-legend-height,34px) + var(--wnmu-panel-head-height,72px))!important; z-index:325!important; margin:0!important; padding:8px 12px!important; min-height:26px!important; display:flex!important; align-items:center!important; background:#f3f6fb!important; color:#17345f!important; border-top:1px solid #c8d3e2!important; border-bottom:1px solid #111!important; box-shadow:0 1px 0 #111!important; }
      body.wnmu-fixed-framework-active .screen-host { position:relative!important; overflow:visible!important; contain:none!important; }
      body.wnmu-fixed-framework-active table.screen-week-grid { contain:none!important; table-layout:fixed!important; }
      body.wnmu-fixed-framework-active table.screen-week-grid thead { position:sticky!important; top:calc(var(--wnmu-legend-height,34px) + var(--wnmu-panel-head-height,72px) + var(--wnmu-week-heading-height,42px))!important; z-index:315!important; transform:translateZ(0); background:#eef3f8!important; box-shadow:0 1px 0 #111!important; }
      body.wnmu-fixed-framework-active table.screen-week-grid thead th { position:static!important; z-index:auto!important; background:#eef3f8!important; color:var(--brand,#203864)!important; border-color:#111!important; outline:1px solid #111!important; outline-offset:-1px!important; box-shadow:inset 0 0 0 1px #111!important; backface-visibility:hidden; }
      body.wnmu-fixed-framework-active table.screen-week-grid thead th:not(.time-col){ background:#eef3f8!important; }
      body.wnmu-fixed-framework-active .program-cell{ backface-visibility:hidden; }
      body.wnmu-fixed-framework-active .tag-pill{ border-color:rgba(17,17,17,.18)!important; }
      body.wnmu-fixed-framework-active .wnmu-cell-override-layer{ position:absolute!important; inset:0!important; z-index:40!important; pointer-events:none!important; }
      body.wnmu-fixed-framework-active .wnmu-cell-override-box{ z-index:41!important; pointer-events:auto!important; }
      body.wnmu-fixed-framework-active #wnmuCellMenu.wnmu-cell-menu{ position:fixed!important; z-index:2147483647!important; max-height:calc(100vh - 24px)!important; overflow-y:auto!important; overscroll-behavior:contain; }
      body.wnmu-fixed-framework-active #contextMenu{ position:fixed!important; z-index:2147483000!important; }
      body.wnmu-fixed-framework-active #wnmuComponentVersions, body.wnmu-fixed-framework-active .wnmu-component-versions{ z-index:2147483000!important; }
      body.wnmu-fixed-framework-active .wnmu-diag-panel{ z-index:2147483200!important; }
      @media print { html.wnmu-fixed-framework-html, html.wnmu-fixed-framework-html body, body.wnmu-fixed-framework-active{height:auto!important;overflow:visible!important;display:block!important;} body.wnmu-fixed-framework-active > main.page, body.wnmu-fixed-framework-active .weeks-panel, body.wnmu-fixed-framework-active .screen-host, body.wnmu-fixed-framework-active .week-grid-wrap, body.wnmu-fixed-framework-active table.screen-week-grid{height:auto!important;overflow:visible!important;content-visibility:visible!important;contain:none!important;} body.wnmu-fixed-framework-active .wnmu-schedule-legend, body.wnmu-fixed-framework-active .weeks-panel > .panel-head, body.wnmu-fixed-framework-active .week-grid-wrap > h3, body.wnmu-fixed-framework-active table.screen-week-grid thead{position:static!important;top:auto!important;box-shadow:none!important;} }
    `;
    document.head.appendChild(style);
  }
  function measureStickyBlock() {
    const scroller = document.querySelector('main.page'); if (!scroller) return;
    const legend = scroller.querySelector('.wnmu-schedule-legend');
    const panelHead = scroller.querySelector('.weeks-panel > .panel-head');
    const firstWeekHeading = scroller.querySelector('.week-grid-wrap > h3');
    const legendHeight = Math.ceil((legend && legend.getBoundingClientRect().height) || 34);
    const panelHeight = Math.ceil((panelHead && panelHead.getBoundingClientRect().height) || 72);
    const weekHeight = Math.ceil((firstWeekHeading && firstWeekHeading.getBoundingClientRect().height) || 42);
    scroller.style.setProperty('--wnmu-legend-height', `${legendHeight}px`);
    scroller.style.setProperty('--wnmu-panel-head-height', `${panelHeight}px`);
    scroller.style.setProperty('--wnmu-week-heading-height', `${weekHeight}px`);
    window.WNMU_STICKY_HEADER_BLOCK_METRICS = { version: VERSION, legendHeight, panelHeight, weekHeight, at: new Date().toISOString() };
  }
  function installMeasurementHooks() {
    measureStickyBlock(); [120,300,900,1800,3500].forEach(ms => window.setTimeout(measureStickyBlock, ms));
    window.addEventListener('resize', measureStickyBlock, { passive: true });
    const target = document.getElementById('weekGrids');
    if (target && 'MutationObserver' in window) { const observer = new MutationObserver(() => window.requestAnimationFrame(measureStickyBlock)); observer.observe(target, { childList:true, subtree:true }); }
  }
  function activate() {
    if (!isSchedulePage()) return;
    ensureStyles(); ensureLegend();
    document.documentElement.classList.add('wnmu-fixed-framework-html');
    document.body.classList.add('wnmu-fixed-framework-active');
    installMeasurementHooks();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once:true });
  else activate();
})();
