(function () {
  'use strict';
  const VERSION = 'v1.5.48-sales-programming-view-config-load-fix';
  const TABLE = 'wnmu_monthly_schedules_imported_months';
  const ROOT_ID = 'salesExportRoot';
  const START_SLOT = 12; // 6:00 AM
  const END_SLOT = 48;   // midnight, exclusive
  const CONTACT_PHONE = '906-227-1300';
  const CONTACT_WEB_DISPLAY = 'www.nmu.edu/ptv13';
  const CONTACT_WEB_HREF = 'http://www.nmu.edu/ptv13';

  window.WNMU_SALES_EXPORT_VERSION = VERSION;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function supabaseCfg() {
    return window.WNMU_SHAREBOARD_SUPABASE
      || window.WNMU_SUPABASE_CONFIG
      || window.WNMU_SUPABASE
      || {};
  }
  function params() { return new URLSearchParams(window.location.search); }
  function channelCode() { return params().get('channel') || cfg().channelCode || '13.1'; }
  function monthKey() { return params().get('month') || ''; }
  function channelLabel() { return cfg().channelLabel || (channelCode() === '13.3' ? 'WNMU3PL' : 'WNMU1HD'); }
  function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function timeToSlot(time) { const m = String(time || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0) : -1; }
  function slotToTime(slot) { const h = Math.floor(slot / 2); return `${pad(h)}:${slot % 2 ? '30' : '00'}`; }
  function fmtTime(slot) {
    const h24 = Math.floor(slot / 2);
    const min = slot % 2 ? ':30' : ':00';
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = ((h24 + 11) % 12) + 1;
    if (slot === 48) return '12:00 AM';
    return `${h12}${min} ${suffix}`;
  }
  function fmtMonth(month) {
    const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return month || 'Current Month';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function fmtDay(dateStr, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', opts);
  }
  function weekday(dateStr) { return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }); }
  function inRange(slot, start, end) { return slot >= timeToSlot(start) && slot < timeToSlot(end); }
  function isWeekday(dateStr) { return ['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(weekday(dateStr)); }
  function norm(value) { return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function entryTitle(entry) { return String(entry?.title || '').trim(); }
  function entryEpisode(entry) { return String(entry?.episode || '').trim(); }
  function slotCount(entry) { return Math.max(1, Math.round(Number(entry?.slotCount || entry?.durationMin / 30 || 1))); }
  function titleLine(entry) {
    const title = entryTitle(entry);
    const episode = entryEpisode(entry);
    if (!title) return '';
    return episode ? `${title}: ${episode}` : title;
  }
  function shortTitle(entry) {
    const full = titleLine(entry);
    return full.length > 82 ? full.slice(0, 79).trim() + '…' : full;
  }

  async function rest(pathAndQuery) {
    const c = supabaseCfg();
    if (!c.url || !c.anonKey) throw new Error('config.js is missing Supabase credentials.');
    const res = await fetch(`${c.url}${pathAndQuery}`, {
      headers: { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}` },
      cache: 'no-store'
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase imported month read failed (${res.status}) ${txt}`.trim());
    }
    return res.json();
  }

  async function fetchSchedule() {
    const channel = channelCode();
    const month = monthKey();
    const select = 'channel_code,month_key,schedule_json,verification_json,updated_at';
    let url = `/rest/v1/${TABLE}?select=${encodeURIComponent(select)}&channel_code=eq.${encodeURIComponent(channel)}`;
    if (month) url += `&month_key=eq.${encodeURIComponent(month)}`;
    else url += '&order=month_key.desc';
    url += '&limit=1';
    const rows = await rest(url);
    if (!Array.isArray(rows) || !rows.length) throw new Error(`No imported schedule found for ${channel}${month ? ' ' + month : ''}.`);
    return rows[0];
  }

  function buildDayLookup(schedule) {
    const out = new Map();
    (schedule.days || []).forEach(day => out.set(day.date, day));
    return out;
  }

  function entryForSlot(day, slot) {
    const entries = Array.isArray(day?.entries) ? day.entries : [];
    for (const entry of entries) {
      const start = timeToSlot(entry.time);
      const end = start + slotCount(entry);
      if (start >= 0 && slot >= start && slot < end) return entry;
    }
    return null;
  }

  function hasAny(text, needles) {
    const n = norm(text);
    return needles.some(bit => n.includes(norm(bit)));
  }

  function classify(entry, day, slot) {
    const date = day?.date || '';
    const wd = weekday(date);
    const title = entryTitle(entry);
    const episode = entryEpisode(entry);
    const combined = `${title} ${episode}`;
    const lower = norm(combined);

    // Large sales-friendly daypart blocks.
    if (isWeekday(date) && inRange(slot, '08:30', '14:00')) {
      return { label: 'Children\u2019s Programming', detail: '', cls: 'kids', titleMode: 'block' };
    }
    if (wd === 'Sunday' && inRange(slot, '20:00', '23:00')) {
      return { label: 'Masterpiece / British Drama', detail: '', cls: 'drama', titleMode: 'block' };
    }

    // Sponsorship-useful categories with titles preserved.
    if (hasAny(combined, ['kitchen','cook','cooking','chef','food','foods','table','taste','plate','baking','bake','restaurant','restaurants','cuisine','mexican','milk street','test kitchen','dining','meal','spice','flavor','feast','barbecue','bbq','grill'])) {
      return { label: 'Food & Cooking', detail: shortTitle(entry), cls: 'food', titleMode: 'title' };
    }
    if (hasAny(combined, ['travel','travels','places','place','europe','roadtrip','road trip','world','journey','journeys','great getaways','destination','destinations','samantha brown','rick steves','globe','adventure'])) {
      return { label: 'Travel / Lifestyle', detail: shortTitle(entry), cls: 'travel', titleMode: 'title' };
    }
    if (hasAny(combined, ['michigan','upper michigan','upper peninsula','detroit','great lakes','lake superior','mackinac','yooper','marquette'])) {
      return { label: 'Michigan / Regional', detail: shortTitle(entry), cls: 'michigan', titleMode: 'title' };
    }
    if (hasAny(combined, ['wnmu','media meet','ask the','local','native report','indian country','finlandia','nmu','northern michigan'])) {
      return { label: 'Local Programming', detail: shortTitle(entry), cls: 'local', titleMode: 'title' };
    }
    if (hasAny(combined, ['great performances','austin city limits','symphony','opera','theatre','theater','music','concert','arts','painting','art','artist','ballet','dance','gallery','craft','crafts','song','stage'])) {
      return { label: 'Arts / Performance', detail: shortTitle(entry), cls: 'arts', titleMode: 'title' };
    }
    if (hasAny(combined, ['nature','nova','science','planet','space','wild','wildlife','animals','earth','ocean','forest','engineering','universe','cosmos','evolution'])) {
      return { label: 'Nature / Science', detail: shortTitle(entry), cls: 'science', titleMode: 'title' };
    }
    if (hasAny(combined, ['american experience','history','historic','war','civil war','revolution','president','presidents','frontline','independent lens','pov','documentary','secrets of the dead','american masters','roots','genealogy','finding your roots','biography'])) {
      return { label: 'History / Documentary', detail: shortTitle(entry), cls: 'documentary', titleMode: 'title' };
    }
    if (hasAny(combined, ['news','newshour','bbc','amanpour','washington week','firing line','to the contrary','open mind','dw focus','consuelo mack','wealthtrack','public square'])) {
      return { label: 'News / Public Affairs', detail: '', cls: 'news', titleMode: 'block' };
    }
    if (hasAny(combined, ['masterpiece','mystery','midsomer','grantchester','miss scarlet','all creatures','call the midwife','death in paradise','professor t','bbc','drama'])) {
      return { label: 'Drama / Mystery', detail: shortTitle(entry), cls: 'drama', titleMode: 'title' };
    }
    if (hasAny(combined, ['antiques','home','house','garden','woodsmith','this old house','ask this old house','craftsman','quilting','sewing','painting and travel'])) {
      return { label: 'Home / Lifestyle', detail: shortTitle(entry), cls: 'lifestyle', titleMode: 'title' };
    }

    // Keep the fallback clean for a leave-behind. It is not an ops schedule.
    return { label: 'PBS Series / Specials', detail: '', cls: 'general', titleMode: 'block' };
  }

  function blankBlock() { return { label: 'Open / TBA', detail: '', cls: 'blank', titleMode: 'block' }; }
  function blockKey(block) { return `${block.label}||${block.detail}||${block.cls}`; }

  function daySegments(day) {
    const segments = [];
    let current = null;
    for (let slot = START_SLOT; slot < END_SLOT; slot += 1) {
      const entry = entryForSlot(day, slot);
      const block = entry ? classify(entry, day, slot) : blankBlock();
      if (!current || blockKey(current) !== blockKey(block)) {
        if (current) segments.push(current);
        current = { ...block, startSlot: slot, endSlot: slot + 1 };
      } else {
        current.endSlot = slot + 1;
      }
    }
    if (current) segments.push(current);
    return segments;
  }

  function segmentStartingAt(segments, slot) { return segments.find(seg => seg.startSlot === slot); }
  function segmentCovering(segments, slot) { return segments.find(seg => slot >= seg.startSlot && slot < seg.endSlot); }

  function buildWeekTable(schedule, week, weekIndex, dayLookup) {
    const weekDates = week.filter(day => day.inMonth);
    const rangeStart = weekDates[0]?.date || week[0]?.date || '';
    const rangeEnd = weekDates[weekDates.length - 1]?.date || week[6]?.date || '';
    const segmentsByDay = week.map(dayRef => dayRef.inMonth ? daySegments(dayLookup.get(dayRef.date) || dayRef) : []);

    let html = `<section class="sales-week"><h2>Week ${weekIndex + 1} <span>${esc(fmtDay(rangeStart))} – ${esc(fmtDay(rangeEnd))}</span></h2>`;
    html += '<table class="sales-grid"><thead><tr><th class="time-col">Time</th>';
    week.forEach(day => {
      html += `<th class="day-head${day.inMonth ? '' : ' outside'}">${esc(day.dayName || weekday(day.date))}<br><span>${esc(fmtDay(day.date, { month: 'short', day: 'numeric' }))}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    for (let slot = START_SLOT; slot < END_SLOT; slot += 1) {
      html += `<tr><td class="time-col">${esc(fmtTime(slot))}</td>`;
      week.forEach((day, dayIndex) => {
        if (!day.inMonth) {
          html += '<td class="outside"></td>';
          return;
        }
        const segs = segmentsByDay[dayIndex];
        const covering = segmentCovering(segs, slot);
        if (!covering || covering.startSlot !== slot) return;
        const span = covering.endSlot - covering.startSlot;
        const label = esc(covering.label);
        const detail = covering.detail ? `<div class="sales-detail">${esc(covering.detail)}</div>` : '';
        const timeRange = `<div class="sales-range">${esc(fmtTime(covering.startSlot))}–${esc(fmtTime(covering.endSlot))}</div>`;
        html += `<td class="sales-block sales-${esc(covering.cls)}" rowspan="${span}"><div class="sales-label">${label}</div>${detail}${timeRange}</td>`;
      });
      html += '</tr>';
    }
    html += '</tbody></table></section>';
    return html;
  }

  function buildLegend() {
    const items = [
      ['kids', 'Children\u2019s Programming'], ['news', 'News / Public Affairs'], ['food', 'Food & Cooking'], ['travel', 'Travel / Lifestyle'],
      ['michigan', 'Michigan / Regional'], ['local', 'Local Programming'], ['arts', 'Arts / Performance'], ['science', 'Nature / Science'],
      ['documentary', 'History / Documentary'], ['drama', 'Masterpiece / Drama'], ['lifestyle', 'Home / Lifestyle'], ['general', 'PBS Series / Specials']
    ];
    return '<div class="sales-legend">' + items.map(([cls, label]) => `<span><i class="sales-${cls}"></i>${esc(label)}</span>`).join('') + '</div>';
  }

  function injectStyles() {
    if (document.getElementById('wnmuSalesExportStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuSalesExportStyles';
    style.textContent = `
      :root {
        --sales-ink:#16243b; --sales-line:#9aa8ba; --sales-muted:#536176;
        --sales-kids:#fff3b8; --sales-news:#e4edf8; --sales-food:#ffe1c2; --sales-travel:#e6f0d2;
        --sales-michigan:#dbeeff; --sales-local:#e2f5df; --sales-arts:#eadfff; --sales-science:#dff2f2;
        --sales-documentary:#ece3d6; --sales-drama:#efdff4; --sales-lifestyle:#f2ead6; --sales-general:#f2f4f7; --sales-blank:#ffffff;
      }
      * { box-sizing:border-box; }
      body.sales-export-page { margin:0; background:#e9eef5; color:var(--sales-ink); font:12px/1.25 Arial, Helvetica, sans-serif; }
      .sales-export-root { max-width:1500px; margin:0 auto; padding:18px 20px 28px; }
      .sales-loading,.sales-error { background:#fff; border:1px solid #cdd6e3; border-radius:12px; padding:18px; box-shadow:0 4px 18px rgba(0,0,0,.08); }
      .sales-error { color:#8a1f1f; }
      .sales-topbar { display:flex; align-items:center; justify-content:space-between; gap:20px; background:#fff; border:1px solid #c9d4e2; border-radius:14px; padding:14px 16px; margin-bottom:12px; box-shadow:0 4px 16px rgba(0,0,0,.07); }
      .sales-brand { display:flex; align-items:center; gap:18px; min-width:0; }
      .sales-logo { width:310px; max-width:34vw; height:auto; display:block; }
      .sales-title h1 { margin:0 0 4px; font-size:24px; color:#17345f; line-height:1.1; }
      .sales-title .sub { color:var(--sales-muted); font-size:13px; }
      .sales-contact { text-align:right; color:#1b2d49; font-size:13px; line-height:1.45; white-space:nowrap; }
      .sales-contact a { color:#17345f; text-decoration:none; font-weight:700; }
      .sales-actions { display:flex; justify-content:flex-end; gap:10px; margin:0 0 10px; }
      .sales-actions button,.sales-actions a { border:1px solid #b9c6d6; background:#fff; color:#17345f; padding:8px 11px; border-radius:10px; text-decoration:none; font-weight:700; cursor:pointer; }
      .sales-note { margin:0 0 12px; color:#536176; font-size:12px; }
      .sales-legend { display:flex; gap:7px 12px; flex-wrap:wrap; background:#fff; border:1px solid #c9d4e2; border-radius:12px; padding:9px 11px; margin-bottom:12px; }
      .sales-legend span { display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
      .sales-legend i { width:16px; height:12px; border:1px solid rgba(0,0,0,.2); display:inline-block; border-radius:3px; }
      .sales-kids{background:var(--sales-kids)!important}.sales-news{background:var(--sales-news)!important}.sales-food{background:var(--sales-food)!important}.sales-travel{background:var(--sales-travel)!important}.sales-michigan{background:var(--sales-michigan)!important}.sales-local{background:var(--sales-local)!important}.sales-arts{background:var(--sales-arts)!important}.sales-science{background:var(--sales-science)!important}.sales-documentary{background:var(--sales-documentary)!important}.sales-drama{background:var(--sales-drama)!important}.sales-lifestyle{background:var(--sales-lifestyle)!important}.sales-general{background:var(--sales-general)!important}.sales-blank{background:var(--sales-blank)!important}
      .sales-week { background:#fff; border:1px solid #c9d4e2; border-radius:14px; padding:12px; margin:0 0 16px; box-shadow:0 4px 16px rgba(0,0,0,.06); page-break-after:always; }
      .sales-week h2 { margin:0 0 8px; font-size:18px; color:#17345f; display:flex; justify-content:space-between; gap:16px; }
      .sales-week h2 span { color:#536176; font-size:13px; align-self:end; }
      table.sales-grid { border-collapse:collapse; width:100%; table-layout:fixed; }
      .sales-grid th,.sales-grid td { border:1px solid var(--sales-line); vertical-align:top; }
      .sales-grid th { background:#eaf0f7; color:#17345f; padding:5px 4px; font-size:11px; text-align:center; }
      .sales-grid th span { font-weight:400; color:#40526d; }
      .sales-grid .time-col { width:74px; background:#eef3f8; color:#17345f; text-align:center; font-weight:700; padding:4px 3px; font-size:10px; }
      .sales-block { padding:5px 6px; min-height:24px; overflow:hidden; }
      .sales-label { font-weight:800; font-size:11.5px; color:#17243b; }
      .sales-detail { margin-top:3px; font-size:10.5px; color:#263a56; line-height:1.18; }
      .sales-range { margin-top:4px; font-size:9px; color:#657187; }
      .outside { background:#f7f8fa !important; color:#a0a8b4; }
      @media print {
        @page { size: landscape; margin:0.35in; }
        body.sales-export-page { background:#fff; font-size:9px; }
        .sales-export-root { max-width:none; padding:0; }
        .sales-actions { display:none; }
        .sales-topbar,.sales-legend,.sales-week { box-shadow:none; border-color:#9aa8ba; border-radius:0; }
        .sales-topbar { padding:7px 8px; margin-bottom:6px; }
        .sales-logo { width:230px; max-width:230px; }
        .sales-title h1 { font-size:18px; }
        .sales-title .sub,.sales-contact { font-size:10px; }
        .sales-note { font-size:9px; margin-bottom:6px; }
        .sales-legend { padding:5px 6px; margin-bottom:6px; gap:4px 8px; font-size:8.5px; }
        .sales-legend i { width:12px; height:9px; }
        .sales-week { padding:6px; margin:0; page-break-after:always; }
        .sales-week h2 { font-size:13px; margin-bottom:4px; }
        .sales-week h2 span { font-size:9px; }
        .sales-grid .time-col { width:54px; font-size:8px; padding:2px; }
        .sales-grid th { font-size:8.5px; padding:2px; }
        .sales-block { padding:3px 4px; }
        .sales-label { font-size:8.8px; }
        .sales-detail { font-size:7.6px; }
        .sales-range { font-size:6.8px; }
      }
    `;
    document.head.appendChild(style);
  }

  function render(row) {
    const schedule = row.schedule_json || {};
    const dayLookup = buildDayLookup(schedule);
    const month = row.month_key || monthKey() || schedule.month || '';
    const channel = row.channel_code || channelCode();
    const weeks = Array.isArray(schedule.weeks) ? schedule.weeks : [];
    const scheduleHref = channel === '13.3' ? `index133.v1.4.1.html?month=${encodeURIComponent(month)}&v=1.5.48` : `index131.v1.4.1.html?month=${encodeURIComponent(month)}&v=1.5.48`;

    let html = `
      <header class="sales-topbar">
        <div class="sales-brand">
          <img class="sales-logo" src="wnmu-tv-logo-1-line-black.png" alt="WNMU-TV">
          <div class="sales-title">
            <h1>Monthly Sponsorship Programming Guide</h1>
            <div class="sub">${esc(channelLabel())} • ${esc(fmtMonth(month))} • 6:00 AM–12:00 AM</div>
          </div>
        </div>
        <div class="sales-contact">
          <div><strong>Underwriting / Sponsorship</strong></div>
          <div>Phone: ${esc(CONTACT_PHONE)}</div>
          <div>Web: <a href="${esc(CONTACT_WEB_HREF)}">${esc(CONTACT_WEB_DISPLAY)}</a></div>
        </div>
      </header>
      <div class="sales-actions"><a href="${esc(scheduleHref)}">Back to schedule</a><button type="button" id="salesPrintBtn">Print / Save PDF</button></div>
      <p class="sales-note">Sales-facing view: broad blocks are simplified, while sponsor-useful categories such as food, travel, Michigan/regional, local, arts, science, and documentary programming retain program titles where helpful.</p>
      ${buildLegend()}`;

    if (!weeks.length) {
      html += '<div class="sales-error">No week grid was found in this imported month.</div>';
    } else {
      weeks.forEach((week, idx) => { html += buildWeekTable(schedule, week, idx, dayLookup); });
    }

    const root = document.getElementById(ROOT_ID);
    root.innerHTML = html;
    document.getElementById('salesPrintBtn')?.addEventListener('click', () => window.print());
  }

  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function waitForSupabaseConfig() {
    for (let i = 0; i < 30; i += 1) {
      const c = supabaseCfg();
      if (c && c.url && c.anonKey) return c;
      await delay(100);
    }
    const loadedScripts = Array.from(document.scripts || []).map(s => s.getAttribute('src') || '[inline]').join(', ');
    throw new Error('config.js loaded, but Supabase credentials were not found on window.WNMU_SHAREBOARD_SUPABASE. Regular schedule pages may still work if they are using an older cached page; check that config.js is present at this folder root. Loaded scripts: ' + loadedScripts);
  }

  async function start() {
    injectStyles();
    try {
      await waitForSupabaseConfig();
      const row = await fetchSchedule();
      render(row);
    } catch (err) {
      console.error(`${VERSION}: failed`, err);
      const root = document.getElementById(ROOT_ID);
      if (root) root.innerHTML = `<div class="sales-error"><strong>Could not build Sales View.</strong><br>${esc(err.message || String(err))}<br><br><small>v1.5.48 note: the Sales View now loads config.js directly before the export script and waits for credentials before reading Supabase.</small></div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
