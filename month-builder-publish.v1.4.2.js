(function () {
  const BUILD_VERSION = 'v1.4.2';
  const TABLES = {
    importedMonths: 'wnmu_monthly_schedules_imported_months',
    currentMonths: 'wnmu_monthly_schedules_current_months'
  };
  const CHANNELS = {
    '13.1': { label: 'WNMU1HD', prefix: 'wnmu1hd', inputId: 'pdf131', summaryId: 'summary131' },
    '13.3': { label: 'WNMU3PL', prefix: 'wnmu3pl', inputId: 'pdf133', summaryId: 'summary133' }
  };

  function el(id) { return document.getElementById(id); }
  function monthLabel(monthKey) {
    const [y, m] = String(monthKey).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function setStatus(text, cls) {
    const box = el('statusBox');
    if (!box) return;
    box.className = `status${cls ? ' ' + cls : ''}`;
    box.textContent = text;
  }
  function appendStatus(text, cls) {
    const box = el('statusBox');
    if (!box) return;
    box.className = `status${cls ? ' ' + cls : ''}`;
    box.textContent = `${box.textContent ? `${box.textContent}\n` : ''}${text}`;
  }
  function setSummary(channelCode, text) {
    const target = el(CHANNELS[channelCode].summaryId);
    if (target) target.textContent = text;
  }
  function getCfg() {
    return window.WNMU_SHAREBOARD_SUPABASE;
  }
  function ensureCfg() {
    const cfg = getCfg();
    if (!cfg?.url || !cfg?.anonKey) throw new Error('config.js is missing Supabase url/anonKey. The live publish step cannot run.');
    return cfg;
  }
  async function restWrite(path, body, method) {
    const cfg = ensureCfg();
    const res = await fetch(`${cfg.url}${path}`, {
      method: method || 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase write failed (${res.status}) ${txt}`.trim());
    }
    return res.json().catch(() => null);
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u0019/g, "'")
      .replace(/\u00a0/g, ' ')
      .replace(/\u2019/g, "'");
  }
  function cleanupCellText(text) {
    let s = normalizeText(text);
    s = s.replace(/\b([A-Za-z]+)\s+'\s+S\b/g, "$1'S");
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/(\d{2}:\d{2}:\d)\s+(\d)/g, '$1$2');
    s = s.replace(/(#\d{1,4})\s+(\d[\w$#]*)/g, '$1$2');
    return s;
  }
  function normalizeTokens(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i];
      const next = tokens[i + 1];
      if (tok && tok.length === 1 && next && /^[A-Za-z]+$/.test(next) && (next.length <= 4 || next === next.toUpperCase())) {
        out.push(tok + next);
        i += 1;
        continue;
      }
      if (out.length && tok && tok.length === 1 && /^[A-Za-z]+$/.test(tok) && /^[A-Za-z]+$/.test(out[out.length - 1]) && !(/^[A-Z]+$/.test(out[out.length - 1]) && out[out.length - 1].length <= 3)) {
        out[out.length - 1] += tok;
        continue;
      }
      out.push(tok);
    }
    return out;
  }
  function normalizeTitleText(text) {
    return normalizeTokens(cleanupCellText(text).split(' ')).join(' ').trim();
  }
  function coarseParts(line, skipFirst) {
    let parts = String(line || '').trim().split('|').map(part => cleanupCellText(part));
    if (parts.length && parts[0] === '') parts = parts.slice(1);
    if (parts.length && parts[parts.length - 1] === '') parts = parts.slice(0, -1);
    if (skipFirst && parts.length) parts = parts.slice(1);
    return parts;
  }
  function episodeTokens(text) {
    return Array.from(cleanupCellText(text).matchAll(/#\s*([A-Za-z0-9$#]+)/g)).map(match => `#${match[1]}`);
  }
  function timePairs(text) {
    return Array.from(cleanupCellText(text).matchAll(/(\d{2}:\d{2}:\d{2})\s+(\d{2}:\d{2}:\d{2})/g)).map(match => [match[1], match[2]]);
  }
  function inferSpan(title, episodes, durations) {
    return Math.max(episodeTokens(episodes).length, timePairs(durations).length, 1);
  }
  function splitTitleCell(text, span) {
    const cleaned = cleanupCellText(text);
    if (span <= 1) return [normalizeTitleText(cleaned)];
    const tokens = normalizeTokens(cleaned.split(' '));
    for (let size = 1; size <= Math.floor(tokens.length / span); size += 1) {
      const pattern = tokens.slice(0, size);
      let ok = true;
      for (let i = 0; i < span; i += 1) {
        const start = i * size;
        const candidate = tokens.slice(start, start + size);
        if (candidate.join(' ') !== pattern.join(' ')) { ok = false; break; }
      }
      if (ok && pattern.length * span === tokens.length) {
        const title = pattern.join(' ').trim();
        return Array.from({ length: span }, () => title);
      }
    }
    const groups = [];
    let start = 0;
    for (let i = 0; i < span; i += 1) {
      const end = Math.round(((i + 1) * tokens.length) / span);
      groups.push(tokens.slice(start, end));
      start = end;
    }
    let last = '';
    return groups.map(group => {
      const title = group.join(' ').trim();
      if (title) last = title;
      return title || last;
    });
  }
  function parseRowTriplet(titleLine, episodeLine, durationLine) {
    const rowTime = coarseParts(titleLine, false)[0];
    const titleParts = coarseParts(titleLine, true);
    const episodeParts = coarseParts(episodeLine, true);
    const durationParts = coarseParts(durationLine, true);
    const coarseCount = Math.max(titleParts.length, episodeParts.length, durationParts.length);
    while (titleParts.length < coarseCount) titleParts.push('');
    while (episodeParts.length < coarseCount) episodeParts.push('');
    while (durationParts.length < coarseCount) durationParts.push('');
    const cells = [];
    for (let i = 0; i < coarseCount; i += 1) {
      const span = inferSpan(titleParts[i], episodeParts[i], durationParts[i]);
      const episodes = episodeTokens(episodeParts[i]);
      while (episodes.length < span) episodes.push('');
      const titles = splitTitleCell(titleParts[i], span);
      while (titles.length < span) titles.push(titles[titles.length - 1] || '');
      for (let j = 0; j < span; j += 1) cells.push({ title: titles[j] || '', episode: episodes[j] || '' });
    }
    while (cells.length < 7) cells.push({ title: '', episode: '' });
    return { rowTime, cells: cells.slice(0, 7) };
  }
  function gatherRowBuffers(lines, startIndex) {
    let titleBuffer = lines[startIndex].trim();
    let i = startIndex + 1;
    while (i < lines.length) {
      const line = String(lines[i] || '').trim();
      if (!line) { i += 1; continue; }
      if (/^\|\-+/.test(line) || /^\|\s*\d{2}:\d{2}\s*\|/.test(line)) break;
      if (/^\|\s*\|/.test(line)) break;
      titleBuffer += ` ${line}`;
      i += 1;
    }
    let episodeBuffer = '';
    while (i < lines.length) {
      const line = String(lines[i] || '').trim();
      if (!line) { i += 1; continue; }
      if (/^\|\-+/.test(line) || /^\|\s*\d{2}:\d{2}\s*\|/.test(line)) break;
      if (/\d{2}:\d{2}:\d{2}/.test(line)) break;
      episodeBuffer = episodeBuffer ? `${episodeBuffer} ${line}` : line;
      i += 1;
    }
    let durationBuffer = '';
    while (i < lines.length) {
      const line = String(lines[i] || '').trim();
      if (!line) { i += 1; continue; }
      if (/^\|\-+/.test(line) || /^\|\s*\d{2}:\d{2}\s*\|/.test(line)) break;
      durationBuffer = durationBuffer ? `${durationBuffer} ${line}` : line;
      i += 1;
    }
    return { titleBuffer, episodeBuffer, durationBuffer, nextIndex: i };
  }
  function parseWeekStart(line) {
    const match = normalizeText(line).match(/FROM:\s*\w{3},\s*([A-Za-z]{3})\s*(\d{2}),\s*(\d{4})/);
    if (!match) return null;
    const probe = new Date(`${match[1]} ${match[2]}, ${match[3]} 00:00:00`);
    return Number.isNaN(probe.getTime()) ? null : probe;
  }
  function addDays(date, days) {
    const out = new Date(date.getTime());
    out.setDate(out.getDate() + days);
    return out;
  }
  function isoDate(date) { return date.toISOString().slice(0, 10); }
  function weekdayLong(date) { return date.toLocaleDateString('en-US', { weekday: 'long' }); }
  function parseReportLines(lines) {
    const entries = [];
    let pageWeekStart = null;
    for (let i = 0; i < lines.length; i += 1) {
      const maybeWeekStart = parseWeekStart(lines[i]);
      if (maybeWeekStart) { pageWeekStart = maybeWeekStart; continue; }
      if (!pageWeekStart) continue;
      if (/^\|\s*\d{2}:\d{2}\s*\|/.test(lines[i])) {
        const { titleBuffer, episodeBuffer, durationBuffer, nextIndex } = gatherRowBuffers(lines, i);
        const parsed = parseRowTriplet(titleBuffer, episodeBuffer, durationBuffer);
        const weekDates = Array.from({ length: 7 }, (_, idx) => isoDate(addDays(pageWeekStart, idx)));
        parsed.cells.forEach((cell, idx) => {
          if (cell.title || cell.episode) {
            entries.push({ date: weekDates[idx], time: parsed.rowTime, title: cell.title, episode: cell.episode });
          }
        });
        i = nextIndex - 1;
      }
    }
    return entries;
  }
  function determineTargetMonth(entries) {
    const counts = new Map();
    entries.forEach(entry => {
      const key = entry.date.slice(0, 7);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return sorted.length ? sorted[0][0] : null;
  }
  function minutesFromTime(time) {
    const [hh, mm] = String(time).split(':').map(Number);
    return hh * 60 + mm;
  }
  function endTimeFromMinutes(total) {
    if (total >= 1440) return '24:00';
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function inferSeasonStart(episode) {
    const digits = String(episode || '').replace(/\D/g, '');
    return !!digits && (digits.endsWith('01') || digits.endsWith('001') || digits === '0001' || digits === '0101');
  }
  function buildMonthData(entries, monthKey, channelLabel) {
    const filtered = entries.filter(entry => entry.date.startsWith(monthKey));
    const byDate = new Map();
    filtered.forEach(entry => {
      if (!byDate.has(entry.date)) byDate.set(entry.date, []);
      byDate.get(entry.date).push(entry);
    });
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const nextMonth = new Date(year, month, 1);
    const totalDays = Math.round((nextMonth - monthStart) / 86400000);
    const days = [];
    for (let offset = 0; offset < totalDays; offset += 1) {
      const date = new Date(year, month - 1, 1 + offset);
      const dateKey = isoDate(date);
      const dayName = weekdayLong(date);
      const arr = (byDate.get(dateKey) || []).slice().sort((a, b) => minutesFromTime(a.time) - minutesFromTime(b.time));
      const deduped = [];
      const seen = new Set();
      arr.forEach(entry => {
        if (seen.has(entry.time)) return;
        seen.add(entry.time);
        deduped.push(entry);
      });
      const occupied = Array(48).fill(null);
      const overlap = [];
      const normalizedEntries = deduped.map((entry, idx) => {
        const start = minutesFromTime(entry.time);
        const nextStart = idx + 1 < deduped.length ? minutesFromTime(deduped[idx + 1].time) : 1440;
        const slotCount = Math.max(1, Math.ceil((nextStart - start) / 30));
        for (let slot = start / 30; slot < Math.min(48, start / 30 + slotCount); slot += 1) {
          if (occupied[slot] !== null) overlap.push(slot);
          occupied[slot] = true;
        }
        return {
          date: dateKey,
          day: dayName,
          dayName,
          time: entry.time,
          title: entry.title,
          episode: entry.episode,
          seasonStart: inferSeasonStart(entry.episode),
          endTime: endTimeFromMinutes(start + slotCount * 30),
          durationMin: slotCount * 30,
          slotCount
        };
      });
      const missingSlots = occupied.map((value, idx) => value ? null : idx).filter(value => value !== null);
      days.push({
        date: dateKey,
        day: dayName,
        dayName,
        entries: normalizedEntries,
        coveredSlots: 48 - missingSlots.length,
        missingSlots,
        continuous: missingSlots.length === 0,
        overlapSlots: Array.from(new Set(overlap)).sort((a, b) => a - b)
      });
    }
    const weeks = [];
    const firstWeekStart = new Date(monthStart);
    firstWeekStart.setDate(firstWeekStart.getDate() - firstWeekStart.getDay());
    for (let probe = new Date(firstWeekStart); probe < nextMonth; probe.setDate(probe.getDate() + 7)) {
      const week = [];
      for (let idx = 0; idx < 7; idx += 1) {
        const day = new Date(probe);
        day.setDate(probe.getDate() + idx);
        const dayName = weekdayLong(day);
        week.push({ date: isoDate(day), day: dayName, dayName, inMonth: day >= monthStart && day < nextMonth });
      }
      weeks.push(week);
    }
    const verification = {
      version: `${channelLabel} ${monthKey} imported`,
      checks: {
        expectedDayCount: totalDays,
        actualDayCount: days.length,
        everyDayHas48CoveredSlots: days.every(day => day.coveredSlots === 48),
        anyMissingSlots: days.some(day => day.missingSlots.length),
        anyOverlapSlots: days.some(day => day.overlapSlots.length),
        everyDayHasContinuousCoverage: days.every(day => day.continuous)
      },
      dailyCoverage: days.map(day => ({
        date: day.date,
        day: day.day,
        dayName: day.dayName,
        coveredSlots: day.coveredSlots,
        missingSlots: day.missingSlots,
        overlapSlots: day.overlapSlots,
        continuous: day.continuous,
        airings: day.entries.length
      }))
    };
    const schedule = {
      version: `${channelLabel} ${monthKey} imported`,
      channel: channelLabel,
      month: monthKey,
      generatedAt: new Date().toISOString(),
      sourcePolicy: 'PDF import via WNMU Monthly Schedules month builder',
      days,
      weeks
    };
    return { schedule, verification };
  }
  async function extractPdfLines(file) {
    const bytes = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const allLines = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const tc = await page.getTextContent();
      let current = '';
      tc.items.forEach(item => {
        const str = normalizeText(item.str || '');
        if (str) {
          if (current && !/\s$/.test(current) && !/^[,.;:)\]|]/.test(str)) current += ' ';
          current += str;
        }
        if (item.hasEOL) {
          const cleaned = current.trim();
          if (cleaned) allLines.push(cleaned);
          current = '';
        }
      });
      const tail = current.trim();
      if (tail) allLines.push(tail);
    }
    return allLines;
  }
  async function parsePdfForChannel(channelCode, file) {
    const lines = await extractPdfLines(file);
    const entries = parseReportLines(lines);
    if (!entries.length) throw new Error(`The ${channelCode} PDF did not yield any schedule rows.`);
    const monthKey = determineTargetMonth(entries);
    if (!monthKey) throw new Error(`The ${channelCode} PDF did not reveal a dominant month.`);
    const built = buildMonthData(entries, monthKey, CHANNELS[channelCode].label);
    return {
      channelCode,
      fileName: file.name,
      monthKey,
      entryCount: entries.filter(entry => entry.date.startsWith(monthKey)).length,
      linesCount: lines.length,
      schedule: built.schedule,
      verification: built.verification
    };
  }
  function buildStats(parsed) {
    const dayCount = parsed.schedule.days.length;
    const fullCoverageDays = parsed.verification.dailyCoverage.filter(day => day.coveredSlots === 48).length;
    return {
      source_file_name: parsed.fileName,
      imported_airings: parsed.entryCount,
      line_count: parsed.linesCount,
      day_count: dayCount,
      full_coverage_days: fullCoverageDays,
      any_missing_slots: !!parsed.verification.checks.anyMissingSlots,
      any_overlap_slots: !!parsed.verification.checks.anyOverlapSlots,
      published_from_build: BUILD_VERSION
    };
  }
  function rowForParsed(parsed) {
    const channel = CHANNELS[parsed.channelCode];
    const label = monthLabel(parsed.monthKey);
    return {
      channel_code: parsed.channelCode,
      channel_label: channel.label,
      month_key: parsed.monthKey,
      label,
      page_title: `${channel.label} ${label}`,
      build_version: BUILD_VERSION,
      import_method: 'month-builder-pdf',
      source_file_name: parsed.fileName,
      storage_key: `${channel.prefix}-${parsed.monthKey}-marks-v1.4.1`,
      schedule_json: parsed.schedule,
      verification_json: parsed.verification,
      stats_json: buildStats(parsed),
      published_at: new Date().toISOString()
    };
  }
  async function publishParsed(parsed) {
    const importedPath = `/rest/v1/${TABLES.importedMonths}?on_conflict=channel_code,month_key`;
    const currentPath = `/rest/v1/${TABLES.currentMonths}?on_conflict=channel_code`;
    await restWrite(importedPath, [rowForParsed(parsed)]);
    await restWrite(currentPath, [{ channel_code: parsed.channelCode, month_key: parsed.monthKey }]);
  }
  function renderParsedSummary(channelCode, parsed) {
    const checks = parsed.verification.checks;
    const dayCount = parsed.schedule.days.length;
    const currentCoverage = parsed.verification.dailyCoverage.filter(day => day.coveredSlots === 48).length;
    setSummary(channelCode,
`${parsed.fileName}
Detected month: ${monthLabel(parsed.monthKey)}
Imported airings: ${parsed.entryCount}
Days built: ${dayCount}
48/48 coverage days: ${currentCoverage}/${dayCount}
Missing slots: ${checks.anyMissingSlots ? 'yes' : 'no'}
Overlap slots: ${checks.anyOverlapSlots ? 'yes' : 'no'}
Live publish target:
- public.${TABLES.importedMonths}
- public.${TABLES.currentMonths}`);
  }
  async function publishSelectedReports() {
    if (!window.pdfjsLib) {
      setStatus('PDF.js did not load, so live publish cannot parse PDFs right now.', 'bad');
      return;
    }
    setStatus('Publishing selected report(s) to Supabase…');
    const selected = [];
    for (const channelCode of Object.keys(CHANNELS)) {
      const input = el(CHANNELS[channelCode].inputId);
      const file = input?.files?.[0];
      if (file) selected.push({ channelCode, file });
    }
    if (!selected.length) {
      setStatus('No PDFs were selected, so nothing was published.', 'warn');
      return;
    }
    try {
      ensureCfg();
      const published = [];
      for (const item of selected) {
        appendStatus(`Parsing ${item.channelCode} (${item.file.name})…`);
        const parsed = await parsePdfForChannel(item.channelCode, item.file);
        renderParsedSummary(item.channelCode, parsed);
        appendStatus(`Writing ${item.channelCode} ${monthLabel(parsed.monthKey)} to Supabase…`);
        await publishParsed(parsed);
        published.push(parsed);
      }
      const lines = published.map(parsed => `${parsed.channelCode} → ${monthLabel(parsed.monthKey)}`).join('\n');
      setStatus(`Published live to Supabase.\n${lines}\n\nHome page and channel pages should now see the imported month immediately.`, 'good');
    } catch (err) {
      console.error(err);
      setStatus(`Live publish failed.\n${err.message || String(err)}`, 'bad');
    }
  }
  function init() {
    const publishBtn = el('publishBtn');
    if (!publishBtn) return;
    publishBtn.addEventListener('click', publishSelectedReports);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
