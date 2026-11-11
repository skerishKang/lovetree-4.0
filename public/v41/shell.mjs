import {mountPrivateUpload} from './private-upload.mjs';
import {memberLoginUrl,shouldLoadMemberRecords} from './member-entry.mjs';
import {workspaceModel} from './workspace-model.mjs';
import {createWorkspaceApi, setMemberRefreshStarted} from './api.mjs';
import {createShareApi} from './share-api.mjs';
import {createMemberSession} from './member-session.mjs';
import {hasPendingDraft} from './sync-controller.mjs';
import {clearCachedWorkspace} from './workspace-cache.mjs';
import {exampleTree} from './example.mjs';
import {parseSelectionRoute,memberStartupView,ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,stashPendingOwnerRoute,pendingOwnerRoute,takePendingOwnerRoute} from './selection-location.mjs';
import {applyViewAccessibility,connectionLabel} from './view-a11y.mjs';
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS} from './header-state.mjs';
import {parseJourneyRoute,journeyRouteDecision} from './first-journey.mjs';
import {displayTreeTitle} from './tree-name.mjs';
import {titleView, withoutAutoTitle} from './book-usability.mjs';
import {screens,screenForView,viewForFile,themedViewFor} from './shell/navigation.mjs';
import {createScreens} from './shell/screens.mjs';
import {createHeader} from './shell/header.mjs';
import {createAuth} from './shell/auth.mjs';
import {createPanels} from './shell/panels.mjs';
import {createQuickAdd} from './shell/quick-add.mjs';
import {createQuickIntake} from './shell/quick-intake.mjs';
import {createJourney} from './shell/journey.mjs';
import {createMessages} from './shell/messages.mjs';
import {createCleanup} from './shell/cleanup.mjs';
import {headerBadge, pickerLabel, isInboxTree} from './inbox-model.mjs';
import {createDialogs} from './shell/dialogs.mjs';
import {createLocation} from './shell/location.mjs';
import {createNotifier} from './shell/notice.mjs';
import {paintLoginLinks,paintThemeControls,applyTheme as applyThemeFor,toggleTheme as toggleThemeFor} from './shell/theme.mjs';
import {normalizeTitleDisplay} from './domain.mjs';
import {backfillVideoTitles} from './title-backfill.mjs';
const $=id=>document.getElementById(id);
// 안내 한 벌(#353 후속): 담기·중복·로그인 필요 안내(hold)가 상태 안내보다 먼저 일정 시간 보인다.
const shellNotice=createNotifier({$});
function notify(text,options){return shellNotice.notify(text,options);}
// #347 후속: 계정 제목 보기 설정. 계정 상태(state.prefs.titleDisplay)에 저장하고 화면에 알린다.
function currentPrefs(){try{return member?.state?.().prefs||{titleDisplay:'both'}}catch{return {titleDisplay:'both'}}}
function titleDisplayValue(){return normalizeTitleDisplay(currentPrefs().titleDisplay)}
function paintTitleDisplayControls(){const value=titleDisplayValue();for(const b of document.querySelectorAll('[data-title-display]'))b.setAttribute('aria-checked',String(b.dataset.titleDisplay===value));}
function postTitleDisplay(){try{$('view').contentWindow.postMessage({type:'lt41-title-display',value:titleDisplayValue()},location.origin)}catch{}}
function setTitleDisplay(value){
 if(!member?.snapshot().owned){notify('로그인한 뒤 제목 보기를 바꿀 수 있어요.');return;}
 try{member.apply('setPrefs',{titleDisplay:value});}catch(e){notify('제목 보기를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 if(window.LT41)window.LT41.prefs=member.state().prefs;
 paintTitleDisplayControls();
 postTitleDisplay();
}
let backfillStarted=false,backfillAttempted=new Set();
async function runTitleBackfill(state,session){
 if(source!=='server'||!session.snapshot().owned)return;
 await backfillVideoTitles({state,source,apply:(action,input)=>session.apply(action,input),attempted:backfillAttempted});
}
function themedView(){return themedViewFor(current);}
function applyTheme(theme=readTheme(localStorage)){return applyThemeFor(current,theme);}
function toggleTheme(){return toggleThemeFor(current);}
const moreButton=$('mobile-more'),moreMenu=$('header-overflow');
const treePopover=$('tree-popover'),treeTrigger=$('record-menu');
function closeMore(){moreMenu.classList.remove('is-open');moreMenu.hidden=true;moreButton.setAttribute('aria-expanded','false');}
function buildFoldMenu(){
 moreMenu.replaceChildren();
 const add=(label,click)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=label;b.onclick=()=>{closeMore();click()};moreMenu.append(b)};
 add('첫 화면',()=>document.querySelector('.main-nav [data-view="src064-orbit.html"]').click());
 add('내 책장',()=>document.querySelector('.main-nav [data-view="track32-bookshelf.html"]').click());
 add('둘러보기',()=>$('community-menu').click());
 if(window.LT41){
  add('기억책',()=>document.querySelector('.tree-views [data-view="track59-sketchbook.html"]').click());
  add('기억 보드',()=>document.querySelector('.tree-views [data-view="track58-pinboard.html"]').click());
  add('관계 지도',()=>document.querySelector('.tree-views [data-view="track56-network.html"]').click());
 }
 if(!$('write-menu').hidden)add('＋ 순간 추가',()=>$('write-menu').click());
}
const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function treeYoutubeId(value){try{const u=new URL(String(value||''));if(u.hostname==='youtu.be')return u.pathname.slice(1);if(/youtube\.com$/.test(u.hostname)||u.hostname==='m.youtube.com'){if(u.pathname==='/watch')return u.searchParams.get('v')||'';const m=u.pathname.match(/\/(shorts|live|embed)\/([^/?#]+)/);return m?.[2]||''}}catch{}return ''}
function treeMomentThumb(m){const md=m?.mediaMetadata||{};for(const v of [md.thumbnail,md.poster,md.image,m?.attachment?.url,m?.media?.url,m?.image])if(typeof v==='string'&&v.trim())return v.trim();const id=treeYoutubeId(m?.url);return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:''}
function treeCoverMarkup(tree){
 if(tree?.coverDesign)return `<span class="tree-cover" data-cover-design="${escHTML(tree.coverDesign)}" aria-hidden="true"></span>`;
 const moments=Array.isArray(tree?.moments)?[...tree.moments].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))):[];
 const cover=tree?.coverMomentId?moments.find(m=>m.id===tree.coverMomentId):null;
 const thumb=(cover&&treeMomentThumb(cover))||moments.map(treeMomentThumb).find(Boolean)||'';
 return `<span class="tree-cover" aria-hidden="true">${thumb?`<img src="${escHTML(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</span>`;
}
function renderTreeMenu(){
 if(!treePopover)return;
 const trees=Array.isArray(model?.trees)?[...model.trees]:[];
 const ordered=trees.sort((a,b)=>Number(b?.inbox===true)-Number(a?.inbox===true));
 const currentId=window.LT41?.tree?.id||'';
 const rows=ordered.map(tree=>{
  const active=tree.id===currentId;
  const count=tree.inbox===true?`정리 전 ${tree.moments?.length||0}`:`${tree.moments?.length||0}개의 순간`;
  return `<button type="button" role="menuitemradio" class="tree-item" data-tree-id="${escHTML(tree.id)}" aria-checked="${active}">${treeCoverMarkup(tree)}<span class="tree-name">${escHTML(displayTreeTitle(tree.title||tree.subject||'트리'))}</span><span class="tree-count">${count}</span>${active?'<span class="tree-check" aria-hidden="true">✓</span>':''}</button>`;
 }).join('');
 const manage=source==='server'&&window.LT41&&member?.snapshot().owned&&member.snapshot().writable;
 // #394: 트리 드롭다운 맨 아래 "내 순간 전체 보기"(#380의 "내 트리 전체 보기" 자리 옆). 내 기록(서버)에서만 보인다.
 const momentsEntry=source==='server'&&window.LT41?'<button type="button" role="menuitem" data-tree-action="moments">내 순간 전체 보기</button>':'';
 treePopover.innerHTML=rows+`<div class="tree-foot" role="none"><button type="button" role="menuitem" data-tree-action="new">＋ 새 트리</button>${manage?'<button type="button" role="menuitem" data-tree-action="manage">이 트리 관리 (이름·표지)</button><button type="button" role="menuitem" data-tree-action="share">이 트리 공유</button>':''}${momentsEntry}</div>`;
  // 트리를 누르면 그 트리로 이동한다: 책·보드·지도를 보던 중이면 같은 보기로, 그 외(첫 화면·내 트리·둘러보기)에는 그 트리의 책으로. 주소도 따라오게 남긴다.
  const TREE_VIEWS=new Set(['track59-sketchbook.html','track58-pinboard.html','track56-network.html']);
  treePopover.querySelectorAll('[data-tree-id]').forEach(b=>b.onclick=()=>{const id=b.dataset.treeId;closeTreeMenu();if(!id)return;const wasTreeView=TREE_VIEWS.has(current);choose(id);if(!wasTreeView)show('track59-sketchbook.html',false);flowNavigation();writeLocation();});
 treePopover.querySelector('[data-tree-action="new"]')?.addEventListener('click',()=>{closeTreeMenu();if(member?.snapshot().writable)openEditor('new');else openLoginStart('new-tree');});
 treePopover.querySelector('[data-tree-action="manage"]')?.addEventListener('click',()=>{closeTreeMenu();shellPanels.openTreeManager();});
 treePopover.querySelector('[data-tree-action="share"]')?.addEventListener('click',()=>{closeTreeMenu();$('share-menu').click();});
 // #394: 첫 화면 순간 목록을 지금 트리가 골라진 상태로 연다. 화면을 다시 불러오므로 요청을 전역 플래그로 남긴다.
 treePopover.querySelector('[data-tree-action="moments"]')?.addEventListener('click',()=>{closeTreeMenu();window.LT41_MOMENTS_OPEN={treeId:window.LT41?.tree?.id||''};show('src064-orbit.html');});
}
function openTreeMenu(){if(!treePopover)return;renderTreeMenu();treePopover.hidden=false;treeTrigger.setAttribute('aria-expanded','true');treePopover.querySelector('button')?.focus();}
function closeTreeMenu(){if(!treePopover)return;treePopover.hidden=true;treeTrigger.setAttribute('aria-expanded','false');}
$('record-menu').addEventListener('click',event=>{event.stopPropagation();if(treePopover?.hidden)openTreeMenu();else closeTreeMenu();});
if(treePopover)treePopover.addEventListener('keydown',event=>{const items=[...treePopover.querySelectorAll('button')];const at=items.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=event.key==='ArrowDown'?(at+1)%items.length:(at-1+items.length)%items.length;items[next]?.focus();}else if(event.key==='Home'){event.preventDefault();items[0]?.focus();}else if(event.key==='End'){event.preventDefault();items.at(-1)?.focus();}});
document.addEventListener('click',event=>{if(treePopover&&!treePopover.hidden&&!event.target.closest('.tree-slot'))closeTreeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&treePopover&&!treePopover.hidden){closeTreeMenu();treeTrigger.focus();}});
addEventListener('lt41-trees-changed',()=>{if(treePopover&&!treePopover.hidden)renderTreeMenu();});
$('mobile-more').addEventListener('click',event=>{
 event.stopPropagation();
 if(moreMenu.hidden){buildFoldMenu();moreMenu.hidden=false;moreMenu.classList.add('is-open');moreButton.setAttribute('aria-expanded','true');}
 else closeMore();
});
moreMenu.addEventListener('click',event=>{
 if(event.target.closest('button'))closeMore();
});
document.addEventListener('click',event=>{
 if(!moreMenu.contains(event.target)&&event.target!==moreButton)closeMore();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!moreMenu.hidden){closeMore();moreButton.focus();}
});
addEventListener('resize',()=>{if(matchMedia('(min-width:781px)').matches)closeMore();});
document.addEventListener('keydown',event=>{
 const c=$('community-panel');
 if(event.key==='Escape'&&c.open&&![...document.querySelectorAll('dialog[open]')].some(d=>d!==c&&d.matches(':modal')))c.close();
});
const initialRoute=parseSelectionRoute(location.hash);
let model=null,current=screenForView(initialRoute.view)[1],source='example',loadGeneration=0,previousDirty=false,member=null,handledHash=null,activeShareId=null;
setMemberRefreshStarted(false);
const shareApi=createShareApi();
const accountApi=createWorkspaceApi();
// 로그인 시작·세션 연결은 shell/auth.mjs가 맡는다(#231 1-B③-1). 셸은 자기 상태를 넘기고 부르기만 한다.
const shellAuth=createAuth({
  $,
  getMember:()=>member,
  notify:text=>notify(text),
  closeAccountMenu:()=>closeAccountMenu(),
  openEditor:(mode,parentId)=>openEditor(mode,parentId),
  showScreen:file=>show(file)
});
function startLogin(intent=''){return shellAuth.startLogin(intent);}
function openLoginStart(intent='first'){return shellAuth.openLoginStart(intent);}
// 헤더·계정 메뉴는 shell/header.mjs가 맡는다(#231 1-B②-2). 셸은 자기 상태를 읽기 함수로 넘긴다.
addEventListener('lovetree-auth-required',()=>shellAuth.authRequired());
window.LT41=null;
const uploads=mountPrivateUpload({form:$('moment-form'),assets:$('account-assets'),getSubject:()=>source==='server'&&member?.snapshot().writable?member.snapshot().subject:null,getState:()=>member?.state(),onChange:()=>shellPanels.uploadsChanged(),onUseAsset:()=>usePrivateAsset()});
// 순간 패널·편집기·책 정보는 shell/panels.mjs가 맡는다(#231 1-B③-2). 셸은 자기 상태를 읽기 함수로 넘긴다.
const shellPanels=createPanels({
  getCurrent:()=>current,
  $,
  getMember:()=>member,
  getSource:()=>source,
  getUploads:()=>uploads,
  notify:text=>notify(text),
  panel:id=>panel(id),
  show:(file,write)=>show(file,write),
  selection:()=>stateSelection(),
  openFirstJourney:options=>openFirstJourney(options),
  openLoginStart:intent=>openLoginStart(intent)
});
function openEditor(mode,parentId=''){return shellPanels.openEditor(mode,parentId);}
// 빠른 추가(#빠른 추가 ②): 고르기 창·모달·끌어다 놓기는 shell/quick-add.mjs가 맡는다.
// 진입(순간 남기기)만 여기서 연결하고, 나머지 화면 분기는 그 모듈의 판정 함수가 정한다.
const shellQuick=createQuickAdd({
  $,
  getMember:()=>member,
  getSource:()=>source,
  getCurrent:()=>current,
  notify:text=>notify(text),
  panel:id=>panel(id),
  choose:(id,momentId)=>choose(id,momentId),
  openEditor:(mode,parentId)=>openEditor(mode,parentId),
  openLoginStart:intent=>openLoginStart(intent),
  // 사진 올리기는 기존 업로더(#310 onUploaded·imagesOnly)를 그대로 쓴다.
  mountUpload:mountPrivateUpload
});
$('write-menu').onclick=()=>shellQuick.openWriteChooser();
// 빠른 담기 입구: 붙여넣기 + 공유 시트 진입(판정·추적은 ../quick-intake.mjs 한 벌).
const shellIntake=createQuickIntake({
  getMember:()=>member,
  getSource:()=>source,
  // 담기·중복·로그인 필요 안내는 방금 한 행동의 결과다 — 상태 안내가 곧바로 덮지 않게 hold로 띄운다(#353 후속).
  notify:text=>notify(text,{hold:true}),
  openLoginStart:intent=>openLoginStart(intent),
  describe:(url)=>globalThis.LTMedia?.describe?.(url),
});
// #327 2부: 모아둔 순간 정리 창. 진입은 헤더 '정리하기'(inbox 트리)와 순간 상세 '다른 트리로 옮기기'(lt41-move 메시지).
const shellCleanup=createCleanup({
  $,
  getMember:()=>member,
  getSource:()=>source,
  getTrees:()=>model?.trees||[],
  choose:(id,momentId)=>choose(id,momentId),
  notify:text=>notify(text),
  panel:id=>panel(id),
  // 정리 목록도 다른 화면과 같은 제목 규칙·썸네일 규칙을 쓴다(중복 구현 금지).
  treeMomentThumb,
  momentTitle:moment=>{const main=titleView(moment,titleDisplayValue()).main;return main||withoutAutoTitle(moment).title;},
});
$('cleanup-menu').onclick=()=>shellCleanup.open({});
function updateMediaPreview(){return shellPanels.updateMediaPreview();}
function updateQuickEntryHint(){return shellPanels.updateQuickEntryHint();}
// 첫 여정 연결은 shell/journey.mjs, 공유·둘러보기·lt41-* 수신은 shell/messages.mjs가 맡는다(#231 1-B③-3).
const shellJourney=createJourney({
  $,
  getCurrent:()=>current,
  setCurrent:file=>{current=file;},
  getMember:()=>member,
  getSource:()=>source,
  notify:text=>notify(text),
  panel:id=>panel(id),
  show:(file,write)=>show(file,write),
  screens,
  choose:(id,momentId)=>choose(id,momentId),
  writeLocation:(mode)=>writeLocation(mode),
  openLoginStart:intent=>openLoginStart(intent),
  flowNavigation:()=>flowNavigation(),
  setHandled:hash=>{handledHash=hash;}
});
const shellMessages=createMessages({
  $,
  getCurrent:()=>current,
  setCurrent:file=>{current=file;},
  getModel:()=>model,
  getSource:()=>source,
  getMember:()=>member,
  shareApi,
  notify:text=>notify(text),
  panel:id=>panel(id),
  show:(file,write)=>show(file,write),
  links:()=>links(),
  writeLocation:(mode)=>writeLocation(mode),
  choose:(id,momentId)=>choose(id,momentId),
  openEditor:(mode,parentId)=>openEditor(mode,parentId),
  openLoginStart:intent=>openLoginStart(intent),
  openAccountMenu:()=>openAccountMenu(),
  openCleanup:options=>shellCleanup.open(options),
  sample:(selection,view)=>sample(selection,view),
  applyTheme:(theme)=>applyTheme(theme),
  paintThemeControls:()=>paintThemeControls(),
  viewForFile:file=>viewForFile(file),
  exampleTree,
  journey:shellJourney
});
function openSharePanel(){return shellMessages.openSharePanel();}
function noteJourneyStep(step,options){return shellJourney.noteJourneyStep(step,options);}
function gotoJourneyStep(step){return shellJourney.gotoJourneyStep(step);}
function leaveJourney(options){return shellJourney.leaveJourney(options);}
function finishJourney(){return shellJourney.finishJourney();}
function openFirstJourney(options){return shellJourney.openFirstJourney(options);}
function saveFirstJourney(draft){return shellJourney.saveFirstJourney(draft);}
function openJourneyBook(args){return shellJourney.openJourneyBook(args);}
function closeFirstJourney(){return shellJourney.closeFirstJourney();}
// 주소 처리(#view·#tree/…·#share/…·#journey/NN 읽기·쓰기)는 shell/location.mjs가 맡는다.
const shellLocation=createLocation({
  $,
  getCurrent:()=>current,
  setCurrent:file=>{current=file;},
  getMember:()=>member,
  getSource:()=>source,
  getModel:()=>model,
  getActiveShareId:()=>activeShareId,
  getHandled:()=>handledHash,
  setHandled:hash=>{handledHash=hash;},
  show:(file,write)=>show(file,write),
  choose:(id,momentId)=>choose(id,momentId),
  notify:text=>notify(text),
  startMember:()=>startMember(),
  showPublicRoute:route=>showPublicRoute(route),
  journey:shellJourney,
  gotoJourneyStep:step=>gotoJourneyStep(step),
  openFirstJourney:options=>openFirstJourney(options),
  finishJourney:()=>finishJourney(),
  leaveJourney:()=>leaveJourney()
});
function writeLocation(mode){return shellLocation.writeLocation(mode);}
function applyBrowserLocation(){return shellLocation.applyBrowserLocation();}
const PENDING_NEW='lovetree.v41.pending-new';
// 2026-11-07 계정 표시: 로그인 상태는 첫 글자 동그라미 + 작은 메뉴, 로그아웃 상태는 기존 로그인 알약.
function panel(id){if(id==='records')updateAccountControls();const target=$(id);if(!target.open)target.showModal();}
// 대화상자 접근성(Tab 순환·Esc 복귀·포커스 되돌리기)은 shell/dialogs.mjs가 맡는다(#231 1-B 후속).
const shellDialogs=createDialogs({
  $,
  closeTreeTips:()=>closeTreeTips(),
  closeAccountMenu:()=>closeAccountMenu()
});

const shellHeader=createHeader({
  $,
  navBar:document.querySelector('.app-header nav'),
  getMember:()=>member,
  getModel:()=>model,
  getSource:()=>source,
  getCurrent:()=>current,
  accountApi,
  delegate:{syncTreeTips:()=>syncTreeTips()}
});
function flowNavigation(){return shellHeader.flowNavigation();}
function updateNavFade(){return shellHeader.updateNavFade();}
function revealCurrentTab(){return shellHeader.revealCurrentTab();}
function closeAccountMenu(){return shellHeader.closeAccountMenu();}
function renderAccount(){return shellHeader.renderAccount();}
function openAccountMenu(){return shellHeader.openAccountMenu();}
function loadAccountEmail(){return shellHeader.loadAccountEmail();}
function updateAccountControls(){return shellHeader.updateAccountControls();}
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
    mountConnectionTool(d);applyViewAccessibility(d);shellQuick.mountFrame(d);
    d.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;let file;if(b.matches('[data-action="tree"],[data-menu="tree"]'))file='track32-bookshelf.html';if(b.matches('#storyBook,[data-menu="book"]'))file='track59-sketchbook.html';if(current==='track56-network.html'&&b.id==='openMoment')file='track59-sketchbook.html';if(file){e.preventDefault();e.stopImmediatePropagation();show(file);}},true);
  }
});
function frames(){return shellScreens.frames();}
function hideFrames(){return shellScreens.hideFrames();}
function showInFrame(url,title){return shellScreens.showInFrame(url,title);}
function show(file,write=true){return shellScreens.show(file,write);}
function frameLoaded(frame){return shellScreens.frameLoaded(frame);}

