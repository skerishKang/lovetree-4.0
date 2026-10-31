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
// Same Korean service mark as the shell, without changing the SRC064 gallery.
const brand=parent.document.querySelector('.app-header .brand').cloneNode(true);
brand.onclick=e=>{e.preventDefault();bridge.actions.navigate('home')};
shadow.querySelector('.brand').replaceWith(brand);
const identity=document.createElement('style');
identity.textContent=`:host{--ui:'Pretendard Variable',Pretendard,system-ui,sans-serif}.app{font-family:var(--ui)}.topbar{height:68px;padding:10px 24px;align-items:center}.brand{display:flex;align-items:center;gap:9px;color:#f4e5eb;text-decoration:none;font-family:var(--ui);font-size:16px;letter-spacing:-.04em;min-height:44px}.brand>span{font-weight:650;white-space:nowrap}.brand svg{width:24px;height:30px}.brand small{font-size:10px;font-weight:500;margin-left:7px;color:#e9bdcd;letter-spacing:.04em}.top-actions{gap:6px}.top-actions .menuBtn{font-family:var(--ui);font-size:12px;min-height:44px;padding:0 12px}@media(max-width:650px){.topbar{padding:6px 12px;gap:8px}.brand{font-size:15px;gap:6px}.brand svg{width:20px}.top-actions{gap:4px}.top-actions .menuBtn{font-size:11px;padding:0 7px}}`;
shadow.append(identity);
if(presentation.canResume){
 const primary=shadow.querySelector('.primary-cta'),secondary=shadow.querySelector('.actions [data-do="continue"]');
 primary.dataset.do='member-continue';primary.textContent='이어 보던 순간';primary.onclick=bridge.actions.resume;
 secondary.dataset.do='new';secondary.textContent='새 트리 만들기';
}
shadow.querySelector('[data-do=trees]').textContent='내 책장';
if(!presentation.canResume)shadow.querySelector('.primary-cta').textContent='첫 순간 남기기';
shadow.querySelector('.center-note').textContent='배경 카드는 감상 예시 · 내 기록에는 저장되지 않아요';
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:650px){.topbar{gap:8px}.top-actions{gap:6px;flex-shrink:0}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:10px}}';shadow.append(mobileFit);
shadow.querySelector('[data-home-account]').onclick=bridge.actions.account;
shadow.querySelectorAll('.firstMark').forEach(e=>e.textContent='첫 순간');
const dialog=shadow.querySelector('dialog');
const labels=new MutationObserver(()=>{const b=dialog.querySelector('[data-do=book]');if(b&&b.textContent!=='기억책 열기')b.textContent='기억책 열기';});
labels.observe(dialog,{childList:true,subtree:true});
addEventListener('pagehide',()=>labels.disconnect(),{once:true});
addEventListener('pagehide',dispose,{once:true});
