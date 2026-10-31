import '../src/styles.css';
import {mountOrbit} from '../src/views/orbit.js';
import {createHomeActions} from './home-actions.js';
const context=parent.LT41;
const bridge=createHomeActions({getContext:()=>parent.LT41,send:message=>parent.postMessage(message,location.origin)});
// Reading position is shared with this page's selection, never with 4.0 localStorage.
const position=new Map();
if(context?.tree)position.set('lovetree.v4.reading-position.v1',JSON.stringify({treeId:context.tree.id,momentId:context.momentId}));
const storage={getItem:key=>position.get(key)||null,setItem:(key,value)=>{position.set(key,value);try{bridge.select(JSON.parse(value).momentId);}catch{}}};
const example=!context||context.source==='example';
const accountLabel=context?.source==='server'?'내 계정':'로그인';
const dispose=mountOrbit(document.getElementById('orbit'),{
 trees:example?[]:[context.tree],storage,context:{treeId:context?.tree.id||null,momentId:context?.momentId||null,readOnly:example},authHtml:`<button class="menuBtn auth-entry" data-home-account>${accountLabel}</button>`,actions:bridge.actions,onSelect:bridge.select,recordNote:context?.source==='file'?'파일 감상 · 서버에 저장하지 않아요':null
});
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:650px){.topbar{gap:8px}.top-actions{gap:6px;flex-shrink:0}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:10px}.brand{letter-spacing:.08em}}';document.getElementById('orbit').shadowRoot.append(mobileFit);
document.getElementById('orbit').shadowRoot.querySelector('[data-home-account]').onclick=bridge.actions.account;
addEventListener('pagehide',dispose,{once:true});
