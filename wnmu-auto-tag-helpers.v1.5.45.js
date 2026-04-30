(function () {
  'use strict';
  const VERSION = 'v1.5.45-fast-auto-tag-visible-state';
  const JSON_CACHE_PREFIX = 'wnmu_json_cache_v1_3_1';
  const AUTO_STATE_PREFIX = '__wnmuAutoDerivedTags';
  const DISABLED_PREFIX = '__wnmuAutoDisabledTags';
  const COLOR_OVERRIDES = {
    newSeries: '#fff9cc',
    newSeason: '#e8f7f5',
    highlight: '#ffe3bd',
    oneOff: '#f9e0e0',
    monthlyTopic: '#f0e9ff',
    fundraiser: 'var(--fundraiser)',
    programmersChoice: '#e8f5d2',
    holiday: '#efe5ff',
    noteworthy: '#fff5d6',
    educational: '#e8f4ff',
    local: '#f5fcf3',
    michigan: '#f4fbff',
    arts: '#f2eaff',
    satelliteFeed: '#eeeeee'
  };

  let installedAppendHook = false;
  let installedStorageHook = false;
  let installedObservers = false;
  let reentry = false;
  let lastAutoEntryIds = new Set();
  let sanitizeTimer = 0;
  let menuTimer = 0;

  window.WNMU_AUTO_TAG_HELPERS_VERSION = VERSION;

  function cfg(){ return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function storageKey(){ return cfg().storageKey || ''; }
  function buildVersion(){ return cfg().buildVersion || 'v1.5.45'; }
  function css(value){ return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'); }
  function slugify(text){ return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function entryId(entry){ if (cfg().useSourceInId) return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}__${slugify(entry.sourceDate || entry.date)}__${slugify(entry.sourceTime || entry.time)}`; return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}`; }
  function parseEntryId(id){ const m = String(id || '').match(/^(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})__/); return m ? { date:m[1], time:m[2] } : null; }
  function parseDate(dateStr){ const d = new Date(`${dateStr}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
  function addDays(dateStr, days){ const d = parseDate(dateStr); if (!d) return ''; d.setDate(d.getDate() + days); return d.toISOString().slice(0,10); }
  function getWeekday(dateStr){ const d = parseDate(dateStr); return d ? d.toLocaleDateString('en-US', { weekday:'long' }) : ''; }
  function timeToSlot(timeStr){ const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return -1; return Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0); }
  function timeInRangeInclusive(timeStr, start, end){ const t = timeToSlot(timeStr); return t >= timeToSlot(start) && t <= timeToSlot(end); }
  function ruleMatches(entry, rule){ if (!rule) return false; const weekday = getWeekday(entry.date); if (rule.weekdays && !rule.weekdays.includes(weekday)) return false; if (rule.times && !rule.times.includes(entry.time)) return false; if (rule.range && !timeInRangeInclusive(entry.time, rule.range[0], rule.range[1])) return false; if (rule.titleIncludes){ const title = String(entry.title || '').toLowerCase(); if (!rule.titleIncludes.every(bit => title.includes(String(bit).toLowerCase()))) return false; } return true; }
  function matchesAny(entry, rules){ return (rules || []).some(rule => ruleMatches(entry, rule)); }
  function isAutoSuppressed(entry){ return matchesAny(entry, cfg().suppressAllAutoRules); }
  function shouldAutoNewSeries(entry){ if (isAutoSuppressed(entry)) return false; if (matchesAny(entry, cfg().suppressNewSeriesRules)) return false; return true; }
  function normTitle(value){ return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
  function readJson(key, fallback){ try { const raw = key && localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function writeJson(key, value){ if (!key) return; try { localStorage.setItem(key, JSON.stringify(value || {})); } catch(err){ console.warn('WNMU auto tag write skipped.', err); } }
  function scheduleCacheKey(kind){ const c = cfg(); const file = kind === 'schedule' ? c.scheduleFile : c.verificationFile; if (!file) return ''; return `${JSON_CACHE_PREFIX}::${kind}::${buildVersion()}::${file}`; }
  function readCachedSchedule(){ const key = scheduleCacheKey('schedule'); return key ? readJson(key, null) : null; }
  function tagsObject(mark){ if (!mark || typeof mark !== 'object') return {}; if (mark.tags && typeof mark.tags === 'object') return mark.tags; return mark; }
  function setTag(mark, tag, value){ const out = mark && typeof mark === 'object' ? { ...mark } : {}; const tags = out.tags && typeof out.tags === 'object' ? { ...out.tags } : {}; tags[tag] = !!value; out.tags = tags; return out; }
  function hasExplicitTag(mark, tag){ const tags = tagsObject(mark); return typeof tags[tag] === 'boolean'; }
  function autoStateKey(){ return storageKey() ? `${storageKey()}::${AUTO_STATE_PREFIX}.v1` : ''; }
  function disabledKey(){ return storageKey() ? `${storageKey()}::${DISABLED_PREFIX}.v1` : ''; }
  function tagOrder(){ return Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : []; }
  function tagPriority(){ return Array.isArray(cfg().tagPriority) ? cfg().tagPriority.slice() : tagOrder(); }
  function tagMeta(){ return cfg().tagMeta || {}; }
  function tagLabel(tag){ return tagMeta()[tag]?.label || (tag === 'satelliteFeed' ? 'Satellite Feed' : tag); }
  function colorFor(tag){ return COLOR_OVERRIDES[tag] || tagMeta()[tag]?.color || '#fff'; }
  function labelToTagMap(){ const out = {}; Object.entries(tagMeta()).forEach(([tag, meta]) => { out[String(meta?.label || tag).trim()] = tag; }); out['Satellite Feed'] = 'satelliteFeed'; return out; }
  function activeTagList(tags){ return tagOrder().filter(tag => !!(tags && tags[tag])); }
  function dominantTag(tags){ const active = activeTagList(tags); const priority = tagPriority(); return priority.find(tag => active.includes(tag)) || active[0] || ''; }
  function hasAnyExplicitStoredTag(tags){ return tagOrder().some(tag => typeof tags[tag] === 'boolean'); }

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

  function scheduleSanitize(delay){ window.clearTimeout(sanitizeTimer); sanitizeTimer = window.setTimeout(sanitizeVisibleHighlights, delay ?? 80); }
  function scheduleMenuPopulate(delay){ window.clearTimeout(menuTimer); menuTimer = window.setTimeout(populateMenuEffectiveTags, delay ?? 30); }

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
      scheduleSanitize(10); scheduleMenuPopulate(10);
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

  function storedTagsForEntryId(entryId){ const key = storageKey(); if (!key || !entryId) return {}; return tagsObject(readJson(key, {})[entryId]); }
  function hasManualTrueTags(entryId){ const tags = storedTagsForEntryId(entryId); return Object.keys(tags).some(tag => tags[tag] === true && tag !== 'satelliteFeed'); }
  function cellEntryInfo(cell){ const parsed = parseEntryId(cell?.dataset?.entryId || ''); const title = cell?.querySelector?.('.program-title')?.textContent || ''; return parsed ? { ...parsed, title } : null; }
  function isSuppressedSatelliteCell(cell){ const info = cellEntryInfo(cell); return info ? isAutoSuppressed(info) : false; }
  function labelsForCell(cell){ return Array.from(cell.querySelectorAll('.tag-pill')).map(el => (el.textContent || '').trim()).filter(Boolean); }
  function tagsFromLabels(labels){ const map = labelToTagMap(); const out = {}; labels.forEach(label => { const tag = map[label]; if (tag) out[tag] = true; }); return out; }

  function effectiveTagsForCell(cell){
    const entryId = cell.dataset.entryId || '';
    const stored = storedTagsForEntryId(entryId);
    if (hasAnyExplicitStoredTag(stored)) {
      const out = {};
      tagOrder().forEach(tag => { out[tag] = stored[tag] === true; });
      return out;
    }
    if (isSuppressedSatelliteCell(cell) && !hasManualTrueTags(entryId)) return {};
    return tagsFromLabels(labelsForCell(cell));
  }

  function clearCellVisual(cell){
    cell.querySelectorAll('.program-tags').forEach(el => el.remove());
    cell.style.removeProperty('--mark-background');
    cell.classList.remove('marked');
  }

  function renderTags(cell, tags){
    const active = activeTagList(tags);
    cell.querySelectorAll('.program-tags').forEach(el => el.remove());
    if (!active.length) { clearCellVisual(cell); return; }
    const dom = dominantTag(tags);
    cell.style.setProperty('--mark-background', colorFor(dom));
    cell.classList.add('marked');
    const content = cell.querySelector('.program-content');
    if (content) {
      const wrap = document.createElement('div');
      wrap.className = 'program-tags';
      wrap.innerHTML = active.slice(0, 6).map(tag => `<span class="tag-pill" style="--tag-color:${colorFor(tag)}">${tagLabel(tag)}</span>`).join('');
      content.appendChild(wrap);
    }
  }

  function sanitizeVisibleHighlights(){
    document.querySelectorAll('td.program-cell[data-entry-id]').forEach(cell => renderTags(cell, effectiveTagsForCell(cell)));
  }

  function cellForMenu(menu){
    const date = menu?.dataset?.wnmuDate || ''; const time = menu?.dataset?.wnmuTime || '';
    if (!date || !time) return null;
    const exact = document.querySelector(`td.program-cell[data-entry-id^="${css(`${date}__${time}__`)}"]`);
    if (exact) return exact;
    let best = null;
    document.querySelectorAll('td.program-cell[data-entry-id]').forEach(cell => {
      const info = cellEntryInfo(cell); if (!info || info.date !== date) return;
      const start = timeToSlot(info.time), wanted = timeToSlot(time); const span = Math.max(1, Number(cell.rowSpan || cell.getAttribute('rowspan') || 1));
      if (wanted >= start && wanted < start + span) best = cell;
    });
    return best;
  }

  function populateMenuEffectiveTags(){
    const menu = document.getElementById('wnmuCellMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    const form = menu.querySelector('#wnmuCellForm') || menu.querySelector('form');
    const sig = `${menu.dataset.wnmuCellKey || ''}::${menu.dataset.wnmuDate || ''}::${menu.dataset.wnmuTime || ''}`;
    if (form && form.dataset.wnmuEffectiveTagsPopulated === sig) return;
    const cell = cellForMenu(menu); if (!cell) return;
    const effective = effectiveTagsForCell(cell);
    tagOrder().forEach(tag => {
      const input = menu.querySelector(`input[name="${css(tag)}"]`); if (!input) return;
      input.checked = !!effective[tag];
      const row = input.closest('.check-row');
      if (row) row.style.background = colorFor(tag);
    });
    const sat = menu.querySelector('input[name="satelliteFeed"]');
    if (sat) {
      const row = sat.closest('.check-row');
      if (row) row.style.background = colorFor('satelliteFeed');
    }
    if (form) form.dataset.wnmuEffectiveTagsPopulated = sig;
  }

  function installObservers(){
    if (installedObservers) return; installedObservers = true;
    if ('MutationObserver' in window) {
      const bodyObs = new MutationObserver(mutations => {
        if (mutations.some(m => Array.from(m.addedNodes || []).some(n => n && n.nodeType === 1 && (n.id === 'wnmuCellMenu' || n.querySelector?.('#wnmuCellMenu'))))) scheduleMenuPopulate(20);
      });
      bodyObs.observe(document.body, { childList:true, subtree:true });
      const host = document.getElementById('weekGrids');
      if (host) {
        const gridObs = new MutationObserver(() => scheduleSanitize(100));
        gridObs.observe(host, { childList:true, subtree:true });
      }
    }
    [300,700,1400,2600,4200].forEach(ms => window.setTimeout(() => { populateMenuEffectiveTags(); sanitizeVisibleHighlights(); }, ms));
  }

  function start(){
    installStorageDisableHook(); installRendererAppendHook(); installObservers();
    [700,1400,2600,4200].forEach(ms => window.setTimeout(sanitizeVisibleHighlights, ms));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();
