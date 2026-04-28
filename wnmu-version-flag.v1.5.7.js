(function () {
  'use strict';
  const INTERACTION_VERSION = 'v1.5.7 box-size menu restored';
  const ICON_VERSION = 'v1.5.5 WNMU calendar icon';
  const DIAG_VERSION = 'v1.5.6 diagnostics/home polish';
  function cleanBase(text) {
    return String(text || '')
      .replace(/\s*•\s*cell interactions.*$/i, '')
      .replace(/\s*•\s*app icon.*$/i, '')
      .replace(/\s*•\s*diagnostics.*$/i, '')
      .trim();
  }
  function setFlag() {
    const flag = document.getElementById('versionFlag');
    if (!flag) return;
    const base = cleanBase(flag.textContent) || 'version';
    flag.textContent = `${base} • cell interactions ${INTERACTION_VERSION} • app icon ${ICON_VERSION} • diagnostics ${DIAG_VERSION}`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setFlag, { once: true });
  else setFlag();
  window.setTimeout(setFlag, 800);
  window.setTimeout(setFlag, 1800);
  window.setTimeout(setFlag, 3500);
})();
