import {createSyncController} from './sync-controller.mjs';
import {EMPTY_STATE,validateState,createTree,editTree,addMoment,editMoment,reparentMoment,removeMoment,linkMoments,unlinkMoments,MAX_TREES,newId} from './domain.mjs';
// Reuses 4.0 persistence, retries and revision conflicts; demo/file records cannot enter this session.
export function createMemberSession({api,onState=()=>{},onStatus=()=>{},navigate=()=>{},delay,makeClientKey=()=>`v41-${newId()}`}){
 let document=EMPTY_STATE(),subject=null,bound=false,active=true,mismatch=false;
 const wrapped={get:async()=>{const result=await api.get();if(!active)return {ok:false,status:401};
   if(result.ok){if(subject&&subject!==result.subject){mismatch=true;bound=false;return {ok:false,status:401,code:'account_changed'};}subject=result.subject;bound=result.writeSubjectBound===true&&typeof subject==='string'&&!!subject;}return result;},
 put:body=>{if(!active||!bound||mismatch||!subject)return Promise.resolve({ok:false,status:401});return api.put({...body,expectedSubject:subject});},logout:()=>api.logout()};
 const sync=createSyncController({getState:()=>document,replaceState:s=>{if(!active)return;document=validateState(s);onState(structuredClone(document));},api:wrapped,delay,makeClientKey,navigate:url=>navigate(url.startsWith('/auth/login')?'/auth/login?next=/v41/':url),onChange:s=>{if(active)onStatus({...s,writable:sync.snapshot().owned&&bound&&!mismatch,dirty:sync.snapshot().dirty});}});
 function apply(action,input={},selection={}){
   const snap=sync.snapshot();if(!active||!snap.owned||!bound||mismatch||['checking','login','conflict'].includes(sync.status().phase))throw Error('먼저 내 기록을 불러오고 저장 연결을 확인해 주세요.');
   let trees=[...document.trees],tree=trees.find(t=>t.id===selection.treeId),momentId=selection.momentId,treeId=selection.treeId;
   if(action==='new'){if(trees.length>=MAX_TREES)throw Error('트리는 50개까지 만들 수 있어요.');tree=createTree(input);trees.push(tree);treeId=tree.id;momentId=tree.moments[0].id;}
   else {if(!tree)throw Error('트리를 선택해 주세요.');let next;
    if(action==='add'){next=addMoment(tree,input,momentId);momentId=next.moments.at(-1).id;}
    else if(action==='editTree')next=editTree(tree,input);
    else if(action==='edit')next=editMoment(tree,momentId,input);
    else if(action==='reparent')next=reparentMoment(tree,momentId,input.targetId,input.relation);
    else if(action==='delete'){next=removeMoment(tree,momentId);momentId=next.moments.find(m=>m.id===tree.moments.find(m=>m.id===momentId)?.parentId)?.id||next.moments[0].id;}
    else if(action==='link')next=linkMoments(tree,momentId,input.targetId);
    else if(action==='unlink')next=unlinkMoments(tree,momentId,input.targetId);
    else if(action==='deleteTree'){trees=trees.filter(t=>t.id!==tree.id);treeId=trees[0]?.id||null;momentId=trees[0]?.moments[0]?.id||null;}
    else throw Error('지원하지 않는 작업이에요.');
    if(next)trees=trees.map(t=>t.id===tree.id?next:t);
   }
   document=validateState({version:1,trees});onState(structuredClone(document),{treeId,momentId});sync.markLocalSave();return {treeId,momentId};
 }
 return {start:()=>sync.start(),apply,act:name=>sync.act(name),snapshot:()=>({...sync.snapshot(),subject,writable:sync.snapshot().owned&&bound&&!mismatch,phase:sync.status().phase}),state:()=>structuredClone(document),dispose:()=>{active=false;bound=false;},status:()=>sync.status()};
}
