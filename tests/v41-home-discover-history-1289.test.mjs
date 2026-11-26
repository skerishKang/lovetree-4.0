import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoverRuntime} from '../public/v41/shell/discover-runtime.mjs';
import {newlyPublishedTrees} from '../public/v41/shell/notice.mjs';
import {dismissDiscoverAskIfOpen} from './helpers/discover-ask.mjs';
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

function setupWithDiscover(answer){
 const dialog={dataset:{},showModal(){this.opened=(this.opened||0)+1;}};
 const controls={'discover-ask':dialog,'discover-ask-feedback':{textContent:''},'discover-ask-yes':{},'discover-ask-no':{}};
 const ctx={$:id=>controls[id],source:'server',model:{trees:[]},shareApi:{getTreeDiscover:async()=>answer}};
 createDiscoverRuntime(ctx).mount();
 return {ctx,dialog};
}
test('#1446 이미 소개 중인 트리(백필)에는 질문 창을 띄우지 않는다',async()=>{
 const s=setupWithDiscover({ok:true,discover:true});
 await s.ctx.askDiscover('tree1');
 assert.equal(s.dialog.opened||0,0);
});

test('#1446 소개 값 확인에 실패하면 질문 창을 띄우지 않는다',async()=>{
 const s=setupWithDiscover({ok:false});
 await s.ctx.askDiscover('tree1');
 assert.equal(s.dialog.opened||0,0);
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

// #1478: 시험 도우미 — 질문 창이 떠 있을 때만 '아니요'를 누르고, 없으면 기다리지 않고 지나간다.
function fakeAskPage({visible=false,visibleError=false,clickError=false}={}){
 const calls=[];
 return {calls,locator(selector){calls.push(['locator',selector]);return {
  isVisible:async(...args)=>{calls.push(['isVisible',...args]);if(visibleError)throw new Error('페이지 닫힘');return visible;},
  click:async(...args)=>{calls.push(['click',...args]);if(clickError)throw new Error('창이 먼저 닫힘');}
 };}};
}
test('#1478 질문 창이 떠 있으면 아니요를 한 번 누른다',async()=>{
 const page=fakeAskPage({visible:true});
 assert.equal(await dismissDiscoverAskIfOpen(page),true);
 assert.deepEqual(page.calls,[['locator','#discover-ask-no'],['isVisible'],['click']]);
});
test('#1478 질문 창이 없으면 누르지 않고 바로 지나간다(보이지 않는 단추를 기다리지 않는다)',async()=>{
 const page=fakeAskPage({visible:false});
 assert.equal(await dismissDiscoverAskIfOpen(page),false);
 assert.deepEqual(page.calls.filter(([name])=>name==='click'),[]);
});
test('#1478 보이는지 확인이나 누르기가 실패해도 시험을 멈추지 않는다',async()=>{
 const closed=fakeAskPage({visibleError:true});
 assert.equal(await dismissDiscoverAskIfOpen(closed),false);
 assert.deepEqual(closed.calls.filter(([name])=>name==='click'),[]);
 const raced=fakeAskPage({visible:true,clickError:true});
 assert.equal(await dismissDiscoverAskIfOpen(raced),true);
});
test('#1478 질문 후보는 순간 3개 이상 트리뿐 — 2개 이하·빈 트리만 있으면 묻지 않는다(도우미를 쓰는 흐름의 전제)',()=>{
 assert.deepEqual(newlyPublishedTrees(null,{a:1,b:2}),[]);
 assert.deepEqual(newlyPublishedTrees(null,{}),[]);
 assert.deepEqual(newlyPublishedTrees(null,{a:2,b:3}).map(row=>row.treeId),['b']);
});