function viewContext(){const c=window.LT41;const cleanup=$('cleanup-menu');if(cleanup)$('cleanup-menu').hidden=!(c&&source==='server'&&member?.snapshot().owned&&member.snapshot().writable&&isInboxTree(c.tree));}
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
 for(const e of edges){
  const id=e.from===c.momentId?e.to:e.from,m=c.tree.moments.find(m=>m.id===id),b=document.createElement('button'),kind=document.createElement('small'),title=document.createElement('span');
  kind.textContent=e.kind==='related'?'관련 순간':e.from===c.momentId?'다음 순간':'이전 순간';
  const name=document.createElement('strong'),reason=document.createElement('span');
  name.textContent=m.title;
  reason.className='connection-reason';
  reason.textContent=e.reason||(e.kind==='related'?'함께 기억할 관련 순간으로 연결했어요.':'연결 이유를 아직 남기지 않았어요.');
  title.append(name,reason);b.append(kind,title);
  b.onclick=()=>{c.momentId=id;$('connection-panel').close();show(current,false);writeLocation();};
  $('connections').append(b);
 }
}
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
// 2026-11-07: 390·360에서 탭 7개가 폭을 넘는다. 탭 줄은 가로 스크롤이고, 화면을 바꿀 때 현재 탭을 가운데로 당겨 보이게 한다.
// 넘치는 쪽 끝에만 페이드를 켜서 잘린 것이 아니라 더 있다는 신호를 준다. 데스크톱(넓은 폭)은 스크롤이 없어 아무 일도 하지 않는다.
const navBar=document.querySelector('.app-header nav');
const narrowNav=()=>matchMedia('(max-width:780px)').matches;
function choose(id,momentId){const tree=model.trees.find(t=>t.id===id);window.LT41=tree?{tree,trees:model.trees,source,momentId:tree.moments.find(m=>m.id===momentId)?.id||tree.moments.find(m=>m.parentId===null)?.id||tree.moments[0]?.id,prefs:currentPrefs(),writable:source==='server'&&!!member?.snapshot().writable,}:null;
 if(tree||current==='src064-orbit.html')show(current,false);else{flowNavigation();document.body.classList.remove('home-screen');hideFrames();$('empty').hidden=false;links();}}
