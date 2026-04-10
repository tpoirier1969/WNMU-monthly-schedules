
async function load() {
  const [scheduleRes, verificationRes] = await Promise.all([
    fetch('schedule-data.json'),
    fetch('verification.json')
  ]);
  const schedule = await scheduleRes.json();
  const verification = await verificationRes.json();

  document.getElementById('versionFlag').textContent = schedule.version;
  const coverageFlag = document.getElementById('coverageFlag');
  coverageFlag.textContent = verification.checks.everyDayHasContinuousCoverage
    ? '31/31 days covered'
    : 'coverage issues';

  const coverageByDate = Object.fromEntries(
    verification.dailyCoverage.map(item => [item.date, item])
  );

  const monthGrid = document.getElementById('monthGrid');
  const dayCardTemplate = document.getElementById('dayCardTemplate');
  const entryTemplate = document.getElementById('entryTemplate');
  const dayTitle = document.getElementById('dayTitle');
  const dayMeta = document.getElementById('dayMeta');
  const scheduleList = document.getElementById('scheduleList');

  function renderDay(date) {
    const day = schedule.days.find(d => d.date === date);
    const coverage = coverageByDate[date];
    if (!day) return;

    dayTitle.textContent = `${day.day}, ${day.date}`;
    dayMeta.textContent = `${day.entries.length} airings • ${coverage.coveredSlots}/48 half-hour slots covered • ${coverage.continuous ? 'continuous coverage' : 'coverage issue'}`;

    scheduleList.innerHTML = '';
    for (const entry of day.entries) {
      const node = entryTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('.entry-time').textContent = `${entry.time} to ${entry.endTime}`;
      const titleEl = node.querySelector('.entry-title');
      titleEl.textContent = entry.title;
      if (entry.seasonStart) titleEl.classList.add('season-start');
      node.querySelector('.entry-meta').textContent = `${entry.episode} • ${entry.durationMin} min`;
      scheduleList.appendChild(node);
    }

    document.querySelectorAll('.day-card').forEach(card => {
      card.classList.toggle('active', card.dataset.date === date);
    });
  }

  for (const day of schedule.days) {
    const coverage = coverageByDate[day.date];
    const node = dayCardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.date = day.date;
    node.querySelector('.date-line').textContent = `${day.day.slice(0,3)} ${day.date.slice(-2)}`;
    node.querySelector('.slot-badge').textContent = `${coverage.coveredSlots}/48`;
    const peek = node.querySelector('.peek-list');
    const preview = day.entries.slice(0, 4).map(entry => `${entry.time} ${entry.title}`);
    for (const line of preview) {
      const div = document.createElement('div');
      div.textContent = line;
      peek.appendChild(div);
    }
    node.addEventListener('click', () => renderDay(day.date));
    monthGrid.appendChild(node);
  }

  renderDay(schedule.days[0].date);
}
load().catch(err => {
  document.body.innerHTML = `<pre style="padding:20px;color:#900">${String(err)}</pre>`;
});
