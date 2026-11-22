// 둘러보기 소개 여부와 첫 공개 안내.


export function createDiscoverRuntime(ctx){
  let countTreeMoments, discoverState;
  function discoverAskedList(){try{const raw=JSON.parse(localStorage.getItem('lt41.discoverAsked')||'[]');return Array.isArray(raw)?raw.filter(v=>typeof v==='string'):[]}catch{return[]}}

  function markDiscoverAsked(treeId){try{const list=discoverAskedList();if(!list.includes(treeId))list.push(treeId);localStorage.setItem('lt41.discoverAsked',JSON.stringify(list));}catch{}}

  // 트리 id → 마지막으로 확인한 소개 값(배너·공유 판이 같은 값을 본다)
  async function refreshTreeDiscover(treeId){
   try{const answer=await ctx.shareApi.getTreeDiscover(treeId);if(!answer.ok)return null;
    discoverState.set(treeId,answer.discover===true);return answer.discover===true;}catch{return null}
  }

  async function askDiscover(treeId){
   try{
    const discover=await refreshTreeDiscover(treeId);
    if(discover===null)return; // 확인 실패 — 마킹하지 않아 다음 저장 때 다시 본다
    markDiscoverAsked(treeId);
    if(discover===true)return; // 이미 소개 켜진 트리(#739 백필)는 묻지 않는다
    (0,ctx.$)('discover-ask-feedback').textContent='';
    (0,ctx.$)('discover-ask').dataset.treeId=treeId;
    (0,ctx.$)('discover-ask').showModal();
    try{localStorage.setItem('lt41.publicNoticeShown','1');}catch{} // 질문 창이 #538 첫 공개 안내와 같은 사실을 대신한다 — 답한 뒤 배너가 또 뜨지 않게
   }catch{/* 이미 다른 창이 열려 있으면 다음 저장 때 다시 본다 */}
  }

  function answerDiscover(discover){
   const treeId=(0,ctx.$)('discover-ask').dataset.treeId;
   if(!treeId)return;
   ctx.shareApi.setTreeDiscover(treeId,discover).then(answer=>{
    if(!answer.ok){(0,ctx.$)('discover-ask-feedback').textContent=answer.message||'소개 설정을 저장하지 못했어요.';return;}
    discoverState.set(treeId,discover);
    markDiscoverAsked(treeId);
    // 261117 대표 검수: 답변 확인 알림은 띄우지 않는다 — 첫 화면 숫자 줄을 가리고, 질문 창 본문이
    // 이미 같은 사실을 말한다. 소개 상태는 공유 판(언제든 켜고 끄는 곳)에서 확인한다.
    (0,ctx.$)('discover-ask').close();
   }).catch(()=>{(0,ctx.$)('discover-ask-feedback').textContent='소개 설정을 저장하지 못했어요.';});
  }

  // 상단 배너(첫 저장 안내): 소개 상태에 맞는 문장 — 이름·아이디는 안 보인다는 말은 유지한다.
  async function notifyPublicBanner(treeId){
   let discover=false;
   if(treeId){const got=await refreshTreeDiscover(treeId);if(got!==null)discover=got;}
    const text=discover
     ?'이 트리는 둘러보기에 소개 중이에요. 공유 판에서 끌 수 있어요. 이름·아이디는 보이지 않아요.'
     :'내 트리는 링크를 받은 사람만 볼 수 있어요. 둘러보기 소개는 공유 판에서 켤 수 있어요. 이름·아이디는 보이지 않아요.';
    try{localStorage.setItem('lt41.publicNoticeShown','1');}catch{} // #538 기기당 1회 — 질문 창과 같은 사실을 알리는 안내다
    (0,ctx.notify)(text);
  }
  Object.defineProperties(ctx,{
    countTreeMoments:{get:()=>countTreeMoments,set:value=>{countTreeMoments=value;}},
    discoverAskedList:{value:discoverAskedList},
    discoverState:{get:()=>discoverState,set:value=>{discoverState=value;}},
    askDiscover:{value:askDiscover},
    notifyPublicBanner:{value:notifyPublicBanner}
  });
  return {mount(){
    // 둘러보기 소개 질문(261116 대표 결정 — 기본 꺼짐·고객이 고름, 무료): 순간이 2개→3개가 되는 저장
    // 직후 한 번 묻는다(쉬운 추가·자세한 추가·책 추가 모두 — 저장 동기화 지점이 한 곳). 고른 값은
    // PUT /api/trees/<id>/discover(#739)로 저장하고, 한 트리에 한 번만 묻는다(고른 뒤 다시 묻지 않음).
    // 이미 소개가 켜진 트리(#739 백필)는 묻지 않는다. #718의 '공개됐어요' 안내는 이 질문 창으로 대신한다.
    countTreeMoments=()=>{const out={};for(const tree of (ctx.model?.trees||[]))out[tree.id]=(tree.moments||[]).length;return out;};

    discoverState=new Map();

    (0,ctx.$)('discover-ask-yes').onclick = () => answerDiscover(true);

    (0,ctx.$)('discover-ask-no').onclick = () => answerDiscover(false);
  }};
}
