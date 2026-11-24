import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createCommunityApi} from '../public/v41/community-api.mjs';
import {createProxy} from '../functions/_lib/proxy.js';
test('community client uses fixed same-origin routes and idempotency headers',async()=>{
 const calls=[],fetchImpl=async(url,init={})=>{calls.push({url,init});return new Response(JSON.stringify(url.includes('/comments')?{comments:[]}:{items:[],stats:{},report:{}}),{headers:{'content-type':'application/json'}});},api=createCommunityApi({fetchImpl});
 await api.discover({q:'윤슬',artist:'ILLIT',limit:12});await api.favorite('s'.repeat(24),true);await api.react('s'.repeat(24),false);await api.comments('s'.repeat(24));await api.comment('s'.repeat(24),'hello');await api.report('s'.repeat(24),'check');await api.block('s'.repeat(24));
 assert.equal(calls.every(call=>call.url.startsWith('/api/community/')),true);assert.match(calls[4].init.headers['idempotency-key'],/^comment-/);assert.match(calls[5].init.headers['idempotency-key'],/^report-/);
 assert.equal(new URL(calls[0].url,'https://front.test').searchParams.get('artist'),'ILLIT');
 const shareId='s'.repeat(24);
 await api.react(shareId,false,'like');
 const removeKind=calls.at(-1);
 assert.equal(removeKind.url,`/api/community/shares/${shareId}/reaction?kind=like`);
 assert.equal(removeKind.init.method,'DELETE');
 assert.equal(removeKind.init.body,undefined);
 await api.react(shareId,true,'love');
 const addKind=calls.at(-1);
 assert.equal(addKind.url,`/api/community/shares/${shareId}/reaction`);
 assert.equal(addKind.init.method,'PUT');
 assert.equal(addKind.init.body,JSON.stringify({kind:'love'}));
 await api.react(shareId,false);
 const legacyRemove=calls.at(-1);
 assert.equal(legacyRemove.url,`/api/community/shares/${shareId}/reaction`);
 assert.equal(legacyRemove.init.method,'DELETE');
});
// #952: 둘러보기 카피·CSS 선택자·스키마 이름·admin 글자 검사 13개를 걷어냈다.
// 카피(#community-menu·최신순·많이 담긴 순·원본을 복사하지 않고·대표 순간부터 감상·내 기록 새로 시작)와
// CSS 선택자(#community-list·780px)는 글자 모양일 뿐이라 지웠다. 스키마(lovetree_community_hidden_shares·
// hide_comment)는 community-votes-postgres·deploy-share-schema가 실제 마이그레이션·쿼리로 확인하고,
// 신고 처리 visibility는 community-service가 PATCH로 확인한다. 패널 배선은 v41-cto-453-cde가 mountCommunity를
// 띄워 동작으로 본다.

test('Pages proxy constrains community routes and forwards idempotency only',async()=>{
 const calls=[],fetcher=async(url,init)=>{calls.push({url,method:init.method,headers:Object.fromEntries(init.headers)});return new Response('{}',{headers:{'content-type':'application/json'}});},proxy=createProxy({fetcher});
 const allowed=[['/api/community/shares','GET'],['/api/community/shares/'+ 's'.repeat(24)+'/comments','POST'],['/api/community/shares/'+ 's'.repeat(24)+'/favorite','PUT'],['/api/community/shares/'+ 's'.repeat(24)+'/reaction','DELETE'],['/api/community/shares/'+ 's'.repeat(24)+'/report','POST'],['/api/community/shares/'+ 's'.repeat(24)+'/block','POST'],['/api/community/comments/comment-1','DELETE'],['/api/community/admin/reports/report-1','PATCH']];
 for(const [path,method] of allowed){const headers=method==='POST'?{'content-type':'application/json','idempotency-key':'community-key-1'}:undefined;const response=await proxy({request:new Request('https://front.test'+path,{method,headers,body:method==='POST'?'{}':undefined}),env:{LOVETREE_API_ORIGIN:'https://api.test'}});assert.equal(response.status,200,`${method} ${path}`);}
 const denied=await proxy({request:new Request('https://front.test/api/community/unknown'),env:{LOVETREE_API_ORIGIN:'https://api.test'}});assert.equal(denied.status,404);
 assert.equal(calls.some(call=>call.headers['idempotency-key']==='community-key-1'),true);
});

