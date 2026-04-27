(function () {
  'use strict';
  const VERSION_TEXT = 'v1.4.42 targeted note save + row-boundary note height';
  function updateFlag() {
    const flag = document.getElementById('versionFlag');
    if (!flag) return;
    const current = String(flag.textContent || '');
    if (!current.includes('v1.4.42')) {
      flag.textContent = VERSION_TEXT;
    }
    flag.dataset.versionOverride = 'v1.4.42';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateFlag, { once: true });
  else updateFlag();
  window.setTimeout(updateFlag, 800);
  window.setTimeout(updateFlag, 2200);
})();
