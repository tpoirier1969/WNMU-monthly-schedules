
const CONFIG = {
  "buildVersion": "v1.0.1",
  "scheduleFile": "schedule-data.v1.0.0.json",
  "verificationFile": "verification.v1.0.0.json",
  "storageKey": "wnmu3plMay2026Marks.v1.0.0",
  "useSourceInId": true,
  "tagOrder": [
    "newSeries",
    "highlight",
    "oneOff",
    "monthlyTopic",
    "fundraiser",
    "programmersChoice",
    "holiday",
    "noteworthy",
    "educational",
    "local",
    "arts"
  ],
  "tagPriority": [
    "holiday",
    "fundraiser",
    "programmersChoice",
    "arts",
    "educational",
    "highlight",
    "newSeries",
    "noteworthy",
    "local",
    "oneOff",
    "monthlyTopic"
  ],
  "tagMeta": {
    "newSeries": {
      "label": "New Series",
      "color": "var(--new-series)"
    },
    "highlight": {
      "label": "Highlight",
      "color": "var(--highlight)"
    },
    "oneOff": {
      "label": "One Off",
      "color": "var(--one-off)"
    },
    "monthlyTopic": {
      "label": "Monthly topic",
      "color": "var(--monthly-topic)"
    },
    "fundraiser": {
      "label": "Fundraiser",
      "color": "var(--fundraiser)"
    },
    "programmersChoice": {
      "label": "Programmer's Choice",
      "color": "var(--programmers-choice)"
    },
    "holiday": {
      "label": "Holiday",
      "color": "var(--holiday)"
    },
    "noteworthy": {
      "label": "Noteworthy",
      "color": "var(--noteworthy)"
    },
    "educational": {
      "label": "Educational",
      "color": "var(--educational)"
    },
    "local": {
      "label": "Local",
      "color": "var(--local)"
    },
    "arts": {
      "label": "Arts",
      "color": "var(--arts)"
    }
  },
  "suppressAllAutoRules": [
    {
      "range": [
        "00:00",
        "09:30"
      ]
    },
    {
      "weekdays": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      "range": [
        "09:30",
        "17:30"
      ]
    },
    {
      "weekdays": [
        "Saturday"
      ],
      "range": [
        "09:30",
        "16:00"
      ]
    }
  ],
  "suppressNewSeriesRules": [],
  "autoTagRules": [
    {
      "tag": "programmersChoice",
      "weekdays": [
        "Sunday"
      ],
      "times": [
        "19:00"
      ]
    },
    {
      "tag": "educational",
      "weekdays": [
        "Saturday"
      ],
      "times": [
        "20:00"
      ]
    },
    {
      "tag": "arts",
      "weekdays": [
        "Saturday"
      ],
      "range": [
        "17:00",
        "20:00"
      ]
    },
    {
      "tag": "arts",
      "weekdays": [
        "Sunday"
      ],
      "range": [
        "10:00",
        "13:00"
      ]
    }
  ]
};
const BUILD_VERSION = CONFIG.buildVersion;
const DATA_FILES = {
  schedule: CONFIG.scheduleFile,
  verification: CONFIG.verificationFile
};
const STORAGE_KEY = CONFIG.storageKey;
const TAG_ORDER = CONFIG.tagOrder;
const TAG_PRIORITY = CONFIG.tagPriority;
const TAG_META = CONFIG.tagMeta;

let appState = {
  schedule: null,
  verification: null,
  dateMap: {},
  marks: {},
  currentEntryId: null,
  drawMode: null
};

function mustGet(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required element #${id}. This usually means files from different builds were mixed together. Replace the entire site with the same package.`);
  }
  return el;
}

async function loadData() {
  const [scheduleRes, verificationRes] = await Promise.all([
    fetch(`${DATA_FILES.schedule}?build=${BUILD_VERSION}`, { cache: 'no-store' }),
    fetch(`${DATA_FILES.verification}?build=${BUILD_VERSION}`, { cache: 'no-store' })
  ]);
  if (!scheduleRes.ok) throw new Error(`Could not load ${DATA_FILES.schedule} (${scheduleRes.status})`);
  if (!verificationRes.ok) throw new Error(`Could not load ${DATA_FILES.verification} (${verificationRes.status})`);
  return {
    schedule: await scheduleRes.json(),
    verification: await verificationRes.json()
  };
}

