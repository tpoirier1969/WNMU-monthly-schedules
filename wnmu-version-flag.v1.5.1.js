(function () {
  'use strict';
  const VERSION = 'v1.5.1 one-menu cell interactions';
  function setFlag() {
    const flag = document.getElementById('versionFlag');
    if (!flag) return;
    const base = String(flag.textContent || '').replace(/\s*•\s*cell interactions.*$/i, '').trim();
    flag.textContent = `${base || 'version'} • cell interactions ${VERSION}`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setFlag, { once: true });
  else setFlag();
  window.setTimeout(setFlag, 800);
  window.setTimeout(setFlag, 1800);
})();
