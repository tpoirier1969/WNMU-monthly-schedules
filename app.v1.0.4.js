const BUILD_VERSION = 'v1.0.4';
const DATA_FILES = {
  schedule: 'schedule-data.v1.0.4.json',
  verification: 'verification.v1.0.4.json'
};
const STORAGE_KEY = 'wnmu1hdMay2026Marks.v1.0.4';
const TAG_ORDER = ['newSeries', 'highlight', 'oneOff', 'monthlyTopic'];
const TAG_PRIORITY = ['highlight', 'newSeries', 'oneOff', 'monthlyTopic'];
const TAG_META = {
  newSeries: { label: 'New Series', color: 'var(--new-series)' },
  highlight: { label: 'Highlight', color: 'var(--highlight)' },
  oneOff: { label: 'One Off', color: 'var(--one-off)' },
  monthlyTopic: { label: 'Monthly topic', color: 'var(--monthly-topic)' }
};

let appState = {
  schedule: null,
  verification: null,
  dateMap: {},
  marks: {},
  currentEntryId: null
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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEntryId(entry) {
  return `${entry.date}__${entry.time}__${slugify(entry.title)}__${slugify(entry.episode || 'no-episode')}`;
}

function getDefaultTags(entry) {
  return {
    newSeries: !!entry.seasonStart,
    highlight: false,
    oneOff: false,
    monthlyTopic: false
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

function getTagsForEntry(entry) {
  const defaults = getDefaultTags(entry);
  const saved = appState.marks[entry._id] || {};
  return {
    newSeries: typeof saved.newSeries === 'boolean' ? saved.newSeries : defaults.newSeries,
    highlight: typeof saved.highlight === 'boolean' ? saved.highlight : defaults.highlight,
    oneOff: typeof saved.oneOff === 'boolean' ? saved.oneOff : defaults.oneOff,
    monthlyTopic: typeof saved.monthlyTopic === 'boolean' ? saved.monthlyTopic : defaults.monthlyTopic
  };
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

function renderFlags(schedule, verification) {
  mustGet('versionFlag').textContent = `${BUILD_VERSION} • right-click markup`;
  mustGet('coverageFlag').textContent = verification?.checks?.everyDayHas48CoveredSlots ? '31/31 days at 48/48' : 'coverage issue';
  mustGet('daysFlag').textContent = `${verification?.checks?.actualDayCount ?? 0} May dates`;
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
  if (includeFullMeta) {
    line.innerHTML = `<strong>${fmtDateLabel(entry.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong> • ${fmtTime(entry.time)} • ${entry.durationMin} min • <strong>${escapeHtml(entry.title)}</strong>${episodePart ? ` <span class="meta">${escapeHtml(episodePart)}</span>` : ''} <span class="meta">• ${escapeHtml(active)}</span>`;
  } else {
    line.innerHTML = `${fmtTime(entry.time)} • <strong>${escapeHtml(entry.title)}</strong>${episodePart ? ` <span class="meta">${escapeHtml(episodePart)}</span>` : ''} <span class="meta">• ${escapeHtml(active)}</span>`;
  }
  return line;
}

function renderWeekGrids() {
  const schedule = appState.schedule;
  const container = mustGet('weekGrids');
  clearChildren(container);
  const slotLabels = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

  (schedule.weeks || []).forEach((week, weekIndex) => {
    const wrap = document.createElement('section');
    wrap.className = 'week-grid-wrap';
    const firstInMonth = week.find(d => d.inMonth) || week[0];
    const lastInMonth = [...week].reverse().find(d => d.inMonth) || week[6];
    const title = document.createElement('h3');
    title.textContent = `Week ${weekIndex + 1}: ${fmtDateLabel(firstInMonth.date)} to ${fmtDateLabel(lastInMonth.date)}`;
    wrap.appendChild(title);

    const table = document.createElement('table');
    table.className = 'week-grid';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const timeTh = document.createElement('th');
    timeTh.className = 'time-col';
    timeTh.textContent = 'Time';
    headerRow.appendChild(timeTh);
    week.forEach(day => {
      const th = document.createElement('th');
      if (!day.inMonth) th.classList.add('outside');
      th.innerHTML = `${day.dayName}<br><span>${new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const daySlots = week.map(day => {
      const mapped = Array(48).fill(null);
      if (day.inMonth && appState.dateMap[day.date]) {
        for (const entry of appState.dateMap[day.date].entries || []) {
          const startSlot = parseInt(entry.time.slice(0, 2), 10) * 2 + (entry.time.endsWith(':30') ? 1 : 0);
          mapped[startSlot] = entry;
          for (let i = 1; i < entry.slotCount; i += 1) mapped[startSlot + i] = '__covered__';
        }
      }
      return mapped;
    });

    const skip = Array(7).fill(0);
    const tbody = document.createElement('tbody');
    for (let slotIndex = 0; slotIndex < 48; slotIndex += 1) {
      const tr = document.createElement('tr');
      const timeTd = document.createElement('td');
      timeTd.className = 'time-col';
      timeTd.textContent = slotLabels[slotIndex];
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
        const value = daySlots[dayIndex][slotIndex];
        if (!value || value === '__covered__') {
          tr.appendChild(td);
          return;
        }
        const activeTagKeys = getActiveTagKeys(value);
        td.className = 'program-cell';
        if (activeTagKeys.length) td.classList.add('marked');
        td.rowSpan = value.slotCount;
        td.style.setProperty('--mark-background', getBackgroundForEntry(value));
        td.dataset.entryId = value._id;
        td.innerHTML = `<div class="program-title">${escapeHtml(value.title)}</div><div class="program-episode">${escapeHtml(value.episode || '')}</div><div class="program-duration">${value.durationMin} min</div>`;
        if (activeTagKeys.length) {
          const tagsWrap = document.createElement('div');
          tagsWrap.className = 'program-tags';
          activeTagKeys.forEach(tagKey => tagsWrap.appendChild(createTagPill(tagKey)));
          td.appendChild(tagsWrap);
        }
        td.addEventListener('contextmenu', event => {
          event.preventDefault();
          openContextMenu(value, event.clientX, event.clientY);
        });
        tr.appendChild(td);
        skip[dayIndex] = value.slotCount - 1;
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
  title.textContent = `Week ${weekIndex + 1} checked items`;
  box.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'week-rollup-grid';
  week.forEach(day => {
    const dayBox = document.createElement('div');
    dayBox.className = 'day-rollup';
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
      none.textContent = 'None checked yet';
      dayBox.appendChild(none);
    } else {
      const list = document.createElement('ul');
      list.className = 'rollup-list';
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

function getEntryById(entryId) {
  for (const day of Object.values(appState.dateMap)) {
    const found = (day.entries || []).find(entry => entry._id === entryId);
    if (found) return found;
  }
  return null;
}

function openContextMenu(entry, x, y) {
  const menu = mustGet('contextMenu');
  const form = mustGet('contextMenuForm');
  appState.currentEntryId = entry._id;
  mustGet('menuTitle').textContent = entry.title;
  mustGet('menuMeta').innerHTML = `${fmtDateLabel(entry.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br>${fmtTime(entry.time)} • ${entry.durationMin} min${entry.episode ? ` • ${escapeHtml(entry.episode)}` : ''}`;
  const tags = getTagsForEntry(entry);
  for (const key of TAG_ORDER) form.elements[key].checked = !!tags[key];
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
}

function saveCurrentMenuMarks(clearAll = false) {
  if (!appState.currentEntryId) return;
  const form = mustGet('contextMenuForm');
  if (clearAll) {
    appState.marks[appState.currentEntryId] = { newSeries: false, highlight: false, oneOff: false, monthlyTopic: false };
  } else {
    appState.marks[appState.currentEntryId] = {
      newSeries: !!form.elements.newSeries.checked,
      highlight: !!form.elements.highlight.checked,
      oneOff: !!form.elements.oneOff.checked,
      monthlyTopic: !!form.elements.monthlyTopic.checked
    };
  }
  saveMarks();
  renderWeekGrids();
  renderMonthRollup();
  closeContextMenu();
}

function bindContextMenuControls() {
  mustGet('closeMenuBtn').addEventListener('click', closeContextMenu);
  mustGet('clearMarksBtn').addEventListener('click', () => saveCurrentMenuMarks(true));
  mustGet('contextMenuForm').addEventListener('change', () => saveCurrentMenuMarks(false));
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