// ── #792 4단계 ⑤: 공개 무대 담기 화면 계약 ──
import {publicStageCount,stageCountLabel,stageVoteLabel,stageVoteNotice,stageShareId,stageMomentTitle,readStage,toggleStage,STAGE_VOTE_LABEL,VOTE_TOO_NEW_NOTICE,POPULAR_STAGE_TITLE,POPULAR_STAGE_EMPTY} from '../public/v41/community-stages.mjs';

test('#792 ⑤ community-api: 무대 조회·인기 무대·담기 경로와 메서드', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => { calls.push({ url, method: init.method }); return new Response(JSON.stringify({ ok: true, items: [] }), { headers: { 'content-type': 'application/json' } }); };
  const api = createCommunityApi({ fetchImpl });
  const shareId = 's'.repeat(24), momentId = 'm-1', stageId = 'stage-1';
  await api.momentStage(shareId, momentId);
  await api.popularStages();
  await api.stageDetail(stageId, { currentShareId: shareId, cursor: 'cur' });
  await api.voteStage(stageId, true);
  await api.voteStage(stageId, false);
  assert.equal(calls[0].url, `/api/community/shares/${shareId}/moments/${momentId}/stage`);
  assert.equal(calls[0].method, undefined);
  assert.equal(calls[1].url, '/api/community/stages/popular');
  assert.match(calls[2].url, new RegExp(`^/api/community/stages/${stageId}\?`));
  assert.equal(new URL(calls[2].url, 'https://front.test').searchParams.get('cursor'), 'cur');
  assert.equal(calls[3].url, `/api/community/stages/${stageId}/vote`);
  assert.equal(calls[3].method, 'PUT');
  assert.equal(calls[4].method, 'DELETE');
});

test('#792 ⑤ 프록시: 무대 경로는 허용 목록에 있고, 담기는 누르기(PUT)·취소(DELETE)만 통과한다', async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, method: init.method }); return new Response('{}', { headers: { 'content-type': 'application/json' } }); };
  const proxy = createProxy({ fetcher });
  const shareId = 's'.repeat(24);
  const allowed = [
    ['/api/community/stages/popular', 'GET'],
    ['/api/community/shares/' + shareId + '/moments/m-1/stage', 'GET'],
    ['/api/community/stages/stage-1', 'GET'],
    ['/api/community/stages/stage-1/vote', 'PUT'],
    ['/api/community/stages/stage-1/vote', 'DELETE'],
  ];
  for (const [path, method] of allowed) {
    const response = await proxy({ request: new Request('https://front.test' + path, { method }), env: { LOVETREE_API_ORIGIN: 'https://api.test' } });
    assert.equal(response.status, 200, `${method} ${path}`);
  }
  const notAllowed = await proxy({ request: new Request('https://front.test/api/community/stages/stage-1/vote', { method: 'POST' }), env: { LOVETREE_API_ORIGIN: 'https://api.test' } });
  assert.equal(notAllowed.status, 405, '담기는 PUT·DELETE만');
  const denied = await proxy({ request: new Request('https://front.test/api/community/stages/extra/path', { method: 'GET' }), env: { LOVETREE_API_ORIGIN: 'https://api.test' } });
  assert.equal(denied.status, 404, '무대 경로가 아니라서 막는다');
});

test('#792 ⑤ 화면 규칙: 3 미만은 숫자를 숨기고, 담은 상태는 ✓, 가입 7일 안내는 화면에서 한 번만', () => {
  assert.equal(publicStageCount(2), null);
  assert.equal(publicStageCount(3), 3);
  assert.equal(publicStageCount(null), null);
  assert.equal(stageCountLabel('이번 주 담은 사람', 2), '이번 주 담은 사람');
  assert.equal(stageCountLabel('이번 주 담은 사람', 5), '이번 주 담은 사람 5');
  assert.equal(stageVoteLabel(false), STAGE_VOTE_LABEL);
  assert.equal(stageVoteLabel(true), '✓ 이 무대 담기');
  assert.equal(stageVoteNotice({ code: 'vote_too_new' }), VOTE_TOO_NEW_NOTICE);
  assert.equal(stageVoteNotice({ code: 'rate_limited', message: '잠시 뒤 다시 시도해 주세요.' }), '잠시 뒤 다시 시도해 주세요.');
  assert.equal(stageShareId('#share/' + 'r'.repeat(24) + '/book'), 'r'.repeat(24));
  assert.equal(stageShareId('#my/board?tree=t1'), '');
  assert.equal(stageMomentTitle({ title: '  Super Shy  ' }), 'Super Shy');
  assert.equal(stageMomentTitle({}), '공개 무대');
  // #952: 7일 안내 문구가 세 파일에 몇 번 적혔는지 세던 글자 검사는 지웠다(문구 중복은 화면 동작이 아니다).
  // 안내가 한 번만 뜨는지는 이 파일의 readStage·toggleStage 시험과 화면 시험이 확인한다.
});

