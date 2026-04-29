(function () {
  'use strict';

  const PACKAGE_VERSION = 'v1.5.29';
  const PACKAGE_LABEL = 'manual program override table sync';
  const KNOWN_PARTS = [
    { key: 'package', label: 'Delivered package', version: `${PACKAGE_VERSION} ${PACKAGE_LABEL}` },
    { key: 'home', label: 'Home page shell', version: 'index.html v1.5.29' },
    { key: 'schedule-shell', label: 'Schedule page shell', version: 'index131/133 HTML v1.4.1 + package v1.5.29' },
    { key: 'builder-shell', label: 'Month Builder shell', version: 'month-builder HTML v1.4.1 / parser v1.4.16' },
    { key: 'interactions', label: 'Cell interactions / box notes', global: 'WNMU_CELL_INTERACTIONS_VERSION', fallback: 'v1.5.13 contained note layer + fixed framework' },
    { key: 'manual-programs', label: 'Manual program entries', global: 'WNMU_MANUAL_PROGRAMS_VERSION', fallback: 'v1.5.29 true in-table manual programs' },
    { key: 'diagnostics', label: 'Diagnostics panel', global: 'WNMU_DIAGNOSTICS_PANEL_VERSION', fallback: 'v1.5.6 diagnostics panel' },
    { key: 'icon', label: 'App icon', version: 'v1.5.5 WNMU calendar/check icon' },
    { key: 'sticky', label: 'Sticky week/day headers', global: 'WNMU_STICKY_WEEK_HEADERS_VERSION', fallback: 'v1.5.10 sticky week headers' },
    { key: 'framework', label: 'Fixed framework / scroll area', global: 'WNMU_FIXED_FRAMEWORK_VERSION', fallback: 'v1.5.29 true in-table manual programs' },
    { key: 'versionflag', label: 'Version display', version: `${PACKAGE_VERSION} ${PACKAGE_LABEL}` }
  ];

  const LABELS = [
    [/^app\.131/i, '13.1 channel config'],
    [/^app\.133/i, '13.3 channel config'],
    [/^wnmu-monthly-shared/i, 'Shared schedule renderer'],
    [/^wnmu-current-loader/i, 'Current month/Supabase loader'],
    [/^wnmu-cell-interactions/i, 'Cell interactions / box notes'],
    [/^wnmu-diagnostics-panel/i, 'Diagnostics panel'],
    [/^wnmu-sticky-week-headers/i, 'Sticky week/day headers'],
    [/^wnmu-fixed-framework/i, 'Fixed framework / scroll area'],
    [/^wnmu-schedule-performance/i, 'Schedule performance guard'],
    [/^wnmu-manual-programs/i, 'Manual program entries'],
    [/^wnmu-manual-program-overrides/i, 'Manual program overrides table'],
    [/^month-rollup/i, 'Standalone Month Rollup'],
    [/^wnmu-satellite-feed/i, 'Satellite Feed rules'],
    [/^wnmu-lite-checkboxes/i, 'Lite checkbox behavior'],
    [/^archive-tools/i, 'Archive tools'],
    [/^wnmu-postload-fixes/i, 'Postload fixes'],
    [/^wnmu-version-flag/i, 'Version display'],
    [/^month-builder-publish/i, 'Month Builder parser/publisher'],
    [/^config\.js/i, 'Supabase config'],
    [/^pdf(\.min)?\.js/i, 'PDF.js'],
    [/^styles\.dual/i, 'Screen CSS'],
    [/^print-layout-fix/i, 'Print CSS'],
    [/^assets\/month-builder/i, 'Month Builder CSS']
  ];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function cleanFlag(text) {
    return String(text || '')
      .replace(/\s*•\s*cell interactions.*$/i, '')
      .replace(/\s*•\s*app icon.*$/i, '')
      .replace(/\s*•\s*diagnostics.*$/i, '')
      .replace(/\s*•\s*package v\d+.*$/i, '')
      .trim();
  }

  function filenameFromSrc(src) {
    const clean = String(src || '').split('#')[0].split('?')[0];
    return clean.split('/').filter(Boolean).pop() || clean;
  }

  function versionFrom(text) {
    const s = String(text || '');
    const fileV = s.match(/v\d+(?:\.\d+){1,3}[a-z]?/i);
    if (fileV) return fileV[0];
    const queryV = s.match(/[?&]v=([^&]+)/i);
    if (queryV) return queryV[1];
    const buildV = s.match(/[?&](?:build|loader)=([^&]+)/i);
    if (buildV) return buildV[1];
    return '';
  }

  function labelFor(file, raw) {
    const src = String(raw || file || '');
    for (const [pattern, label] of LABELS) {
      if (pattern.test(file) || pattern.test(src)) return label;
    }
    return file || src || 'Unknown part';
  }

  function pageShellVersion() {
    const page = filenameFromSrc(location.pathname || 'index.html') || 'index.html';
    if (page === 'index.html' || !page.includes('.html')) return 'Home page shell v1.5.29';
    if (/index13[13]\.v1\.4\.1\.html/i.test(page)) return `${page} shell v1.4.1 + package v1.5.29`;
    if (/month-builder\.v1\.4\.1\.html/i.test(page)) return `${page} shell v1.4.1 + package v1.5.29`;
    return `${page} + package v1.5.29`;
  }

  function componentRows() {
    const rows = [];
    const seen = new Set();
    function add(label, version, source) {
      const key = `${label}::${version || ''}::${source || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ label, version: version || '—', source: source || '' });
    }

    add('Delivered package', `${PACKAGE_VERSION} ${PACKAGE_LABEL}`, 'this ZIP/update');
    add('Current page shell', pageShellVersion(), filenameFromSrc(location.pathname || 'index.html'));
    if (window.WNMU_MONTHLY_PAGE_CONFIG?.buildVersion) add('Channel config buildVersion', window.WNMU_MONTHLY_PAGE_CONFIG.buildVersion, 'WNMU_MONTHLY_PAGE_CONFIG');
    if (window.WNMU_SUPABASE_JSON_FETCH_SHIM_VERSION) add('Inline Supabase JSON fetch shim', window.WNMU_SUPABASE_JSON_FETCH_SHIM_VERSION, 'inline script');
    if (window.WNMU_CELL_INTERACTIONS_VERSION) add('Cell interactions / box notes', window.WNMU_CELL_INTERACTIONS_VERSION, 'global');
    if (window.WNMU_MANUAL_PROGRAMS_VERSION) add('Manual program entries', window.WNMU_MANUAL_PROGRAMS_VERSION, 'global');
    if (window.WNMU_DIAGNOSTICS_PANEL_VERSION) add('Diagnostics panel', window.WNMU_DIAGNOSTICS_PANEL_VERSION, 'global');
    if (window.WNMU_STICKY_WEEK_HEADERS_VERSION) add('Sticky week/day headers', window.WNMU_STICKY_WEEK_HEADERS_VERSION, 'global');
    if (window.WNMU_FIXED_FRAMEWORK_VERSION) add('Fixed framework / scroll area', window.WNMU_FIXED_FRAMEWORK_VERSION, 'global');

    document.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel~="icon"][href], link[rel="manifest"][href], link[rel="apple-touch-icon"][href]').forEach(el => {
      const raw = el.getAttribute('src') || el.getAttribute('href') || '';
      const file = filenameFromSrc(raw);
      const rel = el.tagName.toLowerCase() === 'link' ? (el.getAttribute('rel') || '') : 'script';
      if (!/wnmu|app\.13|archive|current-loader|postload|satellite|checkbox|builder|rollup|performance|version|config|styles|print|favicon|icon|manifest|pdf/i.test(raw)) return;
      let label = labelFor(file, raw);
      let ver = versionFrom(raw);
      if (/favicon|apple-touch-icon|wnmu-monthly-calendar-icon|manifest/i.test(file)) {
        label = 'App icon / favicon assets';
        ver = 'v1.5.5 icon set';
      }
      add(label, ver, `${rel}: ${file}`);
    });

    KNOWN_PARTS.forEach(part => {
      if (part.global && window[part.global]) return;
      const relevant = part.key === 'home' ? (filenameFromSrc(location.pathname) === 'index.html' || !filenameFromSrc(location.pathname))
        : part.key === 'schedule-shell' ? /index13[13]/i.test(filenameFromSrc(location.pathname))
        : part.key === 'builder-shell' ? /month-builder/i.test(filenameFromSrc(location.pathname))
        : true;
      if (relevant) add(part.label, part.version || part.fallback, 'registered component');
    });

    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }

  function ensureStyles() {
    if (document.getElementById('wnmuComponentVersionsStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuComponentVersionsStyles';
    style.textContent = `
      .wnmu-component-versions{margin:0;max-width:min(720px,100%);font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#172033;z-index:2147482000;position:relative}
      .wnmu-component-versions summary{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;border:1px solid #c8d3e2;border-radius:999px;background:#fff;color:#17345f;font-weight:850;padding:8px 12px;box-shadow:0 1px 3px rgba(0,0,0,.08);white-space:nowrap}
      .wnmu-component-versions[open] summary{border-radius:999px}
      .wnmu-component-versions .wnmu-component-box{background:#fff;border:1px solid #c8d3e2;border-radius:0 12px 12px 12px;box-shadow:0 10px 28px rgba(0,0,0,.16);padding:10px;margin-top:-1px;max-height:360px;overflow:auto}
      .wnmu-component-versions table{border-collapse:collapse;width:100%;min-width:480px}
      .wnmu-component-versions th,.wnmu-component-versions td{text-align:left;vertical-align:top;border-top:1px solid #edf1f6;padding:5px 6px}
      .wnmu-component-versions th{color:#0d4f38;font-weight:900;background:#f6f9fc;position:sticky;top:0}
      .wnmu-component-versions td:first-child{font-weight:800;color:#17345f;width:38%}
      .wnmu-component-versions td:nth-child(2){white-space:nowrap;color:#111}
      .flagbar .wnmu-component-versions{display:inline-flex;margin:0;vertical-align:middle}.flagbar .wnmu-component-versions .wnmu-component-box{position:absolute;top:calc(100% + 6px);right:0;min-width:min(720px,calc(100vw - 32px))}
      .top-tools .wnmu-component-versions{align-self:flex-end}.top-tools .wnmu-component-versions .wnmu-component-box{position:absolute;right:0;min-width:min(720px,calc(100vw - 32px))}
      @media(max-width:760px){.wnmu-component-versions table{min-width:0}.wnmu-component-versions th:nth-child(3),.wnmu-component-versions td:nth-child(3){display:none}.flagbar .wnmu-component-versions .wnmu-component-box,.top-tools .wnmu-component-versions .wnmu-component-box{position:static;min-width:0}}
      @media print{.wnmu-component-versions{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function renderDetails() {
    ensureStyles();
    let host = document.getElementById('wnmuComponentVersions');
    if (!host) {
      host = document.createElement('details');
      host.id = 'wnmuComponentVersions';
      host.className = 'wnmu-component-versions';
      const topTools = document.querySelector('.top-tools');
      const flagbar = document.querySelector('.flagbar');
      if (topTools) topTools.appendChild(host);
      else if (flagbar) flagbar.appendChild(host);
      else {
        host.style.position = 'fixed'; host.style.right = '12px'; host.style.top = '12px';
        document.body.appendChild(host);
      }
    }
    const rows = componentRows();
    host.innerHTML = `<summary>Component versions</summary><div class="wnmu-component-box"><table><thead><tr><th>Part</th><th>Version</th><th>Source</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.label)}</td><td>${esc(row.version)}</td><td>${esc(row.source)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function setMainFlags() {
    const compact = `package ${PACKAGE_VERSION} • components listed`;
    const flag = document.getElementById('versionFlag');
    if (flag) {
      const base = cleanFlag(flag.textContent) || 'version';
      flag.textContent = `${base} • ${compact}`;
    }
    const homeFlag = document.querySelector('.version-flag');
    if (homeFlag && !flag) homeFlag.textContent = `Home page ${PACKAGE_VERSION} • component versions`;
    renderDetails();
  }

  function start() {
    setMainFlags();
    window.setTimeout(setMainFlags, 700);
    window.setTimeout(setMainFlags, 1800);
    window.setTimeout(setMainFlags, 3500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
