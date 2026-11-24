import { MSG } from '../frame-messages.mjs';
import { loginUrlWithTheme } from '../header-state.mjs';
// 설정·계정 창 — shell.mjs에서 코드 위치만 옮긴 모듈(#886). 동작·기준은 그대로다.
// 상태는 deps의 getter로 받는다(모듈이 shell을 다시 import하지 않는다).
// #1072 A-16: 의견 보내기의 '함께 보낼 정보'에 실릴 최근 오류 기록은 report.mjs 한 곳에서 가져온다.
import {reportEntries} from '../report.mjs';
export function createSettings(deps){
const { $, notify, setTitleDisplay, openLoginStart, links, screenForView, choose, panel, show, frames, frameLoaded, hideFrames, closeAccountMenu, openAccountMenu, renderAccount, updateAccountControls, openAssets, openEditor, sample, backup, clear, startMember, leaveMember, pauseMember, openFallbackShell, writeLocation, load, flowNavigation, closePanels, renderTreeMenu, requestBoardOpen, lastShelfTreeId, shellHeader, shellDialogs,  shareApi, accountApi, myNewsApi, readTheme, writeTheme, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment,  readPageTurn, writePageTurn, frameMessage, displayTreeTitle, accountPresentation, createFeedbackDialog, createFeedbackBoard, mountUpdates, mountMyNews, readWriteTab, writeWriteTab, clearCachedWorkspace, forgetLoginSubject, createWorkspaceApi, paintThemeControls, applyTheme, toggleTheme, paintBookDisplayControls } = deps;
const $on=(id,fn)=>{const el=$(id);if(el)el.onclick=fn;};
function advancedKey(){try{return 'lt41.advanced.'+(deps.member?.snapshot().subject||'')}catch{return 'lt41.advanced.'}}
function readAdvanced(){try{return localStorage.getItem(advancedKey())==='1'}catch{return false}}
function applyAdvanced(){const on=readAdvanced();document.body.classList.toggle('lt-advanced',on);const sw=$('settings-advanced');if(sw){sw.setAttribute('aria-checked',String(on));sw.textContent=on?'켬':'끔';}try{$('view').contentWindow.postMessage({type:MSG.advanced,value:on},location.origin)}catch{}}
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
  const owned=!!deps.member?.snapshot().owned;
  const screen=$('community-panel')?.open?'둘러보기':$('account-settings')?.open?'설정':(FEEDBACK_SCREEN[deps.current]||'첫 화면');
  const treeId=owned&&deps.source==='server'&&window.LT41?.tree?.id?String(window.LT41.tree.id):'';
  // #1072 A-16: 최근 오류 기록(최대 20건 — 메시지·위치·시각만)을 '함께 보낼 정보'로 실어 보낸다.
  const recentErrors=reportEntries();
  return {screen,viewport:window.innerWidth+'x'+window.innerHeight,theme:readTheme(localStorage),version:'4.1',loggedIn:owned,treeId,recentErrors};
 }
 const feedbackDialog=createFeedbackDialog({$,notify,getContext:feedbackContext,show:()=>panel('feedback-panel'),openMyPosts:()=>{shellDialogs.requestClose('feedback-panel');feedbackBoard.openMyPosts();}});
 // 2026-11-16 계정 메뉴 정리: 메뉴의 '의견 보내기' 칸을 없애고 내 의견 창 안에서 바로 보내게 했다.
 // 보내기 창은 로그아웃 첫 화면 작은 링크($('feedback-link'))와 같은 창을 쓴다(feedbackDialog).
 $('myposts-send').onclick=()=>{shellDialogs.requestClose('myposts-panel');feedbackDialog.open();};
 // '어떻게 쓰나요': 첫 화면의 안내 패널(#635)을 연다 — 별도 안내 화면은 없다(#388).
 // 첫 화면이 아니면 먼저 첫 화면으로 옮긴 뒤, 프레임이 안내 패널을 만들었을 때(초기화 끝) 여는 메시지를 한 번 보낸다(최대 3초).
 function openGuideFromMenu(){
  closeAccountMenu();
  const send=()=>{try{$('view').contentWindow.postMessage({type:MSG.openGuide},location.origin)}catch{}};
  if(deps.current==='src064-orbit.html'){send();return;}
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
 const dotState={updates:false,replies:false,news:false};
 let accountTip='';
 // 이슈 644 2번: 아바타 점과 계정 메뉴 항목의 점·개수·설명을 함께 갱신한다.
 // #1098 3단계: 내 소식 점이 묶음에 참가한다 — 읽지 않은 내 소식(0이면 점 없음)이 아바타·'내 소식' 항목에 같이 보인다.
 function paintAccountDots(){
  const avatar=$('account-avatar');
  if(avatar){
   avatar.classList.toggle('has-dot',!!(dotState.updates||dotState.replies||dotState.news));
   const names=[];
   if(dotState.updates)names.push('새 소식');
   if(dotState.replies)names.push('새 답글');
   if(dotState.news)names.push('내 소식');
   const tip=names.length===3?'새 소식·새 답글·내 소식이 있어요':names.length===2?`${names[0]}과 ${names[1]}이 있어요`:names.length===1?`${names[0]}이 있어요`:'';
   accountTip=tip;
   avatar.title=tip||'내 계정';
  }
  const updatesItem=$('account-updates'),updatesCount=$('account-updates-count');
  if(updatesItem)updatesItem.classList.toggle('has-dot',!!dotState.updates);
  if(updatesCount){updatesCount.hidden=!dotState.updates;if(dotState.updates)updatesCount.textContent='1';}
  const postsItem=$('account-my-posts');
  if(postsItem)postsItem.classList.toggle('has-dot',dotState.replies);
  const newsItem=$('account-my-news'),newsCount=$('account-my-news-count');
  if(newsItem)newsItem.classList.toggle('has-dot',!!dotState.news);
  if(newsCount){const n=myNewsMount?.lastCount?.()||0;newsCount.hidden=!(n>0);if(n>0)newsCount.textContent=String(n);}
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
 // #1098 3단계: 내 소식 — 계정 메뉴 입구·목록 창·점. 서버 길은 #1159의 두 경로(myNewsApi)만 쓴다.
 // 로그아웃·빈 계정이면 이 입구 자체가 열리지 않는다(계정 메뉴는 로그인한 사람만 연다). 점 숫자가 0이면 점도 숨는다.
 const myNewsMount=mountMyNews({$,showPanel:id=>panel(id),fetchNews:()=>myNewsApi.myNews(),fetchCount:()=>myNewsApi.myNewsUnread(),getTrees:()=>deps.model?.trees||[],onCount:count=>{dotState.news=Number(count)>0;paintAccountDots();}});
 $('account-my-news').onclick=()=>{closeAccountMenu();void myNewsMount.open();};
 $('updates-link').onclick=()=>{void updatesMount.openUpdates();};
 $('settings-updates-open').onclick=()=>{$('account-settings').close();void updatesMount.openUpdates();};
 // #952: 첫 접속 안내는 새 소식 여부를 확인한 뒤 차례로 올린다.
 const updatesReady=updatesMount.start();
 if(deps.member?.snapshot?.().owned)void feedbackBoard.refreshReplyDot();
 if(deps.member?.snapshot?.().owned)void myNewsMount.refreshCount();
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
 if(motion){motion.setAttribute('aria-checked',String(!deps.motionPaused));motion.textContent=deps.motionPaused?'끔':'켬';}
  paintHomeMomentChoice();
 }
 const HOME_MOMENT_MODES=[['last','마지막'],['pin','고정'],['day','그날'],['random','무작위']];
 function readHomeMomentValue(){try{const v=JSON.parse(localStorage.getItem('lt41.homeMoment')||'null');return v&&typeof v==='object'?deps.normalizeHomeMoment(v):{mode:'last'}}catch{return {mode:'last'}}}
 function paintHomeMomentChoice(){
  const box=$('settings-card-pick');if(!box)return;
  const cur=readHomeMomentValue();box.replaceChildren();
  const add=(label,mode,treeId)=>{
   const b=document.createElement('button');b.type='button';b.setAttribute('role','radio');b.textContent=label;
   b.dataset.homeMoment=mode;if(treeId)b.dataset.homeMomentTree=treeId;
   b.setAttribute('aria-checked',String(treeId?cur.mode==='tree'&&cur.treeId===treeId:cur.mode===mode&&cur.mode!=='tree'));
   b.onclick=()=>{
    const value=treeId?{mode:'tree',treeId}:{mode};
    try{localStorage.setItem('lt41.homeMoment',JSON.stringify(value))}catch{}
    if(deps.member?.snapshot().owned){try{deps.member.apply('setPrefs',{homeMoment:value});if(window.LT41)window.LT41.prefs=deps.member.state().prefs}catch{}}
    paintHomeMomentChoice();
    try{$('view').contentWindow.postMessage({type:MSG.homeMomentSet,value},location.origin)}catch{}
    notify('첫 화면 카드를 바꿨어요.');
   };
   box.append(b);
  };
  for(const [mode,label] of HOME_MOMENT_MODES)add(label,mode);
  for(const tree of (window.LT41?.trees||[]))add(tree.title||tree.subject||'트리','tree',tree.id);
 }
 for(const b of document.querySelectorAll('[data-home-cards]'))b.onclick=()=>{
  if(!HOME_CARD_MODES.includes(b.dataset.homeCards))return;
  try{localStorage.setItem('lt41.homeCards',b.dataset.homeCards)}catch{}
  paintScreenControls();
  try{$('view').contentWindow.postMessage({type:MSG.homeCards,mode:b.dataset.homeCards},location.origin)}catch{}
  notify('첫 화면 카드를 바꿨어요. 첫 화면으로 돌아가면 그대로 보입니다.');
 };
 for(const b of document.querySelectorAll('[data-write-tab]'))b.onclick=()=>{
  const tab=writeWriteTab(localStorage,b.dataset.writeTab);
  paintScreenControls();
  notify(tab==='detailed'?'순간 추가를 자세한 추가로 엽니다.':'순간 추가를 쉬운 추가로 엽니다.');
 };
 $on('settings-motion',()=>{deps.motionPaused=!deps.motionPaused;paintScreenControls();try{$('view').contentWindow.postMessage({type:MSG.motion,paused:deps.motionPaused},location.origin)}catch{};
  // #894: 보드·지도 같은 안쪽 화면에도 움직임 끄기를 알린다 — 끌기 미리 보기 등 화면 움직임이 즉시(전환 없이) 따라 바뀐다.
  for(const f of frames()){try{f.contentWindow.postMessage({type:MSG.motion,paused:deps.motionPaused},location.origin)}catch{}}
  notify(deps.motionPaused?'첫 화면 움직임을 멈췄어요.':'첫 화면 움직임을 다시 켰어요.');});
 paintScreenControls();
 $('account-logout').onclick=async()=>{closeAccountMenu();$('logout').click();};
document.addEventListener('click',e=>{
 if(!e.target.closest('.account-slot'))closeAccountMenu();
});
// #368: 빈 화면의 "내 기록 불러오기" — 로그아웃이면 로그인으로, 읽기 전용이면 설정 "내 데이터"로, 평소엔 순간 추가(새 트리)로.
$('empty-records').onclick=()=>{if(!deps.member?.snapshot().owned){
  if($('empty').dataset.emptyGuest==='1'){
   // 2026-11-23: 서재·책·보드·지도에서 로그인해도 같은 화면으로 돌아온다.
   const next='/v41/'+(location.hash||'#home');
   location.assign(loginUrlWithTheme(`/auth/login?next=${encodeURIComponent(next)}`,readTheme(localStorage)));
  }else openLoginStart('first');
  return;
 }deps.member.snapshot().writable?openEditor():openAccountData();};
$('empty-sample').onclick=sample;
$('sample').onclick=sample;$('clear').onclick=()=>{if(!leaveMember())return;++deps.loadGeneration;clear();$('save-feedback').hidden=true;$('file').value='';if($('account-settings').open)$('account-settings').close();};
$('server').onclick=()=>{void startMember().catch(error=>openFallbackShell(error));};
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
function savedPrefs(){try{return deps.member?.state?.()?.prefs||{}}catch{return {}}}
function paintSettingsProfile(email=shellHeader.currentAccountEmail()){
 const prefs=savedPrefs();
 const view=accountPresentation({owned:!!deps.member?.snapshot().owned,email,name:prefs.displayName});
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
 if(!deps.member?.snapshot().owned){notify('로그인한 뒤 프로필을 저장할 수 있어요.');return;}
 const submit=$('profile-form').querySelector('button[type="submit"]');
 const patch={displayName:$('profile-name').value,accentColor:$('profile-color').querySelector('[aria-checked="true"]')?.dataset.accentColor||''};
 if(submit)submit.disabled=true;
 let saved=null;
 try{saved=deps.member.apply('setPrefs',patch);}catch(e){saved=null;}
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
function currentDateStyle(){try{return normalizeDateStyle(deps.member?.state?.().prefs?.dateStyle)}catch{return 'dot'}}
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
 if(!deps.member?.snapshot().owned){notify('로그인한 뒤 날짜 표기를 바꿀 수 있어요.');return;}
 try{deps.member.apply('setPrefs',{dateStyle:b.dataset.dateStyle});}catch(e){notify('날짜 표기를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 // 기기 캐시: 화면(iframe)은 그려지는 시점에 계정 값을 모르므로 마지막 표기를 같이 둔다(어긋나면 메시지로 바로 고쳐 그린다).
 try{localStorage.setItem('lt41.dateStyle',b.dataset.dateStyle)}catch{}
 paintDateStyleControls();for(const f of frames())applyDateStyleToFrame(f);
 notify(b.dataset.dateStyle==='long'?'날짜를 11월 10일로 보여요.':b.dataset.dateStyle==='dash'?'날짜를 2026-11-10으로 보여요.':'날짜를 2026. 11. 10으로 보여요.');
};
paintDateStyleControls();
function currentStartPlace(){try{return normalizeStartPlace(deps.member?.state?.().prefs?.startPlace)}catch{return 'resume'}}
function paintStartPlaceControls(){const value=currentStartPlace();for(const b of document.querySelectorAll('[data-start-place]'))b.setAttribute('aria-checked',String(b.dataset.startPlace===value));}
for(const b of document.querySelectorAll('[data-start-place]'))b.onclick=()=>{
 if(!deps.member?.snapshot().owned){notify('로그인한 뒤 처음 보여 줄 곳을 바꿀 수 있어요.');return;}
 try{deps.member.apply('setPrefs',{startPlace:b.dataset.startPlace});}catch(e){notify('처음 보여 줄 곳을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 paintStartPlaceControls();
 notify('처음 보여 줄 곳을 저장했어요. 다음에 로그인하면 그곳부터 열어요.');
};
paintStartPlaceControls();
const NETWORK_VIEW_KEY='lt41.network.view';
function currentNetworkView(){try{return localStorage.getItem(NETWORK_VIEW_KEY)==='concentric'?'concentric':'network'}catch{return 'network'}}
function paintNetworkViewControls(){const value=currentNetworkView();for(const b of document.querySelectorAll('[data-network-view]'))b.setAttribute('aria-checked',String(b.dataset.networkView===value));}
function applyNetworkViewToFrame(frame){try{frame.contentWindow?.postMessage({type:MSG.networkView,value:currentNetworkView()},location.origin);}catch{}}
for(const b of document.querySelectorAll('[data-network-view]'))b.onclick=()=>{
 try{localStorage.setItem(NETWORK_VIEW_KEY,b.dataset.networkView)}catch{}
 paintNetworkViewControls();for(const f of frames())applyNetworkViewToFrame(f);
 notify(b.dataset.networkView==='concentric'?'지도를 묶음 보기로 열어요.':'지도를 이어진 길 보기로 열어요.');
};
paintNetworkViewControls();
// 2026-11-16 대표 요청: 쉬운 추가가 처음 고르는 트리 — 지금 보고 있는 트리(기본) 또는 늘 같은 트리.
// 이 기기 설정(localStorage lt41.* 규칙)이고, 고른 트리를 지우면 지금 보고 있는 트리로 돌아간다
// (쉬운 추가·자세한 추가가 이 한 벌(quickTargetPreference)을 따른다).
const QUICK_TARGET_KEY='lt41.quickAddTarget';
const QUICK_TARGET_TREE_KEY='lt41.quickAddTreeId';
function quickAddTargetMode(){try{return localStorage.getItem(QUICK_TARGET_KEY)==="fixed"?"fixed":"deps.current"}catch{return "deps.current"}}
function quickAddFixedTreeId(){try{return localStorage.getItem(QUICK_TARGET_TREE_KEY)||""}catch{return ""}}
function quickTargetPreference(){return {mode:quickAddTargetMode(),treeId:quickAddFixedTreeId()}}
function paintQuickTargetControls(){
  const mode=quickAddTargetMode();
  for(const b of document.querySelectorAll("[data-quick-target]"))b.setAttribute("aria-checked",String(b.dataset.quickTarget===mode));
  const sel=$("quick-target-tree");
  if(!sel)return;
  const trees=deps.model?.trees||[];
  sel.replaceChildren(...trees.map(t=>{const o=document.createElement("option");o.value=t.id;o.textContent=displayTreeTitle(t.title||t.subject||"트리");return o}));
  sel.hidden=mode!=="fixed"||!trees.length;
  const wanted=quickAddFixedTreeId();
  sel.value=trees.some(t=>t.id===wanted)?wanted:(trees[0]?.id||"");
}
for(const b of document.querySelectorAll("[data-quick-target]"))b.onclick=()=>{
  try{localStorage.setItem(QUICK_TARGET_KEY,b.dataset.quickTarget)}catch{}
  if(b.dataset.quickTarget==="fixed"){const wanted=quickAddFixedTreeId();const trees=deps.model?.trees||[];const keep=trees.some(t=>t.id===wanted)?wanted:(trees[0]?.id||"");if(keep)try{localStorage.setItem(QUICK_TARGET_TREE_KEY,keep)}catch{}}
  paintQuickTargetControls();notify(b.dataset.quickTarget==="fixed"?"쉬운 추가는 고른 트리에 담아요.":"쉬운 추가는 지금 보고 있는 트리에 담아요.");
};
$("quick-target-tree")?.addEventListener("change",()=>{try{localStorage.setItem(QUICK_TARGET_TREE_KEY,$("quick-target-tree").value)}catch{};paintQuickTargetControls();notify("쉬운 추가는 이 트리에 담아요.")});
paintQuickTargetControls();
function currentShareView(){try{return normalizeShareView(deps.member?.state?.().prefs?.shareView)}catch{return 'book'}}
function paintShareControls(){
 const view=currentShareView();
 for(const b of document.querySelectorAll('[data-share-view]'))b.setAttribute('aria-checked',String(b.dataset.shareView===view));
}
for(const b of document.querySelectorAll('[data-share-view]'))b.onclick=()=>{
 if(!deps.member?.snapshot().owned){notify('로그인한 뒤 공유 기본값을 바꿀 수 있어요.');return;}
 try{deps.member.apply('setPrefs',{shareView:b.dataset.shareView});}catch(e){notify('공유 기본값을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
 paintShareControls();notify('공유 창이 이 보기로 열려요.');
};
// #538: 트리 공개는 트리마다 고른다(전 트리 일괄 변경은 실수 위험이라 하지 않는다 — #830 후속).
// 각 줄: 트리 이름 | [공개][비공개]. 서버 상태를 같은 API로 읽고 쓴다.
const visibilityByTreeId=new Map();
function escapeTreeName(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function paintTreeVisibilityList(){
 const box=$('settings-tree-visibility-list');if(!box)return;
 const trees=Array.isArray(deps.model?.trees)?deps.model.trees:[];
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
   '<button type="button" role="radio" data-tree-visibility-tree="'+escapeTreeName(tree.id)+'" data-tree-visibility-value="public" aria-checked="'+String(visibility==='public')+'" class="'+(visibility==='public'?'settings-deps.current':'')+'">공개</button>'+
   '<button type="button" role="radio" data-tree-visibility-tree="'+escapeTreeName(tree.id)+'" data-tree-visibility-value="private" aria-checked="'+String(visibility==='private')+'" class="'+(visibility==='private'?'settings-deps.current':'')+'">비공개</button></div>';
  box.append(row);
 }
 for(const b of box.querySelectorAll('[data-tree-visibility-value]'))b.onclick=()=>setTreeVisibility(b.dataset.treeVisibilityTree,b.dataset.treeVisibilityValue);
}
async function setTreeVisibility(treeId,visibility){
 if(!deps.member?.snapshot().owned){notify('로그인한 뒤 공개 상태를 바꿀 수 있어요.');return;}
 const answer=await shareApi.setTreeVisibility(treeId,visibility).catch(()=>({ok:false}));
 if(answer&&answer.ok!==false){visibilityByTreeId.set(treeId,visibility);paintTreeVisibilityList();notify(visibility==='private'?'이 트리를 비공개로 바꿨어요.':'이 트리를 공개로 바꿨어요.');}
 else notify('공개 상태를 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.');
}
async function loadTreeVisibility(){
 const trees=Array.isArray(deps.model?.trees)?deps.model.trees:[];
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
 for(const b of document.querySelectorAll('[data-tree-manager-public]')){b.setAttribute('aria-checked',String(answer==='public'));b.classList.toggle('settings-deps.current',answer==='public');}
 for(const b of document.querySelectorAll('[data-tree-manager-private]')){b.setAttribute('aria-checked',String(answer==='private'));b.classList.toggle('settings-deps.current',answer==='private');}
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
// #891(13:59 대표 결정): 판 고르기는 세 상태 — 테마 따라가기(auto, 기본)·종이·밤. 저장값이 없거나
// 'auto'면 앱 테마를 따른다(#853). 화면 단추·메뉴는 저장한 상태를 그대로 보여 주고, 프레임에는
// 해결된 판(종이/밤)을 넘긴다.
function storedBoardTheme(){try{const saved=localStorage.getItem(BOARD_THEME_KEY);return saved==='night'||saved==='paper'?saved:'auto'}catch{return 'auto'}}
function resolveBoardTheme(){return storedBoardTheme()==='auto'?(readTheme(localStorage)==='garden'?'paper':'night'):storedBoardTheme()}
function currentBoardTheme(){return storedBoardTheme()}
function paintBoardThemeControls(){const value=currentBoardTheme();for(const b of document.querySelectorAll('button[data-board-theme]'))b.setAttribute('aria-checked',String(b.dataset.boardTheme===value));}
function applyBoardThemeToFrame(frame){
 const message=frameMessage('boardTheme',resolveBoardTheme());
 try{frame.contentDocument?.documentElement?.setAttribute('data-lt-board-theme',message.value);}catch{}
 sendToFrame(frame,message);
}
function saveBoardTheme(value){
 try{if(value==='auto')localStorage.removeItem(BOARD_THEME_KEY);else localStorage.setItem(BOARD_THEME_KEY,value)}catch{}
 paintBoardThemeControls();
 for(const f of frames())applyBoardThemeToFrame(f);
}
for(const b of document.querySelectorAll('button[data-board-theme]'))b.onclick=()=>{
 const next=b.dataset.boardTheme==='night'?'night':b.dataset.boardTheme==='paper'?'paper':'auto';
 saveBoardTheme(next);
 notify(next==='night'?'보드·지도 판을 밤 테마로 바꿨어요.':next==='paper'?'보드·지도 판을 종이 테마로 바꿨어요.':'보드·지도 판이 앱 테마를 따라가게 됐어요.');
};
// #853: 앱 테마(밤/정원)를 바꾸면 '테마 따라가기' 판도 함께 바뀐다. 사용자가 종이·밤을 직접 골랐으면
// 그 선택을 존중해 그대로 둔다. 열린 화면에 바로 반영한다.
function syncBoardThemeToApp(theme){
 paintBoardThemeControls();
 for(const f of frames())applyBoardThemeToFrame(f);
}
paintBoardThemeControls();
window.addEventListener('message',e=>{
 if(e.origin!==location.origin)return;
 // #891: 보드·지도 드롭의 고르기 요청 — 보드가 이미 적용·저장했으므로 셸은 같은 값으로 맞추고
 // 다른 화면(지도·설정)에 알린다. 알림 문구는 보르지 않는다(판이 바로 바뀌어 보이므로).
 if(e.data?.type===MSG.boardThemeChoice){
  const value=e.data.value==='night'?'night':e.data.value==='paper'?'paper':'auto';
  saveBoardTheme(value);
  return;
 }
 if(e.data?.type===MSG.homeMoment){
  // 261116 PR 2: 첫 화면 카드 모드 저장 — 기기 미러를 먼저 쓰고 계정 설정(이미 있는 setPrefs 길)에 반영한다.
  const value=normalizeHomeMoment(e.data.value);
  try{localStorage.setItem('lt41.homeMoment',JSON.stringify(value))}catch{}
  if(deps.member?.snapshot().owned){
   try{deps.member.apply('setPrefs',{homeMoment:value});if(window.LT41)window.LT41.prefs=deps.member.state().prefs;}catch{}
  }
 }
 if(e.data?.type===MSG.boardTheme){
  const next=e.data.value==='night'?'night':'paper';
  try{localStorage.setItem(BOARD_THEME_KEY,next)}catch{}
  paintBoardThemeControls();
  for(const f of frames())applyBoardThemeToFrame(f);
 }
});
// #368: 옛 내 기록 창을 여던 입구(읽기 전용 안내·빈 화면)의 공통 행선지. 로그아웃이면 로그인으로 보낸다.
function openAccountData(intent='first'){
 if(!deps.member?.snapshot().owned){openLoginStart(intent);return;}
 void openAccountSettings({section:'data'});
}
async function openAccountSettings({section=''}={}){
 accountExpected=null;$('account-delete-status').textContent='';
 // #453 C2: 지난번에 뜬 '내 기록을 불러왔어요.' 같은 안내가 창 안에 남지 않는다.
 if($('settings-feedback'))$('settings-feedback').textContent='';$('account-confirm').value='';$('account-delete').disabled=true;$('account-confirm-hint').textContent='';
 // 로그아웃·공유·예시 상태에서는 설정 입구가 없다(기존 규칙). 여기서도 열지 않는다.
 if(!deps.member?.snapshot().owned){notify('로그인한 뒤 설정을 열 수 있어요.');return;}
 paintSettingsProfile();
 fillProfileForm();
 paintDateStyleControls();paintBookDisplayControls();paintStartPlaceControls();paintNetworkViewControls();paintShareControls();paintQuickTargetControls();
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
 try{deps.member?.dispose?.();}catch{}
 deps.member=null;deps.source='example';clear();$('account-settings').close();updateAccountControls();
 notify(answer.commonAccountDeleted
  ? '러브트리 탈퇴와 함께 공통 로그인 계정과 인증 세션을 폐기했습니다.'
  : '러브트리에서 탈퇴했습니다. 다른 서비스 연결이 남아 있어 공통 계정은 유지됩니다.');
};$('logout').onclick=async()=>{if(deps.member){await deps.member.act('logout');if(deps.member.snapshot().dirty){notify('미저장 기록이 있어 로그아웃하지 않았어요. 다시 저장하거나 백업해 주세요.');return;}/* 로그아웃 뒤 머리글만 바뀌고 첫 화면 본문·카드·숫자 줄이 회원 상태로 남았다 — 새 문서로 다시 열어 셸 전체를 비로그인 상태로 그린다(account=1·#my/... 같은 기록 주소도 함께 사라진다). */try{sessionStorage.setItem('lt41.logoutNotice','1');}catch{}location.replace(location.pathname);return;}const answer=await createWorkspaceApi().logout();if(answer.ok){clearCachedWorkspace(localStorage);forgetLoginSubject(localStorage);}notify(answer.ok?'로그아웃했습니다.':'로그아웃하지 못했어요. 다시 시도해 주세요.');};
$('file').onchange=async()=>{
 const f=$('file').files[0];
 if(!f)return;
 if(!leaveMember())return;
 const generation=++deps.loadGeneration;
 try{
  if(f.size>4194304)throw Error('4MiB 이하 파일만 읽습니다.');
  const d=JSON.parse(await f.text());
  if(generation!==deps.loadGeneration)return;
  load(d.state?d:{revision:0,state:d},'file');
  if($('account-settings').open)$('account-settings').close();
  notify('파일을 열었어요. 서버에는 저장하지 않습니다.');
 }catch(e){
  if(generation===deps.loadGeneration)notify('불러오기 실패: '+e.message);
 }
};
// #368: #trees select는 옛 내 기록 창의 것으로 함께 없앴다. 트리 고르기는 트리 ▾ 드롭다운(renderTreeMenu)이 맡는다.
// #380 4 2차: 전체 화면·가운데 창 공통 틀을 쓰는 대화상자(편집기·순간 잇기·트리 관리)는 × 도 바깥 클릭·Esc와 같은 규칙을 쓴다.
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{const target=$(b.dataset.close);if(target?.dataset?.ltPanel){shellDialogs.requestClose(b.dataset.close);return;}target.close();});
function publicProblem(answer){
 deps.source='share';deps.activeShareId=null;deps.model={trees:[]};window.LT41=null;document.body.dataset.recordSource='share';flowNavigation();document.body.classList.remove('home-screen');hideFrames();$('empty').hidden=false;$('empty-sample').hidden=true;$('empty-records').hidden=true;
 const messages={share_invalid:['공유 주소를 찾을 수 없어요.','주소를 다시 확인해 주세요.'],share_not_found:['공유 주소를 찾을 수 없어요.','주소가 잘못되었거나 존재하지 않아요.'],share_revoked:['공유가 취소됐어요.','소유자가 이 공유 주소를 회수했습니다.'],share_removed:['공유된 트리가 없어졌어요.','트리가 삭제되었거나 더 이상 공개할 수 없어요.'],share_empty:['아직 공개할 순간이 없어요.','소유자가 순간을 남긴 뒤 다시 열어 주세요.'],share_forbidden:['이 공유는 볼 수 없어요.','접근 권한을 확인해 주세요.']};
 const [title,detail]=messages[answer.code]||['공유 기록을 불러오지 못했어요.',answer.code==='timeout'?'서버 응답 시간이 초과됐어요. 다시 시도해 주세요.':'잠시 뒤 다시 시도해 주세요.'];$('empty').querySelector('h1').textContent=title;$('empty').querySelector('p').textContent=detail;links();
}
async function showPublicRoute(route){
 // 로그인한 방문자의 계정 연결은 보존하고, 이 트리의 데이터만 읽기 전용으로 싣는다.
 if(deps.member&&!(deps.member.snapshot().owned?pauseMember():leaveMember())){writeLocation('replace');return;}
 const generation=++deps.loadGeneration;
 deps.activeShareId=route.shareId;
 deps.current=screenForView(['book','board','network'].includes(route.view)?route.view:'book')[1];
 deps.handledHash=location.hash;
 $('empty').querySelector('h1').textContent='공유된 순간을 펼치고 있어요.';
 $('empty').querySelector('p').textContent='소유자가 공개한 트리 한 개만 확인합니다.';
 $('empty-sample').hidden=true;$('empty-records').hidden=true;$('view').hidden=true;$('empty').hidden=false;
 const answer=await shareApi.read(route.shareId||'');if(generation!==deps.loadGeneration)return;if(!answer.ok){publicProblem(answer);return;}
 deps.activeShareId=answer.share.id;const view=['book','board','network'].includes(route.view)?route.view:answer.share.view;deps.current=screenForView(view)[1];load({revision:0,state:{version:1,trees:[answer.tree]}},'share',{treeId:answer.tree.id,momentId:answer.share.entryMomentId});
 // #891: 공유 주소가 특정 순간을 가리키면(시작 순간) 보드만 그 순간의 상세 판을 열어 보여 준다.
 if(view==='board'&&answer.share.entryMomentId)requestBoardOpen(answer.share.entryMomentId);
 deps.activeShareId=answer.share.id;show(deps.current,false);writeLocation('replace');
 // 기존 공개 읽기 API만 사용한다. 별도로 계정 화면을 불러오지 않고 로그인 표시만 확인한다.
 if(!deps.member?.snapshot().owned)void accountApi.account().then(account=>{
   if(generation===deps.loadGeneration&&deps.source==='share')deps.onVisitorAccount?.(account?.ok?account:null);
 }).catch(()=>{});
 notify('공개된 트리를 감상하는 화면이에요. 감상만 할 수 있어요.'+(answer.aiTester?' AI 명예회원이 만든 트리예요.':'')+(answer.omittedPrivateMedia?' 올린 사진 '+answer.omittedPrivateMedia+'장은 나만 볼 수 있어요.':''),{visitorIntro:true});
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
 // 2026-11-23: 로그아웃 서재 탭도 로그인으로 즉시 이동시키지 않고 빈 상태에서 로그인 단추를 안내한다.
 // 261118 대표 지적 2차 5: 서재 화면에서 콕·보드·지도는 마지막에 본 트리(서재 가운데 책의 트리)로 연다.
 if(deps.current==='track32-bookshelf.html'&&b.dataset.view!=='track32-bookshelf.html'){const treeId=lastShelfTreeId();
  if(treeId&&deps.model?.trees?.some(t=>t.id===treeId)&&window.LT41?.tree?.id!==treeId){deps.current=b.dataset.view;choose(treeId);writeLocation();return;}}
 show(b.dataset.view,true,'',true);});
for(const f of frames())f.addEventListener('load',()=>{frameLoaded(f);
 // #894: 새로 뜬 안쪽 화면에도 움직임 끄기 상태를 알린다(메모리 상태 — 화면을 다시 열면 처음 상태).
 try{f.contentWindow.postMessage({type:MSG.motion,paused:deps.motionPaused},location.origin)}catch{}});
return { updatesReady, showPublicRoute, getFeedbackDialog:()=>feedbackDialog, getFeedbackBoard:()=>feedbackBoard, refreshMyNewsCount:()=>myNewsMount.refreshCount(), openMyNews:()=>myNewsMount.open(), getAccountTip:()=>accountTip, applyAdvanced, applyDateStyleToFrame, applyPageTurnToFrame, applyNetworkViewToFrame, applyBoardThemeToFrame, syncBoardThemeToApp, quickTargetPreference, profileDirty, paintSettingsProfile, accountConfirmMatches, openAccountData, openAccountSettings, paintDateStyleControls, paintStartPlaceControls, paintShareControls, paintQuickTargetControls, paintNetworkViewControls, paintPageTurnControls, paintBoardThemeControls, paintTreeVisibilityList, paintSettingsUsage, loadTreeVisibility, paintTreeManagerVisibility, paintSettingsTab, focusSettingsSection, fillProfileForm, paintScreenControls, readAdvanced, advancedKey, currentDateStyle, currentPageTurn, sendToFrame, currentStartPlace, currentShareView, currentBoardTheme };
}








