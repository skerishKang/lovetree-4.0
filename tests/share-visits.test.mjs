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
import { createAfterResponseQueue, createNodeHandler } from '../server/http.js';
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

async function waitFor(predicate, label) {
  const limit = performance.now() + 3_000;
  while (!(await predicate())) {
    if (performance.now() > limit) throw new Error('대기 시간 초과: ' + label);
    await sleep(5);
  }
}

async function waitForGate(gate, signal) {
  if (!signal) return gate;
  if (signal.aborted) throw signal.reason || Object.assign(new Error('뒤처리 취소'), {name: 'AbortError'});
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason || Object.assign(new Error('뒤처리 취소'), {name: 'AbortError'}));
    signal.addEventListener('abort', onAbort, {once: true});
  });
  try { return await Promise.race([gate, aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

async function startVisitServer(t, handle, options = {}) {
  const handler = createNodeHandler(handle, options), server = createServer(handler);
  await listenOnSafePort(server, '127.0.0.1', {port: Number(process.env.LT_TEST_PORT || 0)});
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await handler.closeAfterResponse();
  });
  return {handler, server, url: 'http://127.0.0.1:' + server.address().port + '/api/public/visits/' + shareId};
}

function createBlockingVisitPool(max = 10) {
  const waiting = [];
  let active = 0, maxActive = 0, visitActive = 0, maxVisitActive = 0, visits = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  function pump() {
    while (active < max && waiting.length) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      waiting.shift()({
        async query(sql) {
          if (sql.startsWith('WITH')) {
            visitActive += 1;
            maxVisitActive = Math.max(maxVisitActive, visitActive);
            try {
              await gate;
              visits += 1;
              return {rows: [{visits}]};
            } finally { visitActive -= 1; }
          }
          if (sql.startsWith('SELECT visits')) return {rows: [{visits}]};
          if (sql === 'SELECT 1') return {rows: [{ok: 1}]};
          return {rows: []};
        },
        release() { active -= 1; pump(); }
      });
    }
  }
  const pool = {
    connect() { return new Promise(resolve => { waiting.push(resolve); pump(); }); },
    async query(sql, params) {
      const client = await pool.connect();
      try { return await client.query(sql, params); }
      finally { client.release(); }
    }
  };
  return {pool, release: () => release(), stats: () => ({active, maxActive, visitActive, maxVisitActive, visits, waiting: waiting.length})};
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

test('느린 방문 뒤처리는 실행 2개·대기 4개로 제한하고 다른 DB 요청을 막지 않는다', async t=>{
  const blocked = createBlockingVisitPool(), repo = createShareVisitsRepo(blocked.pool), logs = [];
  const f = await fixture(repo);
  const {handler, url} = await startVisitServer(t, f.handle, {afterResponseLog: line => logs.push(line)});
  try {
    const begin = performance.now();
    const responses = await Promise.all(Array.from({length: 25}, (_, index) => fetch(url, {
      headers: {connection: 'close', 'x-lovetree-client-ip': '203.0.113.' + (index + 1)}
    })));
    assert.ok(responses.every(response => response.status === 200));
    await Promise.all(responses.map(response => response.text()));
    const elapsed = performance.now() - begin;
    await waitFor(() => handler.afterResponseStats().dropped === 19, '뒤처리 초과 19개');
    const limited = handler.afterResponseStats();
    assert.equal(limited.runningLimit, 2);
    assert.equal(limited.waitingLimit, 4);
    assert.equal(limited.active, 2);
    assert.equal(limited.queued, 4);
    assert.equal(limited.dropped, 19);
    assert.equal(blocked.stats().visitActive, 2);
    assert.equal(blocked.stats().waiting, 0);

    const otherBegin = performance.now();
    const other = await blocked.pool.query('SELECT 1');
    const otherElapsed = performance.now() - otherBegin;
    assert.deepEqual(other.rows, [{ok: 1}]);
    assert.ok(otherElapsed < 1_000, '다른 요청이 집계 대기 때문에 막히지 않는다');
    assert.equal(blocked.stats().maxActive, 3);

    blocked.release();
    await waitFor(async () => await repo.count(scope) === 6, '허용된 뒤처리 6개 완료');
    await waitFor(() => handler.afterResponseStats().active === 0 && handler.afterResponseStats().queued === 0, '뒤처리 대기 비움');
    assert.equal(await repo.count(scope), 6);
    assert.equal(blocked.stats().maxVisitActive, 2);
    assert.equal(blocked.stats().waiting, 0);
    await handler.closeAfterResponse();
    const overflowLogs = logs.filter(line => line.includes('실행·대기 상한'));
    assert.equal(overflowLogs.length, 1);
    assert.match(overflowLogs[0], /19개/);
    t.diagnostic(`응답 ${Math.round(elapsed)}밀리초, 실행 ${blocked.stats().maxVisitActive}개, 대기 ${limited.queued}개, 버림 ${limited.dropped}개, 다른 요청 ${Math.round(otherElapsed)}밀리초`);
  } finally {
    blocked.release();
    await handler.closeAfterResponse();
  }
});

test('35분 차이 방문을 역순으로 처리해도 누적 2회', async t=>{
  const firstAt = Date.parse('2026-11-28T12:00:00Z');
  const repo = createMemoryShareVisitsRepo(), realRecord = repo.record;
  let releaseFirst, firstStartedResolve, holdFirst = true, firstCompleted = false;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const firstStarted = new Promise(resolve => { firstStartedResolve = resolve; });
  repo.record = async (input, {signal} = {}) => {
    if (holdFirst && input.now.getTime() === firstAt) {
      holdFirst = false;
      firstStartedResolve();
      await waitForGate(firstGate, signal);
    }
    const result = await realRecord(input);
    if (input.now.getTime() === firstAt) firstCompleted = true;
    return result;
  };
  const f = await fixture(repo);
  f.advance(firstAt - start);
  const {handler, url} = await startVisitServer(t, f.handle);
  try {
    const first = await fetch(url, {headers: {connection: 'close', 'x-lovetree-client-ip': visitor.clientIp}});
    assert.equal(first.status, 200);
    await first.text();
    await firstStarted;
    f.advance(VISIT_WINDOW_MS + 5 * 60 * 1000);
    const second = await fetch(url, {headers: {connection: 'close', 'x-lovetree-client-ip': visitor.clientIp}});
    assert.equal(second.status, 200);
    await second.text();
    await waitFor(async () => await repo.count(scope) === 1, '나중 방문 먼저 집계');
    releaseFirst();
    await waitFor(() => firstCompleted, '늦은 첫 방문 집계');
    assert.equal(await repo.count(scope), 2);
    t.diagnostic('35분 간격 방문 2회의 기대 누적값 2, 실제 누적값 2');
  } finally {
    releaseFirst();
    await handler.closeAfterResponse();
  }
});

test('뒤처리 취소는 PostgreSQL 클라이언트를 파기해 연결을 붙잡지 않는다', async()=>{
  let queryStartedResolve, released;
  const queryStarted = new Promise(resolve => { queryStartedResolve = resolve; });
  const pending = new Promise(() => {});
  const client = {
    async query(sql) {
      if (sql.startsWith('WITH')) { queryStartedResolve(); await pending; }
      return {rows: []};
    },
    release(error) { released = error; }
  };
  const repo = createShareVisitsRepo({connect: async () => client});
  const controller = new AbortController();
  const recording = repo.record({
    productId, shareId, hashes: ['a'.repeat(64)], now: new Date(start),
    expiresAt: new Date(start + VISIT_WINDOW_MS), signal: controller.signal
  });
  await queryStarted;
  controller.abort();
  await assert.rejects(recording, {name: 'AbortError'});
  assert.equal(released?.name, 'AbortError');
});

test('신호를 무시하는 뒤처리도 시간 상한에서 실행 자리를 비운다', async()=>{
  const logs = [], started = [];
  const queue = createAfterResponseQueue({concurrency: 1, maxQueue: 1, timeoutMs: 20, log: line => logs.push(line)});
  queue.enqueue(() => { started.push(1); return new Promise(() => {}); });
  queue.enqueue(() => { started.push(2); });
  await waitFor(() => started.length === 2, '신호 무시 뒤 다음 작업 시작');
  assert.equal(queue.stats().active, 0);
  assert.equal(queue.stats().queued, 0);
  assert.equal(logs.filter(line => line.includes('시간 상한')).length, 1);
  await queue.close();
  assert.equal(queue.stats().active, 0);
});

test('뒤처리 시간 상한과 종료 정리는 실행·대기를 비운다', async t=>{
  const started = [], logs = [];
  const handle = async () => ({status: 200, body: {ok: true}, afterResponse: ({signal}) => {
    started.push(signal);
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    });
  }});
  const {handler, url} = await startVisitServer(t, handle, {
    afterResponseConcurrency: 1, afterResponseQueueLimit: 1, afterResponseTimeoutMs: 1_000,
    afterResponseLog: line => logs.push(line)
  });
  const first = await fetch(url, {headers: {connection: 'close'}});
  assert.equal(first.status, 200);
  await first.text();
  await waitFor(() => started.length === 1, '첫 뒤처리 시작');
  const second = await fetch(url, {headers: {connection: 'close'}});
  assert.equal(second.status, 200);
  await second.text();
  await waitFor(() => handler.afterResponseStats().queued === 1, '두 번째 뒤처리 대기');
  const third = await fetch(url, {headers: {connection: 'close'}});
  assert.equal(third.status, 200);
  await third.text();
  await waitFor(() => handler.afterResponseStats().dropped === 1, '세 번째 뒤처리 버림');
  await waitFor(() => started.length >= 2, '시간 상한 뒤 다음 작업 시작');
  const running = handler.afterResponseStats();
  assert.equal(running.active, 1);
  assert.equal(running.queued, 0);
  assert.equal(running.dropped, 1);
  assert.ok(logs.filter(line => line.includes('시간 상한')).length >= 1);
  await handler.closeAfterResponse();
  const closed = handler.afterResponseStats();
  assert.equal(closed.active, 0);
  assert.equal(closed.queued, 0);
  assert.equal(closed.dropped, 1);
  assert.equal(closed.closed, true);
  assert.equal(started.length, 2);
  assert.ok(started.every(signal => signal.aborted));
  t.diagnostic('시간 상한 1회, 초과 버림 1개, 종료 후 실행 0개·대기 0개');
});
