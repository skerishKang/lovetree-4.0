import '../src/styles.css';
import {mountOrbit,ORBIT_EXAMPLE} from '../src/views/orbit.js';
import {homeCardsPlan,readHomeCardsMode,writeHomeCardsMode,clickWithin} from './home-cards.js';
import {createViewMenu} from '../public/v41/home-view-menu.mjs';
import {HOME_ORBIT_LIMIT} from './home-moments.js';
import {fetchPopularCards} from './home-popular.js';
import {createHomeActions} from './home-actions.js';
import {homePresentation} from './home-presentation.js';
import {applyHomeCenter} from './home-center.js';
import {readTheme,writeTheme,appliedTheme,applyThemeAttribute} from '../public/v41/header-state.mjs';
import {readTitleDisplay,titleView} from '../public/v41/book-usability.mjs';
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
 const orbit=mountOrbit(document.getElementById('orbit'),{
 trees:cardTrees,examples:cardsPlan.examples?ORBIT_EXAMPLE.moments.slice(0,cardsPlan.examples):[],
 // 내 것만 0장은 예시로 대체하지 않고 빈 궤도와 첫 순간 안내를 남긴다.
 empty:cardsPlan.kind==='mine-empty',
 titleDisplay:readTitleDisplay(parent.LT41),
 onOpen:card=>{if(card.source==='public'){parent.location.hash=`#share/${card.shareId}/${card.view||'book'}`;return;}bridge.actions.openMine(card.treeId,card.id);},
 storage:{getItem:()=>null,setItem:()=>{}},context:{...presentation.context,readOnly:cardsPlan.kind==='example'},
 authHtml:`<button class="menuBtn auth-entry" data-home-account>${presentation.accountLabel}</button>`,actions:bridge.actions
});
const shadow=document.getElementById('orbit').shadowRoot;
// #380(2026-11-11): 가운데 세 버튼 — 자리·개수 그대로, 남은 폭을 똑같이 나눠 세 폭 동일(가장 긴 글자 기준 고정), 로그인 후 상태 한 줄.
const centerStyle=document.createElement('style');
centerStyle.textContent='.center .actions .subtleBtn{flex:1 1 0%;min-width:0;overflow-wrap:anywhere;text-align:center;line-height:1.15}.center > p:not(.center-note){min-height:2lh}.center > p:not(.center-note) .center-status{pointer-events:auto;cursor:pointer;text-decoration:underline;text-underline-offset:3px}@media (max-width:480px){.center .actions{flex-direction:column;align-items:stretch}.center .actions .subtleBtn{width:100%}}';
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
// 메뉴 항목은 44px 이상이고, 바깥 클릭·Esc로 닫힌다.
const cardUI=document.createElement('style');
cardUI.textContent=`.top-actions>.menuBtn,.top-actions>.view-menu-wrap>.menuBtn{position:relative;height:36px;min-height:36px;display:inline-flex;align-items:center;padding-block:0}.top-actions>.menuBtn:after,.top-actions>.view-menu-wrap>.menuBtn:after{content:'';position:absolute;inset:-4px;border-radius:999px}[data-home-account],.home-community{display:none}.view-menu-wrap{position:relative;display:inline-flex;align-items:center;min-height:44px}.view-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:4000;min-width:188px;padding:6px;border:1px solid var(--lt-line);border-radius:14px;background:var(--lt-glass-strong);box-shadow:0 14px 34px rgba(0,0,0,.45)}.view-menu[hidden]{display:none}.view-menu button{display:block;width:100%;min-height:44px;padding:8px 12px;border:0;border-radius:10px;background:transparent;color:var(--lt-pearl);font:inherit;font-size:14px;text-align:left;cursor:pointer}.view-menu button[aria-checked=true],.view-menu button:hover{box-shadow:inset 0 0 0 1px var(--lt-gold-line)}.view-menu button[aria-checked=true]{color:var(--lt-gold)}.view-menu button:focus-visible{outline:2px solid var(--lt-gold);outline-offset:-2px}.view-menu-sep{height:1px;margin:6px 4px;background:var(--lt-line)}@media(max-width:768px){.view-menu{right:auto;left:0}}`;
shadow.append(cardUI);
// #380(2026-11-11): 로그인 전 [＋ 첫 순간 남기기·둘러보기·어떻게 쓰나요] / 로그인 후 [＋ 순간 추가·이어 보던 순간·둘러보기].
// 로그인 전이면 지금 두 줄 그대로, 로그인 후면 상태에 따라 큰 제목 아래 둘째 줄도 함께 갱신한다(아래 상태 블록).
const centerButtons=[...shadow.querySelectorAll('.center .actions button')];
const centerPlan=applyHomeCenter(centerButtons,presentation.centerState);
const byDo=name=>centerButtons.find(b=>b.dataset.do===name);
// '＋ 순간 추가' → 기존 add 흐름(requestMoment add), '이어 보던 순간' → 기존 resume, 둘러보기/어떻게 쓰나요 → 기존 community(둘러보기와 동일 — 별도 사용법 안내 없음).
const addButton=byDo('add');if(addButton)addButton.onclick=()=>bridge.actions.requestMoment('add');
const resumeButton=byDo('resume');if(resumeButton)resumeButton.onclick=()=>bridge.actions.resume();
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
// #380(2026-11-11): 로그인 후 큰 제목 아래 설명 둘째 줄 = 상태(높이 두 줄 고정): 정리 알림 > 마지막 순간 > 첫 순간 안내. 로그인 전 문구는 그대로 둔다.
if(loggedIn){
  const target=shadow.querySelector('.center > p:not(.center-note)');
  if(target){
    let label=null,action=null;
    if(context.tree?.inbox===true){
      const n=(context.tree.moments||[]).length;
      if(n>0){label=`정리 안 된 순간 ${n}개 · 정리하기`;action='cleanup';}
    }
    if(label===null){
      let m=null;
      if(context.tree&&Array.isArray(context.tree.moments)){
        m=context.momentId?context.tree.moments.find(x=>x.id===context.momentId)||null:null;
        if(!m)m=[...context.tree.moments].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null;
      }
      if(!m){label='첫 순간을 남기면 여기서 이어 볼 수 있어요';}
      else{
        let title=titleView(m,readTitleDisplay(context))?.main||'';
        if(!title)title='제목 없는 순간';
        let days=null;const raw=Date.parse(m.createdAt||'');if(!Number.isNaN(raw))days=Math.max(0,Math.floor((Date.now()-raw)/86400000));
        label=`마지막 순간 「${title}」${days===null?'':` · ${days}일 전`}`;
      }
    }
    target.textContent='';
    target.append('기억은 아직 여기에서 이어지고 있어요.');
    target.append(document.createElement('br'));
    if(action==='cleanup'){
      const sp=document.createElement('span');
      sp.className='center-status';sp.setAttribute('role','button');sp.setAttribute('tabindex','0');
      sp.textContent=label;sp.title='모아둔 순간 정리 열기';
      sp.onclick=()=>bridge.actions.cleanup();
      sp.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();bridge.actions.cleanup();}};
      target.append(sp);
    }else{target.append(label);}
  }
}
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:768px){.topbar{gap:12px;flex-wrap:wrap;align-items:center;padding:8px 12px}.top-actions{gap:6px;flex-shrink:0;flex-wrap:wrap;margin-left:auto}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:14px}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:14px}.hint{font-size:14px}}';shadow.append(mobileFit);
// 2026-11-08 #213 2번: "움직임 멈춤"·"정원/밤"·"카드: ○○"를 "보기 ▾" 메뉴 하나로 묶는다.
// 항목: 움직임 켜기/멈춤 · 테마 밤/정원 · 카드 출처(로그인 4 / 로그아웃 예시·인기). 저장값과 lt41-theme 메시지는 그대로다.
// 2026-11-11 #231 후속: 위 메뉴 로직은 public/v41/home-view-menu.mjs의 createViewMenu로 옮겼다(조건·문구·id 그대로).
createViewMenu({
 document,shadow,storage:localStorage,readTheme,writeTheme,applyTheme,clickWithin,
 getCardsMode:()=>cardsPlan.mode,isLoggedIn:()=>loggedIn,getMotion:()=>orbit?.motion,
 sendTheme:theme=>parent.postMessage({type:'lt41-theme',theme},location.origin),
 writeCardsMode:writeHomeCardsMode,reload:()=>location.reload()
});
// 2026-11-08 #213 2번: 도구 줄 버튼은 "보기"·"순간 목록" 둘만 남긴다. 공통 헤더가 이미 둘러보기·로그인을 맡으므로
// 첫 화면 안의 중복 버튼은 만들지 않고, 궤도가 넣어 둔 계정 자리도 지운다(화면 낭독기 순서에서도 사라진다).
shadow.querySelector('[data-home-account]')?.remove();
shadow.querySelectorAll('.firstMark').forEach(e=>e.textContent='첫 순간');
const dialog=shadow.querySelector('dialog');
const labels=new MutationObserver(()=>{const b=dialog.querySelector('[data-do=book]');if(b&&b.textContent!=='기억책 열기')b.textContent='기억책 열기';});
labels.observe(dialog,{childList:true,subtree:true});
addEventListener('pagehide',()=>labels.disconnect(),{once:true});
addEventListener('pagehide',()=>orbit(),{once:true});
