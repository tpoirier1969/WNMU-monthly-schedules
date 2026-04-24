(function () {
  function weekdayFromShortDate(shortDateText) {
    const meta = window.WNMU_CURRENT_MONTH_META || {};
    const baseYear = Number(String(meta.monthKey || '').split('-')[0]) || new Date().getFullYear();
    const parsed = new Date(`${shortDateText} ${baseYear}`);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-US', { weekday: 'long' });
  }

  function fixWeekHeaders() {
    document.querySelectorAll('.week-grid thead th:not(.time-col)').forEach(th => {
      const parts = (th.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
      if (!parts.length || parts[0].toLowerCase() !== 'undefined') return;
      const dateLabel = parts[1] || '';
      const weekday = weekdayFromShortDate(dateLabel);
      if (!weekday) return;
      th.innerHTML = `${weekday}<br>${dateLabel}`;
    });
  }

  function fixRollupHeadings() {
    document.querySelectorAll('.day-rollup h5').forEach(h5 => {
      const text = h5.textContent || '';
      if (!/^undefined\s*•\s*/i.test(text)) return;
      const dateLabel = text.replace(/^undefined\s*•\s*/i, '').trim();
      const weekday = weekdayFromShortDate(dateLabel);
      if (!weekday) return;
      h5.textContent = `${weekday} • ${dateLabel}`;
    });
  }

  function runFixes() {
    fixWeekHeaders();
    fixRollupHeadings();
  }

  const observer = new MutationObserver(() => runFixes());

  function start() {
    runFixes();
    const host = document.getElementById('weekGrids');
    if (host) observer.observe(host, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
