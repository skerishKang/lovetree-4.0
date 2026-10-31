import {mountPrivateUpload} from './private-upload.mjs';
import {suggestMomentTitle,parentCandidates} from './domain.mjs';
import {MEMBER_LOGIN_URL,shouldLoadMemberRecords} from './member-entry.mjs';
import {workspaceModel} from './workspace-model.mjs';
import {createWorkspaceApi} from './api.mjs';
import {createMemberSession} from './member-session.mjs';
import {exampleTree} from './example.mjs';
import {parseSelectionRoute,ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,stashPendingOwnerRoute,pendingOwnerRoute,takePendingOwnerRoute} from './selection-location.mjs';
const $=id=>document.getElementById(id);
const screens=[['home','src064-orbit.html','첫 화면'],['shelf','track32-bookshelf.html','내 책장'],['book','track59-sketchbook.html','기억책'],['board','track58-pinboard.html','기억 보드'],['network','track56-network.html','관계 지도']];
const initialRoute=parseSelectionRoute(location.hash);
const screenForView=view=>screens.find(screen=>screen[0]===view)||screens[0];
const viewForFile=file=>screens.find(screen=>screen[1]===file)?.[0]||'home';
let model=null,current=screenForView(initialRoute.view)[1],source='example',loadGeneration=0,toastTimer,previousDirty=false,member=null,editorMode='new',formBaseline='',parentBaseline='',treeBaseline='',handledHash=null;
window.LT41=null;
const uploads=mountPrivateUpload({form:$('moment-form'),getSubject:()=>source==='server'&&member?.snapshot().writable?member.snapshot().subject:null,getState:()=>member?.state(),onChange:()=>{updateMediaPreview();updateQuickEntryHint();}});
function notify(text){$('record-feedback').textContent=text;$('toast').textContent=text;$('toast').hidden=$('records').open;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function panel(id){const target=$(id);if(!target.open)target.showModal();}
function ownerPosition(){const c=window.LT41;return c?{treeId:c.tree.id,momentId:c.momentId,view:viewForFile(current)}:null;}
function writeLocation(mode='push'){
 const position=ownerPosition(),owned=source==='server'&&member?.snapshot().owned&&position;
 const hash=owned?ownerSelectionRoute(position):'#'+viewForFile(current);
 if(location.hash!==hash)history[mode==='replace'?'replaceState':'pushState'](null,'',hash);
 handledHash=hash;
 if(owned)rememberAccountPosition(localStorage,member.snapshot().subject,position);
}
function viewContext(){const c=window.LT41;$('view-context').hidden=!c||current==='src064-orbit.html';if(!c)return;$('context-tree').textContent=c.tree.title;$('context-kind').textContent=source==='example'?'예시':source==='file'?'파일':'';$('context-kind').hidden=source==='server';$('manage-tree').hidden=source!=='server'||!member?.snapshot().owned||!member.snapshot().writable;}
function links(){viewContext();const c=window.LT41;$('connections').replaceChildren();if(!c){$('connection-count').textContent='0';$('selection-label').textContent='트리를 먼저 불러오세요.';return;}
 const moment=c.tree.moments.find(m=>m.id===c.momentId);$('selection-label').textContent=moment?.title||'';
 const edges=c.tree.edges.filter(e=>e.from===c.momentId||e.to===c.momentId);$('connection-count').textContent=edges.length;
 if(!edges.length){const p=document.createElement('p');p.textContent='아직 연결된 다른 순간이 없어요.';$('connections').append(p);}
 for(const e of edges){const id=e.from===c.momentId?e.to:e.from,m=c.tree.moments.find(m=>m.id===id),b=document.createElement('button'),kind=document.createElement('small'),title=document.createElement('span');kind.textContent=e.kind==='related'?'관련 순간':e.from===c.momentId?'다음 순간':'이전 순간';const name=document.createElement('strong'),reason=document.createElement('span');name.textContent=m.title;reason.className='connection-reason';reason.textContent=e.reason||(e.kind==='related'?'함께 기억할 관련 순간으로 연결했어요.':'연결 이유를 아직 남기지 않았어요.');title.append(name,reason);b.append(kind,title);b.onclick=()=>{c.momentId=id;$('connection-panel').close();show(current,false);writeLocation();};$('connections').append(b);}}
function flowNavigation(){
 const reading=!!window.LT41&&['track59-sketchbook.html','track58-pinboard.html','track56-network.html'].includes(current);
 $('tree-views').hidden=false;for(const b of $('tree-views').querySelectorAll('button')){b.disabled=!window.LT41;b.title=window.LT41?'':'트리를 선택하면 열 수 있어요.';}$('connection-menu').hidden=!reading;
 $('tree-views').setAttribute('aria-label',window.LT41?.tree.title?window.LT41.tree.title+' 보기':'이 트리 보기');
 if(!member?.snapshot().dirty)$('write-menu').textContent=source==='server'?(reading?'순간 추가':'새 트리 만들기'):'내 기록 시작';$('write-menu').title=source==='server'?(reading?'선택한 순간에서 이어지는 새 순간을 기록합니다.':'새 트리의 첫 순간을 기록합니다.'):'로그인한 계정에 내 트리를 만듭니다. 예시에는 저장하지 않아요.';
}
function show(file,write=true){const screen=screens.find(s=>s[1]===file);if(!screen)return;current=file;flowNavigation();if(!window.LT41&&file!=='src064-orbit.html'){document.body.classList.remove('home-screen');$('view').hidden=true;$('empty').hidden=false;if(write)writeLocation();links();return;}document.body.classList.toggle('home-screen',file==='src064-orbit.html');document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.view===file)));$('view').hidden=false;$('empty').hidden=true;$('view').title='러브트리 · '+screen[2];$('view').contentWindow.location.replace(new URL(file==='src064-orbit.html'?'home.html':(source==='example'?'design/views/':'views/')+file,location.href).href);if(write)writeLocation();links();}
function choose(id,momentId){const tree=model.trees.find(t=>t.id===id);window.LT41=tree?{tree,trees:model.trees,source,momentId:tree.moments.find(m=>m.id===momentId)?.id||tree.moments.find(m=>m.parentId===null)?.id||tree.moments[0]?.id,}:null;
 if(tree||current==='src064-orbit.html')show(current,false);else{flowNavigation();document.body.classList.remove('home-screen');$('view').hidden=true;$('view').contentWindow.location.replace('about:blank');$('empty').hidden=false;links();}}
