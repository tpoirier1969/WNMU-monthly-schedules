(function () {
  'use strict';
  const VERSION = 'v1.5.67-sales-pale-colors-exact-fundraiser-slots';
  const TABLE = 'wnmu_monthly_schedules_imported_months';
  const TITLE_CORRECTIONS_TABLE = 'wnmu_monthly_title_corrections';
  const ROOT_ID = 'salesExportRoot';
  const START_SLOT = 12; // 6:00 AM
  const END_SLOT = 48;   // midnight, exclusive
  const CONTACT_PHONE = '906-227-1300';
  const CONTACT_WEB_DISPLAY = 'www.nmu.edu/ptv13';
  const CONTACT_WEB_HREF = 'http://www.nmu.edu/ptv13';

  window.WNMU_SALES_EXPORT_VERSION = VERSION;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function supabaseCfg() {
    return window.WNMU_SHAREBOARD_SUPABASE
      || window.WNMU_SUPABASE_CONFIG
      || window.WNMU_SUPABASE
      || {};
  }
  function params() { return new URLSearchParams(window.location.search); }
  function channelCode() { return params().get('channel') || cfg().channelCode || '13.1'; }
  function monthKey() { return params().get('month') || ''; }
  function channelLabel() { return cfg().channelLabel || (channelCode() === '13.3' ? 'WNMU3PL' : 'WNMU1HD'); }
  function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function timeToSlot(time) { const m = String(time || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 2 + (Number(m[2]) >= 30 ? 1 : 0) : -1; }
  function slotToTime(slot) { const h = Math.floor(slot / 2); return `${pad(h)}:${slot % 2 ? '30' : '00'}`; }
  function fmtTime(slot) {
    const h24 = Math.floor(slot / 2);
    const min = slot % 2 ? ':30' : ':00';
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = ((h24 + 11) % 12) + 1;
    if (slot === 48) return '12:00 AM';
    return `${h12}${min} ${suffix}`;
  }
  function fmtMonth(month) {
    const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return month || 'Current Month';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function fmtDay(dateStr, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', opts);
  }
  function weekday(dateStr) { return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }); }
  function inRange(slot, start, end) { return slot >= timeToSlot(start) && slot < timeToSlot(end); }
  function isWeekday(dateStr) { return ['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(weekday(dateStr)); }
  function norm(value) { return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function entryTitle(entry) { return String(entry?.title || '').trim(); }
  function entryEpisode(entry) { return String(entry?.episode || '').trim(); }
  function slotCount(entry) { return Math.max(1, Math.round(Number(entry?.slotCount || entry?.durationMin / 30 || 1))); }
  function smartTitleCase(text) {
    const lowerWords = new Set(['a','an','and','as','at','but','by','for','from','in','into','nor','of','on','or','per','the','to','vs','with']);
    const acronyms = new Set(['PBS','BBC','WNMU','NMU','NOVA','POV','USA','U.S.','TV']);
    const raw = String(text || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    const words = raw.toLowerCase().split(' ');
    return words.map((word, idx) => {
      const clean = word.replace(/[^a-z0-9]/g, '').toUpperCase();
      if (acronyms.has(clean)) return clean;
      if (idx > 0 && idx < words.length - 1 && lowerWords.has(word)) return word;
      return word.replace(/(^|[-'’])([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
    }).join(' ')
      .replace(/\bPbs\b/g, 'PBS')
      .replace(/\bBbc\b/g, 'BBC')
      .replace(/\bNmu\b/g, 'NMU')
      .replace(/\bWnmu\b/g, 'WNMU')
      .replace(/\bNova\b/g, 'NOVA')
      .replace(/\bPov\b/g, 'POV');
  }

  const KNOWN_TITLE_CORRECTIONS = {
    'great get aways': 'Great Getaways',
    'greatgetaways': 'Great Getaways',
    'mister rogers neighborhood': "Mister Rogers' Neighborhood",
    'mister roger s neighborhood': "Mister Rogers' Neighborhood",
    'mister rogers neighbourhood': "Mister Rogers' Neighborhood",
    'mr rogers neighborhood': "Mister Rogers' Neighborhood",
    'craftsmans legacy': "Craftsman's Legacy",
    'craftsman s legacy': "Craftsman's Legacy",
    'lyla in the loop': 'Lyla in the Loop',
    'weather hunters': 'Weather Hunters',
    'classical stretch': 'Classical Stretch',
    'life on earth': 'Life on Earth',
    'son of a butcher': 'Son of a Butcher',
    'prairie sportsman': 'Prairie Sportsman',
    'in the americas': 'In the Americas',
    'arthur': 'Arthur',
    'wild kratts': 'Wild Kratts',
    'paint ing and travel withr': 'Painting and Travel with Roger & Sarah Bansemer',
    'painting and travel withr': 'Painting and Travel with Roger & Sarah Bansemer',
    'painting and travel with r': 'Painting and Travel with Roger & Sarah Bansemer',
    'paintingandtravelwithr': 'Painting and Travel with Roger & Sarah Bansemer',
    'painting and travel with roger sarah bansemer': 'Painting and Travel with Roger & Sarah Bansemer',
    'painting and travel with roger and sarah bansemer': 'Painting and Travel with Roger & Sarah Bansemer'
  };

  const USER_TITLE_CORRECTIONS_KEY = 'wnmu_sales_title_corrections_v1';

  function readUserCorrections() {
    try {
      const raw = localStorage.getItem(USER_TITLE_CORRECTIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  function writeUserCorrections(map) {
    try { localStorage.setItem(USER_TITLE_CORRECTIONS_KEY, JSON.stringify(map || {})); }
    catch {}
  }

  function userCorrectionFor(title) {
    const map = readUserCorrections();
    const n = norm(title);
    const c = compactTitleKey(title);
    return map[n] || map[c] || '';
  }

  function saveUserCorrection(from, to) {
    const raw = String(from || '').trim().replace(/\s+/g, ' ');
    const clean = String(to || '').trim().replace(/\s+/g, ' ');
    if (!raw || !clean) return false;
    const map = readUserCorrections();
    map[norm(raw)] = clean;
    map[compactTitleKey(raw)] = clean;
    writeUserCorrections(map);
    return true;
  }

  function userCorrectionsList() {
    const map = readUserCorrections();
    const seen = new Set();
    const out = [];
    Object.keys(map).sort().forEach(key => {
      const to = map[key];
      const signature = `${key}=>${to}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      out.push({ fromKey: key, to });
    });
    return out;
  }

  async function loadRemoteTitleCorrections() {
    try {
      const rows = await rest(`/rest/v1/${TITLE_CORRECTIONS_TABLE}?select=raw_title,raw_title_key,compact_title_key,corrected_title,updated_at,is_active&is_active=eq.true&order=updated_at.desc`);
      if (!Array.isArray(rows) || !rows.length) return { ok: true, count: 0 };
      const map = readUserCorrections();
      rows.forEach(row => {
        const to = String(row.corrected_title || '').trim().replace(/\s+/g, ' ');
        const raw = String(row.raw_title || row.raw_title_key || '').trim().replace(/\s+/g, ' ');
        const key = row.raw_title_key || norm(raw);
        const ckey = row.compact_title_key || compactTitleKey(raw);
        if (!to || !key) return;
        map[key] = to;
        if (ckey) map[ckey] = to;
      });
      writeUserCorrections(map);
      return { ok: true, count: rows.length };
    } catch (err) {
      console.warn(`${VERSION}: Supabase title corrections skipped`, err && (err.message || err));
      return { ok: false, count: 0, error: err.message || String(err) };
    }
  }

  let dynamicTitleCorrections = new Map();
  let titleAuditState = { known: new Map(), variants: [] };

  function compactTitleKey(value) {
    return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  }

  function rememberTitleCorrection(from, to, source) {
    const raw = String(from || '').trim().replace(/\s+/g, ' ');
    const clean = String(to || '').trim().replace(/\s+/g, ' ');
    if (!raw || !clean || raw === clean) return;
    const key = `${raw}=>${clean}`;
    if (!titleAuditState.known.has(key)) {
      titleAuditState.known.set(key, { from: raw, to: clean, source, count: 0 });
    }
    titleAuditState.known.get(key).count += 1;
  }

  function readableRawTitle(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function variantsDifferBeyondCase(variants) {
    const simple = new Set(variants.map(title => String(title || '').toLowerCase().replace(/\s+/g, ' ').trim()));
    return simple.size > 1;
  }

  function choosePreferredVariant(counts) {
    const rows = Array.from(counts.entries()).map(([title, count]) => ({ title, count }));
    rows.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const aLetters = a.title.replace(/[^A-Za-z]/g, '');
      const bLetters = b.title.replace(/[^A-Za-z]/g, '');
      const aAllCaps = aLetters.length >= 4 && aLetters === aLetters.toUpperCase();
      const bAllCaps = bLetters.length >= 4 && bLetters === bLetters.toUpperCase();
      if (aAllCaps !== bAllCaps) return aAllCaps ? 1 : -1;
      return b.title.length - a.title.length;
    });
    return rows[0]?.title || '';
  }

  function prepareTitleCleanup(schedule) {
    dynamicTitleCorrections = new Map();
    titleAuditState = { known: new Map(), variants: [] };

    const groups = new Map();
    const days = Array.isArray(schedule?.days) ? schedule.days : [];
    days.forEach(day => {
      (day.entries || []).forEach(entry => {
        const title = readableRawTitle(entry?.title || '');
        if (!title) return;
        const key = compactTitleKey(title);
        if (!key) return;
        if (!groups.has(key)) groups.set(key, new Map());
        const m = groups.get(key);
        m.set(title, (m.get(title) || 0) + 1);
      });
    });

    groups.forEach((counts, compact) => {
      if (counts.size <= 1) return;
      const titles = Array.from(counts.keys());
      if (!variantsDifferBeyondCase(titles)) return;
      const preferred = choosePreferredVariant(counts);
      if (!preferred) return;
      dynamicTitleCorrections.set(compact, preferred);
      titleAuditState.variants.push({
        preferred,
        variants: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([title, count]) => ({ title, count }))
      });
    });
  }


  function cleanProgramTitle(value) {
    const original = String(value || '').trim().replace(/\s+/g, ' ');
    let title = original;
    if (!title) return '';

    const custom = userCorrectionFor(title);
    if (custom) {
      rememberTitleCorrection(title, custom, 'user correction');
      title = custom;
    }

    const known = KNOWN_TITLE_CORRECTIONS[norm(title)] || KNOWN_TITLE_CORRECTIONS[compactTitleKey(title)];
    if (known) {
      rememberTitleCorrection(title, known, 'known correction');
      title = known;
    }

    const dynamic = dynamicTitleCorrections.get(compactTitleKey(title));
    if (dynamic && norm(dynamic) !== norm(title)) {
      rememberTitleCorrection(title, dynamic, 'month self-check');
      title = dynamic;
    }

    // Do not auto-convert all-caps titles. The scheduling system exports titles
    // in caps by design, and this display layer should only fix known/user-reviewed
    // title errors.
    return title;
  }

  function entryCodeText(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const keys = ['code','nola','nolaCode','nola_code','programCode','program_code','sourceCode','source_code','program_id','programId','id'];
    const bits = [];
    keys.forEach(key => { if (entry[key] != null) bits.push(String(entry[key])); });
    try { bits.push(JSON.stringify(entry)); } catch {}
    return bits.join(' ');
  }



  function hasAny(text, needles) {
    const haystack = norm(text);
    return (needles || []).some(needle => {
      const n = norm(needle);
      return n && haystack.includes(n);
    });
  }

  function entryForSlot(day, slot) {
    const entries = Array.isArray(day?.entries) ? day.entries : [];
    for (const entry of entries) {
      const start = timeToSlot(entry?.time || '');
      if (start < 0) continue;
      const end = Math.min(48, start + slotCount(entry));
      if (slot >= start && slot < end) return entry;
    }
    return null;
  }


  let pledgeSlotLookup = new Map();

  function entryTitle(entry) { return cleanProgramTitle(entry?.title || ''); }
  function entryEpisode(entry) { return cleanProgramTitle(entry?.episode || ''); }
  function titleLine(entry) {
    const title = entryTitle(entry);
    const episode = entryEpisode(entry);
    if (!title) return '';
    return episode ? `${title}: ${episode}` : title;
  }
  function shortTitle(entry) {
    const full = titleLine(entry);
    return full.length > 82 ? full.slice(0, 79).trim() + '…' : full;
  }

  function normalizeDateKey(value) {
    const raw = String(value || '').trim();
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function plusDays(dateKey, days) {
    const d = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateKey;
    d.setDate(d.getDate() + Number(days || 0));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseMinutes(value) {
    if (Number.isFinite(Number(value))) {
      const n = Number(value);
      // Placement minutes are stored as minutes after midnight; slot indexes are rare but handled.
      return n >= 0 && n < 48 && Number.isInteger(n) ? n * 30 : n;
    }
    const text = String(value || '').trim();
    const m = text.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!m) return NaN;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (!Number.isFinite(h) || !Number.isFinite(min)) return NaN;
    return h * 60 + min;
  }

  function slotLookupKey(dateKey, minutes) {
    return `${dateKey}|${Number(minutes || 0)}`;
  }

  function startSlotParts(value) {
    const m = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})\|(\d+)$/);
    if (!m) return { dateKey: '', startMinutes: NaN };
    return { dateKey: m[1], startMinutes: Number(m[2]) };
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      const text = String(value ?? '').trim();
      if (text) return text;
    }
    return '';
  }

  function pledgeScheduleData(row = {}) {
    return row.schedule_data || row.scheduleData || row.schedule_json || row.scheduleJson || row.data || {};
  }

  function pledgeScheduleRange(row = {}) {
    const data = pledgeScheduleData(row);
    return {
      startDate: normalizeDateKey(firstNonEmpty(row.start_date, row.startDate, data.startDate, data.start_date)),
      endDate: normalizeDateKey(firstNonEmpty(row.end_date, row.endDate, data.endDate, data.end_date))
    };
  }

  function dateInsideScheduleRange(row, dateKey) {
    const { startDate, endDate } = pledgeScheduleRange(row);
    if (!dateKey) return false;
    if (startDate && dateKey < startDate) return false;
    if (endDate && dateKey > endDate) return false;
    return true;
  }

  function pledgePlacementTitle(placement = {}) {
    const raw = firstNonEmpty(
      placement.programTitle,
      placement.program_title,
      placement.title,
      placement.programName,
      placement.program_name,
      placement.selectedProgramTitle,
      placement.displayTitle,
      placement.display_title,
      placement.name,
      placement.program && (placement.program.title || placement.program.programTitle || placement.program.name)
    );
    const clean = cleanProgramTitle(raw);
    const key = norm(clean);
    // A scheduled row must name an actual program/title. Generic fundraiser/schedule labels are not enough.
    if (!key || key.length <= 3) return '';
    if (/^(pledge|fundraiser|schedule|drive|week|day|slot|open|tba|to be announced)$/i.test(key)) return '';
    return clean;
  }

  function placementDateKey(placement = {}, row = {}) {
    const parts = startSlotParts(placement.startSlotKey || placement.start_slot_key);
    return normalizeDateKey(firstNonEmpty(
      placement.dateKey,
      placement.date_key,
      placement.airDate,
      placement.air_date,
      placement.date,
      parts.dateKey,
      row.dateKey,
      row.date_key
    ));
  }

  function placementStartMinutes(placement = {}) {
    const parts = startSlotParts(placement.startSlotKey || placement.start_slot_key);
    const direct = firstNonEmpty(
      placement.startMinutes,
      placement.start_minutes,
      placement.startMinute,
      placement.start_minute,
      parts.startMinutes,
      placement.startTime,
      placement.start_time,
      placement.time
    );
    return parseMinutes(direct);
  }

  function placementLengthMinutes(placement = {}, startMinutes = NaN) {
    const direct = Number(firstNonEmpty(
      placement.lengthMinutes,
      placement.length_minutes,
      placement.durationMinutes,
      placement.duration_minutes,
      placement.runtimeMinutes,
      placement.runtime_minutes,
      placement.programMinutes,
      placement.program_minutes
    ));
    if (Number.isFinite(direct) && direct > 0) return Math.max(30, Math.ceil(direct / 30) * 30);
    const end = parseMinutes(firstNonEmpty(placement.endMinutes, placement.end_minutes, placement.endTime, placement.end_time));
    if (Number.isFinite(end) && Number.isFinite(startMinutes) && end > startMinutes) return Math.max(30, Math.ceil((end - startMinutes) / 30) * 30);
    return 30;
  }

  function truthyFlag(value) {
    if (value === true) return true;
    const text = String(value || '').trim().toLowerCase();
    return ['true', 'yes', 'y', '1'].includes(text);
  }

  function recordPledgePlacement(row, placement) {
    if (!placement || typeof placement !== 'object') return;
    if (truthyFlag(placement.isNonPledge) || truthyFlag(placement.is_non_pledge) || truthyFlag(placement.isNonSpecific) || truthyFlag(placement.is_non_specific)) return;
    const title = pledgePlacementTitle(placement);
    if (!title) return;
    const dateKey = placementDateKey(placement, row);
    const startMinutes = placementStartMinutes(placement);
    if (!dateKey || !Number.isFinite(startMinutes)) return;
    if (!dateInsideScheduleRange(row, dateKey)) return;
    const length = placementLengthMinutes(placement, startMinutes);
    const slotCount = Math.max(1, Math.min(16, Math.ceil(length / 30)));
    for (let i = 0; i < slotCount; i += 1) {
      const absoluteMinutes = startMinutes + (i * 30);
      const dayOffset = Math.floor(absoluteMinutes / 1440);
      const slotDate = dayOffset ? plusDays(dateKey, dayOffset) : dateKey;
      const slotMinutes = ((absoluteMinutes % 1440) + 1440) % 1440;
      const key = slotLookupKey(slotDate, slotMinutes);
      if (!pledgeSlotLookup.has(key)) pledgeSlotLookup.set(key, { title, sourceStartMinutes: startMinutes, slotMinutes, dateKey: slotDate });
    }
  }

  function collectPledgeScheduleSlots(row = {}) {
    const data = pledgeScheduleData(row);
    const placements = Array.isArray(data.placements) ? data.placements
      : (Array.isArray(row.placements) ? row.placements : []);
    placements.forEach(placement => recordPledgePlacement(row, placement));
  }

  async function loadOptionalPledgeLookup() {
    pledgeSlotLookup = new Map();
    const rows = await optionalRest('/rest/v1/pledge_fundraiser_schedules?select=id,title,start_date,end_date,schedule_data&limit=2000');
    if (Array.isArray(rows)) rows.forEach(row => collectPledgeScheduleSlots(row));

    window.WNMU_SALES_PLEDGE_LOOKUP = {
      source: 'pledge_fundraiser_schedules exact date/time placements only',
      slotCount: pledgeSlotLookup.size,
      sampleSlots: Array.from(pledgeSlotLookup.entries()).slice(0, 12).map(([key, value]) => ({ key, title: value.title })),
      loadedAt: new Date().toISOString()
    };
  }

  function pledgeSlotMatch(day, slot) {
    const dateKey = normalizeDateKey(day?.date || '');
    const minutes = Number(slot) * 30;
    if (!dateKey || !Number.isFinite(minutes)) return null;
    return pledgeSlotLookup.get(slotLookupKey(dateKey, minutes)) || null;
  }


  function block(label, detail, cls, mode = 'title') {
    return { label, detail: detail || '', cls, titleMode: mode };
  }

  function titleBlock(entry) {
    return block(shortTitle(entry) || 'Program Title', '', 'program', 'title');
  }

  function weekdayIndex(wd) { return ['Monday','Tuesday','Wednesday','Thursday','Friday'].indexOf(wd); }

  function exactTitleOverride(entry, day, slot) {
    const title = `${entryTitle(entry)} ${entryEpisode(entry)}`;
    if (!norm(title)) return null;
    if (hasAny(title, ['mister rogers neighborhood','mister rogers\' neighborhood','arthur','wild kratts','weather hunters','lyla in the loop','sesame','daniel tiger','curious george','molly of denali','alma\'s way','pinkalicious','cyberchase','work it out wombats','donkey hodie'])) {
      return block('Children\u2019s Programming', shortTitle(entry), 'kids');
    }
    if (hasAny(title, ['classical stretch'])) return block('Health / Wellness', shortTitle(entry), 'health');
    if (hasAny(title, ['life on earth'])) return block('Nature / Science', shortTitle(entry), 'science');
    if (hasAny(title, ['son of a butcher'])) return block('Food & Cooking', shortTitle(entry), 'food');
    if (hasAny(title, ['great getaways','great get aways','prairie sportsman'])) return block('Michigan / Regional', shortTitle(entry), 'michigan');
    if (hasAny(title, ['in the americas'])) return block('Travel / Lifestyle', shortTitle(entry), 'travel');
    return null;
  }

  function timeslotRule(entry, day, slot) {
    const date = day?.date || '';
    const wd = weekday(date);
    const wi = weekdayIndex(wd);

    // Monday-Friday recurring sales blocks.
    if (wi >= 0) {
      if (inRange(slot, '06:00', '06:30')) return block('Children\u2019s Programming', shortTitle(entry), 'kids');
      if (inRange(slot, '06:30', '08:00')) return block('Health / Wellness', shortTitle(entry), 'health');
      if (inRange(slot, '08:30', '14:00')) return block('Children\u2019s Programming', shortTitle(entry), 'kids');
      if (inRange(slot, '14:00', '14:30')) return block('Arts / Performance', shortTitle(entry), 'arts');
      if (inRange(slot, '14:30', '15:00')) return block('Health / Wellness', shortTitle(entry), 'health');
      // 3 PM is usually a prime-time repeat. Let title/category rules handle it, then fallback to title.
      if (inRange(slot, '16:00', '16:30')) return block('News / Public Affairs', '', 'news', 'block');
      if (inRange(slot, '16:30', '17:00')) return block('Food & Cooking', shortTitle(entry), 'food');
      if (inRange(slot, '17:00', '17:30')) return block('Travel / Lifestyle', shortTitle(entry), 'travel');
      if (inRange(slot, '17:30', '18:00')) {
        return [
          block('Home / Garden', shortTitle(entry), 'home'),
          block('Home / Garden', shortTitle(entry), 'home'),
          block('Financial', shortTitle(entry), 'financial'),
          block('News / Public Affairs', '', 'news', 'block'),
          block('News / Public Affairs', '', 'news', 'block')
        ][wi];
      }
      if (inRange(slot, '18:00', '18:30')) return block('Talk / Interview', shortTitle(entry), 'talk');
      if (inRange(slot, '18:30', '20:00')) return block('News / Public Affairs', '', 'news', 'block');
      if (inRange(slot, '20:00', '20:30')) {
        return [
          block('Home / Garden', shortTitle(entry), 'home'),
          null,
          block('Nature / Science', shortTitle(entry), 'science'),
          block('Local / Science & Nature', shortTitle(entry), 'local'),
          block('News / Public Affairs', '', 'news', 'block')
        ][wi];
      }
      if (inRange(slot, '21:00', '22:00')) {
        return [
          block('Documentary', shortTitle(entry), 'documentary'),
          titleBlock(entry),
          block('Nature / Science', shortTitle(entry), 'science'),
          block('Michigan / Regional', shortTitle(entry), 'michigan'),
          titleBlock(entry)
        ][wi];
      }
      if (inRange(slot, '22:00', '23:00')) {
        return [
          block('Documentary', shortTitle(entry), 'documentary'),
          titleBlock(entry),
          block('Nature / Science', shortTitle(entry), 'science'),
          block('Michigan / Regional', shortTitle(entry), 'michigan'),
          titleBlock(entry)
        ][wi];
      }
      if (inRange(slot, '23:00', '24:00')) return block('News / Public Affairs', '', 'news', 'block');
    }

    // Saturday recurring sales blocks.
    if (wd === 'Saturday') {
      if (inRange(slot, '06:00', '07:00')) return block('Children\u2019s Programming', shortTitle(entry), 'kids');
      if (inRange(slot, '07:00', '08:00')) return block('Food & Cooking', shortTitle(entry), 'food');
      if (inRange(slot, '08:00', '09:30')) return block('Home / Garden', shortTitle(entry), 'home');
      if (inRange(slot, '09:30', '10:30')) return block('Financial', shortTitle(entry), 'financial');
      if (inRange(slot, '10:30', '11:30')) return block('Home / Garden', shortTitle(entry), 'home');
      if (inRange(slot, '11:30', '12:00')) return block('Arts / Performance', shortTitle(entry), 'arts');
      if (inRange(slot, '12:00', '12:30')) return block('Food & Cooking', shortTitle(entry), 'food');
      if (inRange(slot, '12:30', '13:00')) return block('Environmental', shortTitle(entry), 'environmental');
      if (inRange(slot, '13:00', '15:30')) return block('Home / Garden', shortTitle(entry), 'home');
      if (inRange(slot, '15:30', '17:00')) return block('Michigan / Regional', shortTitle(entry), 'michigan');
      if (inRange(slot, '17:00', '17:30')) return block('Travel / Lifestyle', shortTitle(entry), 'travel');
      if (inRange(slot, '17:30', '18:00')) return block('Native American', shortTitle(entry), 'native');
      if (inRange(slot, '18:00', '18:30')) return block('Local Programming', shortTitle(entry), 'local');
      if (inRange(slot, '18:30', '19:00')) return block('News / Public Affairs', '', 'news', 'block');
      if (inRange(slot, '19:00', '20:00')) return block('Arts / Performance', shortTitle(entry), 'arts');
      if (inRange(slot, '20:00', '21:00')) return block('Variety / Educational', shortTitle(entry), 'variety');
      if (inRange(slot, '21:00', '21:30')) return block('History', shortTitle(entry), 'history');
      if (inRange(slot, '21:30', '22:00')) return block('Home / Garden', shortTitle(entry), 'home');
      // 10 PM left to title/category fallback until Tod assigns the normal block.
      if (inRange(slot, '22:30', '23:00')) return block('Michigan / Regional', shortTitle(entry), 'michigan');
      if (inRange(slot, '23:00', '24:00')) return block('Arts / Performance', shortTitle(entry), 'arts');
    }

    // Sunday recurring sales blocks.
    if (wd === 'Sunday') {
      if (inRange(slot, '06:00', '09:30')) return block('Children\u2019s Programming', shortTitle(entry), 'kids');
      if (inRange(slot, '09:30', '11:00')) return block('Environmental', shortTitle(entry), 'environmental');
      if (inRange(slot, '11:00', '12:00')) return block('Health / Wellness', shortTitle(entry), 'health');
      if (inRange(slot, '12:00', '14:00')) return block('News / Public Affairs', '', 'news', 'block');
      if (inRange(slot, '14:00', '14:30')) return block('Local Programming', shortTitle(entry), 'local');
      if (inRange(slot, '14:30', '15:00')) return block('History', shortTitle(entry), 'history');
      if (inRange(slot, '15:00', '16:00')) return block('Regional / Specials', shortTitle(entry), 'specials');
      if (inRange(slot, '16:00', '18:00')) return block('Arts / Performance', shortTitle(entry), 'arts');
      if (inRange(slot, '18:00', '18:30')) return block('News / Public Affairs', '', 'news', 'block');
      if (inRange(slot, '18:30', '19:00')) return block('History', shortTitle(entry), 'history');
      if (inRange(slot, '19:00', '20:00')) return block("Programmer's Choice", shortTitle(entry), 'choice');
      if (inRange(slot, '20:00', '23:00')) return block('BBC / Mystery', shortTitle(entry), 'drama');
      if (inRange(slot, '23:00', '24:00')) return block('News / Public Affairs', '', 'news', 'block');
    }

    return null;
  }

  function keywordRule(entry) {
    const combined = `${entryTitle(entry)} ${entryEpisode(entry)}`;
    if (!norm(combined)) return null;
    if (hasAny(combined, ['mister rogers neighborhood','mister rogers\' neighborhood','arthur','wild kratts','weather hunters','lyla in the loop','sesame','daniel tiger','curious george','molly of denali','alma\'s way','pinkalicious','cyberchase','work it out wombats','donkey hodie','peg cat','odd squad','ready jet go','super why','splash and bubbles','rosie\'s rules','xavier riddle'])) return block('Children\u2019s Programming', shortTitle(entry), 'kids');
    if (hasAny(combined, ['garden smart','gardening','gardenfit','craftsman\'s legacy','craftsmans legacy','woodsmith','this old house','ask this old house','antiques','home','house','quilting','sewing'])) return block('Home / Garden', shortTitle(entry), 'home');
    if (hasAny(combined, ['health','healthy','wellness','medicine','medical','doctor','doctors','mental health','mind','body','aging','fitness','exercise','heart','brain','caregiving','disease','hospital'])) return block('Health / Wellness', shortTitle(entry), 'health');
    if (hasAny(combined, ['financial','finance','money','wealthtrack','consuelo mack','market','markets','investment','investing','retirement','economy','economic','business','wall street'])) return block('Financial', shortTitle(entry), 'financial');
    if (hasAny(combined, ['environment','environmental','climate','sustainability','sustainable','conservation','ecology','water','wildlife','earth','forest','ocean','planet'])) return block('Environmental', shortTitle(entry), 'environmental');
    if (hasAny(combined, ['kitchen','cook','cooking','chef','food','foods','table','taste','plate','baking','bake','restaurant','restaurants','cuisine','mexican','milk street','test kitchen','dining','meal','spice','flavor','feast','barbecue','bbq','grill'])) return block('Food & Cooking', shortTitle(entry), 'food');
    if (hasAny(combined, ['travel','travels','places','place','europe','roadtrip','road trip','world','journey','journeys','destination','destinations','samantha brown','rick steves','globe','adventure'])) return block('Travel / Lifestyle', shortTitle(entry), 'travel');
    if (hasAny(combined, ['great getaways','great get aways','michigan','upper michigan','upper peninsula','detroit','great lakes','lake superior','mackinac','yooper','marquette','prairie sportsman'])) return block('Michigan / Regional', shortTitle(entry), 'michigan');
    if (hasAny(combined, ['wnmu','media meet','ask the','local','native report','indian country','finlandia','nmu','northern michigan'])) return block('Local Programming', shortTitle(entry), 'local');
    if (hasAny(combined, ['great performances','austin city limits','symphony','opera','theatre','theater','music','concert','arts','painting','art','artist','ballet','dance','gallery','song','stage'])) return block('Arts / Performance', shortTitle(entry), 'arts');
    if (hasAny(combined, ['nature','nova','science','space','engineering','universe','cosmos','evolution','physics','technology','life on earth'])) return block('Nature / Science', shortTitle(entry), 'science');
    if (hasAny(combined, ['american experience','history','historic','war','civil war','revolution','president','presidents','secrets of the dead','roots','genealogy','finding your roots'])) return block('History', shortTitle(entry), 'history');
    if (hasAny(combined, ['frontline','independent lens','pov','documentary','american masters','biography','doc world'])) return block('Documentary', shortTitle(entry), 'documentary');
    if (hasAny(combined, ['news','newshour','bbc news','amanpour','washington week','firing line','to the contrary','open mind','dw focus','public square'])) return block('News / Public Affairs', '', 'news', 'block');
    if (hasAny(combined, ['masterpiece','mystery','midsomer','grantchester','miss scarlet','all creatures','call the midwife','death in paradise','professor t','bbc','drama'])) return block('Drama / Mystery', shortTitle(entry), 'drama');
    return null;
  }

  function classify(entry, day, slot) {
    const fundraiserSlot = pledgeSlotMatch(day, slot);
    if (fundraiserSlot) return block('Fundraiser', shortTitle(entry) || cleanProgramTitle(fundraiserSlot.title), 'fundraiser');
    const exact = entry ? exactTitleOverride(entry, day, slot) : null;
    if (exact) return exact;
    const timeRule = timeslotRule(entry, day, slot);
    if (timeRule) return timeRule;
    const keyword = entry ? keywordRule(entry) : null;
    if (keyword) return keyword;
    return entry ? titleBlock(entry) : null;
  }

  function blankBlock() { return { label: 'Open / TBA', detail: '', cls: 'blank', titleMode: 'block' }; }
  function blockKey(block) { return `${block.label}||${block.detail}||${block.cls}`; }

  function daySegments(day) {
    const segments = [];
    let current = null;
    for (let slot = START_SLOT; slot < END_SLOT; slot += 1) {
      const entry = entryForSlot(day, slot);
      const block = classify(entry, day, slot) || blankBlock();
      if (!current || blockKey(current) !== blockKey(block)) {
        if (current) segments.push(current);
        current = { ...block, startSlot: slot, endSlot: slot + 1 };
      } else {
        current.endSlot = slot + 1;
      }
    }
    if (current) segments.push(current);
    return segments;
  }

  function segmentStartingAt(segments, slot) { return segments.find(seg => seg.startSlot === slot); }
  function segmentCovering(segments, slot) { return segments.find(seg => slot >= seg.startSlot && slot < seg.endSlot); }

  function buildWeekTable(schedule, week, weekIndex, dayLookup) {
    const weekDates = week.filter(day => day.inMonth);
    const rangeStart = weekDates[0]?.date || week[0]?.date || '';
    const rangeEnd = weekDates[weekDates.length - 1]?.date || week[6]?.date || '';
    const segmentsByDay = week.map(dayRef => dayRef.inMonth ? daySegments(dayLookup.get(dayRef.date) || dayRef) : []);

    let html = `<section class="sales-week"><h2>Week ${weekIndex + 1} <span>${esc(fmtDay(rangeStart))} – ${esc(fmtDay(rangeEnd))}</span></h2>`;
    html += '<table class="sales-grid"><thead><tr><th class="time-col">Time</th>';
    week.forEach(day => {
      html += `<th class="day-head${day.inMonth ? '' : ' outside'}">${esc(day.dayName || weekday(day.date))}<br><span>${esc(fmtDay(day.date, { month: 'short', day: 'numeric' }))}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    for (let slot = START_SLOT; slot < END_SLOT; slot += 1) {
      html += `<tr><td class="time-col">${esc(fmtTime(slot))}</td>`;
      week.forEach((day, dayIndex) => {
        if (!day.inMonth) {
          html += '<td class="outside"></td>';
          return;
        }
        const segs = segmentsByDay[dayIndex];
        const covering = segmentCovering(segs, slot);
        if (!covering || covering.startSlot !== slot) return;
        const span = covering.endSlot - covering.startSlot;
        const label = esc(covering.label);
        const detail = covering.detail ? `<div class="sales-detail">${esc(covering.detail)}</div>` : '';
        const timeRange = `<div class="sales-range">${esc(fmtTime(covering.startSlot))}–${esc(fmtTime(covering.endSlot))}</div>`;
        html += `<td class="sales-block sales-${esc(covering.cls)}" rowspan="${span}"><div class="sales-label">${label}</div>${detail}${timeRange}</td>`;
      });
      html += '</tr>';
    }
    html += '</tbody></table></section>';
    return html;
  }


  function buildTitleAuditPanel() {
    return '';
  }

  function bindTitleAuditControls() {
    // v1.5.64: Title cleanup is handled on the main 13.1 / 13.3 schedule pages, not in the Sales View.
  }

  function buildLegend() {
    const items = [
      ['kids', 'Children\u2019s Programming'], ['health', 'Health / Wellness'], ['financial', 'Financial'], ['food', 'Food & Cooking'],
      ['home', 'Home / Garden'], ['travel', 'Travel / Lifestyle'], ['michigan', 'Michigan / Regional'], ['local', 'Local Programming'],
      ['talk', 'Talk / Interview'], ['native', 'Native American'], ['variety', 'Variety / Educational'], ['choice', "Programmer's Choice"],
      ['specials', 'Regional / Specials'], ['fundraiser', 'Fundraiser'], ['arts', 'Arts / Performance'], ['environmental', 'Environmental'],
      ['science', 'Nature / Science'], ['history', 'History'], ['documentary', 'Documentary'], ['news', 'News / Public Affairs'],
      ['drama', 'BBC / Mystery'], ['program', 'Program Title']
    ];
    return '<div class="sales-legend">' + items.map(([cls, label]) => `<span><i class="sales-${cls}"></i>${esc(label)}</span>`).join('') + '</div>';
  }

  function injectStyles() {
    if (document.getElementById('wnmuSalesExportStyles')) return;
    const style = document.createElement('style');
    style.id = 'wnmuSalesExportStyles';
    style.textContent = `
      :root {
        --sales-ink:#16243b; --sales-line:#9aa8ba; --sales-muted:#536176;
        --sales-kids:hsl(48 15% 91%); --sales-health:hsl(150 15% 92%); --sales-financial:hsl(285 15% 91%); --sales-news:hsl(215 15% 91%);
        --sales-food:hsl(28 15% 92%); --sales-home:hsl(40 15% 91%); --sales-travel:hsl(170 15% 91%); --sales-michigan:hsl(205 15% 92%); --sales-local:hsl(125 15% 92%);
        --sales-arts:hsl(265 15% 92%); --sales-environmental:hsl(105 15% 92%); --sales-science:hsl(185 15% 92%); --sales-history:hsl(33 15% 91%); --sales-documentary:hsl(245 15% 92%);
        --sales-drama:hsl(305 15% 92%); --sales-talk:hsl(210 10% 92%); --sales-native:hsl(25 15% 90%); --sales-variety:hsl(70 15% 91%); --sales-choice:hsl(90 15% 92%); --sales-specials:hsl(230 15% 92%); --sales-fundraiser:hsl(345 15% 91%); --sales-program:#f2f4f7; --sales-blank:#ffffff;
      }
      * { box-sizing:border-box; }
      body.sales-export-page { margin:0; background:#e9eef5; color:var(--sales-ink); font:12px/1.25 Arial, Helvetica, sans-serif; }
      .sales-export-root { max-width:1500px; margin:0 auto; padding:18px 20px 28px; }
      .sales-loading,.sales-error { background:#fff; border:1px solid #cdd6e3; border-radius:12px; padding:18px; box-shadow:0 4px 18px rgba(0,0,0,.08); }
      .sales-error { color:#8a1f1f; }
      .sales-topbar { display:flex; align-items:center; justify-content:space-between; gap:20px; background:#fff; border:1px solid #c9d4e2; border-radius:14px; padding:14px 16px; margin-bottom:12px; box-shadow:0 4px 16px rgba(0,0,0,.07); }
      .sales-brand { display:flex; align-items:center; gap:18px; min-width:0; }
      .sales-logo { width:310px; max-width:34vw; height:auto; display:block; }
      .sales-title h1 { margin:0 0 4px; font-size:24px; color:#17345f; line-height:1.1; }
      .sales-title .sub { color:var(--sales-muted); font-size:13px; }
      .sales-contact { text-align:right; color:#1b2d49; font-size:13px; line-height:1.45; white-space:nowrap; }
      .sales-contact a { color:#17345f; text-decoration:none; font-weight:700; }
      .sales-actions { display:flex; justify-content:flex-end; gap:10px; margin:0 0 10px; }
      .sales-actions button,.sales-actions a { border:1px solid #b9c6d6; background:#fff; color:#17345f; padding:8px 11px; border-radius:10px; text-decoration:none; font-weight:700; cursor:pointer; }
      .sales-note { margin:0 0 12px; color:#536176; font-size:12px; }
      .sales-legend { display:flex; gap:7px 12px; flex-wrap:wrap; background:#fff; border:1px solid #c9d4e2; border-radius:12px; padding:9px 11px; margin-bottom:12px; }
      .sales-legend span { display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
      .sales-legend i { width:16px; height:12px; border:1px solid rgba(0,0,0,.2); display:inline-block; border-radius:3px; }
      .sales-kids{background:var(--sales-kids)!important}.sales-health{background:var(--sales-health)!important}.sales-financial{background:var(--sales-financial)!important}.sales-news{background:var(--sales-news)!important}.sales-food{background:var(--sales-food)!important}.sales-home{background:var(--sales-home)!important}.sales-travel{background:var(--sales-travel)!important}.sales-michigan{background:var(--sales-michigan)!important}.sales-local{background:var(--sales-local)!important}.sales-talk{background:var(--sales-talk)!important}.sales-native{background:var(--sales-native)!important}.sales-variety{background:var(--sales-variety)!important}.sales-choice{background:var(--sales-choice)!important}.sales-specials{background:var(--sales-specials)!important}.sales-fundraiser{background:var(--sales-fundraiser)!important}.sales-arts{background:var(--sales-arts)!important}.sales-environmental{background:var(--sales-environmental)!important}.sales-science{background:var(--sales-science)!important}.sales-history{background:var(--sales-history)!important}.sales-documentary{background:var(--sales-documentary)!important}.sales-drama{background:var(--sales-drama)!important}.sales-program{background:var(--sales-program)!important}.sales-blank{background:var(--sales-blank)!important}
      .sales-week { background:#fff; border:1px solid #c9d4e2; border-radius:14px; padding:12px; margin:0 0 16px; box-shadow:0 4px 16px rgba(0,0,0,.06); page-break-after:always; }
      .sales-week h2 { margin:0 0 8px; font-size:18px; color:#17345f; display:flex; justify-content:space-between; gap:16px; }
      .sales-week h2 span { color:#536176; font-size:13px; align-self:end; }
      table.sales-grid { border-collapse:collapse; width:100%; table-layout:fixed; }
      .sales-grid th,.sales-grid td { border:1px solid var(--sales-line); vertical-align:top; }
      .sales-grid th { background:#eaf0f7; color:#17345f; padding:5px 4px; font-size:11px; text-align:center; }
      .sales-grid th span { font-weight:400; color:#40526d; }
      .sales-grid .time-col { width:74px; background:#eef3f8; color:#17345f; text-align:center; font-weight:700; padding:4px 3px; font-size:10px; }
      .sales-block { padding:5px 6px; min-height:24px; overflow:hidden; }
      .sales-label { font-weight:900; font-size:11.5px; color:#000; }
      .sales-detail { margin-top:3px; font-size:10.5px; color:#7c8595; opacity:.56; line-height:1.18; }
      .sales-program .sales-label { color:#8b94a3; font-weight:800; }
      .sales-range { margin-top:4px; font-size:9px; color:#8d97a8; }
      .sales-title-audit { background:#fff; border:1px dashed #aeb9c9; border-radius:12px; padding:10px 12px; margin:0 0 12px; color:#30425d; }
      .sales-title-audit h3 { margin:0 0 6px; font-size:13px; color:#17345f; }
      .sales-title-audit ul { margin:5px 0 8px 18px; padding:0; }
      .sales-title-audit li { margin:2px 0; }
      .sales-title-audit span,.sales-title-audit p { color:#657187; font-size:11px; }
      .sales-title-correction-form { display:grid; grid-template-columns:1fr 1fr auto; gap:8px; align-items:end; margin:8px 0 10px; }
      .sales-title-correction-form label { display:flex; flex-direction:column; gap:3px; font-weight:700; color:#30425d; font-size:11px; }
      .sales-title-correction-form input { border:1px solid #b7c3d2; border-radius:8px; padding:7px 8px; font:12px Arial,sans-serif; }
      .sales-title-correction-form button { border:1px solid #9fb0c6; border-radius:8px; background:#17345f; color:#fff; padding:7px 10px; font-weight:700; cursor:pointer; }
      .outside { background:#f7f8fa !important; color:#a0a8b4; }
      @media print {
        @page { size: landscape; margin:0.35in; }
        body.sales-export-page { background:#fff; font-size:9px; }
        .sales-export-root { max-width:none; padding:0; }
        .sales-actions,.sales-title-audit { display:none; }
        .sales-topbar,.sales-legend,.sales-week { box-shadow:none; border-color:#9aa8ba; border-radius:0; }
        .sales-topbar { padding:7px 8px; margin-bottom:6px; }
        .sales-logo { width:230px; max-width:230px; }
        .sales-title h1 { font-size:18px; }
        .sales-title .sub,.sales-contact { font-size:10px; }
        .sales-note { font-size:9px; margin-bottom:6px; }
        .sales-legend { padding:5px 6px; margin-bottom:6px; gap:4px 8px; font-size:8.5px; }
        .sales-legend i { width:12px; height:9px; }
        .sales-week { padding:6px; margin:0; page-break-after:always; }
        .sales-week h2 { font-size:13px; margin-bottom:4px; }
        .sales-week h2 span { font-size:9px; }
        .sales-grid .time-col { width:54px; font-size:8px; padding:2px; }
        .sales-grid th { font-size:8.5px; padding:2px; }
        .sales-block { padding:3px 4px; }
        .sales-label { font-size:8.8px; }
        .sales-detail { font-size:7.6px; }
        .sales-range { font-size:6.8px; }
      }
    `;
    document.head.appendChild(style);
  }

  function render(row) {
    const schedule = row.schedule_json || {};
    prepareTitleCleanup(schedule);
    const dayLookup = buildDayLookup(schedule);
    const month = row.month_key || monthKey() || schedule.month || '';
    const channel = row.channel_code || channelCode();
    const weeks = Array.isArray(schedule.weeks) ? schedule.weeks : [];
    const scheduleHref = channel === '13.3' ? `index133.v1.4.1.html?month=${encodeURIComponent(month)}&v=1.5.67` : `index131.v1.4.1.html?month=${encodeURIComponent(month)}&v=1.5.67`;

    let html = `
      <header class="sales-topbar">
        <div class="sales-brand">
          <img class="sales-logo" src="wnmu-tv-logo-1-line-black.png" alt="WNMU-TV">
          <div class="sales-title">
            <h1>Monthly Sponsorship Programming Guide</h1>
            <div class="sub">${esc(channelLabel())} • ${esc(fmtMonth(month))} • 6:00 AM–12:00 AM</div>
          </div>
        </div>
        <div class="sales-contact">
          <div><strong>Underwriting / Sponsorship</strong></div>
          <div>Phone: ${esc(CONTACT_PHONE)}</div>
          <div>Web: <a href="${esc(CONTACT_WEB_HREF)}">${esc(CONTACT_WEB_DISPLAY)}</a></div>
        </div>
      </header>
      <div class="sales-actions"><a href="${esc(scheduleHref)}">Back to schedule</a><button type="button" id="salesPrintBtn">Print / Save PDF</button></div>
      <p class="sales-note">Sales-facing view: broad blocks are simplified and sponsor-useful titles are shown as secondary detail. Title cleanup is managed on the main schedule pages.</p>
      ${buildLegend()}`;

    let weekHtml = '';
    if (!weeks.length) {
      weekHtml += '<div class="sales-error">No week grid was found in this imported month.</div>';
    } else {
      weeks.forEach((week, idx) => { weekHtml += buildWeekTable(schedule, week, idx, dayLookup); });
    }
    html += buildTitleAuditPanel();
    html += weekHtml;

    const root = document.getElementById(ROOT_ID);
    root.innerHTML = html;
    document.getElementById('salesPrintBtn')?.addEventListener('click', () => window.print());
    bindTitleAuditControls();
  }

  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function waitForSupabaseConfig() {
    for (let i = 0; i < 30; i += 1) {
      const c = supabaseCfg();
      if (c && c.url && c.anonKey) return c;
      await delay(100);
    }
    const loadedScripts = Array.from(document.scripts || []).map(s => s.getAttribute('src') || '[inline]').join(', ');
    throw new Error('config.js loaded, but Supabase credentials were not found on window.WNMU_SHAREBOARD_SUPABASE. Regular schedule pages may still work if they are using an older cached page; check that config.js is present at this folder root. Loaded scripts: ' + loadedScripts);
  }

  async function start() {
    injectStyles();
    try {
      await waitForSupabaseConfig();
      await loadOptionalPledgeLookup();
      await loadRemoteTitleCorrections();
      const row = await fetchSchedule();
      render(row);
    } catch (err) {
      console.error(`${VERSION}: failed`, err);
      const root = document.getElementById(ROOT_ID);
      if (root) root.innerHTML = `<div class="sales-error"><strong>Could not build Sales View.</strong><br>${esc(err.message || String(err))}<br><br><small>v1.5.67 note: title cleanup uses shared Supabase corrections when available; fundraiser detection uses only exact date/time placements from the actual Fundraising Schedule.</small></div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
