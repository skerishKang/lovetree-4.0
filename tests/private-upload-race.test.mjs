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

// #256-3 2단계: onUploaded·imagesOnly 옵션. 옵션이 없으면 기존 순간 폼 동작이 그대로여야 한다.
function uploaderHarness({ onUploaded = null, imagesOnly = false } = {}) {
 const oldDocument=globalThis.document,oldFetch=globalThis.fetch,oldWindow=globalThis.window,oldLocation=globalThis.location;
 class Element {
  constructor(){this.children=[];this.listeners={};this.textContent='';this.open=false;this.hidden=false;this.disabled=false;this.innerHTML='';this.files=[];}
  addEventListener(name,fn){this.listeners[name]=fn;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.textContent='';}
  close(){this.open=false;}
 }
 const slot=new Element(),slotElements=new Map();
 for(const key of ['[data-media-file]','[data-upload-status]','[data-stop]']) slotElements.set(key,new Element());
 slot.querySelector=key=>slotElements.get(key);
 globalThis.document={createElement:()=>new Element()};
 globalThis.window={LTMedia:{privateAssetName:()=>null}};
 globalThis.location={origin:'https://lovetree-4-0.pages.dev'};
 const uploadedUrls=[];
 globalThis.fetch=()=>Promise.resolve({ok:true,status:200,text:async()=>JSON.stringify({name:'c.png',url:'https://lovetree-4-0.pages.dev/api/media/c.png'})});
 const form={querySelector:key=>key==='[data-media-slot]'?slot:key==='[type=submit]'?new Element():null,elements:{url:{value:''}}};
 const api=mountPrivateUpload({form,assets:null,getSubject:()=>'user',getState:()=>({trees:[]}),onChange(){},onUploaded,imagesOnly});
 async function pick(file){const input=slotElements.get('[data-media-file]');input.files=[file];await input.listeners.change();for(let i=0;i<200;i++)await new Promise(r=>setImmediate(r));}
 return {slotElements,form,uploadedUrls,api,pick,restore(){globalThis.document=oldDocument;globalThis.fetch=oldFetch;globalThis.window=oldWindow;globalThis.location=oldLocation;}};
}

test('onUploaded를 주면 순간 폼 url 칸을 건드리지 않고 주소를 넘긴다', async () => {
 const h=uploaderHarness({onUploaded:url=>{h.uploadedUrls.push(url);}});
 try {
  await h.pick({type:'image/png',size:1000});
  assert.equal(h.form.elements.url.value,'', '순간 폼 링크 칸은 그대로다');
  assert.deepEqual(h.uploadedUrls,['https://lovetree-4-0.pages.dev/api/media/c.png']);
  assert.match(h.slotElements.get('[data-upload-status]').textContent,/새 사진 순간을 표지로 만들었어요|사진/, '후속 안내가 상태 칸에 나간다');
 } finally {h.restore();}
});

test('옵션이 없으면 기존 동작 그대로: url 칸에 보관 주소를 채운다', async () => {
 const h=uploaderHarness({});
 try {
  await h.pick({type:'image/png',size:1000});
  assert.equal(h.form.elements.url.value,'https://lovetree-4-0.pages.dev/api/media/c.png');
  assert.deepEqual(h.uploadedUrls,[]);
  assert.match(h.slotElements.get('[data-upload-status]').textContent,/첨부 파일을 보관했어요/);
 } finally {h.restore();}
});

test('imagesOnly는 영상 파일을 기존 형식 안내로 막는다', async () => {
 const h=uploaderHarness({onUploaded:()=>{},imagesOnly:true});
 try {
  await h.pick({type:'video/mp4',size:1000});
  assert.deepEqual(h.uploadedUrls,[], '영상은 올리지 않는다');
  assert.match(h.slotElements.get('[data-upload-status]').textContent,/PNG·JPEG·GIF·WebP/);
 } finally {h.restore();}
});
