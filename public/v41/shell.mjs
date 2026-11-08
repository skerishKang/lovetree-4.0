import {mountPrivateUpload} from './private-upload.mjs';
import {suggestMomentTitle,parentCandidates} from './domain.mjs';
import {memberLoginUrl,shouldLoadMemberRecords} from './member-entry.mjs';
import {workspaceModel} from './workspace-model.mjs';
import {createWorkspaceApi, setMemberRefreshStarted} from './api.mjs';
import {createShareApi} from './share-api.mjs';
import {mountCommunity} from './community-panel.mjs';
import {createMemberSession} from './member-session.mjs';
import {hasPendingDraft} from './sync-controller.mjs';
import {exampleTree} from './example.mjs';
import {parseSelectionRoute,memberStartupView,ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,stashPendingOwnerRoute,pendingOwnerRoute,takePendingOwnerRoute} from './selection-location.mjs';
import {applyViewAccessibility,connectionLabel,focusReturnTarget} from './view-a11y.mjs';
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS} from './header-state.mjs';
import {journeyEntry,journeySavePlan,journeyRouteHash,parseJourneyRoute,journeyRouteDecision} from './first-journey.mjs';
import {displayTreeTitle} from './tree-name.mjs';
import {screens,screenForView,viewForFile,themedViewFor} from './shell/navigation.mjs';
import {createScreens} from './shell/screens.mjs';
import {paintLoginLinks,paintThemeControls,applyTheme as applyThemeFor,toggleTheme as toggleThemeFor} from './shell/theme.mjs';
const $=id=>document.getElementById(id);
let pendingLoginIntent=readLoginIntent(location.search);
{const params=new URLSearchParams(location.search);if(params.has('intent')){params.delete('intent');const query=params.toString();history.replaceState(null,'',location.pathname+(query?'?'+query:'')+location.hash);}}
// 2026-11-08 #261108: 로그인 직전 안내 창을 없앴다. 로그아웃 상태에서 로그인이 필요한 진입점은
// 안내 창을 거치지 않고 바로 /auth/login으로 간다. 테마(lt_theme)와 의도(intent)는 주소에 유지한다.
// 의도는 next 안에 남기므로 로그인·가입 뒤 첫 여정/내 책장으로 바로 이어진다.
let pendingLoginIntentShown=pendingLoginIntent;
function startLogin(intent=''){const target=LOGIN_INTENTS.includes(intent)?intent:'';location.assign(memberLoginUrl(readTheme(localStorage),target));}
// 2026-11-07 테마 A/B(밤/정원): 공통 헤더와 첫 화면만 바꾼다. 안쪽 네 화면은 속성을 받지 않아 A로 고정된다.
// 2026-11-08 정원 2단계: 첫 화면과 첫 여정만 B를 받는다. 안쪽 네 화면은 계속 A다.
// 테마·화면 경로 계산은 shell/ 아래 모듈이 맡는다(#231 1-B). 셸은 지금 화면만 넘긴다.
function themedView(){return themedViewFor(current);}
function applyTheme(theme=readTheme(localStorage)){return applyThemeFor(current,theme);}
function toggleTheme(){return toggleThemeFor(current);}
const moreButton=$('mobile-more'),moreMenu=$('header-overflow');function closeMore(){moreMenu.classList.remove('is-open');moreButton.setAttribute('aria-expanded','false');}moreButton.addEventListener('click',()=>{const open=moreMenu.classList.toggle('is-open');moreButton.setAttribute('aria-expanded',String(open));});moreMenu.addEventListener('click',event=>{if(event.target.closest('button'))closeMore();});document.addEventListener('click',event=>{if(!moreMenu.contains(event.target)&&event.target!==moreButton)closeMore();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&moreMenu.classList.contains('is-open')){closeMore();moreButton.focus();}});document.addEventListener('keydown',event=>{const c=$('community-panel');if(event.key==='Escape'&&c.open&&![...document.querySelectorAll('dialog[open]')].some(d=>d!==c&&d.matches(':modal')))c.close();});
const initialRoute=parseSelectionRoute(location.hash);
let model=null,current=screenForView(initialRoute.view)[1],source='example',loadGeneration=0,toastTimer,previousDirty=false,member=null,editorMode='add',formBaseline='',parentBaseline='',treeBaseline='',handledHash=null,activeShareId=null,sharePreviewKey='',sharePreviewToken='',journeyReturn='src064-orbit.html',journeyStep=0,journeySaved=false,journeyRouteOpened=false;
setMemberRefreshStarted(false);
const shareApi=createShareApi();
const accountApi=createWorkspaceApi();
addEventListener('lovetree-auth-required',()=>{if(member?.snapshot().owned){$('account-entry').textContent='로그인';$('account-entry').hidden=false;$('account-avatar').hidden=true;closeAccountMenu();$('record-feedback').textContent='로그인 확인이 필요해요. 다시 로그인해 주세요.';notify('로그인 확인이 필요해요. 다시 로그인해 주세요.');}});
window.LT41=null;
const uploads=mountPrivateUpload({form:$('moment-form'),assets:$('account-assets'),getSubject:()=>source==='server'&&member?.snapshot().writable?member.snapshot().subject:null,getState:()=>member?.state(),onChange:()=>{updateMediaPreview();updateQuickEntryHint();},onUseAsset:()=>usePrivateAsset()});
function notify(text){$('record-feedback').textContent=text;$('toast').textContent=text;$('toast').hidden=$('records').open;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
const PENDING_NEW='lovetree.v41.pending-new';
// 2026-11-07 계정 표시: 로그인 상태는 첫 글자 동그라미 + 작은 메뉴, 로그아웃 상태는 기존 로그인 알약.
let accountEmail='';
function closeAccountMenu(){const pop=$('account-popover');if(!pop||pop.hidden)return;pop.hidden=true;$('account-avatar').setAttribute('aria-expanded','false');}
function renderAccount(){const owned=!!member?.snapshot().owned,view=accountPresentation({owned,email:accountEmail,subject:member?.snapshot().subject||''});
 const login=$('account-entry'),avatar=$('account-avatar');
 if(view.mode==='login'){login.hidden=false;login.textContent='로그인';login.removeAttribute('aria-label');avatar.hidden=true;avatar.textContent='';closeAccountMenu();return;}
 login.hidden=true;avatar.hidden=false;avatar.textContent=view.initial;avatar.setAttribute('aria-label',view.ariaLabel);avatar.title=view.title;
 $('account-email').textContent=view.label;}
function openAccountMenu(){const owned=!!member?.snapshot().owned;if(!owned){return;}const pop=$('account-popover');pop.hidden=false;$('account-avatar').setAttribute('aria-expanded','true');if(!accountEmail)void loadAccountEmail();}
async function loadAccountEmail(){const answer=await accountApi.account().catch(()=>null);if(answer?.ok&&answer.email){accountEmail=answer.email;renderAccount();}}
function updateAccountControls(){const owned=!!member?.snapshot().owned;document.querySelectorAll('[data-guest-login]').forEach(x=>x.hidden=owned);$('server').hidden=!owned;$('logout').hidden=!owned;$('account-settings-open').hidden=!owned;renderAccount();}
function panel(id){if(id==='records')updateAccountControls();const target=$(id);if(!target.open)target.showModal();}
function openLoginStart(intent='first'){startLogin(intent==='first'?'':intent);}
// 안내 창이 없어졌으니 close/cancel 복귀 연결도 필요 없다.
// 2026-11-08 #202 후속: 셸 대화상자(순간 편집기·보관 파일) Tab을 내부에서 순환시킨다.
// 보관 파일이 편집기 위에 열려 있으면 보관 파일 안에서만 순환한다.
const SHELL_FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
function shellFocusables(root){return [...root.querySelectorAll(SHELL_FOCUSABLE)].filter(el=>!el.disabled&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');}
function trapShellTab(event){if(event.key!=='Tab')return;const assets=$('account-assets'),editor=$('editor');const dialog=assets?.open?assets:editor?.open?editor:null;if(!dialog)return;const list=shellFocusables(dialog);if(!list.length){event.preventDefault();return;}const at=list.indexOf(document.activeElement);if(event.shiftKey){if(at<=0){event.preventDefault();list[list.length-1].focus();}}else if(at<0||at===list.length-1){event.preventDefault();list[0].focus();}}
document.addEventListener('keydown',trapShellTab,true);
let assetsOpener=null;
$('account-assets').addEventListener('cancel',event=>{event.preventDefault();$('account-assets').close();const target=focusReturnTarget(assetsOpener,$('account-avatar'));setTimeout(()=>target?.focus?.(),0);});
function ownerPosition(){const c=window.LT41;return c?{treeId:c.tree.id,momentId:c.momentId,view:viewForFile(current)}:null;}
function writeLocation(mode='push'){
 const position=ownerPosition(),owned=source==='server'&&member?.snapshot().owned&&position;
 const hash=source==='share'&&activeShareId?`#share/${activeShareId}/${viewForFile(current)}`:owned?ownerSelectionRoute(position):'#'+viewForFile(current);
 if(location.hash!==hash)history[mode==='replace'?'replaceState':'pushState'](null,'',hash);
 handledHash=hash;
 if(owned)rememberAccountPosition(localStorage,member.snapshot().subject,position);
}
function viewContext(){const c=window.LT41;$('view-context').hidden=!c||current==='src064-orbit.html';if(!c)return;$('context-tree').textContent=displayTreeTitle(c.tree.title);$('context-kind').textContent=source==='example'?'예시':source==='file'?'파일':source==='share'?'공유 감상':'';$('context-kind').hidden=source==='server';$('manage-tree').hidden=source!=='server'||!member?.snapshot().owned||!member.snapshot().writable;}
// 연결 보기는 헤더에서 뺐다(2026-11-07). 관계 지도 화면의 도구 줄(전체 보기·사용법과 같은 자리·모양)에
// 같은 다이얼로그를 여는 버튼을 붙인다. 원본 화면 파일은 건드리지 않는다.
function mountConnectionTool(doc){
 const host=doc.querySelector('.top-actions');if(!host)return;
 let button=doc.getElementById('connection-tool');
 if(!button){button=doc.createElement('button');button.id='connection-tool';button.type='button';button.className='pill';button.setAttribute('aria-haspopup','dialog');host.append(button);}
 button.onclick=()=>panel('connection-panel');
 const count=$('connection-count')?.textContent||'0';
 button.textContent=connectionLabel(count);button.removeAttribute('aria-label');
}function setConnectionCount(n){const b=$('connection-count');if(b)b.textContent=String(n);const t=$('connection-tool');if(t){t.textContent=connectionLabel(n);t.removeAttribute('aria-label');}const h=$('connection-menu');if(h)h.textContent=connectionLabel(n);}
function links(){viewContext();const c=window.LT41;$('connections').replaceChildren();if(!c){setConnectionCount(0);$('selection-label').textContent='트리를 먼저 불러오세요.';return;}
 const moment=c.tree.moments.find(m=>m.id===c.momentId);$('selection-label').textContent=moment?.title||'';
 const edges=c.tree.edges.filter(e=>e.from===c.momentId||e.to===c.momentId);setConnectionCount(edges.length);
 if(!edges.length){const p=document.createElement('p');p.textContent='아직 연결된 다른 순간이 없어요.';$('connections').append(p);}
 for(const e of edges){const id=e.from===c.momentId?e.to:e.from,m=c.tree.moments.find(m=>m.id===id),b=document.createElement('button'),kind=document.createElement('small'),title=document.createElement('span');kind.textContent=e.kind==='related'?'관련 순간':e.from===c.momentId?'다음 순간':'이전 순간';const name=document.createElement('strong'),reason=document.createElement('span');name.textContent=m.title;reason.className='connection-reason';reason.textContent=e.reason||(e.kind==='related'?'함께 기억할 관련 순간으로 연결했어요.':'연결 이유를 아직 남기지 않았어요.');title.append(name,reason);b.append(kind,title);b.onclick=()=>{c.momentId=id;$('connection-panel').close();show(current,false);writeLocation();};$('connections').append(b);}}
// #213 3번: 첫 트리 안내 말풍선. 한 번만 보여 주고, 닫으면 기억한다(저장소가 막히면 다시 보여 준다).
let tipsReturnFocus=null;
function closeTreeTips(remember=true){
  const box=$('tree-tips');if(!box||box.hidden)return;
  box.hidden=true;if(remember)writeTipsSeen(localStorage);
  const back=tipsReturnFocus||$('tree-views')?.querySelector('button')||$('mobile-more');tipsReturnFocus=null;
  if(back&&document.contains(back)&&!back.hidden)back.focus();
}
function showTreeTips(){
  const box=$('tree-tips');if(!box||!box.hidden)return;
  const list=$('tree-tips-list');
  if(list&&!list.children.length)for(const tip of FIRST_TREE_TIPS){const li=document.createElement('li');const strong=document.createElement('strong');const span=document.createElement('span');strong.textContent=tip.title;span.textContent=tip.body;li.append(strong,span);list.append(li);}
  if(!tipsReturnFocus)tipsReturnFocus=document.activeElement;
  box.hidden=false;
  $('tree-tips-close')?.focus();
}
function syncTreeTips(){
  const wanted=tipsWanted({owned:!!member?.snapshot().owned,treeCount:model?.trees?.length||0,seen:readTipsSeen(localStorage)});
  if(wanted)showTreeTips();else closeTreeTips(false);
}
$('tree-tips-close')?.addEventListener('click',()=>closeTreeTips());
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const box=$('tree-tips');if(!box||box.hidden)return;
  if([...document.querySelectorAll('dialog[open]')].some(d=>d.matches(':modal')))return;
  event.preventDefault();closeTreeTips();
});
function flowNavigation(){
  const owned=!!member?.snapshot().owned;
  const reading=!!window.LT41&&['track59-sketchbook.html','track58-pinboard.html','track56-network.html'].includes(current);
  const publicReading=source==='share';
  // 트리 보기 탭은 로그인한 내 트리에서만 연다. 로그아웃이면 예시가 열려 있어도 숨긴다.
  // #213 3번: 상태(out·in-empty·in-trees·share)마다 보이는 것만 남기고 나머지는 숨긴다(비활성 표시 없음).
  const parts=headerPartsFor({owned,treeCount:model?.trees?.length||0,publicReading});
  const showTreeViews=parts.treeViews&&treeViewsVisible({owned,publicReading});
  $('tree-views').hidden=!showTreeViews;for(const b of $('tree-views').querySelectorAll('button')){b.disabled=false;b.title='';}
  $('tree-views').setAttribute('aria-label',window.LT41?.tree.title?displayTreeTitle(window.LT41.tree.title)+' 보기':'이 트리 보기');
  for(const b of document.querySelectorAll('nav>button'))b.hidden=publicReading;
  // 트리 선택은 뒤쪽 탭 묶음 바로 앞에 있고, 로그인 상태에서만 "트리: <이름> ▾"로 보여 준다.
  // 로그아웃이면 "트리 고르기", 브라우저에만 남은 미저장 기록이 있으면 "저장 안 된 기록"이다.
  const pendingDraft=hasPendingDraft(sessionStorage,member?.snapshot().subject||null);
  $('record-menu').hidden=!parts.treePicker||publicReading;
  $('source-label').textContent=treePickerText({owned,treeTitle:displayTreeTitle(window.LT41?.tree.title||''),pendingDraft});
  $('record-menu').title=owned?(window.LT41?'다른 트리를 고릅니다.':'열어볼 트리를 고릅니다.'):(pendingDraft?'로그인하면 저장하지 못한 기록을 복원합니다.':'로그인하면 내 트리를 고를 수 있습니다.');
  $('write-menu').hidden=!parts.write||publicReading;$('share-menu').hidden=!parts.share||source!=='server'||!window.LT41;
  if(!member?.snapshot().dirty)$('write-menu').textContent=writeMenuLabel({owned,dirty:false,reading,hasTree:!!window.LT41});
  $('write-menu').title=source==='server'?(reading?'선택한 순간에서 이어지는 새 순간을 기록합니다.':'새 트리의 첫 순간을 기록합니다.'):'로그인한 계정에 내 트리를 만듭니다. 예시에는 저장하지 않아요.';
  syncTreeTips();
  revealCurrentTab();
}
// 2026-11-07: 390·360에서 탭 7개가 폭을 넘는다. 탭 줄은 가로 스크롤이고, 화면을 바꿀 때 현재 탭을 가운데로 당겨 보이게 한다.
// 넘치는 쪽 끝에만 페이드를 켜서 잘린 것이 아니라 더 있다는 신호를 준다. 데스크톱(넓은 폭)은 스크롤이 없어 아무 일도 하지 않는다.
const navBar=document.querySelector('.app-header nav');
const narrowNav=()=>matchMedia('(max-width:780px)').matches;
function updateNavFade(){
 if(!navBar)return;
 const overflowing=navBar.scrollWidth-navBar.clientWidth>1;
 const atStart=navBar.scrollLeft<=1;
 const atEnd=navBar.scrollLeft>=navBar.scrollWidth-navBar.clientWidth-1;
 navBar.classList.toggle('fade-start',overflowing&&!atStart);
 navBar.classList.toggle('fade-end',overflowing&&!atEnd);
}
function revealCurrentTab(){
 if(!navBar||!narrowNav()){updateNavFade();return;}
 const active=navBar.querySelector('[aria-current="true"]')||navBar.querySelector('#record-menu');
 if(active&&active.getClientRects().length){
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  active.scrollIntoView({inline:'center',block:'nearest',behavior:reduce?'auto':'smooth'});
 }
 updateNavFade();
}
if(navBar){navBar.addEventListener('scroll',updateNavFade,{passive:true});addEventListener('resize',()=>revealCurrentTab());}
// 화면 전환·iframe 두 장 교대는 shell/screens.mjs가 맡는다(#231 1-B). 셸은 지금 화면과 나머지 일을 넘긴다.
const shellScreens=createScreens({
  $,
  screens,
  getCurrent:()=>current,
  setCurrent:file=>{current=file;},
  getSource:()=>source,
  hasTree:()=>!!window.LT41,
  flowNavigation,
  applyTheme,
  writeLocation,
  links,
  onFrameReady:frame=>{
    const d=frame.contentDocument;if(!d)return;
    mountConnectionTool(d);applyViewAccessibility(d);
    d.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;let file;if(b.matches('[data-action="tree"],[data-menu="tree"]'))file='track32-bookshelf.html';if(b.matches('#storyBook,[data-menu="book"]'))file='track59-sketchbook.html';if(current==='track56-network.html'&&b.id==='openMoment')file='track59-sketchbook.html';if(file){e.preventDefault();e.stopImmediatePropagation();show(file);}},true);
  }
});
function frames(){return shellScreens.frames();}
function hideFrames(){return shellScreens.hideFrames();}
function showInFrame(url,title){return shellScreens.showInFrame(url,title);}
function show(file,write=true){return shellScreens.show(file,write);}
function frameLoaded(frame){return shellScreens.frameLoaded(frame);}
function choose(id,momentId){const tree=model.trees.find(t=>t.id===id);window.LT41=tree?{tree,trees:model.trees,source,momentId:tree.moments.find(m=>m.id===momentId)?.id||tree.moments.find(m=>m.parentId===null)?.id||tree.moments[0]?.id,}:null;
 if(tree||current==='src064-orbit.html')show(current,false);else{flowNavigation();document.body.classList.remove('home-screen');hideFrames();$('empty').hidden=false;links();}}
