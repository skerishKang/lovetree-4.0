import {mountPrivateUpload} from './private-upload.mjs';
import {memberLoginUrl,shouldLoadMemberRecords} from './member-entry.mjs';
import {workspaceModel} from './workspace-model.mjs';
import {createWorkspaceApi, setMemberRefreshStarted} from './api.mjs';
import {createShareApi} from './share-api.mjs';
import {createMemberSession} from './member-session.mjs';
import {hasPendingDraft} from './sync-controller.mjs';
import {clearCachedWorkspace, readCachedWorkspace} from './workspace-cache.mjs';
import {exampleTree} from './example.mjs';
import {parseSelectionRoute,memberStartupView,ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,stashPendingOwnerRoute,pendingOwnerRoute,takePendingOwnerRoute} from './selection-location.mjs';
import {applyViewAccessibility,connectionLabel} from './view-a11y.mjs';
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,unsavedNoticeText,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS,readPageTurn,writePageTurn} from './header-state.mjs';
import {parseJourneyRoute,journeyRouteDecision} from './first-journey.mjs';
import {displayTreeTitle} from './tree-name.mjs';
import {titleView, withoutAutoTitle} from './book-usability.mjs';
// #481 T6: 프레임에 값을 알리는 배선(보내는 시점·받는 쪽 판정)을 한 모듈에 모은다 — 실행 시험이 이 코드를 그대로 돈다.
import {frameMessage, frameReadyMessages, FRAME_MESSAGE_TYPES} from './frame-wiring.mjs';
import {screens,screenForView,viewForFile,themedViewFor} from './shell/navigation.mjs';
import {createScreens} from './shell/screens.mjs';
import {createHomeLink} from './shell/home-link.mjs';
import {createHeader} from './shell/header.mjs';
import {createAuth} from './shell/auth.mjs';
import {createPanels} from './shell/panels.mjs';
import {createQuickAdd} from './shell/quick-add.mjs';
import {createWritePanel, readWriteTab, writeWriteTab} from './shell/write-panel.mjs';
import {createQuickIntake} from './shell/quick-intake.mjs';
import {createVideoDup} from './shell/video-dup.mjs';
import {createJourney} from './shell/journey.mjs';
import {createMessages, lastShelfTreeId} from './shell/messages.mjs';
import {createCleanup} from './shell/cleanup.mjs';
// #627 PR B: 꼬리표 저장 한 곳(shell/tag-save.mjs — 기존 boardSync 경로로 keywords만)과 꼬리표 정리 창(shell/tag-manager.mjs).
import {createTagSave} from './shell/tag-save.mjs';
import {createTagManager} from './shell/tag-manager.mjs';
import {headerBadge, cleanupAvailable} from './inbox-model.mjs';
import {createDialogs} from './shell/dialogs.mjs';
import {createFeedbackDialog} from './feedback.mjs';
import {createFeedbackBoard} from './feedback-board.mjs';
import {mountUpdates} from './updates.mjs';
import {connectionSignature} from './shell/panel-dirty.mjs';
import {createLocation} from './shell/location.mjs';
import {createNotifier, syncedNoticeText, newlyPublishedTrees} from './shell/notice.mjs';
import {paintLoginLinks,paintThemeControls,applyTheme as applyThemeFor,toggleTheme as toggleThemeFor} from './shell/theme.mjs';
import {normalizeTitleDisplay, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment, coverModeOf, normalizeCoverDesign} from './domain.mjs';
import {backfillVideoTitles} from './title-backfill.mjs';
import {thumbnailCandidates, coverFallbackAttrs, fallbackCardData, emotionToneOf, mountThumbFallback, ADD_TITLE_LABEL, VIDEO_UNAVAILABLE_TEXT} from './thumb-fallback.mjs';
const $=id=>document.getElementById(id);
// #666: 알림 줄(토스트)은 화면 아래에 늘 붙어 있는 것들 — '새 소식·의견 보내기' 링크 줄, ＋ 단추, 새 소식 카드 —
// 을 덮지 않는다. 붙어 있는 것들의 가장 높은 윗변을 좌표로 재서 그 위로 올린다(글자 크기·화면 폭이 달라도 겹침 0).
// 390 실측: 링크 줄 아래 10~37px·＋ 단추 12~68px·카드 86~152px → 알림 줄 아래 134px.
function placeToast(){let above=0;for(const el of document.querySelectorAll('.home-links,#mobile-add,.updates-card')){if(el.hidden)continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)continue;const r=el.getBoundingClientRect();if(r.width<1||r.height<1)continue;above=Math.max(above,document.documentElement.clientHeight-r.top+10)}
 // 화면 안의 아래쪽 내용(data-lt-keep-clear 표식 — 책의 페이지 알약·이유 안내·갈림길 책갈피)도 알림이 덮지 않게 한다.
 // 보이는 프레임 문서까지 같은 좌표로 잰다(3회차 보람 회차 — 알림이 책 아래 안내 줄에 포개졌다).
 const keepFrame=[...document.querySelectorAll('#view,#view-next')].find(f=>!f.hidden&&f.contentDocument&&f.contentDocument.querySelector('[data-lt-keep-clear]'));
 if(keepFrame){const fr=keepFrame.getBoundingClientRect();for(const el of keepFrame.contentDocument.querySelectorAll('[data-lt-keep-clear]')){const cs=keepFrame.contentDocument.defaultView.getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)continue;const r=el.getBoundingClientRect();if(r.width<1||r.height<1)continue;above=Math.max(above,document.documentElement.clientHeight-(fr.top+r.top)+10)}}
 const style=document.documentElement.style;if(above>0)style.setProperty('--lt-toast-bottom',Math.round(above)+'px');else style.removeProperty('--lt-toast-bottom')}
