import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPrivateUpload} from '../public/v41/private-upload.mjs';

test('only the latest simultaneous media list response is rendered', async () => {
 const oldDocument=globalThis.document,oldFetch=globalThis.fetch,oldWindow=globalThis.window;
 const pending=[];
 class Element {
  constructor(){this.children=[];this.listeners={};this.textContent='';this.open=false;this.hidden=false;this.disabled=false;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.textContent='';}
  close(){this.open=false;}
 }
 const slot=new Element(),assetsEl=new Element();
 const slotElements=new Map(),assetElements=new Map();
 for(const key of ['[data-media-file]','[data-upload-status]','[data-stop]']) slotElements.set(key,new Element());
 slot.querySelector=key=>slotElements.get(key);
 for(const key of ['[data-assets]','[data-usage]','[data-refresh]']) assetElements.set(key,new Element());
 assetsEl.querySelector=key=>assetElements.get(key);
 globalThis.document={createElement:()=>new Element()};
 globalThis.window={LTMedia:{privateAssetName:()=>null}};
 globalThis.fetch=()=>new Promise(resolve=>pending.push(resolve));
 const form={querySelector:key=>key==='[data-media-slot]'?slot:key==='[type=submit]'?new Element():null,elements:{url:{value:''}}};
 const response=()=>Response.json({subject:'user',usedBytes:1,quotaBytes:100,maxItems:200,items:[{name:'a.png',mime:'image/png',size:1,createdAt:'2026-01-01'}]});
 try {
  mountPrivateUpload({form,assets:assetsEl,getSubject:()=> 'user',getState:()=>({trees:[]}),onChange(){}});
  const first=assetElements.get('[data-refresh]').onclick();
  const last=assetElements.get('[data-refresh]').onclick();
  assert.equal(pending.length,2);
  pending[1](response()); await last;
  assert.equal(assetElements.get('[data-assets]').children.length,1);
  pending[0](response()); await first;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(assetElements.get('[data-assets]').children.length,1,'older response is ignored');
 } finally {globalThis.document=oldDocument;globalThis.fetch=oldFetch;globalThis.window=oldWindow;}
});
