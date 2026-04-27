(function () {
  'use strict';

  const VERSION = 'v1.4.37 upper-layer blank-box hotfix';

  function setFlag() {
    const flag = document.getElementById('versionFlag');
    if (flag) {
      flag.textContent = VERSION;
      flag.title = 'Loaded: wnmu-version-flag.v1.4.37.js; blank overlay hotfix should report on window.WNMU_BLANK_OVERLAY_HOTFIX';
    }
    window.WNMU_VISIBLE_VERSION_FLAG = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setFlag, { once: true });
  } else {
    setFlag();
  }

  window.setTimeout(setFlag, 250);
  window.setTimeout(setFlag, 1000);
  window.setTimeout(setFlag, 2500);
})();
