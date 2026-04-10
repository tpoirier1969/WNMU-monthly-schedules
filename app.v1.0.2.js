const BUILD_VERSION = 'v1.0.2';
const DATA_FILES = {
  schedule: 'schedule-data.v1.0.2.json',
  verification: 'verification.v1.0.2.json'
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

function fmtDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderFlags(schedule, verification) {
  mustGet('versionFlag').textContent = schedule.version ? `${schedule.version} • weekly grids` : `${BUILD_VERSION} • weekly grids`;
  mustGet('coverageFlag').textContent = verification?.checks?.everyDayHas48CoveredSlots ? '31/31 days at 48/48' : 'coverage issue';
  mustGet('daysFlag').textContent = `${verification?.checks?.actualDayCount ?? 0} May dates`;
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function renderWeekGrids(schedule) {
  const container = mustGet('weekGrids');
  clearChildren(container);
  const dateMap = Object.fromEntries((schedule.days || []).map(day => [day.date, day]));
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
      if (day.inMonth && dateMap[day.date]) {
        for (const entry of dateMap[day.date].entries || []) {
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
        td.className = 'program-cell';
        if (value.seasonStart) td.classList.add('season-start');
        td.rowSpan = value.slotCount;
        td.innerHTML = `<div class="program-title">${value.title}</div><div class="program-episode">${value.episode}</div><div class="program-duration">${value.durationMin} min</div>`;
        tr.appendChild(td);
        skip[dayIndex] = value.slotCount - 1;
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  });
}

loadData().then(({ schedule, verification }) => {
  renderFlags(schedule, verification);
  renderWeekGrids(schedule);
}).catch(err => {
  document.body.innerHTML = `<pre style="padding:20px;color:#900;white-space:pre-wrap">${String(err)}\n\nDeploy note: upload the entire package to a new empty repo or completely replace the old site files.</pre>`;
  console.error(err);
});
