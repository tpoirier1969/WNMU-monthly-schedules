(function () {
  const VERSION = 'v1.4.18-supabase-json-fetch-shim';
  const TABLE = 'wnmu_monthly_schedules_imported_months';
  const originalFetch = window.fetch.bind(window);
  const cache = new Map();

  function getConfig() {
    return window.WNMU_SHAREBOARD_SUPABASE || {};
  }

  function parseSupabaseImportedPath(input) {
    let urlText = '';
    if (typeof input === 'string') urlText = input;
    else if (input && typeof input.url === 'string') urlText = input.url;
    else return null;

    let pathname = urlText;
    try {
      pathname = new URL(urlText, window.location.href).pathname;
    } catch {}

    const match = pathname.match(/supabase-imported-months\/(13\.1|13\.3)\/(\d{4}-\d{2})\/(schedule|verification)-/);
    if (!match) return null;

    return {
      channelCode: match[1],
      monthKey: match[2],
      kind: match[3]
    };
  }

  async function readSupabaseJson(channelCode, monthKey, kind) {
    const key = `${channelCode}::${monthKey}`;
    if (!cache.has(key)) {
      const cfg = getConfig();
      if (!cfg.url || !cfg.anonKey) {
        throw new Error('config.js is missing Supabase credentials.');
      }

      const select = 'channel_code,month_key,schedule_json,verification_json,updated_at';
      const url = `${cfg.url}/rest/v1/${TABLE}?select=${encodeURIComponent(select)}&channel_code=eq.${encodeURIComponent(channelCode)}&month_key=eq.${encodeURIComponent(monthKey)}&limit=1`;
      const res = await originalFetch(url, {
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`
        },
        cache: 'no-store'
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Supabase imported month read failed (${res.status}) ${txt}`.trim());
      }

      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) {
        throw new Error(`No Supabase imported month row found for ${channelCode} ${monthKey}.`);
      }

      cache.set(key, rows[0]);
    }

    const row = cache.get(key);
    return kind === 'verification'
      ? (row.verification_json || {})
      : (row.schedule_json || {});
  }

  window.fetch = async function wnmuSupabaseImportedJsonFetch(input, init) {
    const parsed = parseSupabaseImportedPath(input);
    if (!parsed) return originalFetch(input, init);

    try {
      const body = await readSupabaseJson(parsed.channelCode, parsed.monthKey, parsed.kind);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-WNMU-Source': VERSION
        }
      });
    } catch (err) {
      console.error(`${VERSION}: could not supply ${parsed.kind} JSON`, err);
      return new Response(JSON.stringify({ error: err.message || String(err) }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-WNMU-Source': VERSION
        }
      });
    }
  };

  window.WNMU_SUPABASE_JSON_FETCH_SHIM_VERSION = VERSION;
})();