function load(input,kind,selection={},fallback={}){model=kind==='example'?{trees:[exampleTree]}:workspaceModel(input);source=kind;document.body.dataset.recordSource=kind;$('source-label').textContent='트리 선택';$('record-description').textContent=kind==='example'?'실제 회원 데이터와 무관한 예시입니다.':kind==='server'?'로그인한 계정의 서버 기록 · 작성·수정 후 자동 저장':'선택한 파일을 메모리에서 읽는 중입니다.';$('trees').replaceChildren();for(const t of model.trees){const o=document.createElement('option');o.value=t.id;o.textContent=t.title;$('trees').append(o);}$('trees').disabled=!model.trees.length;const resolved=resolveAccountPosition(model.trees,selection,fallback),chosen=model.trees.find(t=>t.id===resolved.position.treeId);$('trees').value=chosen?.id||'';choose(chosen?.id,resolved.position.momentId);return resolved;}
function clear(){load({revision:0,state:{version:1,trees:[]}},'file');$('source-label').textContent='트리 선택';$('record-description').textContent='펼쳐 볼 트리를 선택하세요.';}
function stateSelection(){return {treeId:window.LT41?.tree.id,momentId:window.LT41?.momentId};}
function parentValue(){return new URLSearchParams({targetId:$('parent-target').value,relation:$('parent-relation').value}).toString();}
function parentDirty(){return !$('parent-management').hidden&&parentValue()!==parentBaseline;}
function formDirty(){return $('editor').open&&(new URLSearchParams(new FormData($('moment-form'))).toString()!==formBaseline||parentDirty());}
function treeDirty(){return $('tree-manager').open&&new URLSearchParams(new FormData($('tree-form'))).toString()!==treeBaseline;}
function canLeave(){return !(formDirty()||treeDirty()||member?.snapshot().dirty)||confirm('아직 저장되지 않은 입력이 있어요. 현재 기록을 백업한 뒤 이동하는 것을 권합니다. 저장하지 않고 이동할까요?');}
function leaveMember(){if(!canLeave())return false;member?.dispose();member=null;return true;}
function memberStatus(status){
 const failed=status.dirty&&['offline','rejected','conflict','login'].includes(status.phase);
 $('save-feedback').hidden=!failed;$('save-message').textContent=failed?(status.detail||'서버에 저장하지 못했어요. 이 화면을 닫지 말고 다시 저장해 주세요.'):'';$('save-actions').replaceChildren();
 if(failed){for(const a of status.actions.filter(a=>['retry','pull','force'].includes(a.name))){const b=document.createElement('button');b.textContent=a.label;b.onclick=async()=>{if(['pull','force'].includes(a.name)&&!confirm(a.name==='pull'?'미저장 변경을 버리고 서버 기록을 불러올까요?':'서버의 최신 기록을 현재 입력으로 덮어쓸까요? 다른 창의 변경이 사라질 수 있습니다.'))return;await member?.act(a.name);};$('save-actions').append(b);}const b=document.createElement('button');b.textContent='현재 기록 백업';b.onclick=backup;$('save-actions').append(b);}
 if(status.phase==='checking')notify('내 기록을 불러오고 있어요.');
 else if(status.phase==='synced')notify(status.writable?(previousDirty?'서버에 저장됐어요.':'내 기록을 불러왔어요.'):'기록을 읽었어요. 서버 편집 연결은 아직 준비되지 않았어요.');
 else if(status.phase==='login'&&!status.dirty)notify('로그인이 필요해요.');
 else if(!status.dirty&&status.phase==='offline')notify(status.detail||'내 기록을 불러오지 못했어요.');
 $('account-entry').textContent=status.phase==='login'?'로그인':member?.snapshot().owned?'내 계정':'로그인';$('write-menu').textContent=status.dirty?'미저장 기록' :'순간 남기기';$('empty-records').textContent=status.writable?'첫 트리 만들기':'내 기록 불러오기';previousDirty=status.dirty;flowNavigation();
}
async function startMember(){if(!leaveMember())return;const startup=parseSelectionRoute(location.hash);if(startup.scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);++loadGeneration;const generation=loadGeneration;clear();
 const api=createWorkspaceApi({fetchImpl:(url,init)=>fetch(init?.method==='GET'&&url==='/api/workspace'?'/api/workspace?features=bound-writes':url,init)});
 let initialized=false,startupNotice='',session;
 session=createMemberSession({api,onState:(state,selection)=>{if(generation!==loadGeneration)return;const snapshot=session.snapshot(),saved=accountPosition(localStorage,snapshot.subject)||{},active=parseSelectionRoute(location.hash),pending=!initialized&&active.scope!=='owner'?pendingOwnerRoute(sessionStorage):null,route=active.scope==='owner'?active:pending;let requested=selection||stateSelection();
   if(!initialized){if(route)requested=route;else if(!selection)requested=saved;const view=active.scope==='screen'&&active.explicit?active.view:route?.view||saved.view||viewForFile(current);current=screenForView(view)[1];}
   const resolved=load({revision:0,state},'server',requested,saved);initialized=true;
   if(snapshot.owned&&resolved.position.treeId){writeLocation('replace');takePendingOwnerRoute(sessionStorage);if(route?.scope==='owner'&&resolved.treeMissing)startupNotice='이 주소의 기록을 현재 계정에서 찾을 수 없어 최근 위치를 열었어요.';else if(route?.scope==='owner'&&resolved.momentMissing)startupNotice='이 주소의 순간을 찾을 수 없어 트리의 시작 순간을 열었어요.';}
 },onStatus:status=>{if(generation===loadGeneration)memberStatus(status);},navigate:url=>{if(url.startsWith('/auth/login')&&parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);location.assign(url.startsWith('/auth/login')?MEMBER_LOGIN_URL:url==='#start'?'#home':url);}});member=session;await session.start();if(generation===loadGeneration&&session.snapshot().owned){$('records').close();if(startupNotice)notify(startupNotice);}}
