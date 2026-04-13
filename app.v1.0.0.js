
const BUILD_VERSION = 'v1.0.0';
const DATA_FILES = {
  schedule: 'schedule-data.v1.0.0.json',
  verification: 'verification.v1.0.0.json'
};
const STORAGE_KEY = 'wnmu3plMay2026Marks.v1.0.0';

const TAG_ORDER = ['newSeries', 'highlight', 'oneOff', 'monthlyTopic', 'fundraiser', 'programmersChoice', 'holiday', 'noteworthy', 'educational', 'local'];
const TAG_PRIORITY = ['holiday', 'fundraiser', 'programmersChoice', 'educational', 'highlight', 'newSeries', 'noteworthy', 'local', 'oneOff', 'monthlyTopic'];
const TAG_META = {
  newSeries: { label: 'New Series', color: 'var(--new-series)' },
  highlight: { label: 'Highlight', color: 'var(--highlight)' },
  oneOff: { label: 'One Off', color: 'var(--one-off)' },
  monthlyTopic: { label: 'Monthly topic', color: 'var(--monthly-topic)' },
  fundraiser: { label: 'Fundraiser', color: 'var(--fundraiser)' },
  programmersChoice: { label: "Programmer's Choice", color: 'var(--programmers-choice)' },
  holiday: { label: 'Holiday', color: 'var(--holiday)' },
  noteworthy: { label: 'Noteworthy', color: 'var(--noteworthy)' },
  educational: { label: 'Educational', color: 'var(--educational)' },
  local: { label: 'Local', color: 'var(--local)' }
};

