/* Browser integration test ONLY, gated by ?wnmuTopicDiagnostic=run. Never deploy to main. */
(async function () {
  'use strict';
  if (new URLSearchParams(location.search).get('wnmuTopicDiagnostic') !== 'run') return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = {};
  const display = () => {
    let node = document.getElementById('wnmuTopicDiagnosticResult');
    if (!node) {
      node = document.createElement('pre');
      node.id = 'wnmuTopicDiagnosticResult';
      node.style.cssText = 'position:relative;z-index:2147483646;background:#fffce1;color:#131313;border:3px solid #bc3419;padding:18px;white-space:pre-wrap;font:14px/1.5 monospace;max-height:700px;overflow:auto;';
      document.body.prepend(node);
    }
    node.textContent = 'MONTHLY TOPIC BROWSER DIAGNOSTIC (SANDBOX ONLY)\n' + JSON.stringify(log, null, 2);
  };
  const getState = cell => {
    const key = window.WNMU_MONTHLY_PAGE_CONFIG?.storageKey || '';
    let marks = {};
    try { marks = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    const id = cell?.dataset?.entryId || '';
    const menu = document.getElementById('wnmuCellMenu');
    const cellKey = menu?.dataset?.wnmuCellKey || '';
    return {
      key, id, cellKey,
      mainEntry: marks[id] ? {tags: marks[id].tags, monthlyTopicLabel: marks[id].monthlyTopicLabel} : null,
      mainSlot: marks[cellKey] ? {tags: marks[cellKey].tags, monthlyTopicLabel: marks[cellKey].monthlyTopicLabel} : null,
      pills: Array.from(cell?.querySelectorAll('.tag-pill') || []).map(el => ({
        text: el.textContent.trim(), planningTag: el.dataset.wnmuPlanningTag || ''
      })),
      dataset: { topic: cell?.dataset?.wnmuMonthlyTopicLabel || '' },
      menuTopic: menu?.querySelector('#wnmuMonthTopicValue')?.value || '',
      menuChosen: menu?.querySelector('#wnmuMonthTopicChosen')?.textContent || '',
      status: menu?.querySelector('#wnmuCellStatus')?.textContent || ''
    };
  };
  try {
    if (!window.WNMU_PREVIEW_SANDBOX?.active) throw Error('Not in protected test app; ABORT');
    log.stage = 'waiting for imported schedule'; display();
    let cell;
    for (let i=0;i<100;i++) {
      cell = [...document.querySelectorAll('table.screen-week-grid td.program-cell[data-entry-id]')].find(
        el => !el.classList.contains('outside') && el.querySelector('.program-title')?.textContent);
      if (cell) break;
      await sleep(250);
    }
    if (!cell) throw Error('No program cell available');
    log.program = cell.querySelector('.program-title')?.textContent;
    log.before = getState(cell); display();
    cell.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,cancelable:true,button:2,clientX:120,clientY:180}));
    await sleep(150);
    const menu = document.getElementById('wnmuCellMenu');
    log.menuOpened = !!menu && !menu.classList.contains('hidden');
    if (!log.menuOpened) throw Error('Cannot open right-click menu');
    const checkbox = menu.querySelector('input[name="monthlyTopic"]');
    if (!checkbox) throw Error('No Monthly Topic checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    for(let i=0;i<80;i++) {
      if (menu.querySelector('#wnmuMonthTopicOptions [data-topic="Christmas"]')) break;
      await sleep(250);
    }
    log.pickerOpened = !!menu.querySelector('#wnmuMonthTopicDialog')?.open;
    const choice=menu.querySelector('#wnmuMonthTopicOptions [data-topic="Christmas"]');
    if (!choice) throw Error('Christmas option never loaded');
    choice.click();
    await sleep(200);
    log.afterSelection = getState(cell);display();
    await sleep(1100);
    log.afterBackgroundHandlers = getState(cell);display();
    if(window.WNMU_AUTO_TAG_HELPERS_API?.sanitizeVisibleHighlights) {
      window.WNMU_AUTO_TAG_HELPERS_API.sanitizeVisibleHighlights();
      await sleep(180);
    }
    log.afterAutoRedraw = getState(cell);display();
    log.result = log.afterSelection.pills.some(x=>x.text==='Christmas') &&
      log.afterAutoRedraw.pills.some(x=>x.text==='Christmas') ? 'PASS' : 'FAIL';
    display();
  } catch(err) {
    log.result='ERROR';
    log.error=String(err&&err.stack||err);
    display();
  }
})();