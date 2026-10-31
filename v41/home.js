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
if(presentation.canResume){
 const primary=shadow.querySelector('.primary-cta'),secondary=shadow.querySelector('.actions [data-do="continue"]');
 primary.dataset.do='member-continue';primary.textContent='이어 보던 순간';primary.onclick=bridge.actions.resume;
 secondary.dataset.do='new';secondary.textContent='새 트리 만들기';
}
shadow.querySelector('.center-note').textContent='배경 카드는 감상 예시 · 내 기록에는 저장되지 않아요';
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:650px){.topbar{gap:8px}.top-actions{gap:6px;flex-shrink:0}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:10px}.brand{letter-spacing:.08em}}';shadow.append(mobileFit);
shadow.querySelector('[data-home-account]').onclick=bridge.actions.account;
addEventListener('pagehide',dispose,{once:true});