function load(input,kind,selection={},fallback={}){model=kind==='example'?{trees:[exampleTree]}:workspaceModel(input);source=kind;if(kind!=='share'){activeShareId=null;$('empty').querySelector('h1').textContent='다시 펼칠 순간을 기다리고 있어요.';$('empty').querySelector('p').textContent='예시를 둘러보거나 로그인한 계정의 기록을 불러오세요.';$('empty-sample').hidden=false;$('empty-records').hidden=false;}document.body.dataset.recordSource=kind;document.body.dataset.member=member?.snapshot().owned?'in':'out';document.body.dataset.treeCount=String(model?.trees?.length||0);$('source-label').textContent='트리 선택';$('record-description').textContent=kind==='example'?'실제 회원 데이터와 무관한 예시입니다.':kind==='server'?'로그인한 계정의 서버 기록 · 작성·수정 후 자동 저장':kind==='share'?'소유자가 명시적으로 공개한 트리 · 감상 전용':'선택한 파일을 메모리에서 읽는 중입니다.';$('trees').replaceChildren();for(const t of model.trees){const o=document.createElement('option');o.value=t.id;o.textContent=displayTreeTitle(t.title);$('trees').append(o);}$('trees').disabled=!model.trees.length;const resolved=resolveAccountPosition(model.trees,selection,fallback),chosen=model.trees.find(t=>t.id===resolved.position.treeId);$('trees').value=chosen?.id||'';choose(chosen?.id,resolved.position.momentId);return resolved;}
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
 $('save-feedback').hidden=!failed;$('save-message').textContent=failed?(status.phase==='login'?'로그인이 만료되어 서버에 저장하지 못했어요. 새 창에서 로그인한 뒤 이 탭을 새로고침하면 입력을 복원합니다.':status.detail||'서버에 저장하지 못했어요. 이 화면을 닫지 말고 다시 저장해 주세요.'):'';$('save-actions').replaceChildren();
 if(failed){for(const a of status.actions.filter(a=>['retry','pull','force','login'].includes(a.name))){const b=document.createElement('button');b.textContent=a.name==='login'?'새 창에서 로그인':a.label;b.onclick=async()=>{if(a.name==='login'){window.open(memberLoginUrl(readTheme(localStorage)),'_blank','noopener,noreferrer');return;}if(['pull','force'].includes(a.name)&&!confirm(a.name==='pull'?'미저장 변경을 버리고 서버 기록을 불러올까요?':'서버의 최신 기록으로 현재 입력을 덮어쓸까요? 다른 창의 변경이 사라질 수 있습니다.'))return;await member?.act(a.name);};$('save-actions').append(b);}const b=document.createElement('button');b.textContent='현재 기록 백업';b.onclick=backup;$('save-actions').append(b);}
 if(status.phase==='checking')notify('내 기록을 불러오고 있어요.');
 else if(status.phase==='synced')notify(status.writable?(previousDirty?'서버에 저장됐어요.':'내 기록을 불러왔어요.'):'기록을 읽었어요. 서버 편집 연결은 아직 준비되지 않았어요.');
 else if(status.phase==='login'&&!status.dirty)notify('로그인이 필요해요.');
 else if(!status.dirty&&status.phase==='offline')notify(status.detail||'내 기록을 불러오지 못했어요.');
 $('write-menu').textContent=status.dirty?'미저장 기록' :'순간 남기기';$('empty-records').textContent=status.writable?'첫 트리 만들기':'내 기록 불러오기';previousDirty=status.dirty;renderAccount();flowNavigation();document.body.dataset.member=member?.snapshot().owned?'in':'out';document.body.dataset.treeCount=String(model?.trees?.length||0);
}
async function startMember(){setMemberRefreshStarted(true);if(!leaveMember())return;const startup=parseSelectionRoute(location.hash);if(startup.scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);++loadGeneration;const generation=loadGeneration;clear();
 const api=createWorkspaceApi({fetchImpl:(url,init)=>fetch(init?.method==='GET'&&url==='/api/workspace'?'/api/workspace?features=bound-writes':url,init)});
 let initialized=false,startupNotice='',session;
 session=createMemberSession({api,onState:(state,selection)=>{if(generation!==loadGeneration)return;const snapshot=session.snapshot(),saved=accountPosition(localStorage,snapshot.subject)||{},active=parseSelectionRoute(location.hash),pending=!initialized&&active.scope!=='owner'?pendingOwnerRoute(sessionStorage):null,route=active.scope==='owner'?active:pending;let requested=selection||stateSelection();
   if(!initialized){if(route)requested=route;else if(!selection)requested=saved;const view=memberStartupView(active,route,saved,viewForFile(current));current=screenForView(view)[1];}
   const resolved=load({revision:0,state},'server',requested,saved);initialized=true;
   if(snapshot.owned&&resolved.position.treeId){if(viewForFile(current)!=='home')writeLocation('replace');takePendingOwnerRoute(sessionStorage);if(route?.scope==='owner'&&resolved.treeMissing)startupNotice='이 주소의 기록을 현재 계정에서 찾을 수 없어 최근 위치를 열었어요.';else if(route?.scope==='owner'&&resolved.momentMissing)startupNotice='이 주소의 순간을 찾을 수 없어 트리의 시작 순간을 열었어요.';}
 },onStatus:status=>{if(generation===loadGeneration)memberStatus(status);},navigate:url=>{if(url.startsWith('/auth/login')&&parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);location.assign(url.startsWith('/auth/login')?memberLoginUrl(readTheme(localStorage)):url==='#start'?'#home':url);}});member=session;await session.start();if(generation===loadGeneration&&session.snapshot().owned){if($('records').open)$('records').close();updateAccountControls();if(session.snapshot().writable&&sessionStorage.getItem(PENDING_NEW)==='1'){sessionStorage.removeItem(PENDING_NEW);openEditor('new');}if(pendingLoginIntent){const intent=pendingLoginIntent;pendingLoginIntent='';if(intent==='new-tree'&&session.snapshot().writable)openEditor('new');else if(intent==='shelf')show('track32-bookshelf.html');}if(startupNotice)notify(startupNotice);}
 if(generation===loadGeneration){const startupJourney=parseJourneyRoute(location.hash);if(startupJourney){if(session.snapshot().owned&&session.snapshot().writable)openFirstJourney({step:startupJourney.step,route:true});else{history.replaceState(null,'','#home');handledHash='#home';}}}
}
function sample(selection={},view){if(!leaveMember())return;++loadGeneration;if(view)current=view;load(null,'example',selection);if(view)writeLocation();$('save-feedback').hidden=true;$('records').close();}
$('account-entry').onclick=e=>{if(member?.snapshot().owned){e.preventDefault();openAccountMenu();}else if(parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);};$('account-avatar').onclick=e=>{e.stopPropagation();if($('account-popover').hidden)openAccountMenu();else closeAccountMenu();};$('account-records').onclick=()=>{closeAccountMenu();panel('records');};$('account-backup').onclick=()=>{closeAccountMenu();backup();};$('account-assets-open').onclick=()=>{closeAccountMenu();openAssets($('account-avatar'));};$('editor-assets-open').onclick=()=>openAssets($('editor-assets-open'));$('account-theme').onclick=()=>{toggleTheme();closeAccountMenu();};$('account-logout').onclick=async()=>{closeAccountMenu();$('logout').click();};document.addEventListener('click',e=>{if(!e.target.closest('.account-slot'))closeAccountMenu();});document.addEventListener('keydown',e=>{
 if(e.key!=='Escape')return;
 const pop=$('account-popover');
 if(pop&&!pop.hidden){closeAccountMenu();$('account-avatar').focus();}
});$('record-menu').onclick=()=>{$('record-feedback').textContent='';panel('records');};$('empty-records').onclick=()=>member?.snapshot().writable?openEditor():panel('records');$('empty-sample').onclick=sample;
$('sample').onclick=sample;$('clear').onclick=()=>{if(!leaveMember())return;++loadGeneration;clear();$('save-feedback').hidden=true;$('file').value='';$('records').close();};
$('server').onclick=startMember;
const ACCOUNT_DELETE_PHRASE='탈퇴합니다';
let accountExpected=null;
function accountConfirmMatches(){
 const typed=$('account-confirm').value.trim();
 if(!accountExpected||!typed)return false;
 return accountExpected.kind==='email'?typed.toLowerCase()===accountExpected.value:typed===accountExpected.value;
}
async function openAccountSettings(){
 accountExpected=null;$('account-feedback').textContent='';$('account-confirm').value='';$('account-delete').disabled=true;
 if(!member?.snapshot().owned){$('account-confirm-hint').textContent='로그인한 뒤 이용할 수 있어요.';panel('account-settings');return;}
 const answer=await accountApi.account();
 if(!answer.ok){$('account-confirm-hint').textContent='계정 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';panel('account-settings');return;}
 const byEmail=answer.confirmKind==='email';
 accountExpected=byEmail?{kind:'email',value:String(answer.email||'').trim().toLowerCase()}:{kind:'phrase',value:ACCOUNT_DELETE_PHRASE};
 $('account-confirm-label').textContent=byEmail?'계정 이메일':'확인 문구';
 $('account-confirm-hint').textContent=byEmail?'계정 이메일을 입력하세요. 일치할 때만 버튼이 열려요.':"확인을 위해 '탈퇴합니다'를 입력하세요. 그대로 일치할 때만 버튼이 열려요.";
 panel('account-settings');queueMicrotask(()=>$('account-confirm').focus());
}
$('account-settings-open').onclick=()=>{void openAccountSettings();};
$('account-confirm').oninput=()=>{$('account-delete').disabled=!accountConfirmMatches();};
$('account-form').onsubmit=async event=>{
 event.preventDefault();
 const value=$('account-confirm').value.trim();
 if(!value||!accountConfirmMatches())return;
 if(!confirm('계정을 탈퇴하면 되돌릴 수 없습니다. 계속할까요?'))return;
 const button=$('account-delete');button.disabled=true;$('account-feedback').textContent='탈퇴를 처리하고 있어요.';
 const answer=await accountApi.deleteAccount(value);
 if(!answer.ok){$('account-feedback').textContent=answer.message||'탈퇴하지 못했어요. 다시 시도해 주세요.';button.disabled=false;return;}
 try{member?.dispose?.();}catch{}
 member=null;source='example';clear();$('account-settings').close();updateAccountControls();
 notify(answer.commonAccountDeleted
  ? '러브트리 탈퇴와 함께 공통 로그인 계정과 인증 세션을 폐기했습니다.'
  : '러브트리에서 탈퇴했습니다. 다른 서비스 연결이 남아 있어 공통 계정은 유지됩니다.');
};$('logout').onclick=async()=>{if(member){await member.act('logout');if(member.snapshot().dirty)notify('미저장 기록이 있어 로그아웃하지 않았어요. 다시 저장하거나 백업해 주세요.');}else{const answer=await createWorkspaceApi().logout();notify(answer.ok?'로그아웃했습니다.':'로그아웃하지 못했어요. 다시 시도해 주세요.');}};
$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;if(!leaveMember())return;const generation=++loadGeneration;try{if(f.size>4194304)throw Error('4MiB 이하 파일만 읽습니다.');const d=JSON.parse(await f.text());if(generation!==loadGeneration)return;load(d.state?d:{revision:0,state:d},'file');$('records').close();notify('파일을 열었어요. 서버에는 저장하지 않습니다.');}catch(e){if(generation===loadGeneration)notify('불러오기 실패: '+e.message);}};
$('trees').onchange=()=>{choose($('trees').value);writeLocation();$('records').close();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(b.dataset.close==='editor'&&uploads.busy){notify('파일 전송을 마치거나 취소해 주세요.');return;}if(b.dataset.close==='editor'&&formDirty()&&!confirm('작성 중인 입력을 버리고 닫을까요?'))return;if(b.dataset.close==='tree-manager'&&treeDirty()&&!confirm('책 정보 변경을 버리고 닫을까요?'))return;$(b.dataset.close).close();});
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target!==d||['editor','tree-manager'].includes(d.id))return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
function publicProblem(answer){
 source='share';activeShareId=null;model={trees:[]};window.LT41=null;document.body.dataset.recordSource='share';flowNavigation();document.body.classList.remove('home-screen');hideFrames();$('empty').hidden=false;$('empty-sample').hidden=true;$('empty-records').hidden=true;
 const messages={share_invalid:['공유 주소를 찾을 수 없어요.','주소를 다시 확인해 주세요.'],share_not_found:['공유 주소를 찾을 수 없어요.','주소가 잘못되었거나 존재하지 않아요.'],share_revoked:['공유가 취소됐어요.','소유자가 이 공유 주소를 회수했습니다.'],share_removed:['공유된 트리가 없어졌어요.','트리가 삭제되었거나 더 이상 공개할 수 없어요.'],share_empty:['아직 공개할 순간이 없어요.','소유자가 순간을 남긴 뒤 다시 열어 주세요.'],share_forbidden:['이 공유는 볼 수 없어요.','접근 권한을 확인해 주세요.']};
 const [title,detail]=messages[answer.code]||['공유 기록을 불러오지 못했어요.',answer.code==='timeout'?'서버 응답 시간이 초과됐어요. 다시 시도해 주세요.':'잠시 뒤 다시 시도해 주세요.'];$('empty').querySelector('h1').textContent=title;$('empty').querySelector('p').textContent=detail;links();
}
async function showPublicRoute(route){if(member&&!leaveMember()){writeLocation('replace');return;}const generation=++loadGeneration;member=null;activeShareId=route.shareId;current=screenForView(['book','board','network'].includes(route.view)?route.view:'book')[1];handledHash=location.hash;$('empty').querySelector('h1').textContent='공유된 순간을 펼치고 있어요.';$('empty').querySelector('p').textContent='소유자가 공개한 트리 한 개만 확인합니다.';$('empty-sample').hidden=true;$('empty-records').hidden=true;$('view').hidden=true;$('empty').hidden=false;
 const answer=await shareApi.read(route.shareId||'');if(generation!==loadGeneration)return;if(!answer.ok){publicProblem(answer);return;}
 activeShareId=answer.share.id;const view=['book','board','network'].includes(route.view)?route.view:answer.share.view;current=screenForView(view)[1];load({revision:0,state:{version:1,trees:[answer.tree]}},'share',{treeId:answer.tree.id,momentId:answer.share.entryMomentId});activeShareId=answer.share.id;show(current,false);writeLocation('replace');notify('소유자가 명시적으로 공유한 트리입니다. 감상만 할 수 있어요.');
}
function applyBrowserLocation(){if(location.hash===handledHash)return;handledHash=location.hash;const journey=journeyRouteDecision({hash:location.hash,open:current==='first-journey.html',saved:journeySaved});if(journey.action==='goto'){gotoJourneyStep(journey.step);return;}if(journey.action==='open'){openFirstJourney({step:journey.step,route:true});return;}if(journey.action==='finished'){finishJourney();return;}if(journey.action==='leave'){leaveJourney();return;}const route=parseSelectionRoute(location.hash);if(route.scope==='public'){showPublicRoute(route);return;}current=screenForView(route.view)[1];
 if(route.scope==='owner'){if(source!=='server'||!member?.snapshot().owned){show(current,false);void startMember();return;}const saved=accountPosition(localStorage,member.snapshot().subject)||{},resolved=resolveAccountPosition(model?.trees||[],route,saved);choose(resolved.position.treeId,resolved.position.momentId);if(resolved.treeMissing||resolved.momentMissing){writeLocation('replace');notify(resolved.treeMissing?'이 주소의 기록을 현재 계정에서 찾을 수 없어 최근 위치를 열었어요.':'이 주소의 순간을 찾을 수 없어 트리의 시작 순간을 열었어요.');}else rememberAccountPosition(localStorage,member.snapshot().subject,{...resolved.position,view:route.view});return;}
 show(current,false);
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='track32-bookshelf.html'&&!member?.snapshot().owned){openLoginStart('shelf');return;}show(b.dataset.view);});
addEventListener('popstate',applyBrowserLocation);
addEventListener('hashchange',applyBrowserLocation);
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('view').contentWindow)return;if(e.data?.type==='lt41-theme'){applyTheme();paintThemeControls();}if(e.data?.type==='lt41-journey-step'){noteJourneyStep(e.data.step);return;}if(e.data?.type==='lt41-journey-save'){saveFirstJourney(e.data.draft);return;}if(e.data?.type==='lt41-journey-open-book'){openJourneyBook(e.data);return;}if(e.data?.type==='lt41-journey-close'){closeFirstJourney();return;}if(e.data?.type==='lt41-media-metadata'&&source==='server'&&member?.snapshot().owned){const tree=window.LT41?.tree,moment=tree?.moments.find(m=>m.id===e.data.momentId&&m.url===e.data.url);if(moment)try{member.apply('cacheMediaMetadata',{url:e.data.url,mediaMetadata:e.data.mediaMetadata},{treeId:tree.id,momentId:moment.id})}catch{}}if(e.data?.type==='lt41-navigate'){if(e.data.view==='track32-bookshelf.html'&&!member?.snapshot().owned){openLoginStart('shelf');return;}show(e.data.view);}if(e.data?.type==='lt41-select'&&window.LT41?.tree.moments.some(m=>m.id===e.data.id)){window.LT41.momentId=e.data.id;links();writeLocation();}if(e.data?.type==='lt41-write')openEditor(e.data.mode,e.data.parentId);if(e.data?.type==='lt41-open-book'&&model?.trees.some(t=>t.id===e.data.treeId&&t.moments.some(m=>m.id===e.data.id))){current='track59-sketchbook.html';choose(e.data.treeId,e.data.id);writeLocation();}if(e.data?.type==='lt41-start'){openLoginStart('first');return;}if(e.data?.type==='lt41-account'){if(member?.snapshot().owned)openAccountMenu();else $('account-entry').click();}if(e.data?.type==='lt41-community')$('community-menu').click();if(e.data?.type==='lt41-example'&&exampleTree.moments.some(m=>m.id===e.data.momentId)&&['track59-sketchbook.html','track58-pinboard.html'].includes(e.data.view)){sample({treeId:exampleTree.id,momentId:e.data.momentId},e.data.view);}if(e.data?.type==='lt-selection'||e.data?.type==='lt41-choose'){links();writeLocation();}});function sharePayload(){return {treeId:window.LT41?.tree.id||'',entryMomentId:$('share-moment').value,view:$('share-view').value};}
function shareFailure(answer){return answer.status===401?'로그인이 필요해요.':answer.code==='timeout'?'서버 응답 시간이 초과됐어요.':answer.message||'공유 요청을 처리하지 못했어요.';}
function renderShareList(shares=[]){
 const host=$('share-list'),treeId=window.LT41?.tree.id;host.replaceChildren();const selected=shares.filter(item=>item.treeId===treeId);
 if(!selected.length){const p=document.createElement('p');p.textContent='아직 만든 공유 주소가 없어요.';host.append(p);return;}
 for(const item of selected){const row=document.createElement('div');row.className='share-item'+(item.status==='revoked'?' share-revoked':'');const text=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=item.status==='active'?(item.discoverable?'공유 중 · 발견 공개':'공유 중 · 주소로만 공개'):'공유 취소됨';small.textContent=(item.view==='board'?'기억 보드':item.view==='network'?'관계 지도':'기억책')+' · '+new Date(item.createdAt).toLocaleString('ko-KR');text.append(strong,small);row.append(text);
   if(item.status==='active'){const actions=document.createElement('div');actions.className='share-item-actions';const discover=document.createElement('button');discover.type='button';discover.textContent=item.discoverable?'발견에서 내리기':'발견에 공개';discover.onclick=async()=>{const next=!item.discoverable;if(next&&!confirm('이 트리를 누구나 검색할 수 있는 발견 목록에 공개할까요? 공유 주소만 만든 상태와 달리 제목·대상·공개 순간이 목록에 나타납니다.'))return;discover.disabled=true;const answer=await shareApi.setDiscoverable(item.id,next);if(!answer.ok){$('share-feedback').textContent=shareFailure(answer);discover.disabled=false;return;}$('share-feedback').textContent=next?'발견 목록 공개를 켰어요.':'발견 목록에서 내렸어요. 공유 주소는 계속 사용할 수 있어요.';await loadShareList();};const revoke=document.createElement('button');revoke.type='button';revoke.textContent='공유 취소';revoke.onclick=async()=>{if(!confirm('이 공유 주소를 지금 회수할까요? 발견 목록에서도 즉시 내려갑니다.'))return;revoke.disabled=true;const answer=await shareApi.revoke(item.id);if(!answer.ok){$('share-feedback').textContent=shareFailure(answer);revoke.disabled=false;return;}$('share-feedback').textContent='공유를 취소했어요. 새 요청은 즉시 차단됩니다.';if($('share-url').dataset.shareId===item.id)$('share-created').hidden=true;await loadShareList();};actions.append(discover,revoke);row.append(actions);}
   host.append(row);
 }
}
async function loadShareList(){const answer=await shareApi.list();if(answer.ok)renderShareList(answer.shares);else $('share-list').textContent=shareFailure(answer);}
function invalidateSharePreview(){sharePreviewKey='';sharePreviewToken='';$('share-create').disabled=true;$('share-preview-result').hidden=true;$('share-feedback').textContent='선택이 바뀌었어요. 공개 내용을 다시 미리 봐 주세요.';}
async function openSharePanel(){
 if(source!=='server'||!member?.snapshot().owned||!window.LT41){notify('내 서버 기록에서 공유할 트리를 먼저 열어 주세요.');return;}
 if(member.snapshot().dirty){notify('서버 저장이 끝난 뒤 공유 내용을 확인해 주세요.');return;}
 const tree=window.LT41.tree;$('share-moment').replaceChildren();for(const moment of tree.moments){const o=document.createElement('option');o.value=moment.id;o.textContent=moment.title;$('share-moment').append(o);}$('share-moment').value=window.LT41.momentId;$('share-view').value=['book','board','network'].includes(viewForFile(current))?viewForFile(current):'book';sharePreviewKey='';sharePreviewToken='';$('share-create').disabled=true;$('share-preview-result').hidden=true;$('share-created').hidden=true;$('share-feedback').textContent='';panel('share-panel');void loadShareList();
}
$('share-menu').onclick=openSharePanel;$('share-moment').onchange=invalidateSharePreview;$('share-view').onchange=invalidateSharePreview;
$('share-preview').onclick=async()=>{const button=$('share-preview'),payload=sharePayload();button.disabled=true;$('share-feedback').textContent='서버에서 공개 범위를 확인하고 있어요.';const answer=await shareApi.preview(payload);button.disabled=false;if(!answer.ok){$('share-feedback').textContent=shareFailure(answer);return;}sharePreviewKey=JSON.stringify(payload);sharePreviewToken=answer.preview.previewToken;$('share-preview-summary').textContent=`“${displayTreeTitle(answer.preview.tree.title)}”의 ${answer.preview.tree.moments.length}개 순간을 공개합니다.${answer.preview.omittedPrivateMedia?' 비공개 업로드 '+answer.preview.omittedPrivateMedia+'개는 제외됩니다.':''}`;$('share-preview-moments').replaceChildren();for(const moment of answer.preview.tree.moments){const li=document.createElement('li');li.textContent=`${moment.title} · ${moment.emotion} · ${moment.date}`; $('share-preview-moments').append(li);}$('share-preview-result').hidden=false;$('share-create').disabled=false;$('share-feedback').textContent='미리보기를 확인한 뒤 링크를 만들 수 있어요.';};
$('share-create').onclick=async()=>{const payload=sharePayload();if(sharePreviewKey!==JSON.stringify(payload)){invalidateSharePreview();return;}const button=$('share-create');button.disabled=true;$('share-feedback').textContent='공유 주소를 만들고 있어요.';const answer=await shareApi.create({...payload,previewToken:sharePreviewToken});if(!answer.ok){$('share-feedback').textContent=shareFailure(answer);button.disabled=false;return;}const shareBase=location.hostname==='lovetree.padiem.net'?'/':'/v41/';const url=new URL(`${shareBase}#share/${answer.share.id}/${answer.share.view}`,location.origin).href;$('share-url').value=url;$('share-url').dataset.shareId=answer.share.id;$('share-created').hidden=false;$('share-feedback').textContent='명시적으로 공유 주소를 만들었어요.';sharePreviewKey='';sharePreviewToken='';await loadShareList();};
$('share-copy').onclick=async()=>{const input=$('share-url');try{await navigator.clipboard.writeText(input.value);$('share-feedback').textContent='공유 주소를 복사했어요.';}catch{input.select();$('share-feedback').textContent='주소를 선택했어요. 복사해 주세요.';}};
for(const f of frames())f.addEventListener('load',()=>frameLoaded(f));
paintThemeControls();applyTheme();
if(initialRoute.scope==='public')showPublicRoute(initialRoute);else load(null,'example');

