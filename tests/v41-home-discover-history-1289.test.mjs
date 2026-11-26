import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoverRuntime, DISCOVER_NEWS_KEY} from '../public/v41/shell/discover-runtime.mjs';
import {newlyPublishedTrees} from '../public/v41/shell/notice.mjs';
import {dismissDiscoverAskIfOpen} from './helpers/discover-ask.mjs';

// #1495(2026-11-27 대표 결정): 둘러보기 소개 물음 창을 없애고, 같은 조건(쓰기 가능한 계정·순간 3개 이상·아직 소개 안 함)이면
// 내 소식에 트리마다 한 줄을 남긴다. 창을 열던 자리(showModal)는 더 없다. 옛 물음 기록(lt41.discoverAsked)은 그대로 두고 읽지 않는다.
function memoryStorage(initial = {}){
 const store = new Map(Object.entries(initial));
 return {store, getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k)};
}
function setup({answer = {ok:true,discover:false}, defer = false, storage = memoryStorage(), trees = [{id:'tree1',title:'여름 무대',moments:[{},{},{}]}]} = {}){
 let resolveResponse;
 const puts = [];
 const opened = [];
 const ctx = {
  $: id => (id === 'discover-ask' ? {showModal(){opened.push(id);}} : null),
  source:'server', model:{trees}, storage,
  shareApi:{
   getTreeDiscover: () => defer ? new Promise(resolve => { resolveResponse = resolve; }) : Promise.resolve(answer),
   setTreeDiscover: async (treeId, discover) => { puts.push([treeId, discover]); return {ok:true, discover}; }
  }
 };
 createDiscoverRuntime(ctx).mount();
 return {ctx, puts, opened, storage, reply: (value = {ok:true,discover:false}) => resolveResponse(value)};
}

test('#1495 순간 3개 이상·아직 소개 안 한 트리는 내 소식에 한 줄을 남기고, 창은 열지 않는다', async () => {
 const s = setup();
 await s.ctx.offerDiscover(['tree1']);
 const lines = s.ctx.discoverNewsLines();
 assert.equal(lines.length, 1);
 assert.equal(lines[0].treeId, 'tree1');
 assert.equal(lines[0].done, false);
 assert.match(lines[0].day, /^\d{4}-\d{2}-\d{2}$/);
 assert.deepEqual(s.opened, [], '소개 물음 창을 열지 않는다');
 assert.equal(s.ctx.unseenDiscoverCount(), 1, '새 줄은 읽지 않은 소식으로 센다');
});

test('#1495 같은 트리에는 한 번만 — 다시 저장해도 줄이 늘지 않는다', async () => {
 const s = setup();
 await s.ctx.offerDiscover(['tree1']);
 await s.ctx.offerDiscover(['tree1']);
 assert.equal(s.ctx.discoverNewsLines().length, 1);
});

test('#1495 이미 소개 중인 트리(백필)에는 줄을 남기지 않는다', async () => {
 const s = setup({answer:{ok:true,discover:true}});
 await s.ctx.offerDiscover(['tree1']);
 assert.deepEqual(s.ctx.discoverNewsLines(), []);
 assert.equal(s.ctx.unseenDiscoverCount(), 0);
});

test('#1495 소개 값 확인에 실패하면 줄을 남기지 않고 다음 저장 때 다시 본다', async () => {
 const s = setup({answer:{ok:false}});
 await s.ctx.offerDiscover(['tree1']);
 assert.deepEqual(s.ctx.discoverNewsLines(), []);
 assert.equal(s.storage.getItem(DISCOVER_NEWS_KEY), null, '확인 실패는 기록하지 않는다');
});

test('#1495 공유 감상으로 바뀐 뒤 늦게 도착한 응답은 줄을 남기지 않는다', async () => {
 const s = setup({defer:true});
 const request = s.ctx.offerDiscover(['tree1']);
 s.ctx.source = 'share';
 s.reply();
 await request;
 assert.deepEqual(s.ctx.discoverNewsLines(), []);
});

test('#1495 공유 주소로 바뀐 직후 계정 상태가 남아 있어도 줄을 남기지 않는다', async () => {
 const original = globalThis.location;
 globalThis.location = {hash:'#share/example/book'};
 try {
  const s = setup({defer:true});
  const request = s.ctx.offerDiscover(['tree1']);
  s.reply();
  await request;
  assert.deepEqual(s.ctx.discoverNewsLines(), []);
 } finally {
  if (original === undefined) delete globalThis.location; else globalThis.location = original;
 }
});

test('#1495 옛 물음 기록(lt41.discoverAsked)은 그대로 두고 읽지도 않는다', async () => {
 const storage = memoryStorage({'lt41.discoverAsked': JSON.stringify(['tree1'])});
 const s = setup({storage});
 await s.ctx.offerDiscover(['tree1']);
 assert.equal(s.ctx.discoverNewsLines().length, 1, '예전에 물었던 트리도 새 줄 대상이다');
 assert.equal(storage.getItem('lt41.discoverAsked'), JSON.stringify(['tree1']), '옛 기록은 그대로 남는다');
});

test('#1495 [소개하기]는 창의 소개하기와 같은 저장(discover true)이고, 줄은 다시 누를 수 없는 상태가 된다', async () => {
 const s = setup();
 await s.ctx.offerDiscover(['tree1']);
 const answer = await s.ctx.introduceTree('tree1');
 assert.equal(answer.ok, true);
 assert.deepEqual(s.puts, [['tree1', true]]);
 assert.equal(s.ctx.discoverNewsLines()[0].done, true);
 assert.equal(s.ctx.discoverOf('tree1'), true, '서재 표시·공유 판이 같은 값을 본다');
});

test('#1495 내 소식을 열면 새 줄은 읽은 것으로 바뀐다', async () => {
 const s = setup();
 await s.ctx.offerDiscover(['tree1']);
 s.ctx.markDiscoverNewsSeen();
 assert.equal(s.ctx.unseenDiscoverCount(), 0);
 assert.equal(s.ctx.discoverNewsLines().length, 1, '읽어도 줄은 남는다');
});

test('#1495 트리가 지워졌으면 그 줄은 보이지 않는다', async () => {
 const s = setup();
 await s.ctx.offerDiscover(['tree1']);
 s.ctx.model = {trees: []};
 assert.deepEqual(s.ctx.discoverNewsLines(), []);
});

// #1478: 시험 도우미 — 질문 창이 떠 있을 때만 '아니요'를 누르고, 없으면 기다리지 않고 지나간다.
// #1495 뒤로는 창이 없으므로 도우미는 언제나 바로 끝난다(아래 '창이 없으면' 시험이 그 경로다).
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
test('#1478 줄 후보는 순간 3개 이상 트리뿐 — 2개 이하·빈 트리만 있으면 남기지 않는다',()=>{
 assert.deepEqual(newlyPublishedTrees(null,{a:1,b:2}),[]);
 assert.deepEqual(newlyPublishedTrees(null,{}),[]);
 assert.deepEqual(newlyPublishedTrees(null,{a:2,b:3}).map(row=>row.treeId),['b']);
});
