(function () {
  'use strict';

  const PACKAGE_VERSION = 'v1.5.99';
  const PACKAGE_LABEL = 'import gate hotfix and persistent auto-tags';
  const FLAG_TEXT = `${PACKAGE_VERSION} • ${PACKAGE_LABEL}`;

  function removeComponentVersionPanel() {
    try {
      document.querySelectorAll('#wnmuComponentVersions,.wnmu-component-versions').forEach(el => el.remove());
      const style = document.getElementById('wnmuComponentVersionsStyles');
      if (style) style.remove();
    } catch (err) {
      console.warn('WNMU version panel cleanup skipped.', err);
    }
  }

  function setSingleFlag() {
    removeComponentVersionPanel();
    const flag = document.getElementById('versionFlag');
    if (flag) {
      flag.textContent = FLAG_TEXT;
      flag.title = 'Installed WNMU Monthly package version';
    }
    const builderBadge = document.querySelector('h1 .badge');
    if (builderBadge && /month builder/i.test(document.title || '')) {
      builderBadge.textContent = 'v1.4.21 import gate hotfix';
    }
  }

  function start() {
    window.WNMU_MONTHLY_PACKAGE_VERSION = PACKAGE_VERSION;
    window.WNMU_MONTHLY_PACKAGE_LABEL = PACKAGE_LABEL;
    setSingleFlag();
    window.setTimeout(setSingleFlag, 800);
    window.setTimeout(setSingleFlag, 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