function sample(selection={},view){if(!leaveMember())return;++loadGeneration;if(view)current=view;load(null,'example',selection);if(view)writeLocation();$('save-feedback').hidden=true;$('records').close();}
$('account-entry').onclick=e=>{if(member?.snapshot().owned){e.preventDefault();panel('records');}else if(parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);};$('record-menu').onclick=()=>{$('record-feedback').textContent='';panel('records');};$('connection-menu').onclick=()=>panel('connection-panel');$('empty-records').onclick=()=>member?.snapshot().writable?openEditor():panel('records');$('empty-sample').onclick=sample;
$('sample').onclick=sample;$('clear').onclick=()=>{if(!leaveMember())return;++loadGeneration;clear();$('save-feedback').hidden=true;$('file').value='';$('records').close();};
$('server').onclick=startMember;$('logout').onclick=async()=>{if(member){await member.act('logout');if(member.snapshot().dirty)notify('미저장 기록이 있어 로그아웃하지 않았어요. 다시 저장하거나 백업해 주세요.');}else{const answer=await createWorkspaceApi().logout();notify(answer.ok?'로그아웃했습니다.':'로그아웃하지 못했어요. 다시 시도해 주세요.');}};
$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;if(!leaveMember())return;const generation=++loadGeneration;try{if(f.size>4194304)throw Error('4MiB 이하 파일만 읽습니다.');const d=JSON.parse(await f.text());if(generation!==loadGeneration)return;load(d.state?d:{revision:0,state:d},'file');$('records').close();notify('파일을 열었어요. 서버에는 저장하지 않습니다.');}catch(e){if(generation===loadGeneration)notify('불러오기 실패: '+e.message);}};
$('trees').onchange=()=>{choose($('trees').value);writeLocation();$('records').close();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(b.dataset.close==='editor'&&uploads.busy){notify('파일 전송을 마치거나 취소해 주세요.');return;}if(b.dataset.close==='editor'&&formDirty()&&!confirm('작성 중인 입력을 버리고 닫을까요?'))return;if(b.dataset.close==='tree-manager'&&treeDirty()&&!confirm('책 정보 변경을 버리고 닫을까요?'))return;$(b.dataset.close).close();});
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target!==d||['editor','tree-manager'].includes(d.id))return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
function showPublicRoute(route){if(member&&!leaveMember()){writeLocation('replace');return;}++loadGeneration;clear();current=screenForView(route.view)[1];show(current,false);handledHash=location.hash;notify('공개 공유 주소는 내 계정 전용 주소와 분리되어 있어요. 공개 기록 불러오기는 공유 기능에서 연결합니다.');}
function applyBrowserLocation(){if(location.hash===handledHash)return;handledHash=location.hash;const route=parseSelectionRoute(location.hash);if(route.scope==='public'){showPublicRoute(route);return;}current=screenForView(route.view)[1];
 if(route.scope==='owner'){if(source!=='server'||!member?.snapshot().owned){show(current,false);void startMember();return;}const saved=accountPosition(localStorage,member.snapshot().subject)||{},resolved=resolveAccountPosition(model?.trees||[],route,saved);choose(resolved.position.treeId,resolved.position.momentId);if(resolved.treeMissing||resolved.momentMissing){writeLocation('replace');notify(resolved.treeMissing?'이 주소의 기록을 현재 계정에서 찾을 수 없어 최근 위치를 열었어요.':'이 주소의 순간을 찾을 수 없어 트리의 시작 순간을 열었어요.');}else rememberAccountPosition(localStorage,member.snapshot().subject,{...resolved.position,view:route.view});return;}
 show(current,false);
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));
addEventListener('popstate',applyBrowserLocation);
addEventListener('hashchange',applyBrowserLocation);
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('view').contentWindow)return;if(e.data?.type==='lt41-navigate')show(e.data.view);if(e.data?.type==='lt41-select'&&window.LT41?.tree.moments.some(m=>m.id===e.data.id)){window.LT41.momentId=e.data.id;links();writeLocation();}if(e.data?.type==='lt41-write')openEditor(e.data.mode);if(e.data?.type==='lt41-open-book'&&model?.trees.some(t=>t.id===e.data.treeId&&t.moments.some(m=>m.id===e.data.id))){current='track59-sketchbook.html';choose(e.data.treeId,e.data.id);writeLocation();}if(e.data?.type==='lt41-account')$('account-entry').click();if(e.data?.type==='lt41-example'&&exampleTree.moments.some(m=>m.id===e.data.momentId)&&['track59-sketchbook.html','track58-pinboard.html'].includes(e.data.view)){sample({treeId:exampleTree.id,momentId:e.data.momentId},e.data.view);}if(e.data?.type==='lt-selection'||e.data?.type==='lt41-choose'){links();writeLocation();}});
$('view').onload=()=>{const d=$('view').contentDocument;if(!d)return;d.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;let file;if(b.matches('[data-action="tree"],[data-menu="tree"]'))file='track32-bookshelf.html';if(b.matches('#storyBook,[data-menu="book"]'))file='track59-sketchbook.html';if(current==='track56-network.html'&&b.id==='openMoment')file='track59-sketchbook.html';if(file){e.preventDefault();e.stopImmediatePropagation();show(file);}},true);};
load(null,'example');if(initialRoute.scope==='public')showPublicRoute(initialRoute);