function fmtDateLabel(dateStr, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', opts);
}

function fmtTime(timeStr) {
  const [hh, mm] = timeStr.split(':').map(Number);
  const d = new Date(2026, 4, 1, hh, mm);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEntryId(entry) {
  if (CONFIG.useSourceInId) {
    return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}__${slugify(entry.sourceDate || entry.date)}__${slugify(entry.sourceTime || entry.time)}`;
  }
  return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}`;
}

function buildDateMap(schedule) {
  const map = {};
  for (const day of schedule.days || []) {
    map[day.date] = {
      ...day,
      entries: (day.entries || []).map(entry => ({ ...entry, _id: buildEntryId(entry) }))
    };
  }
  return map;
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

function loadMarks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveMarks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.marks));
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
  saveMarks();
}

function allCheckedEntries() {
  const out = [];
  for (const day of appState.schedule.days || []) {
    const normalizedDay = appState.dateMap[day.date];
    for (const entry of normalizedDay.entries || []) {
      if (getActiveTagKeys(entry).length || getRectNoteForEntry(entry)) out.push(entry);
    }
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return out;
}

function renderFlags() {
  mustGet('versionFlag').textContent = `${BUILD_VERSION} • draw-rectangle notes`;
  mustGet('coverageFlag').textContent = appState.verification?.checks?.everyDayHas48CoveredSlots ? '31/31 days at 48/48' : 'coverage issue';
  const fillCount = appState.verification?.checks?.autoFilledGapSlots || 0;
  const tail = fillCount ? ` • ${fillCount} slot fills` : '';
  mustGet('daysFlag').textContent = `${appState.verification?.checks?.actualDayCount ?? 0} May dates${tail}`;
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
  const active = getActiveTagKeys(entry).map(key => TAG_META[key].label).join(', ');
  const episodePart = entry.episode ? ` • ${entry.episode}` : '';
  const rectNote = getRectNoteForEntry(entry);
  const notePart = rectNote?.text ? ` • Box note: ${escapeHtml(rectNote.text)}` : (rectNote ? ' • Box note' : '');
  if (includeFullMeta) {
    line.innerHTML = `<strong>${fmtDateLabel(entry.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong> • ${fmtTime(entry.time)} • ${entry.durationMin} min • <strong>${escapeHtml(entry.title)}</strong>${episodePart ? ` <span class="meta">${escapeHtml(episodePart)}</span>` : ''}${active ? ` <span class="meta">• ${escapeHtml(active)}</span>` : ''}${notePart ? ` <span class="meta">${notePart}</span>` : ''}`;
  } else {
    line.innerHTML = `<strong>${fmtTime(entry.time)}</strong> • ${escapeHtml(entry.title)}${active ? ` <span class="meta">(${escapeHtml(active)})</span>` : ''}${notePart ? ` <span class="meta">${notePart}</span>` : ''}`;
  }
  return line;
}

function renderWeekGrids() {
  const container = mustGet('weekGrids');
  clearChildren(container);
  appState.schedule.weeks.forEach((week, weekIndex) => {
    const wrap = document.createElement('section');
    wrap.className = 'week-grid-wrap';

    const heading = document.createElement('h3');
    const weekDates = week.filter(day => day.inMonth);
    const rangeStart = weekDates[0]?.date || week[0].date;
    const rangeEnd = weekDates[weekDates.length - 1]?.date || week[6].date;
    heading.textContent = `Week ${weekIndex + 1} • ${fmtDateLabel(rangeStart)} – ${fmtDateLabel(rangeEnd)}`;
    wrap.appendChild(heading);

    const table = document.createElement('table');
    table.className = 'week-grid';

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
        const entry = (normalizedDay.entries || []).find(e => e.time === slotTime);
        if (!entry) {
          td.className = 'program-cell';
          tr.appendChild(td);
          return;
        }

        td.className = 'program-cell';
        td.dataset.entryId = entry._id;
        if (getActiveTagKeys(entry).length) td.classList.add('marked');
        if (appState.drawMode?.entryId === entry._id) td.classList.add('drawing-armed');
        td.style.setProperty('--mark-background', getBackgroundForEntry(entry));
        td.rowSpan = entry.slotCount;

        const content = document.createElement('div');
        content.className = 'program-content';

        const title = document.createElement('div');
        title.className = 'program-title';
        title.textContent = entry.title;
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

        td.addEventListener('contextmenu', event => {
          event.preventDefault();
          openContextMenu(entry, event.clientX, event.clientY);
        });

        tr.appendChild(td);
        skip[dayIndex] = entry.slotCount - 1;
      });

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    wrap.appendChild(buildWeekRollup(week, weekIndex));
    container.appendChild(wrap);
  });
}

