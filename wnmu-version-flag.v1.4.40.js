(function(){
  const VERSION='v1.4.40 stability rollback - overlay hotfix removed';
  function apply(){
    const flag=document.getElementById('versionFlag');
    if(!flag)return;
    const base=String(flag.textContent||'')
      .replace(/\s*•\s*v1\.4\.(3[7-9]|40)[^•]*/g,'')
      .trim();
    flag.textContent=(base?base+' • ':'')+VERSION;
    window.WNMU_VISIBLE_VERSION_FLAG=VERSION;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,80),{once:true});
  else setTimeout(apply,80);
  setTimeout(apply,800);
  setTimeout(apply,1800);
})();
