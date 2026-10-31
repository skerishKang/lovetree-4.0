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
const dispose=mountOrbit(document.getElementById('orbit'),{
 trees:example?[]:[context.tree],storage,context:{treeId:context?.tree.id||null,momentId:context?.momentId||null,readOnly:example},actions:bridge.actions,onSelect:bridge.select,recordNote:context?.source==='file'?'파일 감상 · 서버에 저장하지 않아요':null
});
addEventListener('pagehide',dispose,{once:true});