function buildRectNoteElement(rectNote, preview = false) {
  const box = document.createElement('div');
  box.className = `draw-rect-note${preview ? ' preview' : ''}`;
  box.style.left = `${rectNote.x}%`;
  box.style.top = `${rectNote.y}%`;
  box.style.width = `${rectNote.w}%`;
  box.style.height = `${rectNote.h}%`;
  if (!preview && rectNote.text) {
    const txt = document.createElement('div');
    txt.className = 'draw-rect-note-text';
    txt.textContent = rectNote.text;
    box.appendChild(txt);
  }
  return box;
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
    if (!day.inMonth) dayBox.classList.add('outside-day');
    const heading = document.createElement('h5');
    heading.textContent = `${day.dayName} • ${fmtDateLabel(day.date, { month: 'short', day: 'numeric' })}`;
    dayBox.appendChild(heading);
    if (!day.inMonth) {
      const none = document.createElement('div');
      none.className = 'rollup-empty';
      none.textContent = 'Outside May';
      dayBox.appendChild(none);
      grid.appendChild(dayBox);
      return;
    }
    const entries = (appState.dateMap[day.date]?.entries || []).filter(entry => getActiveTagKeys(entry).length || getRectNoteForEntry(entry));
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

function renderMonthRollup() {
  const container = mustGet('monthRollup');
  clearChildren(container);
  const box = document.createElement('section');
  box.className = 'rollup-box';
  const heading = document.createElement('h4');
  heading.textContent = 'All checked items for May 2026';
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
    status.textContent = rect.text ? 'Rectangle note saved for this program.' : 'Blank cover rectangle saved for this program.';
    drawBtn.textContent = 'Redraw rectangle / note';
    clearBtn.disabled = false;
  } else {
    status.textContent = 'No rectangle note on this program yet.';
    drawBtn.textContent = 'Draw rectangle / note';
    clearBtn.disabled = true;
  }
}

function openContextMenu(entry, x, y) {
  cancelDrawMode(false);
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
  const menu = mustGet('contextMenu');
  menu.classList.add('hidden');
  menu.setAttribute('aria-hidden', 'true');
  appState.currentEntryId = null;
}

function saveCurrentMenuTags(clearAll = false) {
  if (!appState.currentEntryId) return;
  const entry = getEntryById(appState.currentEntryId);
  if (!entry) return;
  const form = mustGet('contextMenuForm');
  const currentTags = getTagsForEntry(entry);
  for (const key of TAG_ORDER) {
    currentTags[key] = clearAll ? false : !!form.elements[key].checked;
  }
  const rectNote = clearAll ? null : getRectNoteForEntry(entry);
  updateStoredEntry(entry, currentTags, rectNote);
  renderWeekGrids();
  renderMonthRollup();
  if (clearAll) closeContextMenu();
  else updateRectControls(entry);
}

function showDrawHint(text) {
  const hint = mustGet('drawHint');
  hint.textContent = text;
  hint.classList.remove('hidden');
}

function hideDrawHint() {
  mustGet('drawHint').classList.add('hidden');
}

function beginRectDraw() {
  if (!appState.currentEntryId) return;
  const entry = getEntryById(appState.currentEntryId);
  if (!entry) return;
  appState.drawMode = { entryId: entry._id, start: null, previewEl: null, cell: null };
  showDrawHint(`Draw mode armed for ${entry.title}. Drag a box on that program cell.`);
  closeContextMenu();
  renderWeekGrids();
}

function cancelDrawMode(rerender = true) {
  const mode = appState.drawMode;
  if (mode?.previewEl && mode.previewEl.parentNode) mode.previewEl.remove();
  if (mode?.cell) mode.cell.classList.remove('drawing-target');
  appState.drawMode = null;
  hideDrawHint();
  if (rerender && appState.schedule) renderWeekGrids();
}

