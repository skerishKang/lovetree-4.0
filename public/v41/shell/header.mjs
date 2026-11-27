// 셸의 헤더 상태·탭·트리 선택·계정 메뉴 (#231 1-B ②-2).
// 2026-11-08 리팩터링: 동작·겉모습 변경 0. shell.mjs에서 조건·조회 방식·인자 형태를 바꾸지 않고 그대로 옮겼다.
// 셸은 자기 상태(member·model·source·current)를 읽기 함수로 넘기고, 이 파일은 헤더만 만진다.
import {hasPendingDraft} from '../sync-controller.mjs';
import {accountPresentation,treePickerText,treePickerVisible,treePickerAriaLabel,treeViewsVisible,writeMenuLabel,headerPartsFor,bookDisplayVisible,shelfViewVisible} from '../header-state.mjs';
import {normalizeAccentColor} from '../domain.mjs';
import {displayTreeTitle} from '../tree-name.mjs';
import {settleHeaderAuth} from './header-initial.mjs';

export function createHeader(deps) {
  const {$} = deps;
  const getMember = deps.getMember;
  const getModel = deps.getModel;
  const getSource = deps.getSource;
  const getCurrent = deps.getCurrent;
  const accountApi = deps.accountApi;
  const delegate = deps.delegate || {};
  const navBar = deps.navBar;
  const narrowNav = () => matchMedia('(max-width:780px)').matches;
  let accountEmail = '';
  // #465 4: 동그라미 깜빡임 — 계정 정보를 불러오는 동안 '나'였다가 글자로 바뀐다.
  // 저장본(#408)의 표시 이름과 직전에 그린 글자(localStorage 한 글자, 로그아웃 때 지움)로 먼저 그린다.
   const lastLetter = () => { try { return localStorage.getItem('lt41.avatarLetter') || ''; } catch { return ''; } };
  const rememberLetter = (letter) => { try { if (letter && letter !== '나') localStorage.setItem('lt41.avatarLetter', letter); else localStorage.removeItem('lt41.avatarLetter'); } catch { /* 저장소 접근 불가 */ } };

function renderHeaderLayout({publicReading, owned, parts, current, tree}) {
  const root=document.body;
  root.classList.toggle('lt-header-visitor',publicReading);
  const browse=$('community-menu');
  if(browse) { browse.hidden=false; browse.removeAttribute?.('aria-hidden'); }
  const views=$('tree-views');
  const viewing=publicReading && current==='track32-bookshelf.html' ? 'track59-sketchbook.html' : current;
  for(const b of views?.querySelectorAll?.('button[data-view]')||[]) {
    const hidden=publicReading&&b.dataset.view==='track32-bookshelf.html';
    b.hidden=hidden;
    b.inert=hidden;
    b.toggleAttribute?.('aria-hidden',hidden);
    if(publicReading)b.setAttribute('aria-current',String(!hidden && b.dataset.view===viewing));
  }
  let label=document.getElementById?.('lt-visitor-caption');
  if(!label && typeof document.createElement==='function' && document.querySelector?.('.app-header')) {
    label=document.createElement('div');
    label.id='lt-visitor-caption';
    label.setAttribute('role','status');
    document.querySelector('.app-header')?.after(label);
  }
  if(!label)return;
  const publicTree=tree||window.LT41?.tree;
  label.hidden=!publicReading||!publicTree;
  if(!publicReading)root.removeAttribute?.('data-public-ai-tester');
  if(publicReading&&publicTree) {
    // #1513: 공개 응답에 허용된 제목과 명예회원 표시만 사용한다.
    const name=String(publicTree.title||'트리').trim();
    const intro=root.hasAttribute?.('data-public-ai-tester')?'AI 명예회원의 공개 트리':'공개 트리';
    label.textContent=intro+" '"+name+"' 감상 중";
  }else label.textContent='';
}

function flowNavigation(){
  const owned=!!getMember()?.snapshot().owned;
  const reading=!!window.LT41&&['track61-tree.html','track59-sketchbook.html','track58-pinboard.html','track56-network.html'].includes(getCurrent());
  const publicReading=getSource()==='share';
  document.body.classList.toggle('share-visitor',publicReading);
  // 대표 결정(2026-11-23) + #1236: 서재·책·보드·지도 화면 탭은 로그인 여부·트리 개수와
  // 무관하게 보인다. #213의 권한별 숨김은 트리 선택·쓰기·공유에만 적용한다.
  // 방문자는 서재만 따로 숨기고 책·보드·지도 탭을 그대로 쓴다.
  const parts=headerPartsFor({owned,treeCount:getModel()?.trees?.length||0,publicReading});
  const showTreeViews=treeViewsVisible({owned,phase:getMember()?.snapshot().phase,publicReading});
  $('tree-views').hidden=!showTreeViews;
  for(const b of $('tree-views').querySelectorAll('button[data-view]')){
    const visitorHidden=publicReading&&b.dataset.view==='track32-bookshelf.html';
    b.classList.toggle('visitor-hidden',visitorHidden);
    b.hidden=visitorHidden;
    b.inert=visitorHidden;
    if(visitorHidden)b.setAttribute('aria-hidden','true');else b.removeAttribute('aria-hidden');
    b.disabled=false;b.title='';
  }
  $('tree-views').setAttribute('aria-label','이 트리 보기');
  // #1094: 보기 방식(책/목록) 전환 묶음은 책 화면에서만, #1093 서재 진열 묶음은 서재 화면에서만 보인다.
  // #1092 후속: 둘러보기는 서재 위에 뜨는 화면이라 현재 화면 값이 서재로 남는다 — 둘러보기 화면에서는 둘 다 접는다.
  const entryScreen={'track32-bookshelf.html':'shelf','track59-sketchbook.html':'book','track58-pinboard.html':'board'}[getCurrent()]||'';
  const entryRoot=document.documentElement;
  if(entryRoot?.dataset&&entryScreen)entryRoot.dataset.ltShellEntry=entryScreen;
  // #1231: 깊은 주소의 첫 그림 배치를 인증 확인 중 지우지 않는다. 지우면 서재·책 머리줄이 뒤늦게 40px 커져 CLS가 생긴다.
  else if(entryRoot?.dataset && entryRoot.dataset.ltAuthPhase!=='pending')delete entryRoot.dataset.ltShellEntry;
  const onCommunity=document.body.classList.contains('community-screen');
  const onShelf=getCurrent()==='track32-bookshelf.html';
  // #1093: 서재 진열 토글만 390에서 화면 안 도구 줄로 옮긴다 — #1121 책 보기 토글의 자리·보임은 그대로다.
  const inlineShelfToggle=typeof globalThis.matchMedia==='function' && globalThis.matchMedia('(max-width:520px)').matches;
  const bookToggle=$('book-display-toggle');
  if(bookToggle)bookToggle.hidden=!bookDisplayVisible({current:getCurrent()})||onCommunity;bookToggle?.removeAttribute?.('data-lt-pending');
  const shelfToggle=$('shelf-view-toggle');
  if(shelfToggle)shelfToggle.hidden=!shelfViewVisible({current:getCurrent()})||onCommunity||inlineShelfToggle;shelfToggle?.removeAttribute?.('data-lt-pending');
  // #1447: 머리줄 상태별 표시는 renderHeaderLayout 한 곳에서 그린다. 감춘 항목은 자리를 남기지 않는다.
  renderHeaderLayout({publicReading, owned, parts, current:getCurrent(), tree:getModel()?.trees?.find(t=>t.id===window.LT41?.tree?.id)});
  // 트리 선택은 뒤쪽 탭 묶음 바로 앞에 있고, 로그인 상태에서만 "트리: <이름> ▾"로 보여 준다.
  // 2026-11-18 13:49 대표 결정: 트리 선택은 모든 페이지에서 똑같이 보인다(서재 포함).
  // 로그아웃이면 "트리 고르기", 브라우저에만 남은 미저장 기록이 있으면 "저장 안 된 기록"이다.
  const pendingDraft=hasPendingDraft(sessionStorage,getMember()?.snapshot().subject||null);
  // 방문자에게는 트리 고르기와 서재를 숨기고 내 화면의 책·보드·지도 탭을 재사용한다.
  const treeSlot=document.querySelector?.('.tree-slot');
  if(treeSlot){treeSlot.inert=publicReading;if(publicReading)treeSlot.setAttribute('aria-hidden','true');else treeSlot.removeAttribute('aria-hidden');}
  $('record-menu').hidden=true;
  // #1092: 둘러보기 단추는 community-panel.mjs가 표시한다. 여기서 다시 숨기면 로그인·로그아웃·방문자
  // 모두 둘러보기 탭을 잃는다 — 좁은 화면은 shell.css가 접기 메뉴로 접으므로 이곳에서는 건드리지 않는다.
  const pickerState={owned,treeTitle:displayTreeTitle(window.LT41?.tree.title||''),pendingDraft,treeCount:getModel()?.trees?.length||0};
  $('source-label').textContent=treePickerVisible(pickerState);
  $('record-menu').setAttribute('aria-label',treePickerAriaLabel(pickerState));
  // #601: 칸 폭이 고정되어 있으므로(11em) 긴 이름은 말줄임 — 마우스 올림·초점에 전체 이름을 보여 준다.
  $('record-menu').title=owned?(window.LT41?`트리: ${displayTreeTitle(window.LT41?.tree.title||'')} — 다른 트리를 고릅니다.`:'열어볼 트리를 고릅니다.'):(pendingDraft?'로그인하면 저장하지 못한 기록을 복원합니다.':'로그인하면 내 트리를 고를 수 있습니다.');
  // #942를 바꾼 #1487 결정(2026-11-27): 첫 화면에서도 내 서버 기록이면 순간이 없어도(트리 0개 포함) 머리줄·모바일 추가를 보인다.
  // 로그인했어도 예시를 보는 중이면 첫 화면 추가는 숨긴다(예시에는 저장하지 않는다).
  const home=getCurrent()==='src064-orbit.html';
  const ownRecords=owned&&getSource()==='server';
  const hasMoments=ownRecords&&(getModel()?.trees||[]).some(t=>t.moments?.length>0);
  document.body.classList.toggle('home-existing',home&&hasMoments);
  $('write-menu').hidden=!parts.write||publicReading||(home&&!ownRecords);$('share-menu').hidden=!parts.share||getSource()!=='server'||!window.LT41;
  // 261117 대표 결정: 좁은 화면에서는 '+ 순간 추가'를 '+'로 줄여 위 메뉴(테마 단추 포함)가 넘치지 않게 한다 —
  // 이름은 aria-label이 지킨다. 저장 안 됨('저장 안 됨')은 짧아 그대로다.
  const narrowHeader=window.innerWidth<=650;
  if(!getMember()?.snapshot().dirty){
   $('write-menu').textContent=narrowHeader?'+':'＋ 순간 추가';
   if(narrowHeader)$('write-menu').setAttribute('aria-label','순간 추가');else $('write-menu').removeAttribute('aria-label');
  }
  $('write-menu').title=getSource()==='server'?(reading?'선택한 순간에서 이어지는 새 순간을 기록합니다.':'새 트리의 첫 순간을 기록합니다.'):'로그인한 계정에 내 트리를 만듭니다. 예시에는 저장하지 않아요.';
  // #458: 모바일 떠 있는 ＋ 단추는 로그인한 내 기록(서버·쓰기 가능)에서만 뜬다. 공유·예시 화면·로그아웃·읽기 전용에서는 숨긴다.
  document.body.classList.toggle('lt-fab-ok',!$('write-menu').hidden&&getSource()==='server'&&owned);
  /* 이슈 458: 화면마다 아래쪽에 이미 있는 단추·탭 높이가 다르므로 화면별로 단추를 얼마나 올릴지 셸 CSS가 쓴다. */
  document.body.dataset.fabLift={'track59-sketchbook.html':'book','track58-pinboard.html':'board','track56-network.html':'network','track61-tree.html':'tree','track32-bookshelf.html':'shelf'}[getCurrent()]||'';
  if(entryRoot?.dataset)delete entryRoot.dataset.ltHeaderPending;
  const phase=getMember()?.snapshot()?.phase;
  if(phase==='login'||phase==='synced')settleHeaderAuth(!!getMember()?.snapshot()?.owned);

  delegate.syncTreeTips();
  revealCurrentTab();
}

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
function closeAccountMenu(){const pop=$('account-popover');if(!pop||pop.hidden)return;pop.hidden=true;$('account-avatar').setAttribute('aria-expanded','false');}
function renderAccount(){
 const visitor=getSource()==='share'?deps.getVisitorAccount?.():null;
 const owned=!!getMember()?.snapshot().owned||!!visitor;
 if(visitor?.email&&!accountEmail)accountEmail=visitor.email;
 // #368 2차: 동그라미 글자는 표시 이름 첫 글자 → 이메일 첫 글자 → 나, 색은 계정 설정 칸의 고른 색(없으면 기본색).
 const prefs=(()=>{try{return getMember()?.state?.()?.prefs||{}}catch{return {}}})();
 // #1320: 로그인 확인 중에는 '로그인' 글자를 보여 주지 않는다. 자리는 그대로 두어 옆 단추가 밀리지 않는다.
 const checking=getMember()?.snapshot()?.phase==='checking'&&getSource()!=='share'&&!visitor;
 const rootDataset=globalThis.document?.documentElement?.dataset;
 if(rootDataset){if(checking)rootDataset.ltAuthChecking='1';else delete rootDataset.ltAuthChecking;}
 const view=accountPresentation({owned,email:accountEmail,name:prefs.displayName||deps.getCachedName?.()||''});
 const accent=owned?normalizeAccentColor(prefs.accentColor):'';
 const login=$('account-entry'),avatar=$('account-avatar');
 if(view.mode==='login'){login.hidden=false;login.textContent='로그인';login.removeAttribute('aria-label');avatar.hidden=true;avatar.textContent='';avatar.removeAttribute('data-accent');const init=$('account-initial');if(init){init.textContent='';init.removeAttribute('data-accent');}const mail=$('account-email');if(mail){mail.textContent='';mail.removeAttribute('title');}closeAccountMenu();try{localStorage.removeItem('lt41.avatarLetter')}catch{}}
 else{const shown=view.initial==='나'?(lastLetter()||view.initial):view.initial;
 login.hidden=true;avatar.hidden=false;avatar.textContent=shown;avatar.setAttribute('aria-label',view.ariaLabel);avatar.title=deps.getAccountTip?.()||'내 계정';avatar.dataset.accent=accent;
 const init=$('account-initial');if(init){init.textContent=shown;init.dataset.accent=accent;}
 const mailEl=$('account-email');mailEl.textContent=view.label;mailEl.title=view.title;mailEl.setAttribute('aria-label',view.title);rememberLetter(shown);}
  // #368: 설정 "프로필" 묶음도 같은 이메일 값을 쓴다(셸이 넘긴 콜백).
  deps.onEmailChange?.(accountEmail);}
function openAccountMenu(via='keyboard'){
 const owned=!!getMember()?.snapshot().owned;
 if(!owned&&getSource()==='share'&&deps.getVisitorAccount?.()){
   location.hash='#my/home';return; // 실제 계정 화면에서 기존 계정 메뉴를 사용한다.
 }
 if(!owned){return;}if($('toast'))$('toast').hidden=true;const pop=$('account-popover');pop.hidden=false;pop.dataset.ltOpenedBy=via;$('account-avatar').setAttribute('aria-expanded','true');pop.querySelector('button:not([hidden])')?.focus();if(!accountEmail&&!emailTried)void loadAccountEmail();}
// #368 보완 1·2: 이메일을 메뉴를 열 때가 아니라 로그인 직후 불러와 동그라미·라벨이 처음부터 이메일을 쓰게 한다.
// 한 번 시험한 뒤에는 성공해도(이메일 없는 계정) 다시 부르지 않고, 실패했을 때만 다시 시험한다.
 let emailTried=false;
 let aiCustomer=false;
 let isAdmin=false;
 // #540 마무리: 서버가 알려 준 역할로만 입구를 보인다 — AI 고객에게는 '오늘 사용 일지',
 // 관리자에게는 구분선 아래 '운영' 묶음(운영센터, /admin.html). 관리자가 아니면 운영 묶음이 보이지 않는다.
 function applyAccountRoles(){const j=$('account-journal');if(j)j.hidden=!aiCustomer;const opsGroup=$('account-ops-group');if(opsGroup)opsGroup.hidden=!isAdmin;const p=$('account-my-posts');if(p)p.hidden=false;}
async function loadAccountEmail(){emailTried=true;const answer=await accountApi.account().catch(()=>null);if(!answer?.ok){emailTried=false;return;}if(answer.email)accountEmail=answer.email;aiCustomer=!!answer.aiCustomer;isAdmin=!!answer.admin;applyAccountRoles();renderAccount();}
function updateAccountControls(){const owned=!!getMember()?.snapshot().owned||getSource()==='share'&&!!deps.getVisitorAccount?.();if(!owned){accountEmail='';emailTried=false;aiCustomer=false;isAdmin=false;}document.querySelectorAll('[data-guest-login]').forEach(x=>x.hidden=owned);$('server').hidden=!owned;$('logout').hidden=!owned;applyAccountRoles();renderAccount();if(owned&&!accountEmail&&!emailTried)void loadAccountEmail();}
 
  // 창 폭이 바뀌면 390의 토글 자리를 다시 정한다(머리줄 ↔ 화면 안 도구 줄).
  if(typeof addEventListener==='function')addEventListener('resize',()=>flowNavigation());
// #1134: 401 뒤 상단 단추만 로그인으로 바뀌고 계정 메뉴는 그대로 남아 반쯤 로그아웃되던 것을 막는다.
// authRequired()가 부르는 한 벌 — 계정 메뉴의 이메일·운영·로그아웃을 함께 로그아웃 상태로 맞춘다.
function paintAuthExpired(){
  accountEmail='';emailTried=false;aiCustomer=false;isAdmin=false;
  renderAccount();
  const pop=$('account-popover');if(pop){pop.hidden=true;pop.dataset.ltOpenedBy='';}
  const avatar=$('account-avatar');if(avatar){avatar.hidden=true;avatar.setAttribute('aria-expanded','false');}
  const logout=$('logout');if(logout)logout.hidden=true;
  const menuLogout=$('account-logout');if(menuLogout)menuLogout.hidden=true;
  const ops=$('account-ops-group');if(ops)ops.hidden=true;
  const journal=$('account-journal');if(journal)journal.hidden=true;
  const entry=$('account-entry');if(entry){entry.hidden=false;entry.textContent='로그인';}
}


  return {
    flowNavigation,
    updateNavFade,
    revealCurrentTab,
    closeAccountMenu,
    renderAccount,
    openAccountMenu,
    loadAccountEmail,
    updateAccountControls,
    paintAuthExpired,
    currentAccountEmail: () => accountEmail
  };
}


