(function () {
  'use strict';
  const VERSION = 'v1.5.38-disabled-overlay-renderer';
  window.WNMU_MANUAL_PROGRAMS_VERSION = VERSION;
  window.WNMU_MANUAL_PROGRAMS_REFRESH = function WNMU_MANUAL_PROGRAMS_REFRESH() {
    // v1.5.38: committed manual programs are real imported schedule_json entries.
    // This overlay renderer is intentionally disabled to prevent late/double drawing.
  };
  try {
    document.querySelectorAll('.wnmu-manual-program-cell').forEach(cell => cell.remove());
    document.querySelectorAll('.wnmu-manual-hidden-source').forEach(cell => {
      cell.classList.remove('wnmu-manual-hidden-source');
      cell.style.display = '';
    });
  } catch (err) {
    console.warn('Manual overlay cleanup skipped.', err);
  }
})();
