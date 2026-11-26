// 둘러보기 소개 상태와 내 소식의 소개 한 줄(#1495).
// 2026-11-27 대표 결정: 순간이 3개가 될 때 뜨던 소개 물음 창은 없앴다. 같은 조건(쓰기 가능한 계정·순간 3개 이상·
// 아직 소개 안 함)이면 내 소식에 트리마다 한 줄을 남기고, [소개하기]는 창의 '소개하기'와 같은 저장(PUT /api/trees/<id>/discover)이다.
// 옛 물음 기록(lt41.discoverAsked)은 그대로 두고 읽지 않는다. 떠 있던 첫 공개 안내(#538)도 공유 판 설명으로 옮겨 없앴다.
import {localDateOnly} from '../local-date.mjs';

// 소개 줄 기록: [{treeId, day, offered, seen}] — offered는 줄을 보일지(확인 당시 소개 안 함), seen은 내 소식을 열어 봤는지.
// 소개 켜짐/꺼짐 값 자체는 저장하지 않는다(서버 discover 값이 기준이다).
export const DISCOVER_NEWS_KEY = 'lt41.discoverNews';

export function createDiscoverRuntime(ctx){
  let countTreeMoments, discoverState;
  const storage = () => { try { return ctx.storage || globalThis.localStorage || null; } catch { return null; } };
  function readNews(){
   try{const raw=JSON.parse(storage()?.getItem(DISCOVER_NEWS_KEY)||'[]');return Array.isArray(raw)?raw.filter(row=>row&&typeof row.treeId==='string'):[];}catch{return[];}
  }
  function writeNews(rows){try{storage()?.setItem(DISCOVER_NEWS_KEY,JSON.stringify(rows));}catch{/* 저장소가 막히면 이번 접속만 */}}

  // 트리 id → 마지막으로 확인한 소개 값(내 소식 줄·공유 판·서재 표시가 같은 값을 본다)
  async function refreshTreeDiscover(treeId){
   try{const answer=await ctx.shareApi.getTreeDiscover(treeId);if(!answer.ok)return null;
    discoverState.set(treeId,answer.discover===true);publishDiscover();return answer.discover===true;}catch{return null}
  }
  function discoverOf(treeId){return discoverState.has(treeId)?discoverState.get(treeId):null;}
  function rememberDiscover(treeId,discover){discoverState.set(treeId,discover===true);publishDiscover();}
  // 서재 화면이 카드 표시를 그릴 때 읽는 값(소개된 트리만 true) — 바뀌면 화면들에 알린다.
  function publishDiscover(){
   const out={};for(const [id,on] of discoverState)if(on)out[id]=true;
   try{globalThis.LT41_DISCOVER=out;}catch{}
   try{const type=globalThis.LT41_MSG?.discoverState;if(type)for(const frame of (ctx.frames?.()||[]))frame.contentWindow?.postMessage({type,trees:out},globalThis.location?.origin);}catch{}
  }

  // #1446 조건 그대로: 서버 저장이 확인된 뒤(status=synced) 쓰기 가능한 계정에서 순간 3개 이상 트리 중 아직 줄을 남기지 않은 것.
  // 이미 소개 중이면 줄 없이 기록만, 확인에 실패하면 기록하지 않아 다음 저장 때 다시 본다.
  // 공유 주소로 이동한 뒤 늦게 온 응답은 이전 계정의 줄을 남기지 않는다.
  async function offerDiscover(treeIds){
   let added=false;
   for(const treeId of treeIds||[]){
    if(readNews().some(row=>row.treeId===treeId))continue;
    const discover=await refreshTreeDiscover(treeId);
    if(ctx.source!=='server'||/^#share\//.test(globalThis.location?.hash||''))return;
    if(discover===null)continue;
    const rows=readNews();if(rows.some(row=>row.treeId===treeId))continue;
    rows.push({treeId,day:localDateOnly(new Date())||'',offered:discover===false,seen:false});
    writeNews(rows);
    if(discover===false)added=true;
   }
   if(added)void ctx.shellSettings?.refreshMyNewsCount?.();
  }
  function discoverNewsLines(){
   const trees=Array.isArray(ctx.model?.trees)?ctx.model.trees:[];
   return readNews().filter(row=>row.offered&&trees.some(tree=>tree.id===row.treeId))
    .map(row=>({treeId:row.treeId,day:row.day,done:discoverState.get(row.treeId)===true}));
  }
  function unseenDiscoverCount(){return discoverNewsLines().filter(line=>!line.done&&!readNews().find(row=>row.treeId===line.treeId)?.seen).length;}
  function markDiscoverNewsSeen(){const rows=readNews();if(!rows.some(row=>!row.seen))return;writeNews(rows.map(row=>({...row,seen:true})));}
  // [소개하기]: 창의 '소개하기'와 같은 저장. 실패하면 줄을 그대로 두고 안내 문구를 돌려준다.
  async function introduceTree(treeId){
   try{
    const answer=await ctx.shareApi.setTreeDiscover(treeId,true);
    if(!answer?.ok)return {ok:false,message:answer?.message||'소개 설정을 저장하지 못했어요.'};
    rememberDiscover(treeId,true);
    return {ok:true};
   }catch{return {ok:false,message:'소개 설정을 저장하지 못했어요.'};}
  }
  // 서재가 뜰 때 내 트리들의 소개 값을 한 번씩 확인한다(이미 아는 트리는 다시 묻지 않는다).
  async function loadDiscoverForTrees(){
   if(ctx.source!=='server')return;
   for(const tree of (ctx.model?.trees||[])){if(!discoverState.has(tree.id))await refreshTreeDiscover(tree.id);}
   publishDiscover();
  }
  Object.defineProperties(ctx,{
    countTreeMoments:{get:()=>countTreeMoments,set:value=>{countTreeMoments=value;}},
    discoverState:{get:()=>discoverState,set:value=>{discoverState=value;}},
    offerDiscover:{value:offerDiscover},
    discoverNewsLines:{value:discoverNewsLines},
    unseenDiscoverCount:{value:unseenDiscoverCount},
    markDiscoverNewsSeen:{value:markDiscoverNewsSeen},
    introduceTree:{value:introduceTree},
    discoverOf:{value:discoverOf},
    rememberDiscover:{value:rememberDiscover},
    loadDiscoverForTrees:{value:loadDiscoverForTrees}
  });
  return {mount(){
    countTreeMoments=()=>{const out={};for(const tree of (ctx.model?.trees||[]))out[tree.id]=(tree.moments||[]).length;return out;};
    discoverState=new Map();
  }};
}
