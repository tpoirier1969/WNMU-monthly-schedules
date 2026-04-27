(function () {
  const TEXT = 'v1.5.0 consolidated cell interactions';
  function setFlag() {
    const flag = document.getElementById('versionFlag');
    if (!flag) return;
    flag.textContent = TEXT;
    flag.title = 'v1.5.0: one cell-interaction owner; blank-slot menu/manual note helper scripts removed; old note data preserved/read-only migrated on display.';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setFlag, { once: true });
  else setFlag();
  [300, 900, 1800, 3500].forEach(ms => window.setTimeout(setFlag, ms));
})();
