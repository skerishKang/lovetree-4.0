// #1294: 둘러보기 내부 판의 뒤로 가기 기록.
export function createExploreLayers(host=globalThis) {
 const open=new Map();
 let serial=0;
 const token=()=>host.history?.state?.lt41ExploreLayer;
 const isExplore=()=>/^#explore(?:\/moments)?$/.test(host.location?.hash||'');
 const apply=()=>{
  const active=token();
  for(const [name,item] of [...open]){
   if(item.token!==active){
    // 공유 감상으로 나간 동안 미리보기의 복귀 기록을 보존한다.
    if(item.suspended&&!isExplore())continue;
    open.delete(name);item.close();continue;
   }
   if(item.suspended&&item.resume){
    item.suspended=false;
    host.setTimeout?.(()=>{if(open.get(name)===item&&isExplore())item.resume();},0);
   }
  }
 };
 host.addEventListener?.('popstate',apply);
 return {
  open(name,close){
   if(open.has(name))return;
   const id='explore-'+(++serial),previous=host.history?.state;
   host.history?.pushState?.({...((previous&&typeof previous==='object')?previous:{}),lt41ExploreLayer:id},'',host.location?.href);
   open.set(name,{token:id,close});
  },
  suspend(name,resume){
   const item=open.get(name);if(!item)return;
   item.suspended=true;item.resume=resume;item.close();
  },
  dismiss(name){
   const item=open.get(name);if(!item)return;
   open.delete(name);item.close();
   if(token()===item.token)host.history?.back?.();
  },
  clear(...names){
   for(const [name,item] of [...open])if(!names.length||names.includes(name)){open.delete(name);item.close();}
  },
  active(name){const item=open.get(name);return !!item&&!item.suspended;},
  suspended(name){return !!open.get(name)?.suspended;}
 };
}
