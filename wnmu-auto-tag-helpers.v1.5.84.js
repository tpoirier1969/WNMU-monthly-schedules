(function () {
  'use strict';
  const VERSION = 'v1.5.84-auto-tags-preserve-satellite-background';
  const JSON_CACHE_PREFIX = 'wnmu_json_cache_v1_3_1';
  const AUTO_STATE_PREFIX = '__wnmuAutoDerivedTags';
  const DISABLED_PREFIX = '__wnmuAutoDisabledTags';
  const SATELLITE_KEY = 'satelliteFeed';
  const OTHER_KEY = 'other';
  const COLOR_OVERRIDES = {
    newSeries: '#fff9cc',
    newSeason: '#e6f6f3',
    highlight: '#ffe3bd',
    oneOff: '#f9e0e0',
    monthlyTopic: '#f0e9ff',
    other: '#f3eef7',
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
  let installedMenuSync = false;
  let reentry = false;
  let lastAutoEntryIds = new Set();
  let sanitizeTimer = 0;
  let menuTimer = 0;
  let sanitizeActive = false;
  let scheduleIndexCache = null;
  let scheduleIndexCacheKey = '';

  window.WNMU_AUTO_TAG_HELPERS_VERSION = VERSION;

  function cfg(){ return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function storageKey(){ return cfg().storageKey || ''; }
  function buildVersion(){ return cfg().buildVersion || 'v1.5.64'; }
  function css(value){ return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'); }
  function slugify(text){ return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function entryId(entry){
    if (!entry) return '';
    if (cfg().useSourceInId) return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}__${slugify(entry.sourceDate || entry.date)}__${slugify(entry.sourceTime || entry.time)}`;
    return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}`;
  }
  function parseEntryId(id){ const m = String(id || '').match(/^(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})__/); return m ? { date:m[1], time:m[2] } : null; }
  function parseDate(dateStr){ const d = new Date(`${dateStr}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
  function addDays(dateStr, days){ const d = parseDate(dateStr); if (!d) return ''; d.setDate(d.getDate() + days); return d.toISOString().slice(0,10); }
  function getWeekday(dateStr){ const d = parseDate(dateStr); return d ? d.toLocaleDateString('en-US', { weekday:'long' }) : ''; }
  function timeToSlot(timeStr){ const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return -1; return Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0); }
  function timeInRangeInclusive(timeStr, start, end){ const t = timeToSlot(timeStr); return t >= timeToSlot(start) && t <= timeToSlot(end); }
  function ruleMatches(entry, rule){
    if (!entry || !rule) return false;
    const weekday = getWeekday(entry.date);
    if (rule.weekdays && !rule.weekdays.includes(weekday)) return false;
    if (rule.times && !rule.times.includes(entry.time)) return false;
    if (rule.range && !timeInRangeInclusive(entry.time, rule.range[0], rule.range[1])) return false;
    if (rule.titleIncludes){ const title = String(entry.title || '').toLowerCase(); if (!rule.titleIncludes.every(bit => title.includes(String(bit).toLowerCase()))) return false; }
    return true;
  }
  function matchesAny(entry, rules){ return (rules || []).some(rule => ruleMatches(entry, rule)); }
  function isAutoSuppressed(entry){ return matchesAny(entry, cfg().suppressAllAutoRules); }
  function shouldAutoSeasonStart(entry){ if (!entry || !entry.seasonStart) return false; if (matchesAny(entry, cfg().suppressSeasonStartRules || [])) return false; return true; }
  function shouldAutoNewSeries(entry){ return shouldAutoSeasonStart(entry); }
  function shouldApplyAutoTag(entry, tag){ if (tag === 'newSeries' || tag === 'newSeason') return shouldAutoSeasonStart(entry); if (isAutoSuppressed(entry)) return false; return true; }
  function normTitle(value){ return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
  function readJson(key, fallback){ try { const raw = key && localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function writeJson(key, value){ if (!key) return; try { localStorage.setItem(key, JSON.stringify(value || {})); } catch(err){ console.warn('WNMU auto tag write skipped.', err); } }
  function scheduleCacheKey(kind){ const c = cfg(); const file = kind === 'schedule' ? c.scheduleFile : c.verificationFile; if (!file) return ''; return `${JSON_CACHE_PREFIX}::${kind}::${buildVersion()}::${file}`; }
  function readCachedSchedule(){ const key = scheduleCacheKey('schedule'); return key ? readJson(key, null) : null; }
  function tagsObject(mark){ if (!mark || typeof mark !== 'object') return {}; if (mark.tags && typeof mark.tags === 'object') return mark.tags; return mark; }
  function allTagKeys(){ const list = Array.isArray(cfg().tagOrder) ? cfg().tagOrder.slice() : []; if (!list.includes('newSeason')) list.splice(Math.min(1, list.length), 0, 'newSeason'); if (!list.includes(OTHER_KEY)) list.splice(Math.min(5, list.length), 0, OTHER_KEY); return Array.from(new Set(list.filter(tag => tag !== SATELLITE_KEY))); }
  function tagOrder(){ return allTagKeys(); }
  function tagPriority(){ const base = Array.isArray(cfg().tagPriority) ? cfg().tagPriority.slice() : tagOrder(); return ['newSeries','newSeason', ...base.filter(tag => tag !== 'newSeries' && tag !== 'newSeason')]; }
  function tagMeta(){ return cfg().tagMeta || {}; }
  function cleanOtherLabel(value){ return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 64); }
  function tagLabel(tag, otherLabel = ''){ if (tag === OTHER_KEY) return cleanOtherLabel(otherLabel); return tagMeta()[tag]?.label || (tag === SATELLITE_KEY ? 'Satellite Feed' : tag); }
  function customTagInput(menu){ return menu?.querySelector?.('#wnmuCellCustomTagText') || null; }
  function readCustomOtherLabelFromMenu(menu){ return cleanOtherLabel(customTagInput(menu)?.value || menu?.dataset?.wnmuOtherLabel || ''); }
  function customTagEditIsActive(menu){ const input = customTagInput(menu); return !!(input && document.activeElement === input); }
  function writeCustomOtherLabelToMenu(menu, label, options = {}){
    const clean = cleanOtherLabel(label);
    if (menu) menu.dataset.wnmuOtherLabel = clean;
    const input = customTagInput(menu);
    // Never overwrite the field while the user is typing. Background menu populate,
    // remote-storage loaded events, and grid repaint can fire during an edit.
    // Let the user's keystrokes win until blur/save/clear.
    if (input && input.value !== clean && (options.force || !customTagEditIsActive(menu))) input.value = clean;
  }
  function canonicalStoreKey(){ return storageKey() ? `${storageKey()}::cellOverrides.v1.5.0` : ''; }
  function otherLabelFromRecord(record){ return cleanOtherLabel(record?.otherLabel || record?.planningOtherLabel || record?.customPlanningLabel || record?.customTagLabel || record?.otherText || record?.rectNote?.otherLabel || record?.rectNote?.planningOtherLabel || ''); }
  function escAttr(value){ return String(value || '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch] || ch)); }
  function customOtherLabelFromExistingPills(cell){
    if (!cell) return '';
    const attr = cell.querySelector?.('.tag-pill[data-wnmu-custom-tag-label]')?.getAttribute('data-wnmu-custom-tag-label') || '';
    if (cleanOtherLabel(attr)) return cleanOtherLabel(attr);
    const known = new Set(Object.values(tagMeta()).map(meta => String(meta?.label || '').trim()).filter(Boolean));
    known.add('Satellite Feed'); known.add('New Season'); known.add('Custom');
    const labels = Array.from(cell.querySelectorAll?.('.tag-pill') || []).map(el => cleanOtherLabel(el.textContent || '')).filter(Boolean);
    return labels.find(label => !known.has(label)) || '';
  }
  function customOtherLabelForCell(cell){
    if (!cell) return '';
    const main = readJson(storageKey(), {});
    const entryId = cell.dataset?.entryId || '';
    const cellKey = cell.dataset?.wnmuCellKey || '';
    let label = otherLabelFromRecord(main[entryId]) || otherLabelFromRecord(main[cellKey]);
    if (label) return label;
    const canonical = readJson(canonicalStoreKey(), {});
    if (cellKey) label = otherLabelFromRecord(canonical[cellKey]);
    if (label) return label;
    const parsed = parseEntryId(entryId);
    if (parsed) {
      const wantedDate = parsed.date;
      const wantedTime = parsed.time;
      const rec = Object.values(canonical || {}).find(item => item && item.date === wantedDate && item.time === wantedTime && otherLabelFromRecord(item));
      if (rec) return otherLabelFromRecord(rec);
    }
    label = cleanOtherLabel(cell.dataset?.wnmuOtherLabel || cell.dataset?.wnmuCustomPlanningTag || '');
    if (label) return label;
    return customOtherLabelFromExistingPills(cell);
  }


  function ensureProgramTagsWrap(cell) {
    const content = cell?.querySelector?.('.program-content') || cell;
    if (!content) return null;
    let wrap = content.querySelector?.(':scope > .program-tags');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'program-tags';
      content.appendChild(wrap);
    }
    return wrap;
  }

  function forceCustomTagDisplayForCell(cell, label) {
    if (!cell) return;
    const clean = cleanOtherLabel(label || cell.dataset?.wnmuOtherLabel || cell.dataset?.wnmuCustomPlanningTag || '');
    if (clean) {
      cell.dataset.wnmuOtherLabel = clean;
      cell.dataset.wnmuCustomPlanningTag = clean;
    } else {
      delete cell.dataset.wnmuOtherLabel;
      delete cell.dataset.wnmuCustomPlanningTag;
    }
    let found = false;
    Array.from(cell.querySelectorAll?.('.program-tags') || []).forEach(wrap => {
      Array.from(wrap.querySelectorAll('.tag-pill')).forEach(pill => {
        const text = cleanOtherLabel(pill.textContent || '');
        const attr = cleanOtherLabel(pill.getAttribute('data-wnmu-custom-tag-label') || '');
        const isCustomPlaceholder = !!attr || text === 'Custom' || text === 'Other';
        if (!isCustomPlaceholder) return;
        if (!clean) { pill.remove(); return; }
        pill.textContent = clean;
        pill.setAttribute('data-wnmu-custom-tag-label', clean);
        pill.style.setProperty('--tag-color', colorFor(OTHER_KEY));
        found = true;
      });
      if (!wrap.textContent.trim()) wrap.remove();
    });
    if (clean && !found) {
      const wrap = ensureProgramTagsWrap(cell);
      if (!wrap) return;
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = clean;
      pill.setAttribute('data-wnmu-custom-tag-label', clean);
      pill.style.setProperty('--tag-color', colorFor(OTHER_KEY));
      wrap.appendChild(pill);
    }
  }

  let customRepairTimer = 0;
  function repairCustomLabelPills(){
    document.querySelectorAll('td.program-cell').forEach(cell => {
      const label = customOtherLabelForCell(cell);
      forceCustomTagDisplayForCell(cell, label);
    });
  }
  function scheduleCustomLabelRepair(delay = 80){
    window.clearTimeout(customRepairTimer);
    customRepairTimer = window.setTimeout(repairCustomLabelPills, delay);
  }
  function colorFor(tag){ return COLOR_OVERRIDES[tag] || tagMeta()[tag]?.color || '#fff'; }
  function labelToTagMap(){ const out = {}; Object.entries(tagMeta()).forEach(([tag, meta]) => { if (tag !== SATELLITE_KEY) out[String(meta?.label || tag).trim()] = tag; }); out['New Season'] = 'newSeason'; return out; }
  function activeTagList(tags, includeSatellite = false){ return allTagKeys().filter(tag => !!(tags && tags[tag]) && (includeSatellite || tag !== SATELLITE_KEY)); }
  function dominantTag(tags){ const active = activeTagList(tags, false); const priority = tagPriority(); return priority.find(tag => active.includes(tag)) || active[0] || ''; }
  function hasAnyExplicitStoredTag(tags){ return allTagKeys().some(tag => typeof tags[tag] === 'boolean'); }
  function normalizedMenuTags(tags){ const out = {}; allTagKeys().forEach(tag => { out[tag] = !!(tags && tags[tag]); }); return out; }
  function setTag(mark, tag, value){ const out = mark && typeof mark === 'object' ? { ...mark } : {}; const tags = out.tags && typeof out.tags === 'object' ? { ...out.tags } : {}; tags[tag] = !!value; out.tags = tags; return out; }
  function hasExplicitTag(mark, tag){ const tags = tagsObject(mark); return typeof tags[tag] === 'boolean'; }
  function autoStateKey(){ return storageKey() ? `${storageKey()}::${AUTO_STATE_PREFIX}.v1` : ''; }
  function disabledKey(){ return storageKey() ? `${storageKey()}::${DISABLED_PREFIX}.v1` : ''; }

  function buildScheduleIndex(){
    const schedule = readCachedSchedule(); const key = scheduleCacheKey('schedule');
    if (scheduleIndexCache && scheduleIndexCacheKey === key) return scheduleIndexCache;
    const byId = new Map(); const byDateTimeTitle = new Map(); const entries = [];
    if (schedule && Array.isArray(schedule.days)) {
      (schedule.days || []).forEach(day => (day.entries || []).forEach(entry => {
        const id = entryId(entry); if (!id) return;
        entries.push(entry); byId.set(id, entry); byDateTimeTitle.set(`${entry.date}__${entry.time}__${normTitle(entry.title)}`, entry);
      }));
    }
    scheduleIndexCache = { schedule, byId, byDateTimeTitle, entries };
    scheduleIndexCacheKey = key;
    return scheduleIndexCache;
  }

  function isNewSeasonCandidate(entry, index){
    if (!entry || !entry.seasonStart || !shouldAutoNewSeries(entry)) return false;
    const priorDate = addDays(entry.date, -7); if (!priorDate) return false;
    return !!index.byDateTimeTitle.get(`${priorDate}__${entry.time}__${normTitle(entry.title)}`);
  }

  function defaultTagsForEntry(entry, id){
    const out = {}; tagOrder().forEach(tag => { out[tag] = false; });
    if (!entry) return out;
    const disabled = readJson(disabledKey(), {}); const disabledTags = id ? (disabled[id] || {}) : {};
    const index = buildScheduleIndex(); const newSeason = isNewSeasonCandidate(entry, index);
    if (newSeason) {
      // New Season replaces New Series. If the user disables it, keep both off until manually checked.
      out.newSeason = disabledTags.newSeason === true ? false : true;
      out.newSeries = false;
    } else if (entry.seasonStart && shouldAutoNewSeries(entry)) {
      out.newSeries = true;
    }
    for (const rule of cfg().autoTagRules || []) {
      if (!rule || !rule.tag) continue;
      if (shouldApplyAutoTag(entry, rule.tag) && ruleMatches(entry, rule)) out[rule.tag] = true;
    }
    if (isAutoSuppressed(entry)) {
      // Suppressed windows should not get ordinary automatic highlight/category colors,
      // but true season-start signals should still remain visible.
      tagOrder().forEach(tag => { if (tag !== 'newSeries' && tag !== 'newSeason') out[tag] = false; });
    }
    return out;
  }

  function defaultTagsForEntryId(id){ const entry = buildScheduleIndex().byId.get(id); return defaultTagsForEntry(entry, id); }

  function detectNewSeasonEntries(){ const index = buildScheduleIndex(); const out = []; index.entries.forEach(entry => { if (isNewSeasonCandidate(entry, index)) out.push({ entry }); }); return out; }

  function applyDerivedMarks(){
    const key = storageKey(); const schedule = readCachedSchedule();
    if (!key || !schedule || !Array.isArray(schedule.days)) return;
    const marks = readJson(key, {}); const disabled = readJson(disabledKey(), {}); const candidates = detectNewSeasonEntries(); const ids = new Set();
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
  function cellEntryInfo(cell){ const parsed = parseEntryId(cell?.dataset?.entryId || ''); const title = cell?.querySelector?.('.program-title')?.textContent || ''; return parsed ? { ...parsed, title } : null; }
  function labelsForCell(cell){ return Array.from(cell.querySelectorAll('.tag-pill')).map(el => (el.textContent || '').trim()).filter(Boolean); }
  function tagsFromLabels(labels){ const map = labelToTagMap(); const out = {}; labels.forEach(label => { const tag = map[label]; if (tag) out[tag] = true; }); return out; }

  function effectiveTagsForCell(cell){
    const entryId = cell?.dataset?.entryId || '';
    const stored = storedTagsForEntryId(entryId);
    if (hasAnyExplicitStoredTag(stored)) {
      const out = {}; allTagKeys().forEach(tag => { out[tag] = stored[tag] === true; }); return out;
    }
    const defaults = defaultTagsForEntryId(entryId);
    if (activeTagList(defaults, true).length) return defaults;
    return tagsFromLabels(labelsForCell(cell));
  }

  function clearCellVisual(cell){
    if (!cell) return;
    const preserveSatellite = cell.dataset?.satelliteFeed === 'true' || cell.classList.contains('wnmu-satellite-feed');
    cell.dataset.wnmuAutoTagRenderSig = 'none';
    cell.querySelectorAll('.program-tags').forEach(el => el.remove());
    cell.style.removeProperty('--mark-background');
    cell.classList.remove('marked');
    if (preserveSatellite) {
      cell.classList.add('wnmu-satellite-feed');
      cell.dataset.satelliteFeed = 'true';
      cell.style.backgroundColor = '#e6e6e6';
      cell.style.setProperty('--satellite-feed-background', '#e6e6e6');
      window.setTimeout(() => window.WNMU_REPAINT_SATELLITE_FEEDS?.(), 0);
    } else {
      cell.style.backgroundColor = '';
      cell.style.removeProperty('--satellite-feed-background');
    }
  }

  function renderTags(cell, tags){
    if (!cell) return;
    const clean = normalizedMenuTags(tags || {});
    const otherLabel = clean[OTHER_KEY] ? customOtherLabelForCell(cell) : '';
    if (otherLabel) { clean[OTHER_KEY] = true; cell.dataset.wnmuOtherLabel = otherLabel; cell.dataset.wnmuCustomPlanningTag = otherLabel; }
    else { delete cell.dataset.wnmuOtherLabel; delete cell.dataset.wnmuCustomPlanningTag; }
    const active = activeTagList(clean, false).filter(tag => tag !== OTHER_KEY || otherLabel);
    const signature = active.join('|') + `::other=${otherLabel}`;
    if (cell.dataset.wnmuAutoTagRenderSig === signature) return;
    cell.dataset.wnmuAutoTagRenderSig = signature;
    cell.querySelectorAll('.program-tags').forEach(el => el.remove());
    if (!active.length) { clearCellVisual(cell); return; }
    const dom = dominantTag(clean);
    const isSatellite = cell.dataset?.satelliteFeed === 'true' || cell.classList.contains('wnmu-satellite-feed');
    if (isSatellite) {
      cell.classList.add('wnmu-satellite-feed');
      cell.dataset.satelliteFeed = 'true';
      cell.dataset.satelliteFeedManaged = 'true';
      cell.style.setProperty('--mark-background', '#e6e6e6');
      cell.style.setProperty('--satellite-feed-background', '#e6e6e6');
      cell.style.backgroundColor = '#e6e6e6';
    } else {
      cell.style.setProperty('--mark-background', colorFor(dom));
      cell.style.backgroundColor = '';
    }
    cell.classList.add('marked');
    const content = cell.querySelector('.program-content');
    if (content) {
      const wrap = document.createElement('div');
      wrap.className = 'program-tags';
      const pills = activeTagList(clean, true).filter(tag => tag !== OTHER_KEY || otherLabel).slice(0, 6);
      wrap.innerHTML = pills.map(tag => {
        const label = tagLabel(tag, otherLabel);
        const customAttr = tag === OTHER_KEY && otherLabel ? ` data-wnmu-custom-tag-label="${escAttr(otherLabel)}"` : '';
        return `<span class="tag-pill"${customAttr} style="--tag-color:${colorFor(tag)}">${label}</span>`;
      }).join('');
      content.appendChild(wrap);
    }
    forceCustomTagDisplayForCell(cell, otherLabel);
  }

  function sanitizeVisibleHighlights(){
    if (sanitizeActive) return;
    sanitizeActive = true;
    try {
      document.querySelectorAll('td.program-cell[data-entry-id]').forEach(cell => renderTags(cell, effectiveTagsForCell(cell)));
      window.dispatchEvent(new CustomEvent('wnmu:auto-tags-rendered', { detail: { version: VERSION, at: new Date().toISOString() } }));
      window.setTimeout(() => window.WNMU_REPAINT_SATELLITE_FEEDS?.(), 25);
    } finally {
      window.setTimeout(() => { sanitizeActive = false; }, 120);
    }
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
    const cell = cellForMenu(menu); if (!cell) return;
    const effective = effectiveTagsForCell(cell);
    const otherLabel = customOtherLabelForCell(cell);
    if (menu && !customTagEditIsActive(menu)) writeCustomOtherLabelToMenu(menu, otherLabel);
    allTagKeys().forEach(tag => {
      const input = menu.querySelector(`input[name="${css(tag)}"]`); if (!input) return;
      input.checked = !!effective[tag];
      const row = input.closest('.check-row'); if (row) row.style.background = colorFor(tag);
    });
  }

  function readMenuTags(menu){ const out = {}; allTagKeys().forEach(tag => { if (tag === OTHER_KEY) return; const input = menu?.querySelector(`input[name="${css(tag)}"]`); out[tag] = !!input?.checked; }); const customLabel = readCustomOtherLabelFromMenu(menu); out[OTHER_KEY] = !!customLabel; return out; }

  function writeExplicitTagsForMenu(menu, tags){
    const key = storageKey(); const cell = cellForMenu(menu); if (!key || !cell) return false;
    const entryId = cell.dataset.entryId || ''; const cellKey = menu?.dataset?.wnmuCellKey || '';
    const marks = readJson(key, {}); let clean = normalizedMenuTags(tags);
    const pendingOtherLabel = cleanOtherLabel(readCustomOtherLabelFromMenu(menu));
    if (pendingOtherLabel) clean[OTHER_KEY] = true;
    const writeRecord = (recordKey) => {
      if (!recordKey) return;
      const existing = marks[recordKey] && typeof marks[recordKey] === 'object' ? marks[recordKey] : {};
      const otherLabel = clean[OTHER_KEY] ? cleanOtherLabel(pendingOtherLabel || existing.otherLabel || existing.planningOtherLabel || '') : '';
      const rectNote = existing.rectNote && typeof existing.rectNote === 'object'
        ? { ...existing.rectNote, otherLabel, planningOtherLabel: otherLabel, customPlanningLabel: otherLabel, customTagLabel: otherLabel }
        : existing.rectNote;
      marks[recordKey] = { ...existing, tags: { ...clean }, otherLabel, planningOtherLabel: otherLabel, customPlanningLabel: otherLabel, customTagLabel: otherLabel, rectNote };
    };
    writeRecord(entryId); writeRecord(cellKey);
    const savedOtherLabel = otherLabelFromRecord(marks[entryId]) || otherLabelFromRecord(marks[cellKey]);
    if (savedOtherLabel) cell.dataset.wnmuOtherLabel = savedOtherLabel;
    else delete cell.dataset.wnmuOtherLabel;
    writeJson(key, marks);
    renderTags(cell, clean);
    forceCustomTagDisplayForCell(cell, savedOtherLabel);
    window.WNMU_LAST_TAG_MENU_SYNC = { version: VERSION, entryId, cellKey, tags: clean, at: new Date().toISOString() };
    return true;
  }

  function installImmediateMenuSync(){
    if (installedMenuSync) return; installedMenuSync = true;
    document.addEventListener('change', event => {
      const input = event.target;
      if (!input || input.type !== 'checkbox') return;
      const menu = input.closest && input.closest('#wnmuCellMenu');
      if (!menu) return;
      const tags = readMenuTags(menu);
      writeExplicitTagsForMenu(menu, tags);
      scheduleSanitize(20);
    }, true);
    let customTagWriteTimer = 0;
    document.addEventListener('input', event => {
      const input = event.target;
      if (!input || input.id !== 'wnmuCellCustomTagText') return;
      const menu = input.closest && input.closest('#wnmuCellMenu');
      if (!menu) return;
      const cleanInputLabel = cleanOtherLabel(input.value);
      if (menu) menu.dataset.wnmuOtherLabel = cleanInputLabel;
      const liveCell = cellForMenu(menu);
      if (liveCell) forceCustomTagDisplayForCell(liveCell, cleanInputLabel);
      window.clearTimeout(customTagWriteTimer);
      customTagWriteTimer = window.setTimeout(() => {
        const tags = readMenuTags(menu);
        writeExplicitTagsForMenu(menu, tags);
        scheduleSanitize(20);
      }, 350);
    }, true);
    // Also catch save/commit clicks after the built-in handlers have done their work.
    document.addEventListener('click', event => {
      const target = event.target;
      const menu = target?.closest?.('#wnmuCellMenu');
      if (!menu) return;
      if (!target.closest('#wnmuCommitProgramBtn, #wnmuCustomTagClearBtn')) return;
      window.setTimeout(() => { const tags = readMenuTags(menu); writeExplicitTagsForMenu(menu, tags); scheduleSanitize(20); scheduleCustomLabelRepair(60); }, 30);
    }, true);
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
        const isOwnMarkup = (node) => node && node.nodeType === 1 && (node.matches?.('.program-tags,.tag-pill,.wnmu-cell-override-layer,.wnmu-cell-override-box') || node.closest?.('.program-tags,.wnmu-cell-override-layer'));
        const looksLikeGridContent = (node) => node && node.nodeType === 1 && !isOwnMarkup(node) && (node.matches?.('table.screen-week-grid,tr,td.program-cell,.program-cell,.week-grid-wrap,.screen-host') || node.querySelector?.('table.screen-week-grid,tr,td.program-cell,.program-cell,.week-grid-wrap,.screen-host'));
        const looksLikeTagMarkup = (node) => node && node.nodeType === 1 && (node.matches?.('.program-tags,.tag-pill') || node.querySelector?.('.program-tags,.tag-pill'));
        const gridObs = new MutationObserver(mutations => {
          if (mutations.some(m => Array.from(m.addedNodes || []).some(looksLikeGridContent))) scheduleSanitize(220);
          if (mutations.some(m => Array.from(m.addedNodes || []).some(looksLikeTagMarkup))) scheduleCustomLabelRepair(80);
        });
        gridObs.observe(host, { childList:true, subtree:true });
      }
    }
    document.addEventListener('contextmenu', () => { [20,120].forEach(ms => window.setTimeout(() => { populateMenuEffectiveTags(); }, ms)); }, true);
    [600,1600,3200].forEach(ms => window.setTimeout(() => { populateMenuEffectiveTags(); sanitizeVisibleHighlights(); scheduleCustomLabelRepair(40); }, ms));
  }

  function installRemoteStorageListener(){
    window.addEventListener('wnmu:remote-storage-loaded', () => {
      const menu = document.getElementById('wnmuCellMenu');
      if (menu && !menu.classList.contains('hidden') && customTagEditIsActive(menu)) return;
      scheduleSanitize(120);
      scheduleCustomLabelRepair(180);
    });
  }

  function start(){ installStorageDisableHook(); installRendererAppendHook(); installImmediateMenuSync(); installObservers(); installRemoteStorageListener(); scheduleCustomLabelRepair(900); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();