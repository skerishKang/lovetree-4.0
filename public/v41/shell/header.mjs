// 셸의 헤더 상태·탭·트리 선택·계정 메뉴 (#231 1-B ②-2).
// 2026-11-08 리팩터링: 동작·겉모습 변경 0. shell.mjs에서 조건·조회 방식·인자 형태를 바꾸지 않고 그대로 옮겼다.
// 셸은 자기 상태(member·model·source·current)를 읽기 함수로 넘기고, 이 파일은 헤더만 만진다.
import {hasPendingDraft} from '../sync-controller.mjs';
import {accountPresentation,treePickerText,treeViewsVisible,writeMenuLabel,headerPartsFor} from '../header-state.mjs';
import {displayTreeTitle} from '../tree-name.mjs';

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

function flowNavigation(){
  const owned=!!getMember()?.snapshot().owned;
  const reading=!!window.LT41&&['track59-sketchbook.html','track58-pinboard.html','track56-network.html'].includes(getCurrent());
  const publicReading=getSource()==='share';
  // 트리 보기 탭은 로그인한 내 트리에서만 연다. 로그아웃이면 예시가 열려 있어도 숨긴다.
  // #213 3번: 상태(out·in-empty·in-trees·share)마다 보이는 것만 남기고 나머지는 숨긴다(비활성 표시 없음).
  const parts=headerPartsFor({owned,treeCount:getModel()?.trees?.length||0,publicReading});
  const showTreeViews=parts.treeViews&&treeViewsVisible({owned,publicReading});
  $('tree-views').hidden=!showTreeViews;for(const b of $('tree-views').querySelectorAll('button')){b.disabled=false;b.title='';}
  $('tree-views').setAttribute('aria-label',window.LT41?.tree.title?displayTreeTitle(window.LT41.tree.title)+' 보기':'이 트리 보기');
  for(const b of document.querySelectorAll('nav>button'))b.hidden=publicReading;
  // 트리 선택은 뒤쪽 탭 묶음 바로 앞에 있고, 로그인 상태에서만 "트리: <이름> ▾"로 보여 준다.
  // 로그아웃이면 "트리 고르기", 브라우저에만 남은 미저장 기록이 있으면 "저장 안 된 기록"이다.
  const pendingDraft=hasPendingDraft(sessionStorage,getMember()?.snapshot().subject||null);
  $('record-menu').hidden=!parts.treePicker||publicReading;
  $('source-label').textContent=treePickerText({owned,treeTitle:displayTreeTitle(window.LT41?.tree.title||''),pendingDraft});
  $('record-menu').title=owned?(window.LT41?'다른 트리를 고릅니다.':'열어볼 트리를 고릅니다.'):(pendingDraft?'로그인하면 저장하지 못한 기록을 복원합니다.':'로그인하면 내 트리를 고를 수 있습니다.');
  $('write-menu').hidden=!parts.write||publicReading;$('share-menu').hidden=!parts.share||getSource()!=='server'||!window.LT41;
  if(!getMember()?.snapshot().dirty)$('write-menu').textContent='＋ 순간 추가';
  $('write-menu').title=getSource()==='server'?(reading?'선택한 순간에서 이어지는 새 순간을 기록합니다.':'새 트리의 첫 순간을 기록합니다.'):'로그인한 계정에 내 트리를 만듭니다. 예시에는 저장하지 않아요.';
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
function maskEmail(value){const text=String(value||'').trim();const at=text.indexOf('@');if(at<=0)return text?text[0]+'•••':'내 계정';return text[0]+'•••'+text.slice(at);}
function renderAccount(){const owned=!!getMember()?.snapshot().owned,view=accountPresentation({owned,email:accountEmail,subject:getMember()?.snapshot().subject||''});
 const login=$('account-entry'),avatar=$('account-avatar');
 if(view.mode==='login'){login.hidden=false;login.textContent='로그인';login.removeAttribute('aria-label');avatar.hidden=true;avatar.textContent='';const init=$('account-initial');if(init)init.textContent='';const mail=$('account-email');if(mail)mail.textContent='';closeAccountMenu();return;}
 login.hidden=true;avatar.hidden=false;avatar.textContent=view.initial;const masked=maskEmail(view.label);avatar.setAttribute('aria-label',`내 계정 메뉴, ${masked}로 로그인됨`);avatar.title='내 계정';
 const init=$('account-initial');if(init)init.textContent=view.initial;
 $('account-email').textContent=masked;}
function openAccountMenu(){const owned=!!getMember()?.snapshot().owned;if(!owned){return;}const pop=$('account-popover');pop.hidden=false;$('account-avatar').setAttribute('aria-expanded','true');if(!accountEmail)void loadAccountEmail();}
async function loadAccountEmail(){const answer=await accountApi.account().catch(()=>null);if(answer?.ok&&answer.email){accountEmail=answer.email;renderAccount();}}
function updateAccountControls(){const owned=!!getMember()?.snapshot().owned;document.querySelectorAll('[data-guest-login]').forEach(x=>x.hidden=owned);$('server').hidden=!owned;$('logout').hidden=!owned;$('account-settings-open').hidden=!owned;renderAccount();}

  return {
    flowNavigation,
    updateNavFade,
    revealCurrentTab,
    closeAccountMenu,
    renderAccount,
    openAccountMenu,
    loadAccountEmail,
    updateAccountControls,
    currentAccountEmail: () => accountEmail
  };
}
