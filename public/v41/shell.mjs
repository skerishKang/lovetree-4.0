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
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS,readPageTurn,writePageTurn} from './header-state.mjs';
import {parseJourneyRoute,journeyRouteDecision} from './first-journey.mjs';
import {displayTreeTitle} from './tree-name.mjs';
import {titleView, withoutAutoTitle} from './book-usability.mjs';
import {screens,screenForView,viewForFile,themedViewFor} from './shell/navigation.mjs';
import {createScreens} from './shell/screens.mjs';
import {createHeader} from './shell/header.mjs';
import {createAuth} from './shell/auth.mjs';
import {createPanels} from './shell/panels.mjs';
import {createQuickAdd} from './shell/quick-add.mjs';
import {createWritePanel, readWriteTab, writeWriteTab} from './shell/write-panel.mjs';
import {createQuickIntake} from './shell/quick-intake.mjs';
import {createJourney} from './shell/journey.mjs';
import {createMessages} from './shell/messages.mjs';
import {createCleanup} from './shell/cleanup.mjs';
import {headerBadge, cleanupAvailable} from './inbox-model.mjs';
import {createDialogs} from './shell/dialogs.mjs';
import {connectionSignature} from './shell/panel-dirty.mjs';
import {createLocation} from './shell/location.mjs';
import {createNotifier} from './shell/notice.mjs';
import {paintLoginLinks,paintThemeControls,applyTheme as applyThemeFor,toggleTheme as toggleThemeFor} from './shell/theme.mjs';
import {normalizeTitleDisplay, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeShareDiscover, coverModeOf, normalizeCoverDesign} from './domain.mjs';
import {backfillVideoTitles} from './title-backfill.mjs';
import {thumbnailCandidates, coverFallbackAttrs, fallbackCardData, emotionToneOf, mountThumbFallback, ADD_TITLE_LABEL, VIDEO_UNAVAILABLE_TEXT} from './thumb-fallback.mjs';
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
 // #380 2번: 접기 메뉴도 맨 위 메뉴와 같은 구조 — 첫 화면(로고)·둘러보기 · 책·보드·지도 · 내 트리 전체 보기 · 순간 추가.
 add('첫 화면',()=>document.querySelector('.brand').click());
 add('둘러보기',()=>$('community-menu').click());
 if(window.LT41){
  add('책',()=>document.querySelector('.tree-views [data-view="track59-sketchbook.html"]').click());
  add('보드',()=>document.querySelector('.tree-views [data-view="track58-pinboard.html"]').click());
  add('지도',()=>document.querySelector('.tree-views [data-view="track56-network.html"]').click());
 }
 add('내 트리 전체 보기',()=>{member?.snapshot().owned?show('track32-bookshelf.html'):openLoginStart('shelf')});
 if(!$('write-menu').hidden)add('＋ 순간 추가',()=>$('write-menu').click());
}
const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function treeMomentThumb(m){return thumbnailCandidates(m,{autoLoad:true})[0]||''}
function treeCoverMarkup(tree){
 // #380 5번: 드롭다운 표지도 같은 판정(coverModeOf)을 따른다 — 디자인을 고른 트리는 사진 대신 디자인 보지를 보여 준다.
 const mode=coverModeOf(tree);
 if(mode==='design'){
  const design=normalizeCoverDesign(tree?.coverDesign);
  if(design)return `<span class="tree-cover" data-cover-design="${escHTML(design)}" aria-hidden="true"></span>`;
 }
 const moments=Array.isArray(tree?.moments)?[...tree.moments].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))):[];
 const cover=mode!=='design'&&tree?.coverMomentId?moments.find(m=>m.id===tree.coverMomentId):null;
 const chosen=(cover&&treeMomentThumb(cover)?cover:null)||moments.find(m=>Boolean(treeMomentThumb(m)))||null;
 const thumb=chosen?treeMomentThumb(chosen):'';
 const fallback=chosen?coverFallbackAttrs(chosen):'';
 return `<span class="tree-cover" aria-hidden="true">${thumb?`<img src="${escHTML(thumb)}"${fallback} alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</span>`;
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
 // #380 5번: '정리하기' 입구는 여기 한 곳(지금 트리가 모아둔 순간일 때 '정리 전 N' 바로 아래)뿐이다.
 const currentTree=window.LT41?.tree||null;
 const cleanupRow=cleanupAvailable({source,owned:!!member?.snapshot().owned,tree:currentTree})&&member?.snapshot().writable
  ? `<button type="button" role="menuitem" class="tree-item tree-cleanup" data-tree-action="cleanup"><span class="tree-name">정리 전 ${currentTree?.moments?.length||0}개 정리하기</span></button>` : '';
 const manage=source==='server'&&window.LT41&&member?.snapshot().owned&&member.snapshot().writable;
 // #394: 트리 드롭다운 맨 아래 "내 순간 전체 보기"(#380의 "내 트리 전체 보기" 자리 옆). 내 기록(서버)에서만 보인다.
 const momentsEntry=source==='server'&&window.LT41?'<button type="button" role="menuitem" data-tree-action="moments">내 순간 전체 보기</button>':'';
 // #380 2번: 맨 아래 "내 트리 전체 보기" — 지금의 책장 화면(모든 트리의 책장)을 연다. 로그인 상태에서만 보인다.
 const shelfEntry=member?.snapshot().owned?'<button type="button" role="menuitem" data-tree-action="shelf">내 트리 전체 보기</button>':'';
 treePopover.innerHTML=rows+`<div class="tree-foot" role="none">${cleanupRow}<button type="button" role="menuitem" data-tree-action="new">＋ 새 트리</button>${manage?'<button type="button" role="menuitem" data-tree-action="manage">이 트리 관리 (이름·표지)</button><button type="button" role="menuitem" data-tree-action="share">이 트리 공유</button>':''}${shelfEntry}${momentsEntry}</div>`;
  // 트리를 누르면 그 트리로 이동한다: 책·보드·지도를 보던 중이면 같은 보기로, 그 외(첫 화면·내 트리·둘러보기)에는 그 트리의 책으로. 주소도 따라오게 남긴다.
  const TREE_VIEWS=new Set(['track59-sketchbook.html','track58-pinboard.html','track56-network.html']);
  treePopover.querySelectorAll('[data-tree-id]').forEach(b=>b.onclick=()=>{const id=b.dataset.treeId;closeTreeMenu();if(!id)return;const wasTreeView=TREE_VIEWS.has(current);choose(id);if(!wasTreeView)show('track59-sketchbook.html',false);flowNavigation();writeLocation();});
 treePopover.querySelector('[data-tree-action="new"]')?.addEventListener('click',()=>{closeTreeMenu();if(member?.snapshot().writable)openEditor('new');else openLoginStart('new-tree');});
 treePopover.querySelector('[data-tree-action="cleanup"]')?.addEventListener('click',()=>{closeTreeMenu();shellCleanup.open({});});
 treePopover.querySelector('[data-tree-action="manage"]')?.addEventListener('click',()=>{shellPanels.openTreeManager();closeTreeMenu();});
 treePopover.querySelector('[data-tree-action="share"]')?.addEventListener('click',()=>{closeTreeMenu();$('share-menu').click();});
 // #394: 첫 화면 순간 목록을 지금 트리가 골라진 상태로 연다. 화면을 다시 불러오므로 요청을 전역 플래그로 남긴다.
 treePopover.querySelector('[data-tree-action="moments"]')?.addEventListener('click',()=>{closeTreeMenu();window.LT41_MOMENTS_OPEN={treeId:window.LT41?.tree?.id||''};show('src064-orbit.html');});
 // #380 2번: 드롭다운 맨 아래 "내 트리 전체 보기" → 책장 화면. 로그인 상태에서만 이 버튼이 그려진다.
 treePopover.querySelector('[data-tree-action="shelf"]')?.addEventListener('click',()=>{closeTreeMenu();show('track32-bookshelf.html');});
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
 // #380 4 마지막: 둘러보기도 공통 틀의 닫기 규칙(×·바같 클릭·Esc·초점 복귀)을 쓴다.
 if(event.key==='Escape'&&c.open&&![...document.querySelectorAll('dialog[open]')].some(d=>d!==c&&d.matches(':modal')))shellDialogs.requestClose('community-panel');
});
const initialRoute=parseSelectionRoute(location.hash);
let model=null,current=screenForView(initialRoute.view)[1],source='example',loadGeneration=0,previousDirty=false,member=null,handledHash=null,activeShareId=null,resumeAfterStart=null;
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
// #425: 순간 추가 한 창 — 쉬운 추가·자세한 추가를 한 창의 탭으로 오간다(shell/write-panel.mjs).
const shellWrite=createWritePanel({$});
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
  // #368: 읽기 전용 안내는 내 기록 창 대신 설정 "내 데이터" 묶음으로 연다.
  openSettingsData:intent=>openAccountData(intent),
  show:(file,write)=>show(file,write),
  selection:()=>stateSelection(),
  openFirstJourney:options=>openFirstJourney(options),
  // #453 A: 예시를 둘러보는 중에 편집기를 열려 하면 로그인 화면 대신 내 기록으로 돌아온다.
  resumeMember:intent=>resumeMember(intent),
  openLoginStart:intent=>openLoginStart(intent),
  // #425: 같은 창의 탭(쉬운 추가·자세한 추가)과 제목을 이 모듈이 정한다.
  writePanel:shellWrite,
  // #380 4 2차: 편집기의 취소 버튼도 공통 닫기 규칙(×·바깥·Esc와 같은 확인·업로드 중 막기)을 쓴다.
  requestClose:id=>shellDialogs.requestClose(id)
});
function openEditor(mode,parentId=''){return shellPanels.openEditor(mode,parentId);}
// #453 B: 탭을 보일 때(그리고 창을 여는 두 길 모두에서) 편집기 기준값을 다시 잡는다.
shellWrite.setTabHook(tab=>shellPanels.onWriteTab(tab));
// 쉬운 추가(#빠른 추가 ②): 창 열기·끌어다 놓기는 shell/quick-add.mjs가 맡는다.
// #425부터 입구는 하나다 — 같은 창을 열고 먼저 보일 탭만 설정값(lt41.writeTab)이 정한다.
const shellQuick=createQuickAdd({
  $,
  getMember:()=>member,
  getSource:()=>source,
  getCurrent:()=>current,
  notify:text=>notify(text),
  panel:id=>panel(id),
  openSettingsData:intent=>openAccountData(intent),
  choose:(id,momentId)=>choose(id,momentId),
  openEditor:(mode,parentId)=>openEditor(mode,parentId),
  resumeMember:intent=>resumeMember(intent),
  resetEditorBaseline:()=>shellPanels.startQuickSession(),
  openLoginStart:intent=>openLoginStart(intent),
  writePanel:shellWrite,
  requestClose:id=>shellDialogs.requestClose(id),
  // 사진 올리기는 기존 업로더(#310 onUploaded·imagesOnly)를 그대로 쓴다.
  mountUpload:mountPrivateUpload
});
$('write-menu').onclick=()=>{if(source!=='server'&&member?.snapshot().owned){void resumeMember('write');return;}shellQuick.openWrite();};
// 빠른 담기 입구: 붙여넣기 + 공유 시트 진입(판정·추적은 ../quick-intake.mjs 한 벌).
const shellIntake=createQuickIntake({
  getMember:()=>member,
  getSource:()=>source,
  // 담기·중복·로그인 필요 안내는 방금 한 행동의 결과다 — 상태 안내가 곧바로 덮지 않게 hold로 띄운다(#353 후속).
  notify:text=>notify(text,{hold:true}),
  openLoginStart:intent=>openLoginStart(intent),
  describe:(url)=>globalThis.LTMedia?.describe?.(url),
});
// #327 2부: 모아둔 순간 정리 창. #380 5번: 입구는 트리 ▾ 드롭다운의 '정리 전 N개 정리하기' 한 곳뿐이고,
// 순간 상세의 '다른 트리로 옮기기'(lt41-move 메시지)는 그 순간을 옮기는 별개 동작으로 남는다.
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
  thumbCandidatesOf:moment=>thumbnailCandidates(moment,{autoLoad:true}),
  fallbackCardOf:moment=>fallbackCardData(moment,{writable:!!member?.snapshot().writable}),
  emotionToneOf,
  addTitleLabel:ADD_TITLE_LABEL,
  unavailableLabel:VIDEO_UNAVAILABLE_TEXT,
  momentTitle:moment=>{const main=titleView(moment,titleDisplayValue()).main;return main||withoutAutoTitle(moment).title;},
});
mountThumbFallback(document,{
  isReadOnly:()=>source!=='server'||!member?.snapshot().writable,
  onEditTitle:({treeId,momentId})=>{
    if(source!=='server'||!member?.snapshot().writable)return;
    if($('cleanup-panel')?.open)$('cleanup-panel').close();
    const targetTree=treeId
      ?model?.trees?.find(t=>t.id===treeId&&t.moments.some(m=>m.id===momentId))
      :(window.LT41?.tree?.moments.some(m=>m.id===momentId)?window.LT41.tree:model?.trees?.find(t=>t.moments.some(m=>m.id===momentId)));
    if(targetTree){
      if(window.LT41?.tree?.id!==targetTree.id)choose(targetTree.id,momentId);
      else{window.LT41.momentId=momentId;links();writeLocation();}
    }
    openEditor('edit');
    shellPanels.focusTitleInput?.();
  }
});
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
  openSettingsData:intent=>openAccountData(intent),
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
  // #480 L13: 공유 목록·공유 미리보기의 날짜도 계정 설정 한 벌을 따른다(책·보드·지도·첫 화면과 같음).
  getDateStyle:()=>currentDateStyle(),
  shareApi,
  notify:text=>notify(text),
  panel:id=>panel(id),
  openSettingsData:intent=>openAccountData(intent),
  show:(file,write)=>show(file,write),
  links:()=>links(),
  writeLocation:(mode)=>writeLocation(mode),
  choose:(id,momentId)=>choose(id,momentId),
  openEditor:(mode,parentId)=>openEditor(mode,parentId),
  focusTitleInput:()=>shellPanels.focusTitleInput?.(),
  openLoginStart:intent=>openLoginStart(intent),
  openAccountMenu:()=>openAccountMenu(),
  openCleanup:options=>shellCleanup.open(options),
  sample:(selection,view)=>sample(selection,view),
  applyTheme:(theme)=>applyTheme(theme),
  paintThemeControls:()=>paintThemeControls(),
  viewForFile:file=>viewForFile(file),
  exampleTree,
  journey:shellJourney,
  // #368 3차: 공유 창 시작값(처음 열 보기·둘러보기 올림 기본)은 계정 설정에서 온다.
  getShareDefaults:()=>({view:currentShareView(),discover:currentShareDiscover()})
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
function panel(id){const target=$(id);if(!target.open){if(target.dataset.ltPanel){shellDialogs.noteOpener(id);if(target.dataset.ltPanel==='full')shellDialogs.syncPanelTop();}target.showModal();}}
// 대화상자 접근성(Tab 순환·Esc 복귀·포커스 되돌리기)은 shell/dialogs.mjs가 맡는다(#231 1-B 후속).
const shellDialogs=createDialogs({
  $,
  closeTreeTips:()=>closeTreeTips(),
  closeAccountMenu:()=>closeAccountMenu(),
  // #380 4: 공통 틀이 닫을 때 "저장하지 않고 닫을까요?"를 묻는 판정 — 트리 관리는 폼 기준값과 비교한다.
  isTreeDirty:()=>shellPanels.treeDirty(),
  // #380 4 2차: 편집기는 입력(제목·메모·주소·사진·고른 연결)이 바뀌었으면 더러움,
  // 순간 잇기는 고른 연결이 저장 전이면 더러움이다. 어느 쪽이든 공통 틀이 한 번 묻고 닫는다.
  // #425: 한 창에서 보이는 구역만 본다 — 쉬운 추가는 주소를 적고 아직 담지 않았을 때,
  // 자세한 추가는 폼(제목·마음·주소·첨부·연결)이 기준값과 다를 때 더러움이다.
  isEditorDirty:()=>($('write-easy').hidden?shellPanels.detailedDirty():$('quick-url').value.trim()!==''),
  isConnectionDirty:()=>connectionDirty(),
  // #380 4 마지막: 빠른 추가는 주소를 적어 두고 아직 담지 않았을 때, 공유는 공개 범위를 미리 봤는데 링크를 아직 만들지 않았을 때만 더러움이다.
  // 설정·내 보관 파일·둘러보기·추가 방식 고르기는 입력을 적어 두지 않으므로 바로 닫힌다.
  isShareDirty:()=>{const create=$('share-create');return $('share-panel').open&&!!create&&!create.disabled&&$('share-created').hidden;},
  // #368 2차: 설정의 프로필 폼은 쓰다 만 이름·색이 있으면 공통 틀이 한 번 묻는다. 다른 설정 항목은 누르는 즉시 적용되어 더러움이 없다.
  isSettingsDirty:()=>profileDirty(),
  // #480 M8: 정리 창 — 새 트리 이름을 적었거나 순간 고름·옮길 트리가 열 때와 달라졌으면 한 번 묻는다.
  isCleanupDirty:()=>shellCleanup.dirty(),
  // 편집기 규칙이 공통 틀보다 우선한다: 업로드 중에는 Esc·바깥 클릭·× 모두 닫지 않고 이유를 알린다.
  // 빠른 추가의 사진 올리기도 같은 규칙을 쓴다(업로드가 끝나면 곧바로 담기므로 중간에 닫으면 사라진다).
  panelBlocked:id=>id==='write-panel'&&(uploads.busy||shellQuick.uploads?.busy)?'파일 전송을 마치거나 취소해 주세요.':'',
  notify:text=>notify(text)
});

const shellHeader=createHeader({
  $,
  navBar:document.querySelector('.app-header nav'),
  getMember:()=>member,
  getModel:()=>model,
  getSource:()=>source,
  getCurrent:()=>current,
  accountApi,
  // #368: 이메일을 불러오거나 지울 때마다 설정 "프로필" 표시도 같이 칠한다.
  onEmailChange:email=>paintSettingsProfile(email),
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
    // #368 2차·3차: 새로 열린 화면에 페이지 넘김·날짜 표기 값을 알린다(테마와 같은 시점).
    applyPageTurnToFrame(frame);applyDateStyleToFrame(frame);
    // #478: 고급 기능 보기 값도 새로 열린 화면에 알린다. applyAdvanced는 지금 화면(#view)에만 보내므로
    // 화면을 옮긴 뒤 열린 프레임은 단순 모드로 남았다(보드 도구가 숨는 결함).
    try{frame.contentWindow.postMessage({type:'lt41-advanced',value:readAdvanced()},location.origin)}catch{}
    // 화면 교대(두 장 앞뒤 바꿈)가 늦게 끝나는 경우를 위해 한 번 더 알린다(같은 값을 또 보내는 건 무해하다).
    setTimeout(()=>applyDateStyleToFrame(frame),1600);
    d.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;let file;if(b.matches('[data-action="tree"],[data-menu="tree"]'))file='track32-bookshelf.html';if(b.matches('#storyBook,[data-menu="book"]'))file='track59-sketchbook.html';if(current==='track56-network.html'&&b.id==='openMoment')file='track59-sketchbook.html';if(file){e.preventDefault();e.stopImmediatePropagation();show(file);}},true);
  }
});
function frames(){return shellScreens.frames();}
function hideFrames(){return shellScreens.hideFrames();}
function showInFrame(url,title){return shellScreens.showInFrame(url,title);}
function show(file,write=true){return shellScreens.show(file,write);}
function frameLoaded(frame){return shellScreens.frameLoaded(frame);}

// #380 5번: '정리하기' 입구는 트리 ▾ 드롭다운 한 곳에서만 그린다(renderTreeMenu). 헤더 단추는 없앴다.
function viewContext(){}
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
// #380 4 2차: 순간 잇기 패널이 보여 준 연결 목록(고른 연결)을 기억해 두고, 그 뒤로 트리의 연결이 달라졌으면 더러움이다.
// 패널 자체는 연결을 만들지 않으므로 보통은 확인 없이 닫힌다(보여 준 것과 저장본이 같기 때문).
// #380 5번: 첫 화면 움직임 멈춤 상태(메모리에만 둔다 — 보기 메뉴 때와 같다. 화면을 다시 열면 처음 상태).
let motionPaused=false;
let connectionShown='';
function connectionDirty(){return $('connection-panel').open&&connectionSignature(window.LT41?.tree,window.LT41?.momentId)!==connectionShown;}
function links(){viewContext();const c=window.LT41;$('connections').replaceChildren();if(!c){setConnectionCount(0);$('selection-label').textContent='트리를 먼저 불러오세요.';connectionShown='';return;}
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
 connectionShown=connectionSignature(c.tree,c.momentId);
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
  const wanted=tipsWanted({owned:!!member?.snapshot().owned,treeCount:model?.trees?.length||0,seen:readTipsSeen(localStorage),source});
  if(wanted)showTreeTips();else closeTreeTips(false);
}
$('tree-tips-close')?.addEventListener('click',()=>closeTreeTips());
// 2026-11-07: 390·360에서 탭 7개가 폭을 넘는다. 탭 줄은 가로 스크롤이고, 화면을 바꿀 때 현재 탭을 가운데로 당겨 보이게 한다.
// 넘치는 쪽 끝에만 페이드를 켜서 잘린 것이 아니라 더 있다는 신호를 준다. 데스크톱(넓은 폭)은 스크롤이 없어 아무 일도 하지 않는다.
const navBar=document.querySelector('.app-header nav');
const narrowNav=()=>matchMedia('(max-width:780px)').matches;
function choose(id,momentId){const tree=model.trees.find(t=>t.id===id);window.LT41=tree?{tree,trees:model.trees,source,momentId:tree.moments.find(m=>m.id===momentId)?.id||tree.moments.find(m=>m.parentId===null)?.id||tree.moments[0]?.id,prefs:currentPrefs(),writable:source==='server'&&!!member?.snapshot().writable,}:null;
 if(tree||current==='src064-orbit.html')show(current,false);else{flowNavigation();document.body.classList.remove('home-screen');hideFrames();$('empty').hidden=false;links();}}
// #453 D2: 빈 화면 문구·단추는 계정 상태에 맞춘다. 로그인한 사람에게 '로그인한 계정의 기록을 불러오세요'는 어색하고,
// 백업 파일 열기는 계정 없이 쓰는 입구라 로그인 상태에서는 숨긴다(로그아웃은 지금 그대로 둔다).
function paintEmptyCopy(){
 const owned=!!member?.snapshot().owned;
 $('empty').querySelector('h1').textContent=owned?'아직 트리가 없어요.':'다시 펼칠 순간을 기다리고 있어요.';
 $('empty').querySelector('p').textContent=owned?'예시를 둘러보거나 첫 트리를 만들어 보세요.':'예시를 둘러보거나 로그인한 계정의 기록을 불러오세요.';
 $('empty-sample').hidden=false;$('empty-records').hidden=false;
 $('empty-records').textContent=owned?'첫 트리 만들기':'내 기록 불러오기';
 $('empty-file').hidden=owned;
}
function load(input,kind,selection={},fallback={}){
 model=kind==='example'?{trees:[exampleTree]}:workspaceModel(input);
 source=kind;
 if(kind!=='share'){
  activeShareId=null;
  paintEmptyCopy();
 }
 document.body.dataset.recordSource=kind;
 document.body.dataset.member=member?.snapshot().owned?'in':'out';
 document.body.dataset.treeCount=String(model?.trees?.length||0);
 // #368: 트리 고르기는 맨 위 트리 ▾ 드롭다운 한 곳이다(옛 내 기록 창의 select는 없앴다).
 const resolved=resolveAccountPosition(model.trees,selection,fallback),chosen=model.trees.find(t=>t.id===resolved.position.treeId);
 choose(chosen?.id,resolved.position.momentId);
 return resolved;
}
function clear(){load({revision:0,state:{version:1,trees:[]}},'file');}
function stateSelection(){return {treeId:window.LT41?.tree.id,momentId:window.LT41?.momentId};}
function formDirty(){return shellPanels.formDirty();}
function treeDirty(){return shellPanels.treeDirty();}
function canLeave(){return !(formDirty()||treeDirty()||member?.snapshot().dirty)||confirm('아직 저장되지 않은 입력이 있어요. 현재 기록을 백업한 뒤 이동하는 것을 권합니다. 저장하지 않고 이동할까요?');}
function leaveMember(){if(!canLeave())return false;member?.dispose();member=null;return true;}
// #453 A: 예시를 둘러보는 동안에도 "로그인한 계정"은 그대로 둔다. 저장 연결만 끊어(dispose) 예시 내용이 계정에 섞이지 않게 하고,
// 다시 내 기록으로 돌아올 때는 startMember()가 새 연결을 연다. 로그아웃 상태면 지금처럼 셸 상태를 비운다.
function pauseMember(){if(!canLeave())return false;if(!member?.snapshot().owned){member?.dispose();member=null;return true;}member.dispose();return true;}
// #453 A: 예시를 둘러보는 중에 순간 추가·새 트리를 누르면 내 기록으로 돌아와서 이어 간다(로그인 화면으로 보내지 않는다).
function resumeMember(intent){resumeAfterStart=intent||'write';return startMember();}
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
   if(!initialized){if(route)requested=route;else if(!selection)requested=saved;
    // #368 3차: 로그인 후 처음 보여 줄 곳(첫 화면/내 트리 전체 보기/이어 읽기). resume이 지금 동작이라 기본값이고,
    // 주소(#my/…·#share/…·#home 등)가 있으면 그 주소가 이긴다(기존 규칙 그대로).
    const startPlace=(()=>{try{return normalizeStartPlace(state.prefs?.startPlace)}catch{return 'resume'}})();
    let view=memberStartupView(active,route,saved,viewForFile(current));
    if(startPlace!=='resume'&&!route&&active?.scope!=='owner'&&!(active?.scope==='screen'&&active.explicit)&&!pending)view=startPlace==='shelf'?'shelf':'home';
    current=screenForView(view)[1];}
   const resolved=load({revision:0,state},'server',requested,saved);initialized=true;
   if(window.LT41)window.LT41.prefs=state.prefs;
   // #441 후속: 다른 기기의 첫 그림도 계정 날짜 표기를 따르도록, 로그인 때 기기 미러 캐시를 계정값으로 채운다.
   try{localStorage.setItem('lt41.dateStyle',normalizeDateStyle(state.prefs?.dateStyle));}catch{}
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
  updateAccountControls();
  if(session.snapshot().writable&&sessionStorage.getItem(PENDING_NEW)==='1'){sessionStorage.removeItem(PENDING_NEW);openEditor('new');}
  shellAuth.consumeLoginIntent(session.snapshot());
  if(resumeAfterStart){const intent=resumeAfterStart;resumeAfterStart=null;if(intent==='write')shellQuick.openWrite();else openEditor(intent);}
  if(startupNotice)notify(startupNotice);
 }
 if(generation===loadGeneration){const startupJourney=parseJourneyRoute(location.hash);if(startupJourney){if(session.snapshot().owned&&session.snapshot().writable)openFirstJourney({step:startupJourney.step,route:true});else{history.replaceState(null,'','#home');handledHash='#home';}}}
}
function sample(selection={},view){if(!pauseMember())return;++loadGeneration;if(view)current=view;load(null,'example',selection);if(view)writeLocation();$('save-feedback').hidden=true;if($('account-settings').open)$('account-settings').close();}
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
 $('account-assets-open').onclick=()=>{closeAccountMenu();openAssets($('account-avatar'));};
// #368: 설정 "내 데이터"의 내 보관 파일 열기. 창 위에 보관 파일 창이 열리고 닫으면 이 버튼으로 초점이 돌아온다.
$('settings-assets-open').onclick=()=>openAssets($('settings-assets-open'));
 $('editor-assets-open').onclick=()=>openAssets($('editor-assets-open'));
 for(const b of document.querySelectorAll('[data-set-theme]'))b.onclick=()=>{writeTheme(localStorage,b.dataset.setTheme);applyTheme();paintThemeControls();};
 $('account-advanced').onclick=()=>{const next=!readAdvanced();try{localStorage.setItem(advancedKey(),next?'1':'0')}catch{}applyAdvanced();};
 $('account-open-settings').onclick=()=>{closeAccountMenu();void openAccountSettings();};
 $('advanced-backup').onclick=()=>backup();
 // #368: 기록 가져오기는 JSON 선택 input을 연다. input은 창 밖에 숨겨 두어 설정이 닫혀 있어도(빈 화면의 백업 파일 열기) 열린다.
 // CTO 결정(2026-11-12): 설정에는 "기록 가져오기" 하나만 둔다 — "백업 파일 열기"는 같은 선택 창이라 중복이고,
 // 로그아웃 빈 화면의 "백업 파일 열기"(#empty-file)는 계정 없이 쓰는 입구로 남긴다.
 $('advanced-import').onclick=()=>$('file').click();
 $('empty-file').onclick=()=>$('file').click();
 for(const b of document.querySelectorAll('[data-title-display]'))b.onclick=()=>setTitleDisplay(b.dataset.titleDisplay);
 // #380 5번: '보기 ◐' 메뉴(테마·움직임·카드 출처)를 설정 창의 '화면' 묶음으로 옮겼다.
 // 저장 키(lt41.theme·lt41.homeCards)와 기본값은 그대로다.
 const HOME_CARD_MODES=['example','popular','mine','mix'];
 function readHomeCardsMode(){try{const v=localStorage.getItem('lt41.homeCards');return HOME_CARD_MODES.includes(v)?v:''}catch{return ''}}
 function paintScreenControls(){
  const mode=readHomeCardsMode()||'example';
  for(const b of document.querySelectorAll('[data-home-cards]'))b.setAttribute('aria-checked',String(b.dataset.homeCards===mode));
  // #425: '순간 추가 먼저 보일 탭' — 저장값이 없으면 쉬운 추가가 켜져 있다.
  const tab=readWriteTab(localStorage);
  for(const b of document.querySelectorAll('[data-write-tab]'))b.setAttribute('aria-checked',String(b.dataset.writeTab===tab));
  const motion=$('settings-motion');
  if(motion){motion.setAttribute('aria-pressed',String(motionPaused));motion.textContent=motionPaused?'켜기':'멈추기';}
 }
 for(const b of document.querySelectorAll('[data-home-cards]'))b.onclick=()=>{
  if(!HOME_CARD_MODES.includes(b.dataset.homeCards))return;
  try{localStorage.setItem('lt41.homeCards',b.dataset.homeCards)}catch{}
  paintScreenControls();
  try{$('view').contentWindow.postMessage({type:'lt41-home-cards',mode:b.dataset.homeCards},location.origin)}catch{}
  notify('첫 화면 카드를 바꿨어요. 첫 화면으로 돌아가면 그대로 보입니다.');
 };
 for(const b of document.querySelectorAll('[data-write-tab]'))b.onclick=()=>{
  const tab=writeWriteTab(localStorage,b.dataset.writeTab);
  paintScreenControls();
  notify(tab==='detailed'?'순간 추가를 자세한 추가로 엽니다.':'순간 추가를 쉬운 추가로 엽니다.');
 };
 $on('settings-motion',()=>{motionPaused=!motionPaused;paintScreenControls();try{$('view').contentWindow.postMessage({type:'lt41-motion',paused:motionPaused},location.origin)}catch{}notify(motionPaused?'첫 화면 움직임을 멈췄어요.':'첫 화면 움직임을 다시 켰어요.');});
 paintScreenControls();
 $('account-logout').onclick=async()=>{closeAccountMenu();$('logout').click();};
document.addEventListener('click',e=>{
 if(!e.target.closest('.account-slot'))closeAccountMenu();
});
// #368: 빈 화면의 "내 기록 불러오기" — 로그아웃이면 로그인으로, 읽기 전용이면 설정 "내 데이터"로, 평소엔 순간 추가(새 트리)로.
$('empty-records').onclick=()=>{if(!member?.snapshot().owned){openLoginStart('first');return;}member.snapshot().writable?openEditor():openAccountData();};
$('empty-sample').onclick=sample;
$('sample').onclick=sample;$('clear').onclick=()=>{if(!leaveMember())return;++loadGeneration;clear();$('save-feedback').hidden=true;$('file').value='';if($('account-settings').open)$('account-settings').close();};
$('server').onclick=startMember;
const ACCOUNT_DELETE_PHRASE='탈퇴합니다';
let accountExpected=null;
function accountConfirmMatches(){
 const typed=$('account-confirm').value.trim();
 if(!accountExpected||!typed)return false;
 return accountExpected.kind==='email'?typed.toLowerCase()===accountExpected.value:typed===accountExpected.value;
}
// #368: 설정 창 묶음 — 입구는 묶음 이름으로 열고 해당 묶음(제목)으로 초점과 스크롤을 옮긴다.
const SETTINGS_SECTIONS={profile:'account-settings-profile',screen:'account-settings-screen',look:'account-settings-look',share:'account-settings-share',write:'account-settings-write',data:'account-settings-data',account:'account-settings-account'};
function focusSettingsSection(section=''){
 const box=$('account-settings');if(!box?.open)return;
 // #453 C1: 기본은 맨 위에서 연다. 입구가 구역을 지정했을 때만 그 묶음으로 내려간다.
 if(!section)return;
 const target=$(SETTINGS_SECTIONS[section]||SETTINGS_SECTIONS.profile);if(!target)return;
 queueMicrotask(()=>{target.scrollIntoView({block:'start'});const heading=target.querySelector('h3');if(heading)heading.focus({preventScroll:true});});
}
// #368: 프로필 묶음 표시. 동그라미 글자는 표시 이름 첫 글자 → 이메일 첫 글자 → 나(#368 2차, header-state 규칙),
// 색은 고른 색이고 고르지 않으면 지금 기본색이다. 이메일은 가리지 않는다(자기 계정 화면).
function savedPrefs(){try{return member?.state?.()?.prefs||{}}catch{return {}}}
function paintSettingsProfile(email=shellHeader.currentAccountEmail()){
 const prefs=savedPrefs();
 const view=accountPresentation({owned:!!member?.snapshot().owned,email,name:prefs.displayName});
 const accent=normalizeAccentColor(prefs.accentColor);
 const initial=$('settings-profile-initial');if(initial){initial.textContent=view.initial;initial.dataset.accent=accent;}
 const name=$('settings-profile-name');if(name)name.textContent=(typeof prefs.displayName==='string'&&prefs.displayName.trim())?prefs.displayName.trim():(email?'이름 없음':'내 계정');
 const mail=$('settings-profile-email');if(mail){mail.textContent=email||'';mail.hidden=!email;}
}
// #368 2차: 프로필 편집 — 계정 기록의 설정 칸(state.prefs)에 저장한다(새 API 없음, setPrefs 재사용).
// 쓰다 만 입력이 있으면 공통 틀(shell/dialogs.mjs PANEL_DIRTY)이 "저장하지 않고 닫을까요?"를 한 번 묻는다.
let profileBaseline='';
function profileFormValue(){return JSON.stringify({name:$('profile-name')?.value??'',color:$('profile-color')?.querySelector('[aria-checked="true"]')?.dataset.accentColor??''});}
function profileDirty(){if(!$('account-settings').open)return false;if(!profileBaseline)return false;return profileFormValue()!==profileBaseline;}
function fillProfileForm(){
 const prefs=savedPrefs();
 if($('profile-name'))$('profile-name').value=typeof prefs.displayName==='string'?prefs.displayName:'';
 for(const b of document.querySelectorAll('[data-accent-color]'))b.setAttribute('aria-checked',String(b.dataset.accentColor===normalizeAccentColor(prefs.accentColor)));
 profileBaseline=profileFormValue();
 if($('profile-error'))$('profile-error').textContent='';
}
$('profile-color')?.addEventListener('click',event=>{const b=event.target.closest('[data-accent-color]');if(!b)return;for(const x of document.querySelectorAll('[data-accent-color]'))x.setAttribute('aria-checked',String(x===b));});
$('profile-reset').onclick=()=>{fillProfileForm();};
$('profile-form').onsubmit=event=>{
 event.preventDefault();
 if(!member?.snapshot().owned){notify('로그인한 뒤 프로필을 저장할 수 있어요.');return;}
 const submit=$('profile-form').querySelector('button[type="submit"]');
 const patch={displayName:$('profile-name').value,accentColor:$('profile-color').querySelector('[aria-checked="true"]')?.dataset.accentColor||''};
 if(submit)submit.disabled=true;
 let saved=null;
 try{saved=member.apply('setPrefs',patch);}catch(e){saved=null;}
 if(submit)submit.disabled=false;
 if(!saved){$('profile-error').textContent='프로필을 저장하지 못했어요. 저장 연결을 확인한 뒤 다시 시도해 주세요.';return;}
 renderAccount();
 paintSettingsProfile();
 fillProfileForm();
 notify('프로필을 저장했어요. 계정에 저장됩니다.');
};
// #368 2차: 페이지 넘김 — 이 기기에만 저장한다(localStorage lt41.pageTurn). 기본은 종이처럼이고,
// 시스템 움직임 줄이기가 켜져 있으면 기억책이 고른 값과 상관없이 부드럽게로 읽는다. 전달은 테마와 같은 방식
// (프레임 문서 속성 + lt41-page-turn 메시지)이다.
function currentPageTurn(){return readPageTurn(localStorage);}
function applyPageTurnToFrame(frame){
 try{frame.contentDocument?.documentElement?.setAttribute('data-lt-page-turn',currentPageTurn());}catch{}
 try{frame.contentWindow?.postMessage({type:'lt41-page-turn',value:currentPageTurn()},location.origin);}catch{}
}
function paintPageTurnControls(){const value=currentPageTurn();for(const b of document.querySelectorAll('[data-page-turn]'))b.setAttribute('aria-checked',String(b.dataset.pageTurn===value));}
// #368 3차: 날짜 표기·처음 보여 줄 곳·공유 기본값은 계정(state.prefs), 관계 지도 기본 보기는 이 기기(lt41.network.view — network.js와 같은 키).
// 날짜 표기는 책·보드·지도·첫 화면이 같은 한 벌(formatDisplayDate)로 따르고, 셸은 프레임 속성+lt41-date-style 메시지로 알린다.
function currentDateStyle(){try{return normalizeDateStyle(member?.state?.().prefs?.dateStyle)}catch{return 'dot'}}
function applyDateStyleToFrame(frame){
 try{frame.contentDocument?.documentElement?.setAttribute('data-lt-date-style',currentDateStyle());}catch{}
 try{frame.contentWindow?.postMessage({type:'lt41-date-style',value:currentDateStyle()},location.origin);}catch{}
}
function paintDateStyleControls(){const value=currentDateStyle();for(const b of document.querySelectorAll('[data-date-style]'))b.setAttribute('aria-checked',String(b.dataset.dateStyle===value));}
for(const b of document.querySelectorAll('[data-date-style]'))b.onclick=()=>{
 if(!member?.snapshot().owned){notify('로그인한 뒤 날짜 표기를 바꿀 수 있어요.');return;}
 try{member.apply('setPrefs',{dateStyle:b.dataset.dateStyle});}catch(e){notify('날짜 표기를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 // 기기 캐시: 화면(iframe)은 그려지는 시점에 계정 값을 모르므로 마지막 표기를 같이 둔다(어긋나면 메시지로 바로 고쳐 그린다).
 try{localStorage.setItem('lt41.dateStyle',b.dataset.dateStyle)}catch{}
 paintDateStyleControls();for(const f of frames())applyDateStyleToFrame(f);
 notify(b.dataset.dateStyle==='long'?'날짜를 11월 10일로 보여요.':b.dataset.dateStyle==='dash'?'날짜를 2026-11-10으로 보여요.':'날짜를 2026. 11. 10으로 보여요.');
};
paintDateStyleControls();
function currentStartPlace(){try{return normalizeStartPlace(member?.state?.().prefs?.startPlace)}catch{return 'resume'}}
function paintStartPlaceControls(){const value=currentStartPlace();for(const b of document.querySelectorAll('[data-start-place]'))b.setAttribute('aria-checked',String(b.dataset.startPlace===value));}
for(const b of document.querySelectorAll('[data-start-place]'))b.onclick=()=>{
 if(!member?.snapshot().owned){notify('로그인한 뒤 처음 보여 줄 곳을 바꿀 수 있어요.');return;}
 try{member.apply('setPrefs',{startPlace:b.dataset.startPlace});}catch(e){notify('처음 보여 줄 곳을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 paintStartPlaceControls();
 notify('처음 보여 줄 곳을 저장했어요. 다음에 로그인하면 그곳부터 열어요.');
};
paintStartPlaceControls();
const NETWORK_VIEW_KEY='lt41.network.view';
function currentNetworkView(){try{return localStorage.getItem(NETWORK_VIEW_KEY)==='concentric'?'concentric':'network'}catch{return 'network'}}
function paintNetworkViewControls(){const value=currentNetworkView();for(const b of document.querySelectorAll('[data-network-view]'))b.setAttribute('aria-checked',String(b.dataset.networkView===value));}
function applyNetworkViewToFrame(frame){try{frame.contentWindow?.postMessage({type:'lt41-network-view',value:currentNetworkView()},location.origin);}catch{}}
for(const b of document.querySelectorAll('[data-network-view]'))b.onclick=()=>{
 try{localStorage.setItem(NETWORK_VIEW_KEY,b.dataset.networkView)}catch{}
 paintNetworkViewControls();for(const f of frames())applyNetworkViewToFrame(f);
 notify(b.dataset.networkView==='concentric'?'지도를 동심원 보기로 열어요.':'지도를 그물 보기로 열어요.');
};
paintNetworkViewControls();
function currentShareView(){try{return normalizeShareView(member?.state?.().prefs?.shareView)}catch{return 'book'}}
function currentShareDiscover(){try{return normalizeShareDiscover(member?.state?.().prefs?.shareDiscover)}catch{return false}}
function paintShareControls(){
 const view=currentShareView(),discover=currentShareDiscover();
 for(const b of document.querySelectorAll('[data-share-view]'))b.setAttribute('aria-checked',String(b.dataset.shareView===view));
 for(const b of document.querySelectorAll('[data-share-discover]'))b.setAttribute('aria-checked',String((b.dataset.shareDiscover==='on')===discover));
}
for(const b of document.querySelectorAll('[data-share-view]'))b.onclick=()=>{
 if(!member?.snapshot().owned){notify('로그인한 뒤 공유 기본값을 바꿀 수 있어요.');return;}
 try{member.apply('setPrefs',{shareView:b.dataset.shareView});}catch(e){notify('공유 기본값을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 paintShareControls();notify('공유 창이 이 보기로 열려요.');
};
for(const b of document.querySelectorAll('[data-share-discover]'))b.onclick=()=>{
 if(!member?.snapshot().owned){notify('로그인한 뒤 공유 기본값을 바꿀 수 있어요.');return;}
 try{member.apply('setPrefs',{shareDiscover:b.dataset.shareDiscover==='on'});}catch(e){notify('공유 기본값을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 paintShareControls();notify(b.dataset.shareDiscover==='on'?'링크를 만들면 둘러보기에 올릴지 한 번 물어봐요.':'새 공유를 주소로만 공개하는 것으로 시작해요.');
};
paintShareControls();
// 보관 파일 용량 보기 — 보관 파일 창과 같은 값(/api/media)을 같은 형식으로 보여 준다. 새 API 없음.
async function paintSettingsUsage(){
 const el=$('settings-usage');if(!el)return;
 el.hidden=false;el.textContent='보관 파일 사용량을 불러오고 있어요…';
 const answer=await accountApi.listMedia().catch(()=>null);
 if(!$('settings-usage'))return;
 const data=answer?.media;
 if(!answer?.ok||!data){el.hidden=true;el.textContent='';return;}
 el.textContent=Math.round(data.usedBytes/1000000)+' MB / '+Math.round(data.quotaBytes/1000000)+' MB 사용 · '+data.items.length+' / '+data.maxItems+'개';
}
for(const b of document.querySelectorAll('[data-page-turn]'))b.onclick=()=>{
 const next=writePageTurn(localStorage,b.dataset.pageTurn);
 paintPageTurnControls();
 for(const f of frames())applyPageTurnToFrame(f);
 notify(next==='smooth'?'페이지 넘김을 부드럽게 바꿨어요.':'페이지 넘김을 종이처럼 바꿨어요.');
};
paintPageTurnControls();
// #368: 옛 내 기록 창을 여던 입구(읽기 전용 안내·빈 화면)의 공통 행선지. 로그아웃이면 로그인으로 보낸다.
function openAccountData(intent='first'){
 if(!member?.snapshot().owned){openLoginStart(intent);return;}
 void openAccountSettings({section:'data'});
}
async function openAccountSettings({section=''}={}){
 accountExpected=null;$('account-feedback').textContent='';
 // #453 C2: 지난번에 뜬 '내 기록을 불러왔어요.' 같은 안내가 창 안에 남지 않는다.
 if($('settings-feedback'))$('settings-feedback').textContent='';$('account-confirm').value='';$('account-delete').disabled=true;$('account-confirm-hint').textContent='';
 // 로그아웃·공유·예시 상태에서는 설정 입구가 없다(기존 규칙). 여기서도 열지 않는다.
 if(!member?.snapshot().owned){notify('로그인한 뒤 설정을 열 수 있어요.');return;}
 paintSettingsProfile();
 fillProfileForm();
 paintDateStyleControls();paintStartPlaceControls();paintNetworkViewControls();paintShareControls();
 void paintSettingsUsage();
 panel('account-settings');
 focusSettingsSection(section);
 const answer=await accountApi.account();
 if(!answer.ok){$('account-confirm-hint').textContent='계정 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';return;}
 if(answer.email)paintSettingsProfile(answer.email);
 const byEmail=answer.confirmKind==='email';
 accountExpected=byEmail?{kind:'email',value:String(answer.email||'').trim().toLowerCase()}:{kind:'phrase',value:ACCOUNT_DELETE_PHRASE};
 $('account-confirm-label').textContent=byEmail?'계정 이메일':'확인 문구';
 $('account-confirm-hint').textContent=byEmail?'계정 이메일을 입력하세요. 일치할 때만 버튼이 열려요.':"확인을 위해 '탈퇴합니다'를 입력하세요. 그대로 일치할 때만 버튼이 열려요.";
}
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
  if($('account-settings').open)$('account-settings').close();
  notify('파일을 열었어요. 서버에는 저장하지 않습니다.');
 }catch(e){
  if(generation===loadGeneration)notify('불러오기 실패: '+e.message);
 }
};
// #368: #trees select는 옛 내 기록 창의 것으로 함께 없앴다. 트리 고르기는 트리 ▾ 드롭다운(renderTreeMenu)이 맡는다.
// #380 4 2차: 전체 화면·가운데 창 공통 틀을 쓰는 대화상자(편집기·순간 잇기·트리 관리)는 × 도 바깥 클릭·Esc와 같은 규칙을 쓴다.
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{const target=$(b.dataset.close);if(target?.dataset?.ltPanel){shellDialogs.requestClose(b.dataset.close);return;}target.close();});
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
 activeShareId=answer.share.id;const view=['book','board','network'].includes(route.view)?route.view:answer.share.view;current=screenForView(view)[1];load({revision:0,state:{version:1,trees:[answer.tree]}},'share',{treeId:answer.tree.id,momentId:answer.share.entryMomentId});activeShareId=answer.share.id;show(current,false);writeLocation('replace');notify('소유자가 명시적으로 공유한 트리입니다. 감상만 할 수 있어요.'+(answer.omittedPrivateMedia?' 올린 사진 '+answer.omittedPrivateMedia+'장은 나만 볼 수 있어요.':''));
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='track32-bookshelf.html'&&!member?.snapshot().owned){openLoginStart('shelf');return;}show(b.dataset.view);});
for(const f of frames())f.addEventListener('load',()=>frameLoaded(f));
paintThemeControls();applyTheme();paintTitleDisplayControls();applyAdvanced();
if(initialRoute.scope==='public')showPublicRoute(initialRoute);else load(null,'example');

function backup(){const data=member?.state();if(!data){notify('백업할 내 기록이 없어요.');return;}const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='lovetree-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
function openAssets(opener=document.activeElement){if(!member?.snapshot().owned){notify('로그인한 뒤 내 보관 파일을 확인할 수 있어요.');return;}shellDialogs.rememberOpener(opener);panel('account-assets');uploads.openAssets();}
function usePrivateAsset(){
 if(source!=='server'||!member?.snapshot().owned){openLoginStart('new-tree');return false;}
 if(!member.snapshot().writable){notify('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');openAccountData();return false;}
 if(!window.LT41){openEditor();notify('새 트리를 만든 뒤 순간에 파일을 첨부할 수 있어요.');return false;}
 if(!window.LT41.momentId){notify('순간을 먼저 연 뒤 내 보관 파일을 첨부할 수 있어요.');return false;}
 if(!$('write-panel').open)openEditor('add');
 return $('write-panel').open;
}
addEventListener('beforeunload',e=>{
 if(member?.snapshot().dirty||formDirty()||treeDirty()){e.preventDefault();e.returnValue='';}
});
if(shouldLoadMemberRecords(location.search,document.cookie,location.hash)||shellIntake.pending())startMember();
