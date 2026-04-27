(function () {
  'use strict';
  const VERSION = 'v1.4.38 cell override overlay';

  function setFlag() {
    const flag = document.getElementById('versionFlag');
    if (!flag) return;
    const current = String(flag.textContent || '').trim();
    if (!current || current === 'version' || current.includes('v1.4.37') || current.includes('v1.4.36')) {
      flag.textContent = VERSION;
      return;
    }
    if (!current.includes('v1.4.38')) flag.textContent = `${current} • ${VERSION}`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setFlag, { once: true });
  } else {
    setFlag();
  }
  window.setTimeout(setFlag, 250);
  window.setTimeout(setFlag, 1000);
  window.WNMU_VERSION_FLAG_PATCH = VERSION;
})();
