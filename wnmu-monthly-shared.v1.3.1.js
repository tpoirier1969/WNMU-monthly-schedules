(function () {
  const CONFIG = window.WNMU_MONTHLY_PAGE_CONFIG;
  if (!CONFIG) return;
  window.WNMU_MONTHLY_SHARED_DESTROY?.();
  const instanceEvents = new AbortController();
  window.WNMU_MONTHLY_SHARED_DESTROY = () => instanceEvents.abort();

  const BUILD_VERSION = CONFIG.buildVersion;
  const DATA_FILES = {
    schedule: CONFIG.scheduleFile,
    verification: CONFIG.verificationFile
  };
  const STORAGE_KEY = CONFIG.storageKey;
  const TAG_ORDER = CONFIG.tagOrder;
  const TAG_PRIORITY = CONFIG.tagPriority;
  const TAG_META = CONFIG.tagMeta;
  const PRINT_SLOT_SEQUENCE = [...Array.from({ length: 34 }, (_, i) => i + 14), 0, 1, 2];
  const archiveId = new URLSearchParams(window.location.search).get('archive');
  const isArchiveMode = !!archiveId;
  const JSON_CACHE_PREFIX = 'wnmu_json_cache_v1_3_1';

  const appState = {
    schedule: null,
    verification: null,
    dateMap: {},
    entryWeekMap: {},
    marks: {},
    currentEntryId: null,
    archiveRecord: null,
    scheduleCached: false,
    verificationCached: false,
    renderedWeeks: new Set(),
    progressiveIndex: 0,
    printBuilt: false,
    printDirty: false,
    weekHosts: []
  };

  function mustGet(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing required element #${id}. Replace the page with the matching build.`);
    return el;
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function fmtDateLabel(dateStr, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', opts);
  }

  function selectedMonthLabel() {
    const key = window.WNMU_CURRENT_MONTH_META?.monthKey || String(appState.schedule?.days?.[0]?.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return 'selected month';
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  let cachedTitleCorrectionRaw = null;
  let cachedTitleCorrections = {};
  function effectiveDisplayTitle(raw) {
    try {
      const serialized = localStorage.getItem('wnmu_sales_title_corrections_v1') || '{}';
      if (serialized !== cachedTitleCorrectionRaw) {
        cachedTitleCorrectionRaw = serialized;
        cachedTitleCorrections = JSON.parse(serialized) || {};
      }
      const norm = str => String(str || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
      const compact = str => String(str || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
      return cachedTitleCorrections[norm(raw)] || cachedTitleCorrections[compact(raw)] || String(raw || '');
    } catch { return String(raw || ''); }
  }
  function fmtTime(timeStr) {
    const [hh, mm] = String(timeStr).split(':').map(Number);
    const d = new Date(2026, 4, 1, hh, mm);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function getWeekday(dateStr) {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  }

  function timeToSlotIndex(timeStr) {
    const [hh, mm] = String(timeStr).split(':').map(Number);
    return hh * 2 + (mm >= 30 ? 1 : 0);
  }

  function timeInRangeInclusive(timeStr, start, end) {
    const t = timeToSlotIndex(timeStr);
    return t >= timeToSlotIndex(start) && t <= timeToSlotIndex(end);
  }

  function ruleMatches(entry, rule) {
    const weekday = getWeekday(entry.date);
    if (rule.weekdays && !rule.weekdays.includes(weekday)) return false;
    if (rule.times && !rule.times.includes(entry.time)) return false;
    if (rule.range && !timeInRangeInclusive(entry.time, rule.range[0], rule.range[1])) return false;
    if (rule.titleIncludes) {
      const title = String(entry.title || '').toLowerCase();
      if (!rule.titleIncludes.every(bit => title.includes(String(bit).toLowerCase()))) return false;
    }
    return true;
  }

  function matchesAnyRule(entry, rules) {
    return (rules || []).some(rule => ruleMatches(entry, rule));
  }

  function shouldApplyAuto(entry, tagKey) {
    if (matchesAnyRule(entry, CONFIG.suppressAllAutoRules)) return false;
    if (tagKey === 'newSeries' && matchesAnyRule(entry, CONFIG.suppressNewSeriesRules)) return false;
    return true;
  }

  function getDefaultTags(entry) {
    const defaults = Object.fromEntries(TAG_ORDER.map(key => [key, false]));
    if (entry.seasonStart && shouldApplyAuto(entry, 'newSeries')) defaults.newSeries = true;
    for (const rule of CONFIG.autoTagRules || []) {
      if (shouldApplyAuto(entry, rule.tag) && ruleMatches(entry, rule)) defaults[rule.tag] = true;
    }
    return defaults;
  }

  function buildEntryId(entry) {
    if (CONFIG.useSourceInId) {
      return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}__${slugify(entry.sourceDate || entry.date)}__${slugify(entry.sourceTime || entry.time)}`;
    }
    return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}`;
  }

  function buildDateMap(schedule) {
    const map = {};
    const entryWeekMap = {};
    const dayLookup = {};
    (schedule.days || []).forEach(day => {
      dayLookup[day.date] = day;
    });
    (schedule.weeks || []).forEach((week, weekIndex) => {
      week.forEach(day => {
        if (!day.inMonth) return;
        const sourceDay = dayLookup[day.date] || day;
        const rawEntries = (sourceDay.entries || []).map(entry => ({ ...entry, _id: buildEntryId(entry) }));
        const entryByTime = {};
        rawEntries.forEach(entry => {
          entryByTime[entry.time] = entry;
          entryWeekMap[entry._id] = weekIndex;
        });
        map[day.date] = { ...sourceDay, entries: rawEntries, entryByTime };
      });
    });
    return { map, entryWeekMap };
  }

  function pickBooleanTags(raw) {
    const tags = {};
    if (!raw || typeof raw !== 'object') return tags;
    for (const key of TAG_ORDER) {
      if (typeof raw[key] === 'boolean') tags[key] = raw[key];
    }
    return tags;
  }

  function normalizeRect(rect) {
    if (!rect || typeof rect !== 'object') return null;
    const x = Math.max(0, Math.min(100, Number(rect.x ?? 0)));
    const y = Math.max(0, Math.min(100, Number(rect.y ?? 0)));
    const w = Math.max(2, Math.min(100 - x, Number(rect.w ?? 0)));
    const h = Math.max(2, Math.min(100 - y, Number(rect.h ?? 0)));
    return { x, y, w, h, text: String(rect.text ?? '') };
  }

  function normalizeStoredState(raw) {
    if (!raw || typeof raw !== 'object') return { tags: {}, rectNote: null };
    if ('tags' in raw || 'rectNote' in raw || 'note' in raw || 'whiteout' in raw) {
      const migratedRect = raw.rectNote ? normalizeRect(raw.rectNote) : (raw.note ? normalizeRect({ x: 6, y: 10, w: 88, h: 38, text: raw.note }) : null);
      return {
        tags: pickBooleanTags(raw.tags || raw),
        rectNote: migratedRect
      };
    }
    return { tags: pickBooleanTags(raw), rectNote: null };
  }

  function loadMarks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveMarks() {
    if (isArchiveMode) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.marks));
  }

  function readJsonCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeJsonCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }

  async function loadJsonCached(file, kind) {
    const cacheKey = `${JSON_CACHE_PREFIX}::${kind}::${BUILD_VERSION}::${file}`;
    const cached = readJsonCache(cacheKey);
    if (cached) return { data: cached, fromCache: true };
    const res = await fetch(`${file}?build=${BUILD_VERSION}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
    const data = await res.json();
    writeJsonCache(cacheKey, data);
    return { data, fromCache: false };
  }

  async function restSelect(url) {
    const cfg = window.WNMU_SHAREBOARD_SUPABASE;
    if (!cfg?.url || !cfg?.anonKey) throw new Error('config.js is missing or does not contain Supabase credentials.');
    const res = await fetch(`${cfg.url}${url}`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`Supabase read failed (${res.status})`);
    return res.json();
  }

  async function fetchArchiveById(id) {
    const rows = await restSelect(`/rest/v1/wnmu_monthly_archives?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    if (!Array.isArray(rows) || !rows.length) throw new Error(`Archive ${id} was not found.`);
    return rows[0];
  }

  function getStoredState(entry) {
    return normalizeStoredState(appState.marks[entry._id]);
  }

  function getRectNoteForEntry(entry) {
    return getStoredState(entry).rectNote;
  }

  function getTagsForEntry(entry) {
    const defaults = getDefaultTags(entry);
    const savedTags = getStoredState(entry).tags || {};
    const out = {};
    for (const key of TAG_ORDER) {
      out[key] = typeof savedTags[key] === 'boolean' ? savedTags[key] : defaults[key];
    }
    return out;
  }

  function getActiveTagKeys(entry) {
    const tags = getTagsForEntry(entry);
    return TAG_ORDER.filter(key => tags[key]);
  }

  function getBackgroundForEntry(entry) {
    const active = getActiveTagKeys(entry);
    if (!active.length) return '#fff';
    const dominant = TAG_PRIORITY.find(key => active.includes(key)) || active[0];
    return TAG_META[dominant].color;
  }

  function getEntryById(entryId) {
    for (const day of Object.values(appState.dateMap)) {
      const found = (day.entries || []).find(entry => entry._id === entryId);
      if (found) return found;
    }
    return null;
  }

  function updateStoredEntry(entry, nextTags, nextRectNote) {
    if (isArchiveMode) return;
    const defaults = getDefaultTags(entry);
    const storedTags = {};
    for (const key of TAG_ORDER) {
      if (nextTags[key] !== defaults[key]) storedTags[key] = !!nextTags[key];
    }
    const payload = {};
    if (Object.keys(storedTags).length) payload.tags = storedTags;
    if (nextRectNote) payload.rectNote = normalizeRect(nextRectNote);
    if (Object.keys(payload).length) appState.marks[entry._id] = payload;
    else delete appState.marks[entry._id];
    appState.printDirty = true;
    saveMarks();
  }

  function allCheckedEntries() {
    const out = [];
    for (const day of appState.schedule.days || []) {
      out.push(...dayRollupEntries(day.date));
    }
    out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return out;
  }

  function setWeekStatus(text) {
    const flag = document.getElementById('daysFlag');
    if (flag) flag.textContent = text;
  }

  function renderFlags() {
    const sourceBit = appState.scheduleCached ? 'cached' : 'network';
    if (!window.WNMU_MONTHLY_PACKAGE_VERSION) mustGet('versionFlag').textContent = `${BUILD_VERSION} • faster load • ${sourceBit}`;
    if (appState.verification) {
      mustGet('coverageFlag').textContent = appState.verification?.checks?.everyDayHas48CoveredSlots ? '31/31 days at 48/48' : 'coverage issue';
    } else {
      mustGet('coverageFlag').textContent = 'coverage loading…';
    }
    setWeekStatus(`weeks ${appState.renderedWeeks.size}/${appState.schedule?.weeks?.length || 0}`);
  }

  function renderArchiveBanner() {
    const banner = document.getElementById('archiveBanner');
    if (!banner) return;
    if (!isArchiveMode || !appState.archiveRecord) {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      return;
    }
    const row = appState.archiveRecord;
    banner.classList.remove('hidden');
    banner.innerHTML = `<strong>Read-only archive:</strong> ${escapeHtml(row.archive_name || 'Untitled archive')} • ${escapeHtml(row.channel_label || '')} • ${new Date(row.created_at).toLocaleString()}${row.archive_note ? ` • ${escapeHtml(row.archive_note)}` : ''}`;
  }

  function createTagPill(tagKey) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.style.setProperty('--tag-color', TAG_META[tagKey].color);
    pill.textContent = TAG_META[tagKey].label;
    return pill;
  }

  function createRollupLine(entry, includeFullMeta = false) {
    const line = document.createElement('div');
    line.className = 'rollup-line';
    const active = (entry._wnmuRollupLabels || getActiveTagKeys(entry).map(key => TAG_META[key]?.label || key)).join(', ');
    const episodePart = entry.episode ? ` • ${entry.episode}` : '';
    const rectNote = entry._wnmuReplacement ? null : getRectNoteForEntry(entry);
    const notePart = rectNote?.text ? ` • Box note: ${escapeHtml(rectNote.text)}` : (rectNote ? ' • Box note' : '');
    if (includeFullMeta) {
      line.innerHTML = `<strong>${fmtDateLabel(entry.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong> • ${fmtTime(entry.time)} • ${entry.durationMin} min • <strong>${escapeHtml(effectiveDisplayTitle(entry.title))}</strong>${episodePart ? ` <span class="meta">${escapeHtml(episodePart)}</span>` : ''}${active ? ` <span class="meta">• ${escapeHtml(active)}</span>` : ''}${notePart ? ` <span class="meta">${notePart}</span>` : ''}`;
    } else {
      line.innerHTML = `<strong>${fmtTime(entry.time)}</strong> • ${escapeHtml(effectiveDisplayTitle(entry.title))}${active ? ` <span class="meta">(${escapeHtml(active)})</span>` : ''}${notePart ? ` <span class="meta">${notePart}</span>` : ''}`;
    }
    return line;
  }

  function buildRectNoteElement(rectNote) {
    const box = document.createElement('div');
    box.className = 'draw-rect-note';
    box.style.left = `${rectNote.x}%`;
    box.style.top = `${rectNote.y}%`;
    box.style.width = `${rectNote.w}%`;
    box.style.height = `${rectNote.h}%`;
    if (rectNote.text) {
      const txt = document.createElement('div');
      txt.className = 'draw-rect-note-text';
      txt.textContent = rectNote.text;
      box.appendChild(txt);
    }
    return box;
  }

  function rollupOtherLabel(mark) {
    return String(mark?.otherLabel || mark?.planningOtherLabel || mark?.customPlanningLabel || mark?.customTagLabel || '').trim();
  }
  function rollupTagLabels(tags, otherLabel) {
    return [...new Set([...TAG_ORDER, 'other'])].filter(tag => tag !== 'satelliteFeed' && tags?.[tag] === true && (tag !== 'other' || otherLabel))
      .map(tag => tag === 'other' ? otherLabel : (TAG_META[tag]?.label || tag));
  }
  function dayRollupEntries(date) {
    const imported = appState.dateMap[date]?.entries || [];
    const notes = new Map();
    Object.values(appState.marks || {}).forEach(mark => {
      if (mark?.cellOverrideV15 && !mark.cleared && mark.date === date && mark.time && mark.text) notes.set(mark.time, mark);
    });
    try {
      const key = STORAGE_KEY + '::cellOverrides.v1.5.0';
      const canonical = JSON.parse(localStorage.getItem(key) || '{}');
      Object.values(canonical || {}).forEach(mark => {
        if (!mark || mark.date !== date || !mark.time) return;
        if (mark.cleared) notes.delete(mark.time);
        else if (mark.text) notes.set(mark.time, mark);
      });
    } catch {}
    const overlays = [...notes.values()].map(mark => {
      const slot = timeToSlotIndex(mark.time);
      const base = imported.find(entry => entry.time === mark.time) || imported.find(entry => {
        const first = timeToSlotIndex(entry.time);
        return slot >= first && slot < first + Number(entry.slotCount || 1);
      });
      const other = rollupOtherLabel(mark);
      const inheritedTags = base ? getTagsForEntry(base) : {};
      const tags = { ...inheritedTags, ...(mark.tags || {}) };
      if (other) tags.other = true;
      const duration = Number(mark.durationMin || mark.rectNote?.durationMin || 30);
      return { date, time: mark.time, title: String(mark.text), durationMin: duration, episode: '',
        _wnmuReplacement: true, _wnmuRollupLabels: rollupTagLabels(tags, other),
        _startSlot: slot, _endSlot: slot + Math.max(1, Math.round(duration / 30)) };
    });
    const normal = imported.filter(entry => {
      const slot = timeToSlotIndex(entry.time);
      if (overlays.some(box => slot >= box._startSlot && slot < box._endSlot)) return false;
      const mark = appState.marks[entry._id] || {};
      return !!(getActiveTagKeys(entry).length || getRectNoteForEntry(entry) ||
        rollupOtherLabel(mark));
    }).map(entry => {
      const mark = appState.marks[entry._id] || {};
      const other = rollupOtherLabel(mark);
      return { ...entry, _wnmuRollupLabels: rollupTagLabels({ ...getTagsForEntry(entry), other: !!other }, other) };
    });
    // A manually checked blank slot has no imported program entry. It should
    // still be listed by day, without manufacturing a schedule airing.
    const blank = [];
    Object.entries(appState.marks || {}).forEach(([key, mark]) => {
      if (!mark || typeof mark !== 'object') return;
      const match = String(key).match(/(?:^|__)(\d{4}-\d{2}-\d{2})__(\d{2}:\d{2})$/);
      if (!match || match[1] !== date) return;
      const time = match[2];
      const slot = timeToSlotIndex(time);
      const isCovered = imported.some(entry => {
        const first = timeToSlotIndex(entry.time);
        return slot >= first && slot < first + Number(entry.slotCount || 1);
      });
      if (isCovered || overlays.some(note => slot >= note._startSlot && slot < note._endSlot)) return;
      const other = rollupOtherLabel(mark);
      const labels = rollupTagLabels({ ...(mark.tags || {}), other: !!other }, other);
      if (!labels.length) return;
      blank.push({ date, time, title: '(Blank schedule slot)', durationMin: 30,
        episode: '', _wnmuReplacement: true, _wnmuRollupLabels: labels });
    });
    return normal.concat(overlays, blank).sort((a,b) => a.time.localeCompare(b.time));
  }

  function buildWeekRollup(week, weekIndex) {
    const box = document.createElement('section');
    box.className = 'rollup-box';
    const title = document.createElement('h4');
    title.textContent = `Week ${weekIndex + 1} checked items by day`;
    box.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'week-rollup-grid week-rollup-grid-7';

    week.forEach(day => {
      const dayBox = document.createElement('div');
      dayBox.className = 'day-rollup compact-day-rollup';
      dayBox.dataset.rollupDate = day.date;
      if (!day.inMonth) dayBox.classList.add('outside-day');
      const heading = document.createElement('h5');
      heading.textContent = `${day.dayName} • ${fmtDateLabel(day.date, { month: 'short', day: 'numeric' })}`;
      dayBox.appendChild(heading);
      if (!day.inMonth) {
        const none = document.createElement('div');
        none.className = 'rollup-empty';
        none.textContent = `Outside ${selectedMonthLabel().split(' ')[0]}`;
        dayBox.appendChild(none);
        grid.appendChild(dayBox);
        return;
      }
      const entries = dayRollupEntries(day.date);
      if (!entries.length) {
        const none = document.createElement('div');
        none.className = 'rollup-empty';
        none.textContent = 'None checked';
        dayBox.appendChild(none);
      } else {
        const list = document.createElement('ul');
        list.className = 'rollup-list compact-rollup-list';
        entries.forEach(entry => {
          const li = document.createElement('li');
          li.appendChild(createRollupLine(entry, false));
          list.appendChild(li);
        });
        dayBox.appendChild(list);
      }
      grid.appendChild(dayBox);
    });

    box.appendChild(grid);
    return box;
  }

  function buildPrintWeekGrid(week) {
    const table = document.createElement('table');
    table.className = 'week-grid print-week-grid';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const timeTh = document.createElement('th');
    timeTh.className = 'time-col';
    timeTh.textContent = 'Time';
    hr.appendChild(timeTh);
    week.forEach(day => {
      const th = document.createElement('th');
      if (!day.inMonth) th.classList.add('outside');
      th.innerHTML = `${day.dayName}<br>${fmtDateLabel(day.date, { month: 'short', day: 'numeric' })}`;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const renderMaps = week.map(day => {
      if (!day.inMonth) return new Map();
      const entries = appState.dateMap[day.date]?.entries || [];
      const map = new Map();
      for (const entry of entries) {
        const startSlot = timeToSlotIndex(entry.time);
        const covered = [];
        for (let s = startSlot; s < Math.min(48, startSlot + entry.slotCount); s++) covered.push(s);
        const visiblePositions = PRINT_SLOT_SEQUENCE.map((slot, idx) => covered.includes(slot) ? idx : -1).filter(idx => idx >= 0);
        if (!visiblePositions.length) continue;
        map.set(visiblePositions[0], { entry, rowspan: visiblePositions.length });
      }
      return map;
    });

    const tbody = document.createElement('tbody');
    const skip = new Array(7).fill(0);
    for (let rowIndex = 0; rowIndex < PRINT_SLOT_SEQUENCE.length; rowIndex++) {
      const slot = PRINT_SLOT_SEQUENCE[rowIndex];
      const slotTime = slot % 2 === 0 ? `${String(Math.floor(slot / 2)).padStart(2, '0')}:00` : `${String(Math.floor(slot / 2)).padStart(2, '0')}:30`;
      const tr = document.createElement('tr');
      const timeTd = document.createElement('td');
      timeTd.className = 'time-col';
      timeTd.textContent = fmtTime(slotTime);
      tr.appendChild(timeTd);

      week.forEach((day, dayIndex) => {
        if (skip[dayIndex] > 0) {
          skip[dayIndex] -= 1;
          return;
        }
        const td = document.createElement('td');
        if (!day.inMonth) {
          td.className = 'outside';
          tr.appendChild(td);
          return;
        }
        const renderInfo = renderMaps[dayIndex].get(rowIndex);
        if (!renderInfo) {
          td.className = 'program-cell';
          tr.appendChild(td);
          return;
        }
        const { entry, rowspan } = renderInfo;
        td.className = 'program-cell';
        td.dataset.entryId = entry._id;
        td.style.setProperty('--mark-background', getBackgroundForEntry(entry));
        td.rowSpan = rowspan;

        const content = document.createElement('div');
        content.className = 'program-content';
        const title = document.createElement('div');
        title.className = 'program-title';
        title.textContent = effectiveDisplayTitle(entry.title);
        title.dataset.wnmuOriginalTitle = entry.title;
        content.appendChild(title);
        if (entry.episode) {
          const episode = document.createElement('div');
          episode.className = 'program-episode';
          episode.textContent = entry.episode;
          content.appendChild(episode);
        }
        const duration = document.createElement('div');
        duration.className = 'program-duration';
        duration.textContent = `${entry.durationMin} min`;
        content.appendChild(duration);
        const activeTags = getActiveTagKeys(entry);
        if (activeTags.length) {
          const tags = document.createElement('div');
          tags.className = 'program-tags';
          activeTags.slice(0, 5).forEach(tagKey => tags.appendChild(createTagPill(tagKey)));
          content.appendChild(tags);
        }
        td.appendChild(content);
        const rectNote = getRectNoteForEntry(entry);
        if (rectNote) td.appendChild(buildRectNoteElement(rectNote));
        tr.appendChild(td);
        skip[dayIndex] = rowspan - 1;
      });

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    return table;
  }

  function buildScreenWeekGrid(week) {
    const table = document.createElement('table');
    table.className = 'week-grid screen-week-grid';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const timeTh = document.createElement('th');
    timeTh.className = 'time-col';
    timeTh.textContent = 'Time';
    hr.appendChild(timeTh);
    week.forEach(day => {
      const th = document.createElement('th');
      if (!day.inMonth) th.classList.add('outside');
      th.innerHTML = `${day.dayName}<br>${fmtDateLabel(day.date, { month: 'short', day: 'numeric' })}`;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const skip = new Array(7).fill(0);
    for (let slot = 0; slot < 48; slot++) {
      const tr = document.createElement('tr');
      const slotTime = slot % 2 === 0 ? `${String(Math.floor(slot / 2)).padStart(2, '0')}:00` : `${String(Math.floor(slot / 2)).padStart(2, '0')}:30`;
      const timeTd = document.createElement('td');
      timeTd.className = 'time-col';
      timeTd.textContent = fmtTime(slotTime);
      tr.appendChild(timeTd);

      week.forEach((day, dayIndex) => {
        if (skip[dayIndex] > 0) {
          skip[dayIndex] -= 1;
          return;
        }
        const td = document.createElement('td');
        if (!day.inMonth) {
          td.className = 'outside';
          tr.appendChild(td);
          return;
        }
        const normalizedDay = appState.dateMap[day.date];
        const entry = normalizedDay?.entryByTime?.[slotTime];
        if (!entry) {
          td.className = 'program-cell';
          tr.appendChild(td);
          return;
        }

        td.className = 'program-cell';
        if (isArchiveMode) td.classList.add('read-only');
        td.dataset.entryId = entry._id;
        if (getActiveTagKeys(entry).length) td.classList.add('marked');
        td.style.setProperty('--mark-background', getBackgroundForEntry(entry));
        td.rowSpan = entry.slotCount;

        const content = document.createElement('div');
        content.className = 'program-content';
        const title = document.createElement('div');
        title.className = 'program-title';
        title.textContent = effectiveDisplayTitle(entry.title);
        title.dataset.wnmuOriginalTitle = entry.title;
        content.appendChild(title);
        if (entry.episode) {
          const episode = document.createElement('div');
          episode.className = 'program-episode';
          episode.textContent = entry.episode;
          content.appendChild(episode);
        }
        const duration = document.createElement('div');
        duration.className = 'program-duration';
        duration.textContent = `${entry.durationMin} min`;
        content.appendChild(duration);
        const activeTags = getActiveTagKeys(entry);
        if (activeTags.length) {
          const tags = document.createElement('div');
          tags.className = 'program-tags';
          activeTags.slice(0, 5).forEach(tagKey => tags.appendChild(createTagPill(tagKey)));
          content.appendChild(tags);
        }
        td.appendChild(content);
        const rectNote = getRectNoteForEntry(entry);
        if (rectNote) td.appendChild(buildRectNoteElement(rectNote));
        tr.appendChild(td);
        skip[dayIndex] = entry.slotCount - 1;
      });

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    return table;
  }

  function buildWeekHeading(week, weekIndex) {
    const heading = document.createElement('h3');
    const weekDates = week.filter(day => day.inMonth);
    const rangeStart = weekDates[0]?.date || week[0].date;
    const rangeEnd = weekDates[weekDates.length - 1]?.date || week[6].date;
    heading.textContent = `Week ${weekIndex + 1} • ${fmtDateLabel(rangeStart)} – ${fmtDateLabel(rangeEnd)}`;
    return heading;
  }

  function createWeekShell(week, weekIndex) {
    const wrap = document.createElement('section');
    wrap.className = 'week-grid-wrap';
    wrap.dataset.weekIndex = String(weekIndex);

    const heading = buildWeekHeading(week, weekIndex);
    wrap.appendChild(heading);

    const screenHost = document.createElement('div');
    screenHost.className = 'screen-host';
    screenHost.innerHTML = '<div class="rollup-box"><div class="rollup-empty">Loading week…</div></div>';
    wrap.appendChild(screenHost);

    const printHost = document.createElement('div');
    printHost.className = 'print-host';
    wrap.appendChild(printHost);

    const rollupHost = document.createElement('div');
    rollupHost.className = 'week-rollup-host';
    wrap.appendChild(rollupHost);

    return { wrap, screenHost, printHost, rollupHost };
  }

  function refreshDayRollup(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
    appState.marks = loadMarks();
    appState.schedule?.weeks?.forEach((week, index) => {
      const day = week.find(candidate => candidate.inMonth && candidate.date === date);
      const host = appState.weekHosts[index];
      const previous = host?.rollupHost?.querySelector('[data-rollup-date="' + date + '"]');
      if (day && previous) {
        const replacement = buildWeekRollup([day], index).querySelector('.day-rollup');
        if (replacement) previous.replaceWith(replacement);
      }
    });
    appState.printDirty = true;
  }
  function refreshAllRollups() {
    appState.marks = loadMarks();
    appState.schedule?.weeks?.forEach((week, index) => {
      const host = appState.weekHosts[index];
      if (!host?.rollupHost?.querySelector('.rollup-box')) return;
      host.rollupHost.replaceChildren(buildWeekRollup(week, index));
      alignWeekRollup(index);
    });
    appState.printDirty = true;
  }
  function alignWeekRollup(weekIndex) {
    const host = appState.weekHosts[weekIndex];
    const table = host?.screenHost?.querySelector('table.screen-week-grid');
    const grid = host?.rollupHost?.querySelector('.week-rollup-grid-7');
    const headers = table?.querySelectorAll('thead th');
    if (!grid || !headers || headers.length !== 8) return;
    const origin = headers[1].getBoundingClientRect();
    const rollup = host.rollupHost.getBoundingClientRect();
    const widths = [...headers].slice(1).map(th => th.getBoundingClientRect().width);
    if (!rollup.width || widths.some(width => !width)) return;
    grid.style.marginLeft = `${origin.left - rollup.left}px`;
    grid.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
    grid.style.gridTemplateColumns = widths.map(width => `${width}px`).join(' ');
  }
  function renderWeekAt(weekIndex) {
    const week = appState.schedule.weeks[weekIndex];
    const host = appState.weekHosts[weekIndex];
    if (!week || !host) return;
    clearChildren(host.screenHost);
    clearChildren(host.rollupHost);
    host.screenHost.appendChild(buildScreenWeekGrid(week));
    host.rollupHost.appendChild(buildWeekRollup(week, weekIndex));
    alignWeekRollup(weekIndex);
    appState.renderedWeeks.add(weekIndex);
    renderFlags();
  }

  function markAllPrintHostsDirty() {
    appState.printBuilt = false;
    appState.printDirty = true;
    appState.weekHosts.forEach(host => {
      if (host?.printHost) clearChildren(host.printHost);
    });
  }

  function rerenderWeekForEntry(entryId) {
    const weekIndex = appState.entryWeekMap[entryId];
    if (typeof weekIndex !== 'number') return;
    renderWeekAt(weekIndex);
    markAllPrintHostsDirty();
  }

  function renderMonthRollup() {
    const container = mustGet('monthRollup');
    clearChildren(container);
    const box = document.createElement('section');
    box.className = 'rollup-box';
    const heading = document.createElement('h4');
    heading.textContent = 'All checked items for ${selectedMonthLabel()}';
    box.appendChild(heading);
    const checked = allCheckedEntries();
    if (!checked.length) {
      const none = document.createElement('div');
      none.className = 'rollup-empty';
      none.textContent = 'No checked programs or box notes yet.';
      box.appendChild(none);
    } else {
      const list = document.createElement('ul');
      list.className = 'month-rollup-list';
      checked.forEach(entry => {
        const li = document.createElement('li');
        li.appendChild(createRollupLine(entry, true));
        list.appendChild(li);
      });
      box.appendChild(list);
    }
    container.appendChild(box);
  }

  function showMonthRollupPlaceholder() {
    const container = mustGet('monthRollup');
    clearChildren(container);
    const box = document.createElement('section');
    box.className = 'rollup-box';
    const heading = document.createElement('h4');
    heading.textContent = 'All checked items for ${selectedMonthLabel()}';
    box.appendChild(heading);
    const note = document.createElement('div');
    note.className = 'rollup-empty';
    note.textContent = 'Loading checked-item rollup…';
    box.appendChild(note);
    container.appendChild(box);
  }

  function queueMonthRollupRender() {
    const run = () => renderMonthRollup();
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 60);
  }

  function scheduleProgressiveRender() {
    const total = appState.schedule.weeks.length;
    const chunkSize = 1;
    function step() {
      const end = Math.min(appState.progressiveIndex + chunkSize, total);
      while (appState.progressiveIndex < end) {
        renderWeekAt(appState.progressiveIndex);
        appState.progressiveIndex += 1;
      }
      if (appState.progressiveIndex < total) {
        requestAnimationFrame(step);
      } else {
        setWeekStatus(`${appState.verification?.checks?.actualDayCount ?? 0} dates • rendered ${appState.renderedWeeks.size}/${total}`);
      }
    }
    step();
  }

  function renderWeekShells() {
    const container = mustGet('weekGrids');
    clearChildren(container);
    appState.weekHosts = [];
    (appState.schedule.weeks || []).forEach((week, weekIndex) => {
      const shell = createWeekShell(week, weekIndex);
      appState.weekHosts.push(shell);
      container.appendChild(shell.wrap);
    });
  }

  function ensurePrintBuilt() {
    if (appState.printBuilt && !appState.printDirty) return;
    appState.weekHosts.forEach((host, weekIndex) => {
      clearChildren(host.printHost);
      host.printHost.appendChild(buildPrintWeekGrid(appState.schedule.weeks[weekIndex]));
    });
    appState.printBuilt = true;
    appState.printDirty = false;
  }

  function positionMenu(menu, x, y) {
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 12);
    const top = Math.min(y, window.innerHeight - rect.height - 12);
    menu.style.left = `${Math.max(12, left)}px`;
    menu.style.top = `${Math.max(12, top)}px`;
  }

  function updateRectControls(entry) {
    const status = mustGet('rectStatus');
    const drawBtn = mustGet('drawRectBtn');
    const clearBtn = mustGet('clearRectBtn');
    const rect = getRectNoteForEntry(entry);
    if (rect) {
      status.textContent = rect.text ? 'Box note saved on this program.' : 'White box saved on this program.';
      drawBtn.textContent = 'Add/edit box note';
      clearBtn.disabled = false;
    } else {
      status.textContent = 'No box note on this program yet.';
      drawBtn.textContent = 'Add box note';
      clearBtn.disabled = true;
    }
  }

  function openContextMenu(entry, x, y) {
    if (isArchiveMode) return;
    const menu = mustGet('contextMenu');
    const form = mustGet('contextMenuForm');
    appState.currentEntryId = entry._id;
    mustGet('menuTitle').textContent = entry.title;
    mustGet('menuMeta').innerHTML = `${fmtDateLabel(entry.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br>${fmtTime(entry.time)} • ${entry.durationMin} min${entry.episode ? ` • ${escapeHtml(entry.episode)}` : ''}`;
    const tags = getTagsForEntry(entry);
    for (const key of TAG_ORDER) {
      if (form.elements[key]) form.elements[key].checked = !!tags[key];
    }
    updateRectControls(entry);
    positionMenu(menu, x, y);
  }

  function closeContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
    appState.currentEntryId = null;
  }

  function saveCurrentMenuTags(clearAll = false) {
    if (isArchiveMode || !appState.currentEntryId) return;
    const entry = getEntryById(appState.currentEntryId);
    if (!entry) return;
    const form = mustGet('contextMenuForm');
    const currentTags = getTagsForEntry(entry);
    for (const key of TAG_ORDER) {
      currentTags[key] = clearAll ? false : !!form.elements[key].checked;
    }
    const rectNote = clearAll ? null : getRectNoteForEntry(entry);
    updateStoredEntry(entry, currentTags, rectNote);
    rerenderWeekForEntry(entry._id);
    renderMonthRollup();
    if (clearAll) closeContextMenu();
    else updateRectControls(entry);
  }

  function beginRectDraw() {
    if (isArchiveMode || !appState.currentEntryId) return;
    const entry = getEntryById(appState.currentEntryId);
    if (!entry) return;
    const existing = getRectNoteForEntry(entry);
    const text = window.prompt('Note for this white box on the selected program (leave blank for a blank white box):', existing?.text || '');
    if (text === null) return;
    const rectNote = normalizeRect(existing ? { ...existing, text } : { x: 3, y: 4, w: 94, h: 90, text });
    updateStoredEntry(entry, getTagsForEntry(entry), rectNote);
    rerenderWeekForEntry(entry._id);
    renderMonthRollup();
    updateRectControls(entry);
    closeContextMenu();
  }

  function bindContextMenuControls() {
    const closeBtn = document.getElementById('closeMenuBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeContextMenu, { signal: instanceEvents.signal });

    const clearMarksBtn = document.getElementById('clearMarksBtn');
    if (clearMarksBtn) clearMarksBtn.addEventListener('click', () => saveCurrentMenuTags(true), { signal: instanceEvents.signal });

    const form = document.getElementById('contextMenuForm');
    if (form && !isArchiveMode) form.addEventListener('change', () => saveCurrentMenuTags(false), { signal: instanceEvents.signal });

    const exportBtn = document.getElementById('exportPdfBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        ensurePrintBuilt();
        window.print();
      }, { signal: instanceEvents.signal });
    }

    const drawBtn = document.getElementById('drawRectBtn');
    if (drawBtn && !isArchiveMode) drawBtn.addEventListener('click', beginRectDraw, { signal: instanceEvents.signal });

    const clearRectBtn = document.getElementById('clearRectBtn');
    if (clearRectBtn && !isArchiveMode) {
      clearRectBtn.addEventListener('click', () => {
        if (!appState.currentEntryId) return;
        const entry = getEntryById(appState.currentEntryId);
        if (!entry) return;
        updateStoredEntry(entry, getTagsForEntry(entry), null);
        rerenderWeekForEntry(entry._id);
        renderMonthRollup();
        updateRectControls(entry);
      }, { signal: instanceEvents.signal });
    }

    const weekGrids = mustGet('weekGrids');
    weekGrids.addEventListener('contextmenu', event => {
      const cell = event.target.closest('.program-cell[data-entry-id]');
      if (!cell || isArchiveMode) return;
      const entry = getEntryById(cell.dataset.entryId);
      if (!entry) return;
      event.preventDefault();
      openContextMenu(entry, event.clientX, event.clientY);
    }, { signal: instanceEvents.signal });

    document.addEventListener('click', event => {
      const menu = document.getElementById('contextMenu');
      if (menu && !menu.classList.contains('hidden') && !menu.contains(event.target)) closeContextMenu();
    }, { signal: instanceEvents.signal });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeContextMenu();
    }, { signal: instanceEvents.signal });

    window.addEventListener('beforeprint', ensurePrintBuilt, { signal: instanceEvents.signal });
    const refreshEditedDay = event => {
      const value = String(event.detail?.entryId || event.detail?.cellKey || '');
      const date = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      if (date) refreshDayRollup(date);
    };
    window.addEventListener('wnmu:cell-planning-tags-saved', refreshEditedDay, { signal: instanceEvents.signal });
    window.addEventListener('wnmu:cell-note-saved', refreshEditedDay, { signal: instanceEvents.signal });
    window.addEventListener('wnmu:remote-storage-loaded', refreshAllRollups, { signal: instanceEvents.signal });
    window.addEventListener('wnmu:title-corrections-changed', () => {
      document.querySelectorAll('.program-title[data-wnmu-original-title]').forEach(title => {
        title.textContent = effectiveDisplayTitle(title.dataset.wnmuOriginalTitle);
      });
      refreshAllRollups();
      appState.printDirty = true;
    }, { signal: instanceEvents.signal });
    let alignFrame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(alignFrame);
      alignFrame = requestAnimationFrame(() =>
        appState.weekHosts.forEach((_, index) => alignWeekRollup(index)));
    }, { signal: instanceEvents.signal, passive: true });
  }

  async function init() {
    const verificationPromise = loadJsonCached(DATA_FILES.verification, 'verification').catch(err => {
      console.error(err);
      return null;
    });

    const scheduleResult = await loadJsonCached(DATA_FILES.schedule, 'schedule');
    appState.schedule = scheduleResult.data;
    appState.scheduleCached = scheduleResult.fromCache;

    const built = buildDateMap(appState.schedule);
    appState.dateMap = built.map;
    appState.entryWeekMap = built.entryWeekMap;
    appState.marks = loadMarks();

    if (isArchiveMode) {
      appState.archiveRecord = await fetchArchiveById(archiveId);
      appState.marks = appState.archiveRecord.snapshot_json || {};
      document.body.classList.add('archive-mode');
    }

    renderArchiveBanner();
    bindContextMenuControls();
    renderWeekShells();
    renderFlags();
    showMonthRollupPlaceholder();
    scheduleProgressiveRender();
    queueMonthRollupRender();

    window.__WNMU_DEBUG__ = {
      getEntryById,
      getActiveTagKeys,
      getDefaultTags,
      getRectNoteForEntry,
      TAG_ORDER,
      CONFIG,
      getMarks: () => appState.marks,
      getConfig: () => ({
        buildVersion: CONFIG.buildVersion,
        channelCode: CONFIG.channelCode,
        channelLabel: CONFIG.channelLabel,
        scheduleFile: CONFIG.scheduleFile,
        verificationFile: CONFIG.verificationFile,
        storageKey: CONFIG.storageKey
      }),
      isArchiveMode: () => isArchiveMode
    };

    const verificationResult = await verificationPromise;
    if (verificationResult) {
      appState.verification = verificationResult.data;
      appState.verificationCached = verificationResult.fromCache;
      renderFlags();
      const fillCount = appState.verification?.checks?.autoFilledGapSlots || 0;
      setWeekStatus(`${appState.verification?.checks?.actualDayCount ?? 0} dates${fillCount ? ` • ${fillCount} slot fills` : ''} • rendered ${appState.renderedWeeks.size}/${appState.schedule.weeks.length}`);
    }
  }

  init().catch(err => {
    document.body.innerHTML = `<pre style="padding:20px;color:#900;white-space:pre-wrap">${escapeHtml(String(err))}\n\nDeploy note: upload the entire matching build package so page, config, and script versions stay together.</pre>`;
    console.error(err);
  });
})();
