/* Only for sandbox QA. Explicit ?wnmuCommitDiagnostic=run and TEST COPY protection. */
(async function () {
'use strict';
if(new URLSearchParams(location.search).get('wnmuCommitDiagnostic')!=='run') return;
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
const data={};
function update(){
 let node=document.getElementById('wnmuCommitDiagnosticResult');
 if(!node){node=document.createElement('pre');node.id='wnmuCommitDiagnosticResult';node.style.cssText='position:relative;z-index:999999;background:#fffde8;color:black;border:3px solid #a00;white-space:pre-wrap;padding:12px;max-height:600px;overflow:auto';document.body.prepend(node);}
 node.textContent='COMMIT BROWSER DIAGNOSTIC — SANDBOX ONLY\n'+JSON.stringify(data,null,2);
}
try {
 if(!window.WNMU_PREVIEW_SANDBOX?.active || window.WNMU_PREVIEW_SANDBOX.productionWrites!==false)
   throw Error('Sandbox protection not proven. Refusing commit test.');
 data.status='waiting for program grid'; update();
 let cell;
 for(let i=0;i<90;i++){
   cell=[...document.querySelectorAll('table.screen-week-grid td.program-cell[data-entry-id]')].find(c=>Number(c.rowSpan||1)===1&&c.querySelector('.program-title')?.textContent?.trim()&&c.dataset.entryId);
   if(cell)break;await sleep(250);
 }
 if(!cell)throw Error('No 30-minute program cell found');
 const title=cell.querySelector('.program-title').textContent.trim();
 const date=cell.closest('tr')?.querySelector('.time-col')?.textContent || '';
 const id=cell.dataset.entryId;
 data.testCell={title,id,timeText:date};update();
 cell.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:115,clientY:165}));
 await sleep(150);
 const menu=document.getElementById('wnmuCellMenu');
 if(!menu || menu.classList.contains('hidden'))throw Error('White Override menu did not open');
 const input=menu.querySelector('#wnmuCellText');
 const save=menu.querySelector('#wnmuCellSaveBtn');
 const commit=menu.querySelector('#wnmuCommitProgramBtn');
 if(!input || !save || !commit)throw Error('Missing box note or Commit controls');
 data.target={key:menu.dataset.wnmuCellKey,date:menu.dataset.wnmuCellDate,time:menu.dataset.wnmuCellTime};update();
 input.value='WNMU SANDBOX ONLY COMMIT TEST';
 input.dispatchEvent(new Event('input',{bubbles:true}));
 save.click();
 await sleep(250);
 data.afterNoteSave={status:menu.querySelector('#wnmuCellStatus')?.textContent,overlayCount:document.querySelectorAll('.wnmu-cell-override-box').length};update();
 commit.click();
 for(let i=0;i<72;i++){
   const last=window.WNMU_LAST_MANUAL_SCHEDULE_OVERWRITE;
   const state=menu.querySelector('#wnmuCellStatus')?.textContent || '';
   if(last?.row?.title_text==='WNMU SANDBOX ONLY COMMIT TEST'&&(!menu.dataset.wnmuCommitBusy || i>10)){
     await sleep(250);break;
   }
   if(/failed|error|not confirmed|timed out/i.test(state))break;
   await sleep(250);
 }
 data.afterCommit={
   status:menu.querySelector('#wnmuCellStatus')?.textContent||'',
   commitBusy:menu.dataset.wnmuCommitBusy||'',
   lastManualOverwrite:window.WNMU_LAST_MANUAL_SCHEDULE_OVERWRITE
     ? {row:window.WNMU_LAST_MANUAL_SCHEDULE_OVERWRITE.row,replacedCount:window.WNMU_LAST_MANUAL_SCHEDULE_OVERWRITE.replacedCount}:null,
   visibleProgramCount:[...document.querySelectorAll('table.screen-week-grid .program-title')].filter(e=>e.textContent.includes('WNMU SANDBOX ONLY COMMIT TEST')).length,
   menuHidden:menu.classList.contains('hidden')
 };
 const success=!!data.afterCommit.lastManualOverwrite &&
  data.afterCommit.visibleProgramCount>0 &&
  data.afterCommit.menuHidden;
 data.result=success?'PASS':'FAIL';
 update();
} catch(err){data.result='ERROR';data.error=String(err?.stack||err);update();}
})();