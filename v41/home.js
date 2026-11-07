import '../src/styles.css';
import {mountOrbit,ORBIT_EXAMPLE} from '../src/views/orbit.js';
import {homeCardsPlan,readHomeCardsMode,writeHomeCardsMode,homeCardsMenu,homeCardsLabel,clickWithin} from './home-cards.js';
import {HOME_ORBIT_LIMIT} from './home-moments.js';
import {fetchPopularCards} from './home-popular.js';
import {createHomeActions} from './home-actions.js';
import {homePresentation} from './home-presentation.js';
import {applyHomeCenter} from './home-center.js';
import {readTheme,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute} from '../public/v41/header-state.mjs';
const shellBody=parent.document.body;
const context=parent.LT41||{source:shellBody.dataset.recordSource,member:shellBody.dataset.member,treeCount:Number(shellBody.dataset.treeCount||0)};
const bridge=createHomeActions({getContext:()=>parent.LT41,send:message=>parent.postMessage(message,location.origin),gallery:true});
const presentation=homePresentation(context);
const loggedIn=presentation.centerState.member==='in';
// 2026-11-08 카드 출처: 예시/인기/내 것만/섞어서. 저장값이 없으면 로그인=섞어서, 로그아웃=예시.
const mode=readHomeCardsMode(localStorage,{loggedIn});
const popular=mode==='popular'?await fetchPopularCards({limit:HOME_ORBIT_LIMIT}):[];
const cardsPlan=homeCardsPlan({mode,loggedIn,context,popular});
const cardTrees=cardsPlan.cards.length?[{id:'home-cards',title:'첫 화면 카드',moments:cardsPlan.cards}]:[];
const dispose=mountOrbit(document.getElementById('orbit'),{
 trees:cardTrees,examples:cardsPlan.examples?ORBIT_EXAMPLE.moments.slice(0,cardsPlan.examples):[],
 // 내 것만 0장은 예시로 대체하지 않고 빈 궤도와 첫 순간 안내를 남긴다.
 empty:cardsPlan.kind==='mine-empty',
 onOpen:card=>{if(card.source==='public'){parent.location.hash=`#share/${card.shareId}/${card.view||'book'}`;return;}bridge.actions.openMine(card.treeId,card.id);},
 storage:{getItem:()=>null,setItem:()=>{}},context:{...presentation.context,readOnly:cardsPlan.kind==='example'},
 authHtml:`<button class="menuBtn auth-entry" data-home-account>${presentation.accountLabel}</button>`,actions:bridge.actions
});
const shadow=document.getElementById('orbit').shadowRoot;
// 2026-11-07 테마 A/B: 첫 화면 오른쪽 위 도구 줄의 버튼 하나로 밤/정원을 바꾼다. 저장 키는 셸과 같다(lt41.theme).
// 정원 색은 public/v41/identity.css의 정원 블록에만 있고, 그 파일을 그림자 루트에도 넣어 :host 규칙을 쓴다.
const themeHost=document.getElementById('orbit');
const themeStyle=document.createElement('link');themeStyle.rel='stylesheet';themeStyle.href='/v41/identity.css';shadow.append(themeStyle);
const themeButton=document.createElement('button');themeButton.type='button';themeButton.className='menuBtn theme-toggle';themeButton.dataset.ltThemeToggle='';
function paintThemeButton(theme){themeButton.textContent=themeButtonLabel(theme);themeButton.setAttribute('aria-pressed',String(themePressed(theme)));themeButton.setAttribute('aria-label',themeButtonAriaLabel(theme));themeButton.title=themeButtonAriaLabel(theme);}
function syncTheme(theme){applyThemeAttribute(themeHost,appliedTheme(theme,'home'));paintThemeButton(theme);}
function applyTheme(theme){applyThemeAttribute(document.documentElement,appliedTheme(theme,'home'));syncTheme(theme);}
applyTheme(readTheme(localStorage));
// 셸(계정 메뉴)이 이 문서의 html에 속성을 바꾸면 그림자 루트의 호스트와 버튼 글자를 맞춘다.
new MutationObserver(()=>syncTheme(readTheme(localStorage))).observe(document.documentElement,{attributes:true,attributeFilter:['data-lt-theme']});
themeButton.onclick=()=>{const theme=writeTheme(localStorage,nextTheme(readTheme(localStorage)));applyTheme(theme);parent.postMessage({type:'lt41-theme',theme},location.origin);};
// 2026-11-05: 공통 헤더가 워드마크·둘러보기·로그인을 맡으므로 첫 화면 안의 것은 숨기고, 고유 버튼(움직임 멈춤·순간 목록)은 다른 화면의 도구 줄과 같은 자리(오른쪽 위)에 둔다.
const identity=document.createElement('style');
identity.textContent=`:host{--ui:'Pretendard Variable',Pretendard,system-ui,sans-serif}.app{font-family:var(--ui)}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:12px}.menuBtn{font-size:14px}.topbar .brand{display:none}.topbar{justify-content:flex-end;padding:12px 28px}[data-home-account],.home-community{display:none}`;
shadow.append(identity);
// 카드 출처 메뉴: 도구 줄 규칙(시각 높이 36·터치 44)을 그대로 쓰고, 항목은 44px 이상으로 둔다.
const cardUI=document.createElement('style');
cardUI.textContent=`.card-source{position:relative;display:inline-flex;align-items:center;min-height:44px}.card-source>.menuBtn{position:relative;height:36px;min-height:36px;display:inline-flex;align-items:center;padding-block:0}.card-source>.menuBtn:after{content:'';position:absolute;inset:-4px;border-radius:999px}.card-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:4000;min-width:156px;padding:6px;border:1px solid var(--lt-line);border-radius:14px;background:var(--lt-glass-strong);box-shadow:0 14px 34px rgba(0,0,0,.45)}.card-menu button{display:block;width:100%;min-height:44px;padding:8px 12px;border:0;border-radius:10px;background:transparent;color:var(--lt-pearl);font:inherit;font-size:14px;text-align:left;cursor:pointer}.card-menu button[aria-checked=true],.card-menu button:hover{box-shadow:inset 0 0 0 1px var(--lt-gold-line)}.card-menu button[aria-checked=true]{color:var(--lt-gold)}@media(max-width:768px){.card-menu{right:auto;left:0}}`;
shadow.append(cardUI);
if(presentation.canResume){
 const primary=shadow.querySelector('.primary-cta'),secondary=shadow.querySelector('.actions [data-do="continue"]');
 primary.dataset.do='member-continue';primary.textContent='이어 보던 순간';primary.onclick=bridge.actions.resume;
 secondary.dataset.do='new';secondary.textContent='새 트리 만들기';
}
shadow.querySelector('[data-do=trees]').textContent='내 책장';
// 2026-11-07 대표 지시: 세 버튼의 자리·개수는 그대로 두고 강조와 첫 버튼 문구만 상태로 바꾼다.
// 로그아웃=처음 시작하기(흰색) / 로그인·트리 0=새 트리 만들기(흰색) / 로그인·트리 있음=이어 보던 순간(흰색).
const centerButtons=[...shadow.querySelectorAll('.center .actions button')];
const centerPlan=applyHomeCenter(centerButtons,presentation.centerState);
// 첫 버튼 동작: 로그아웃=로그인/가입으로, 로그인·트리 있음=이어 보던 순간, 로그인·트리 0=비활성.
{
 const first=centerButtons[0];
 if(presentation.centerState.member==='out')first.onclick=bridge.actions.start;
 else if(centerPlan.state==='in-trees')first.onclick=bridge.actions.resume;
}
// 예시 모드는 궤도의 기존 안내를 그대로 두고, 나머지는 계획의 문구를 쓴다(빈 문자열이면 숨김).
if(cardsPlan.note!==null)shadow.querySelector('.center-note').textContent=cardsPlan.note;
// 2026-11-08 접근성: 카드 출처 안내가 바뀌면 화면 낭독기가 알린다.
shadow.querySelector('.center-note')?.setAttribute('aria-live','polite');
shadow.querySelector('.center-note')?.setAttribute('role','status');
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:768px){.topbar{gap:12px;flex-wrap:wrap;align-items:center;padding:8px 12px}.top-actions{gap:6px;flex-shrink:0;flex-wrap:wrap;margin-left:auto}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:14px}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:14px}.hint{font-size:14px}}';shadow.append(mobileFit);
const community=document.createElement('button');community.className='menuBtn home-community';community.type='button';community.textContent='둘러보기';community.setAttribute('aria-label','공개 트리 둘러보기');community.onclick=bridge.actions.community;shadow.querySelector('[data-home-account]').before(community);
shadow.querySelector('.top-actions').append(themeButton);
// 카드 출처 버튼과 메뉴. 로그아웃에는 예시·인기만 보여 준다.
const cardWrap=document.createElement('span');cardWrap.className='card-source';
const cardButton=document.createElement('button');cardButton.type='button';cardButton.className='menuBtn';cardButton.dataset.ltCardSource='';
cardButton.textContent=`카드: ${homeCardsLabel(cardsPlan.mode)} ▾`;cardButton.setAttribute('aria-haspopup','menu');cardButton.setAttribute('aria-expanded','false');cardButton.setAttribute('aria-controls','home-card-menu');
const cardMenu=document.createElement('div');cardMenu.className='card-menu';cardMenu.id='home-card-menu';cardMenu.setAttribute('role','menu');cardMenu.hidden=true;
const modes=homeCardsMenu({loggedIn});
function renderMenu(){
 cardMenu.replaceChildren();
 for(const item of modes){
  const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(item===cardsPlan.mode));b.tabIndex=-1;b.textContent=homeCardsLabel(item);
  b.onclick=()=>{writeHomeCardsMode(localStorage,item);closeMenu();location.reload();};
  cardMenu.append(b);
 }
}
function openMenu(){renderMenu();cardMenu.hidden=false;cardButton.setAttribute('aria-expanded','true');const items=[...cardMenu.querySelectorAll('[role=menuitemradio]')];(items.find(b=>b.getAttribute('aria-checked')==='true')||items[0])?.focus();}
function closeMenu(refocus=false){if(cardMenu.hidden)return;cardMenu.hidden=true;cardButton.setAttribute('aria-expanded','false');if(refocus)cardButton.focus();}
cardButton.onclick=()=>{if(cardMenu.hidden)openMenu();else closeMenu();};
cardButton.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();openMenu();}else if(e.key==='Escape')closeMenu();});
cardMenu.addEventListener('keydown',e=>{const items=[...cardMenu.querySelectorAll('[role=menuitemradio]')],index=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();closeMenu(true);}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const step=e.key==='ArrowDown'?1:-1;items[(index+step+items.length)%items.length]?.focus();}else if(e.key==='Home'){e.preventDefault();items[0]?.focus();}else if(e.key==='End'){e.preventDefault();items.at(-1)?.focus();}});
document.addEventListener('click',e=>{if(!clickWithin(e,cardWrap))closeMenu();});
cardWrap.append(cardButton,cardMenu);shadow.querySelector('.top-actions').append(cardWrap);
shadow.querySelector('[data-home-account]').onclick=bridge.actions.account;
shadow.querySelectorAll('.firstMark').forEach(e=>e.textContent='첫 순간');
const dialog=shadow.querySelector('dialog');
const labels=new MutationObserver(()=>{const b=dialog.querySelector('[data-do=book]');if(b&&b.textContent!=='기억책 열기')b.textContent='기억책 열기';});
labels.observe(dialog,{childList:true,subtree:true});
addEventListener('pagehide',()=>labels.disconnect(),{once:true});
addEventListener('pagehide',dispose,{once:true});
