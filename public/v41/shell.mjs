import {mountPrivateUpload} from './private-upload.mjs';
import {memberLoginUrl,shouldLoadMemberRecords} from './member-entry.mjs';
import {workspaceModel} from './workspace-model.mjs';
import {createWorkspaceApi, setMemberRefreshStarted} from './api.mjs';
import {createShareApi} from './share-api.mjs';
import {createMemberSession} from './member-session.mjs';
import {hasPendingDraft} from './sync-controller.mjs';
import {clearCachedWorkspace, readCachedWorkspace} from './workspace-cache.mjs';
// #1026 E: 예시 데이터(1MB)는 정적으로 부르지 않는다 — 로그인 사용자의 화면 로딩을 막지 않게
// 예시가 실제로 필요한 순간에만 동적으로 부른다(로그아웃 첫 화면, 예시 카드 열기, 예시 둘러보기).
let exampleTree=null,examplePromise=null,exampleInitializing=false;
function loadExampleTree(){if(!examplePromise)examplePromise=import('./example.mjs').then(mod=>{exampleTree=mod.exampleTree;return exampleTree});return examplePromise;}
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
import {createMessages, lastShelfTreeId} from './shell/messages.mjs';
import {createTagSave} from './shell/tag-save.mjs';
import {headerBadge, cleanupAvailable} from './inbox-model.mjs';
import {createDialogs} from './shell/dialogs.mjs';
import {createFeedbackDialog} from './feedback.mjs';
import {createFeedbackBoard} from './feedback-board.mjs';
import {mountUpdates} from './updates.mjs';
// #1026 E 2단계(A-06): 창을 열 때만 쓰는 모듈은 그때 받는다. 지연 프록시는 첫 메서드 호출에 모듈을
// 불러오고 factory를 한 번만 만든 뒤, 이후 호출은 곧바로 실제 객체로 넘긴다(동기 반환도 유지).
function lazyPanel(load){
 let promise=null,inst=null;
 const init=()=>promise||(promise=Promise.resolve().then(load).then(x=>(inst=x,x)));
 return new Proxy({},{get(_,key){
  if(key==='__ready')return ()=>!!inst;
  return (...args)=>{if(inst)return inst[key](...args);return init().then(x=>x[key](...args));};
 }});
}
import {connectionSignature} from './shell/panel-dirty.mjs';
import {createLocation} from './shell/location.mjs';
import {createNotifier, syncedNoticeText, newlyPublishedTrees} from './shell/notice.mjs';
import {createSettings} from './shell/settings.mjs';
import {paintLoginLinks,paintThemeControls,applyTheme as applyThemeFor,toggleTheme as toggleThemeFor} from './shell/theme.mjs';
import {normalizeTitleDisplay, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment, coverModeOf, normalizeCoverDesign} from './domain.mjs';
import {backfillVideoTitles} from './title-backfill.mjs';
import {thumbnailCandidates, coverFallbackAttrs, fallbackCardData, emotionToneOf, mountThumbFallback, ADD_TITLE_LABEL, VIDEO_UNAVAILABLE_TEXT} from './thumb-fallback.mjs';
const $=id=>document.getElementById(id);
// #666: 알림 줄(토스트)은 화면 아래에 늘 붙어 있는 것들 — '새 소식·의견 보내기' 링크 줄, ＋ 단추, 새 소식 카드 —
// 을 덮지 않는다. 붙어 있는 것들의 가장 높은 윗변을 좌표로 재서 그 위로 올린다(글자 크기·화면 폭이 달라도 겹침 0).
// 390 실측: 링크 줄 아래 10~37px·＋ 단추 12~68px·카드 86~152px → 알림 줄 아래 134px.
function keepClearEls(doc){const out=[];const walk=(root)=>{for(const el of root.querySelectorAll('[data-lt-keep-clear]'))out.push(el);for(const el of root.querySelectorAll('*'))if(el.shadowRoot)walk(el.shadowRoot)};walk(doc);return out}
function placeToast(){let above=0;for(const el of document.querySelectorAll('.home-links,#mobile-add,.updates-card')){if(el.hidden)continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)continue;const r=el.getBoundingClientRect();if(r.width<1||r.height<1)continue;above=Math.max(above,document.documentElement.clientHeight-r.top+10)}
 // 화면 안의 아래쪽 내용(data-lt-keep-clear 표식 — 책의 페이지 알약·이유 안내·갈림길 책갈피, 첫 화면 숫자판)도 알림이 덮지 않게 한다.
 // 보이는 프레임 문서까지 같은 좌표로 잰다(3회차 보람 회차 — 알림이 책 아래 안내 줄에 포개졌다).
 // 첫 화면 숫자판은 그림자 뿌리(#898) 안에 있으므로 그림자 뿌리까지 걸어 들어가 표식을 모은다.
 const keepFrame=[...document.querySelectorAll('#view,#view-next')].find(f=>!f.hidden&&f.contentDocument&&keepClearEls(f.contentDocument).length);
 if(keepFrame){const fr=keepFrame.getBoundingClientRect();for(const el of keepClearEls(keepFrame.contentDocument)){const cs=keepFrame.contentDocument.defaultView.getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)continue;const r=el.getBoundingClientRect();if(r.width<1||r.height<1)continue;above=Math.max(above,document.documentElement.clientHeight-(fr.top+r.top)+10)}}
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
// #977: 서버 기록에 형식이 어긋난 트리가 섞여 있으면 그 트리만 빼고 셸을 연다(읽기는 workspace-guard.mjs).
// #986: 서버가 읽지 못해 빼 둔 트리는 개수(quarantined)만 응답에 온다 — 화면 안내에 함께 센다.
// 화면에는 짧은 안내 한 줄, 콘솔에는 어느 트리가 왜 어긋났는지 한 줄만 남긴다 — 같은 기록을 다시 읽어도 한 번만.
let guardNoticeKey='';
function workspaceGuardNotice(read){
 const skipped=Array.isArray(read?.skipped)?read.skipped:[];
 const quarantined=Number.isSafeInteger(read?.quarantined)?read.quarantined:0;
 const total=skipped.length+quarantined;
 if(!total)return;
 const key=`${skipped.map(item=>`${item?.id||''}:${item?.reason||''}`).join('|')}#${quarantined}`;
 if(guardNoticeKey===key)return;
 guardNoticeKey=key;
 if(skipped.length)console.warn(`[LT41] 열 수 없는 트리 ${skipped.length}개를 잠시 빼고 열었어요: ${skipped.map(item=>`${item?.id||'(아이디 없음)'}(${item?.reason||'형식을 읽을 수 없어요.'})`).join(', ')}`);
 if(quarantined)console.warn(`[LT41] 서버 기록에서 열 수 없는 트리 ${quarantined}개를 빼고 열었어요(개수만 전해 왔어요).`);
 notify(`열 수 없는 트리 ${total}개를 잠시 빼고 열었어요.`,{hold:true});
}
// #977: 셸을 세우다 예외가 나도 빈 화면에 멈추지 않는다 — 읽을 수 있는 기록으로 한 번 더 열고 안내를 남긴다.
function openFallbackShell(error){
 try{console.warn('[LT41] 셸을 여는 중 문제가 있었어요:',error?.message||String(error));}catch{}
 let state={version:1,trees:[]};
 try{state=member?.state?.()||state;}catch{}
 try{load({revision:0,state},'server');}catch{try{load({revision:0,state:{version:1,trees:[]}},'file');}catch{}}
 notify('기록을 불러오지 못했어요. 화면을 새로고침해 다시 시도해 주세요.',{hold:true});
}
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
 // #1028: 데스크탑에서만 목록 칸을 감싸고, 트리가 8개 이상이면 이름 거르는 칸을 맨 위에 둔다. 휴대폰은 기존 모양.
 const desktop=matchMedia('(min-width:701px)').matches;
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
 // 261119 대표 결정: 목록 아래 메뉴 순서는 ＋ 새 트리 → 이 트리 관리 → 이 트리 공유 → 꼬리표 정리.
 // '정리 전 N개 정리하기'는 #380 5번대로 목록 바로 아래(맨 앞)에 둔다.
 const searchBox=desktop&&ordered.length>=8?'<div class="tree-search" role="none"><input type="search" data-tree-search placeholder="트리 찾기" aria-label="트리 찾기" autocomplete="off" /></div>':'';
 const list=desktop?`${searchBox}<div class="tree-list" role="none">${rows}</div>`:rows;
 treePopover.innerHTML=list+`<div class="tree-foot" role="none">${cleanupRow}<button type="button" role="menuitem" data-tree-action="new">＋ 새 트리</button>${manage?'<button type="button" role="menuitem" data-tree-action="manage">이 트리 관리 (이름·표지)</button><button type="button" role="menuitem" data-tree-action="share">이 트리 공유</button>':''}${tagsRow}${shelfEntry}${momentsEntry}</div>`;
 const search=treePopover.querySelector('[data-tree-search]');
 search?.addEventListener('input',()=>{
  const q=search.value.trim().toLowerCase();
  treePopover.querySelectorAll('[data-tree-id]').forEach(b=>{ const name=b.querySelector('.tree-name')?.textContent||''; b.hidden=!!q && !name.toLowerCase().includes(q); });
  const active=treePopover.querySelector('[data-tree-id][aria-checked="true"]');
  if(active&&!active.hidden)scrollTreeItemIntoView(active);
 });
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
// #1028: 목록 칸만 스크롤해 고른 줄이 보이게 한다(페이지 전체 스크롤은 건드리지 않는다).
function scrollTreeItemIntoView(item){
 const list=item.closest('.tree-list');if(!list||list.scrollHeight<=list.clientHeight)return;
 const a=item.getBoundingClientRect(),box=list.getBoundingClientRect();
 if(a.bottom>box.bottom)list.scrollTop+=a.bottom-box.bottom+4;
 else if(a.top<box.top)list.scrollTop-=box.top-a.top+4;
}
function openTreeMenu(via='keyboard'){if(!treePopover)return;renderTreeMenu();treePopover.dataset.ltOpenedBy=via;treePopover.hidden=false;treeTrigger.setAttribute('aria-expanded','true');const active=treePopover.querySelector('[data-tree-id][aria-checked="true"]');treePopover.querySelector('button')?.focus();if(active&&!active.hidden)scrollTreeItemIntoView(active);}
function closeTreeMenu(){if(!treePopover)return;treePopover.hidden=true;treeTrigger.setAttribute('aria-expanded','false');}
$('record-menu').addEventListener('click',event=>{event.stopPropagation();if(treePopover?.hidden)openTreeMenu(event.detail===0?'keyboard':'mouse');else closeTreeMenu();});
if(treePopover)treePopover.addEventListener('keydown',event=>{const items=[...treePopover.querySelectorAll('button')].filter(b=>!b.hidden);const at=items.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=event.key==='ArrowDown'?(at+1)%items.length:(at-1+items.length)%items.length;items[next]?.focus();}else if(event.key==='Home'){event.preventDefault();items[0]?.focus();}else if(event.key==='End'){event.preventDefault();items.at(-1)?.focus();}});
document.addEventListener('click',event=>{if(treePopover&&!treePopover.hidden&&!event.target.closest('.tree-slot'))closeTreeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&treePopover&&!treePopover.hidden){closeTreeMenu();treeTrigger.focus();}});
addEventListener('lt41-trees-changed',()=>{
 if(treePopover&&!treePopover.hidden)renderTreeMenu();
 paintQuickTargetControls();
 try {
  const titles=(window.LT41?.trees||[]).map(t=>({id:t.id,title:t.title}));
  // #984: frames()는 iframe 요소다 — contentWindow로 보내야 한다(f?.postMessage는 TypeError로 삼켜져 한 번도 나가지 않았다).
  for(const f of frames()) f.contentWindow?.postMessage({type:'lt41-trees-renamed',titles},location.origin);
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
// #891: 보드도 같은 길 — 주소(공유·이어 보기)가 특정 순간을 가리켜 실제로 찾았을 때만 보드 프레임 주소에
// ?open=<순간>을 붙여 보낸다. 탭·메뉴로 들어오면 요청이 없으므로 보드는 상세 판을 닫은 채 연다.
let boardOpenMoment=null;
const requestBoardOpen=id=>{boardOpenMoment=id||null};
const takeBoardOpen=()=>{const v=boardOpenMoment;boardOpenMoment=null;return v};
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
const shellVideoDup=lazyPanel(()=>import('./shell/video-dup.mjs').then(m=>m.createVideoDup({$,onModalShown:()=>tipsFollowDialogs(),requestClose:id=>shellDialogs.requestClose(id),choose:(id,momentId)=>choose(id,momentId),openEditor:(mode,parentId)=>openEditor(mode,parentId)})));
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
const shellTagManager=lazyPanel(()=>import('./shell/tag-manager.mjs').then(m=>m.createTagManager({
  $,
  getMember:()=>member,
  getSource:()=>source,
  notify:text=>notify(text),
  panel:id=>panel(id),
  closePanel:id=>{ shellDialogs.requestClose(id); const href=$('view')?.contentWindow?.location?.href || ''; if (!href || href === 'about:blank') show(current, false); },
  saveMoments:shellTags.saveMoments
})));
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
  // #978: 담는 중에는 열린 창을 닫지 않게 잠시 붙잡는다(저장 뒤 화면 다시 그리기가 창을 닫으려 한다).
  holdPanel:(id,on)=>shellDialogs.holdPanel(id,on),
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
const shellCleanup=lazyPanel(()=>import('./shell/cleanup.mjs').then(m=>m.createCleanup({
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
})));
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
const shellJourney=lazyPanel(()=>import('./shell/journey.mjs').then(m=>m.createJourney({
  $,
  closePanels:()=>shellDialogs.closePanels(),
  syncTips:()=>syncTreeTips(),
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
})));
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
  get exampleTree(){return exampleTree;},
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
  requestBoardOpen,
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
function panel(id){const target=$(id);if(!target.open){$('toast').hidden=true;if(target.dataset.ltPanel){shellDialogs.noteOpener(id);if(target.dataset.ltPanel==='full')shellDialogs.syncPanelTop();}
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
  getAccountTip:()=>shellSettings.getAccountTip(),
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
  takeBoardOpen,
  // #1026 E: 로그아웃 예시를 동적으로 받는 동안에는 사용자가 연 창을 닫지 않는다.
  closePanels:()=>{if(exampleInitializing)return;shellDialogs.closePanels();},
  // 이슈 933: 화면을 옮긴 뒤 안내 판을 다시 맞춘다 — 첫 여정(새 트리 만들기)에서는 띄우지 않는다.
  syncTips:()=>syncTreeTips(),
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
      if((el.matches('.detail,#detailSide')||el.tagName==='DIALOG')&&!layers.has(el)){
        layers.add(el);observer.observe(el,{attributes:true,attributeFilter:el.tagName==='DIALOG'?['open']:['class','hidden']});
      }
      if(el.shadowRoot)observeTree(el.shadowRoot);
    }
  };
  const hasOpenLayer=root=>{
    if(root.querySelector('dialog[open],.detail.open,#detailSide:not([hidden])'))return true;
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
// #951 ①: '이어진 선 N개'는 위 단추가 아니라 단추 줄 아래 작은 글자다 — 화면이 그 자리를 비워 두었으면
// 그 글자를 채우고, 없으면(옛 판본) 단추 줄 끝에 만든다. 누르면 예전처럼 연결 목록 창이 열린다.
function mapMetaText(moments,connections){const m=Math.max(0,Number(moments)||0),c=Math.max(0,Number(connections)||0);return `순간 ${m} · 이어진 선 ${c}개`;}
let connectionMoments=0;
function mountConnectionTool(doc){
 let button=doc.getElementById('connection-tool');
 if(!button){
  if(doc.documentElement?.getAttribute('data-v41-screen')!=='network')return;
  const host=doc.querySelector('.topbar');if(!host)return;
  button=doc.createElement('button');button.id='connection-tool';button.type='button';button.className='map-meta';button.setAttribute('aria-haspopup','dialog');host.append(button);
 }
 button.onclick=()=>panel('connection-panel');
 // #481 L15: #connection-count·#connection-menu는 index.html에 없다(죽은 가드) — 읽지 않고 0에서 시작한다.
 // 값은 곧 links()의 setConnectionCount가 실제 연결 수로 채운다.
 button.textContent=mapMetaText(window.LT41?.tree?.moments?.length||0,0);button.removeAttribute('aria-label');
 // #601: 지도 화면의 '이어진 선' 버튼을 기억해 둔다 — links()가 매번 프레임 문서를 다시 찾지 않고
 // 같은 버튼을 고친다(지도를 다시 열거나 화면을 옮겨 다니면 0으로 돌아가던 버그의 뿌리).
 // show()는 프레임이 뜨기 전에 links()를 부르므로, 버튼이 생긴 뒤 다시 세어 처음부터 올바른 수를 보인다.
 connectionToolButton=button;links();
}
let connectionToolButton=null;
function setConnectionCount(n){
 const text=mapMetaText(connectionMoments,n);
 // #601: 기억해 둔 지도 화면의 글자가 살아 있으면 그 글자를 고친다. 없으면(예전 부름) 프레임 문서에서 찾는다.
 if(connectionToolButton?.isConnected){connectionToolButton.textContent=text;connectionToolButton.removeAttribute('aria-label');return;}
 const t=$('connection-tool');if(t){t.textContent=text;t.removeAttribute('aria-label');}
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
 const all=c.tree.edges.filter(e=>has(e.from)&&has(e.to));connectionMoments=c.tree.moments.length;setConnectionCount(all.length);
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
  // #845 2단계: 창이 닫히면서 자동으로 다시 뜰 때는 초점을 뺏지 않는다 — 초점은 창을 연 단추로 돌아간다.
  syncTreeTips(false);
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
  // 메뉴가 닫히며 자동으로 다시 뜰 때도 초점은 계정 동그라미로 돌아간다(#845 2단계와 같은 규칙).
  syncTreeTips(false);
}
function showTreeTips(takeFocus=true){
  const box=$('tree-tips');if(!box||!box.hidden)return;
  if(accountMenuOpen()||anyDialogOpen()){tipsHeld=true;return;}
  // #845 2단계: 창이 닫히면 close 이벤트보다 먼저 주소 처리가 안내를 다시 띄우는 길이 있다.
  // 창·메뉴 때문에 숨었던 판이 다시 뜨는 때는 초점을 뺏지 않는다 — 초점은 창을 연 단추로 돌아간다.
  const resuming=tipsHeld;tipsHeld=false;
  const list=$('tree-tips-list');
  if(list&&!list.children.length)for(const tip of FIRST_TREE_TIPS){const li=document.createElement('li');const strong=document.createElement('strong');const span=document.createElement('span');strong.textContent=tip.title;span.textContent=tip.body;li.append(strong,span);list.append(li);}
  if(!tipsReturnFocus)tipsReturnFocus=document.activeElement;
  box.hidden=false;
  // 초점은 직접 열 때만 가져간다. 자동으로 뜬 판은 Tab으로만 들어간다 — 닫기 단추는 Tab 순서에 그대로 있다.
  if(takeFocus&&!resuming)$('tree-tips-close')?.focus();
}
function syncTreeTips(takeFocus=true){
  const momentCount=model?.trees?.reduce((n,t)=>n+((t.moments||[]).length),0)||0;
  // 이슈 933: 새 트리 만들기(첫 여정) 화면에서는 안내 판을 띄우지 않는다 — 아직 트리를 만든 적이 없는데
  // '첫 트리를 만들었어요' 판이 미리보기 카드를 덮었다. 트리를 실제로 만든 뒤(다른 화면)에만 띄운다.
  const wanted=current!=='first-journey.html'&&tipsWanted({owned:!!member?.snapshot().owned,treeCount:model?.trees?.length||0,momentCount,seen:readTipsSeen(localStorage),source});
  if(wanted)showTreeTips(takeFocus);else closeTreeTips(false);
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
// #977: 작업 공간을 읽다 예외가 나도 셸 전체가 멈추지 않게 한다.
// 서버 기록이면 지금 화면을 그대로 두고 안내만 남긴다(모델을 비우면 지도·책 이동까지 막힌다).
// 파일 고르기·공유는 부른 쪽이 실패를 알 수 있도록 그대로 던진다(기존 동작 유지).
function projectWorkspace(input){
 try{return workspaceModel(input);}
 catch(error){console.warn('[LT41] 작업 공간을 읽지 못했어요:',error?.message||String(error));return null;}
}
function load(input,kind,selection={},fallback={},example=null){
 const projected=kind==='example'?{trees:[example||exampleTree].filter(Boolean)}:projectWorkspace(input);
 if(!projected){
  if(kind!=='server')throw new Error('기록을 읽을 수 없어요. 파일 형식을 확인해 주세요.');
  notify('기록을 불러오지 못했어요. 화면을 새로고침해 다시 시도해 주세요.',{hold:true});
  return {position:{treeId:null,momentId:null},treeMissing:false,momentMissing:false};
 }
 model=projected;
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
  // #984: 저장이 서버에서 확인되면(직전 미저장→synced) 열린 화면에 표지·이름 다시 그리기를 알린다.
  // 실패(rejected·offline·conflict·login)에서는 알리지 않는다 — 화면은 원래 표지를 그대로 두고 저장 안내 떠가 실패를 알린다.
  if(previousDirty){try{for(const f of frames())f.contentWindow?.postMessage({type:'lt41-trees-saved'},location.origin);}catch{}}
  // #549: 기록(순간)이 0개인 새 계정의 첫 안내는 '불러왔어요' 대신 첫 순간 안내로(문구는 notice.mjs 한 벌).
  // #905: 자동 저장이 성공하면 알리지 않는다 — 직전에 저장 안 됨이었다면(previousDirty) 방금 저장된 것이다.
  // 알림은 실패·오프라인·충돌(저장 안내 떠)과 사용자가 누른 큰 동작의 완료 확인만 띄운다.
  const momentCount=(model?.trees||[]).reduce((n,tree)=>n+((tree.moments||[]).length),0);
  // #1076: 서버 기록을 처음 불러왔을 때만 한 번 — 화면 이동·다시 띄우기로 오는 synced 상태에서는 띄우지 않는다.
  if(!previousDirty)shellNotice.notifyOnce(syncedNoticeText({writable:status.writable,previousDirty,momentCount}),'synced:'+String(member?.snapshot()?.subject||'session'));
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
 session=createMemberSession({api,onGuard:read=>workspaceGuardNotice(read),onState:(state,selection,meta)=>{if(generation!==loadGeneration)return;try{
  // 4.1 기억 보드 저장·트리 편집(#984)·한마디 저장/자동 제목 보정(#1001): 화면이 이미 자기 상태를 들고 있으므로 셸은 모델만 갱신하고 iframe을 다시 그리지 않는다.
  if(meta?.board||meta?.tree||meta?.moment){const projected=workspaceModel({revision:0,state});model=projected;if(window.LT41){const tree=projected.trees.find(t=>t.id===window.LT41.tree.id);if(tree){window.LT41.tree=tree;window.LT41.trees=projected.trees;window.LT41.writable=meta.board?true:(source==='server'&&!!member?.snapshot().writable);if(meta.moment&&!meta.story){if(selection?.momentId&&tree.moments.some(m=>m.id===selection.momentId))window.LT41.momentId=selection.momentId;try{for(const f of frames())f.contentWindow?.postMessage({type:'lt41-moments-saved',treeId:tree.id,momentId:window.LT41.momentId},location.origin);}catch{}}}}return;}const snapshot=session.snapshot(),saved=accountPosition(localStorage,snapshot.subject)||{},active=parseSelectionRoute(location.hash),pending=!initialized&&active.scope!=='owner'?pendingOwnerRoute(sessionStorage):null,route=active.scope==='owner'?active:pending;let requested=selection||stateSelection();
   if(!initialized){if(route)requested=route;else if(!selection)requested=saved;
    // #583 '이 순간 열기': 맨 처음 주소(#my/network?tree=…&moment=…)로 열 때도 지도가 그 순간을 가운데 두게 한다 —
    // 뒤의 주소 이동(applyBrowserLocation)과 같은 규칙. 이후 동기화 때는 다시 정하지 않는다(initialized 뒤).
    if(!initialized&&route?.scope==='owner'&&(route.view==='network'||route.view==='board')&&route.momentId){
     if(route.view==='network')requestNetworkOpen(route.momentId);else requestBoardOpen(route.momentId);
    }
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
 }catch(error){openFallbackShell(error);}},onStatus:status=>{if(generation===loadGeneration)memberStatus(status);},
 navigate:url=>{
  if(url.startsWith('/auth/login')&&parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);
  location.assign(url.startsWith('/auth/login')?memberLoginUrl(readTheme(localStorage)):url==='#start'?'#home':url);
 }
});
 member=session;
 try{await session.start();}catch(error){openFallbackShell(error);}
 if(generation===loadGeneration&&session.snapshot().owned){
  updateAccountControls();
  if(session.snapshot().writable&&sessionStorage.getItem(PENDING_NEW)==='1'){sessionStorage.removeItem(PENDING_NEW);openEditor('new');}
  shellAuth.consumeLoginIntent(session.snapshot());
  if(resumeAfterStart){const intent=resumeAfterStart;resumeAfterStart=null;if(intent==='write')shellQuick.openWrite();else openEditor(intent);}
  if(startupNotice)notify(startupNotice);
 }
 if(generation===loadGeneration){const startupJourney=parseJourneyRoute(location.hash);if(startupJourney){if(session.snapshot().owned&&session.snapshot().writable)openFirstJourney({step:startupJourney.step,route:true});else{history.replaceState(null,'','#home');handledHash='#home';}}}
}
async function sample(selection={},view){if(!pauseMember())return;const tree=await loadExampleTree();++loadGeneration;if(view)current=view;load(null,'example',selection,{},tree);if(view)writeLocation();$('save-feedback').hidden=true;if($('account-settings').open)$('account-settings').close();}
$('account-entry').onclick=e=>{
 if(member?.snapshot().owned){e.preventDefault();openAccountMenu();}
 else if(parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);
};
$('account-avatar').onclick=e=>{
 e.stopPropagation();
 if($('account-popover').hidden){openAccountMenu(e.detail===0?'keyboard':'mouse');void feedbackBoard.refreshReplyDot();}else closeAccountMenu();
};
const shellSettings=createSettings({ $, notify, panel, show, frames, frameLoaded, hideFrames, closeAccountMenu, openAccountMenu, renderAccount, updateAccountControls, openAssets, openEditor, sample, backup, clear, startMember, leaveMember, openFallbackShell, writeLocation, load, flowNavigation, renderTreeMenu, requestBoardOpen, lastShelfTreeId, shellHeader, shellDialogs,  shareApi, accountApi, readTheme, writeTheme, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment,  readPageTurn, writePageTurn, frameMessage, displayTreeTitle, accountPresentation, createFeedbackDialog, createFeedbackBoard, mountUpdates, readWriteTab, writeWriteTab, clearCachedWorkspace, createWorkspaceApi, paintThemeControls, applyTheme, toggleTheme, get member(){return member}, get model(){return model}, get current(){return current}, get source(){return source}, get motionPaused(){return motionPaused}, get loadGeneration(){return loadGeneration}, get handledHash(){return handledHash}, get activeShareId(){return activeShareId}
 });
const { applyAdvanced, applyDateStyleToFrame, applyPageTurnToFrame, applyNetworkViewToFrame, applyBoardThemeToFrame, syncBoardThemeToApp, quickTargetPreference, profileDirty, paintSettingsProfile, accountConfirmMatches, openAccountData, openAccountSettings, paintDateStyleControls, paintStartPlaceControls, paintShareControls, paintQuickTargetControls, paintNetworkViewControls, paintPageTurnControls, paintBoardThemeControls, paintTreeVisibilityList, paintSettingsUsage, loadTreeVisibility, paintTreeManagerVisibility, paintSettingsTab, focusSettingsSection, fillProfileForm, paintScreenControls, readAdvanced, advancedKey, currentDateStyle, currentPageTurn, sendToFrame, currentStartPlace, currentShareView, currentBoardTheme }=shellSettings;
paintThemeControls();applyTheme();paintTitleDisplayControls();applyAdvanced();
if(initialRoute.scope==='public')showPublicRoute(initialRoute);
else if(/^#explore/.test(location.hash)){/* #1025: 둘러보기 패널이 자기 주소를 연다 — 예시 로드로 주소를 덮지 않는다. */}
else if(shouldLoadMemberRecords(location.search,document.cookie,location.hash)||shellIntake.pending()){
 // #1026 E: 기존 사용자는 예시를 받지 않는다. 주소가 정해지는 즉시 빈 틀을 세우고,
 // 아래 startMember()가 기록을 받는 대로 화면 iframe을 연다 — example.mjs 요청 0.
 clear();
}else{
 // 로그아웃·신규 사용자는 예시가 실제 내용이므로 필요한 이 순간에만 동적으로 받는다.
 exampleInitializing=true;
 void loadExampleTree().then(tree=>{if(source!=='server'&&source!=='share')load(null,'example',{}, {},tree);exampleInitializing=false;}).catch(()=>{exampleInitializing=false;});
}

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
if(shouldLoadMemberRecords(location.search,document.cookie,location.hash)||shellIntake.pending())void startMember().catch(error=>openFallbackShell(error));
// 로그아웃으로 다시 연 문서에서는 '로그인이 필요해요' 대신 이 안내를 한 번 띄운다.
try{if(sessionStorage.getItem('lt41.logoutNotice')==='1'){sessionStorage.removeItem('lt41.logoutNotice');notify('로그아웃했어요.');}}catch{}









