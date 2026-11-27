import {createSyncController} from './sync-controller.mjs';
import {EMPTY_STATE,validateState,createTree,editTree,addMoment,editMoment,reparentMoment,removeMoment,linkMoments,unlinkMoments,cacheMomentMediaMetadata,quickAdd,moveMoment,treeFromMoments,organizeMoments,undoOrganize,MAX_TREES,newId,updatePrefs} from './domain.mjs';
// Reuses 4.0 persistence, retries and revision conflicts; demo/file records cannot enter this session.
function sessionDraftStorage(){try{return globalThis.sessionStorage||null;}catch{return null;}}
function sessionCacheStorage(){try{return globalThis.localStorage||null;}catch{return null;}}
export function createMemberSession({api,onState=()=>{},onStatus=()=>{},onGuard=()=>{},navigate=()=>{},delay,makeClientKey=()=>`v41-${newId()}`,draftStorage=sessionDraftStorage(),cacheStorage=sessionCacheStorage()}){
 let document=EMPTY_STATE(),subject=null,bound=false,active=true,mismatch=false;
 const wrapped={get:async()=>{const result=await api.get();if(!active)return {ok:false,status:401};
   if(result.ok){if(subject&&subject!==result.subject){mismatch=true;bound=false;return {ok:false,status:401,code:'account_changed'};}subject=result.subject;bound=result.writeSubjectBound===true&&typeof subject==='string'&&!!subject;}return result;},
 put:(body,options)=>{if(!active||!bound||mismatch||!subject)return Promise.resolve({ok:false,status:401});return api.put({...body,expectedSubject:subject},options);},logout:()=>api.logout()};
 const sync=createSyncController({getState:()=>document,replaceState:s=>{if(!active)return;document=validateState(s);onState(structuredClone(document));},onGuard,api:wrapped,draftStorage,cacheStorage,delay,makeClientKey,navigate:url=>navigate(url.startsWith('/auth/login')?'/auth/login?next=/v41/':url),onChange:s=>{if(active)onStatus({...s,writable:sync.snapshot().owned&&bound&&!mismatch,dirty:sync.snapshot().dirty});}});
 // 이슈 644 3번: 탭을 다시 보거나 창으로 돌아오면 최신 기록을 확인한다. 이 화면에서 고친 게 없을 때만
 // 조용히 최신 기록을 불러온다(띠 없음) — 확인 자체는 sync 컨트롤러의 check()가 판정한다. 4초에 한 번 넘지 않게 쉰다.
 let lastQuietCheck = 0;
 const quietCheck = () => {
   const at = Date.now();
   if (at - lastQuietCheck < 4000) return;
   lastQuietCheck = at;
   void sync.check();
 };
 // 숨김·닫힘 때 아직 서버에 못 보낸 바뀜을 즉시 보낸다(창 닫힘 유실 막음 — 운영센터 의견 #35).
 // 담은 직후 꼬리표 칩을 확정하고 900ms 저장 대기 안에 창을 닫으면(탭 닫기·앱 전환·휴대폰 화면 꺼짐)
 // 저장이 영영 사라졌다. keepalive로 보내므로 창이 닫혀도 요청은 끝까지 나간다.
 const onHide = () => { sync.flushOnHide(); };
 const onVisible = () => {
   if (globalThis.document?.visibilityState === 'visible') { quietCheck(); return; }
   onHide();
 };
 globalThis.document?.addEventListener?.('visibilitychange', onVisible);
 globalThis.addEventListener?.('pagehide', onHide);
 globalThis.addEventListener?.('focus', quietCheck);
 function apply(action,input={},selection={},metaHint){
   const snap=sync.snapshot();if(!active||!snap.owned||!bound||mismatch||['checking','login','conflict'].includes(sync.status().phase))throw Error('먼저 내 기록을 불러오고 저장 연결을 확인해 주세요.');
   // 계정 표시 설정(#347 후속): 나무 없이도 저장한다. 서버에는 상태 전체가 PUT된다.
   if(action==='setPrefs'){
     document=validateState(updatePrefs(document,input));
     // #1001 (d): 설정 값은 이미 각 설정 메시지로 화면에 전달된다 — 화면을 다시 띄우지 않는다.
     onState(structuredClone(document),undefined,{tree:true});
     sync.markLocalSave();
     return {prefs:document.prefs};
   }
   // #347 후속 B(#678 후속 갱신): 예전 YouTube 순간의 영상 제목을 한 번에 채운다 — 자동 제목('<도메인>에서 간직한 순간')은 영상 제목으로 바로잡리고, 고객이 직접 적은 제목은 그대로 둔다(domain cacheMomentMediaMetadata).
   if(action==='backfillTitles'){
     let next=document,changed=false;
     for(const item of (Array.isArray(input?.items)?input.items:[])){
       const tree=next.trees.find(t=>t.id===item?.treeId);
       if(!tree)continue;
       const grown=cacheMomentMediaMetadata(tree,item.momentId,item.url,item.mediaMetadata);
       if(grown!==tree){next={...next,trees:next.trees.map(t=>t.id===tree.id?grown:t)};changed=true;}
     }
     if(!changed)return {changed:false};
     document=validateState({...next,prefs:next.prefs});
     // #1001 (b)①: 자동 제목 보정은 같은 트리 안 내용 변경 — 모델만 갱신해 쉬운 추가 직후 이중 재적재를 막는다.
     onState(structuredClone(document),undefined,{moment:true});
     sync.markLocalSave();
     return {changed:true};
   }
    let trees=[...document.trees],tree=trees.find(t=>t.id===selection.treeId),momentId=selection.momentId,treeId=selection.treeId;
    // 4.1 기억 보드: 화면이 만든 순간·연결·배치를 통째로 받아 저장한다(셸은 iframe을 다시 그리지 않는다).
    if(action==='boardSync'){
      if(!tree)throw new Error('트리를 선택해 주세요.');
      const boardMoments=Array.isArray(input?.moments)?input.moments:[];
      if(!boardMoments.length)throw new Error('보드 기록을 확인해 주세요.');
      // #1044: 보드는 배치·모양·연결·한마디만 바꾼다. 보드 목록에 없는 구간·만든 시각은 기존 순간 값을 지킨다.
      const before=new Map((tree.moments||[]).map(m=>[m.id,m]));
      const mergedMoments=boardMoments.map(bm=>{const old=before.get(bm.id);return old?{...old,...bm,startSeconds:old.startSeconds,endSeconds:old.endSeconds,createdAt:old.createdAt}:bm;});
      const next=validateState({version:1,trees:trees.map(t=>t.id===tree.id?{...t,updatedAt:new Date().toISOString(),moments:mergedMoments}:t),prefs:document.prefs});
      document=next;
      const chosen=next.trees.find(t=>t.id===treeId);
      momentId=chosen?.moments.some(m=>m.id===momentId)?momentId:(chosen?.moments.find(m=>m.parentId===null)?.id||momentId);
      onState(structuredClone(document),{treeId,momentId},{board:true});
      sync.markLocalSave();
      return {treeId,momentId};
    }
    // #327(① 데이터 규칙): 빠른 추가·옮기기·새 트리로 정리는 상태 전체를 도메인 함수가 바꾼다.
   // #1439: 순간 정리의 옮기기·복사하기 한 번(organizeMoments)과 그 되돌리기(undoOrganize)도 같은 길이다.
   // 되돌리기에 쓸 기록(record)과 결과 숫자(summary)를 함께 돌려준다.
   if(action==='quickAdd'||action==='moveMoment'||action==='treeFromMoments'||action==='organizeMoments'||action==='undoOrganize'){
     const result=action==='quickAdd'?quickAdd(document,input)
       :action==='moveMoment'?moveMoment(document,selection.treeId,selection.momentId,input.toTreeId,input.parentId)
       :action==='organizeMoments'?organizeMoments(document,{mode:input.mode,fromTreeId:selection.treeId,momentIds:input.momentIds,toTreeIds:input.toTreeIds,skip:input.skip,newTreeName:input.newTreeName})
       :action==='undoOrganize'?undoOrganize(document,input.record)
       :treeFromMoments(document,selection.treeId,input.momentIds,{subject:input.subject});
     document=validateState(result.state);
     treeId=result.treeId;
     momentId=result.momentId??document.trees.find(t=>t.id===result.treeId)?.moments.find(m=>m.parentId===null)?.id??null;
     onState(structuredClone(document),{treeId,momentId},metaHint);sync.markLocalSave();
     if(action==='organizeMoments')return {treeId,momentId,record:result.record,summary:result.summary};
     if(action==='undoOrganize')return {treeId,momentId,exact:result.exact};
     return {treeId,momentId};
   }
   if(action==='new'){if(trees.length>=MAX_TREES)throw Error('트리는 50개까지 만들 수 있어요.');tree=createTree(input);trees.push(tree);treeId=tree.id;momentId=tree.moments[0].id;}
   else {if(!tree)throw Error('트리를 선택해 주세요.');let next;
    if(action==='add'){next=addMoment(tree,input,momentId);momentId=next.moments.at(-1).id;}
    else if(action==='editTree')next=editTree(tree,input);
    else if(action==='edit')next=editMoment(tree,momentId,input);
    else if(action==='cacheMediaMetadata'){next=cacheMomentMediaMetadata(tree,momentId,input.url,input.mediaMetadata);if(next===tree)return {treeId,momentId,changed:false};}
    else if(action==='reparent')next=reparentMoment(tree,momentId,input.targetId,input.relation);
    else if(action==='delete'){next=removeMoment(tree,momentId);momentId=next.moments.find(m=>m.id===tree.moments.find(m=>m.id===momentId)?.parentId)?.id||next.moments[0].id;}
    else if(action==='link')next=linkMoments(tree,momentId,input.targetId);
    else if(action==='unlink')next=unlinkMoments(tree,momentId,input.targetId);
    else if(action==='deleteTree'){trees=trees.filter(t=>t.id!==tree.id);treeId=trees[0]?.id||null;momentId=trees[0]?.moments[0]?.id||null;}
    else throw Error('지원하지 않는 작업이에요.');
    if(next)trees=trees.map(t=>t.id===tree.id?next:t);
   }
   document=validateState({version:1,trees,prefs:document.prefs});
   // #984: 트리 편집(이름·표지)은 보드 저장과 같은 길 — 화면이 이미 자기 상태를 들고 있으므로 셸은 모델만
   // 갱신하고 화면을 다시 띄우지 않는다. 표지·이름은 lt41-trees-saved/renamed 알림이 바로 다시 그린다.
   // #1001 (a): 호출부가 metaHint를 주면 그 길로(한마디 저장={moment:true}) — 화면을 다시 띄우지 않아 답이 살아있는 문서에 도착한다.
   // #1001 (3): 같은 트리 안 순간 변경(고치기·삭제·이전 순간 바꾸기·연결·해제)도 모델 전용 — 책·지도가
   // lt41-moments-saved 알림을 받아 지금 펼침면·선택·열린 판을 그대로 다시 그린다(재적재 0). 트리 삭제·옮기기·새 트리는 그대로 재적재.
   const modelOnly=metaHint??(action==='editTree'?{tree:true}:(action==='edit'||action==='delete'||action==='reparent'||action==='link'||action==='unlink'||action==='cacheMediaMetadata'?{moment:true}:undefined));
   onState(structuredClone(document),{treeId,momentId},modelOnly);sync.markLocalSave();return {treeId,momentId};
 }
 return {start:()=>sync.start(),apply,act:name=>sync.act(name),flushOnHide:()=>sync.flushOnHide(),snapshot:()=>({...sync.snapshot(),subject,writable:sync.snapshot().owned&&bound&&!mismatch,phase:sync.status().phase}),state:()=>structuredClone(document),dispose:()=>{active=false;bound=false;globalThis.document?.removeEventListener?.('visibilitychange',onVisible);globalThis.removeEventListener?.('pagehide',onHide);globalThis.removeEventListener?.('focus',quietCheck);},status:()=>sync.status()};
}
