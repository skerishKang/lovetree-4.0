import '../src/styles.css';
import {mountOrbit,ORBIT_EXAMPLE} from '../src/views/orbit.js';
import {homeCardsPlan,readHomeCardsMode} from './home-cards.js';
import {HOME_ORBIT_LIMIT, ltDateStyle} from './home-moments.js';
import {fetchPopularCards} from './home-popular.js';
import {createHomeActions} from './home-actions.js';
import {homePresentation} from './home-presentation.js';
import {applyHomeCenter} from './home-center.js';
import {readTheme,writeTheme,appliedTheme,applyThemeAttribute} from '../public/v41/header-state.mjs';
import {readTitleDisplay} from '../public/v41/book-usability.mjs';
import {momentListEntries, momentListTrees} from './moment-list.js';
const shellBody=parent.document.body;
addEventListener('message',event=>{if(event.data?.type==='lt41-title-display')location.reload();});
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
const momentsRequest=parent.LT41_MOMENTS_OPEN??null;
const momentList=loggedIn?{
 trees:momentListTrees(context.trees),
 entries:momentListEntries({trees:context.trees,youtube}),
 initialTreeId:momentsRequest?.treeId||'all',
 initialOpen:!!momentsRequest
}:null;
 const orbit=mountOrbit(document.getElementById('orbit'),{
 trees:cardTrees,examples:cardsPlan.examples?ORBIT_EXAMPLE.moments.slice(0,cardsPlan.examples):[],
 // 내 것만 0장은 예시로 대체하지 않고 빈 궤도와 첫 순간 안내를 남긴다.
 empty:cardsPlan.kind==='mine-empty',
 momentList,
 titleDisplay:readTitleDisplay(parent.LT41),
 dateStyle:ltDateStyle(),
 onOpen:card=>{if(card.source==='public'){parent.location.hash=`#share/${card.shareId}/${card.view||'book'}`;return;}bridge.actions.openMine(card.treeId,card.id);},
 storage:{getItem:()=>null,setItem:()=>{}},context:{...presentation.context,readOnly:cardsPlan.kind==='example'},
 authHtml:`<button class="menuBtn auth-entry" data-home-account>${presentation.accountLabel}</button>`,actions:bridge.actions
});
// #394: 순간 목록 열기 요청을 받았다고 셸에 알린다 — 셸은 요청 플래그를 치워 다음 화면 이동에 되풀이하지 않게 한다.
if(momentsRequest){try{parent.postMessage({type:'lt41-moments-opened'},location.origin)}catch{}}
const shadow=document.getElementById('orbit').shadowRoot;
// #380(2026-11-11): 가운데 세 버튼 — 자리·개수 그대로, 남은 폭을 똑같이 나눠 세 폭 동일(가장 긴 글자 기준 고정), 로그인 후 상태 한 줄.
const centerStyle=document.createElement('style');
centerStyle.textContent='.center .actions .subtleBtn{flex:1 1 0%;min-width:0;overflow-wrap:anywhere;text-align:center;line-height:1.15}.center > p:not(.center-note){min-height:2lh}@media (max-width:480px){.center .actions{flex-direction:column;align-items:stretch}.center .actions .subtleBtn{width:100%}}';
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
identity.textContent=`:host{--ui:'Pretendard Variable',Pretendard,system-ui,sans-serif}.app{font-family:var(--ui)}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:12px}.menuBtn{font-size:14px}.topbar .brand{display:none}.topbar{justify-content:flex-end;padding:12px 28px}.top-actions>.home-community,.top-actions>[data-home-account]{display:none}`;
shadow.append(identity);
// 2026-11-08 #213 2번: 도구 줄 버튼은 둘(보기·순간 목록)이고, 시각 높이 36·누르는 영역 44로 맞춘다.
const cardUI=document.createElement('style');
cardUI.textContent=`.top-actions>.menuBtn{position:relative;height:36px;min-height:36px;display:inline-flex;align-items:center;padding-block:0}.top-actions>.menuBtn:after{content:'';position:absolute;inset:-4px;border-radius:999px}[data-home-account],.home-community{display:none}`;
shadow.append(cardUI);
// #380(2026-11-11): 로그인 전 [＋ 첫 순간 남기기·둘러보기·어떻게 쓰나요] / 로그인 후 [＋ 순간 추가·둘러보기](#426: 세 번째 자리는 숨김, 최근 순간 카드가 "이어 보기"를 대신).
// 로그인 전이면 지금 두 줄 그대로, 로그인 후면 상태에 따라 큰 제목 아래 둘째 줄도 함께 갱신한다(아래 상태 블록).
const centerButtons=[...shadow.querySelectorAll('.center .actions button')];
const centerPlan=applyHomeCenter(centerButtons,presentation.centerState);
const byDo=name=>centerButtons.find(b=>b.dataset.do===name);
// '＋ 순간 추가' → 기존 add 흐름(requestMoment add), 둘러보기/어떻게 쓰나요 → 기존 community(둘러보기와 동일 — 별도 사용법 안내 없음).
const addButton=byDo('add');if(addButton)addButton.onclick=()=>bridge.actions.requestMoment('add');
const communityButton=byDo('community');if(communityButton)communityButton.onclick=()=>bridge.actions.community();
const guideButton=byDo('guide');if(guideButton)guideButton.onclick=()=>bridge.actions.community();
let loginFocusButton=null;
centerButtons.forEach(b=>{b.addEventListener('pointerdown',()=>{loginFocusButton=b;});b.addEventListener('click',()=>{loginFocusButton=b;},true);b.addEventListener('focus',()=>{loginFocusButton=b;});});
addEventListener('message',e=>{if(e.origin!==location.origin)return;if(e.data?.type==='lt41-login-focus'){const active=shadow.activeElement;if(active?.matches?.('button'))active.focus();else loginFocusButton?.focus();}});
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
// #380(2026-11-11): 로그인 후 큰 제목 아래 설명 둘째 줄 = 상태(높이 두 줄 고정): 정리 알림 > 첫 순간 안내. 로그인 전 문구는 그대로 둔다.
// #426(2026-11-12): 마지막 순간 안내는 최근 순간 카드가 대신 보여 준다(둘째 줄에서 뺐다).
if(loggedIn){
  const target=shadow.querySelector('.center > p:not(.center-note)');
  if(target){
    let label=null;
    if(context.tree?.inbox===true){
      const n=(context.tree.moments||[]).length;
      // #380 5번: 정리하기 입구는 트리 ▾ 드롭다운 한 곳만 — 첫 화면은 몇 개인지만 알린다.
      if(n>0){label=`정리 안 된 순간 ${n}개`;}
    }
    if(label===null){
      // #426(2026-11-12): 순간이 하나라도 있으면 최근 순간 카드가 이어 보기를 대신한다 — 둘째 줄은 안내 한 줄만.
      const hasAnyMoment=(Array.isArray(context.trees)?context.trees:[]).some(t=>Array.isArray(t?.moments)&&t.moments.length>0);
      if(!hasAnyMoment)label='첫 순간을 남기면 여기서 이어 볼 수 있어요';
    }
    target.textContent='';
    target.append('기억은 아직 여기에서 이어지고 있어요.');
    // #426: 순간이 있으면 둘째 줄은 안내 한 줄만(카드가 마지막 순간을 대신 보여 준다).
    if(label){
      target.append(document.createElement('br'));
      target.append(label);
    }
  }
}
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:768px){.topbar{gap:12px;flex-wrap:wrap;align-items:center;padding:8px 12px}.top-actions{gap:6px;flex-shrink:0;flex-wrap:wrap;margin-left:auto}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:14px}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:14px}.hint{font-size:14px}}';shadow.append(mobileFit);
// #380 5번: 첫 화면 오른쪽 위 "보기 ▾" 메뉴(테마·움직임·카드 출처)는 없앴다.
// 로그인 상태의 같은 항목은 설정 창(셸)의 '화면' 묶음에 있고, 셸이 아래 두 메시지로 알려 준다.
// 로그아웃에는 설정 입구가 없으므로 테마만 오른쪽 위 작은 ◐ 단추로 남긴다(저장 키 lt41.theme 그대로).
addEventListener('message',event=>{
 if(event.origin!==location.origin)return;
 const type=event.data?.type;
 if(type==='lt41-motion'){orbit?.motion?.set?.(!!event.data.paused);}
 else if(type==='lt41-home-cards'){location.reload();}
 // #441 후속: 날짜 표기도 책·보드·지도처럼 열린 채 바로 반영한다(궤도는 셸 iframe이라 다시 그려야 한다).
 else if(type==='lt41-date-style'){location.reload();}
});
if(!loggedIn){
 const topActions=shadow.querySelector('.top-actions');
 if(topActions){
  const quick=document.createElement('button');
  quick.type='button';
  quick.className='menuBtn theme-quick';
  quick.setAttribute('data-theme-quick','');
  const paint=()=>{
   const now=readTheme(localStorage);
   quick.textContent='◐';
   const label=now==='garden'?'화면 테마 바꾸기: 지금 정원, 누르면 밤':'화면 테마 바꾸기: 지금 밤, 누르면 정원';
   quick.setAttribute('aria-label',label);
   quick.title=label;
  };
  quick.onclick=()=>{
   const next=writeTheme(localStorage,readTheme(localStorage)==='garden'?'night':'garden');
   applyTheme(next);
   paint();
   parent.postMessage({type:'lt41-theme',theme:next},location.origin);
  };
  paint();
  topActions.append(quick);
 }
}
// 2026-11-08 #213 2번: 도구 줄 버튼은 "보기"·"순간 목록" 둘만 남긴다. 공통 헤더가 이미 둘러보기·로그인을 맡으므로
// 첫 화면 안의 중복 버튼은 만들지 않고, 궤도가 넣어 둔 계정 자리도 지운다(화면 낭독기 순서에서도 사라진다).
shadow.querySelector('[data-home-account]')?.remove();
shadow.querySelectorAll('.firstMark').forEach(e=>e.textContent='첫 순간');
const dialog=shadow.querySelector('dialog');
const labels=new MutationObserver(()=>{const b=dialog.querySelector('[data-do=book]');if(b&&b.textContent!=='기억책 열기')b.textContent='기억책 열기';});
labels.observe(dialog,{childList:true,subtree:true});
addEventListener('pagehide',()=>labels.disconnect(),{once:true});
addEventListener('pagehide',()=>orbit(),{once:true});