function load(input,kind,selection={},fallback={}){
 model=kind==='example'?{trees:[exampleTree]}:workspaceModel(input);
 source=kind;
 if(kind!=='share'){
  activeShareId=null;
  $('empty').querySelector('h1').textContent='다시 펼칠 순간을 기다리고 있어요.';
  $('empty').querySelector('p').textContent='예시를 둘러보거나 로그인한 계정의 기록을 불러오세요.';
  $('empty-sample').hidden=false;$('empty-records').hidden=false;
 }
 document.body.dataset.recordSource=kind;
 document.body.dataset.member=member?.snapshot().owned?'in':'out';
 document.body.dataset.treeCount=String(model?.trees?.length||0);
 $('source-label').textContent='트리 선택';
 $('record-description').textContent=kind==='example'
  ?'실제 회원 데이터와 무관한 예시입니다.'
  :kind==='server'
   ?'로그인한 계정의 서버 기록 · 작성·수정 후 자동 저장'
   :kind==='share'
    ?'소유자가 명시적으로 공개한 트리 · 감상 전용'
    :'선택한 파일을 메모리에서 읽는 중입니다.';
 $('trees').replaceChildren();
 for(const t of model.trees){const o=document.createElement('option');o.value=t.id;o.textContent=pickerLabel(t);$('trees').append(o);}
 $('trees').disabled=!model.trees.length;
 const resolved=resolveAccountPosition(model.trees,selection,fallback),chosen=model.trees.find(t=>t.id===resolved.position.treeId);
 $('trees').value=chosen?.id||'';
 choose(chosen?.id,resolved.position.momentId);
 return resolved;
}
function clear(){load({revision:0,state:{version:1,trees:[]}},'file');$('source-label').textContent='트리 선택';$('record-description').textContent='펼쳐 볼 트리를 선택하세요.';}
function stateSelection(){return {treeId:window.LT41?.tree.id,momentId:window.LT41?.momentId};}
function formDirty(){return shellPanels.formDirty();}
function treeDirty(){return shellPanels.treeDirty();}
function canLeave(){return !(formDirty()||treeDirty()||member?.snapshot().dirty)||confirm('아직 저장되지 않은 입력이 있어요. 현재 기록을 백업한 뒤 이동하는 것을 권합니다. 저장하지 않고 이동할까요?');}
function leaveMember(){if(!canLeave())return false;member?.dispose();member=null;return true;}
function memberStatus(status){
  shellIntake.flush();
  const failed=status.dirty&&['offline','rejected','conflict','login'].includes(status.phase);
 $('save-feedback').hidden=!failed;
 $('save-message').textContent=failed?
  (status.phase==='login'
   ?'로그인이 만료되어 서버에 저장하지 못했어요. 새 창에서 로그인한 뒤 이 탭을 새로고침하면 입력을 복원합니다.'
   :status.detail||'서버에 저장하지 못했어요. 이 화면을 닫지 말고 다시 저장해 주세요.')
  :'';
 $('save-actions').replaceChildren();
 if(failed){
  for(const a of status.actions.filter(a=>['retry','pull','force','login'].includes(a.name))){
   const b=document.createElement('button');
   b.textContent=a.name==='login'?'새 창에서 로그인':a.label;
   b.onclick=async()=>{
    if(a.name==='login'){window.open(memberLoginUrl(readTheme(localStorage)),'_blank','noopener,noreferrer');return;}
    if(['pull','force'].includes(a.name)&&!confirm(a.name==='pull'
     ?'미저장 변경을 버리고 서버 기록을 불러올까요?'
     :'서버의 최신 기록으로 현재 입력을 덮어쓸까요? 다른 창의 변경이 사라질 수 있습니다.'))return;
    await member?.act(a.name);
   };
   $('save-actions').append(b);
  }
  const b=document.createElement('button');b.textContent='현재 기록 백업';b.onclick=backup;$('save-actions').append(b);
 }
 if(status.phase==='checking')notify('내 기록을 불러오고 있어요.');
 else if(status.phase==='synced')notify(status.writable?(previousDirty?'서버에 저장됐어요.':'내 기록을 불러왔어요.'):'기록을 읽었어요. 서버 편집 연결은 아직 준비되지 않았어요.');
 else if(status.phase==='login'&&!status.dirty)notify('로그인이 필요해요.');
 else if(!status.dirty&&status.phase==='offline')notify(status.detail||'내 기록을 불러오지 못했어요.');
 $('write-menu').textContent=status.dirty?'미저장 기록' :'＋ 순간 추가';$('empty-records').textContent=status.writable?'첫 트리 만들기':'내 기록 불러오기';previousDirty=status.dirty;renderAccount();flowNavigation();document.body.dataset.member=member?.snapshot().owned?'in':'out';document.body.dataset.treeCount=String(model?.trees?.length||0);applyAdvanced();
}
async function startMember(){setMemberRefreshStarted(true);if(!leaveMember())return;backfillStarted=false;backfillAttempted.clear();const startup=parseSelectionRoute(location.hash);if(startup.scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);++loadGeneration;const generation=loadGeneration;clear();
 const api=createWorkspaceApi({fetchImpl:(url,init)=>fetch(init?.method==='GET'&&url==='/api/workspace'?'/api/workspace?features=bound-writes':url,init)});
 let initialized=false,startupNotice='',session;
 session=createMemberSession({api,onState:(state,selection,meta)=>{if(generation!==loadGeneration)return;
  // 4.1 기억 보드 저장: 화면이 이미 자기 상태를 들고 있으므로 셸은 모델만 갱신하고 iframe을 다시 그리지 않는다.
  if(meta?.board){const projected=workspaceModel({revision:0,state});model=projected;if(window.LT41){const tree=projected.trees.find(t=>t.id===window.LT41.tree.id);if(tree){window.LT41.tree=tree;window.LT41.trees=projected.trees;window.LT41.writable=true}}return;}const snapshot=session.snapshot(),saved=accountPosition(localStorage,snapshot.subject)||{},active=parseSelectionRoute(location.hash),pending=!initialized&&active.scope!=='owner'?pendingOwnerRoute(sessionStorage):null,route=active.scope==='owner'?active:pending;let requested=selection||stateSelection();
   if(!initialized){if(route)requested=route;else if(!selection)requested=saved;const view=memberStartupView(active,route,saved,viewForFile(current));current=screenForView(view)[1];}
   const resolved=load({revision:0,state},'server',requested,saved);initialized=true;
   if(window.LT41)window.LT41.prefs=state.prefs;
   paintTitleDisplayControls();
   if(!backfillStarted&&snapshot.owned){backfillStarted=true;void runTitleBackfill(state,session);}
   if(snapshot.owned&&resolved.position.treeId){if(viewForFile(current)!=='home')writeLocation('replace');takePendingOwnerRoute(sessionStorage);if(route?.scope==='owner'&&resolved.treeMissing)startupNotice='이 주소의 기록을 현재 계정에서 찾을 수 없어 최근 위치를 열었어요.';else if(route?.scope==='owner'&&resolved.momentMissing)startupNotice='이 주소의 순간을 찾을 수 없어 트리의 시작 순간을 열었어요.';}
 },onStatus:status=>{if(generation===loadGeneration)memberStatus(status);},
 navigate:url=>{
  if(url.startsWith('/auth/login')&&parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);
  location.assign(url.startsWith('/auth/login')?memberLoginUrl(readTheme(localStorage)):url==='#start'?'#home':url);
 }
});
 member=session;
 await session.start();
 if(generation===loadGeneration&&session.snapshot().owned){
  if($('records').open)$('records').close();
  updateAccountControls();
  if(session.snapshot().writable&&sessionStorage.getItem(PENDING_NEW)==='1'){sessionStorage.removeItem(PENDING_NEW);openEditor('new');}
  shellAuth.consumeLoginIntent(session.snapshot());
  if(startupNotice)notify(startupNotice);
 }
 if(generation===loadGeneration){const startupJourney=parseJourneyRoute(location.hash);if(startupJourney){if(session.snapshot().owned&&session.snapshot().writable)openFirstJourney({step:startupJourney.step,route:true});else{history.replaceState(null,'','#home');handledHash='#home';}}}
}
function sample(selection={},view){if(!leaveMember())return;++loadGeneration;if(view)current=view;load(null,'example',selection);if(view)writeLocation();$('save-feedback').hidden=true;$('records').close();}
$('account-entry').onclick=e=>{
 if(member?.snapshot().owned){e.preventDefault();openAccountMenu();}
 else if(parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);
};
$('account-avatar').onclick=e=>{
 e.stopPropagation();
 if($('account-popover').hidden)openAccountMenu();else closeAccountMenu();
};
const $on=(id,fn)=>{const el=$(id);if(el)el.onclick=fn;};
function advancedKey(){try{return 'lt41.advanced.'+(member?.snapshot().subject||'')}catch{return 'lt41.advanced.'}}
function readAdvanced(){try{return localStorage.getItem(advancedKey())==='1'}catch{return false}}
function applyAdvanced(){const on=readAdvanced();document.body.classList.toggle('lt-advanced',on);$('account-advanced')?.setAttribute('aria-checked',String(on));try{$('view').contentWindow.postMessage({type:'lt41-advanced',value:on},location.origin)}catch{}}
$on('account-records',()=>{closeAccountMenu();panel('records');});
$on('account-backup',()=>{closeAccountMenu();backup();});
 $('account-assets-open').onclick=()=>{closeAccountMenu();openAssets($('account-avatar'));};
 $('editor-assets-open').onclick=()=>openAssets($('editor-assets-open'));
 for(const b of document.querySelectorAll('[data-set-theme]'))b.onclick=()=>{writeTheme(localStorage,b.dataset.setTheme);applyTheme();paintThemeControls();};
 $('account-advanced').onclick=()=>{const next=!readAdvanced();try{localStorage.setItem(advancedKey(),next?'1':'0')}catch{}applyAdvanced();};
 $('account-open-settings').onclick=()=>{closeAccountMenu();void openAccountSettings();};
 $('advanced-backup').onclick=()=>backup();
 $('advanced-import').onclick=()=>$('file').click();
 for(const b of document.querySelectorAll('[data-title-display]'))b.onclick=()=>setTitleDisplay(b.dataset.titleDisplay);
 $('account-logout').onclick=async()=>{closeAccountMenu();$('logout').click();};
