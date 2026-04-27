(function () {
  const VERSION = 'v1.4.27-version-flag-keeper';

  function helperBits() {
    const bits = ['v1.4.27'];
    if (window.WNMU_SATELLITE_FEED_TAG_VERSION) bits.push('satellite');
    if (window.WNMU_LITE_CHECKBOX_VERSION) bits.push('lite checkboxes');
    if (window.WNMU_BLANK_SLOT_CONTEXT_MENU_VERSION) bits.push('blank slots');
    if (window.WNMU_MANUAL_NOTE_BOX_VERSION || window.WNMU_MANUAL_NOTE_BOXES_VERSION) bits.push('manual notes');
    if (window.WNMU_SUPABASE_JSON_FETCH_SHIM_VERSION) bits.push('Supabase live JSON');
    return bits.join(' • ');
  }

  function setFlag() {
    const flag = document.getElementById('versionFlag');
    if (!flag) return;
    const wanted = helperBits();
    if (!flag.textContent.includes('v1.4.27')) {
      flag.textContent = wanted;
    }
  }

  function start() {
    setFlag();

    const flag = document.getElementById('versionFlag');
    if (flag) {
      const observer = new MutationObserver(setFlag);
      observer.observe(flag, { childList: true, characterData: true, subtree: true });
    }

    // The old renderer/progressive render can rewrite the flag after helpers load.
    // Keep correcting it for a short window after page load.
    [100, 300, 700, 1200, 2000, 3500, 6000, 9000, 13000, 20000].forEach(ms => {
      window.setTimeout(setFlag, ms);
    });

    window.WNMU_VERSION_FLAG_KEEPER_VERSION = VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
