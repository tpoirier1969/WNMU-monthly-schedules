# WNMU Monthly external-data workflow

1. Start with the clean workbook, not the baked HTML.
2. Run:

```bash
python tools/build_programs_from_clean_workbook.py /path/to/WNMU1HD_May2026_clean_schedule_v2.xlsx --month 2026-05 --channel wnmu1hd --output data/wnmu1hd-2026-05-programs.js
```

3. Validate:

```bash
python tools/validate_program_table.py data/wnmu1hd-2026-05-programs.js
```

4. Open `channels/wnmu1hd/index.html`.

Notes:
- The parser reads the weekly `*Grid` sheets.
- It writes one flat record per program start with inferred duration.
- The renderer expands those records into 30-minute slots.
- Outside-month cells stay blank placeholders.
- This avoids parsing schedule content out of HTML.
