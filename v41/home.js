// #586: 첫 화면 문서는 src/styles.css 를 읽지 않는다(vite가 styles-*.css link를 주입해 궤도 그림자의
// 스타일 재계산이 프레임당 수십 ms가 걸렸다). 그림자가 쓰는 --ui 토큰은 v41/home.html 의 style에 둔다.
import {mountOrbit,ORBIT_EXAMPLE} from '../src/views/orbit.js';
import {homeCardsPlan,readHomeCardsMode} from './home-cards.js';
import {HOME_ORBIT_LIMIT, ltDateStyle, dateStyleOf, shouldReloadForDateStyle} from './home-moments.js';
import {fetchPopularCards} from './home-popular.js';
import {createHomeActions} from './home-actions.js';
import {homePresentation} from './home-presentation.js';
import {applyHomeCenter} from './home-center.js';
import {readTheme,writeTheme,appliedTheme,applyThemeAttribute} from '../public/v41/header-state.mjs';
import {readTitleDisplay, titleDisplayOf, shouldReloadForTitleDisplay} from '../public/v41/book-usability.mjs';
import {momentListEntries, momentListTrees} from './moment-list.js';
// 261116 PR 2: 카드 모드(마지막·고정·그날·무작위·트리)·숫자 줄이기 — 순수 계산 한 벌.
import {HOME_MOMENT_KEY, readHomeMoment, normalizeHomeMoment, homeMomentPick, homeDayMoment, homeMomentMenu, formatCount} from './home-card-mode.js';
const shellBody=parent.document.body;
const context=parent.LT41||{source:shellBody.dataset.recordSource,member:shellBody.dataset.member,treeCount:Number(shellBody.dataset.treeCount||0)};
const bridge=createHomeActions({getContext:()=>parent.LT41,send:message=>parent.postMessage(message,location.origin),gallery:true});
const presentation=homePresentation(context);
const loggedIn=presentation.centerState.member==='in';
// 2026-11-08 카드 출처: 예시/인기/내 것만/섞어서. 저장값이 없으면 로그인=섞어서, 로그아웃=예시.
const mode=readHomeCardsMode(localStorage,{loggedIn});
const popular=mode==='popular'?await fetchPopularCards({limit:HOME_ORBIT_LIMIT}):[];
// 2026-11-10 CTO 결정(#340): 내 기록(서버·소유자)의 YouTube 순간은 #330 판정 한 벌(autoLoadMedia)로
// 썸네일 카드를 처음부터 만든다. 판정 입력은 media-preview의 currentContext(셸 기록 상태)와 같은 값이다.
const mediaState=globalThis.LTMedia?.currentContext?.()||{source:'',owned:false};
const youtube={describe:url=>globalThis.LTMedia?.describe?.(url)??null,auto:globalThis.LTMedia?.autoLoadMedia?.(mediaState.source,mediaState.owned)===true};
const cardsPlan=homeCardsPlan({mode,loggedIn,context,popular,youtube});
const cardTrees=cardsPlan.cards.length?[{id:'home-cards',title:'첫 화면 카드',moments:cardsPlan.cards}]:[];
// #394: 순간 목록은 모든 트리의 순간을 최근 순으로 보는 곳. 트리 드롭다운의 "내 순간 전체 보기"로
// 열릴 때는 셸이 남긴 요청(LT41_MOMENTS_OPEN)의 트리가 골라진 상태로 시작한다.
const momentsRequest=parent.LT41_MOMENTS_OPEN??null;try{console.log('[home] momentsRequest',JSON.stringify(momentsRequest||null));}catch{}
// 261116 PR 2: 카드 모드 값 — 계정 설정(LT41.prefs.homeMoment)을 먼저 보고 기기 미러, 없으면 기본(마지막).
let homeMomentValue=readHomeMoment({prefs:parent.LT41,storage:localStorage});
const homeMomentDay=loggedIn?homeDayMoment(context.trees):null;
const momentList=loggedIn?{
 trees:momentListTrees(context.trees),
 entries:momentListEntries({trees:context.trees,youtube}),
 initialTreeId:momentsRequest?.treeId||'all',
 initialOpen:!!momentsRequest,
 initialPicking:momentsRequest?.picking===true,
 initialNotice:momentsRequest?.notice||null
}:null;
const homeMomentChoice=homeMomentPick(momentList?.entries,homeMomentValue,{day:homeMomentDay,trees:momentList?.trees||[]});
if(momentList){momentList.recent=homeMomentChoice.moment;momentList.recentHeader=homeMomentChoice.header;}
// 이 문서가 그려질 때 쓴 날짜 표기. 셸이 같은 값을 다시 보내면 새로고침하지 않는다(아래 메시지 처리).
const renderedDateStyle=dateStyleOf(ltDateStyle());
// #481: 이 문서가 그릴 때 쓴 제목 보기. 받은 값이 이것과 다를 때만 다시 띄운다.
const renderedTitleDisplay=titleDisplayOf(readTitleDisplay(parent.LT41));
 const orbit=mountOrbit(document.getElementById('orbit'),{
 trees:cardTrees,examples:cardsPlan.examples?ORBIT_EXAMPLE.moments.slice(0,cardsPlan.examples):[],
 // 내 것만 0장은 예시로 대체하지 않고 빈 궤도와 첫 순간 안내를 남긴다.
 empty:cardsPlan.kind==='mine-empty',
 // #780: 큰 제목·부제목은 카드(mix-empty)가 비었는지보다 로그인 여부를 먼저 본다. 카드는 그대로 예시다.
 loggedIn,
 momentList,
 prefs:parent.LT41?.prefs||null,
 titleDisplay:readTitleDisplay(parent.LT41),
 dateStyle:renderedDateStyle,
 // 261116 PR 2: 순간 창의 '첫 화면에 걸기' — 계정 설정에 고정하고 모드를 '고정한 순간'으로 바꾼다.
 homePin:{
  pinned:c=>homeMomentValue.mode==='pin'&&homeMomentValue.momentId===c.id&&homeMomentValue.treeId===c.treeId,
  toggle:c=>{setHomeMoment(isPinnedMoment(c)?{mode:'last'}:{mode:'pin',momentId:c.id,treeId:c.treeId});return isPinnedMoment(c);}
 },
 onOpen:card=>{if(card.source==='public'){parent.location.hash=`#share/${card.shareId}/${card.view||'book'}`;return;}bridge.actions.openMine(card.treeId,card.id);},
 storage:{getItem:()=>null,setItem:()=>{}},context:{...presentation.context,readOnly:cardsPlan.kind==='example'},
 authHtml:`<button class="menuBtn auth-entry" data-home-account>${presentation.accountLabel}</button>`,actions:bridge.actions
});
// #394: 순간 목록 열기 요청을 받았다고 셸에 알린다 — 셸은 요청 플래그를 치워 다음 화면 이동에 되풀이하지 않게 한다.
if(momentsRequest){try{parent.postMessage({type:'lt41-moments-opened'},location.origin)}catch{}}
const shadow=document.getElementById('orbit').shadowRoot;
// 261116 PR 2: 오른쪽 위 '순간 목록' 단추는 없앤다 — 목록 입구는 가운데 세트 첫 단추로 옮겼다.
shadow.querySelector('.top-actions > .menuBtn[data-do="index"]')?.remove();
// #380(2026-11-11): 가운데 세 버튼 — 자리·개수 그대로, 남은 폭을 똑같이 나눠 세 폭 동일(가장 긴 글자 기준 고정), 로그인 후 상태 한 줄.
const centerStyle=document.createElement('style');
// 버튼 폭(대표 2026-11-13): 세 개일 때의 폭(약 176px)을 넘지 않게 묶는다 — 두 개면 265px씩 늘어나 둔해 보였다.
// 휴대폰: 줄을 꽉 채우지 않는다. 두 개는 나란히(사이 10px), 세 개는 세로로 쌓되 폭 240px까지만 — 양옆과 버튼 사이에 여백을 둔다.
centerStyle.textContent='.center .actions{gap:10px}.center .actions .subtleBtn{flex:1 1 0%;max-width:176px;min-width:0;overflow-wrap:anywhere;text-align:center;line-height:1.15}@media (max-width:480px){.center .actions{gap:10px}.center .actions .subtleBtn{max-width:150px}.center .actions[data-count="3"]:not([data-inline]){flex-direction:column;align-items:center}.center .actions[data-count="3"]:not([data-inline]) .subtleBtn{flex:0 0 auto;width:100%;max-width:240px}}';
shadow.append(centerStyle);
// 2026-11-07 테마 A/B: 첫 화면 오른쪽 위 도구 줄의 버튼 하나로 밤/정원을 바꾼다. 저장 키는 셸과 같다(lt41.theme).
// 정원 색은 public/v41/identity.css의 정원 블록에만 있고, 그 파일을 그림자 루트에도 넣어 :host 규칙을 쓴다.
const themeHost=document.getElementById('orbit');
const themeStyle=document.createElement('link');themeStyle.rel='stylesheet';themeStyle.href='/v41/identity.css';shadow.append(themeStyle);
function syncTheme(theme){applyThemeAttribute(themeHost,appliedTheme(theme,'home'));}
function applyTheme(theme){applyThemeAttribute(document.documentElement,appliedTheme(theme,'home'));syncTheme(theme);}
applyTheme(readTheme(localStorage));
// 셸(계정 메뉴)이 이 문서의 html에 속성을 바꾸면 그림자 루트의 호스트와 버튼 글자를 맞춘다.
new MutationObserver(()=>syncTheme(readTheme(localStorage))).observe(document.documentElement,{attributes:true,attributeFilter:['data-lt-theme']});
// 2026-11-05: 공통 헤더가 워드마크·둘러보기·로그인을 맡으므로 첫 화면 안의 것은 숨기고, 고유 버튼(움직임 멈춤·순간 목록)은 다른 화면의 도구 줄과 같은 자리(오른쪽 위)에 둔다.
const identity=document.createElement('style');
identity.textContent=`:host{--ui:'Pretendard Variable',Pretendard,system-ui,sans-serif}.app{font-family:var(--ui)}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:13px}.menuBtn{font-size:14px}.topbar .brand{display:none}.topbar{justify-content:flex-end;padding:12px 28px}.top-actions>.home-community,.top-actions>[data-home-account]{display:none}`;
shadow.append(identity);
// 2026-11-08 #213 2번: 도구 줄 버튼은 둘(보기·순간 목록)이고, 시각 높이 36·누르는 영역 44로 맞춘다.
const cardUI=document.createElement('style');
cardUI.textContent=`.top-actions>.menuBtn{position:relative;min-height:44px;display:inline-flex;align-items:center;padding-block:0}.top-actions>.menuBtn:after{content:'';position:absolute;inset:0;border-radius:999px}[data-home-account],.home-community{display:none}`;
shadow.append(cardUI);
// #380(2026-11-11): 로그인 전 [＋ 첫 순간 추가·둘러보기·어떻게 쓰나요] / 로그인 후 [＋ 순간 추가·둘러보기](#426: 세 번째 자리는 숨김, 최근 순간 카드가 "이어 보기"를 대신).
// 로그인 전이면 지금 두 줄 그대로, 로그인 후면 상태에 따라 큰 제목 아래 둘째 줄도 함께 갱신한다(아래 상태 블록).
const centerButtons=[...shadow.querySelectorAll('.center .actions button')];
const centerPlan=applyHomeCenter(centerButtons,presentation.centerState);
const byDo=name=>centerButtons.find(b=>b.dataset.do===name);
// 보이는 버튼 수를 표시한다(위 버튼 폭 규칙이 쓴다). 로그인 세트는 390에서도 한 줄(data-inline — 옛 세로 쌓기는 로그아웃만).
const actionsRow=shadow.querySelector('.center .actions');
actionsRow?.setAttribute('data-count',String(centerButtons.filter(b=>!b.hidden&&b.style.display!=='none').length));
if(loggedIn)actionsRow?.setAttribute('data-inline','');
// '순간 목록' → 궤도의 목록 창(전체). 둘러보기 → 기존 community. '어떻게 쓰나요'(#635)는 같은 첫 화면의 안내 패널(orbit-dialog·showModal 틀)을 연다.
const momentsButton=byDo('moments');if(momentsButton)momentsButton.onclick=()=>orbit?.index?.('all');
const communityButton=byDo('community');if(communityButton)communityButton.onclick=()=>bridge.actions.community();
const guideButton=byDo('guide');if(guideButton)guideButton.onclick=openGuide;
// 2026-11-14 대표 결정: 로그인한 첫 화면 셋째 단추 '내 트리'는 내 트리 목록(책장)으로 간다.
const treesButton=byDo('trees');if(treesButton)treesButton.onclick=()=>bridge.actions.navigate('trees');
// #635: '어떻게 쓰나요' 안내 패널 — 기존 패널 틀(orbit-dialog·showModal·닫기 단추·포커스 되돌리기)을 그대로 쓴다.
// 새 화면·새 경로는 만들지 않는다. 궤도는 창이 열려 있는 동안 멈춘다(orbit.js의 dialog 규칙과 같다).
let motionPaused=false;
const guideDialog=document.createElement('dialog');
guideDialog.className='orbit-dialog';
/* #635 PR B: guideStyle의 모든 규칙은 #guidePanel로 적힌다 — id가 없으면 패딩·테마 규칙이 통째로 무시됐다(내용이 테두리에 붙은 원인). */
guideDialog.id='guidePanel';
guideDialog.setAttribute('aria-label','어떻게 쓰나요');
/* 단추는 오른쪽 아래로 모으고(justify-content:flex-end), 주 단추('첫 순간 추가')를 오른쪽 끝에 둔다 — 탭 순서도 보이는 순서와 같게 DOM 순서를 바꾼다. */
guideDialog.innerHTML=`<button class="close" data-do="guide-close" aria-label="안내 닫기">닫기 ×</button><div class="guide-body"><h2 tabindex="-1">어떻게 쓰나요</h2><ol class="guide-list"><li>좋아하는 영상 링크를 붙여 넣으면 순간이 바로 담겨요</li><li>순간들은 트리로 묶여요(그룹·주제별로 여러 개)</li><li>책·보드·지도로 내 기록을 다시 봐요</li><li>순간이 3개 이상이면 둘러보기에서 다른 팬도 볼 수 있어요(이름·아이디는 보이지 않아요)</li></ol><div class="detail-buttons"><button data-do="guide-community">둘러보기</button><button class="primary-cta" data-do="guide-new">첫 순간 추가</button></div><div class="guide-policy"><a href="https://auth.padiem.net/privacy#lovetree" target="_blank" rel="noopener">개인정보 처리방침</a><a href="https://auth.padiem.net/terms" target="_blank" rel="noopener">이용약관</a></div></div></div>`;
shadow.append(guideDialog);
const guideStyle=document.createElement('style');
guideStyle.textContent=`#guidePanel{word-break:keep-all}#guidePanel .guide-body{padding:42px;max-width:620px;margin:0 auto}#guidePanel h2{margin:0 0 18px;font-size:26px;outline:none;width:fit-content;max-width:100%}/* #662: 제목 상자가 창 폭을 통째로 차지해 닫기 단추 영역과 포개졌다 — 글자 폭만큼만. */.guide-list{margin:0;padding:0;list-style:none;counter-reset:guide;display:grid;gap:12px}.guide-list li{counter-increment:guide;display:flex;gap:12px;align-items:baseline;font-size:15px;line-height:1.7;color:#d9d2e2}.guide-list li::before{content:counter(guide);flex:0 0 auto;min-width:26px;min-height:26px;display:inline-grid;place-items:center;border:1px solid #615364;border-radius:50%;color:#e8b8c9;font-size:12px}#guidePanel .detail-buttons{margin-top:24px;justify-content:flex-end}/* 처리방침·약관 링크(2026-11-16): 단추 줄 아래 작은 글씨, 새 창. 누름 영역 44px. */#guidePanel .guide-policy{margin-top:18px;display:flex;gap:16px;justify-content:center}#guidePanel .guide-policy a{min-height:44px;display:inline-flex;align-items:center;font-size:14px;letter-spacing:.04em;color:#a99fb5;text-decoration:underline;text-underline-offset:3px}:host([data-lt-theme=garden]) #guidePanel .guide-policy a{color:var(--lt-muted)}:host([data-lt-theme=garden]) #guidePanel{background:var(--lt-paper);color:var(--lt-ink);border-color:var(--lt-line)}:host([data-lt-theme=garden]) #guidePanel h2{color:var(--lt-ink)}:host([data-lt-theme=garden]) .guide-list li{color:var(--lt-muted)}:host([data-lt-theme=garden]) .guide-list li::before{border-color:var(--lt-gold-line);color:var(--lt-gold-ink)}:host([data-lt-theme=garden]) #guidePanel .detail-buttons button{background:var(--lt-paper);color:var(--lt-ink);border-color:var(--lt-line)}:host([data-lt-theme=garden]) #guidePanel .primary-cta{background:var(--lt-primary);color:var(--lt-primary-ink);border-color:var(--lt-primary)}:host([data-lt-theme=garden]) #guidePanel .close{background:var(--lt-paper);color:var(--lt-ink);border-color:var(--lt-line)}`;
shadow.append(guideStyle);
let guideOpener=null;
function openGuide(){
 guideOpener=shadow.activeElement;
 guideDialog.showModal();
 orbit?.motion?.set?.(true);
 /* #635 PR B: 처음 포커스는 닫기 단추가 아니라 패널 제목으로 둔다 — 닫기에 프로그램 포커스가 가면
    마우스·터치로 열어도 두꺼운 포커스 테두리가 바로 보였다. 제목(tabindex=-1)은 테두리가 없고,
    단추들의 포커스 테두리는 이미 :focus-visible 규칙이라 키보드로 탐색할 때만 보인다. */
 guideDialog.querySelector('h2')?.focus();
}
guideDialog.addEventListener('close',()=>{guideOpener?.focus?.();orbit?.motion?.set?.(motionPaused);});
guideDialog.addEventListener('click',e=>{
 if(e.target===guideDialog){guideDialog.close();return;}/* 바깥 누르면 닫는다(공통 틀) */
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.do==='guide-close')guideDialog.close();
 else if(b.dataset.do==='guide-new'){guideDialog.close();bridge.actions.start();}/* 로그아웃 첫 단추와 같은 동작 */
 else if(b.dataset.do==='guide-community'){guideDialog.close();bridge.actions.community();}
});
// #481 L10: lt41-login-focus는 보내는 쪽이 없는 고아 수신기였다(셸에 postMessage 없음) —
// 그 수신기와, 그 수신기만 쓰던 loginFocusButton 추적을 함께 지운다.
// 로그아웃 첫 버튼은 로그인/가입으로.
{
  const first=centerButtons[0];
  if(presentation.centerState.member==='out')first.onclick=bridge.actions.start;
}
// 예시 모드는 궤도의 기존 안내를 그대로 두고, 나머지는 계획의 문구를 쓴다(빈 문자열이면 숨김).
if(cardsPlan.note!==null)shadow.querySelector('.center-note').textContent=cardsPlan.note;
// 2026-11-08 접근성: 카드 출처 안내가 바뀌면 화면 낭독기가 알린다.
shadow.querySelector('.center-note')?.setAttribute('aria-live','polite');
shadow.querySelector('.center-note')?.setAttribute('role','status');
// 261116 PR 2(대표 확정): 큰 제목 아래 둘째 줄 안내(옛 정리 알림·첫 순간 안내)는 치웠다 —
// 그 자리(글귀 바로 아래)에 '+ 순간 추가' 단추(밝은 채움)가 온다. 로그인 상태만 — 로그아웃은 지금처럼 둔다.
if(loggedIn){
 const quote=shadow.querySelector('.center > p:not(.center-note)');
 const addTop=document.createElement('button');
 addTop.type='button';addTop.className='subtleBtn primary-cta home-add-top';
 addTop.textContent='＋ 순간 추가';
 addTop.onclick=()=>bridge.actions.requestMoment('add');
 quote?.after(addTop);
}
// ── 261116 PR 2: 카드 모드 저장·머리글 메뉴·가운데 카드 아래 정보 줄 ─────────────────────
const isPinnedMoment=c=>!!c&&homeMomentValue.mode==='pin'&&homeMomentValue.momentId===c.id&&homeMomentValue.treeId===c.treeId;
const setHomeMoment=next=>{
 homeMomentValue=normalizeHomeMoment(next);
 try{localStorage.setItem(HOME_MOMENT_KEY,JSON.stringify(homeMomentValue))}catch{}
 // 계정 설정(이미 있는 저장 길)에 저장한다 — 셸이 setPrefs로 계정 기록에 반영한다.
 try{parent.postMessage({type:'lt41-home-moment',value:homeMomentValue},location.origin)}catch{}
 const picked=homeMomentPick(momentList?.entries,homeMomentValue,{day:homeMomentDay,trees:momentList?.trees||[]});
 orbit?.recent?.set(picked.moment,picked.header);
 closeRecentMenu();
};
let recentMenu=null,recentMenuOpener=null;
function closeRecentMenu(){recentMenu?.remove();recentMenu=null;if(recentMenuOpener){recentMenuOpener.setAttribute('aria-expanded','false');recentMenuOpener=null;}}
function openRecentMenu(button){
 closeRecentMenu();
 recentMenuOpener=button;button.setAttribute('aria-expanded','true');
 recentMenu=document.createElement('div');recentMenu.className='recent-menu';recentMenu.setAttribute('role','menu');recentMenu.setAttribute('aria-label','첫 화면 카드 고르기');
 for(const item of homeMomentMenu(homeMomentValue,{trees:momentList?.trees||[]})){
  const head=document.createElement('button');head.type='button';head.setAttribute('role','menuitemradio');
  head.setAttribute('aria-checked',String(homeMomentValue.mode===item.mode));head.textContent=item.label;
  if(item.mode!=='tree')head.dataset.mode=item.mode;
  if(item.disabled)head.disabled=true;
  head.onclick=()=>{closeRecentMenu();if(item.disabled||item.mode==='tree')return;setHomeMoment({mode:item.mode,momentId:item.mode==='pin'?homeMomentValue.momentId:'',treeId:item.mode==='pin'?homeMomentValue.treeId:''});};
  recentMenu.append(head);
  if(item.mode==='tree'){for(const tree of item.trees){
   const tb=document.createElement('button');tb.type='button';tb.className='recent-menu-sub';tb.setAttribute('role','menuitemradio');
   tb.setAttribute('aria-checked',String(homeMomentValue.mode==='tree'&&homeMomentValue.treeId===tree.id));tb.textContent=tree.label;
   tb.onclick=()=>{closeRecentMenu();setHomeMoment({mode:'tree',treeId:tree.id});};
   recentMenu.append(tb);
  }}
 }
 shadow.append(recentMenu);
 // 카드 위 작은 목록 — 261117 대표 검수: 머리글 바로 위(카드 위쪽 가장자리에 붙여)로 열고,
 // 화면 위로 넘치면 아래로 연다. 좌우는 화면 안으로만 잡는다.
 const card=shadow.querySelector('.recent-card'),rect=card?.getBoundingClientRect(),menu=recentMenu.getBoundingClientRect();
 if(rect&&menu){
  const width=Math.ceil(menu.width),height=Math.ceil(menu.height);
  let left=Math.round(rect.left+rect.width/2-width/2),top=Math.round(rect.top-height);
  if(top<8)top=Math.round(rect.bottom+6);
  if(top+height>document.documentElement.clientHeight-8)top=Math.max(8,Math.round(document.documentElement.clientHeight-height-8));
  if(top<8)top=8;
  left=Math.max(8,Math.min(left,document.documentElement.clientWidth-width-8));
  recentMenu.style.left=`${left}px`;recentMenu.style.top=`${top}px`;
 }
 const first=recentMenu.querySelector('button:not([disabled])');first?.focus();
}
shadow.addEventListener('click',event=>{
 const head=event.target.closest?.('[data-recent-head]');
 if(head){if(recentMenu)closeRecentMenu();else openRecentMenu(head);return;}
 if(recentMenu&&!event.target.closest?.('.recent-menu'))closeRecentMenu();
});
shadow.addEventListener('keydown',event=>{if(event.key==='Escape'&&recentMenu){event.stopPropagation();const opener=recentMenuOpener;closeRecentMenu();opener?.focus();}},true);
// 가운데 카드 아래 정보 줄 — 줄마다 이름 왼쪽·값 오른쪽 끝. 모아둔·전체·둘러보기·내 트리의 숫자는 한 벌(formatCount).
function infoLine({label,value,gold=false,dim=false,ellipsis=false}){
 const node=document.createElement(dim?'span':'button');
 if(node.tagName==='BUTTON')node.type='button';
 node.className='home-info-line'+(gold?' gold':'')+(dim?' dim':'');
 const k=document.createElement('span');k.className='home-info-k';k.textContent=label;
 const v=document.createElement('span');v.className='home-info-v'+(ellipsis?' ellipsis':'');v.textContent=value;
 node.append(k,v);
 return node;
}
const infoRow=document.createElement('div');infoRow.className='home-info';infoRow.dataset.ltKeepClear='';
// 숫자판은 내 기록의 숫자만 둔다(261118 도현 의견 1-2). 전에는 둘러보기 공개 집계('순간 117'·'트리 9')가
// 늘 함께 붙어 '트리 0'(내 트리)과 '트리 9'(공개 트리 수)이 같은 라벨으로 나란히 보였고, '순간 117'은
// 남의 것까지 센 수인데 내 숫자로 읽혔다. 로그인은 내 것만 남긴다(모아둔 N·전체 N·트리 N·최근 —
// 둘러보기 입구는 바로 위 '둘러보기' 단추에 있다). 로그아웃은 내 숫자가 없으니 0 두 줄 대신
// 둘러보기 공개 집계만 '예시' 표시로 남긴다(카드와 같은 '감상 예시' 자리라는 뜻을 숫자에도 붙인다).
// 순간 목록 칸 — '모아둔 37'(금빛, 누르면 모아둔 정리 창) / '전체 42'(누르면 전체 목록). 모아둔 0이면 그 줄 흐리게(누를 수 없음).
const inboxTree=(Array.isArray(context.trees)?context.trees:[]).find(t=>t?.inbox===true);
const inboxCount=Array.isArray(inboxTree?.moments)?inboxTree.moments.length:0;
const totalCount=Array.isArray(momentList?.entries)?momentList.entries.length:0;
const cellMoments=document.createElement('div');cellMoments.className='home-info-cell';cellMoments.dataset.cell='moments';
const inboxLine=infoLine({label:'모아둔',value:formatCount(inboxCount),gold:true,dim:inboxCount===0});
// 첫 화면 모아둔 순간 숫자 칸(261117 고객 의견): 누르면 정리 창(lt41-cleanup → 셸 openCleanup)을 연다. N=0이면 숫자만 둔다.
inboxLine.setAttribute('aria-label',`모아둔 순간 ${inboxCount}개 정리하기`);
if(inboxCount>0)inboxLine.onclick=()=>bridge.actions.cleanup();
else inboxLine.setAttribute('aria-disabled','true');
const allLine=infoLine({label:'전체',value:formatCount(totalCount),dim:totalCount===0});
if(totalCount>0)allLine.onclick=()=>orbit?.index?.('all');
cellMoments.append(inboxLine,allLine);
if(loggedIn)infoRow.append(cellMoments);
// 둘러보기 칸(로그아웃만) — 로그인 없이 보이는 공개 집계(1분 캐시). 내 기록이 아니라는 뜻을 '예시'로 표시한다.
if(!loggedIn){
 const cellCommunity=document.createElement('div');cellCommunity.className='home-info-cell';cellCommunity.dataset.cell='community';
 const communityLine=label=>{const line=infoLine({label,value:'…'});line.dataset.community=label;line.onclick=()=>bridge.actions.community();return line;};
 const communityLines={moments:communityLine('예시 순간'),trees:communityLine('예시 트리')};
 cellCommunity.append(communityLines.moments,communityLines.trees);
 infoRow.append(cellCommunity);
 (async()=>{const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),8000);try{
  const answer=await fetch('/api/community/stats',{headers:{accept:'application/json'},signal:ctrl.signal});
  if(!answer.ok)throw Error('stats unavailable');
  const stats=await answer.json();
  communityLines.moments.querySelector('.home-info-v').textContent=formatCount(stats?.moments);
  communityLines.moments.setAttribute('aria-label',`둘러보기 공개 순간 ${formatCount(stats?.moments)}개 — 내 기록이 아니에요`);
  communityLines.trees.querySelector('.home-info-v').textContent=formatCount(stats?.trees);
  communityLines.trees.setAttribute('aria-label',`둘러보기 공개 트리 ${formatCount(stats?.trees)}개 — 내 기록이 아니에요`);
 }catch{ // 집계를 못 가져오거나 8초를 넘기면 칸은 그대로 두고 값만 '–'로 바꾼다(한 줄 배치가 틀어지지 않게).
  // '…'가 계속 남지 않게 하고, 화면 낭독기에는 '불러오지 못했어요'로 읽힌다(#780 후속).
  for(const line of [communityLines.moments,communityLines.trees]){const v=line.querySelector('.home-info-v');if(v){v.textContent='–';v.setAttribute('aria-label','불러오지 못했어요');}}
 }finally{clearTimeout(timer);}})();
}
// 내 트리 칸(로그인) — '트리 N' / '최근 <트리 이름>'(마지막으로 순간을 넣은 트리, 누르면 그 트리로; 길면 칸 폭에서 '…').
if(loggedIn){
 const cellTrees=document.createElement('div');cellTrees.className='home-info-cell';cellTrees.dataset.cell='trees';
 const myTreeCount=(Array.isArray(momentList?.trees)?momentList.trees:[]).length;
 const treesLine=infoLine({label:'트리',value:formatCount(myTreeCount),dim:myTreeCount===0});
 if(myTreeCount>0)treesLine.onclick=()=>bridge.actions.navigate('trees');
 const recentTree=(Array.isArray(momentList?.entries)?momentList.entries:[])[0]||null;
 const recentLine=recentTree?infoLine({label:'최근',value:recentTree.treeLabel||'내 트리',ellipsis:true}):infoLine({label:'최근',value:'—',dim:true});
 if(recentTree)recentLine.onclick=()=>bridge.actions.openMine(recentTree.treeId,recentTree.id);
 cellTrees.append(treesLine,recentLine);
 infoRow.append(cellTrees);
}
actionsRow?.after(infoRow);
// 261116 PR 2 모양: 정보 줄·머리글 메뉴. 색은 identity.css의 --lt-* 토큰만(정원은 종이 위 글자 — gold-ink·muted).
const infoStyle=document.createElement('style');
// 261118 대표 지적(이슈 #942·#949): 숫자판은 두 줄 — '모아둔 N · 전체 N' / '트리 N · 최근 이름'. 1440·390 같게.
// 칸(div)이 한 줄을 맡고, 줄 사이의 '·'는 꾸밈(화면 낭독기 이름에 들지 않는다). 로그아웃은 '예시' 두 줄을 유지한다.
infoStyle.textContent=`.home-add-top{margin-top:12px;font-size:15px}@media(max-width:650px){.home-add-top{font-size:14px}}.center .actions[data-inline]{flex-direction:row;align-items:stretch}.center .actions[data-inline] .subtleBtn{flex:1 1 0%;width:auto;max-width:176px}.home-info{display:grid;grid-template-columns:1fr;justify-items:center;gap:2px;margin:12px auto 0;width:100%;max-width:640px}.home-info-cell{display:flex;justify-content:center;align-items:center;gap:0}.home-info-line{pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 10px;border:0;background:none;cursor:pointer;font:inherit;font-size:12px;line-height:1.4;color:#d4cee0;min-width:0}span.home-info-line{cursor:default}.home-info-line:not(:first-child)::before{content:'·';margin:0 10px;opacity:.55;font-weight:600}.home-info-line.gold{color:var(--lt-gold,#ffe6a6)}.home-info-line.dim{color:var(--lt-muted,#9b98a6)}.home-info-k{flex:none}.home-info-v{font-variant-numeric:tabular-nums;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.home-info-v.ellipsis{max-width:132px}.home-info-line:focus-visible{outline:2px solid #e8b8c9;outline-offset:1px;border-radius:8px}:host([data-lt-theme=garden]) .home-info-line{color:var(--lt-muted)}:host([data-lt-theme=garden]) .home-info-line.gold{color:var(--lt-gold-ink)}:host([data-lt-theme=garden]) .home-info-line.dim{opacity:.72}.recent-menu{position:fixed;z-index:4000;min-width:220px;max-width:min(300px,86vw);max-height:min(60dvh,420px);overflow:auto;padding:6px;border:1px solid var(--lt-line,rgba(255,255,255,.14));border-radius:14px;background:#07070c;box-shadow:0 18px 44px rgba(0,0,0,.5)}.recent-menu button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;padding:0 12px;border:0;border-radius:8px;background:none;cursor:pointer;font:inherit;font-size:13px;color:#e6ddef;text-align:left}.recent-menu button[aria-checked="true"]{color:var(--lt-gold,#ffe6a6)}.recent-menu button[disabled]{color:var(--lt-muted,#9b98a6);cursor:default}.recent-menu button:focus-visible{outline:2px solid #e8b8c9;outline-offset:-2px}.recent-menu .recent-menu-sub{padding-left:22px;font-size:12px;color:#cfc6dd}:host([data-lt-theme=garden]) .recent-menu{background:var(--lt-paper,#f7f0e8);border-color:var(--lt-line-paper)}:host([data-lt-theme=garden]) .recent-menu button{color:var(--lt-ink)}:host([data-lt-theme=garden]) .recent-menu button[aria-checked="true"]{color:var(--lt-gold-ink)}:host([data-lt-theme=garden]) .recent-menu button[disabled],:host([data-lt-theme=garden]) .recent-menu .recent-menu-sub{color:var(--lt-muted)}@media(max-width:650px){.home-info{max-width:none;padding:0 6px}.home-info-line{padding:0 8px}}`;
shadow.append(infoStyle);
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:768px){.topbar{gap:12px;flex-wrap:wrap;align-items:center;padding:8px 12px}.top-actions{gap:6px;flex-shrink:0;flex-wrap:wrap;margin-left:auto}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:14px}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:14px}.hint{font-size:14px}}';shadow.append(mobileFit);
// #380 5번: 첫 화면 오른쪽 위 "보기 ▾" 메뉴(테마·움직임·카드 출처)는 없앴다.
// 로그인 상태의 같은 항목은 설정 창(셸)의 '화면' 묶음에 있고, 셸이 아래 두 메시지로 알려 준다.
// 로그아웃에는 설정 입구가 없으므로 테마만 오른쪽 위 작은 ◐ 단추로 남긴다(저장 키 lt41.theme 그대로).
addEventListener('message',event=>{
 if(event.origin!==location.origin)return;
 const type=event.data?.type;
 if(type==='lt41-motion'){motionPaused=!!event.data.paused;orbit?.motion?.set?.(motionPaused);}
 else if(type==='lt41-home-cards'){location.reload();}
 // #481: 제목 보기도 궤도가 그릴 때 값을 박아 두므로(orbit의 titleMode) 바뀌면 다시 떠야 한다.
 // 날짜 표기와 같은 판정 — 지금 그린 값과 다르고, 기기 미러가 이미 그 값일 때만(다시 뜨면 새 값으로 그려진다).
 else if(type==='lt41-title-display'){
  let titleMirror=null;try{titleMirror=localStorage.getItem('lt41.titleDisplay');}catch{}
  if(shouldReloadForTitleDisplay({value:event.data.value,rendered:renderedTitleDisplay,mirror:titleMirror}))location.reload();
 }
 // #441 후속: 날짜 표기도 책·보드·지도처럼 열린 채 바로 반영한다(궤도는 셸 iframe이라 다시 그려야 한다).
 // 셸은 프레임이 뜰 때마다 같은 값을 보내므로, 값이 실제로 바뀌었을 때만 다시 띄운다(shouldReloadForDateStyle).
 else if(type==='lt41-date-style'){
  let mirror=null;try{mirror=localStorage.getItem('lt41.dateStyle');}catch{}
  if(shouldReloadForDateStyle({value:event.data.value,rendered:renderedDateStyle,mirror}))location.reload();
 }
 // 2026-11-16 계정 메뉴 정리: 셸 계정 메뉴의 '어떻게 쓰나요'가 이 메시지로 같은 안내 패널을 연다.
 // 이미 열려 있을 때 showModal을 다시 부르면 InvalidStateError가 나므로 열려 있으면 무시한다.
 else if(type==='lt41-open-guide'){if(!guideDialog.open)openGuide();}
});
// #776 규칙: 테마는 머리줄 #theme-toggle 하나로 통일 — 첫 화면 ◐ 빠른 단추는 두지 않는다.
// 로그아웃은 내 순간이 없으므로 '순간 목록' 입구도 두지 않는다(예시 카드는 '감상 예시' 안내 그대로).
if(!loggedIn)shadow.querySelector('[data-do="index"]')?.remove();
// 2026-11-08 #213 2번: 도구 줄 버튼은 "보기"·"순간 목록" 둘만 남긴다. 공통 헤더가 이미 둘러보기·로그인을 맡으므로
// 첫 화면 안의 중복 버튼은 만들지 않고, 궤도가 넣어 둔 계정 자리도 지운다(화면 낭독기 순서에서도 사라진다).
shadow.querySelector('[data-home-account]')?.remove();
shadow.querySelectorAll('.firstMark').forEach(e=>e.textContent='첫 순간');
const dialog=shadow.querySelector('dialog');
const labels=new MutationObserver(()=>{const b=dialog.querySelector('[data-do=book]');if(b&&b.textContent!=='책 열기')b.textContent='책 열기';});
labels.observe(dialog,{childList:true,subtree:true});
addEventListener('pagehide',()=>labels.disconnect(),{once:true});
addEventListener('pagehide',()=>orbit(),{once:true});
