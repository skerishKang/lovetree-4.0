// #1294: 둘러보기 내부 판의 뒤로 가기 기록.
export function createExploreLayers(host=globalThis) {
 const open=new Map();
 let serial=0;
 const token=()=>host.history?.state?.lt41ExploreLayer;
 const isExplore=()=>/^#explore(?:\/moments)?(?:\?|$)/.test(host.location?.hash||'');
 // 공유 감상에서 돌아올 때 셸이 둘러보기 주소를 늦게 다시 쓰는 경우가 있다(느린 실행기).
 // 주소가 아직 둘러보기가 아니면 미리보기 복원을 버리지 않고 다음 주소 바뀜까지 기다린다.
 const resumeWhenExplore=(name,item,tries=0)=>{
  if(open.get(name)!==item||!item.suspended)return;
  if(isExplore()){item.suspended=false;item.resume();return;}
  if(tries>=20)return;
  host.setTimeout?.(()=>resumeWhenExplore(name,item,tries+1),50);
 };
 const apply=event=>{
  // popstate의 event.state는 돌아온 기록 그대로다 — 셸이 같은 순간에 replaceState로 바꾼 상태보다 정확하다.
  const active=event&&event.state&&typeof event.state==='object'&&'lt41ExploreLayer' in event.state?event.state.lt41ExploreLayer:token();
  for(const [name,item] of [...open]){
   if(item.token!==active){
    // 공유 감상으로 나간 동안 미리보기의 복귀 기록을 보존한다.
    if(item.suspended&&!isExplore())continue;
    open.delete(name);item.close();continue;
   }
   if(item.suspended&&item.resume)host.setTimeout?.(()=>resumeWhenExplore(name,item),0);
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
