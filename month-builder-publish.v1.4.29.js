
(function () {
  const CHANNELS = {
    '13.1': { label: 'WNMU1HD', prefix: 'wnmu1hd', inputId: 'pdf131', summaryId: 'summary131' },
    '13.3': { label: 'WNMU3PL', prefix: 'wnmu3pl', inputId: 'pdf133', summaryId: 'summary133' }
  };
  const TABLES = {
    importedMonths: 'wnmu_monthly_schedules_imported_months',
    currentMonths: 'wnmu_monthly_schedules_current_months'
  };
  const BUILD_VERSION = 'v1.4.29-restored-parser-fixed-day-grid';
  const state = { parsed: {} };

  function el(id) { return document.getElementById(id); }
  function setStatus(text, cls) {
    const box = el('statusBox');
    if (!box) return;
    box.className = `status${cls ? ' ' + cls : ''}`;
    box.textContent = text;
  }
  function setSummary(channelCode, text) {
    const target = el(CHANNELS[channelCode].summaryId);
    if (target) target.textContent = text;
  }
  function monthLabel(monthKey) {
    const [y, m] = String(monthKey).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function getCfg(){ return window.WNMU_SHAREBOARD_SUPABASE; }
  function ensureCfg(){
    const cfg = getCfg();
    if(!cfg?.url || !cfg?.anonKey) throw new Error('config.js is missing Supabase credentials.');
    return cfg;
  }
  async function restUpsert(table, rows, conflictCols) {
    const cfg = ensureCfg();
    const res = await fetch(`${cfg.url}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictCols)}`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(rows)
    });
    if (!res.ok) throw new Error(`Supabase write failed (${res.status}) ${await res.text()}`);
    return res.json().catch(() => null);
  }
  async function restSelect(path) {
    const cfg = ensureCfg();
    const res = await fetch(`${cfg.url}${path}`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`Supabase read failed (${res.status}) ${await res.text()}`);
    return res.json();
  }

  function normalizeText(text) {
    return String(text || '').replace(/\u0019/g, "'").replace(/\u00a0/g, ' ').replace(/\u2019/g, "'");
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
        out.push(tok + next); i += 1; continue;
      }
      if (out.length && tok && tok.length === 1 && /^[A-Za-z]+$/.test(tok) && /^[A-Za-z]+$/.test(out[out.length - 1]) && !(/^[A-Z]+$/.test(out[out.length - 1]) && out[out.length - 1].length <= 3)) {
        out[out.length - 1] += tok; continue;
      }
      out.push(tok);
    }
    return out;
  }
  function normalizeTitleText(text) { return normalizeTokens(cleanupCellText(text).split(' ')).join(' ').trim(); }
  function coarseParts(line, skipFirst) {
    let parts = String(line || '').trim().split('|').map(part => cleanupCellText(part));
    if (parts.length && parts[0] === '') parts = parts.slice(1);
    if (parts.length && parts[parts.length - 1] === '') parts = parts.slice(0, -1);
    if (skipFirst && parts.length) parts = parts.slice(1);
    return parts;
  }
  function episodeTokens(text) {
    return Array.from(cleanupCellText(text).matchAll(/#\s*([A-Za-z0-9$#-]+)/g)).map(match => `#${match[1]}`);
  }
  const IMPORT_SERVICE_CODES = new Set(['APX', 'STE', 'DVS', 'SPA', 'SAP', 'CC', 'NON', 'VDS', 'VOD', 'HD', 'HDTV']);
  function sanitizeImportedTitle(text) {
    let s = cleanupCellText(text);
    if (!s) return '';
    // If PDF extraction ever glues an episode/service-code tail onto a title, retain
    // the title and discard only the metadata tail. Normal title text is untouched.
    if (/#\s*[A-Za-z0-9$#-]+/.test(s)) {
      s = s.replace(/#\s*[A-Za-z0-9$#-]+/g, ' ');
      s = s.replace(/\b(?:APX|STE|DVS|SPA|SAP|CC|NON|VDS|VOD|HD|HDTV)\b/g, ' ');
    }
    s = s.replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z]/.test(s)) return '';
    return normalizeTitleText(s);
  }
  function durationStartPairs(text) {
    return Array.from(cleanupCellText(text).matchAll(/\b(\d{2}:\d{2}:\d{2})\s+(\d{2}:\d{2}:\d{2})\b/g))
      .map(match => ({
        durationToken: match[1],
        startToken: match[2],
        startTime: match[2].slice(0, 5)
      }));
  }
  function durationMinutesFromToken(token) {
    const match = String(token || '').match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const total = hours * 60 + minutes + (seconds >= 30 ? 1 : 0);
    if (!Number.isFinite(total) || total <= 0) return null;
    return total;
  }
  function inferSpan(title, episodes, durations) {
    return Math.max(episodeTokens(episodes).length, durationStartPairs(durations).length, 1);
  }
  function splitTitleCell(text, span) {
    const cleaned = sanitizeImportedTitle(text);
    if (span <= 1) return [cleaned];
    if (!cleaned) return Array.from({ length: span }, () => '');
    const tokens = normalizeTokens(cleaned.split(' '));
    // ProTrack commonly merges identical weekday cells into one wide cell. Split
    // only when the title is an exact repeated phrase. Never chop one natural title
    // into arbitrary word fragments just because several episode numbers follow it.
    for (let size = 1; size <= Math.floor(tokens.length / span); size += 1) {
      const pattern = tokens.slice(0, size);
      if (!pattern.length) continue;
      let ok = true;
      for (let i = 0; i < span; i += 1) {
        const candidate = tokens.slice(i * size, i * size + size);
        if (candidate.join(' ') !== pattern.join(' ')) { ok = false; break; }
      }
      if (ok && pattern.length * span === tokens.length) {
        const title = pattern.join(' ').trim();
        return Array.from({ length: span }, () => title);
      }
    }
    return Array.from({ length: span }, () => cleaned);
  }
  function blankParsedCell() {
    return { title: '', episode: '', sourceStartTime: '', sourceEndTime: '', sourceDurationMin: null, sourceDurationToken: '', sourceStartToken: '' };
  }
  function parsedCell(title, episode, pair) {
    return {
      title: sanitizeImportedTitle(title),
      episode: cleanupCellText(episode || '').replace(/\s+/g, ''),
      sourceStartTime: pair?.startTime || '',
      sourceEndTime: '',
      sourceDurationMin: pair ? durationMinutesFromToken(pair.durationToken) : null,
      sourceDurationToken: pair?.durationToken || '',
      sourceStartToken: pair?.startToken || ''
    };
  }
  function chooseEpisodes(titleText, episodeText, span) {
    // Preserve positional duplicates. Two different days are allowed to air the
    // same episode number, so de-duplicating tokens here silently drops episodes.
    const primary = episodeTokens(episodeText).map(token => cleanupCellText(token).replace(/\s+/g, ''));
    const fallback = episodeTokens(titleText).map(token => cleanupCellText(token).replace(/\s+/g, ''));
    const out = primary.length ? primary.slice() : fallback.slice();
    while (out.length < span) out.push('');
    return out.slice(0, span);
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
      const episodes = chooseEpisodes(titleParts[i], episodeParts[i], span);
      const titles = splitTitleCell(titleParts[i], span);
      const pairList = durationStartPairs(durationParts[i]);
      while (pairList.length < span) pairList.push(null);
      for (let j = 0; j < span; j += 1) cells.push(parsedCell(titles[j] || '', episodes[j] || '', pairList[j] || null));
    }
    while (cells.length < 7) cells.push(blankParsedCell());

    const globalPairs = durationStartPairs(durationLine);
    const activeCells = cells.filter(cell => cell.title || cell.episode);
    if (globalPairs.length >= Math.max(1, Math.floor(activeCells.length * 0.65))) {
      let pairIndex = 0;
      for (const cell of cells) {
        if (!(cell.title || cell.episode)) continue;
        const pair = globalPairs[pairIndex] || null;
        if (pair) {
          cell.sourceDurationToken = pair.durationToken;
          cell.sourceStartToken = pair.startToken;
          cell.sourceStartTime = pair.startTime;
          cell.sourceDurationMin = durationMinutesFromToken(pair.durationToken);
        }
        pairIndex += 1;
      }
    }
    return { rowTime, cells: cells.slice(0, 7) };
  }

  function fixedGridBoundaryStart(line) {
    const raw = String(line || '');
    const pipes = [];
    for (let i = 0; i < raw.length; i += 1) if (raw[i] === '|') pipes.push(i);
    // Every reconstructed schedule row begins "| HH:MM |". The second pipe is
    // the left edge of Sunday, even when later weekday borders are merged away.
    return pipes.length >= 2 ? pipes[1] : 10;
  }
  function sliceFixedDayCell(line, dayIndex, dayCharWidth, boundaryStart) {
    const raw = String(line || '');
    const width = Number(dayCharWidth) > 10 ? Number(dayCharWidth) : 29;
    const base = Number.isFinite(boundaryStart) ? boundaryStart : fixedGridBoundaryStart(raw);
    const leftPipe = base + dayIndex * width;
    const rightPipe = leftPipe + width;
    if (leftPipe >= raw.length) return '';
    return cleanupCellText(raw.slice(leftPipe + 1, Math.min(rightPipe, raw.length)).replace(/\|/g, ' '));
  }
  function parseRowTripletPhysical(titleLine, episodeLine, durationLine, dayCharWidth) {
    const raw = String(titleLine || '');
    const timeMatch = raw.match(/^\|\s*(\d{2}:\d{2})\s*\|/);
    if (!timeMatch) return parseRowTriplet(titleLine, episodeLine, durationLine);
    const rowTime = timeMatch[1];
    const boundaryStart = fixedGridBoundaryStart(raw);
    const cells = [];
    for (let day = 0; day < 7; day += 1) {
      const titleText = sliceFixedDayCell(titleLine, day, dayCharWidth, boundaryStart);
      const episodeText = sliceFixedDayCell(episodeLine, day, dayCharWidth, boundaryStart);
      const durationText = sliceFixedDayCell(durationLine, day, dayCharWidth, boundaryStart);
      const title = sanitizeImportedTitle(titleText);
      const eps = episodeTokens(episodeText);
      const titleEps = eps.length ? [] : episodeTokens(titleText);
      const episode = cleanupCellText((eps[0] || titleEps[0] || '')).replace(/\s+/g, '');
      const pair = durationStartPairs(durationText)[0] || null;
      cells.push(parsedCell(title, episode, pair));
    }
    return { rowTime, cells };
  }
  function gatherRowBuffers(lines, startIndex) {
    let titleBuffer = lines[startIndex].trim();
    let i = startIndex + 1;
    while (i < lines.length) {
      const line = String(lines[i] || '').trim();
      if (!line) { i += 1; continue; }
      if (/^\|-+/.test(line) || /^\|\s*\d{2}:\d{2}\s*\|/.test(line)) break;
      if (/^\|\s*\|/.test(line)) break;
      titleBuffer += ` ${line}`; i += 1;
    }
    let episodeBuffer = '';
    while (i < lines.length) {
      const line = String(lines[i] || '').trim();
      if (!line) { i += 1; continue; }
      if (/^\|-+/.test(line) || /^\|\s*\d{2}:\d{2}\s*\|/.test(line)) break;
      if (/\d{2}:\d{2}:\d{2}/.test(line)) break;
      episodeBuffer = episodeBuffer ? `${episodeBuffer} ${line}` : line; i += 1;
    }
    let durationBuffer = '';
    while (i < lines.length) {
      const line = String(lines[i] || '').trim();
      if (!line) { i += 1; continue; }
      if (/^\|-+/.test(line) || /^\|\s*\d{2}:\d{2}\s*\|/.test(line)) break;
      durationBuffer = durationBuffer ? `${durationBuffer} ${line}` : line; i += 1;
    }
    return { titleBuffer, episodeBuffer, durationBuffer, nextIndex: i };
  }

  function addDays(date, days) {
    const out = new Date(date.getTime());
    out.setDate(out.getDate() + days);
    return out;
  }
  function isoDate(date) { return date.toISOString().slice(0, 10); }
  function parseDateFromParts(monthName, day, year) {
    const probe = new Date(`${monthName} ${day}, ${year} 00:00:00`);
    return Number.isNaN(probe.getTime()) ? null : probe;
  }
  function parseWeekStart(line) {
    const txt = normalizeText(line).replace(/\s+/g, ' ');
    let match = txt.match(/FROM:\s*(?:[A-Za-z]{3,9},?\s*)?([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i);
    if (match) return parseDateFromParts(match[1], match[2], match[3]);
    match = txt.match(/FROM:\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
    if (match) {
      const mm = Number(match[1]), dd = Number(match[2]);
      let yy = Number(match[3]); if (yy < 100) yy += 2000;
      const probe = new Date(yy, mm - 1, dd);
      return Number.isNaN(probe.getTime()) ? null : probe;
    }
    match = txt.match(/FROM:\s*(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/i);
    if (match) {
      const probe = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Number.isNaN(probe.getTime()) ? null : probe;
    }
    match = txt.match(/(?:WEEK\s+OF|FROM)\s*[:\-]?\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i);
    if (match) return parseDateFromParts(match[1], match[2], match[3]);
    return null;
  }
  function findWeekStartInLines(lines) {
    for (const line of lines || []) {
      const found = parseWeekStart(line);
      if (found) return found;
    }
    return null;
  }
  function parseRowsForKnownWeek(lines, pageWeekStart, physicalGrid = false, dayCharWidth = 29) {
    const entries = [];
    if (!pageWeekStart) return entries;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\|\s*\d{2}:\d{2}\s*\|/.test(lines[i])) {
        const { titleBuffer, episodeBuffer, durationBuffer, nextIndex } = gatherRowBuffers(lines, i);
        const parsed = physicalGrid ? parseRowTripletPhysical(titleBuffer, episodeBuffer, durationBuffer, dayCharWidth) : parseRowTriplet(titleBuffer, episodeBuffer, durationBuffer);
        const weekDates = Array.from({ length: 7 }, (_, idx) => isoDate(addDays(pageWeekStart, idx)));
        parsed.cells.forEach((cell, idx) => {
          if (cell.title || cell.episode) {
            entries.push({ date: weekDates[idx], time: parsed.rowTime, title: cell.title, episode: cell.episode, sourceStartTime: cell.sourceStartTime || '', sourceEndTime: cell.sourceEndTime || '', sourceDurationMin: cell.sourceDurationMin || null, sourceDurationToken: cell.sourceDurationToken || '', sourceStartToken: cell.sourceStartToken || '' });
          }
        });
        i = nextIndex - 1;
      }
    }
    return entries;
  }
  function parseReportPages(pages) {
    const entries = [];
    let previousWeekStart = null;
    const debugWeeks = [];
    for (const page of pages) {
      const explicitWeekStart = findWeekStartInLines(page.lines);
      let pageWeekStart = explicitWeekStart;
      if (!pageWeekStart && previousWeekStart) pageWeekStart = addDays(previousWeekStart, 7);
      if (!pageWeekStart) {
        debugWeeks.push({ page: page.pageNumber, weekStart: null, rows: 0, note: 'no week start' });
        continue;
      }
      const pageEntries = parseRowsForKnownWeek(page.lines, pageWeekStart, !!page.physicalGrid, page.dayCharWidth || 29);
      entries.push(...pageEntries);
      previousWeekStart = pageWeekStart;
      debugWeeks.push({ page: page.pageNumber, weekStart: isoDate(pageWeekStart), rows: pageEntries.length, explicit: !!explicitWeekStart, extractionMode: page.extractionMode || '', dayCharWidth: page.dayCharWidth || null });
    }
    return { entries, debugWeeks };
  }

  function countTimeRows(lines) { return (lines || []).filter(line => /^\|\s*\d{2}:\d{2}\s*\|/.test(line)).length; }
  function pushLine(lines, text) { const cleaned = cleanupCellText(text); if (cleaned) lines.push(cleaned); }
  function extractLinesByEOL(items) {
    const lines = []; let current = '';
    items.forEach(item => {
      const str = normalizeText(item.str || '');
      if (str) {
        if (current && !/\s$/.test(current) && !/^[,.;:)\]|]/.test(str)) current += ' ';
        current += str;
      }
      if (item.hasEOL) { pushLine(lines, current); current = ''; }
    });
    pushLine(lines, current);
    return lines;
  }
  function groupItemsByY(items) {
    const usable = items.map(item => ({ text: normalizeText(item.str || '').trim(), x: Number(item.transform?.[4] ?? 0), y: Number(item.transform?.[5] ?? 0) })).filter(item => item.text);
    usable.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const groups = [];
    for (const item of usable) {
      let group = groups.find(g => Math.abs(g.y - item.y) <= 3.2);
      if (!group) { group = { y: item.y, items: [] }; groups.push(group); }
      group.items.push(item);
      group.y = (group.y * (group.items.length - 1) + item.y) / group.items.length;
    }
    groups.forEach(group => group.items.sort((a, b) => a.x - b.x));
    groups.sort((a, b) => b.y - a.y);
    return groups;
  }
  function inferColumnBoundaries(groups) {
    const timeXs = [], rowItems = [];
    groups.forEach(group => {
      const timeItem = group.items.find(item => /^\d{2}:\d{2}$/.test(item.text));
      if (timeItem) { timeXs.push(timeItem.x); group.items.forEach(item => rowItems.push(item)); }
    });
    const minTimeX = timeXs.length ? Math.min(...timeXs) : 35;
    const allXs = rowItems.map(item => item.x).filter(x => x > minTimeX + 25);
    const minDayX = allXs.length ? Math.min(...allXs) : minTimeX + 55;
    const maxX = allXs.length ? Math.max(...allXs) + 80 : 780;
    const dayWidth = (maxX - minDayX) / 7;
    return { minTimeX, minDayX, maxX, dayWidth };
  }
  function lineToPipe(group, cols) {
    const timeItem = group.items.find(item => /^\d{2}:\d{2}$/.test(item.text));
    const cells = Array.from({ length: 8 }, () => []);
    group.items.forEach(item => {
      if (timeItem && item === timeItem) { cells[0].push(item.text); return; }
      if (item.x < cols.minDayX - 18) { if (!timeItem) cells[0].push(item.text); return; }
      const col = Math.max(1, Math.min(7, Math.floor((item.x - cols.minDayX) / cols.dayWidth) + 1));
      cells[col].push(item.text);
    });
    return `| ${cells.map(cell => cleanupCellText(cell.join(' '))).join(' | ')} |`;
  }
  function extractLinesByPosition(items) {
    const groups = groupItemsByY(items);
    const cols = inferColumnBoundaries(groups);
    const lines = [];
    groups.forEach(group => {
      const hasTime = group.items.some(item => /^\d{2}:\d{2}$/.test(item.text));
      const pipeish = group.items.some(item => item.text === '|') || group.items.length >= 4;
      if (hasTime || pipeish) pushLine(lines, lineToPipe(group, cols));
      else pushLine(lines, group.items.map(item => item.text).join(' '));
    });
    return lines;
  }
  function median(values) {
    const nums = (values || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!nums.length) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }
  function rawPdfItem(item) {
    return {
      text: normalizeText(item?.str || ''),
      x: Number(item?.transform?.[4] ?? 0),
      y: Number(item?.transform?.[5] ?? 0),
      width: Math.abs(Number(item?.width ?? 0)),
      b: Number(item?.transform?.[1] ?? 0)
    };
  }
  function detectVerticalProTrack(items) {
    const raw = (items || []).map(rawPdfItem).filter(item => item.text.trim());
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const hits = [];
    for (const day of days) {
      const item = raw.find(row => new RegExp(`\\b${day}\\b`, 'i').test(row.text));
      if (item) hits.push(item);
    }
    if (hits.length >= 5) {
      const xs = hits.map(item => item.x), ys = hits.map(item => item.y);
      const xSpread = Math.max(...xs) - Math.min(...xs);
      const ySpread = Math.max(...ys) - Math.min(...ys);
      if (xSpread < 20 && ySpread > 200) return true;
    }
    const rotated = raw.filter(item => Math.abs(item.b) > 0.5).length;
    return raw.length > 0 && rotated / raw.length > 0.7;
  }
  function estimateVerticalPitch(rawItems) {
    const byWidth = rawItems
      .filter(item => item.text && item.text.length >= 2 && item.width > 0)
      .map(item => item.width / item.text.length)
      .filter(value => value > 2.2 && value < 4.8);
    const fromWidth = median(byWidth);
    if (fromWidth) return fromWidth;
    const dayYs = [];
    for (const day of ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']) {
      const item = rawItems.find(row => new RegExp(`\\b${day}\\b`, 'i').test(row.text));
      if (item) dayYs.push(item.y);
    }
    const spacings = [];
    for (let i = 1; i < dayYs.length; i += 1) spacings.push(Math.abs(dayYs[i - 1] - dayYs[i]) / 29);
    return median(spacings) || 3.36;
  }
  function groupVerticalRows(rawItems) {
    const sorted = rawItems.slice().sort((a, b) => a.x - b.x || b.y - a.y);
    const groups = [];
    for (const item of sorted) {
      let group = groups.find(row => Math.abs(row.x - item.x) <= 1.4);
      if (!group) { group = { x: item.x, items: [] }; groups.push(group); }
      group.items.push(item);
      group.x = group.items.reduce((sum, row) => sum + row.x, 0) / group.items.length;
    }
    groups.forEach(group => group.items.sort((a, b) => b.y - a.y));
    return groups.sort((a, b) => a.x - b.x);
  }
  function inferDayCharWidth(lines) {
    const header = (lines || []).find(line => /\\bTIME\\b/.test(line) && /SUNDAY/i.test(line) && /SATURDAY/i.test(line));
    if (!header) return 29;
    const pipes = [];
    for (let i = 0; i < header.length; i += 1) if (header[i] === '|') pipes.push(i);
    if (pipes.length < 9) return 29;
    const widths = [];
    for (let i = 2; i + 1 < pipes.length; i += 1) {
      const w = pipes[i + 1] - pipes[i];
      if (w > 20 && w < 40) widths.push(w);
    }
    return median(widths) || 29;
  }
  function extractLinesByVerticalGrid(items) {
    if (!detectVerticalProTrack(items)) return { vertical: false, lines: [], dayCharWidth: 29, pitch: null };
    const raw = (items || []).map(rawPdfItem).filter(item => item.text);
    const pitch = estimateVerticalPitch(raw);
    const bValues = raw.map(item => item.b).filter(value => Math.abs(value) > 0.1);
    const negative = (median(bValues) ?? -1) < 0;
    const origin = negative ? Math.max(...raw.map(item => item.y)) : Math.min(...raw.map(item => item.y));
    const groups = groupVerticalRows(raw);
    const lines = [];
    for (const group of groups) {
      const chars = Array.from({ length: 280 }, () => ' ');
      for (const item of group.items) {
        const text = normalizeText(item.text);
        if (!text) continue;
        const pos = Math.round((negative ? (origin - item.y) : (item.y - origin)) / pitch);
        for (let i = 0; i < text.length; i += 1) {
          const idx = pos + i;
          if (idx < 0 || idx >= chars.length) continue;
          const ch = text[i];
          if (chars[idx] === ' ' || chars[idx] === ch || ch === '|') chars[idx] = ch;
        }
      }
      const line = chars.join('').replace(/\\s+$/, '');
      const trimmed = line.replace(/^\\s+/, '');
      if (trimmed) lines.push(trimmed);
    }
    return { vertical: true, lines, dayCharWidth: inferDayCharWidth(lines), pitch };
  }

  async function extractPdfPages(file) {
    const bytes = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const tc = await page.getTextContent();
      const eolLines = extractLinesByEOL(tc.items);
      const positionedLines = extractLinesByPosition(tc.items);
      const verticalGrid = extractLinesByVerticalGrid(tc.items);
      const eolRows = countTimeRows(eolLines);
      const positionedRows = countTimeRows(positionedLines);
      const verticalRows = countTimeRows(verticalGrid.lines);

      // Restore the original parser's conservative behavior: never throw away a
      // healthy text-flow parse just because a coordinate experiment exists. For
      // ProTrack's 90-degree report text, use the rotation-aware fixed grid only
      // when it reconstructs essentially the same set of time rows. Otherwise fall
      // back to the older EOL path that was producing the near-complete months.
      let lines = eolLines;
      let extractionMode = 'eol-restored';
      let physicalGrid = false;
      let dayCharWidth = 29;
      if (verticalGrid.vertical && verticalRows >= Math.max(1, eolRows - 1)) {
        lines = verticalGrid.lines;
        extractionMode = 'rotation-aware-grid';
        physicalGrid = true;
        dayCharWidth = verticalGrid.dayCharWidth || 29;
      } else if (!eolRows && positionedRows) {
        lines = positionedLines;
        extractionMode = 'legacy-positioned-fallback';
      }
      pages.push({
        pageNumber,
        lines,
        physicalGrid,
        dayCharWidth,
        extractionMode,
        eolTimeRows: eolRows,
        positionedTimeRows: positionedRows,
        verticalGridTimeRows: verticalRows,
        verticalPitch: verticalGrid.pitch || null
      });
    }
    return pages;
  }

  function determineTargetMonth(entries) {
    const counts = new Map();
    entries.forEach(entry => { const key = entry.date.slice(0, 7); counts.set(key, (counts.get(key) || 0) + 1); });
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return sorted.length ? sorted[0][0] : null;
  }
  function minutesFromTime(time) { const [hh, mm] = String(time).split(':').map(Number); return hh * 60 + mm; }
  function endTimeFromMinutes(total) { if (total >= 1440) return '24:00'; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
  function inferSeasonStart(episode) { const digits = String(episode || '').replace(/\D/g, ''); return !!digits && (digits.endsWith('01') || digits.endsWith('001') || digits === '0001' || digits === '0101'); }
  function weekdayName(date){ return date.toLocaleDateString('en-US', { weekday: 'long' }); }

  function buildMonthData(entries, monthKey, channelLabel) {
    const filtered = entries.filter(entry => entry.date.startsWith(monthKey));
    const byDate = new Map(); filtered.forEach(entry => { if (!byDate.has(entry.date)) byDate.set(entry.date, []); byDate.get(entry.date).push(entry); });
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1), nextMonth = new Date(year, month, 1);
    const totalDays = Math.round((nextMonth - monthStart) / 86400000);
    const days = [];
    for (let offset = 0; offset < totalDays; offset += 1) {
      const date = new Date(year, month - 1, 1 + offset), dateKey = isoDate(date), dayName = weekdayName(date);
      const arr = (byDate.get(dateKey) || []).slice().sort((a, b) => minutesFromTime(a.time) - minutesFromTime(b.time));
      const deduped = [], seen = new Set();
      arr.forEach(entry => { if (seen.has(entry.time)) return; seen.add(entry.time); deduped.push(entry); });
      const occupied = Array(48).fill(null), overlap = [];
      const normalizedEntries = deduped.map((entry, idx) => {
        const start = minutesFromTime(entry.time);
        const nextStart = idx + 1 < deduped.length ? minutesFromTime(deduped[idx + 1].time) : 1440;
        const explicitDuration = Number(entry.sourceDurationMin || 0);
        const sourceStartTime = String(entry.sourceStartTime || '');
        const sourceStartMatchesRow = !!sourceStartTime && sourceStartTime === entry.time;
        const explicitLooksUsable = sourceStartMatchesRow && explicitDuration >= 20 && Number.isFinite(explicitDuration);
        const maxUntilNextProgram = Math.max(30, nextStart - start);

        // ProTrack rows provide duration/start pairs, e.g. 00:28:46 09:30:00.
        // Use the duration only when the paired start time matches this row.
        // If missing/mismatched, infer to next parsed program and report it.
        const durationMin = explicitLooksUsable ? Math.min(Math.ceil(explicitDuration / 30) * 30, maxUntilNextProgram) : maxUntilNextProgram;
        const slotCount = Math.max(1, Math.ceil(durationMin / 30));
        for (let slot = start / 30; slot < Math.min(48, start / 30 + slotCount); slot += 1) { if (occupied[slot] !== null) overlap.push(slot); occupied[slot] = true; }
        const endTime = endTimeFromMinutes(start + slotCount * 30);
        const inferredDuration = !explicitLooksUsable;
        return { date: dateKey, day: dayName, dayName, time: entry.time, title: entry.title, episode: entry.episode, seasonStart: inferSeasonStart(entry.episode), endTime, durationMin: slotCount * 30, slotCount, sourceStartTime: entry.sourceStartTime || '', sourceStartToken: entry.sourceStartToken || '', sourceDurationMin: entry.sourceDurationMin || null, sourceDurationToken: entry.sourceDurationToken || '', durationSource: explicitLooksUsable ? 'explicit-pdf-duration-start-pair' : 'inferred-to-next-program', inferredDuration };
      });
      const missingSlots = occupied.map((value, idx) => value ? null : idx).filter(value => value !== null);
      days.push({ date: dateKey, day: dayName, dayName, entries: normalizedEntries, coveredSlots: 48 - missingSlots.length, missingSlots, continuous: missingSlots.length === 0, overlapSlots: Array.from(new Set(overlap)).sort((a, b) => a - b) });
    }
    const weeks = [], firstWeekStart = new Date(monthStart); firstWeekStart.setDate(firstWeekStart.getDate() - firstWeekStart.getDay());
    for (let probe = new Date(firstWeekStart); probe < nextMonth; probe.setDate(probe.getDate() + 7)) {
      const week = [];
      for (let idx = 0; idx < 7; idx += 1) { const day = new Date(probe); day.setDate(probe.getDate() + idx); const dayName = weekdayName(day); week.push({ date: isoDate(day), day: dayName, dayName, inMonth: day >= monthStart && day < nextMonth }); }
      weeks.push(week);
    }
    const verification = { version: `${channelLabel} ${monthKey} imported`, checks: { expectedDayCount: totalDays, actualDayCount: days.length, everyDayHas48CoveredSlots: days.every(day => day.coveredSlots === 48), anyMissingSlots: days.some(day => day.missingSlots.length), anyOverlapSlots: days.some(day => day.overlapSlots.length), everyDayHasContinuousCoverage: days.every(day => day.continuous) }, dailyCoverage: days.map(day => ({ date: day.date, day: day.day, dayName: day.dayName, coveredSlots: day.coveredSlots, missingSlots: day.missingSlots, overlapSlots: day.overlapSlots, continuous: day.continuous, airings: day.entries.length })) };
    const schedule = { version: `${channelLabel} ${monthKey} imported`, channel: channelLabel, month: monthKey, generatedAt: new Date().toISOString(), sourcePolicy: 'PDF import via month builder v1.4.29 restored parser with rotation-aware fixed-day grid reconstruction', days, weeks };
    return { schedule, verification };
  }

  function slotTimeLabel(slot) {
    const mins = slot * 30;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  function collectCoverageDiagnostics(schedule, verification) {
    const exceptions = [];
    const inferredDurations = [];
    const missingEpisodes = [];
    const suspiciousTitles = [];
    const dayByDate = {};
    (schedule.days || []).forEach(day => { dayByDate[day.date] = day; });
    (verification.dailyCoverage || []).forEach(day => {
      const missing = (day.missingSlots || []).map(slotTimeLabel);
      const overlaps = (day.overlapSlots || []).map(slotTimeLabel);
      if (missing.length || overlaps.length) exceptions.push({ date: day.date, missing, overlaps });
    });
    (schedule.days || []).forEach(day => {
      (day.entries || []).forEach(entry => {
        if (entry.inferredDuration) {
          inferredDurations.push({
            date: day.date,
            time: entry.time,
            title: entry.title,
            episode: entry.episode || '',
            reason: 'No PDF duration token was parsed; duration inferred to next parsed program.'
          });
        }
        if (entry.title && !entry.episode) {
          missingEpisodes.push({ date: day.date, time: entry.time, title: entry.title });
        }
        const title = cleanupCellText(entry.title || '');
        const repeated = /(\b[A-Z][A-Z0-9'&.!-]*(?:\s+[A-Z][A-Z0-9'&.!-]*){1,5}\b)(?:\s+\1){1,}/i.test(title);
        const metadataTitle = /^#|^(?:APX|STE|DVS|SPA|SAP|CC|NON|VDS|VOD|HD|HDTV)(?:\s+(?:APX|STE|DVS|SPA|SAP|CC|NON|VDS|VOD|HD|HDTV))*$/i.test(title);
        if (title && (repeated || metadataTitle)) suspiciousTitles.push({ date: day.date, time: entry.time, title });
      });
    });
    return { exceptions, inferredDurations, missingEpisodes, suspiciousTitles };
  }

  function publishabilityFor(parsed) {
    const daily = parsed.verification.dailyCoverage || [];
    const fullDays = daily.filter(day => day.coveredSlots === 48).length;
    const expected = parsed.verification.checks.expectedDayCount || parsed.schedule.days.length;
    const daysWithContent = (parsed.schedule.days || []).filter(day => (day.entries || []).length > 0).length;
    const diagnostics = collectCoverageDiagnostics(parsed.schedule, parsed.verification);
    const missingSlotCount = diagnostics.exceptions.reduce((sum, row) => sum + row.missing.length, 0);
    const overlapSlotCount = diagnostics.exceptions.reduce((sum, row) => sum + row.overlaps.length, 0);
    const inferredCount = diagnostics.inferredDurations.length;
    const durationStats = (parsed.schedule.days || []).reduce((acc, day) => {
      (day.entries || []).forEach(entry => {
        if (entry.durationSource === 'explicit-pdf-duration-start-pair') acc.explicit += 1;
        else if (entry.durationSource === 'inferred-to-next-program') acc.inferred += 1;
      });
      return acc;
    }, { explicit: 0, inferred: 0 });

    const fatal = [];
    const warnings = [];

    if (daysWithContent < expected) fatal.push(`only ${daysWithContent}/${expected} days have parsed content`);
    if (overlapSlotCount) fatal.push(`${overlapSlotCount} overlapped half-hour slot(s)`);
    if ((parsed.entryCount || 0) < expected * 20) warnings.push(`only ${parsed.entryCount} imported airings; review the report before publishing`);
    if (durationStats.explicit < Math.max(1, Math.floor((parsed.entryCount || 0) * 0.35))) {
      warnings.push(`only ${durationStats.explicit} duration/start pairs matched; review inferred durations`);
    }

    if (fullDays < expected) warnings.push(`${expected - fullDays} day(s) contain visible schedule holes (${missingSlotCount} half-hour slot(s))`);
    if (inferredCount) warnings.push(`${inferredCount} program(s) used inferred duration because no matching duration/start pair was parsed`);
    if (diagnostics.missingEpisodes.length) warnings.push(`${diagnostics.missingEpisodes.length} airing(s) are missing episode numbers; review before publishing`);
    if (diagnostics.suspiciousTitles.length) warnings.push(`${diagnostics.suspiciousTitles.length} title(s) look structurally suspicious; review before publishing`);

    return { ok: fatal.length === 0, fatal, warnings, fullDays, expected, missingSlotCount, overlapSlotCount, diagnostics, daysWithContent, durationStats };
  }

  async function parsePdfForChannel(channelCode, file) {
    const pages = await extractPdfPages(file);
    const parsedPages = parseReportPages(pages);
    const entries = parsedPages.entries;
    if (!entries.length) throw new Error(`The ${channelCode} PDF did not yield any schedule rows.`);
    const monthKey = determineTargetMonth(entries);
    if (!monthKey) throw new Error(`The ${channelCode} PDF did not reveal a dominant month.`);
    const built = buildMonthData(entries, monthKey, CHANNELS[channelCode].label);
    const parsed = { channelCode, fileName: file.name, monthKey, entryCount: entries.filter(entry => entry.date.startsWith(monthKey)).length, pagesCount: pages.length, pageDebug: parsedPages.debugWeeks, extractionDebug: pages.map(p => ({ page: p.pageNumber, eolTimeRows: p.eolTimeRows, positionedTimeRows: p.positionedTimeRows, verticalGridTimeRows: p.verticalGridTimeRows || 0, mode: p.extractionMode || '', dayCharWidth: p.dayCharWidth || null })), schedule: built.schedule, verification: built.verification };
    parsed.publishability = publishabilityFor(parsed);
    return parsed;
  }
  function allParsedPublishable() { const parsed = Object.values(state.parsed); return parsed.length > 0 && parsed.every(item => item.publishability?.ok); }
  function refreshButtons() { if (el('publishBtn')) el('publishBtn').disabled = !allParsedPublishable(); }
  function renderParsedSummary(channelCode, parsed) {
    const checks = parsed.verification.checks, dayCount = parsed.schedule.days.length;
    const daysWithContent = parsed.schedule.days.filter(day => (day.entries || []).length > 0).length;
    const emptyContentDays = parsed.schedule.days.filter(day => !(day.entries || []).length).map(day => day.date);
    const currentCoverage = parsed.verification.dailyCoverage.filter(day => day.coveredSlots === 48).length;
    const durationStats = (parsed.schedule.days || []).reduce((acc, day) => {
      (day.entries || []).forEach(entry => {
        if (entry.durationSource === 'explicit-pdf-duration-start-pair') acc.explicit += 1;
        else if (entry.durationSource === 'inferred-to-next-program') acc.inferred += 1;
      });
      return acc;
    }, { explicit: 0, inferred: 0 });
    const debugLines = (parsed.pageDebug || []).map(row => `p${row.page}: ${row.weekStart || 'no week'} ${row.explicit ? 'explicit' : 'inferred'} rows=${row.rows}`).join('\n');
    const extractionLines = (parsed.extractionDebug || []).map(row => `p${row.page}: ${row.mode || 'unknown'} eol=${row.eolTimeRows}, rotated=${row.verticalGridTimeRows || 0}, legacyPos=${row.positionedTimeRows}, dayChars=${row.dayCharWidth || '-'}`).join('\n');
    const gate = parsed.publishability?.ok ? (parsed.publishability?.warnings?.length ? `Publish gate: PASS WITH WARNING — ${parsed.publishability.warnings.join('; ')}` : 'Publish gate: PASS') : `Publish gate: BLOCKED — ${parsed.publishability?.fatal?.join('; ') || 'coverage incomplete'}`;
    const diagnostics = parsed.publishability?.diagnostics || { exceptions: [], hiddenRisks: [] };
    const holeLines = (diagnostics.exceptions || [])
      .slice(0, 20)
      .map(day => `${day.date}: missing=${day.missing.length ? day.missing.join(', ') : 'none'}; overlaps=${day.overlaps.length ? day.overlaps.join(', ') : 'none'}`)
      .join('\n');
    const inferredLines = (diagnostics.inferredDurations || [])
      .slice(0, 30)
      .map(row => `${row.date} ${row.time}: ${row.title}${row.episode ? ' ' + row.episode : ''}`)
      .join('\n');
    const missingEpisodeLines = (diagnostics.missingEpisodes || [])
      .slice(0, 40)
      .map(row => `${row.date} ${row.time}: ${row.title}`)
      .join('\n');
    const suspiciousTitleLines = (diagnostics.suspiciousTitles || [])
      .slice(0, 40)
      .map(row => `${row.date} ${row.time}: ${row.title}`)
      .join('\n');
    setSummary(channelCode, `${parsed.fileName}\nDetected month: ${monthLabel(parsed.monthKey)}\nPages read: ${parsed.pagesCount}\nImported airings: ${parsed.entryCount}\nDuration/start pairs used: ${durationStats.explicit}; inferred durations: ${durationStats.inferred}\nDays with parsed content: ${daysWithContent}/${dayCount}${emptyContentDays.length ? ` — empty: ${emptyContentDays.join(', ')}` : ''}\nDays built: ${dayCount}\n48/48 coverage days: ${currentCoverage}/${dayCount}\nMissing slots: ${checks.anyMissingSlots ? 'yes' : 'no'}\nOverlap slots: ${checks.anyOverlapSlots ? 'yes' : 'no'}\n${gate}\n\nMissing episode numbers for review:\n${missingEpisodeLines || '(none)'}\n\nSuspicious titles for review:\n${suspiciousTitleLines || '(none)'}\n\nVisible coverage exceptions:\n${holeLines || '(none)'}\n\nInferred durations for review:\n${inferredLines || '(none)'}\n\nPage week assignment:\n${debugLines || '(none)'}\n\nExtraction check:\n${extractionLines || '(none)'}\n\nLive target: Supabase ${TABLES.importedMonths}`);
  }
  async function parseSelectedReports() {
    if (!window.pdfjsLib) { setStatus('PDF.js did not load, so the builder cannot parse PDFs right now.', 'bad'); return; }
    setStatus('Parsing selected reports with restored parser and fixed-day grid…');
    const parsedNow = {};
    for (const channelCode of Object.keys(CHANNELS)) {
      const input = el(CHANNELS[channelCode].inputId), file = input?.files?.[0];
      if (!file) continue;
      try { const parsed = await parsePdfForChannel(channelCode, file); state.parsed[channelCode] = parsed; parsedNow[channelCode] = parsed; renderParsedSummary(channelCode, parsed); }
      catch (err) { console.error(err); delete state.parsed[channelCode]; setSummary(channelCode, `Parse failed for ${file.name}\n${err.message}`); }
    }
    refreshButtons();
    const builtChannels = Object.keys(parsedNow);
    if (!builtChannels.length) { setStatus('No PDFs were selected, so nothing was parsed.', 'warn'); return; }
    const blocked = builtChannels.filter(code => !state.parsed[code].publishability?.ok);
    if (blocked.length) {
      setStatus(`Parsed, but publish is BLOCKED because the import is not reliable enough yet:\n${blocked.map(code => `${code}: ${state.parsed[code].publishability.fatal.join('; ')}`).join('\n')}\n\nThis prevents a partial or structurally unreliable month from being published.`, 'bad');
      return;
    }
    setStatus(`Parsed successfully and passed publish gate:\n${builtChannels.map(code => `${code} → ${monthLabel(state.parsed[code].monthKey)}${state.parsed[code].publishability?.warnings?.length ? ' — WARNING: ' + state.parsed[code].publishability.warnings.join('; ') : ''}`).join('\n')}\n\nReview any visible holes, then click “Publish imported month(s) live.”`, 'good');
  }
  function statsFor(parsed) {
    const schedule = parsed.schedule, verification = parsed.verification;
    return { day_count: schedule.days.length, week_count: schedule.weeks.length, entry_count: parsed.entryCount, every_day_covered: !!verification.checks.everyDayHas48CoveredSlots, any_missing_slots: !!verification.checks.anyMissingSlots, any_overlap_slots: !!verification.checks.anyOverlapSlots, days_with_content: (parsed.schedule.days || []).filter(day => (day.entries || []).length > 0).length, missing_slot_count: parsed.publishability?.missingSlotCount || 0, overlap_slot_count: parsed.publishability?.overlapSlotCount || 0, duration_start_pairs_used: parsed.publishability?.durationStats?.explicit || 0, inferred_duration_count: parsed.publishability?.diagnostics?.inferredDurations?.length || 0, source_file_name: parsed.fileName, published_at: new Date().toISOString(), parser_version: BUILD_VERSION, page_debug: parsed.pageDebug || [] };
  }
  async function publishParsedMonths() {
    const parsedChannels = Object.keys(state.parsed);
    if (!parsedChannels.length) { setStatus('Nothing has been parsed yet.', 'warn'); return; }
    const blocked = parsedChannels.filter(code => !state.parsed[code].publishability?.ok);
    if (blocked.length) { setStatus(`Publish blocked. Fix the parse first:\n${blocked.map(code => `${code}: ${state.parsed[code].publishability.fatal.join('; ')}`).join('\n')}`, 'bad'); refreshButtons(); return; }
    el('publishBtn').disabled = true; setStatus('Publishing imported month(s) to Supabase…');
    try {
      for (const channelCode of parsedChannels) {
        const parsed = state.parsed[channelCode], channel = CHANNELS[channelCode], label = monthLabel(parsed.monthKey);
        const row = { channel_code: channelCode, channel_label: channel.label, month_key: parsed.monthKey, label, page_title: `${channel.label} ${label}`, build_version: BUILD_VERSION, import_method: 'month-builder-pdf-live-publish-page-aware', source_file_name: parsed.fileName, storage_key: `${channel.prefix}-${parsed.monthKey}-marks-v1.4.7`, schedule_json: parsed.schedule, verification_json: parsed.verification, stats_json: statsFor(parsed), updated_at: new Date().toISOString() };
        await restUpsert(TABLES.importedMonths, [row], 'channel_code,month_key');
        await restUpsert(TABLES.currentMonths, [{ channel_code: channelCode, month_key: parsed.monthKey, updated_at: new Date().toISOString() }], 'channel_code');
      }
      setStatus(`Published successfully:\n${parsedChannels.map(code => `${code} → ${monthLabel(state.parsed[code].monthKey)}`).join('\n')}\n\nHome page should now read these months from Supabase.`, 'good');
      await verifyPublishedMonths(false);
    } catch (err) { console.error(err); setStatus(`Publish failed.\n${err.message || String(err)}`, 'bad'); }
    finally { refreshButtons(); }
  }
  async function verifyPublishedMonths(resetStatus = true) {
    if (resetStatus) setStatus('Verifying Supabase imported-month rows…');
    try {
      const rows = await restSelect(`/rest/v1/${TABLES.importedMonths}?select=channel_code,month_key,label,page_title,source_file_name,updated_at,stats_json&order=channel_code.asc,month_key.asc`);
      const current = await restSelect(`/rest/v1/${TABLES.currentMonths}?select=channel_code,month_key&order=channel_code.asc`);
      const summary = ['Supabase imported months:'].concat(rows.map(row => { const stats = row.stats_json || {}; const cov = stats.every_day_covered ? 'full coverage' : `coverage issue (${stats.entry_count || '?'} airings)`; return `- ${row.channel_code} ${row.month_key} — ${row.label} — ${cov}`; }), ['Current pointers:'], current.map(row => `- ${row.channel_code} → ${row.month_key}`)).join('\n');
      if (resetStatus) setStatus(summary, 'good'); else setStatus(`${el('statusBox').textContent}\n\n${summary}`, 'good');
    } catch (err) { if (resetStatus) setStatus(`Verify failed.\n${err.message || String(err)}`, 'bad'); else console.warn(err); }
  }
  function assignDroppedFile(input, file, channelCode) {
    if (!input || !file) return false;
    const isPdf = /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';
    if (!isPdf) {
      setStatus(`${CHANNELS[channelCode].label}: ${file.name || 'Dropped file'} is not a PDF. Drop the ProTrack PDF report, not a random gremlin.`, 'bad');
      return false;
    }
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setStatus(`${CHANNELS[channelCode].label}: ${file.name} is ready. Click “Parse selected reports” when both reports you want are loaded.`, 'good');
      return true;
    } catch (err) {
      setStatus(`${CHANNELS[channelCode].label}: your browser would not attach the dropped file. Use the file picker for this one.`, 'warn');
      return false;
    }
  }

  function installDropzones() {
    Object.entries(CHANNELS).forEach(([channelCode, channel]) => {
      const input = el(channel.inputId);
      const zone = input?.closest?.('.dropzone');
      if (!input || !zone || zone.dataset.wnmuDropInstalled === 'true') return;
      zone.dataset.wnmuDropInstalled = 'true';
      zone.setAttribute('tabindex', '0');
      zone.setAttribute('role', 'button');
      zone.title = 'Click to choose a PDF, or drag the report PDF onto this box.';
      const leave = () => zone.classList.remove('drag-over');
      zone.addEventListener('dragenter', event => { event.preventDefault(); event.stopPropagation(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragover', event => { event.preventDefault(); event.stopPropagation(); zone.classList.add('drag-over'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
      zone.addEventListener('dragleave', event => {
        if (!zone.contains(event.relatedTarget)) leave();
      });
      zone.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        leave();
        const files = Array.from(event.dataTransfer?.files || []);
        const file = files.find(candidate => /\.pdf$/i.test(candidate.name || '') || candidate.type === 'application/pdf') || files[0];
        assignDroppedFile(input, file, channelCode);
        refreshButtons();
      });
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) zone.classList.add('has-file');
        else zone.classList.remove('has-file');
        refreshButtons();
      });
    });
  }

  function init() { installDropzones(); el('parseBtn')?.addEventListener('click', parseSelectedReports); el('publishBtn')?.addEventListener('click', publishParsedMonths); el('verifyBtn')?.addEventListener('click', () => verifyPublishedMonths(true)); refreshButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