function backup(){const data=member?.state();if(!data){notify('백업할 내 기록이 없어요.');return;}const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='lovetree-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
// 2026-11-08 기억책 오른쪽 페이지 '다음 순간 남기기': 부모가 될 순간을 지정해 편집기를 연다.
// 선택 순간을 부모로 쓰는 기존 경로(선택 순간 + '순간 추가')와 같은 저장 계약이며, 부모만 명시한다.
let parentChoice='';
function setEditorMode(mode,parentId=''){
 if(uploads.busy){notify('파일 전송을 마치거나 취소한 뒤 작업을 바꿔 주세요.');return;}
 if(formDirty()&&!confirm('현재 입력을 비우고 작업을 바꿀까요?'))return;
 uploads.reset();
 const c=window.LT41;
 parentChoice=mode==='add'&&parentId&&c?.tree.moments.some(moment=>moment.id===parentId)&&c.tree.moments.some(moment=>moment.id===c.momentId)?parentId:'';
 const m=parentChoice?c.tree.moments.find(moment=>moment.id===parentChoice):c?.tree.moments.find(moment=>moment.id===c.momentId);
 if(!m){notify('먼저 순간을 선택해 주세요.');return;}
 editorMode=mode;
 $('editor-title').textContent=mode==='add'?'순간 추가':'순간 수정';
 const form=$('moment-form');form.reset();
 $('relation-label').hidden=mode!=='add';
 for(const name of ['title','note','emotion','date','url','relation'])form.elements[name].value=mode==='edit'?m[name]||'':name==='emotion'?'설렘':name==='date'?new Date().toISOString().slice(0,10):'';
 // 2026-11-08 수정 모드에서 이미 적어 둔 제목·감정·날짜가 있으면 '더 적기'를 펼친 상태로 연다.
 $('more-fields').open=mode==='edit'&&Boolean((m.title||'').trim()||(m.emotion||'').trim()||(m.date||'').trim());
 const parent=mode==='edit'&&m.parentId?c.tree.moments.find(moment=>moment.id===m.parentId):null;
 $('editor-context').textContent=mode==='add'?`새 순간 추가 · ${m.title}에서 이어집니다.`:parent?`수정할 순간 · ${m.title} · 현재 이전 순간: ${parent.title}`:`수정할 순간 · ${m.title} · 트리의 시작 순간`;
 $('form-error').textContent='';$('moment-management').hidden=mode!=='edit';
 const reparenting=mode==='edit'&&m.parentId!==null;
 $('parent-management').hidden=!reparenting;$('parent-current').textContent=parent?`현재 이전 순간 · ${parent.title}`:'';
 $('parent-target').replaceChildren();
 if(reparenting){for(const other of parentCandidates(c.tree,m.id)){const o=document.createElement('option');o.value=other.id;o.textContent=other.title;$('parent-target').append(o);}$('parent-target').value=m.parentId;$('parent-relation').value=m.relation||'';}else $('parent-relation').value='';
 $('related-target').replaceChildren();for(const other of c?.tree.moments||[]){if(other.id===m?.id)continue;const o=document.createElement('option');o.value=other.id;o.textContent=(m?.links?.includes(other.id)?'연결됨 · ':'')+other.title;$('related-target').append(o);}
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.mode===mode)));
 updateMediaPreview();updateQuickEntryHint();formBaseline=new URLSearchParams(new FormData(form)).toString();parentBaseline=parentValue();
}
// 2026-11-07 첫 트리 = 첫 여정(A안, 어두운 무대). 새 트리를 여는 모든 경로가 이 화면으로 오고,
// 순간 추가·이 순간 수정은 기존 오른쪽 패널을 그대로 쓴다. 저장은 member.apply('new'/'add') 하나뿐이다.
function journeyReply(message){try{$('view').contentWindow?.postMessage(message,location.origin);}catch{}}
// 2026-11-08 첫 여정 기록: 열 때와 단계를 옴길 때마다 #journey/00~04를 history에 남긴다.
// 같은 단계로 다시 쓰지 않고, 뒤로가기는 이 기록만 보고 단계 복귀·종료를 정한다.
function writeJourneyLocation(step,mode='push'){
 const hash=journeyRouteHash(step);
 if(location.hash!==hash){
  const depth=Number(history.state?.lt41Journey)||0;
  history[mode==='replace'?'replaceState':'pushState'](mode==='replace'?history.state:{lt41Journey:depth+1},'',hash);
 }
 handledHash=hash;
}
function noteJourneyStep(step,{replace=false}={}){
 if(current!=='first-journey.html')return;
 journeyStep=parseJourneyRoute(journeyRouteHash(step))?.step||0;
 writeJourneyLocation(journeyStep,replace?'replace':'push');
}
function gotoJourneyStep(step){
 if(current!=='first-journey.html'){openFirstJourney({step,route:true});return;}
 journeyStep=parseJourneyRoute(journeyRouteHash(step))?.step||0;
 try{$('view').contentWindow?.postMessage({type:'lt41-journey-goto',step:journeyStep},location.origin);}catch{}
 handledHash=location.hash;
}
function leaveJourney({replaceHash=false}={}){
 if(current!=='first-journey.html')return;
 const target=screens.some(screen=>screen[1]===journeyReturn)?journeyReturn:'src064-orbit.html';
 journeySaved=false;journeyRouteOpened=false;
 show(target,false);
 if(replaceHash){history.replaceState(null,'','#home');handledHash='#home';}else handledHash=location.hash;
}
// 저장을 마친 뒤(04 이후) 뒤로가기는 성장 단계로 다시 들어가지 않고 첫 화면으로 나간다.
function finishJourney(){journeySaved=false;journeyRouteOpened=false;show('src064-orbit.html',false);history.replaceState(null,'','#home');handledHash='#home';}
function openFirstJourney({subject='',step=null,route=false}={}){
 const gate=journeyEntry({owned:!!member?.snapshot().owned,writable:!!member?.snapshot().writable,mode:'new'});
 const routed=route&&Number.isFinite(step);
 if(gate.screen==='login'){if(routed){history.replaceState(null,'','#home');handledHash='#home';}openLoginStart('new-tree');return;}
 if(gate.screen==='records'){if(routed){history.replaceState(null,'','#home');handledHash='#home';}notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');panel('records');return;}
 if(screens.some(screen=>screen[1]===current))journeyReturn=current;
 if($('community-panel').open)$('community-panel').close();
 const start=routed?parseJourneyRoute(journeyRouteHash(step))?.step||0:0;
 current='first-journey.html';journeySaved=false;journeyStep=start;journeyRouteOpened=routed;
 document.body.classList.remove('home-screen');$('empty').hidden=true;
 const frame=$('view');frame.hidden=false;frame.title='러브트리 · 첫 여정';
 const query=new URLSearchParams();
 if(subject)query.set('subject',subject);
 if(routed)query.set('step',String(start));
 const suffix=query.toString();
 frame.contentWindow.location.replace(new URL('/v41/views/first-journey.html'+(suffix?'?'+suffix:''),location.origin).href);
 flowNavigation();
 writeJourneyLocation(start,routed?'replace':'push');
}
function saveFirstJourney(draft){
 if(source!=='server'||!member?.snapshot().owned){journeyReply({type:'lt41-journey-result',ok:false,message:'로그인한 뒤 내 기록에 저장할 수 있어요.'});return;}
 if(!member.snapshot().writable){journeyReply({type:'lt41-journey-result',ok:false,message:'서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.'});return;}
 let plan;try{plan=journeySavePlan(draft);}catch(error){journeyReply({type:'lt41-journey-result',ok:false,message:error.message});return;}
 try{
  let treeId=plan.treeId,momentId=plan.momentId,firstMomentId=plan.momentId;
  if(plan.first){const created=member.apply('new',plan.first,{});treeId=created.treeId;firstMomentId=created.momentId;momentId=created.momentId;}
  if(plan.second){const added=member.apply('add',plan.second,{treeId,momentId});momentId=added.momentId;}
  journeyReply({type:'lt41-journey-result',ok:true,treeId,firstMomentId,momentId,connected:!!plan.second});
 }catch(error){journeyReply({type:'lt41-journey-result',ok:false,message:error.message});}
}
function openJourneyBook({treeId,firstMomentId}={}){
 if(!treeId||!member?.state().trees.some(tree=>tree.id===treeId&&tree.moments.some(moment=>moment.id===firstMomentId)))return;
 journeySaved=true;
 current='track59-sketchbook.html';choose(treeId,firstMomentId);show(current);writeLocation();
}
function closeFirstJourney(){
 if(current!=='first-journey.html')return;
 const depth=Number(history.state?.lt41Journey)||0;
 if(!journeyRouteOpened&&depth>0){journeyStep=0;history.go(-depth);return;}
 leaveJourney({replaceHash:true});
}
function openAssets(opener=document.activeElement){if(!member?.snapshot().owned){notify('로그인한 뒤 내 보관 파일을 확인할 수 있어요.');return;}assetsOpener=opener;panel('account-assets');uploads.openAssets();}
function usePrivateAsset(){
 if(source!=='server'||!member?.snapshot().owned){openLoginStart('new-tree');return false;}
 if(!member.snapshot().writable){notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');panel('records');return false;}
 if(!window.LT41){openEditor();notify('새 트리를 만든 뒤 순간에 파일을 첨부할 수 있어요.');return false;}
 if(!window.LT41.momentId){notify('순간을 먼저 연 뒤 내 보관 파일을 첨부할 수 있어요.');return false;}
 if(!$('editor').open)openEditor('add');
 return $('editor').open;
}
function openEditor(requestedMode,parentId=''){if(source!=='server'||!member?.snapshot().owned){openLoginStart('new-tree');return;}if(!member.snapshot().writable){notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');panel('records');return;}const mode=['new','add','edit'].includes(requestedMode)?requestedMode:window.LT41?'add':'new';if(mode==='new'){openFirstJourney();return;}setEditorMode(mode,parentId);panel('editor');queueMicrotask(()=>$('moment-form').elements.note.focus());}
function updateTreeCoverHint(){const c=window.LT41,selected=c?.tree.moments.find(m=>m.id===$('tree-cover').value);if(!selected){$('tree-cover-hint').textContent='표지를 고르지 않으면 기존 금테 장식 표지를 사용합니다.';return;}const media=LTMedia.describe(selected.url||'');$('tree-cover-hint').textContent=media.kind==='photo'?`“${selected.title}”의 사진을 표지로 사용합니다.`:`“${selected.title}”을 표지 순간으로 표시하고 금테 장식 표지를 사용합니다.`;}
function openTreeManager(){if(source!=='server'||!member?.snapshot().owned||!member.snapshot().writable||!window.LT41){notify('내 서버 기록을 불러온 뒤 책 정보를 관리해 주세요.');return;}const tree=window.LT41.tree,form=$('tree-form');form.elements.title.value=tree.title;form.elements.subject.value=tree.subject;$('tree-cover').replaceChildren();const fallback=document.createElement('option');fallback.value='';fallback.textContent='기본 금테 장식 표지';$('tree-cover').append(fallback);for(const moment of tree.moments){const option=document.createElement('option'),media=LTMedia.describe(moment.url||'');option.value=moment.id;option.textContent=`${moment.title} · ${media.kind==='photo'?'사진':media.kind==='video'?'영상':media.kind==='youtube'?'YouTube':media.kind==='link'?'링크':'기록'}`;$('tree-cover').append(option);}$('tree-cover').value=tree.coverMomentId||'';$('tree-form-error').textContent='';updateTreeCoverHint();treeBaseline=new URLSearchParams(new FormData(form)).toString();panel('tree-manager');queueMicrotask(()=>form.elements.title.focus());}
$('manage-tree').onclick=openTreeManager;$('tree-cover').onchange=updateTreeCoverHint;$('tree-form').onsubmit=e=>{e.preventDefault();try{member.apply('editTree',Object.fromEntries(new FormData(e.target)),stateSelection());treeBaseline=new URLSearchParams(new FormData(e.target)).toString();$('tree-manager').close();notify('책 정보를 서버에 저장하고 있어요.');}catch(error){$('tree-form-error').textContent=error.message;}};$('tree-delete').onclick=()=>{const tree=window.LT41?.tree;if(!tree||!confirm(`“${displayTreeTitle(tree.title)}”과 ${tree.moments.length}개 순간을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))return;try{member.apply('deleteTree',{},stateSelection());treeBaseline='';$('tree-manager').close();notify('트리를 삭제하고 서버에 반영하고 있어요.');}catch(error){$('tree-form-error').textContent=error.message;}};$('tree-manager').addEventListener('cancel',e=>{if(treeDirty()&&!confirm('책 정보 변경을 버리고 닫을까요?'))e.preventDefault();});
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
addEventListener('beforeunload',e=>{if(member?.snapshot().dirty||formDirty()||treeDirty()){e.preventDefault();e.returnValue='';}});
mountCommunity({
 button:$('community-menu'),dialog:$('community-panel'),
 onOpenShare:item=>{$('community-panel').close();location.hash=`#share/${item.shareId}/${item.view||'book'}`;},
 onShareOwn:()=>{$('community-panel').close();if(source==='server'&&member?.snapshot().owned&&window.LT41)openSharePanel();else {notify('로그인하고 공유할 내 트리를 먼저 선택해 주세요.');panel('records');}},
 onStartRecord:subject=>{
  $('community-panel').close();
  if(source!=='server'||!member?.snapshot().owned){notify('로그인한 뒤 내 계정에 새 트리를 시작할 수 있어요. 원본 공개 트리는 복사하지 않아요.');panel('records');return;}
  openFirstJourney({subject:subject||''});
 }
});
if(shouldLoadMemberRecords(location.search,document.cookie,location.hash))startMember();