addEventListener('resize',placeToast);
addEventListener('orientationchange',()=>setTimeout(placeToast,0));
// ＋ 단추(body.lt-fab-ok)·새 소식 카드가 늦게 뜨거나 닫힐 때도 다시 잰다.
for(const el of [$('updates-card')].filter(Boolean))new MutationObserver(placeToast).observe(el,{attributes:true,attributeFilter:['hidden']});
new MutationObserver(placeToast).observe(document.body,{attributes:true,attributeFilter:['class']});
placeToast();
// 안내 한 벌(#353 후속): 담기·중복·로그인 필요 안내(hold)가 상태 안내보다 먼저 일정 시간 보인다.
const shellNotice=createNotifier({$,beforeShow:placeToast,afterShow:()=>{placeToast();setTimeout(placeToast,600);setTimeout(placeToast,1400);}});
function notify(text,options){return shellNotice.notify(text,options);}
// #347 후속: 계정 제목 보기 설정. 계정 상태(state.prefs.titleDisplay)에 저장하고 화면에 알린다.
function currentPrefs(){try{return member?.state?.().prefs||{titleDisplay:'both'}}catch{return {titleDisplay:'both'}}}
function titleDisplayValue(){return normalizeTitleDisplay(currentPrefs().titleDisplay)}
function paintTitleDisplayControls(){const value=titleDisplayValue();for(const b of document.querySelectorAll('[data-title-display]'))b.setAttribute('aria-checked',String(b.dataset.titleDisplay===value));}
function postTitleDisplay(){try{$('view').contentWindow.postMessage(frameMessage('titleDisplay',titleDisplayValue()),location.origin)}catch{}}
// #481: 화면(iframe)은 그려지는 시점에 계정 값을 모른다. 날짜 표기와 같이 마지막 값을 기기에 함께 둔다 —
// 받는 쪽은 '지금 그린 값'과 '미러'를 비교해, 다시 뜨면 정말 새 값으로 그려질 때만 다시 띄운다.
function rememberTitleDisplay(value){try{localStorage.setItem('lt41.titleDisplay',normalizeTitleDisplay(value));}catch{}}
function setTitleDisplay(value){
 if(!member?.snapshot().owned){notify('로그인한 뒤 제목 보기를 바꿀 수 있어요.');return;}
 try{member.apply('setPrefs',{titleDisplay:value});}catch(e){notify('제목 보기를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 if(window.LT41)window.LT41.prefs=member.state().prefs;
 rememberTitleDisplay(titleDisplayValue());
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
function toggleTheme(){const theme=toggleThemeFor(current);syncBoardThemeToApp(theme);return theme;}
const moreButton=$('mobile-more'),moreMenu=$('header-overflow');
const treePopover=$('tree-popover'),treeTrigger=$('record-menu');
function closeMore(){moreMenu.classList.remove('is-open');moreMenu.hidden=true;moreButton.setAttribute('aria-expanded','false');}
function buildFoldMenu(){
 moreMenu.replaceChildren();
 const add=(label,click,mark)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=label;if(mark)b.setAttribute('aria-current','true');b.onclick=()=>{closeMore();click()};moreMenu.append(b)};
 // #635 PR C: 로그아웃 상태 메뉴(≡) 맨 위에 시작 입구 — 첫 화면의 '첫 순간 추가'와 같은 시작 흐름(openLoginStart('first'))으로 간다.
 // 로그인 상태 메뉴는 바꾸지 않는다.
 if(!member?.snapshot().owned)add('내 러브트리 시작하기',()=>openLoginStart('first'));
 // #380 2번: 접기 메뉴도 맨 위 메뉴와 같은 구조 — 첫 화면(로고)·둘러보기 · 서재·책·보드·지도 · 순간 추가.
 // 261117 대표 확정: 서재가 탭 줄 [서재][책][보드][지도]의 첫 자리 — 접기 메뉴도 같은 순서를 미러한다.
 // #458: 지금 보고 있는 화면 항목에 aria-current를 남긴다(메뉴를 열 때마다 다시 만들어 지금 상태를 반영한다).
 add('첫 화면',()=>document.querySelector('.brand').click(),current==='src064-orbit.html');
 add('둘러보기',()=>$('community-menu').click());
 add('서재',()=>{member?.snapshot().owned?show('track32-bookshelf.html'):openLoginStart('shelf')},current==='track32-bookshelf.html');
 // 2026-11-17 대표 결정: 트리 0개여도 네 화면이 모두 열리므로 접기 메뉴에서도 책·보드·지도를 늘 둔다.
 add('책',()=>show('track59-sketchbook.html'),current==='track59-sketchbook.html');
 add('보드',()=>show('track58-pinboard.html'),current==='track58-pinboard.html');
 add('지도',()=>show('track56-network.html'),current==='track56-network.html');
  if(!$('write-menu').hidden)add('＋ 순간 추가',()=>$('write-menu').click());
  add('의견 보내기',()=>feedbackDialog.open());
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
 // #627 PR B: 기존 '정리' 옆에 두는 꼬리표 정리 입구(내 기록·쓸 수 있을 때만).
 const tagsRow=source==='server'&&member?.snapshot().owned&&member.snapshot().writable
  ? '<button type="button" role="menuitem" class="tree-item tree-tags" data-tree-action="tags"><span class="tree-name">꼬리표 정리</span></button>' : '';
 const manage=source==='server'&&window.LT41&&member?.snapshot().owned&&member.snapshot().writable;
 // #394: 트리 드롭다운 맨 아래 "내 순간 전체 보기"(#380의 "내 트리 전체 보기" 자리 옆). 내 기록(서버)에서만 보인다.
 const momentsEntry=source==='server'&&window.LT41?'<button type="button" role="menuitem" data-tree-action="moments">내 순간 전체 보기</button>':'';
 // #380 2번: 맨 아래 "내 트리 전체 보기" — 지금의 책장 화면(모든 트리의 책장)을 연다. 로그인 상태에서만 보인다.
 const shelfEntry=member?.snapshot().owned?'<button type="button" role="menuitem" data-tree-action="shelf">서재 전체 보기</button>':'';
 treePopover.innerHTML=rows+`<div class="tree-foot" role="none">${cleanupRow}${tagsRow}<button type="button" role="menuitem" data-tree-action="new">＋ 새 트리</button>${manage?'<button type="button" role="menuitem" data-tree-action="manage">이 트리 관리 (이름·표지)</button><button type="button" role="menuitem" data-tree-action="share">이 트리 공유</button>':''}${shelfEntry}${momentsEntry}</div>`;
  // 트리를 누르면 그 트리로 이동한다: 책·보드·지도를 보던 중이면 같은 보기로, 그 외(첫 화면·내 트리·둘러보기)에는 그 트리의 책으로. 주소도 따라오게 남긴다.
  const TREE_VIEWS=new Set(['track32-bookshelf.html','track59-sketchbook.html','track58-pinboard.html','track56-network.html']);
  treePopover.querySelectorAll('[data-tree-id]').forEach(b=>b.onclick=()=>{
   const id=b.dataset.treeId;closeTreeMenu();if(!id)return;
   // 서재는 프레임을 다시 띄우지 않고 가운데 책만 고른 트리로 옮긴다(2026-11-18 13:49 결정).
   if(current==='track32-bookshelf.html'){
    choose(id,'',true);
    renderAccount();
    flowNavigation();
    try{for(const f of document.querySelectorAll('iframe'))f.contentWindow?.postMessage({type:'lt41-shelf-select-tree',treeId:id},location.origin);}catch{}
    writeLocation();return;
   }
   const wasTreeView=TREE_VIEWS.has(current);choose(id);if(!wasTreeView)show('track59-sketchbook.html',false);flowNavigation();writeLocation();
  });
 treePopover.querySelector('[data-tree-action="new"]')?.addEventListener('click',()=>{closeTreeMenu();if(member?.snapshot().writable)openEditor('new');else openLoginStart('new-tree');});
 treePopover.querySelector('[data-tree-action="cleanup"]')?.addEventListener('click',()=>{closeTreeMenu();shellCleanup.open({});});
 // #627 PR B: 기존 '정리' 옆의 두 번째 입구 — 꼬리표 정리(이름 바꾸기·합치기·제안).
 treePopover.querySelector('[data-tree-action="tags"]')?.addEventListener('click',()=>{closeTreeMenu();shellTagManager.open();});
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
addEventListener('lt41-trees-changed',()=>{
 if(treePopover&&!treePopover.hidden)renderTreeMenu();
 paintQuickTargetControls();
 try {
  const titles=(window.LT41?.trees||[]).map(t=>({id:t.id,title:t.title}));
  for(const f of frames()) f?.postMessage({type:'lt41-trees-renamed',titles},location.origin);
 } catch {}
});
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
// #458: 화상 키보드가 올라오면(시각 창이 눌리면) 떠 있는 단추가 입력 칸을 가리지 않게 숨긴다.
if(window.visualViewport){const fabKbd=()=>document.body.classList.toggle('lt-kbd',window.visualViewport.height<window.innerHeight-120);window.visualViewport.addEventListener('resize',fabKbd);fabKbd();}
document.addEventListener('keydown',event=>{
 const c=$('community-panel');
 // #380 4 마지막: 둘러보기도 공통 틀의 닫기 규칙(×·바같 클릭·Esc·초점 복귀)을 쓴다.
 if(event.key==='Escape'&&c.open&&![...document.querySelectorAll('dialog[open]')].some(d=>d!==c&&d.matches(':modal')))shellDialogs.requestClose('community-panel');
});
const initialRoute=parseSelectionRoute(location.hash);
let model=null,current=screenForView(initialRoute.view)[1],source='example',loadGeneration=0,previousDirty=false,member=null,handledHash=null,activeShareId=null,resumeAfterStart=null;
// #583 '이 순간 열기': 주소(#my/network?tree=…&moment=…)로 지도를 특정 순간을 가운데 두고 열 요청이 오면
// 여기에 한 번 적어 두고, 지도 프레임을 띄울 때(show) 소비해 프레임 주소에 ?open=<순간>을 붙인다.
// 지도(network.js)는 이 표시가 있을 때만 그 순간을 고른 상태로 가운데에 둔다 — 그냥 지도를 열 때는
// 예전대로 전체 보기(화면 맞춤)로 뜬다.
let networkOpenMoment=null;
const requestNetworkOpen=id=>{networkOpenMoment=id||null};
const takeNetworkOpen=()=>{const v=networkOpenMoment;networkOpenMoment=null;return v};
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
const shellWrite=createWritePanel({$,onModalShown:()=>tipsFollowDialogs()});
// #876: 같은 영상을 다시 담을 때 담기 전에 한 번 알려 주는 창(shell/video-dup.mjs). 잠깐 판 — 순간 추가 창
// 위에 겹쳐 열리고(#845 3단계 STACK_ALLOWED), ×·Esc·뒤로가기로 닫으면 아무것도 담지 않는다.
const shellVideoDup=createVideoDup({$,onModalShown:()=>tipsFollowDialogs(),requestClose:id=>shellDialogs.requestClose(id),choose:(id,momentId)=>choose(id,momentId),openEditor:(mode,parentId)=>openEditor(mode,parentId)});
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
  requestClose:id=>shellDialogs.requestClose(id),
  // #876: 같은 영상 안내 창 — 자세한 추가도 쉬운 추가와 같은 규칙.
  videoDup:shellVideoDup
});
function openEditor(mode,parentId=''){
  // 2026-11-16 대표 요청: 자세한 추가도 쉬운 추가와 같은 기본 트리를 쓴다 — 늘 같은 트리를 골랐고
  // 지금 트리와 다르면 그 트리를 고른 뒤 연다(에디터 안내 줄이 그 트리를 가리킨다). 목적지 순간이
  // 함께 오면(그 순간 다음에 담기) 사용자가 고른 목적지가 우선이라 그대로 둔다.
  if(mode==='add'&&!parentId){const pref=quickTargetPreference();if(pref.mode==='fixed'&&pref.treeId&&window.LT41?.tree?.id!==pref.treeId&&model?.trees?.some(t=>t.id===pref.treeId))choose(pref.treeId);}
  return shellPanels.openEditor(mode,parentId);
}
// #453 B: 탭을 보일 때(그리고 창을 여는 두 길 모두에서) 편집기 기준값을 다시 잡는다.
shellWrite.setTabHook(tab=>shellPanels.onWriteTab(tab));
// 쉬운 추가(#빠른 추가 ②): 창 열기·끌어다 놓기는 shell/quick-add.mjs가 맡는다.
// #425부터 입구는 하나다 — 같은 창을 열고 먼저 보일 탭만 설정값(lt41.writeTab)이 정한다.
// #627 PR B: 꼬리표 저장 한 곳 — 기존 워크스페이스 저장 경로(boardSync)로 keywords만 바꾼다(새 저장 경로·서버 변경 없음).
// 꼬리표 정리 창은 같은 저장 길을 쓰고, 화면(iframe)의 lt41-tags도 이 한 곳을 부른다(shell/messages.mjs).
const shellTags=createTagSave({
  getMember:()=>member,
  getModel:()=>model,
  notify:text=>notify(text),
  // 결함 ③(tags-sync): 저장 뒤 열린 화면(iframe) 두 개에 답 모양(lt41-tags-saved)을 알린다.
  frames:()=>[$('view')?.contentWindow,$('view-next')?.contentWindow].filter(Boolean)
});
const shellTagManager=createTagManager({
  $,
  getMember:()=>member,
  getSource:()=>source,
  notify:text=>notify(text),
  panel:id=>panel(id),
  closePanel:id=>{ shellDialogs.requestClose(id); const href=$('view')?.contentWindow?.location?.href || ''; if (!href || href === 'about:blank') show(current, false); },
  saveMoments:shellTags.saveMoments
});
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
  // #876: 같은 영상 안내 창 — 담기 전에 한 번 알려 주고 [그래도 담기]·[그 순간 보기]를 맡긴다.
  videoDup:shellVideoDup,
  // #638: 쉬운 추가가 지금 고른 트리에 담기게 — 지금 트리·트리 목록은 트리 메뉴와 같은 재료(window.LT41)에서 읽는다.
  currentTreeId: () => window.LT41?.tree?.id || '',
  listTrees: () => (Array.isArray(window.LT41?.trees) ? window.LT41.trees : []),
  // 사진 올리기는 기존 업로더(#310 onUploaded·imagesOnly)를 그대로 쓴다.
  mountUpload:mountPrivateUpload,
  // 이슈 671: '그 순간 다음에 담기' 한 줄에 쓸 순간 제목 — 책·보드와 같은 제목 규칙(자동 제목 빼기)을 쓴다.
  momentTitle:moment=>{const main=titleView(moment,titleDisplayValue()).main;return main||withoutAutoTitle(moment).title;},
  // #627 PR B: 담은 직후 안내의 꼬리표 줄이 눌렸을 때 — keywords만 기존 경로로 저장한다.
  saveTags:payload=>shellTags.save(payload),
  // 2026-11-16 대표 요청: 처음 고르는 트리 설정(지금 보고 있는 트리/늘 같은 트리) — 바로 아래 한 벌.
  quickTargetPreference:()=>quickTargetPreference()
});
$('write-menu').onclick=()=>{if(source!=='server'&&member?.snapshot().owned){void resumeMember('write');return;}if(member?.snapshot().dirty){explainSaveState();return;}shellQuick.openWrite();};
// #458: 모바일 떠 있는 ＋ 단추 — 헤더의 ＋ 순간 추가와 같은 길(같은 창)을 연다. 단추는 body.lt-fab-ok일 때만 보인다.
$('mobile-add').addEventListener('click',()=>$('write-menu').click());
// 빠른 담기 입구: 붙여넣기 + 공유 시트 진입(판정·추적은 ../quick-intake.mjs 한 벌).
const shellIntake=createQuickIntake({
  getMember:()=>member,
  getSource:()=>source,
  // 담기·중복·로그인 필요 안내는 방금 한 행동의 결과다 — 상태 안내가 곧바로 덮지 않게 hold로 띄운다(#353 후속).
  notify:text=>notify(text,{hold:true}),
  openLoginStart:intent=>openLoginStart(intent),
  // #876: 같은 영상 안내 창 — 붙여넣기·공유로 담을 때도 쉬운 추가와 같은 규칙(조용히 막기를 대체).
  videoDup:shellVideoDup,
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
  discoverOf:treeId=>discoverState.has(treeId)?discoverState.get(treeId):null,
  rememberDiscover:(treeId,discover)=>discoverState.set(treeId,discover===true),
  notify:text=>notify(text),
  panel:id=>panel(id),
  openSettingsData:intent=>openAccountData(intent),
  show:(file,write)=>show(file,write),
  links:()=>links(),
  writeLocation:(mode)=>writeLocation(mode),
  choose:(id,momentId)=>choose(id,momentId),
  openTreeManager:()=>shellPanels.openTreeManager(),
  openTagManager:opts=>shellTagManager.open(opts),
  openEditor:(mode,parentId)=>openEditor(mode,parentId),
  openNewTree:()=>openEditor('new'),
  // 이슈 671: lt41-write의 새로 추가(new·add)는 쓰기 창 한 길로 — 목적지(트리·이어질 순간)를 함께 넘긴다.
  openWriteEntry:target=>shellQuick.openWrite(target),
  focusTitleInput:()=>shellPanels.focusTitleInput?.(),
  openLoginStart:intent=>openLoginStart(intent),
  openAccountMenu:()=>openAccountMenu(),
  openCleanup:options=>shellCleanup.open(options),
  // #627 PR B: 화면(책·보드·지도)의 꼬리표 줄이 확인한 것을 저장하는 한 길.
  saveTags:payload=>shellTags.save(payload),
  openMovePicker:options=>shellCleanup.openMove(options),
  sample:(selection,view)=>sample(selection,view),
  applyTheme:(theme)=>applyTheme(theme),
  paintThemeControls:()=>paintThemeControls(),
  viewForFile:file=>viewForFile(file),
  exampleTree,
  journey:shellJourney,
  // #368 3차: 공유 창 시작값(처음 열 보기·둘러보기 올림 기본)은 계정 설정에서 온다.
  getShareDefaults:()=>({view:currentShareView()})
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
  requestNetworkOpen,
  journey:shellJourney,
  gotoJourneyStep:step=>gotoJourneyStep(step),
  openFirstJourney:options=>openFirstJourney(options),
  finishJourney:()=>finishJourney(),
  leaveJourney:()=>leaveJourney()
});
// 새 소식 창(비모달)의 Esc — 다른 창이 하나라도 열려 있으면 그 창이 Esc를 맡는다(맨 위 창 하나 규칙).
// capture로 등록해 다른 Esc 처리보다 먼저 본다 — 아래 창(공유 목록)이 먼저 닫힌 뒤 '열린 창 없음'으로 오판하지 않게.
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const updates = $('updates-panel');
  if (!updates?.open || updates.matches(':modal')) return;
  if ([...document.querySelectorAll('dialog[open]')].some(d => d !== updates)) return; // 다른 창이 남아 있으면(맨 위 모달 포함) 그 창이 맡는다
  event.preventDefault(); shellDialogs.requestClose('updates-panel');
}, true);
// 새 소식 창이 열린 채 위 메뉴(머리글)를 누르면 창을 닫고 그 메뉴로 이동한다(캡처 — 이동 처리는 그대로).
document.querySelector('.app-header')?.addEventListener('click', () => {
  const updates = $('updates-panel');
  if (updates?.open && !updates.matches(':modal')) shellDialogs.requestClose('updates-panel');
}, true);
function writeLocation(mode){return shellLocation.writeLocation(mode);}
function applyBrowserLocation(){return shellLocation.applyBrowserLocation();}
const PENDING_NEW='lovetree.v41.pending-new';
// 2026-11-07 계정 표시: 로그인 상태는 첫 글자 동그라미 + 작은 메뉴, 로그아웃 상태는 기존 로그인 알약.
function panel(id){const target=$(id);if(!target.open){if(target.dataset.ltPanel){shellDialogs.noteOpener(id);if(target.dataset.ltPanel==='full')shellDialogs.syncPanelTop();}
 // 새 소식 창은 비모달로 연다(2026-11-16 대표 지적) — 위 메뉴가 눌리고 메뉴가 흐리게 덮이지 않는다.
 // 나머지 창은 그대로 showModal(맨 위 창 하나 규칙은 dialogs.mjs의 topDialog가 맡는다).
 if(id==='updates-panel')target.show();else target.showModal();}
 // #549: 모달 창이 열려 있는 동안에는 창 밖 요소가 전부 inert가 되어 창 밖의 안내가 눌리지 않는다.
 // 261118 대표 결정(#845): 창 안으로 옮겨 붙이지 않고, 창이 열려 있는 동안은 안내 판을 숨긴다.
 tipsFollowDialogs();}
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

