
(function(){
  function parse12(str){
    const m = String(str).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if(!m) return 0;
    let h = parseInt(m[1],10)%12;
    const min = parseInt(m[2],10);
    if(m[3].toUpperCase()==='PM') h += 12;
    return h*60 + min;
  }
  function fmt12(mins){
    let h = Math.floor(mins/60)%24;
    let m = mins%60;
    const ampm = h < 12 ? 'AM' : 'PM';
    let hh = h % 12;
    if(hh===0) hh = 12;
    return `${hh}:${String(m).padStart(2,'0')} ${ampm}`;
  }
  function dateLabel(iso){
    const d = new Date(iso+'T00:00:00');
    return d.toLocaleDateString('en-US',{month:'short', day:'numeric', year:'numeric'});
  }
  function dayName(iso){
    const d = new Date(iso+'T00:00:00');
    return d.toLocaleDateString('en-US',{weekday:'long'});
  }
  function buildWeeks(){
    const weeks = [];
    let d = new Date('2026-04-26T00:00:00');
    const end = new Date('2026-06-06T00:00:00');
    while(d <= end){
      const wk = [];
      for(let i=0;i<7;i++){
        const x = new Date(d);
        x.setDate(d.getDate()+i);
        wk.push(x.toISOString().slice(0,10));
      }
      weeks.push(wk);
      d.setDate(d.getDate()+7);
    }
    return weeks;
  }
  function bandForMinute(min){
    if(min < 360) return 'overnight';
    if(min < 720) return 'daytime';
    if(min < 1140) return 'afternoon';
    return 'primetime';
  }
  function render(){
    const data = window.SCHEDULE_DATA || {entries:[]};
    const mount = document.getElementById('schedule-mount');
    if(!mount) return;

    const byDate = {};
    for(const e of data.entries){
      if(!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push({...e, startMin: parse12(e.time), span: Math.max(1, Math.round((e.duration||30)/30))});
    }
    for(const date in byDate){
      byDate[date].sort((a,b)=>a.startMin-b.startMin);
    }

    const weeks = buildWeeks();
    let html = '';
    weeks.forEach((week,idx)=>{
      html += `<section class="week-block"><h2>Week ${idx+1}</h2><table class="clean-grid"><thead><tr><th class="time-col">Time</th>`;
      for(const iso of week){
        const outside = !iso.startsWith('2026-05');
        html += `<th class="${outside?'outside':''}">${dayName(iso)}<br><span class="date-line">${dateLabel(iso)}</span></th>`;
      }
      html += `</tr></thead><tbody>`;
      const occupied = {};
      for(const iso of week) occupied[iso] = {};
      for(let min=0; min<1440; min+=30){
        html += `<tr><td class="time-col">${fmt12(min)}</td>`;
        for(const iso of week){
          const outside = !iso.startsWith('2026-05');
          if(occupied[iso][min]){ continue; }
          const hit = (byDate[iso]||[]).find(e => e.startMin===min);
          if(hit){
            const classes = ['program-cell', bandForMinute(min)];
            if(outside) classes.push('outside');
            if(hit.season_start) classes.push('season-start');
            const rowspan = hit.span;
            for(let c=30; c<rowspan*30; c+=30){ occupied[iso][min+c]=true; }
            html += `<td rowspan="${rowspan}" class="${classes.join(' ')}">`+
                    `<div class="title">${hit.title||''}</div>`+
                    `${hit.episode?`<div class="episode">${hit.episode}</div>`:''}`+
                    `<div class="dur">${hit.duration||30}m</div>`+
                    `</td>`;
          } else {
            html += `<td class="empty-cell ${outside?'outside':''}"></td>`;
          }
        }
        html += `</tr>`;
      }
      html += `</tbody></table></section>`;
    });
    mount.innerHTML = html;
  }
  window.addEventListener('DOMContentLoaded', render);
})();
