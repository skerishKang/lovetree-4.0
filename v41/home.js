import '../src/styles.css';
import {mountOrbit} from '../src/views/orbit.js';
import {createHomeActions} from './home-actions.js';
import {homePresentation} from './home-presentation.js';
import {applyHomeCenter} from './home-center.js';
import {readTheme,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute} from '../public/v41/header-state.mjs';
const shellBody=parent.document.body;
const context=parent.LT41||{source:shellBody.dataset.recordSource,member:shellBody.dataset.member,treeCount:Number(shellBody.dataset.treeCount||0)};
const bridge=createHomeActions({getContext:()=>parent.LT41,send:message=>parent.postMessage(message,location.origin),gallery:true});
const presentation=homePresentation(context);
const dispose=mountOrbit(document.getElementById('orbit'),{
 trees:presentation.trees,storage:{getItem:()=>null,setItem:()=>{}},context:presentation.context,
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
shadow.querySelector('.center-note').textContent='배경 카드는 감상 예시 · 내 기록에는 저장되지 않아요';
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:768px){.topbar{gap:12px;flex-wrap:wrap;align-items:center;padding:8px 12px}.top-actions{gap:6px;flex-shrink:0;flex-wrap:wrap;margin-left:auto}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:14px}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:14px}.hint{font-size:14px}}';shadow.append(mobileFit);
const community=document.createElement('button');community.className='menuBtn home-community';community.type='button';community.textContent='둘러보기';community.setAttribute('aria-label','공개 트리 둘러보기');community.onclick=bridge.actions.community;shadow.querySelector('[data-home-account]').before(community);
shadow.querySelector('.top-actions').append(themeButton);
shadow.querySelector('[data-home-account]').onclick=bridge.actions.account;
shadow.querySelectorAll('.firstMark').forEach(e=>e.textContent='첫 순간');
const dialog=shadow.querySelector('dialog');
const labels=new MutationObserver(()=>{const b=dialog.querySelector('[data-do=book]');if(b&&b.textContent!=='기억책 열기')b.textContent='기억책 열기';});
labels.observe(dialog,{childList:true,subtree:true});
addEventListener('pagehide',()=>labels.disconnect(),{once:true});
addEventListener('pagehide',dispose,{once:true});
