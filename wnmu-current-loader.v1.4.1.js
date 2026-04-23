
(function () {
  const REGISTRY_CANDIDATES = [];
  const CONFIG = window.WNMU_MONTHLY_PAGE_CONFIG;
  if (!CONFIG) return;

  function esc(text) {
    return String(text ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function monthLabel(monthKey) {
    const [y, m] = String(monthKey).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderMonthNav(registry, channelCode, selectedMonth) {
    const host = document.getElementById('monthNav');
    if (!host) return;
    const months = Object.entries((registry.channels?.[channelCode]?.months) || {})
      .sort((a, b) => b[0].localeCompare(a[0]));
    if (!months.length) {
      host.textContent = 'No months are registered for this channel yet.';
      return;
    }
    host.innerHTML = months.map(([monthKey, meta]) => {
      const isCurrent = registry.current?.[channelCode] === monthKey;
      const isSelected = selectedMonth === monthKey;
      const label = esc(meta.label || monthLabel(monthKey));
      const bits = [];
      if (isSelected) bits.push('viewing');
      if (isCurrent) bits.push('current');
      const suffix = bits.length ? ` <span style="opacity:.7">(${bits.join(', ')})</span>` : '';
      return `<a href="?month=${encodeURIComponent(monthKey)}" style="color:${isSelected ? '#fff' : '#cfd7ff'};text-decoration:${isSelected ? 'underline' : 'none'}">${label}</a>${suffix}`;
    }).join(' &nbsp;·&nbsp; ');
  }

  function renderAltChannelLink(registry, selectedMonth) {
    const link = document.getElementById('otherChannelLink');
    if (!link) return;
    const otherCode = CONFIG.channelCode === '13.1' ? '13.3' : '13.1';
    const otherLabel = otherCode === '13.1' ? '13.1' : '13.3';
    const months = registry.channels?.[otherCode]?.months || {};
    const otherMonth = months[selectedMonth] ? selectedMonth : (registry.current?.[otherCode] || Object.keys(months).sort().slice(-1)[0] || '');
    link.href = `${otherCode === '13.1' ? 'index131.v1.4.0.html' : 'index133.v1.4.0.html'}${otherMonth ? `?month=${encodeURIComponent(otherMonth)}` : ''}`;
    link.textContent = `Go to ${otherLabel}`;
  }


async function loadRegistry() {
  const unique = [];
  const primary = CONFIG.registryFile || 'data/month-registry.v1.4.1.json';
  const alternates = [
    primary,
    primary.replace('.v1.4.1.', '.v.1.4.1.'),
    primary.replace('.v1.4.1', '.v.1.4.1'),
    'data/month-registry.v1.4.1.json',
    'data/month-registry.v.1.4.1.json',
    'data/month-registry.v1.4.0.json',
    'data/month-registry.v.1.4.0.json'
  ];
  for (const item of alternates) {
    if (item && !unique.includes(item)) unique.push(item);
  }
  let lastErr = null;
  for (const candidate of unique) {
    try {
      const res = await fetch(`${candidate}?v=${encodeURIComponent(CONFIG.loaderVersion || CONFIG.buildVersion || 'v1')}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load ${candidate} (${res.status})`);
      const registry = await res.json();
      return { registry, path: candidate };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Month registry could not be loaded.');
}

async function boot() {
    try {
      const { registry } = await loadRegistry();
      const selectedMonth = new URLSearchParams(window.location.search).get('month') || registry.current?.[CONFIG.channelCode];
      const monthMeta = registry.channels?.[CONFIG.channelCode]?.months?.[selectedMonth];
      if (!selectedMonth || !monthMeta) throw new Error(`No registered month was found for ${CONFIG.channelLabel}.`);
      CONFIG.scheduleFile = monthMeta.scheduleFile;
      CONFIG.verificationFile = monthMeta.verificationFile;
      CONFIG.storageKey = monthMeta.storageKey || `${CONFIG.channelLabel.toLowerCase()}-${selectedMonth}-marks`;
      window.WNMU_CURRENT_MONTH_META = { monthKey: selectedMonth, registry, monthMeta };

      const heading = monthMeta.pageTitle || `${CONFIG.channelLabel} ${monthMeta.label || monthLabel(selectedMonth)}`;
      document.title = `${heading} Weekly Grids`;
      setText('pageHeading', heading);
      setText('pageSub', `${monthMeta.label || monthLabel(selectedMonth)} • current pages now resolve through a separate month registry so older months remain intact.`);
      renderMonthNav(registry, CONFIG.channelCode, selectedMonth);
      renderAltChannelLink(registry, selectedMonth);

      const script = document.createElement('script');
      script.src = `${CONFIG.sharedRendererFile}?loader=${encodeURIComponent(CONFIG.loaderVersion || CONFIG.buildVersion || 'v1')}`;
      script.defer = true;
      document.body.appendChild(script);
    } catch (err) {
      console.error(err);
      setText('pageHeading', `${CONFIG.channelLabel} current schedule`);
      const sub = document.getElementById('pageSub');
      if (sub) sub.textContent = `Month-registry load failed: ${err.message}`;
      const flag = document.getElementById('versionFlag');
      if (flag) flag.textContent = 'registry error';
      const coverage = document.getElementById('coverageFlag');
      if (coverage) coverage.textContent = 'registry error';
      const days = document.getElementById('daysFlag');
      if (days) days.textContent = 'registry error';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
