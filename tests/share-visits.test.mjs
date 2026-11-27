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
  return {repo,visits,get,shareRepo,advance:ms=>{at+=ms},hide:value=>{hidden=value},privatize:value=>{privateTree=value}};
}

test('익명 방문과 날짜 경계 중복, 만료 정리 뒤 누적값 유지',async()=>{
  const f=await fixture();
  const first=await f.get({});
  assert.equal(first.status,200); assert.equal(first.body.stats.visits,1);
  assert.equal(typeof first.body.stats.visits,'number');
  assert.equal(JSON.stringify(first.body).includes(visitor.clientIp),false);
  const owner=await f.get({cookie:'__Host-lovetree-access=fixture'});
  assert.equal(owner.body.stats.visits,1);
  f.advance(10*60*1000);
  const cached=await f.get({'if-none-match':first.headers.etag});
  assert.equal(cached.status,304); assert.equal(cached.headers.etag,first.headers.etag);
  f.advance(VISIT_WINDOW_MS);
  assert.equal(await f.visits.prune(),1);
  assert.equal(await f.visits.count(shareId),1);
  const next=await f.get({'if-none-match':first.headers.etag});
  assert.equal(next.status,200); assert.equal(next.body.stats.visits,2);
  assert.notEqual(next.headers.etag,first.headers.etag);
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
});

test('방문 자료의 칼럼과 되돌리기 범위',()=>{
  const sql=readFileSync(new URL('../server/db/migrations/share-visits-261127.sql',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../server/db/schema.sql',import.meta.url),'utf8');
  assert.ok(schema.includes(sql.trim()));
  const cols=table=>sql.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+' \\(([\\s\\S]*?)\\n\\);'))[1].split('\n').map(line=>line.trim().split(' ')[0]).filter(x=>x && !['PRIMARY','FOREIGN'].includes(x));
  assert.deepEqual(cols('lovetree_share_visits'),['product_id','share_id','visits']);
  assert.deepEqual(cols('lovetree_share_visit_dedup'),['product_id','share_id','visitor_hash','expires_at']);
});