test('#792 ⑤ readStage: 표지 순간이 공개 무대일 때만 상태를 준다 (없으면 null)', async () => {
  const moments = { ok: true, stageId: 'stage-9' };
  let detailCalled = 0;
  const api = {
    momentStage: async () => moments,
    stageDetail: async () => { detailCalled += 1; return { ok: true, voted: true, saved: true, weeklyVoters: 2, title: 'Super Shy' }; },
    voteStage: async () => ({ ok: true, weeklyVoters: 4 }),
  };
  const stage = await readStage({ api, shareId: 's'.repeat(24), momentId: 'm-1' });
  assert.equal(stage.stageId, 'stage-9');
  assert.equal(stage.voted, true);
  assert.equal(stage.weeklyVoters, null, '2표는 null(3 미만 — 숫자 숨김)');
  assert.equal(detailCalled, 1);
  assert.equal(await readStage({ api, shareId: 's'.repeat(24), momentId: '' }), null, '표지 순간이 없으면 확인하지 않는다');
  assert.equal(await readStage({ api: { momentStage: async () => ({ ok: false, code: 'stage_not_found' }) }, shareId: 's'.repeat(24), momentId: 'm-2' }), null, '공개 무대가 아니면 단추를 만들지 않는다');
});

test('#792 ⑤ toggleStage: 성공하면 누름 상태와 3 미만 규칙 숫자를 돌려준다', async () => {
  const api = { voteStage: async () => ({ ok: true, weeklyVoters: 7 }) };
  const done = await toggleStage({ api, stageId: 'stage-1', voted: false });
  assert.equal(done.ok, true);
  assert.equal(done.voted, true);
  assert.equal(done.weeklyVoters, 7);
  const blocked = await toggleStage({ api: { voteStage: async () => ({ ok: false, code: 'vote_too_new', message: VOTE_TOO_NEW_NOTICE }) }, stageId: 'stage-1', voted: false });
  assert.equal(blocked.ok, false);
  assert.equal(stageVoteNotice(blocked.answer), VOTE_TOO_NEW_NOTICE);
});

test('#792 ⑤ 인기 무대 빈 안내는 한 곳에서 온다', () => {
  assert.equal(POPULAR_STAGE_EMPTY, '이번 주 인기 무대를 모으고 있어요');
});

test('#1273 7번 둘러보기: AI 명예회원 배지를 사람 회원과 구분한다(기존 토큰)', () => {
  const panel = fs.readFileSync(new URL('../public/v41/community-panel.mjs', import.meta.url), 'utf8');
  const moments = fs.readFileSync(new URL('../public/v41/community-moments.mjs', import.meta.url), 'utf8');
  const shellCss = fs.readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
  const momentsCss = fs.readFileSync(new URL('../public/v41/community.css', import.meta.url), 'utf8');
  // #1330: 두 배지를 한 줄로 합쳐도 별 표식은 유지한다.
  assert.match(panel, /✦ AI · [\s\S]{0,12}순간/, '트리 카드 배지에 별 표식');
  assert.match(moments, /moments-ai','✦ AI 명예회원'/, '순간 카드 배지에 별 표식');
  assert.match(shellCss, /community-cover-badge\.community-ai\{[^}]*var\(--lt-rose\)/, '카드 배지는 장미 토큰');
  assert.match(momentsCss, /\.moments-ai\{[^}]*var\(--lt-rose\)/, '순간 배지도 장미 토큰');
  assert.doesNotMatch(momentsCss, /\.moments-ai\{[^}]*var\(--lt-gold-line\)/, '사람 이름표와 같은 금색이 아니다');
});
