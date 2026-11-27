// #1047: 프록시가 넘기는 모든 경로가 서버 진입 분기에서 실제 핸들러를 갖는지 표로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_PATHS } from '../functions/_lib/proxy.js';
import { handlerForPath } from '../server/route-handler.mjs';
import { createTree, addMoment } from '../src/domain.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createMemoryCommunityRepo } from '../server/testing/memory-community-repo.js';
import { createMemoryTreeDiscoverRepo } from '../server/testing/memory-tree-discover-repo.js';
import { createCommunityService, createCommunityHandler } from '../server/community-service.js';
import { ApiError } from '../server/errors.js';

const EXPECTED = new Map([
  ['/api/account', 'storage'], ['/api/account/delete', 'storage'], ['/api/media', 'media'],
  ['/api/workspace', 'storage'], ['/api/shares', 'share'], ['/api/shares/preview', 'share'],
  ['/api/community/shares', 'community'], ['/api/community/stats', 'community'],
  ['/api/community/me/favorites', 'community'], ['/api/community/me/moments', 'community'], ['/api/community/admin/reports', 'community'],
  ['/api/community/my-news', 'community'], ['/api/community/my-news/unread-count', 'community'],
  ['/api/public/tag-moments', 'community'], ['/api/public/moments', 'community'],
  ['/api/feedback', 'feedback'], ['/api/ops-feedback/ingest', 'feedback'], ['/api/board', 'feedback'], ['/api/board/mine', 'feedback'],
  ['/api/board/journal/today', 'feedback'], ['/api/admin/feedback', 'feedback'],
  ['/api/admin/journals', 'feedback'], ['/api/admin/stats', 'storage'],
  ['/api/youtube/oembed', 'youtube'], ['/api/admin/session', 'storage'], ['/api/admin/roles', 'storage'],
  ['/api/admin/customers', 'adminCustomers'], ['/api/admin/customers/views', 'adminCustomers'],
  ['/auth/login', 'auth'], ['/auth/callback', 'auth'], ['/auth/logout', 'auth']
]);

test('프록시 허용 경로 전체가 기대한 핸들러로 간다(빠진 경로 0)', () => {
  const rows = [...ALLOWED_PATHS.keys()].map(path => ({ path, expected: EXPECTED.get(path) ?? null, actual: handlerForPath(path) }));
  const bad = rows.filter(row => row.expected === null || row.expected !== row.actual);
  console.log('ROUTE_TABLE', JSON.stringify(rows));
  assert.deepEqual(bad, [], '핸들러가 없거나 어긋난 경로: ' + JSON.stringify(bad));
  assert.equal(handlerForPath('/api/public/moments'), 'community', '공개 순간 조회는 커뮤니티 핸들러로');
 assert.equal(handlerForPath('/api/public/visits/' + 'v'.repeat(24)), 'share', '방문 공개 조회는 공유 핸들러로');
});

test('로그아웃 GET /api/public/moments?limit=1 → 200과 items 배열', async () => {
  const productId='lovetree-test', principal=s=>({productId,subjectId:s});
  const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId});
  const url='https://www.youtube.com/shorts/aaaa1111111';
  let tree=createTree({subject:'아이유',title:'쇼츠 트리',note:'',emotion:'설렘',date:'2026-11-21',url},'2026-11-21T00:00:00.000Z');
  while(tree.moments.length<3)tree=addMoment(tree,{title:'담은 순간',note:'',emotion:'설렘',date:'2026-11-21',url:''},tree.moments[0].id,'2026-11-21T00:00:00.000Z');
  await workspace.write(principal('singer'),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed'});
  const shareRepo=createMemoryShareRepo();
  const share=await shareRepo.create({productId,shareId:'s'.repeat(24),subjectId:'singer',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:tree.moments.length,origin:'auto'});
  const discoverRepo=createMemoryTreeDiscoverRepo();
  await discoverRepo.set({productId,subjectId:'singer',treeId:tree.id,discover:true});
  const communityRepo=createMemoryCommunityRepo({isDiscoverOn:(p,s,t)=>discoverRepo.isOn(p,s,t)});
  communityRepo.seedShares([share]);
  const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId,admin:{roleFor:async()=>null}});
  const handle=createCommunityHandler({authenticate:async()=>{throw new ApiError(401,'unauthenticated','로그아웃');},service,productId});
  const response=await handle({method:'GET',path:'/api/public/moments',query:new URLSearchParams('limit=1'),headers:{}});
  assert.equal(response.status,200);
  assert.ok(Array.isArray(response.body.items),'items 배열');
  assert.equal(response.body.items.length,1);
  assert.equal(response.body.items[0].videoId,'aaaa1111111');
});
