import '../src/styles.css';
import {mountOrbit} from '../src/views/orbit.js';
import {createHomeActions} from './home-actions.js';
import {homePresentation} from './home-presentation.js';
const context=parent.LT41||{source:parent.document.body.dataset.recordSource};
const bridge=createHomeActions({getContext:()=>parent.LT41,send:message=>parent.postMessage(message,location.origin),gallery:true});
const presentation=homePresentation(context);
const dispose=mountOrbit(document.getElementById('orbit'),{
 trees:presentation.trees,storage:{getItem:()=>null,setItem:()=>{}},context:presentation.context,
 authHtml:`<button class="menuBtn auth-entry" data-home-account>${presentation.accountLabel}</button>`,actions:bridge.actions
});
const shadow=document.getElementById('orbit').shadowRoot;
// Keep the original SRC064 wordmark on the welcome screen.
const identity=document.createElement('style');
identity.textContent=`:host{--ui:'Pretendard Variable',Pretendard,system-ui,sans-serif}.app{font-family:var(--ui)}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:12px}.menuBtn{font-size:14px}`;
shadow.append(identity);
if(presentation.canResume){
 const primary=shadow.querySelector('.primary-cta'),secondary=shadow.querySelector('.actions [data-do="continue"]');
 primary.dataset.do='member-continue';primary.textContent='이어 보던 순간';primary.onclick=bridge.actions.resume;
 secondary.dataset.do='new';secondary.textContent='새 트리 만들기';
}
shadow.querySelector('[data-do=trees]').textContent='내 책장';
if(!presentation.canResume)shadow.querySelector('.primary-cta').textContent='첫 순간 남기기';
shadow.querySelector('.center-note').textContent='배경 카드는 감상 예시 · 내 기록에는 저장되지 않아요';
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:768px){.topbar{gap:12px;flex-wrap:wrap;align-items:center}.top-actions{gap:6px;flex-shrink:0;flex-wrap:wrap;margin-left:auto}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:14px}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:14px}.hint{font-size:14px}}';shadow.append(mobileFit);
const community=document.createElement('button');community.className='menuBtn';community.type='button';community.textContent='둘러보기';community.setAttribute('aria-label','공개 트리 둘러보기');community.onclick=bridge.actions.community;shadow.querySelector('[data-home-account]').before(community);
shadow.querySelector('[data-home-account]').onclick=bridge.actions.account;
shadow.querySelectorAll('.firstMark').forEach(e=>e.textContent='첫 순간');
const dialog=shadow.querySelector('dialog');
const labels=new MutationObserver(()=>{const b=dialog.querySelector('[data-do=book]');if(b&&b.textContent!=='기억책 열기')b.textContent='기억책 열기';});
labels.observe(dialog,{childList:true,subtree:true});
addEventListener('pagehide',()=>labels.disconnect(),{once:true});
addEventListener('pagehide',dispose,{once:true});
