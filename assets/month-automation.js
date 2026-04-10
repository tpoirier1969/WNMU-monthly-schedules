(function(){
  const SLOT_COUNT = 48;
  const SLOT_MINUTES = 30;
  const MONTH = window.MONTH_CONFIG?.month || '2026-05';
  const PROGRAMS = Array.isArray(window.MONTH_PROGRAMS) ? window.MONTH_PROGRAMS : [];
  const monthStart = new Date(`${MONTH}-01T00:00:00`);
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const monthEnd = new Date(nextMonth.getTime() - 86400000);
  function iso(d){ return d.toISOString().slice(0,10); }
  function addDays(date, days){ const d = new Date(date); d.setDate(d.getDate()+days); return d; }
  function pad(n){ return String(n).padStart(2,'0'); }
  function minutesFromTime(text){ const [hh,mm] = text.split(':').map(Number); return hh*60+mm; }
  function slotLabel(i){ const mins=i*SLOT_MINUTES; const hh=Math.floor(mins/60); const mm=mins%60; const suffix=hh>=12?'PM':'AM'; const h=((hh+11)%12)+1; return `${h}:${pad(mm)} ${suffix}`; }
  function weekStartSunday(d){ const out=new Date(d); out.setDate(out.getDate()-out.getDay()); return out; }
  function headerLabel(d){ return d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'}).replace(',', '<br>'); }
  function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function expandPrograms(programs){
    const slots = new Map();
    const errors = [];
    for(const prog of programs){
      const startMin = minutesFromTime(prog.start);
      const slotIndex = Math.floor(startMin / SLOT_MINUTES);
      const slotCount = Math.max(1, Math.round((prog.durationMinutes || 30) / SLOT_MINUTES));
      const entry = { ...prog, key:`${prog.date}__${prog.start}`, slotIndex, slotCount };
      for(let i=0;i<slotCount;i++){
        const slotKey = `${prog.date}__${slotIndex+i}`;
        if(slots.has(slotKey)){
          errors.push(`Overlap at ${prog.date} ${prog.start}: ${prog.title} collides with ${slots.get(slotKey).entry.title}`);
          continue;
        }
        slots.set(slotKey, { start: i===0, entry });
      }
    }
    return { slots, errors };
  }
  function render(){
    const { slots, errors } = expandPrograms(PROGRAMS);
    document.getElementById('count-programs').textContent = `${PROGRAMS.length} programs`;
    document.getElementById('count-slots').textContent = `${slots.size} occupied slots`;
    document.getElementById('count-errors').textContent = `${errors.length} overlaps`;
    const firstWeekStart = weekStartSunday(monthStart);
    const lastWeekStart = weekStartSunday(monthEnd);
    const weeks = [];
    for(let d = new Date(firstWeekStart); d <= lastWeekStart; d = addDays(d,7)) weeks.push(new Date(d));
    let html = '';
    for(let w=0; w<weeks.length; w++){
      const start = weeks[w];
      const dates = Array.from({length:7}, (_,i)=>addDays(start,i));
      html += `<section class="week"><h2>Week ${w+1}</h2><table class="grid"><thead><tr><th class="time">Time</th>`;
      for(const d of dates){
        const inMonth = d >= monthStart && d < nextMonth;
        html += inMonth ? `<th>${headerLabel(d)}</th>` : `<th class="outside-month-head"></th>`;
      }
      html += `<th class="time">Time</th></tr></thead><tbody>`;
      const outsideRendered = new Set();
      for(let slotIndex=0; slotIndex<SLOT_COUNT; slotIndex++){
        html += `<tr><td class="time">${slotLabel(slotIndex)}</td>`;
        for(const d of dates){
          const inMonth = d >= monthStart && d < nextMonth;
          const dayIso = iso(d);
          if(!inMonth){
            if(!outsideRendered.has(dayIso)){
              html += `<td class="outside-empty" rowspan="48"></td>`;
              outsideRendered.add(dayIso);
            }
            continue;
          }
          const slotRec = slots.get(`${dayIso}__${slotIndex}`);
          if(!slotRec){ html += `<td class="empty-slot"></td>`; continue; }
          if(!slotRec.start) continue;
          const e = slotRec.entry;
          html += `<td class="program ${e.seasonStart ? 'cell-season' : ''}" rowspan="${e.slotCount}"><div class="cell-title">${escapeHtml(e.title)}</div>${e.episode ? `<div class="cell-episode">${escapeHtml(e.episode)}</div>` : ''}<div class="cell-duration">${e.durationMinutes} min</div></td>`;
        }
        html += `<td class="time-right-cell">${slotLabel(slotIndex)}</td></tr>`;
      }
      html += `</tbody></table></section>`;
    }
    document.getElementById('month-root').innerHTML = html;
    document.getElementById('summary-errors').innerHTML = errors.length ? `<ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : '<div>No overlaps detected in the program table.</div>';
  }
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('export-pdf-btn').addEventListener('click', () => window.print());
    render();
  });
})();
