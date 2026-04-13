(function () {
  const FIXED_VERSION = 'v1.1.2';

  function applyVersionFix() {
    const flag = document.getElementById('versionFlag');
    if (flag) {
      flag.textContent = `${FIXED_VERSION} • quick box notes + PDF export`;
    }

    if (window.__WNMU_DEBUG__ && window.__WNMU_DEBUG__.CONFIG) {
      window.__WNMU_DEBUG__.CONFIG.buildVersion = FIXED_VERSION;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyVersionFix();
    window.requestAnimationFrame(applyVersionFix);
    window.setTimeout(applyVersionFix, 150);
    window.setTimeout(applyVersionFix, 600);
  });

  window.addEventListener('load', applyVersionFix);
})();
