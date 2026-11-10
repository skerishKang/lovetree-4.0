import {createSyncController} from './sync-controller.mjs';
import {EMPTY_STATE,validateState,createTree,editTree,addMoment,editMoment,reparentMoment,removeMoment,linkMoments,unlinkMoments,cacheMomentMediaMetadata,quickAdd,moveMoment,treeFromMoments,MAX_TREES,newId,updatePrefs} from './domain.mjs';
// Reuses 4.0 persistence, retries and revision conflicts; demo/file records cannot enter this session.
function sessionDraftStorage(){try{return globalThis.sessionStorage||null;}catch{return null;}}
export function createMemberSession({api,onState=()=>{},onStatus=()=>{},navigate=()=>{},delay,makeClientKey=()=>`v41-${newId()}`,draftStorage=sessionDraftStorage()}){
 let document=EMPTY_STATE(),subject=null,bound=false,active=true,mismatch=false;
 const wrapped={get:async()=>{const result=await api.get();if(!active)return {ok:false,status:401};
   if(result.ok){if(subject&&subject!==result.subject){mismatch=true;bound=false;return {ok:false,status:401,code:'account_changed'};}subject=result.subject;bound=result.writeSubjectBound===true&&typeof subject==='string'&&!!subject;}return result;},
 put:body=>{if(!active||!bound||mismatch||!subject)return Promise.resolve({ok:false,status:401});return api.put({...body,expectedSubject:subject});},logout:()=>api.logout()};
 const sync=createSyncController({getState:()=>document,replaceState:s=>{if(!active)return;document=validateState(s);onState(structuredClone(document));},api:wrapped,draftStorage,delay,makeClientKey,navigate:url=>navigate(url.startsWith('/auth/login')?'/auth/login?next=/v41/':url),onChange:s=>{if(active)onStatus({...s,writable:sync.snapshot().owned&&bound&&!mismatch,dirty:sync.snapshot().dirty});}});
 function apply(action,input={},selection={}){
   const snap=sync.snapshot();if(!active||!snap.owned||!bound||mismatch||['checking','login','conflict'].includes(sync.status().phase))throw Error('먼저 내 기록을 불러오고 저장 연결을 확인해 주세요.');
   // 계정 표시 설정(#347 후속): 나무 없이도 저장한다. 서버에는 상태 전체가 PUT된다.
   if(action==='setPrefs'){
     document=validateState(updatePrefs(document,input));
     onState(structuredClone(document));
     sync.markLocalSave();
     return {prefs:document.prefs};
   }
   // #347 후속 B: 예전 YouTube 순간의 영상 제목을 한 번에 채운다. title은 건드리지 않는다.
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
     onState(structuredClone(document));
     sync.markLocalSave();
     return {changed:true};
   }
   let trees=[...document.trees],tree=trees.find(t=>t.id===selection.treeId),momentId=selection.momentId,treeId=selection.treeId;
   // #327(① 데이터 규칙): 빠른 추가·옮기기·새 트리로 정리는 상태 전체를 도메인 함수가 바꾼다.
   if(action==='quickAdd'||action==='moveMoment'||action==='treeFromMoments'){
     const result=action==='quickAdd'?quickAdd(document,input)
       :action==='moveMoment'?moveMoment(document,selection.treeId,selection.momentId,input.toTreeId,input.parentId)
       :treeFromMoments(document,selection.treeId,input.momentIds,{subject:input.subject});
     document=validateState(result.state);
     treeId=result.treeId;
     momentId=result.momentId??document.trees.find(t=>t.id===result.treeId)?.moments.find(m=>m.parentId===null)?.id??null;
     onState(structuredClone(document),{treeId,momentId});sync.markLocalSave();return {treeId,momentId};
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
   document=validateState({version:1,trees,prefs:document.prefs});onState(structuredClone(document),{treeId,momentId});sync.markLocalSave();return {treeId,momentId};
 }
 return {start:()=>sync.start(),apply,act:name=>sync.act(name),snapshot:()=>({...sync.snapshot(),subject,writable:sync.snapshot().owned&&bound&&!mismatch,phase:sync.status().phase}),state:()=>structuredClone(document),dispose:()=>{active=false;bound=false;},status:()=>sync.status()};
}
