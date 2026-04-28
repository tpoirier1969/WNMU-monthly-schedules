(function () {
  'use strict';
  const INTERACTION_VERSION = 'v1.5.4 coordinate/focus fixed cell interactions';
  const ICON_VERSION = 'v1.5.5 WNMU calendar icon';
  function setFlag() {
    const flag = document.getElementById('versionFlag');
    if (!flag) return;
    const base = String(flag.textContent || '')
      .replace(/\s*•\s*cell interactions.*$/i, '')
      .replace(/\s*•\s*app icon.*$/i, '')
      .trim();
    flag.textContent = `${base || 'version'} • cell interactions ${INTERACTION_VERSION} • app icon ${ICON_VERSION}`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setFlag, { once: true });
  else setFlag();
  window.setTimeout(setFlag, 800);
  window.setTimeout(setFlag, 1800);
  window.setTimeout(setFlag, 3500);
})();
