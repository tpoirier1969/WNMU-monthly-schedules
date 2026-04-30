(function () {
  'use strict';
  const VERSION = 'v1.5.43-new-season-auto-tag-helper';
  const JSON_CACHE_PREFIX = 'wnmu_json_cache_v1_3_1';
  const AUTO_STATE_PREFIX = '__wnmuAutoDerivedTags';
  const DISABLED_PREFIX = '__wnmuAutoDisabledTags';
  let installedAppendHook = false;
  let installedStorageHook = false;
  let reentry = false;
  let lastAutoEntryIds = new Set();
  window.WNMU_AUTO_TAG_HELPERS_VERSION = VERSION;
  function cfg(){ return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function storageKey(){ return cfg().storageKey || ''; }
  function buildVersion(){ return cfg().buildVersion || 'v1.5.43'; }
  function slugify(text){ return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function entryId(entry){ if (cfg().useSourceInId) return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}__${slugify(entry.sourceDate || entry.date)}__${slugify(entry.sourceTime || entry.time)}`; return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}`; }
  function parseDate(dateStr){ const d = new Date(`${dateStr}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
  function addDays(dateStr, days){ const d = parseDate(dateStr); if (!d) return ''; d.setDate(d.getDate() + days); return d.toISOString().slice(0,10); }
  function getWeekday(dateStr){ const d = parseDate(dateStr); return d ? d.toLocaleDateString('en-US', { weekday:'long' }) : ''; }
  function timeToSlot(timeStr){ const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return -1; return Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0); }
  function timeInRangeInclusive(timeStr, start, end){ const t = timeToSlot(timeStr); return t >= timeToSlot(start) && t <= timeToSlot(end); }
  function ruleMatches(entry, rule){ if (!rule) return false; const weekday = getWeekday(entry.date); if (rule.weekdays && !rule.weekdays.includes(weekday)) return false; if (rule.times && !rule.times.includes(entry.time)) return false; if (rule.range && !timeInRangeInclusive(entry.time, rule.range[0], rule.range[1])) return false; if (rule.titleIncludes){ const title = String(entry.title || '').toLowerCase(); if (!rule.titleIncludes.every(bit => title.includes(String(bit).toLowerCase()))) return false; } return true; }
  function matchesAny(entry, rules){ return (rules || []).some(rule => ruleMatches(entry, rule)); }
  function shouldAutoNewSeries(entry){ if (matchesAny(entry, cfg().suppressAllAutoRules)) return false; if (matchesAny(entry, cfg().suppressNewSeriesRules)) return false; return true; }
  function normTitle(value){ return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
  function readJson(key, fallback){ try { const raw = key && localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function writeJson(key, value){ if (!key) return; try { localStorage.setItem(key, JSON.stringify(value || {})); } catch(err){ console.warn('WNMU auto tag write skipped.', err); } }
  function scheduleCacheKey(kind){ const c = cfg(); const file = kind === 'schedule' ? c.scheduleFile : c.verificationFile; if (!file) return ''; return `${JSON_CACHE_PREFIX}::${kind}::${buildVersion()}::${file}`; }
  function readCachedSchedule(){ const key = scheduleCacheKey('schedule'); return key ? readJson(key, null) : null; }
  function tagsObject(mark){ if (!mark || typeof mark !== 'object') return {}; if (mark.tags && typeof mark.tags === 'object') return mark.tags; return mark; }
  function setTag(mark, tag, value){ const out = mark && typeof mark === 'object' ? { ...mark } : {}; const tags = out.tags && typeof out.tags === 'object' ? { ...out.tags } : {}; tags[tag] = !!value; out.tags = tags; return out; }
  function hasExplicitTag(mark, tag){ const tags = tagsObject(mark); return typeof tags[tag] === 'boolean'; }
  function autoStateKey(){ return storageKey() ? `${storageKey()}::${AUTO_STATE_PREFIX}.v1.5.43` : ''; }
  function disabledKey(){ return storageKey() ? `${storageKey()}::${DISABLED_PREFIX}.v1.5.43` : ''; }
  function detectNewSeasonEntries(schedule){
    const byDateTimeTitle = new Map(); const result = [];
    (schedule.days || []).forEach(day => (day.entries || []).forEach(entry => byDateTimeTitle.set(`${entry.date}__${entry.time}__${normTitle(entry.title)}`, entry)));
    (schedule.days || []).forEach(day => (day.entries || []).forEach(entry => {
      if (!entry.seasonStart || !shouldAutoNewSeries(entry)) return;
      const priorDate = addDays(entry.date, -7); if (!priorDate) return;
      const previous = byDateTimeTitle.get(`${priorDate}__${entry.time}__${normTitle(entry.title)}`);
      if (previous) result.push({ entry, previous });
    }));
    return result;
  }
  function applyDerivedMarks(){
    const key = storageKey(); const schedule = readCachedSchedule();
    if (!key || !schedule || !Array.isArray(schedule.days)) return;
    const marks = readJson(key, {}); const disabled = readJson(disabledKey(), {}); const candidates = detectNewSeasonEntries(schedule); const ids = new Set();
    const autoState = { version: VERSION, at: new Date().toISOString(), newSeasonEntryIds: [] };
    candidates.forEach(({ entry }) => {
      const id = entryId(entry); ids.add(id); autoState.newSeasonEntryIds.push(id);
      const existing = marks[id] || {}; const disabledTags = disabled[id] || {};
      if (disabledTags.newSeason === true || (hasExplicitTag(existing, 'newSeason') && tagsObject(existing).newSeason === false)) return;
      let next = existing;
      if (!hasExplicitTag(existing, 'newSeason')) next = setTag(next, 'newSeason', true);
      if (!hasExplicitTag(existing, 'newSeries')) next = setTag(next, 'newSeries', false);
      marks[id] = next;
    });
    lastAutoEntryIds = ids; writeJson(autoStateKey(), autoState); writeJson(key, marks);
    window.WNMU_AUTO_TAG_HELPERS_STATUS = { version: VERSION, newSeasonCount: candidates.length, storageKey: key, at: new Date().toISOString() };
  }
  function installStorageDisableHook(){
    if (installedStorageHook) return; installedStorageHook = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedAutoTagSetItem(key, value){
      if (reentry || key !== storageKey()) return originalSetItem.apply(this, arguments);
      const before = readJson(key, {}); const result = originalSetItem.apply(this, arguments);
      try {
        const after = JSON.parse(String(value || '{}')) || {}; const disabled = readJson(disabledKey(), {}); let changed = false;
        lastAutoEntryIds.forEach(id => {
          const beforeTags = tagsObject(before[id]); const afterTags = tagsObject(after[id]);
          if (beforeTags.newSeason === true && afterTags.newSeason !== true) {
            disabled[id] = { ...(disabled[id] || {}), newSeason: true, at: new Date().toISOString() };
            after[id] = setTag(after[id] || {}, 'newSeason', false); changed = true;
          }
        });
        if (changed) { reentry = true; try { originalSetItem.call(this, disabledKey(), JSON.stringify(disabled)); originalSetItem.call(this, key, JSON.stringify(after)); } finally { reentry = false; } }
      } catch(err){ console.warn('WNMU auto tag disable tracking skipped.', err); }
      return result;
    };
  }
  function installRendererAppendHook(){
    if (installedAppendHook) return; installedAppendHook = true;
    const originalAppendChild = Element.prototype.appendChild;
    Element.prototype.appendChild = function patchedAutoTagAppendChild(node){
      try { const src = node && node.tagName === 'SCRIPT' ? String(node.getAttribute('src') || '') : ''; if (/wnmu-monthly-shared/i.test(src)) applyDerivedMarks(); } catch(err){ console.warn('WNMU auto tag pre-render hook skipped.', err); }
      return originalAppendChild.call(this, node);
    };
  }
  function sanitizeVisibleHighlights(){
    const colors = { 'New Series':'var(--new-series)', 'New Season':'var(--new-season)', 'Highlight':'var(--highlight)', 'One Off':'var(--one-off)', 'Fundraiser':'var(--fundraiser)', "Programmer's Choice":'var(--programmers-choice)', 'Local':'var(--local)', 'Michigan':'var(--michigan)', 'Arts':'var(--arts)', 'Educational':'var(--educational)', 'Holiday':'var(--holiday)', 'Noteworthy':'var(--noteworthy)', 'Monthly topic':'var(--monthly-topic)' };
    const priority = ['Holiday','Fundraiser',"Programmer's Choice",'Michigan','Arts','Educational','Highlight','New Season','New Series','Local','One Off','Noteworthy','Monthly topic'];
    document.querySelectorAll('td.program-cell').forEach(cell => {
      const labels = Array.from(cell.querySelectorAll('.tag-pill')).map(el => (el.textContent || '').trim()).filter(Boolean);
      if (!labels.length) { cell.style.setProperty('--mark-background', '#fff'); cell.classList.remove('marked'); return; }
      const dominant = priority.find(label => labels.includes(label)) || labels[0];
      if (colors[dominant]) cell.style.setProperty('--mark-background', colors[dominant]); cell.classList.add('marked');
    });
  }
  function start(){
    installStorageDisableHook(); installRendererAppendHook(); [700,1400,2600,4200].forEach(ms => window.setTimeout(sanitizeVisibleHighlights, ms));
    const host = document.getElementById('weekGrids'); if (host && 'MutationObserver' in window){ const obs = new MutationObserver(() => window.requestAnimationFrame(sanitizeVisibleHighlights)); obs.observe(host, { childList:true, subtree:true }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();
