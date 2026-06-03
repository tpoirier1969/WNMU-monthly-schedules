(function () {
  'use strict';
  const VERSION = 'v1.5.59-sales-export-link';
  window.WNMU_SALES_EXPORT_LINK_VERSION = VERSION;

  function channelCode() {
    return (window.WNMU_MONTHLY_PAGE_CONFIG && window.WNMU_MONTHLY_PAGE_CONFIG.channelCode)
      || (document.title.includes('WNMU3PL') ? '13.3' : '13.1');
  }

  function currentMonth() {
    return (window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey)
      || new URLSearchParams(window.location.search).get('month')
      || '';
  }

  function updateSalesLink() {
    const link = document.getElementById('salesExportBtn');
    if (!link) return;
    const params = new URLSearchParams();
    params.set('channel', channelCode());
    const month = currentMonth();
    if (month) params.set('month', month);
    params.set('v', '1.5.59');
    link.href = 'sales-export.v1.5.59.html?' + params.toString();
  }

  function start() {
    updateSalesLink();
    [250, 750, 1500, 3000].forEach(ms => window.setTimeout(updateSalesLink, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
