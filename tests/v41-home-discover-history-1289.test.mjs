import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoverRuntime} from '../public/v41/shell/discover-runtime.mjs';
function setup(){
 let resolveResponse;
 const dialog={dataset:{},showModal(){this.opened=(this.opened||0)+1;}};
 const controls={'discover-ask':dialog,'discover-ask-feedback':{textContent:''},'discover-ask-yes':{},'discover-ask-no':{}};
 const ctx={$:id=>controls[id],source:'server',model:{trees:[]},shareApi:{getTreeDiscover:()=>new Promise(resolve=>{resolveResponse=resolve})}};
 createDiscoverRuntime(ctx).mount();
 return {ctx,dialog,reply:()=>resolveResponse({ok:true,discover:false})};
}
test('공유 감상 전환 뒤 늦게 도착한 공개 질문은 기록 창을 열지 않는다',async()=>{
 const s=setup();
 const request=s.ctx.askDiscover('tree1');
 s.ctx.source='share';
 s.reply();
 await request;
 assert.equal(s.dialog.opened||0,0);
});
test('자기 트리 화면의 공개 질문은 계속 열린다',async()=>{
 const s=setup();
 const request=s.ctx.askDiscover('tree1');
 s.reply();
 await request;
 assert.equal(s.dialog.opened,1);
});

test('공유 주소로 바뀐 직후 계정 상태가 남아 있어도 공개 질문을 열지 않는다',async()=>{
 const original=globalThis.location;
 globalThis.location={hash:'#share/example/book'};
 try{
  const s=setup();
  const request=s.ctx.askDiscover('tree1');
  s.reply();
  await request;
  assert.equal(s.dialog.opened||0,0);
 }finally{
  if(original===undefined)delete globalThis.location;else globalThis.location=original;
 }
});
