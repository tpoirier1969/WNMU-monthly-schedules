(function () {
  'use strict';

  const VERSION = 'v1.5.85-remote-local-storage-sync';
  const TABLE = 'wnmu_monthly_local_storage';
  const MAX_LOCAL_BYTES = 180000;
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const cache = new Map();
  const dirtyTimers = new Map();
  const localWriteAt = new Map();
  const uploadState = { queued: 0, saved: 0, failed: 0, lastError: '', lastSavedKey: '', migratedKeys: 0, loadedRemoteKeys: 0 };
  let installed = false;
  let loadingRemote = false;

  window.WNMU_REMOTE_STORAGE_VERSION = VERSION;
  window.WNMU_REMOTE_STORAGE_STATUS = uploadState;

  function cfg() { return window.WNMU_MONTHLY_PAGE_CONFIG || {}; }
  function supa() { return window.WNMU_SHAREBOARD_SUPABASE || {}; }
  function nowIso() { return new Date().toISOString(); }

  function parseMonthlyKey(key) {
    const text = String(key || '');
    let m = text.match(/^wnmu(1hd|3pl)-(\d{4}-\d{2})-marks-v[\w.:-]+/i);
    if (m) return { channelCode: m[1].toLowerCase() === '1hd' ? '13.1' : '13.3', monthKey: m[2] };

    const legacy = text.match(/^wnmu(1hd|3pl)(January|February|March|April|May|June|July|August|September|October|November|December)(\d{4})Marks/i);
    if (legacy) {
      const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const mm = String(months.indexOf(legacy[2].toLowerCase()) + 1).padStart(2, '0');
      return { channelCode: legacy[1].toLowerCase() === '1hd' ? '13.1' : '13.3', monthKey: `${legacy[3]}-${mm}` };
    }
    return null;
  }

  function shouldSyncKey(key) {
    if (!key) return false;
    if (parseMonthlyKey(key)) return true;
    return false;
  }

  function safeJsonParse(raw) {
    try { return JSON.parse(String(raw || '{}')); }
    catch { return String(raw || ''); }
  }

  function stringifyPayload(payload) {
    try { return JSON.stringify(payload == null ? {} : payload); }
    catch { return '{}'; }
  }

  function byteLength(value) {
    try { return new Blob([String(value || '')]).size; }
    catch { return String(value || '').length; }
  }

  function authHeaders(extra) {
    const c = supa();
    if (!c.url || !c.anonKey) throw new Error('Missing Supabase config.js credentials.');
    return {
      apikey: c.anonKey,
      Authorization: `Bearer ${c.anonKey}`,
      ...(extra || {})
    };
  }

  function tableUrl(path = '') {
    const c = supa();
    if (!c.url) throw new Error('Missing Supabase URL.');
    return `${String(c.url).replace(/\/$/, '')}/rest/v1/${TABLE}${path}`;
  }

  function tryWriteLocalShadow(key, raw) {
    try {
      if (byteLength(raw) <= MAX_LOCAL_BYTES) {
        originalSetItem.call(localStorage, key, raw);
        return 'full';
      }
      const stub = JSON.stringify({ remoteStored: true, storageKey: key, updatedAt: nowIso(), note: 'Full value is stored in Supabase by WNMU remote storage sync.' });
      originalSetItem.call(localStorage, key, stub);
      return 'stub';
    } catch (err) {
      try {
        const stub = JSON.stringify({ remoteStored: true, storageKey: key, updatedAt: nowIso(), quotaFallback: true });
        originalSetItem.call(localStorage, key, stub);
        return 'stub-after-quota';
      } catch (_) {
        return 'memory-only';
      }
    }
  }

  async function upsertRemoteKey(key, raw, reason) {
    const parsed = parseMonthlyKey(key);
    if (!parsed) return false;
    const payload = safeJsonParse(raw);
    const record = {
      storage_key: key,
      channel_code: parsed.channelCode,
      month_key: parsed.monthKey,
      value_json: payload,
      byte_length: byteLength(raw),
      source: reason || 'app-write',
      updated_at: nowIso()
    };
    const res = await fetch(tableUrl('?on_conflict=storage_key'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(record),
      cache: 'no-store'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Remote storage upsert failed ${res.status}: ${text}`.trim());
    }
    uploadState.saved += 1;
    uploadState.lastSavedKey = key;
    uploadState.lastError = '';
    return true;
  }

  function queueRemoteSave(key, raw, reason) {
    if (!shouldSyncKey(key)) return;
    uploadState.queued += 1;
    window.clearTimeout(dirtyTimers.get(key));
    dirtyTimers.set(key, window.setTimeout(() => {
      dirtyTimers.delete(key);
      upsertRemoteKey(key, raw, reason).catch((err) => {
        uploadState.failed += 1;
        uploadState.lastError = err.message || String(err);
        console.warn(`${VERSION}: remote save failed for ${key}`, err);
      });
    }, 180));
  }

  function installStoragePatch() {
    if (installed) return;
    installed = true;

    Storage.prototype.getItem = function wnmuRemoteGetItem(key) {
      if (this === localStorage && shouldSyncKey(key) && cache.has(String(key))) {
        return cache.get(String(key));
      }
      return originalGetItem.apply(this, arguments);
    };

    Storage.prototype.setItem = function wnmuRemoteSetItem(key, value) {
      if (this === localStorage && shouldSyncKey(key)) {
        const text = String(value ?? '');
        const normalizedKey = String(key);
        cache.set(normalizedKey, text);
        localWriteAt.set(normalizedKey, Date.now());
        tryWriteLocalShadow(normalizedKey, text);
        queueRemoteSave(String(key), text, 'app-write');
        return undefined;
      }
      return originalSetItem.apply(this, arguments);
    };

    Storage.prototype.removeItem = function wnmuRemoteRemoveItem(key) {
      if (this === localStorage && shouldSyncKey(key)) {
        cache.delete(String(key));
      }
      return originalRemoveItem.apply(this, arguments);
    };
  }

  function localKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (shouldSyncKey(key)) keys.push(key);
      }
    } catch (err) {
      console.warn(`${VERSION}: localStorage key scan failed`, err);
    }
    return keys;
  }

  async function migrateLocalKeys() {
    const keys = localKeys();
    for (const key of keys) {
      const raw = cache.get(key) ?? originalGetItem.call(localStorage, key);
      if (!raw) continue;
      const parsed = safeJsonParse(raw);
      if (parsed && parsed.remoteStored && parsed.storageKey === key && !cache.has(key)) continue;
      cache.set(key, String(raw));
      try {
        await upsertRemoteKey(key, String(raw), 'local-migration');
        uploadState.migratedKeys += 1;
      } catch (err) {
        uploadState.failed += 1;
        uploadState.lastError = err.message || String(err);
        console.warn(`${VERSION}: migration failed for ${key}`, err);
      }
    }
  }

  function currentChannelCode() {
    return cfg().channelCode || '';
  }

  function currentMonthKey() {
    return (window.WNMU_CURRENT_MONTH_META && window.WNMU_CURRENT_MONTH_META.monthKey) || new URLSearchParams(location.search).get('month') || '';
  }

  async function loadRemoteMonth() {
    const channel = currentChannelCode();
    const month = currentMonthKey();
    if (!channel || !month || loadingRemote) return;
    loadingRemote = true;
    const loadStartedAt = Date.now();
    try {
      const url = tableUrl(`?select=storage_key,value_json,updated_at&channel_code=eq.${encodeURIComponent(channel)}&month_key=eq.${encodeURIComponent(month)}`);
      const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Remote storage load failed ${res.status}: ${text}`.trim());
      }
      const rows = await res.json();
      if (Array.isArray(rows)) {
        rows.forEach((row) => {
          if (!row || !row.storage_key) return;
          const storageKey = String(row.storage_key || '');
          const raw = stringifyPayload(row.value_json);
          const remoteUpdatedAt = Date.parse(row.updated_at || '') || 0;
          const lastLocalWrite = localWriteAt.get(storageKey) || 0;
          // Do not let a delayed/stale remote load overwrite the user's active edit.
          // This is what made custom tag text vanish shortly after typing and could
          // also make box-note saves appear to fail even though the local write ran.
          if (lastLocalWrite && (!remoteUpdatedAt || remoteUpdatedAt <= lastLocalWrite || lastLocalWrite >= loadStartedAt)) return;
          cache.set(storageKey, raw);
          tryWriteLocalShadow(storageKey, raw);
          uploadState.loadedRemoteKeys += 1;
        });
      }
      uploadState.lastError = '';
      window.dispatchEvent(new CustomEvent('wnmu:remote-storage-loaded', { detail: { version: VERSION, rows: Array.isArray(rows) ? rows.length : 0, channel, month } }));
    } catch (err) {
      uploadState.failed += 1;
      uploadState.lastError = err.message || String(err);
      console.warn(`${VERSION}: remote month load skipped`, err);
    } finally {
      loadingRemote = false;
    }
  }

  function addStatusButton() {
    try {
      if (document.getElementById('wnmuRemoteStorageBtn')) return;
      const host = document.querySelector('.topbar, .panel-head, header, body');
      if (!host) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'wnmuRemoteStorageBtn';
      btn.textContent = 'Sync local marks';
      btn.title = 'Copy WNMU Monthly localStorage marks/notes to Supabase now';
      btn.style.cssText = 'margin-left:8px;border:1px solid #8fa3bd;border-radius:999px;background:#eef4fb;color:#17345f;font-weight:800;padding:6px 10px;cursor:pointer;';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Syncing…';
        await migrateLocalKeys();
        await loadRemoteMonth();
        btn.disabled = false;
        btn.textContent = uploadState.lastError ? 'Sync issue' : 'Synced local marks';
        window.setTimeout(() => { btn.textContent = 'Sync local marks'; }, 2500);
      });
      host.appendChild(btn);
    } catch (err) {
      console.warn(`${VERSION}: status button skipped`, err);
    }
  }

  function boot() {
    installStoragePatch();
    migrateLocalKeys().then(loadRemoteMonth).catch((err) => {
      uploadState.failed += 1;
      uploadState.lastError = err.message || String(err);
    });
    [250, 900, 1800, 3500].forEach((delay) => window.setTimeout(loadRemoteMonth, delay));
    window.setTimeout(addStatusButton, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