function backup(){const data=member?.state();if(!data){notify('백업할 내 기록이 없어요.');return;}const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='lovetree-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
function setEditorMode(mode){
 if(uploads.busy){notify('파일 전송을 마치거나 취소한 뒤 작업을 바꿔 주세요.');return;}
 if(formDirty()&&!confirm('현재 입력을 비우고 작업을 바꿀까요?'))return;
 uploads.reset();
 const c=window.LT41,m=c?.tree.moments.find(moment=>moment.id===c.momentId);
 if(mode!=='new'&&!m){notify('먼저 순간을 선택해 주세요.');return;}
 editorMode=mode;
 $('editor-title').textContent=mode==='new'?'새 트리 만들기':mode==='add'?'순간 추가':'순간 수정';
 const form=$('moment-form');form.reset();
 $('subject-label').hidden=mode!=='new';form.elements.subject.required=mode==='new';$('relation-label').hidden=mode!=='add';
 for(const name of ['title','note','emotion','date','url','relation'])form.elements[name].value=mode==='edit'?m[name]||'':name==='emotion'?'설렘':name==='date'?new Date().toISOString().slice(0,10):'';
 const parent=mode==='edit'&&m.parentId?c.tree.moments.find(moment=>moment.id===m.parentId):null;
 $('editor-context').textContent=mode==='new'?'새 트리의 첫 순간입니다. 좋아하는 대상을 먼저 적어 주세요.':mode==='add'?`새 순간 추가 · ${m.title}에서 이어집니다.`:parent?`수정할 순간 · ${m.title} · 현재 이전 순간: ${parent.title}`:`수정할 순간 · ${m.title} · 트리의 시작 순간`;
 $('form-error').textContent='';$('moment-management').hidden=mode!=='edit';
 const reparenting=mode==='edit'&&m.parentId!==null;
 $('parent-management').hidden=!reparenting;$('parent-current').textContent=parent?`현재 이전 순간 · ${parent.title}`:'';
 $('parent-target').replaceChildren();
 if(reparenting){for(const other of parentCandidates(c.tree,m.id)){const o=document.createElement('option');o.value=other.id;o.textContent=other.title;$('parent-target').append(o);}$('parent-target').value=m.parentId;$('parent-relation').value=m.relation||'';}else $('parent-relation').value='';
 $('related-target').replaceChildren();for(const other of c?.tree.moments||[]){if(other.id===m?.id)continue;const o=document.createElement('option');o.value=other.id;o.textContent=(m?.links?.includes(other.id)?'연결됨 · ':'')+other.title;$('related-target').append(o);}
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.mode===mode)));
 updateMediaPreview();updateQuickEntryHint();formBaseline=new URLSearchParams(new FormData(form)).toString();parentBaseline=parentValue();
}
function openEditor(requestedMode){if(source!=='server'||!member?.snapshot().owned){notify('로그인한 뒤 내 기록을 먼저 불러와 주세요.');panel('records');return;}if(!member.snapshot().writable){notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');panel('records');return;}const mode=['new','add','edit'].includes(requestedMode)?requestedMode:window.LT41?'add':'new';setEditorMode(mode);panel('editor');queueMicrotask(()=>$('moment-form').elements[mode==='new'?'subject':'note'].focus());}
function updateTreeCoverHint(){const c=window.LT41,selected=c?.tree.moments.find(m=>m.id===$('tree-cover').value);if(!selected){$('tree-cover-hint').textContent='표지를 고르지 않으면 기존 금테 장식 표지를 사용합니다.';return;}const media=LTMedia.describe(selected.url||'');$('tree-cover-hint').textContent=media.kind==='photo'?`“${selected.title}”의 사진을 표지로 사용합니다.`:`“${selected.title}”을 표지 순간으로 표시하고 금테 장식 표지를 사용합니다.`;}
function openTreeManager(){if(source!=='server'||!member?.snapshot().owned||!member.snapshot().writable||!window.LT41){notify('내 서버 기록을 불러온 뒤 책 정보를 관리해 주세요.');return;}const tree=window.LT41.tree,form=$('tree-form');form.elements.title.value=tree.title;form.elements.subject.value=tree.subject;$('tree-cover').replaceChildren();const fallback=document.createElement('option');fallback.value='';fallback.textContent='기본 금테 장식 표지';$('tree-cover').append(fallback);for(const moment of tree.moments){const option=document.createElement('option'),media=LTMedia.describe(moment.url||'');option.value=moment.id;option.textContent=`${moment.title} · ${media.kind==='photo'?'사진':media.kind==='video'?'영상':media.kind==='youtube'?'YouTube':media.kind==='link'?'링크':'기록'}`;$('tree-cover').append(option);}$('tree-cover').value=tree.coverMomentId||'';$('tree-form-error').textContent='';updateTreeCoverHint();treeBaseline=new URLSearchParams(new FormData(form)).toString();panel('tree-manager');queueMicrotask(()=>form.elements.title.focus());}
$('manage-tree').onclick=openTreeManager;$('tree-cover').onchange=updateTreeCoverHint;$('tree-form').onsubmit=e=>{e.preventDefault();try{member.apply('editTree',Object.fromEntries(new FormData(e.target)),stateSelection());treeBaseline=new URLSearchParams(new FormData(e.target)).toString();$('tree-manager').close();notify('책 정보를 서버에 저장하고 있어요.');}catch(error){$('tree-form-error').textContent=error.message;}};$('tree-delete').onclick=()=>{const tree=window.LT41?.tree;if(!tree||!confirm(`“${tree.title}”과 ${tree.moments.length}개 순간을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))return;try{member.apply('deleteTree',{},stateSelection());treeBaseline='';$('tree-manager').close();notify('트리를 삭제하고 서버에 반영하고 있어요.');}catch(error){$('tree-form-error').textContent=error.message;}};$('tree-manager').addEventListener('cancel',e=>{if(treeDirty()&&!confirm('책 정보 변경을 버리고 닫을까요?'))e.preventDefault();});
$('write-menu').onclick=()=>openEditor(current==='track32-bookshelf.html'?'new':undefined);document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setEditorMode(b.dataset.mode));
function updateMediaPreview(){const form=$('moment-form'),url=form.elements.url.value,info=LTMedia.describe(url);$('url-media-hint').textContent=info.kind==='none'?'사진·영상은 직접 HTTPS 링크를 사용할 수 있어요. YouTube와 일반 링크도 지원해요. 사진·영상 파일도 직접 첨부할 수 있어요.':info.kind==='invalid'?'링크 형식을 확인해 주세요.':info.label;
 $('url-media-preview').innerHTML=url?LTMedia.markup(url,form.elements.title.value):'';}
function updateQuickEntryHint(){const form=$('moment-form'),title=form.elements.title.value.trim(),note=form.elements.note.value.trim(),url=form.elements.url.value.trim();let suggested='';try{suggested=suggestMomentTitle({title,note,url});}catch{}$('quick-entry-hint').textContent=title?'입력한 제목으로 저장합니다.':suggested?`제목은 “${suggested}”(으)로 자동 정리됩니다.`:'제목·마음·링크나 첨부 중 하나만 남겨도 저장할 수 있어요.';}
for(const name of ['title','note','url'])$('moment-form').elements[name].addEventListener('input',()=>{if(name==='url'||name==='title')updateMediaPreview();updateQuickEntryHint();});
 $('moment-form').onsubmit=e=>{e.preventDefault();if(uploads.busy)return;if(parentDirty()){$('form-error').textContent='이전 순간 변경은 아래 버튼으로 먼저 저장해 주세요.';return;}try{member.apply(editorMode,Object.fromEntries(new FormData(e.target)),stateSelection());formBaseline=new URLSearchParams(new FormData(e.target)).toString();$('editor').close();if(editorMode==='new')show('track59-sketchbook.html');notify('서버에 저장하고 있어요.');}catch(error){$('form-error').textContent=error.message;}};
$('editor').addEventListener('cancel',e=>{if(uploads.busy){e.preventDefault();return;}if(formDirty()&&!confirm('작성 중인 입력을 버리고 닫을까요?'))e.preventDefault();});$('editor-cancel').onclick=()=>{if(uploads.busy){notify('파일 전송을 마치거나 취소해 주세요.');return;}if(!formDirty()||confirm('작성 중인 입력을 버리고 닫을까요?'))$('editor').close();};
$('change-parent').onclick=()=>{try{member.apply('reparent',{targetId:$('parent-target').value,relation:$('parent-relation').value},stateSelection());formBaseline=new URLSearchParams(new FormData($('moment-form'))).toString();parentBaseline=parentValue();setEditorMode('edit');notify('이전 순간을 바꾸고 서버에 저장하고 있어요.');queueMicrotask(()=>$('change-parent').focus());}catch(e){$('form-error').textContent=e.message;}};
for(const [id,action] of [['link-moment','link'],['unlink-moment','unlink']])$(id).onclick=()=>{try{member.apply(action,{targetId:$('related-target').value},stateSelection());formBaseline=new URLSearchParams(new FormData($('moment-form'))).toString();parentBaseline=parentValue();setEditorMode('edit');}catch(e){$('form-error').textContent=e.message;}};
$('delete-moment').onclick=()=>{if(!confirm('이 순간을 삭제할까요? 자식 순간은 이전 순간으로 이어지고 관련 연결은 해제됩니다.'))return;try{member.apply('delete',{},stateSelection());$('editor').close();}catch(e){$('form-error').textContent=e.message;}};
$('backup-draft').onclick=backup;addEventListener('beforeunload',e=>{if(member?.snapshot().dirty||formDirty()||treeDirty()){e.preventDefault();e.returnValue='';}});
if(shouldLoadMemberRecords(location.search,document.cookie,location.hash))startMember();