// 로고 클릭은 해시 변경에만 의존하지 않는다(2026-11-17 실측). 주소가 남는 화면(서재 등)에서 눌러도 첫 화면으로 간다.
function closePanelsForHome(){
  closeTreeMenu();closeMore();closeAccountMenu();
  let ok=true;
  for(const d of document.querySelectorAll('dialog[data-lt-panel][open]')){if(!shellDialogs.requestClose(d.id))ok=false;}
  return ok;
}
function scrollHomeToTop(){
  try{window.scrollTo(0,0)}catch{}
  const frame=$('view');
  try{frame?.contentWindow?.scrollTo?.(0,0)}catch{}
  try{const app=frame?.contentDocument?.querySelector?.('.app');if(app)app.scrollTop=0}catch{}
}
function setHomeHash(){
  if(location.hash!=='#home')history.pushState(null,'','#home');
  handledHash='#home';
}
const shellHomeLink=createHomeLink({
  $,
  getCurrent:()=>current,
  show:(file,write)=>show(file,write),
  closePanels:closePanelsForHome,
  setHomeHash,
  scrollToTop:scrollHomeToTop
});
shellHomeLink.mount();

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
  // #465 4: 동그라미 깜빡임 — 계정 정보를 부르는 동안 저장본(#408)의 표시 이름으로 먼저 그린다.
  getCachedName:()=>{try{return readCachedWorkspace(localStorage)?.state?.prefs?.displayName||''}catch{return ''}},
  // 이슈 644 2번: 아바타에 새 소식이 있으면 마우스 설명을 점 안내로 바꾼다.
  getAccountTip:()=>accountTip,
  delegate:{syncTreeTips:()=>syncTreeTips()}
});
function flowNavigation(){return shellHeader.flowNavigation();}
function updateNavFade(){return shellHeader.updateNavFade();}
function revealCurrentTab(){return shellHeader.revealCurrentTab();}
function closeAccountMenu(){return shellHeader.closeAccountMenu();}
function renderAccount(){return shellHeader.renderAccount();}
function openAccountMenu(via){return shellHeader.openAccountMenu(via);}
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
  takeNetworkOpen,
  flowNavigation,
  paintEmptyForScreen,
  paintEmptyCopy,
  applyTheme,
  writeLocation,
  links,
  onFrameReady:frame=>{
    const d=frame.contentDocument;if(!d)return;
    mountConnectionTool(d);applyViewAccessibility(d);shellQuick.mountFrame(d);watchFrameSheet(frame);
    /* 이슈 458: 모바일(781px 미만)에서는 셸의 ＋ 단추가 오른쪽 아래에 뜬다 — 첫 화면 궤도가 그 자리를 비끼게
       프레임 html에 표시를 남긴다(궤도 쪽 좁은 화면 배치가 이 표시를 읽는다). */
    if(matchMedia('(max-width:780px)').matches)d.documentElement.dataset.ltFab='1';else delete d.documentElement.dataset.ltFab;
    // 화면이 자리 잡은 뒤 알림 자리를 다시 잰다 — 알림이 떠 있는 동안 화면이 늦게 편성되면(기록 불러오기·글꼴)
    // 자리가 낡아 화면 아래쪽 내용(책의 페이지 알약·이유 안내)을 덮는다. 자리는 살아 있는 값이라 즉시 따라 옮겨 앉는다.
    placeToast();setTimeout(placeToast,1600);
    // #368 2차·3차: 새로 열린 화면에 페이지 넘김·날짜 표기 값을 알린다(테마와 같은 시점).
    // #481 T6: 무엇을 뜰 때마다 보내는지는 frameReadyMessages가 정한다(보내는 시점을 실행 시험으로 고정한다).
    // 무엇을 뜰 때마다 보내는지는 frameReadyMessages가 정하고, 여기서는 그것을 순서대로 보낸다
    // (보내는 시점·값·순서를 실행 시험이 같은 함수로 확인한다).
    const ready=frameReadyMessages({dateStyle:currentDateStyle(),pageTurn:currentPageTurn()==='on'});
    applyPageTurnToFrame(frame);applyDateStyleToFrame(frame);applyBoardThemeToFrame(frame);
    // #478: 고급 기능 보기 값도 새로 열린 화면에 알린다. applyAdvanced는 지금 화면(#view)에만 보내므로
    // 화면을 옮긴 뒤 열린 프레임은 단순 모드로 남았다(보드 도구가 숨는 결함).
    try{frame.contentWindow.postMessage({type:'lt41-advanced',value:readAdvanced()},location.origin)}catch{}
    // 화면 교대(두 장 앞뒤 바꿈)가 늦게 끝나는 경우를 위해 한 번 더 알린다(같은 값을 또 보내는 건 무해하다).
    for(const message of ready.repeats)setTimeout(()=>sendToFrame(frame,message),1600);
    d.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;let file;if(b.matches('[data-action="tree"],[data-menu="tree"]'))file='track32-bookshelf.html';if(b.matches('#storyBook,[data-menu="book"]'))file='track59-sketchbook.html';if(current==='track56-network.html'&&b.id==='openMoment')file='track59-sketchbook.html';if(file){e.preventDefault();e.stopImmediatePropagation();show(file);}},true);
  }
});
// 화면 안의 상세 판과 순간 목록 같은 창을 셸이 알아채 body.lt-sheet-open에 옮긴다 —
// 아래 고정 요소는 창이 열려 있는 동안 숨고 닫으면 돌아온다(shell.css).
const sheetObservers=new Map();
function watchFrameSheet(frame){
  const d=frame.contentDocument;if(!d)return;
  const old=sheetObservers.get(frame);if(old){old.disconnect();sheetObservers.delete(frame);}
  const roots=new WeakSet(),layers=new WeakSet();
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)observeTree(node);
    sync();
  });
  const observeTree=root=>{
    if(!root||![1,9,11].includes(root.nodeType))return;
    if(root.nodeType===9||root.nodeType===11){
      if(!roots.has(root)){roots.add(root);observer.observe(root,{childList:true,subtree:true});}
    }
    const nodes=[...(root.nodeType===1?[root]:[]),...root.querySelectorAll('*')];
    for(const el of nodes){
      if((el.matches('.detail')||el.tagName==='DIALOG')&&!layers.has(el)){
        layers.add(el);observer.observe(el,{attributes:true,attributeFilter:el.tagName==='DIALOG'?['open']:['class']});
      }
      if(el.shadowRoot)observeTree(el.shadowRoot);
    }
  };
  const hasOpenLayer=root=>{
    if(root.querySelector('dialog[open],.detail.open'))return true;
    for(const el of root.querySelectorAll('*'))if(el.shadowRoot&&hasOpenLayer(el.shadowRoot))return true;
    return false;
  };
  const hasOpenDialog=root=>{
    if(root.querySelector('dialog[open]'))return true;
    for(const el of root.querySelectorAll('*'))if(el.shadowRoot&&hasOpenDialog(el.shadowRoot))return true;
    return false;
  };
  // 지금 보이는 장(#view)의 창 상태만 반영한다 — 옛 장이 about:blank로 바뀌어도 상태가 흔들리지 않는다.
  const sync=()=>{const cur=[...document.querySelectorAll('iframe')].find(f=>f.id==='view');
    const doc=cur&&cur.contentDocument;
    const dialogOpen=!!doc&&hasOpenDialog(doc);
    document.body.classList.toggle('lt-sheet-open',!!doc&&hasOpenLayer(doc));
    document.body.classList.toggle('lt-frame-dialog-open',dialogOpen);};
  observeTree(d);
  sheetObservers.set(frame,observer);
  sync();
}
function frames(){return shellScreens.frames();}
function hideFrames(){return shellScreens.hideFrames();}
function showInFrame(url,title){return shellScreens.showInFrame(url,title);}
function show(file,write=true,treeKey=''){return shellScreens.show(file,write,treeKey);}
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
 // #481 L15: #connection-count·#connection-menu는 index.html에 없다(죽은 가드) — 읽지 않고 0에서 시작한다.
 // 값은 곧 links()의 setConnectionCount가 실제 연결 수로 채운다.
 button.textContent=connectionLabel(0);button.removeAttribute('aria-label');
 // #601: 지도 화면의 '이어진 선' 버튼을 기억해 둔다 — links()가 매번 프레임 문서를 다시 찾지 않고
 // 같은 버튼을 고친다(지도를 다시 열거나 화면을 옮겨 다니면 0으로 돌아가던 버그의 뿌리).
 // show()는 프레임이 뜨기 전에 links()를 부르므로, 버튼이 생긴 뒤 다시 세어 처음부터 올바른 수를 보인다.
 connectionToolButton=button;links();
}
let connectionToolButton=null;
function setConnectionCount(n){
 // #601: 기억해 둔 지도 화면의 버튼이 살아 있으면 그 버튼을 고친다. 없으면(예전 부름) 프레임 문서에서 찾는다.
 if(connectionToolButton?.isConnected){connectionToolButton.textContent=connectionLabel(n);connectionToolButton.removeAttribute('aria-label');return;}
 const t=$('connection-tool');if(t){t.textContent=connectionLabel(n);t.removeAttribute('aria-label');}
}
// #380 4 2차: 순간 잇기 패널이 보여 준 연결 목록(고른 연결)을 기억해 두고, 그 뒤로 트리의 연결이 달라졌으면 더러움이다.
// 패널 자체는 연결을 만들지 않으므로 보통은 확인 없이 닫힌다(보여 준 것과 저장본이 같기 때문).
// #380 5번: 첫 화면 움직임 멈춤 상태(메모리에만 둔다 — 보기 메뉴 때와 같다. 화면을 다시 열면 처음 상태).
let motionPaused=false;
let connectionShown='';
function connectionDirty(){return $('connection-panel').open&&connectionSignature(window.LT41?.tree,window.LT41?.momentId)!==connectionShown;}
function links(){viewContext();const c=window.LT41;$('connections').replaceChildren();if(!c){setConnectionCount(0);$('selection-label').textContent='트리를 먼저 불러오세요.';connectionShown='';return;}
 const moment=c.tree.moments.find(m=>m.id===c.momentId);$('selection-label').textContent=moment?.title||'';
 // #601: '이어진 선 N개'는 지도에 실제 그린 연결 선 개수다 — 양 끝 순간이 모두 있는 연결을 센다.
 // (예전에는 선택한 순간에 닿는 선만 세어 대표 계정에서 '이어진 선 0개'로 나왔다.)
 const has=id=>c.tree.moments.some(m=>m.id===id);
 const all=c.tree.edges.filter(e=>has(e.from)&&has(e.to));setConnectionCount(all.length);
 const edges=c.tree.edges.filter(e=>e.from===c.momentId||e.to===c.momentId);
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
// #549: 모달 창이 열려 있는 동안에는 창 밖 요소가 전부 inert가 되어 '알겠어요'가 눌리지 않았다(빈 알림
// 요소가 가로채는 것이 아니라 모달 창 자체가 누름을 막는다). #566에서는 창 안 맨 위로 옮겨 붙였지만
// 안내 판이 창 내용 위에 포개지는 일이 반복됐다(#845·#846 사용 일지 — 순간 추가·내 의견 창, PR #851 캡처).
// 261118 대표 결정: 창 안으로 옮기지 않고, 창(#845 설계안의 15개 모달 창)이 하나라도 열려 있는 동안은
// 안내 판을 숨긴다. 창이 모두 닫히면 다시 띄우고, 이때 '봤음'으로 적지 않는다(#666의 계정 메뉴 미루기와
// 같은 규칙 — 미뤘다고 본 것으로 치지 않는다).
let tipsReturnFocus=null;
function anyDialogOpen(){return !!document.querySelector('dialog[open]');}
function tipsFollowDialogs(){
  const box=$('tree-tips');if(!box)return;
  if(anyDialogOpen()){
    if(!box.hidden){tipsHeld=true;box.hidden=true;}
    return;
  }
  if(!tipsHeld)return;
  tipsHeld=false;
  syncTreeTips();
}
function closeTreeTips(remember=true){
  const box=$('tree-tips');if(!box||box.hidden)return;
  box.hidden=true;if(remember)writeTipsSeen(localStorage);
  const back=tipsReturnFocus||$('tree-views')?.querySelector('button')||$('mobile-more');tipsReturnFocus=null;
  if(back&&document.contains(back)&&!back.hidden)back.focus();
}
// 이슈 666: 계정 메뉴와 첫 트리 안내는 한 번에 하나만 보인다. 안내(z-index 25)는 머리줄 상자
// (z-index 5) 안에 있는 메뉴 위로 떠 메뉴 항목을 가렸다. 메뉴가 열려 있으면 안내는 미뤄 두고,
// 메뉴가 닫히면 그때 띄운다. 미뤘다고 '봤음'으로 적지 않는다 — 닫은 뒤에도 다시 보여 준다.
function accountMenuOpen(){const pop=$('account-popover');return !!pop&&!pop.hidden;}
let tipsHeld=false;
function tipsFollowAccountMenu(){
  const box=$('tree-tips');
  if(accountMenuOpen()){
    if(box&&!box.hidden){tipsHeld=true;closeTreeTips(false);}
    return;
  }
  if(!tipsHeld)return;
  tipsHeld=false;
  syncTreeTips();
}
function showTreeTips(){
  const box=$('tree-tips');if(!box||!box.hidden)return;
  if(accountMenuOpen()||anyDialogOpen()){tipsHeld=true;return;}
  const list=$('tree-tips-list');
  if(list&&!list.children.length)for(const tip of FIRST_TREE_TIPS){const li=document.createElement('li');const strong=document.createElement('strong');const span=document.createElement('span');strong.textContent=tip.title;span.textContent=tip.body;li.append(strong,span);list.append(li);}
  if(!tipsReturnFocus)tipsReturnFocus=document.activeElement;
  box.hidden=false;
  $('tree-tips-close')?.focus();
}
function syncTreeTips(){
  const momentCount=model?.trees?.reduce((n,t)=>n+((t.moments||[]).length),0)||0;
  const wanted=tipsWanted({owned:!!member?.snapshot().owned,treeCount:model?.trees?.length||0,momentCount,seen:readTipsSeen(localStorage),source});
  if(wanted)showTreeTips();else closeTreeTips(false);
}
// 창이 닫힐 때마다 안내를 다시 맞춘다 — 열려 있는 창이 없어지면 숨긴 안내를 다시 띄운다(#845).
document.addEventListener('close',()=>tipsFollowDialogs(),true);
// 계정 메뉴가 열리고 닫힐 때마다 안내와의 순서를 다시 맞춘다(메뉴를 여는 길이 여럿이라 상태 변화를 본다).
const accountPopoverBox=$('account-popover');
if(accountPopoverBox)new MutationObserver(()=>tipsFollowAccountMenu()).observe(accountPopoverBox,{attributes:true,attributeFilter:['hidden']});
$('tree-tips-close')?.addEventListener('click',()=>closeTreeTips());
// #571: 안내의 [이름 바꾸기]는 트리 관리 창을 바로 열고 이름 칸에 초점을 둔다(openTreeManager가 초점을 옮긴다).
// 창이 열려 있는 동안은 안내 판이 숨고(#845), 이름 창을 닫고 돌아오면 두 번째 안내와 알겠어요가 다시 보인다 —
// 이때 '봤음'으로 적지 않는다. 순간 추가 창이 열려 있는 동안에는 안내가 숨어 누르지 않는다(#845 결정).
$('tree-tips-rename')?.addEventListener('click',()=>shellPanels.openTreeManager());
// 2026-11-07: 390·360에서 탭 7개가 폭을 넘는다. 탭 줄은 가로 스크롤이고, 화면을 바꿀 때 현재 탭을 가운데로 당겨 보이게 한다.
// 넘치는 쪽 끝에만 페이드를 켜서 잘린 것이 아니라 더 있다는 신호를 준다. 데스크톱(넓은 폭)은 스크롤이 없어 아무 일도 하지 않는다.
const navBar=document.querySelector('.app-header nav');
const narrowNav=()=>matchMedia('(max-width:780px)').matches;
function choose(id,momentId,skipShow=false){const tree=model.trees.find(t=>t.id===id);window.LT41=tree?{tree,trees:model.trees,source,momentId:tree.moments.find(m=>m.id===momentId)?.id||tree.moments.find(m=>m.parentId===null)?.id||tree.moments[0]?.id,prefs:currentPrefs(),writable:source==='server'&&!!member?.snapshot().writable,}:null;
 if(!skipShow&&(tree||current==='src064-orbit.html'))show(current,false,id||'');
 else if(!skipShow||!tree){flowNavigation();document.body.classList.remove('home-screen');hideFrames();
  // 261118 대표 결정: 트리 0개 계정이 주소(#my/shelf 등)로 바로 들어와도 그 화면의 빈 상태(#817)를 보여 준다 —
  // 탭을 눌러 열 때와 같은 문구('아직 책장이 비어 있어요.' 등)로 시작한다.
  paintEmptyForScreen(current);$('empty').hidden=false;links();}}
// #453 D2: 빈 화면 문구·단추는 계정 상태에 맞춘다. 로그인한 사람에게 '로그인한 계정의 기록을 불러오세요'는 어색하고,
// 백업 파일 열기는 계정 없이 쓰는 입구라 로그인 상태에서는 숨긴다(로그아웃은 지금 그대로 둔다).
// 2026-11-17 대표 결정: 트리 0개 계정이 서재·책·보드·지도탭을 열면 그 화면의 빈 상태를 보여 준다.
function paintEmptyForScreen(file){
  const shelf=file==='track32-bookshelf.html';
  if(shelf)$('empty').dataset.emptyView='shelf';else delete $('empty').dataset.emptyView;
  $('empty').querySelector('h1').textContent=shelf?'아직 책장이 비어 있어요.':'아직 트리가 없어요.';
  $('empty').querySelector('p').textContent=shelf?'첫 순간을 담으면 책장에 책이 꽂혀요.':'좋아하는 영상 주소 하나면 시작돼요.';
  $('empty-records').textContent=shelf?'＋ 새 트리':'＋ 첫 순간 추가';
  $('empty-records').hidden=false;$('empty-records').classList.add('primary');
  $('empty-sample').hidden=true;$('empty-file').hidden=true;
}
function paintEmptyCopy(){
  const owned=!!member?.snapshot().owned;
  delete $('empty').dataset.emptyView;
  $('empty').querySelector('h1').textContent=owned?'아직 트리가 없어요.':'다시 펼칠 순간을 기다리고 있어요.';
 // #463(2026-11-13): 트리 0개(로그인)는 처음 온 사람용 한 줄로. 예전 문구는 다시 온 사람용이었고
 // ("예시를 둘러보거나..."), 떠 있는 카드가 예시라는 것도 모호했다.
 $('empty').querySelector('p').textContent=owned
   ? '좋아하는 영상 주소 하나면 시작돼요. 지금 보이는 카드는 예시예요.'
   : '예시를 둘러보거나 로그인한 계정의 기록을 불러오세요.';
 $('empty-sample').hidden=false;$('empty-records').hidden=false;
 // #463: 로그인(트리 0개)에서는 ＋ 첫 트리 만들기가 주 버튼, 예시 둘러보기는 보조.
 // 로그아웃은 2026-11-07 첫 화면 시작 버튼 방침대로 지금 그대로 둔다.
 $('empty-records').textContent=owned?'＋ 첫 트리 만들기':'내 기록 불러오기';
 $('empty-records').classList.toggle('primary',owned);
 $('empty-sample').classList.toggle('primary',!owned);
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
 // 이슈 644 3번: 저장 실패 떠가 이미 보이면 그 설명을 그대로 쓰고, 숨어 있는 동안(저장 중)에는 저장 중 설명을 연다.
 function explainSaveState(){
  if(!$('save-feedback').hidden)return; // 이미 떠 있다 — 그 떠가 같은 설명이다.
  const s=member?.status?.();
  $('save-message').textContent=unsavedNoticeText(s?.phase);
  $('save-actions').replaceChildren();
  $('save-feedback').hidden=false;
 }
// 둘러보기 소개 질문(261116 대표 결정 — 기본 꺼짐·고객이 고름, 무료): 순간이 2개→3개가 되는 저장
// 직후 한 번 묻는다(쉬운 추가·자세한 추가·책 추가 모두 — 저장 동기화 지점이 한 곳). 고른 값은
// PUT /api/trees/<id>/discover(#739)로 저장하고, 한 트리에 한 번만 묻는다(고른 뒤 다시 묻지 않음).
// 이미 소개가 켜진 트리(#739 백필)는 묻지 않는다. #718의 '공개됐어요' 안내는 이 질문 창으로 대신한다.
const countTreeMoments=()=>{const out={};for(const tree of (model?.trees||[]))out[tree.id]=(tree.moments||[]).length;return out;};
function discoverAskedList(){try{const raw=JSON.parse(localStorage.getItem('lt41.discoverAsked')||'[]');return Array.isArray(raw)?raw.filter(v=>typeof v==='string'):[]}catch{return[]}}
function markDiscoverAsked(treeId){try{const list=discoverAskedList();if(!list.includes(treeId))list.push(treeId);localStorage.setItem('lt41.discoverAsked',JSON.stringify(list));}catch{}}
const discoverState=new Map(); // 트리 id → 마지막으로 확인한 소개 값(배너·공유 판이 같은 값을 본다)
async function refreshTreeDiscover(treeId){
 try{const answer=await shareApi.getTreeDiscover(treeId);if(!answer.ok)return null;
  discoverState.set(treeId,answer.discover===true);return answer.discover===true;}catch{return null}
}
async function askDiscover(treeId){
 try{
  const discover=await refreshTreeDiscover(treeId);
  if(discover===null)return; // 확인 실패 — 마킹하지 않아 다음 저장 때 다시 본다
  markDiscoverAsked(treeId);
  if(discover===true)return; // 이미 소개 켜진 트리(#739 백필)는 묻지 않는다
  $('discover-ask-feedback').textContent='';
  $('discover-ask').dataset.treeId=treeId;
  $('discover-ask').showModal();
  try{localStorage.setItem('lt41.publicNoticeShown','1');}catch{} // 질문 창이 #538 첫 공개 안내와 같은 사실을 대신한다 — 답한 뒤 배너가 또 뜨지 않게
 }catch{/* 이미 다른 창이 열려 있으면 다음 저장 때 다시 본다 */}
}
function answerDiscover(discover){
 const treeId=$('discover-ask').dataset.treeId;
 if(!treeId)return;
 shareApi.setTreeDiscover(treeId,discover).then(answer=>{
  if(!answer.ok){$('discover-ask-feedback').textContent=answer.message||'소개 설정을 저장하지 못했어요.';return;}
  discoverState.set(treeId,discover);
  markDiscoverAsked(treeId);
  // 261117 대표 검수: 답변 확인 알림은 띄우지 않는다 — 첫 화면 숫자 줄을 가리고, 질문 창 본문이
  // 이미 같은 사실을 말한다. 소개 상태는 공유 판(언제든 켜고 끄는 곳)에서 확인한다.
  $('discover-ask').close();
 }).catch(()=>{$('discover-ask-feedback').textContent='소개 설정을 저장하지 못했어요.';});
}
$('discover-ask-yes').onclick = () => answerDiscover(true);
$('discover-ask-no').onclick = () => answerDiscover(false);
// 상단 배너(첫 저장 안내): 소개 상태에 맞는 문장 — 이름·아이디는 안 보인다는 말은 유지한다.
async function notifyPublicBanner(treeId){
 let discover=false;
 if(treeId){const got=await refreshTreeDiscover(treeId);if(got!==null)discover=got;}
  const text=discover
   ?'이 트리는 둘러보기에 소개 중이에요. 공유 판에서 끌 수 있어요. 이름·아이디는 보이지 않아요.'
   :'내 트리는 링크를 받은 사람만 볼 수 있어요. 둘러보기 소개는 공유 판에서 켤 수 있어요. 이름·아이디는 보이지 않아요.';
  try{localStorage.setItem('lt41.publicNoticeShown','1');}catch{} // #538 기기당 1회 — 질문 창과 같은 사실을 알리는 안내다
  notify(text);
}
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
  if(status.phase==='conflict'){
   // 이슈 644 3번: 충돌 떠는 쉬운 말 + 주 단추 하나(최신 기록 불러오기). 불러오기 전에 이 화면 기록을
   // 자동으로 백업해 기록 손실이 없게 한다. '덮어쓰기'는 '자세히' 안에 둔다 — 저장 규칙은 그대로다.
   $('save-message').textContent=status.detail||'';
   const pull=status.actions.find(a=>a.name==='pull');
   if(pull){
    const primary=document.createElement('button');
    primary.className='primary';
    primary.textContent=pull.label||'최신 기록 불러오기';
    primary.onclick=async()=>{backup();await member?.act('pull');};
    $('save-actions').append(primary);
   }
   const force=status.actions.find(a=>a.name==='force');
   if(force){
    const more=document.createElement('button');
    more.textContent='자세히';
    more.setAttribute('aria-expanded','false');
    const extra=document.createElement('div');
    extra.className='save-extra';
    extra.hidden=true;
    const overwrite=document.createElement('button');
    overwrite.textContent=force.label||'이 화면 것으로 덮어쓰기';
    overwrite.onclick=async()=>{
     if(!confirm('이 화면의 기록을 서버에 저장하고, 다른 곳에서 바뀐 기록은 지워질 수 있어요. 계속할까요?'))return;
     extra.hidden=true;
     await member?.act('force');
    };
    const keep=document.createElement('button');
    keep.textContent='현재 기록 백업';
    keep.onclick=backup;
    extra.append(overwrite,keep);
    more.onclick=()=>{extra.hidden=!extra.hidden;more.setAttribute('aria-expanded',String(!extra.hidden));};
    $('save-actions').append(more,extra);
   }
  }
  else{
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
 }
 if(status.phase==='checking')notify('내 기록을 불러오고 있어요.');
 else if(status.phase==='synced'){
  // #549: 기록(순간)이 0개인 새 계정의 첫 안내는 '불러왔어요' 대신 첫 순간 안내로(문구는 notice.mjs 한 벌).
  const momentCount=(model?.trees||[]).reduce((n,tree)=>n+((tree.moments||[]).length),0);
  notify(syncedNoticeText({writable:status.writable,previousDirty,momentCount}));
  // 소개 질문(2026-11-16 대표 결정): 아직 안 물은 트리 중 순간 3개 이상인 것이 있으면 묻는다 —
  // 2→3 저장 직후가 대표 경로다. 직전 관측 스냅샷(상태마다 재촬영)은 두지 않는다(#718 원인): 재촬영하면
  // syncing에서 before==after가 되어 전이를 놓친다. 질문은 트리당 1회(discoverAsked), 백필(이미 켜진)은 건너뛴다.
  const treeCounts=countTreeMoments();
  const askCandidates=status.writable
   ?newlyPublishedTrees(null,treeCounts).filter(row=>!discoverAskedList().includes(row.treeId))
   :[];
  const askTree=askCandidates[0]||null;
  if(askTree)askDiscover(askTree.treeId);
  // #538: 첫 순간을 담은 뒤 한 번, 공개 방식(링크 공유·둘러보기 소개 기본 꺼짐)과 익명성을 알린다. 기기당 1회.
  // 질문 창이 뜨는 저장에서는 같은 사실(공개 방식·익명성)이라 여기는 건너뛴다.
  else if(previousDirty&&status.writable&&(model?.trees||[]).some(tree=>tree.moments.length>0)){
   let shown=false;try{shown=localStorage.getItem('lt41.publicNoticeShown')==='1';}catch{}
   if(!shown)notifyPublicBanner((model?.trees||[])[0]?.id);
  }
 }
 else if(status.phase==='login'&&!status.dirty)notify('로그인이 필요해요.');
 else if(!status.dirty&&status.phase==='offline')notify(status.detail||'내 기록을 불러오지 못했어요.');
 $('write-menu').textContent=status.dirty?'저장 안 됨' :'＋ 순간 추가';$('empty-records').textContent=status.writable?'＋ 첫 트리 만들기':'내 기록 불러오기';/* #463: 이름을 한 곳에서 정한다(paintEmptyCopy와 같은 글자) *//* #463: 주 버튼 표시도 같이 유지한다(쓸 상태가 바뀌도 강조가 엉키지 않게). */$('empty-records').classList.toggle('primary',!!status.writable);$('empty-sample').classList.toggle('primary',!status.writable);previousDirty=status.dirty;renderAccount();flowNavigation();document.body.dataset.member=member?.snapshot().owned?'in':'out';document.body.dataset.treeCount=String(model?.trees?.length||0);applyAdvanced();
}
async function startMember(){setMemberRefreshStarted(true);if(!leaveMember())return;backfillStarted=false;backfillAttempted.clear();const startup=parseSelectionRoute(location.hash);if(startup.scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);++loadGeneration;const generation=loadGeneration;clear();
 const api=createWorkspaceApi({fetchImpl:(url,init)=>fetch(init?.method==='GET'&&url==='/api/workspace'?'/api/workspace?features=bound-writes':url,init)});
 let initialized=false,startupNotice='',session;
 session=createMemberSession({api,onState:(state,selection,meta)=>{if(generation!==loadGeneration)return;
  // 4.1 기억 보드 저장: 화면이 이미 자기 상태를 들고 있으므로 셸은 모델만 갱신하고 iframe을 다시 그리지 않는다.
  if(meta?.board){const projected=workspaceModel({revision:0,state});model=projected;if(window.LT41){const tree=projected.trees.find(t=>t.id===window.LT41.tree.id);if(tree){window.LT41.tree=tree;window.LT41.trees=projected.trees;window.LT41.writable=true}}return;}const snapshot=session.snapshot(),saved=accountPosition(localStorage,snapshot.subject)||{},active=parseSelectionRoute(location.hash),pending=!initialized&&active.scope!=='owner'?pendingOwnerRoute(sessionStorage):null,route=active.scope==='owner'?active:pending;let requested=selection||stateSelection();
   if(!initialized){if(route)requested=route;else if(!selection)requested=saved;
    // #583 '이 순간 열기': 맨 처음 주소(#my/network?tree=…&moment=…)로 열 때도 지도가 그 순간을 가운데 두게 한다 —
    // 뒤의 주소 이동(applyBrowserLocation)과 같은 규칙. 이후 동기화 때는 다시 정하지 않는다(initialized 뒤).
    if(!initialized&&route?.scope==='owner'&&route.view==='network'&&route.momentId)requestNetworkOpen(route.momentId);
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
   // 261116 PR 2: 첫 화면 카드 모드도 기기 미러를 계정값으로 채운다(첫 화면 문서는 계정 값을 늦게 알 수 있다).
   try{localStorage.setItem('lt41.homeMoment',JSON.stringify(normalizeHomeMoment(state.prefs?.homeMoment)));}catch{}
   // #481: 제목 보기도 같은 이유로 기기 미러를 계정값으로 채운다.
   rememberTitleDisplay(state.prefs?.titleDisplay);
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
 if($('account-popover').hidden){openAccountMenu(e.detail===0?'keyboard':'mouse');void feedbackBoard.refreshReplyDot();}else closeAccountMenu();
};
const $on=(id,fn)=>{const el=$(id);if(el)el.onclick=fn;};
function advancedKey(){try{return 'lt41.advanced.'+(member?.snapshot().subject||'')}catch{return 'lt41.advanced.'}}
function readAdvanced(){try{return localStorage.getItem(advancedKey())==='1'}catch{return false}}
function applyAdvanced(){const on=readAdvanced();document.body.classList.toggle('lt-advanced',on);const sw=$('settings-advanced');if(sw){sw.setAttribute('aria-checked',String(on));sw.textContent=on?'켬':'끔';}try{$('view').contentWindow.postMessage({type:'lt41-advanced',value:on},location.origin)}catch{}}
 $('account-assets-open').onclick=()=>{closeAccountMenu();openAssets($('account-avatar'));};
// #368: 설정 "내 데이터"의 내 보관 파일 열기. 창 위에 보관 파일 창이 열리고 닫으면 이 버튼으로 초점이 돌아온다.
$('settings-assets-open').onclick=()=>openAssets($('settings-assets-open'));
 $('editor-assets-open').onclick=()=>openAssets($('editor-assets-open'));
 for(const b of document.querySelectorAll('[data-set-theme]'))b.onclick=()=>{writeTheme(localStorage,b.dataset.setTheme);applyTheme();paintThemeControls();syncBoardThemeToApp(b.dataset.setTheme);};
const themeToggleTop=$('theme-toggle');if(themeToggleTop)themeToggleTop.onclick=()=>{toggleTheme();};
 // 고급 기능 보기 스위치는 설정 '화면' 탭의 '더 보기(고급)' 안에 있다(2026-11-16 계정 메뉴에서 옮김). 저장 키(lt41.advanced.<subject>)는 그대로다.
 $('settings-advanced').onclick=()=>{const next=!readAdvanced();try{localStorage.setItem(advancedKey(),next?'1':'0')}catch{}applyAdvanced();};
 $('account-open-settings').onclick=()=>{closeAccountMenu();void openAccountSettings();};
 // 고객 의견 창구 (#540): 로그인=계정 메뉴, 로그아웃=첫 화면 아래 작은 링크·접기 메뉴. 모두 같은 창을 쓴다.
 const FEEDBACK_SCREEN={'src064-orbit.html':'첫 화면','track59-sketchbook.html':'책','track58-pinboard.html':'보드','track56-network.html':'지도','track32-bookshelf.html':'서재'};
 function feedbackContext(){
  const owned=!!member?.snapshot().owned;
  const screen=$('community-panel')?.open?'둘러보기':$('account-settings')?.open?'설정':(FEEDBACK_SCREEN[current]||'첫 화면');
  const treeId=owned&&source==='server'&&window.LT41?.tree?.id?String(window.LT41.tree.id):'';
  return {screen,viewport:window.innerWidth+'x'+window.innerHeight,theme:readTheme(localStorage),version:'4.1',loggedIn:owned,treeId};
 }
 const feedbackDialog=createFeedbackDialog({$,notify,getContext:feedbackContext,show:()=>panel('feedback-panel'),openMyPosts:()=>{shellDialogs.requestClose('feedback-panel');feedbackBoard.openMyPosts();}});
 // 2026-11-16 계정 메뉴 정리: 메뉴의 '의견 보내기' 칸을 없애고 내 의견 창 안에서 바로 보내게 했다.
 // 보내기 창은 로그아웃 첫 화면 작은 링크($('feedback-link'))와 같은 창을 쓴다(feedbackDialog).
 $('myposts-send').onclick=()=>{shellDialogs.requestClose('myposts-panel');feedbackDialog.open();};
 // '어떻게 쓰나요': 첫 화면의 안내 패널(#635)을 연다 — 별도 안내 화면은 없다(#388).
 // 첫 화면이 아니면 먼저 첫 화면으로 옮긴 뒤, 프레임이 안내 패널을 만들었을 때(초기화 끝) 여는 메시지를 한 번 보낸다(최대 3초).
 function openGuideFromMenu(){
  closeAccountMenu();
  const send=()=>{try{$('view').contentWindow.postMessage({type:'lt41-open-guide'},location.origin)}catch{}};
  if(current==='src064-orbit.html'){send();return;}
  show('src064-orbit.html');
  let tries=0;
  const tick=()=>{let ready=false;try{ready=!!$('view').contentDocument?.getElementById('orbit')?.shadowRoot?.querySelector('#guidePanel')}catch{}
   if(ready||tries>=30){send();return;}tries+=1;setTimeout(tick,100);};
  setTimeout(tick,100);
 }
 $('account-guide').onclick=openGuideFromMenu;
 $('feedback-link').onclick=()=>feedbackDialog.open();
 // 2차: AI 고객 '오늘 사용 일지'·모든 로그인 사용자 '내 의견'.
 // #611 4번: 새 답글 알림 — 단추 점과 '내 의견' 옆 숫자를 함께 갱신한다.
 const dotState={updates:false,replies:false};
 let accountTip='';
 // 이슈 644 2번: 아바타 점과 계정 메뉴 항목의 점·개수·설명을 함께 갱신한다.
 function paintAccountDots(){
  const avatar=$('account-avatar');
  if(avatar){
   avatar.classList.toggle('has-dot',!!(dotState.updates||dotState.replies));
   const tip=dotState.updates&&dotState.replies?'새 소식과 새 답글이 있어요':dotState.updates?'새 소식이 있어요':dotState.replies?'새 답글이 있어요':'';
   accountTip=tip;
   avatar.title=tip||'내 계정';
  }
  const updatesItem=$('account-updates'),updatesCount=$('account-updates-count');
  if(updatesItem)updatesItem.classList.toggle('has-dot',!!dotState.updates);
  if(updatesCount){updatesCount.hidden=!dotState.updates;if(dotState.updates)updatesCount.textContent='1';}
  const postsItem=$('account-my-posts');
  if(postsItem)postsItem.classList.toggle('has-dot',dotState.replies);
 }
 function onReplyCount(count){const badge=$('account-my-posts-count');if(badge){badge.hidden=!(count>0);if(count>0)badge.textContent=String(count);}dotState.replies=count>0;paintAccountDots();}
 const feedbackBoard=createFeedbackBoard({$,notify,show:()=>panel('journal-panel'),showFull:()=>panel('myposts-panel'),onReplyCount,onOpenUpdates:version=>{void updatesMount.openUpdates(version);}});
 $('account-journal').onclick=()=>{closeAccountMenu();feedbackBoard.openJournal();};
 $('account-my-posts').onclick=()=>{closeAccountMenu();feedbackBoard.openMyPosts();};
 // #540 마무리: 운영센터 입구. 계정 메뉴·설정의 '운영' 묶음에서 같은 화면을 새 탭으로 연다.
 // 항목 자체는 서버가 알려 준 관리자 역할로만 보인다(header.mjs).
 const openOpsCenter=()=>{const win=window.open('/admin.html','_blank','noopener');if(!win)location.assign('/admin.html');};
 $('account-ops').onclick=()=>{closeAccountMenu();openOpsCenter();};
 $('settings-ops-open').onclick=()=>openOpsCenter();
 // #611 새 소식: 계정 메뉴·설정 아래쪽·로그아웃 작은 링크 모두 같은 창을 쓴다.
 const updatesMount=mountUpdates({$,showPanel:id=>panel(id),onDot:unread=>{dotState.updates=!!unread;paintAccountDots();}});
 $('account-updates').onclick=()=>{closeAccountMenu();void updatesMount.openUpdates();};
 $('updates-link').onclick=()=>{void updatesMount.openUpdates();};
 $('settings-updates-open').onclick=()=>{$('account-settings').close();void updatesMount.openUpdates();};
 void updatesMount.start();
 if(member?.snapshot?.().owned)void feedbackBoard.refreshReplyDot();
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
  // #465 2: 움직임은 켬/끔 스위치(role=switch) — 켬(기본, aria-checked=true)·끔(멈춤)으로 상태가 보인다.
 if(motion){motion.setAttribute('aria-checked',String(!motionPaused));motion.textContent=motionPaused?'끔':'켬';}
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
// #368 + 2026-11-16 탭 정리: 설정은 탭 넷(화면·프로필·기록 보기·계정·개인정보)이다. 입구는 탭 이름으로 열고
// 해당 탭으로 초점과 스크롤을 옮긴다. 접힘 안의 묶음(내 데이터·공유·순간 추가)은 행선지로 열 때 접힘도 펼친다.
const SETTINGS_TABS=[['settings-tab-screen','account-settings-screen'],['settings-tab-profile','account-settings-profile'],['settings-tab-records','account-settings-records'],['settings-tab-account','account-settings-account']];
function paintSettingsTab(tabId){for(const[t,p]of SETTINGS_TABS){const tab=$(t),panel=$(p);if(!tab||!panel)continue;const on=t===tabId;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;panel.hidden=!on;}}
for(const[t]of SETTINGS_TABS){const tab=$(t);if(tab)tab.onclick=()=>paintSettingsTab(t);}
// 탭 목록에서 좌우(좁은 화면의 가로 탭은 위·아래) 화살표·Home·End로 탭을 옮긴다(tablist 관례).
const settingsTabList=document.querySelector('.settings-tabs');
if(settingsTabList)settingsTabList.addEventListener('keydown',event=>{const ids=SETTINGS_TABS.map(([t])=>t);const at=ids.indexOf(document.activeElement?.id);if(at<0)return;let next=-1;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(at+1)%ids.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(at-1+ids.length)%ids.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=ids.length-1;if(next<0)return;event.preventDefault();paintSettingsTab(ids[next]);$(ids[next])?.focus();});
function focusSettingsSection(section=''){
 const box=$('account-settings');if(!box?.open)return;
 // #453 C1: 기본은 첫 탭(화면)에서 연다. 입구가 구역을 지정했을 때만 그 탭으로 옮긴다.
 if(!section){paintSettingsTab('settings-tab-screen');return;}
 const tabFor={screen:'settings-tab-screen',profile:'settings-tab-profile',records:'settings-tab-records',data:'settings-tab-account',account:'settings-tab-account'};
 const tabId=tabFor[section];if(!tabId)return;
 paintSettingsTab(tabId);
 const foldFor={data:'account-settings-more',records:'account-settings-records-more',write:'account-settings-records-more',share:'account-settings-records-more',look:'account-settings-screen-more'};
 const fold=$(foldFor[section]||'');if(fold)fold.open=true;
 queueMicrotask(()=>{const heading=$( {data:'settings-data-title',profile:'settings-profile-title',screen:'settings-screen-title',records:'settings-records-title',account:'settings-account-title'}[section]||'');if(heading){heading.scrollIntoView({block:'start'});heading.focus({preventScroll:true});}});
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
 const message=frameMessage('pageTurn',currentPageTurn()==='on');
 try{frame.contentDocument?.documentElement?.setAttribute('data-lt-page-turn',currentPageTurn());}catch{}
 sendToFrame(frame,message);
}
function paintPageTurnControls(){const value=currentPageTurn();for(const b of document.querySelectorAll('[data-page-turn]'))b.setAttribute('aria-checked',String(b.dataset.pageTurn===value));}
// #368 3차: 날짜 표기·처음 보여 줄 곳·공유 기본값은 계정(state.prefs), 관계 지도 기본 보기는 이 기기(lt41.network.view — network.js와 같은 키).
// 날짜 표기는 책·보드·지도·첫 화면이 같은 한 벌(formatDisplayDate)로 따르고, 셸은 프레임 속성+lt41-date-style 메시지로 알린다.
function currentDateStyle(){try{return normalizeDateStyle(member?.state?.().prefs?.dateStyle)}catch{return 'dot'}}
function sendToFrame(frame,message){
 try{frame.contentWindow?.postMessage(message,location.origin);}catch{}
}
// #481 T6: 실제로 보내는 값도 frame-wiring 한 곳에서 만든다(시험이 그 목록을 그대로 돈다).
function applyDateStyleToFrame(frame){
 const message=frameMessage('dateStyle',currentDateStyle());
 try{frame.contentDocument?.documentElement?.setAttribute('data-lt-date-style',message.value);}catch{}
 sendToFrame(frame,message);
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
// 2026-11-16 대표 요청: 쉬운 추가가 처음 고르는 트리 — 지금 보고 있는 트리(기본) 또는 늘 같은 트리.
// 이 기기 설정(localStorage lt41.* 규칙)이고, 고른 트리를 지우면 지금 보고 있는 트리로 돌아간다
// (쉬운 추가·자세한 추가가 이 한 벌(quickTargetPreference)을 따른다).
const QUICK_TARGET_KEY='lt41.quickAddTarget';
const QUICK_TARGET_TREE_KEY='lt41.quickAddTreeId';
function quickAddTargetMode(){try{return localStorage.getItem(QUICK_TARGET_KEY)==="fixed"?"fixed":"current"}catch{return "current"}}
function quickAddFixedTreeId(){try{return localStorage.getItem(QUICK_TARGET_TREE_KEY)||""}catch{return ""}}
function quickTargetPreference(){return {mode:quickAddTargetMode(),treeId:quickAddFixedTreeId()}}
function paintQuickTargetControls(){
  const mode=quickAddTargetMode();
  for(const b of document.querySelectorAll("[data-quick-target]"))b.setAttribute("aria-checked",String(b.dataset.quickTarget===mode));
  const sel=$("quick-target-tree");
  if(!sel)return;
  const trees=model?.trees||[];
  sel.replaceChildren(...trees.map(t=>{const o=document.createElement("option");o.value=t.id;o.textContent=displayTreeTitle(t.title||t.subject||"트리");return o}));
  sel.hidden=mode!=="fixed"||!trees.length;
  const wanted=quickAddFixedTreeId();
  sel.value=trees.some(t=>t.id===wanted)?wanted:(trees[0]?.id||"");
}
for(const b of document.querySelectorAll("[data-quick-target]"))b.onclick=()=>{
  try{localStorage.setItem(QUICK_TARGET_KEY,b.dataset.quickTarget)}catch{}
  if(b.dataset.quickTarget==="fixed"){const wanted=quickAddFixedTreeId();const trees=model?.trees||[];const keep=trees.some(t=>t.id===wanted)?wanted:(trees[0]?.id||"");if(keep)try{localStorage.setItem(QUICK_TARGET_TREE_KEY,keep)}catch{}}
  paintQuickTargetControls();notify(b.dataset.quickTarget==="fixed"?"쉬운 추가는 고른 트리에 담아요.":"쉬운 추가는 지금 보고 있는 트리에 담아요.");
};
$("quick-target-tree")?.addEventListener("change",()=>{try{localStorage.setItem(QUICK_TARGET_TREE_KEY,$("quick-target-tree").value)}catch{};paintQuickTargetControls();notify("쉬운 추가는 이 트리에 담아요.")});
paintQuickTargetControls();
function currentShareView(){try{return normalizeShareView(member?.state?.().prefs?.shareView)}catch{return 'book'}}
function paintShareControls(){
 const view=currentShareView();
 for(const b of document.querySelectorAll('[data-share-view]'))b.setAttribute('aria-checked',String(b.dataset.shareView===view));
}
for(const b of document.querySelectorAll('[data-share-view]'))b.onclick=()=>{
 if(!member?.snapshot().owned){notify('로그인한 뒤 공유 기본값을 바꿀 수 있어요.');return;}
 try{member.apply('setPrefs',{shareView:b.dataset.shareView});}catch(e){notify('공유 기본값을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 paintShareControls();notify('공유 창이 이 보기로 열려요.');
};
// #538: 트리 공개는 트리마다 고른다(전 트리 일괄 변경은 실수 위험이라 하지 않는다 — #830 후속).
// 각 줄: 트리 이름 | [공개][비공개]. 서버 상태를 같은 API로 읽고 쓴다.
const visibilityByTreeId=new Map();
function escapeTreeName(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function paintTreeVisibilityList(){
 const box=$('settings-tree-visibility-list');if(!box)return;
 const trees=Array.isArray(model?.trees)?model.trees:[];
 if(!trees.length){box.replaceChildren();const p=document.createElement('p');p.className='panel-note';p.textContent='바꿀 트리가 없어요.';box.append(p);return;}
 box.replaceChildren();
 for(const tree of trees){
  const visibility=visibilityByTreeId.get(tree.id)||'public';
  const row=document.createElement('div');
  row.className='settings-row';
  row.setAttribute('role','group');
  row.setAttribute('aria-label', '트리 공개 '+(tree.title||''));
  row.dataset.treeId=tree.id;
  const count=Array.isArray(tree.moments)?tree.moments.length:0;
  row.innerHTML='<span class="settings-label">'+escapeTreeName(tree.title||'제목 없는 트리')+' <small>순간 '+count+'개</small></span><div class="settings-choice">'+
   '<button type="button" role="radio" data-tree-visibility-tree="'+escapeTreeName(tree.id)+'" data-tree-visibility-value="public" aria-checked="'+String(visibility==='public')+'" class="'+(visibility==='public'?'settings-current':'')+'">공개</button>'+
   '<button type="button" role="radio" data-tree-visibility-tree="'+escapeTreeName(tree.id)+'" data-tree-visibility-value="private" aria-checked="'+String(visibility==='private')+'" class="'+(visibility==='private'?'settings-current':'')+'">비공개</button></div>';
  box.append(row);
 }
 for(const b of box.querySelectorAll('[data-tree-visibility-value]'))b.onclick=()=>setTreeVisibility(b.dataset.treeVisibilityTree,b.dataset.treeVisibilityValue);
}
async function setTreeVisibility(treeId,visibility){
 if(!member?.snapshot().owned){notify('로그인한 뒤 공개 상태를 바꿀 수 있어요.');return;}
 const answer=await shareApi.setTreeVisibility(treeId,visibility).catch(()=>({ok:false}));
 if(answer&&answer.ok!==false){visibilityByTreeId.set(treeId,visibility);paintTreeVisibilityList();notify(visibility==='private'?'이 트리를 비공개로 바꿨어요.':'이 트리를 공개로 바꿨어요.');}
 else notify('공개 상태를 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.');
}
async function loadTreeVisibility(){
 const trees=Array.isArray(model?.trees)?model.trees:[];
 if(!trees.length){paintTreeVisibilityList();return;}
 for(const tree of trees){
  const answer=await shareApi.getTreeVisibility(tree.id).then(a=>(a.ok?a.visibility:null)).catch(()=>null);
  if(answer==='private'||answer==='public')visibilityByTreeId.set(tree.id,answer);
 }
 paintTreeVisibilityList();
}
paintTreeVisibilityList();
// 트리 관리 창(#810): 같은 선택, 같은 값.
async function paintTreeManagerVisibility(){
 const treeId=window.LT41?.tree?.id;if(!treeId)return;
 const answer=await shareApi.getTreeVisibility(treeId).then(a=>(a.ok?a.visibility:null)).catch(()=>null);
 if(answer!=='public'&&answer!=='private')return;
 visibilityByTreeId.set(treeId,answer);
 for(const b of document.querySelectorAll('[data-tree-manager-public]')){b.setAttribute('aria-checked',String(answer==='public'));b.classList.toggle('settings-current',answer==='public');}
 for(const b of document.querySelectorAll('[data-tree-manager-private]')){b.setAttribute('aria-checked',String(answer==='private'));b.classList.toggle('settings-current',answer==='private');}
}
for(const b of document.querySelectorAll('[data-tree-manager-public]'))b.onclick=()=>{const id=window.LT41?.tree?.id;if(id)setTreeVisibility(id,'public');};
for(const b of document.querySelectorAll('[data-tree-manager-private]'))b.onclick=()=>{const id=window.LT41?.tree?.id;if(id)setTreeVisibility(id,'private');};
try{$('tree-manager')?.addEventListener('open',paintTreeManagerVisibility);}catch{}
paintShareControls();
// 보관 파일 용량 보기 — 보관 파일 창과 같은 값(/api/media)을 같은 형식으로 보여 준다. 새 API 없음.
async function paintSettingsUsage(){
 const el=$('settings-usage');if(!el)return;
 el.hidden=false;el.textContent='보관 파일 사용량을 불러오고 있어요…';
 const answer=await accountApi.listMedia().catch(()=>null);
 if(!$('settings-usage'))return;
 const data=answer?.media;
 // 2026-11-16: 값이 온전할 때만 채운다(숫자·목록이 비면 NaN·undefined 글자가 화면에 남는다 — 흔적 값 넷 기준선).
 if(!answer?.ok||!data||typeof data.usedBytes!=='number'||typeof data.quotaBytes!=='number'||!Array.isArray(data.items)||typeof data.maxItems!=='number'){el.hidden=true;el.textContent='';return;}
 el.textContent=Math.round(data.usedBytes/1000000)+' MB / '+Math.round(data.quotaBytes/1000000)+' MB 사용 · '+data.items.length+' / '+data.maxItems+'개';
}
for(const b of document.querySelectorAll('[data-page-turn]'))b.onclick=()=>{
 const next=writePageTurn(localStorage,b.dataset.pageTurn);
 paintPageTurnControls();
 for(const f of frames())applyPageTurnToFrame(f);
 notify(next==='smooth'?'페이지 넘김을 부드럽게 바꿨어요.':'페이지 넘김을 종이처럼 바꿨어요.');
};
paintPageTurnControls();
// #467: 보드 판 테마(종이/밤) — 이 기기에만 저장한다(localStorage lt41.boardTheme). 기본은 종이이고,
// 바꾸면 열린 보드·지도에 바로 반영한다(프레임 속성 + lt41-board-theme 메시지).
// #853(도현 1~2회차): 기본값은 사용자 테마를 따른다 — 밤 테마면 밤 판, 정원(낮)이면 종이 판.
// 사용자가 [종이|밤]으로 직접 고른 값은 저장해 계속 쓰고, 앱 테마를 바꾸면(syncBoardThemeToApp)
// 다시 그 테마에 맞는 판으로 함께 바뀐다.
const BOARD_THEME_KEY='lt41.boardTheme';
function currentBoardTheme(){try{const saved=localStorage.getItem(BOARD_THEME_KEY);if(saved==='night'||saved==='paper')return saved;return readTheme(localStorage)==='garden'?'paper':'night'}catch{return 'night'}}
function paintBoardThemeControls(){const value=currentBoardTheme();for(const b of document.querySelectorAll('button[data-board-theme]'))b.setAttribute('aria-checked',String(b.dataset.boardTheme===value));}
function applyBoardThemeToFrame(frame){
 const message=frameMessage('boardTheme',currentBoardTheme());
 try{frame.contentDocument?.documentElement?.setAttribute('data-lt-board-theme',message.value);}catch{}
 sendToFrame(frame,message);
}
for(const b of document.querySelectorAll('button[data-board-theme]'))b.onclick=()=>{
 const next=b.dataset.boardTheme==='night'?'night':'paper';
 try{localStorage.setItem(BOARD_THEME_KEY,next)}catch{}
 paintBoardThemeControls();
 for(const f of frames())applyBoardThemeToFrame(f);
 notify(next==='night'?'보드·지도 판을 밤 테마로 바꿨어요.':'보드·지도 판을 종이 테마로 바꿨어요.');
};
// #853: 앱 테마(밤/정원)를 바꾸면 보드·지도 판도 그 테마에 맞춘다 — 밤이면 밤 판, 정원이면 종이 판.
// 열린 화면에 바로 반영하고 저장해 두어 다음에 뜨는 보드·지도도 같은 값을 쓴다.
function syncBoardThemeToApp(theme){
 const plate=theme==='garden'?'paper':'night';
 try{localStorage.setItem(BOARD_THEME_KEY,plate)}catch{}
 paintBoardThemeControls();
 for(const f of frames())applyBoardThemeToFrame(f);
}
paintBoardThemeControls();
window.addEventListener('message',e=>{
 if(e.origin!==location.origin)return;
 if(e.data?.type==='lt41-home-moment'){
  // 261116 PR 2: 첫 화면 카드 모드 저장 — 기기 미러를 먼저 쓰고 계정 설정(이미 있는 setPrefs 길)에 반영한다.
  const value=normalizeHomeMoment(e.data.value);
  try{localStorage.setItem('lt41.homeMoment',JSON.stringify(value))}catch{}
  if(member?.snapshot().owned){
   try{member.apply('setPrefs',{homeMoment:value});if(window.LT41)window.LT41.prefs=member.state().prefs;}catch{}
  }
 }
 if(e.data?.type==='lt41-board-theme'){
  const next=e.data.value==='night'?'night':'paper';
  try{localStorage.setItem(BOARD_THEME_KEY,next)}catch{}
  paintBoardThemeControls();
  for(const f of frames())applyBoardThemeToFrame(f);
 }
});
// #368: 옛 내 기록 창을 여던 입구(읽기 전용 안내·빈 화면)의 공통 행선지. 로그아웃이면 로그인으로 보낸다.
function openAccountData(intent='first'){
 if(!member?.snapshot().owned){openLoginStart(intent);return;}
 void openAccountSettings({section:'data'});
}
async function openAccountSettings({section=''}={}){
 accountExpected=null;$('account-delete-status').textContent='';
 // #453 C2: 지난번에 뜬 '내 기록을 불러왔어요.' 같은 안내가 창 안에 남지 않는다.
 if($('settings-feedback'))$('settings-feedback').textContent='';$('account-confirm').value='';$('account-delete').disabled=true;$('account-confirm-hint').textContent='';
 // 로그아웃·공유·예시 상태에서는 설정 입구가 없다(기존 규칙). 여기서도 열지 않는다.
 if(!member?.snapshot().owned){notify('로그인한 뒤 설정을 열 수 있어요.');return;}
 paintSettingsProfile();
 fillProfileForm();
 paintDateStyleControls();paintStartPlaceControls();paintNetworkViewControls();paintShareControls();paintQuickTargetControls();
 void paintSettingsUsage();void loadTreeVisibility();
 panel('account-settings');
 focusSettingsSection(section);
 // #540 마무리: '운영' 묶음은 관리자 계정에만 보인다(서버가 알려 준 역할). 열림 때마다 다시 판정한다.
 const opsSection=$('account-settings-ops');if(opsSection)opsSection.hidden=true;
 const answer=await accountApi.account();
 if(opsSection)opsSection.hidden=!(answer.ok&&answer.admin);
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
 $('account-delete-status').textContent='탈퇴를 처리하고 있어요.';
 const answer=await accountApi.deleteAccount(value);
 if(!answer.ok){
  $('account-delete-status').textContent=answer.message||'탈퇴하지 못했어요. 다시 시도해 주세요.';
  button.disabled=false;
  return;
 }
 try{member?.dispose?.();}catch{}
 member=null;source='example';clear();$('account-settings').close();updateAccountControls();
 notify(answer.commonAccountDeleted
  ? '러브트리 탈퇴와 함께 공통 로그인 계정과 인증 세션을 폐기했습니다.'
  : '러브트리에서 탈퇴했습니다. 다른 서비스 연결이 남아 있어 공통 계정은 유지됩니다.');
};$('logout').onclick=async()=>{if(member){await member.act('logout');if(member.snapshot().dirty){notify('미저장 기록이 있어 로그아웃하지 않았어요. 다시 저장하거나 백업해 주세요.');return;}/* 로그아웃 뒤 머리글만 바뀌고 첫 화면 본문·카드·숫자 줄이 회원 상태로 남았다 — 새 문서로 다시 열어 셸 전체를 비로그인 상태로 그린다(account=1·#my/... 같은 기록 주소도 함께 사라진다). */try{sessionStorage.setItem('lt41.logoutNotice','1');}catch{}location.replace(location.pathname);return;}const answer=await createWorkspaceApi().logout();if(answer.ok)clearCachedWorkspace(localStorage);notify(answer.ok?'로그아웃했습니다.':'로그아웃하지 못했어요. 다시 시도해 주세요.');};
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
 activeShareId=answer.share.id;const view=['book','board','network'].includes(route.view)?route.view:answer.share.view;current=screenForView(view)[1];load({revision:0,state:{version:1,trees:[answer.tree]}},'share',{treeId:answer.tree.id,momentId:answer.share.entryMomentId});activeShareId=answer.share.id;show(current,false);writeLocation('replace');notify('공개된 트리를 감상하는 화면이에요. 감상만 할 수 있어요.'+(answer.aiTester?' AI 명예회원이 만든 트리예요.':'')+(answer.omittedPrivateMedia?' 올린 사진 '+answer.omittedPrivateMedia+'장은 나만 볼 수 있어요.':''));
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='track32-bookshelf.html'&&!member?.snapshot().owned){openLoginStart('shelf');return;}
 // 261118 대표 지적 2차 5: 서재 화면에서 콕·보드·지도는 마지막에 본 트리(서재 가운데 책의 트리)로 연다.
 if(current==='track32-bookshelf.html'&&b.dataset.view!=='track32-bookshelf.html'){const treeId=lastShelfTreeId();
  if(treeId&&model?.trees?.some(t=>t.id===treeId)&&window.LT41?.tree?.id!==treeId){current=b.dataset.view;choose(treeId);writeLocation();return;}}
 show(b.dataset.view);});
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
// 로그아웃으로 다시 연 문서에서는 '로그인이 필요해요' 대신 이 안내를 한 번 띄운다.
try{if(sessionStorage.getItem('lt41.logoutNotice')==='1'){sessionStorage.removeItem('lt41.logoutNotice');notify('로그아웃했어요.');}}catch{}