function attachRectNote(entry, rectNote) {
  const currentTags = getTagsForEntry(entry);
  updateStoredEntry(entry, currentTags, rectNote);
  renderWeekGrids();
  renderMonthRollup();
}

function bindDrawHandlers() {
  document.addEventListener('mousedown', event => {
    if (!appState.drawMode) return;
    const cell = event.target.closest('.program-cell[data-entry-id]');
    if (!cell || cell.dataset.entryId !== appState.drawMode.entryId) return;
    event.preventDefault();
    const rect = cell.getBoundingClientRect();
    const startX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const startY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    const preview = buildRectNoteElement({ x: startX, y: startY, w: 2, h: 2, text: '' }, true);
    cell.appendChild(preview);
    cell.classList.add('drawing-target');
    appState.drawMode = { ...appState.drawMode, start: { x: startX, y: startY, rect }, previewEl: preview, cell };
    showDrawHint('Release the mouse to save the rectangle and enter a note.');
  }, true);

  document.addEventListener('mousemove', event => {
    const mode = appState.drawMode;
    if (!mode?.start || !mode.previewEl || !mode.cell) return;
    const rect = mode.start.rect;
    const curX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const curY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    const x = Math.min(mode.start.x, curX);
    const y = Math.min(mode.start.y, curY);
    const w = Math.max(2, Math.abs(curX - mode.start.x));
    const h = Math.max(2, Math.abs(curY - mode.start.y));
    mode.previewEl.style.left = `${x}%`;
    mode.previewEl.style.top = `${y}%`;
    mode.previewEl.style.width = `${w}%`;
    mode.previewEl.style.height = `${h}%`;
  }, true);

  document.addEventListener('mouseup', event => {
    const mode = appState.drawMode;
    if (!mode?.start || !mode.previewEl) return;
    event.preventDefault();
    const style = mode.previewEl.style;
    const rectNote = {
      x: parseFloat(style.left),
      y: parseFloat(style.top),
      w: parseFloat(style.width),
      h: parseFloat(style.height)
    };
    const entry = getEntryById(mode.entryId);
    const existing = entry ? getRectNoteForEntry(entry) : null;
    const text = window.prompt('Text for this rectangle note (leave blank for a blank white box):', existing?.text || '');
    const finalRect = { ...rectNote, text: text === null ? '' : text };
    cancelDrawMode(false);
    if (entry) attachRectNote(entry, finalRect);
  }, true);
}

function bindContextMenuControls() {
  mustGet('closeMenuBtn').addEventListener('click', closeContextMenu);
  mustGet('clearMarksBtn').addEventListener('click', () => saveCurrentMenuTags(true));
  mustGet('contextMenuForm').addEventListener('change', () => saveCurrentMenuTags(false));
  mustGet('drawRectBtn').addEventListener('click', beginRectDraw);
  mustGet('clearRectBtn').addEventListener('click', () => {
    if (!appState.currentEntryId) return;
    const entry = getEntryById(appState.currentEntryId);
    if (!entry) return;
    updateStoredEntry(entry, getTagsForEntry(entry), null);
    renderWeekGrids();
    renderMonthRollup();
    updateRectControls(entry);
  });
  document.addEventListener('click', event => {
    const menu = mustGet('contextMenu');
    if (!menu.classList.contains('hidden') && !menu.contains(event.target)) closeContextMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeContextMenu();
      cancelDrawMode();
    }
  });
}

loadData().then(({ schedule, verification }) => {
  appState.schedule = schedule;
  appState.verification = verification;
  appState.dateMap = buildDateMap(schedule);
  appState.marks = loadMarks();
  renderFlags();
  bindContextMenuControls();
  bindDrawHandlers();
  renderWeekGrids();
  renderMonthRollup();
  window.__WNMU_DEBUG__ = { getEntryById, getActiveTagKeys, getDefaultTags, getRectNoteForEntry, TAG_ORDER, CONFIG };
}).catch(err => {
  document.body.innerHTML = `<pre style="padding:20px;color:#900;white-space:pre-wrap">${escapeHtml(String(err))}\n\nDeploy note: upload the entire package to the repo root so matching files stay together.</pre>`;
  console.error(err);
});
