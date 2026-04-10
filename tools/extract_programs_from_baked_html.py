#!/usr/bin/env python3
from bs4 import BeautifulSoup
from pathlib import Path
import re, sys
src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('channels/wnmu1hd/index.html')
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('data/wnmu1hd-2026-05-programs.js')
html = src.read_text(encoding='utf-8')
soup = BeautifulSoup(html, 'html.parser')
programs = []
for cell in soup.select('td.program'):
    cls = cell.get('class', [])
    if 'hole' in cls:
        continue
    date = cell.get('data-date', '')
    if not date.startswith('2026-05-'):
        continue
    m = re.match(r'^(\d{1,2}):(\d{2})\s*([AP]M)$', cell.get('data-time', '').strip(), re.I)
    if not m:
        continue
    hh = int(m.group(1)) % 12
    if m.group(3).upper() == 'PM': hh += 12
    start = f"{hh:02d}:{m.group(2)}"
    dm = re.match(r'^(\d+)m$', cell.get('data-duration', '30m').strip().lower())
    duration = int(dm.group(1)) if dm else 30
    title = (cell.get('data-title') or (cell.select_one('.title').get_text(' ', strip=True) if cell.select_one('.title') else '')).strip()
    episode = (cell.get('data-episode') or (cell.select_one('.episode').get_text(' ', strip=True) if cell.select_one('.episode') else '')).strip()
    episode = episode.replace('APXSTE','').replace('APX','').replace('STE','').replace('DVS','').strip()
    programs.append({'date':date,'start':start,'title':title,'episode':episode,'durationMinutes':duration,'seasonStart':'season-start' in cls})
programs.sort(key=lambda r:(r['date'],r['start']))
lines = ["window.MONTH_CONFIG = { channel: 'wnmu1hd', month: '2026-05' };", "window.MONTH_PROGRAMS = ["]
for p in programs:
    title = p['title'].replace('\', '\\').replace("'", "\'")
    episode = p['episode'].replace('\', '\\').replace("'", "\'")
    lines.append(f"  {{ date:'{p['date']}', start:'{p['start']}', title:'{title}', episode:'{episode}', durationMinutes:{p['durationMinutes']}, seasonStart:{str(p['seasonStart']).lower()} }},")
lines.append('];')
out.write_text('\n'.join(lines), encoding='utf-8')
print(f'Wrote {len(programs)} programs to {out}')
