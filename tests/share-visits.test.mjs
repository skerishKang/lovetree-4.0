import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createShareVisitsService, VISIT_WINDOW_MS } from '../server/share-visits-service.js';
import { createMemoryShareVisitsRepo } from '../server/testing/memory-share-visits-repo.js';
import { createShareHandler, createShareService } from '../server/share-service.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createTree } from '../src/domain.js';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { createNodeHandler } from '../server/http.js';
import { listenOnSafePort } from './helpers/safe-port.mjs';
import { createShareVisitsRepo } from '../server/db/share-visits-postgres.js';
import { createTreeVisibilityRepo } from '../server/db/tree-visibility-postgres.js';
import { ApiError } from '../server/errors.js';

const productId = 'visit-test', shareId = 'v'.repeat(24), subjectId = 'owner';
const start = Date.parse('2026-11-27T23:55:00Z');
const visitor = {trusted:true, authKnown:true, clientIp:'192.0.2.1'};
const scope = {productId,shareId};
export async function fixture(repo = createMemoryShareVisitsRepo()) {
  let at = start, hidden = false, privateTree = false;
  const shareRepo = createMemoryShareRepo(), workspaceRepo = createMemoryWorkspaceRepo();
  const workspace = createWorkspaceService({repo:workspaceRepo,productId});
  const tree = createTree({subject:'공개 기록',title:'방문 시험',note:'시험',emotion:'설렘',date:'2026-11-27',url:''},new Date(start).toISOString());
  await workspace.write({productId,subjectId},{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed'});
  await shareRepo.create({...scope,subjectId,treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book'});
  const visibilityRepo = {get:async()=>({visibility:privateTree?'private':'public'})};
  const communityRepo = {isHiddenShare:async()=>hidden};
  const visits = createShareVisitsService({repo,shareRepo,visibilityRepo,communityRepo,productId,secret:randomBytes(32).toString('hex'),now:()=>at});
  const service = createShareService({shareRepo,workspaceRepo,visibilityRepo,communityRepo,productId,visitCounts:visits});
  const handle = createShareHandler({service,productId,visitProxyTrusted:()=>true,authenticate:async request=>{
    if (!request.headers.cookie) throw new ApiError(401,'unauthenticated','로그인 필요');
    return {productId,subjectId};
  }});
  const get = headers=>handle({method:'GET',path:'/api/public/visits/'+shareId,headers:{'x-lovetree-client-ip':visitor.clientIp,...headers}});
  return {repo,visits,get,handle,shareRepo,advance:ms=>{at+=ms},hide:value=>{hidden=value},privatize:value=>{privateTree=value}};
}

test('익명 방문과 날짜 경계 중복, 만료 정리 뒤 누적값 유지',async()=>{
  const f=await fixture();
  const first=await f.get({});
  assert.equal(first.status,200); assert.equal(first.body.stats.visits,0);
  assert.equal(await f.repo.count(scope),0);
  await first.afterResponse();
  assert.equal(await f.repo.count(scope),1);
  assert.equal(typeof first.body.stats.visits,'number');
  assert.equal(JSON.stringify(first.body).includes(visitor.clientIp),false);
  const owner=await f.get({cookie:'__Host-lovetree-access=fixture'});
  assert.equal(owner.body.stats.visits,1);
  assert.equal(owner.afterResponse,undefined);
  assert.notEqual(owner.headers.etag,first.headers.etag);
  f.advance(10*60*1000);
  const cached=await f.get({'if-none-match':owner.headers.etag});
  assert.equal(cached.status,304); assert.equal(cached.headers.etag,owner.headers.etag);
  await cached.afterResponse();
  assert.equal(await f.repo.count(scope),1);
  f.advance(VISIT_WINDOW_MS);
  assert.equal(await f.visits.prune(),1);
  assert.equal(await f.visits.count(shareId),1);
  const next=await f.get({'if-none-match':owner.headers.etag});
  assert.equal(next.status,304); assert.equal(next.headers.etag,owner.headers.etag);
  await next.afterResponse();
  const updated=await f.get({'if-none-match':owner.headers.etag});
  assert.equal(updated.status,200); assert.equal(updated.body.stats.visits,2);
  assert.notEqual(updated.headers.etag,owner.headers.etag);
  await updated.afterResponse();
});

test('주인·숨김·비공개·취소 공유 제외',async()=>{
  const f=await fixture();
  assert.equal((await f.get({cookie:'__Host-lovetree-access=fixture'})).body.stats.visits,0);
  f.hide(true); assert.equal((await f.get({})).status,404); assert.equal(await f.repo.count(scope),0);
  f.hide(false); f.privatize(true); assert.equal((await f.get({})).status,403); assert.equal(await f.repo.count(scope),0);
  f.privatize(false); await f.shareRepo.revoke({...scope,subjectId});
  assert.equal((await f.get({})).status,410); assert.equal(await f.repo.count(scope),0);
});

test('집계 저장 실패에도 방문 읽기 성공',async()=>{
  const f=await fixture({record:async()=>{throw Error('시험 실패')},count:async()=>{throw Error('시험 실패')}});
  const response=await f.get({}); assert.equal(response.status,200); assert.equal(response.body.stats.visits,0);
  await response.afterResponse(); // 집계 실패도 응답 뒤에 흡수한다.
});

test('방문 자료의 칼럼과 되돌리기 범위',()=>{
  const sql=readFileSync(new URL('../server/db/migrations/share-visits-261127.sql',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../server/db/schema.sql',import.meta.url),'utf8');
  assert.ok(schema.includes(sql.trim()));
  const cols=table=>sql.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+' \\(([\\s\\S]*?)\\n\\);'))[1].split('\n').map(line=>line.trim().split(' ')[0]).filter(x=>x && !['PRIMARY','FOREIGN'].includes(x));
  assert.deepEqual(cols('lovetree_share_visits'),['product_id','share_id','visits']);
  assert.deepEqual(cols('lovetree_share_visit_dedup'),['product_id','share_id','visitor_hash','expires_at']);
});

test('300밀리초 방문 집계는 실제 HTTP 응답 완료를 막지 않는다', async t=>{
  const repo=createMemoryShareVisitsRepo(), realRecord=repo.record;
  let started, finished;
  const begin=new Promise(r=>started=r), done=new Promise(r=>finished=r);
  repo.record=async input=>{started();await sleep(300);const count=await realRecord(input);finished();return count;};
  const f=await fixture(repo);
  const server=createServer(createNodeHandler(f.handle));
  await listenOnSafePort(server,'127.0.0.1',{port:Number(process.env.LT_TEST_PORT||0)});
  t.after(()=>new Promise(r=>server.close(r)));
  const at=performance.now();
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/public/visits/'+shareId,{headers:{'x-lovetree-client-ip':visitor.clientIp}});
  const body=await response.json(), elapsed=performance.now()-at;
  await begin;
  assert.equal(response.status,200);assert.equal(body.stats.visits,0);
  assert.equal(await repo.count(scope),0,'응답 본문이 집계 완료보다 앞서야 한다');
  t.diagnostic('응답 '+Math.round(elapsed)+'밀리초 / 집계 지연 300밀리초');
  await done;
  assert.equal(await repo.count(scope),1);
});

test('같은 공유의 동시 50개 방문과 중복 방문을 정확히 센다',async()=>{
  const f=await fixture();
  const visitors=Array.from({length:50},(_,i)=>({'x-lovetree-client-ip':'192.0.2.'+(i+1)}));
  const replies=await Promise.all(visitors.flatMap(headers=>[f.get(headers),f.get(headers)]));
  assert.ok(replies.every(r=>r.status===200&&r.body.stats.visits===0));
  await Promise.all(replies.map(r=>r.afterResponse()));
  assert.equal(await f.repo.count(scope),50);
  f.advance(VISIT_WINDOW_MS);
  const again=await Promise.all(visitors.map(h=>f.get(h)));
  await Promise.all(again.map(r=>r.afterResponse()));
  assert.equal(await f.repo.count(scope),100);
});

test('자정 전후 집계 실행 순서가 뒤집혀도 한 번만 센다',async()=>{
  const f=await fixture();
  const before=await f.get({});
  f.advance(10*60*1000);
  const after=await f.get({});
  await after.afterResponse();
  await before.afterResponse();
  assert.equal(await f.repo.count(scope),1);
});

test('서재 공개 여부 일괄 확인과 응답 뒤 집계의 질의 수 상한',async t=>{
  const clock=new Date(start).toISOString(), trees=Array.from({length:26},(_,i)=>createTree({
    subject:'시험 '+i,title:'시험 트리 '+i,note:'',emotion:'설렘',date:'2026-11-27',url:''
  },clock));
  const shares=trees.map((tree,i)=>({productId,subjectId,shareId:i===0?shareId:'s'+String(i).padStart(23,'0'),treeId:tree.id,entryMomentId:tree.moments[0].id,status:'active',view:'book'}));
  const calls=[];
  const hit=(name,result)=>{calls.push(name);return result;};
  const shareRepo={load:async()=>hit('공유 조회',shares[0])};
  const workspaceRepo={load:async()=>hit('문서 조회',{doc:{version:1,trees,prefs:{}},revision:1})};
  const visibilityRepo=createTreeVisibilityRepo({query:async(sql,params)=>{
    if(sql.includes('ANY')) {
      assert.equal(params[0],productId);assert.equal(params[1],subjectId);
      assert.equal(params[2].length,25);
      return hit('공개 여부 일괄',{rows:[{tree_id:trees[1].id},{tree_id:trees[2].id}]});
    }
    assert.equal(params[2],trees[0].id);
    return hit('공개 여부 단건',{rows:[]});
  }});
  const discoverRepo={get:async()=>hit('소개 확인',{discover:true})};
  const communityRepo={isHiddenShare:async()=>hit('숨김 확인',false),
    listDiscoverableSummaries:async()=>hit('후보 조회',shares.map(share=>({share}))),
    stats:async()=>{hit('반응 집계 1');hit('반응 집계 2');return {};}};
  const admin={roleFor:async()=>hit('역할 조회',null)};
  const repo=createShareVisitsRepo({
    query:async()=>hit('저장된 방문 수 조회',{rows:[{visits:7}]}),
    connect:async()=>({query:async sql=>hit(sql.startsWith('WITH')?'원자적 집계':sql.startsWith('SELECT')?'방문자 잠금':sql,{rows:[{visits:8}]}),release(){}})
  });
  const visitCounts=createShareVisitsService({repo,shareRepo,visibilityRepo,communityRepo,productId,secret:randomBytes(32).toString('hex'),now:()=>start});
  const service=createShareService({shareRepo,workspaceRepo,visibilityRepo,discoverRepo,communityRepo,admin,visitCounts,productId});
  const response=await service.readVisit(shareId,visitor);
  assert.equal(response.body.shelf.length,24);
  assert.ok(!response.body.shelf.some(item=>[shares[1].shareId,shares[2].shareId].includes(item.shareId)));
  assert.equal(response.body.stats.visits,7);
  assert.equal(calls.length,11);
  assert.equal(calls.filter(n=>n==='공개 여부 단건').length,1);
  assert.equal(calls.filter(n=>n==='공개 여부 일괄').length,1);
  await response.afterResponse();
  assert.equal(calls.length,15);
  assert.deepEqual(calls.slice(11),['BEGIN','방문자 잠금','원자적 집계','COMMIT']);
  t.diagnostic('서재 24권 응답 11회, 뒤처리 4회, 합계 15회');
});
