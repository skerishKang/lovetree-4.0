import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPrivateUpload} from '../public/v41/private-upload.mjs';

test('only the latest simultaneous media list response is rendered', async () => {
 const oldDocument=globalThis.document,oldFetch=globalThis.fetch,oldWindow=globalThis.window;
 const pending=[];
 class Element {
  constructor(){this.children=[];this.listeners={};this.textContent='';this.open=false;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.textContent='';}
 }
 const elements=new Map();
 for(const key of ['[data-media-file]','[data-upload-status]','[data-upload]','[data-stop]','[data-assets]','[data-usage]','[data-refresh]','details']) elements.set(key,new Element());
 const section=new Element();section.querySelector=key=>elements.get(key);
 globalThis.document={createElement:tag=>tag==='section'?section:new Element()};
 globalThis.window={LTMedia:{privateAssetName:()=>null}};
 globalThis.fetch=()=>new Promise(resolve=>pending.push(resolve));
 const form={querySelector:key=>key==='[name=url]'?{closest:()=>({before(){}})}:{},elements:{url:{value:''}}};
 const response=()=>Response.json({subject:'user',usedBytes:1,quotaBytes:100,maxItems:200,items:[{name:'a.png',mime:'image/png',size:1,createdAt:'2026-01-01'}]});
 try {
  mountPrivateUpload({form,getSubject:()=> 'user',getState:()=>({trees:[]}),onChange(){}});
  elements.get('details').open=true;
  elements.get('details').listeners.toggle();
  const last=elements.get('[data-refresh]').onclick();
  assert.equal(pending.length,2);
  pending[1](response()); await last;
  pending[0](response()); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(elements.get('[data-assets]').children.length,1);
 } finally {globalThis.document=oldDocument;globalThis.fetch=oldFetch;globalThis.window=oldWindow;}
});
