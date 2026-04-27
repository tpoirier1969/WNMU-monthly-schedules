(function(){
  const VERSION='v1.4.39 event-driven cell override overlay';
  function apply(){
    const flag=document.getElementById('versionFlag');
    if(!flag)return;
    const base=String(flag.textContent||'').replace(/\s*•\s*v1\.4\.3\d[^•]*/g,'').trim();
    flag.textContent=(base?base+' • ':'')+VERSION;
    window.WNMU_VISIBLE_VERSION_FLAG=VERSION;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,80),{once:true});
  else setTimeout(apply,80);
  setTimeout(apply,800);
  setTimeout(apply,1800);
})();
