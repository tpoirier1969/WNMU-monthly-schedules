from __future__ import annotations

import argparse
import re
from collections import defaultdict
from pathlib import Path

PROGRAM_RE = re.compile(r'window\.MONTH_PROGRAMS\s*=\s*(\[.*\]);?\s*$', re.S)


def hhmm_to_minutes(text: str) -> int:
    hh, mm = map(int, text.split(':'))
    return hh * 60 + mm


def main() -> None:
    parser = argparse.ArgumentParser(description='Validate external month program table JS.')
    parser.add_argument('jsfile')
    args = parser.parse_args()

    raw = Path(args.jsfile).read_text(encoding='utf-8')
    m = PROGRAM_RE.search(raw)
    if not m:
        raise SystemExit('Could not find window.MONTH_PROGRAMS in JS file.')
    import json
    rows = json.loads(m.group(1))

    by_date = defaultdict(list)
    for row in rows:
        by_date[row['date']].append(row)

    overlaps = []
    gaps = []
    for iso_date, items in sorted(by_date.items()):
        occupied = {}
        starts = []
        for row in items:
            start = hhmm_to_minutes(row['start'])
            duration = int(row.get('durationMinutes') or 30)
            slot_count = max(1, round(duration / 30))
            starts.append(start)
            for i in range(slot_count):
                minute = start + i * 30
                if minute in occupied:
                    overlaps.append((iso_date, minute, row['title'], occupied[minute]))
                occupied[minute] = row['title']
        if occupied:
            mins = sorted(occupied)
            for a, b in zip(mins, mins[1:]):
                if b - a > 30:
                    gaps.append((iso_date, a, b))
                    break

    print(f'Programs: {len(rows)}')
    print(f'Dates populated: {len(by_date)}')
    print(f'Overlaps: {len(overlaps)}')
    print(f'Days with first detected internal gap: {len(gaps)}')
    if overlaps:
        print('\nSample overlaps:')
        for iso_date, minute, title, prior in overlaps[:20]:
            print(f' - {iso_date} {minute//60:02d}:{minute%60:02d}: {title} overlaps {prior}')
    if gaps:
        print('\nSample internal gaps:')
        for iso_date, a, b in gaps[:20]:
            print(f' - {iso_date}: gap after {a//60:02d}:{a%60:02d} before {b//60:02d}:{b%60:02d}')


if __name__ == '__main__':
    main()