document.addEventListener('click',e=>{
 if(!e.target.closest('.account-slot'))closeAccountMenu();
});
$('empty-records').onclick=()=>member?.snapshot().writable?openEditor():panel('records');
$('empty-sample').onclick=sample;
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
 const button=$('account-delete');
 button.disabled=true;
 $('account-feedback').textContent='탈퇴를 처리하고 있어요.';
 const answer=await accountApi.deleteAccount(value);
 if(!answer.ok){
  $('account-feedback').textContent=answer.message||'탈퇴하지 못했어요. 다시 시도해 주세요.';
  button.disabled=false;
  return;
 }
 try{member?.dispose?.();}catch{}
 member=null;source='example';clear();$('account-settings').close();updateAccountControls();
 notify(answer.commonAccountDeleted
  ? '러브트리 탈퇴와 함께 공통 로그인 계정과 인증 세션을 폐기했습니다.'
  : '러브트리에서 탈퇴했습니다. 다른 서비스 연결이 남아 있어 공통 계정은 유지됩니다.');
};$('logout').onclick=async()=>{if(member){await member.act('logout');if(member.snapshot().dirty)notify('미저장 기록이 있어 로그아웃하지 않았어요. 다시 저장하거나 백업해 주세요.');}else{const answer=await createWorkspaceApi().logout();if(answer.ok)clearCachedWorkspace(localStorage);notify(answer.ok?'로그아웃했습니다.':'로그아웃하지 못했어요. 다시 시도해 주세요.');}};
$('file').onchange=async()=>{
 const f=$('file').files[0];
 if(!f)return;
 if(!leaveMember())return;
 const generation=++loadGeneration;
 try{
  if(f.size>4194304)throw Error('4MiB 이하 파일만 읽습니다.');
  const d=JSON.parse(await f.text());
  if(generation!==loadGeneration)return;
  load(d.state?d:{revision:0,state:d},'file');
  $('records').close();
  notify('파일을 열었어요. 서버에는 저장하지 않습니다.');
 }catch(e){
  if(generation===loadGeneration)notify('불러오기 실패: '+e.message);
 }
};
$('trees').onchange=()=>{choose($('trees').value);writeLocation();$('records').close();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(b.dataset.close==='editor'&&uploads.busy){notify('파일 전송을 마치거나 취소해 주세요.');return;}if(b.dataset.close==='editor'&&formDirty()&&!confirm('작성 중인 입력을 버리고 닫을까요?'))return;if(b.dataset.close==='tree-manager'&&treeDirty()&&!confirm('책 정보 변경을 버리고 닫을까요?'))return;$(b.dataset.close).close();});
function publicProblem(answer){
 source='share';activeShareId=null;model={trees:[]};window.LT41=null;document.body.dataset.recordSource='share';flowNavigation();document.body.classList.remove('home-screen');hideFrames();$('empty').hidden=false;$('empty-sample').hidden=true;$('empty-records').hidden=true;
 const messages={share_invalid:['공유 주소를 찾을 수 없어요.','주소를 다시 확인해 주세요.'],share_not_found:['공유 주소를 찾을 수 없어요.','주소가 잘못되었거나 존재하지 않아요.'],share_revoked:['공유가 취소됐어요.','소유자가 이 공유 주소를 회수했습니다.'],share_removed:['공유된 트리가 없어졌어요.','트리가 삭제되었거나 더 이상 공개할 수 없어요.'],share_empty:['아직 공개할 순간이 없어요.','소유자가 순간을 남긴 뒤 다시 열어 주세요.'],share_forbidden:['이 공유는 볼 수 없어요.','접근 권한을 확인해 주세요.']};
 const [title,detail]=messages[answer.code]||['공유 기록을 불러오지 못했어요.',answer.code==='timeout'?'서버 응답 시간이 초과됐어요. 다시 시도해 주세요.':'잠시 뒤 다시 시도해 주세요.'];$('empty').querySelector('h1').textContent=title;$('empty').querySelector('p').textContent=detail;links();
}
async function showPublicRoute(route){
 if(member&&!leaveMember()){writeLocation('replace');return;}
 const generation=++loadGeneration;
 member=null;activeShareId=route.shareId;
 current=screenForView(['book','board','network'].includes(route.view)?route.view:'book')[1];
 handledHash=location.hash;
 $('empty').querySelector('h1').textContent='공유된 순간을 펼치고 있어요.';
 $('empty').querySelector('p').textContent='소유자가 공개한 트리 한 개만 확인합니다.';
 $('empty-sample').hidden=true;$('empty-records').hidden=true;$('view').hidden=true;$('empty').hidden=false;
 const answer=await shareApi.read(route.shareId||'');if(generation!==loadGeneration)return;if(!answer.ok){publicProblem(answer);return;}
 activeShareId=answer.share.id;const view=['book','board','network'].includes(route.view)?route.view:answer.share.view;current=screenForView(view)[1];load({revision:0,state:{version:1,trees:[answer.tree]}},'share',{treeId:answer.tree.id,momentId:answer.share.entryMomentId});activeShareId=answer.share.id;show(current,false);writeLocation('replace');notify('소유자가 명시적으로 공유한 트리입니다. 감상만 할 수 있어요.');
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='track32-bookshelf.html'&&!member?.snapshot().owned){openLoginStart('shelf');return;}show(b.dataset.view);});
for(const f of frames())f.addEventListener('load',()=>frameLoaded(f));
paintThemeControls();applyTheme();paintTitleDisplayControls();applyAdvanced();
if(initialRoute.scope==='public')showPublicRoute(initialRoute);else load(null,'example');

function backup(){const data=member?.state();if(!data){notify('백업할 내 기록이 없어요.');return;}const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='lovetree-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
function openAssets(opener=document.activeElement){if(!member?.snapshot().owned){notify('로그인한 뒤 내 보관 파일을 확인할 수 있어요.');return;}shellDialogs.rememberOpener(opener);panel('account-assets');uploads.openAssets();}
function usePrivateAsset(){
 if(source!=='server'||!member?.snapshot().owned){openLoginStart('new-tree');return false;}
 if(!member.snapshot().writable){notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');panel('records');return false;}
 if(!window.LT41){openEditor();notify('새 트리를 만든 뒤 순간에 파일을 첨부할 수 있어요.');return false;}
 if(!window.LT41.momentId){notify('순간을 먼저 연 뒤 내 보관 파일을 첨부할 수 있어요.');return false;}
 if(!$('editor').open)openEditor('add');
 return $('editor').open;
}
addEventListener('beforeunload',e=>{
 if(member?.snapshot().dirty||formDirty()||treeDirty()){e.preventDefault();e.returnValue='';}
});
if(shouldLoadMemberRecords(location.search,document.cookie,location.hash)||shellIntake.pending())startMember();
