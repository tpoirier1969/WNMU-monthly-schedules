/* Development preview only. Never load this file from production pages. */
(function () {
  'use strict';
  const prefix = 'wnmu_safe_preview_20261020::';
  const productionFetch = window.fetch.bind(window);
  const cfg = window.WNMU_SHAREBOARD_SUPABASE || {};
  const base = String(cfg.url || '').replace(/\/$/, '');
  if (!base) throw new Error('The preview requires the existing Supabase read configuration.');
  const read = key => { try { return JSON.parse(localStorage.getItem(prefix + key) || 'null'); } catch { return null; } };
  const save = (key, value) => localStorage.setItem(prefix + key, JSON.stringify(value));
  const reply = (value, code = 200) => new Response(JSON.stringify(value), {
    status: code, headers: { 'Content-Type': 'application/json', 'X-WNMU-Preview': 'local-only' }
  });
  const tableName = u => (u.pathname.split('/rest/v1/')[1] || '').split('/')[0];
  const query = (u, key) => {
    const v = u.searchParams.get(key) || '';
    return v.startsWith('eq.') ? v.slice(3) : '';
  };
  const rowId = (table, row) => {
    if (table === 'wnmu_monthly_schedules_imported_months')
      return String(row.channel_code || '') + '|' + String(row.month_key || '');
    if (table === 'wnmu_monthly_local_storage') return String(row.storage_key || '');
    if (table === 'wnmu_monthly_schedules_shared_marks')
      return String(row.channel_code || '') + '|' + String(row.month_key || '') + '|' + String(row.entry_key || '');
    return String(row.id || row.entry_key || row.original_title || row.title || '');
  };
  const matches = (u, row) => ['channel_code','month_key','storage_key','entry_key'].every(k => !query(u,k) || row[k] === query(u,k));
  function storeRow(table, row) {
    const id = rowId(table, row);
    if (!id) return;
    const key = table + '::' + id;
    save(key, { ...(read(key) || {}), ...row });
    const indexKey = table + '::index';
    const ids = read(indexKey) || [];
    if (!ids.includes(id)) save(indexKey, ids.concat(id));
  }
  async function previewRead(input, init, u, table) {
    const real = await productionFetch(input, init);
    if (!real.ok) return real;
    let rows = null;
    try { rows = await real.clone().json(); } catch {}
    if (!Array.isArray(rows)) return real;
    let result = rows.map(row => {
      const shadow = read(table + '::' + rowId(table,row));
      return shadow ? { ...row, ...shadow } : row;
    }).filter(row => !row.__previewDeleted);
    const known = new Set(result.map(row => rowId(table,row)));
    for (const id of read(table + '::index') || []) {
      if (known.has(id)) continue;
      const item = read(table + '::' + id);
      if (item && matches(u,item) && !item.__previewDeleted) result.push(item);
    }
    return reply(result);
  }
  async function previewWrite(u, method, init, table) {
    if (!table.startsWith('wnmu_')) return reply({ error: 'Database write blocked by preview.' },403);
    if (method === 'DELETE') {
      const row = {
        channel_code: query(u,'channel_code'), month_key: query(u,'month_key'),
        entry_key: query(u,'entry_key'), storage_key: query(u,'storage_key')
      };
      storeRow(table, { ...row, __previewDeleted: true });
      return reply([]);
    }
    let body = null;
    try { body = JSON.parse(String(init?.body || 'null')); } catch {}
    let rows = Array.isArray(body) ? body : (body && typeof body === 'object' ? [body] : []);
    const saved = [];
    for (const original of rows) {
      const row = { ...original };
      if (table === 'wnmu_monthly_schedules_imported_months') {
        row.channel_code = row.channel_code || query(u,'channel_code');
        row.month_key = row.month_key || query(u,'month_key');
      }
      storeRow(table,row);
      saved.push(row);
    }
    return reply(saved);
  }
  window.fetch = function previewOnlyFetch(input, init) {
    const u = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    if (!u.href.startsWith(base + '/')) return productionFetch(input,init);
    const table = tableName(u);
    if (!['GET','HEAD'].includes(method)) return previewWrite(u,method,init,table);
    if (method === 'GET' && ['wnmu_monthly_schedules_imported_months','wnmu_monthly_local_storage',
      'wnmu_monthly_schedules_shared_marks','wnmu_monthly_title_corrections'].includes(table))
      return previewRead(input,init,u,table);
    return productionFetch(input,init);
  };
  // Defense in depth. The schedule uses fetch, but prevent XHR database writes too.
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method,url) {
    if (!['GET','HEAD'].includes(String(method).toUpperCase()) &&
      String(new URL(url,location.href).href).startsWith(base + '/'))
      throw new Error('Production database writes are blocked in the preview.');
    return xhrOpen.apply(this,arguments);
  };
  window.WNMU_PREVIEW_SANDBOX = { active: true, productionWrites: false };
  function banner() {
    const bar = document.createElement('div');
    bar.style.cssText='position:sticky;top:0;z-index:99999;background:#ffe8a3;color:#202020;border:2px solid #9a6910;padding:10px 12px;text-align:center;font:bold 15px system-ui';
    bar.textContent='WNMU TEST COPY | Edits stay in this browser | Live schedule and Supabase data are protected';
    document.body.prepend(bar);
    document.querySelectorAll('a[href]').forEach(link=>{
      const href=link.getAttribute('href')||'';
      if(href.includes('index131.v1.4.1.html'))link.setAttribute('href','preview131.html');
      else if(href.includes('index133.v1.4.1.html'))link.setAttribute('href','preview133.html');
    });
    document.addEventListener('click',event=>{
      const anchor=event.target.closest?.('a[href]');
      if(!anchor) return;
      const href=anchor.getAttribute('href')||'';
      if(href.startsWith('#'))return;
      const url=new URL(anchor.href,location.href);
      if(url.origin!==location.origin)return;
      const file=url.pathname.split('/').pop();
      if(file==='preview131.html'||file==='preview133.html')return;
      event.preventDefault();
      alert('This page is disabled in the safe preview. The live app is separate.');
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',banner,{once:true});
  else banner();
})();