let appState = {
  schedule: null,
  verification: null,
  dateMap: {},
  marks: {},
  currentEntryId: null,
  noteSaveTimer: null
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
  return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}__${slugify(entry.sourceDate || entry.date)}__${slugify(entry.sourceTime || entry.time)}`;
}

function getWeekday(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}

function getDefaultTags(entry) {
  const weekday = getWeekday(entry.date);
  return {
    newSeries: !!entry.seasonStart,
    highlight: false,
    oneOff: false,
    monthlyTopic: false,
    fundraiser: false,
    programmersChoice: weekday === 'Sunday' && entry.time === '19:00',
    holiday: false,
    noteworthy: false,
    educational: weekday === 'Saturday' && entry.time === '20:00',
    local: false
  };
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

function getStoredState(entry) {
  return appState.marks[entry._id] || {};
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

function getNoteForEntry(entry) {
  return String(getStoredState(entry).note || '').trim();
}

function getWhiteoutForEntry(entry) {
  return !!getStoredState(entry).whiteout;
}

function getActiveTagKeys(entry) {
  const tags = getTagsForEntry(entry);
  return TAG_ORDER.filter(key => tags[key]);
}

function getBackgroundForEntry(entry) {
  if (getWhiteoutForEntry(entry)) return '#ffffff';
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

function renderFlags(schedule, verification) {
  mustGet('versionFlag').textContent = `${BUILD_VERSION} • notes + whiteout`;
  mustGet('coverageFlag').textContent = verification?.checks?.everyDayHas48CoveredSlots ? '31/31 days at 48/48' : 'coverage issue';
  const fillCount = verification?.checks?.autoFilledGapSlots ?? 0;
  mustGet('daysFlag').textContent = `${verification?.checks?.actualDayCount ?? 0} May dates • ${fillCount} slot fills`;
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
  const note = getNoteForEntry(entry);
  const notePart = note ? ` • Note: ${escapeHtml(note)}` : '';
  if (includeFullMeta) {
    line.innerHTML = `<strong>${fmtDateLabel(entry.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong> • ${fmtTime(entry.time)} • ${entry.durationMin} min • <strong>${escapeHtml(entry.title)}</strong>${episodePart ? ` <span class="meta">${escapeHtml(episodePart)}</span>` : ''} <span class="meta">• ${escapeHtml(active)}</span>${notePart ? ` <span class="meta">${notePart}</span>` : ''}`;
  } else {
    line.innerHTML = `<strong>${fmtTime(entry.time)}</strong> • ${escapeHtml(entry.title)} <span class="meta">(${escapeHtml(active)})</span>${notePart ? ` <span class="meta">${notePart}</span>` : ''}`;
  }
  return line;
}

function allCheckedEntries() {
  const out = [];
  for (const day of appState.schedule.days || []) {
    const normalizedDay = appState.dateMap[day.date];
    for (const entry of normalizedDay.entries || []) {
      if (getActiveTagKeys(entry).length) out.push(entry);
    }
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return out;
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
        if (getActiveTagKeys(entry).length) td.classList.add('marked');
        if (getWhiteoutForEntry(entry)) td.classList.add('whiteout');
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
          activeTags.slice(0, 4).forEach(tagKey => tags.appendChild(createTagPill(tagKey)));
          content.appendChild(tags);
        }

        const note = getNoteForEntry(entry);
        if (note) {
          const badge = document.createElement('div');
          badge.className = 'note-badge';
          badge.textContent = 'Note saved';
          content.appendChild(badge);

          const preview = document.createElement('div');
          preview.className = 'note-preview';
          preview.textContent = note;
          content.appendChild(preview);
        }

        td.appendChild(content);

        if (getWhiteoutForEntry(entry)) {
          const overlay = document.createElement('div');
          overlay.className = 'whiteout-overlay';
          td.appendChild(overlay);
        }

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

    const entries = (appState.dateMap[day.date]?.entries || []).filter(entry => getActiveTagKeys(entry).length);
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
    none.textContent = 'No checked programs yet.';
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

function openContextMenu(entry, x, y) {
  const menu = mustGet('contextMenu');
  const form = mustGet('contextMenuForm');
  appState.currentEntryId = entry._id;

  mustGet('menuTitle').textContent = entry.title;
  let meta = `${fmtDateLabel(entry.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br>${fmtTime(entry.time)} • ${entry.durationMin} min`;
  if (entry.episode) meta += ` • ${escapeHtml(entry.episode)}`;
  if (entry.sourceDate && (entry.sourceDate !== entry.date || entry.sourceTime !== entry.time)) {
    meta += `<br><span class="meta">carryover from ${escapeHtml(entry.sourceDate)} ${escapeHtml(entry.sourceTime)}</span>`;
  }
  mustGet('menuMeta').innerHTML = meta;

  const tags = getTagsForEntry(entry);
  for (const key of TAG_ORDER) {
    if (form.elements[key]) form.elements[key].checked = !!tags[key];
  }
  form.elements.whiteout.checked = getWhiteoutForEntry(entry);
  form.elements.note.value = getNoteForEntry(entry);

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

function closeContextMenu() {
  const menu = mustGet('contextMenu');
  menu.classList.add('hidden');
  menu.setAttribute('aria-hidden', 'true');
  appState.currentEntryId = null;
  if (appState.noteSaveTimer) {
    clearTimeout(appState.noteSaveTimer);
    appState.noteSaveTimer = null;
  }
}

function writeEntryState(entryId, payload) {
  const entry = getEntryById(entryId);
  if (!entry) return;
  const defaults = getDefaultTags(entry);
  const tagOverrides = {};
  for (const key of TAG_ORDER) {
    const value = !!payload.tags[key];
    if (value !== defaults[key]) tagOverrides[key] = value;
  }
  const note = String(payload.note || '').trim();
  const whiteout = !!payload.whiteout;
  if (!Object.keys(tagOverrides).length && !note && !whiteout) {
    delete appState.marks[entryId];
  } else {
    appState.marks[entryId] = {
      tags: tagOverrides,
      note,
      whiteout
    };
  }
  saveMarks();
}

function captureMenuPayload() {
  const form = mustGet('contextMenuForm');
  const tags = {};
  TAG_ORDER.forEach(key => {
    tags[key] = !!form.elements[key].checked;
  });
  return {
    tags,
    whiteout: !!form.elements.whiteout.checked,
    note: form.elements.note.value
  };
}

function rerenderAll() {
  renderWeekGrids();
  renderMonthRollup();
}

function bindContextMenuControls() {
  mustGet('closeMenuBtn').addEventListener('click', closeContextMenu);
  mustGet('clearMarksBtn').addEventListener('click', () => {
    if (!appState.currentEntryId) return;
    const form = mustGet('contextMenuForm');
    TAG_ORDER.forEach(key => { form.elements[key].checked = false; });
    form.elements.whiteout.checked = false;
    form.elements.note.value = '';
    writeEntryState(appState.currentEntryId, captureMenuPayload());
    rerenderAll();
    closeContextMenu();
  });

  const form = mustGet('contextMenuForm');
  form.addEventListener('change', event => {
    if (!appState.currentEntryId) return;
    if (event.target.name === 'note') return;
    writeEntryState(appState.currentEntryId, captureMenuPayload());
    rerenderAll();
  });

  form.elements.note.addEventListener('input', () => {
    if (!appState.currentEntryId) return;
    if (appState.noteSaveTimer) clearTimeout(appState.noteSaveTimer);
    appState.noteSaveTimer = setTimeout(() => {
      writeEntryState(appState.currentEntryId, captureMenuPayload());
    }, 250);
  });

  form.elements.note.addEventListener('blur', () => {
    if (!appState.currentEntryId) return;
    writeEntryState(appState.currentEntryId, captureMenuPayload());
    rerenderAll();
  });

  document.addEventListener('click', event => {
    const menu = mustGet('contextMenu');
    if (!menu.classList.contains('hidden') && !menu.contains(event.target)) {
      closeContextMenu();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeContextMenu();
  });
}

loadData().then(({ schedule, verification }) => {
  appState.schedule = schedule;
  appState.verification = verification;
  appState.dateMap = buildDateMap(schedule);
  appState.marks = loadMarks();
  renderFlags(schedule, verification);
  bindContextMenuControls();
  renderWeekGrids();
  renderMonthRollup();
}).catch(err => {
  document.body.innerHTML = `<pre style="padding:20px;color:#900;white-space:pre-wrap">${escapeHtml(String(err))}\n\nDeploy note: upload the entire package to a new empty repo or completely replace the old site files.</pre>`;
  console.error(err);
});
