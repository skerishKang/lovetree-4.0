import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildGraph, footprint, pathFor, ORDER_Y_BASE, ORDER_Y_RANGE } from '../public/v41/graph-model.mjs';
import { makeTag } from '../public/v41/tags.mjs';
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 vm 에도 넣는다.
import { timingRatio, countRatio, TIMING_RATIO_LIMIT, TIMING_CEILING_MS } from './helpers/timing-ratio.mjs';

// #627 2단계 PR2: 그래프 보기의 순수 규칙(buildGraph·footprint·pathFor)을 입력→출력으로만 본다.
// 설계 문서 docs/GRAPH_VIEW_20261115.md §2. 소스 글자 검사는 하지 않는다(동작 시험만).

const M = (id, date, tags = [], extra = {}) => ({ id, date, keywords: tags, title: '순간 ' + id, ...extra });
const stage = (v) => makeTag('stage', v);
const song = (v) => makeTag('song', v);
const artist = (v) => makeTag('artist', v);
const member = (v) => makeTag('member', v);

test('순간 0개(또는 id 없는 엉뚱한 값): 빈 그래프와 빈 구간', () => {
  for (const input of [null, undefined, [], [null, { date: '2026-11-01' }, {}]]) {
    const graph = buildGraph(input);
    assert.deepEqual(graph, {
      hubs: [], stacks: [], moments: [], shelf: [],
      footprint: { order: [], neighbors: {}, segments: [] }
    });
    assert.deepEqual(pathFor(graph, { momentId: 'm1' }), { segments: [] });
  }
});

test('순간 1개: 허브는 없고(2개 미만), 발자취는 점 하나(구간 없음)', () => {
  const graph = buildGraph([M('m1', '2026-11-01', [artist('RESCENE')])]);
  assert.deepEqual(graph.hubs, []);
  assert.deepEqual(graph.moments, [{ id: 'm1', hubId: null, alsoHubIds: [], stackId: null }]);
  assert.deepEqual(graph.stacks, []);
  assert.deepEqual(graph.shelf, []);
  assert.deepEqual(graph.footprint.order, ['m1']);
  assert.deepEqual(graph.footprint.segments, []);
  assert.deepEqual(graph.footprint.neighbors.m1, { prev: null, next: null });
});

test('허브는 같은 값이 순간 2개 이상일 때만 — 1개뿐인 값은 허브도 소속도 없다', () => {
  const graph = buildGraph([
    M('a1', '2026-11-01', [song('15-LOVE')]),
    M('a2', '2026-11-02', [song('15-LOVE'), song('With')]),
  ]);
  assert.deepEqual(graph.hubs.map((h) => [h.kindId, h.value, h.count]), [['song', '15-LOVE', 2]]);
  const a2 = graph.moments.find((m) => m.id === 'a2');
  assert.equal(a2.hubId, 'song:15-love');
  assert.deepEqual(a2.alsoHubIds, [], '1개뿐인 노래:With는 허브가 아니라 함께 속함에도 없다');
});

test('이름 없는 묶음은 만들지 않는다 — 값이 실질적으로 빈 꼬리표(점·기호뿐)는 허브 후보에서 뺀다(#854)', () => {
  // '가수: .'같은 꼬리표는 tagKey가 ''가 되어 범례에 이름 없는 색 점을 남겼다.
  const graph = buildGraph([
    M('b1', '2026-11-01', [artist('아이유'), artist('.')]),
    M('b2', '2026-11-02', [artist('아이유'), artist('.')]),
  ]);
  assert.deepEqual(graph.hubs.map((h) => [h.kindId, h.value]), [['artist', '아이유']], '이름이 서는 묶음만 남는다');
  assert.ok(graph.hubs.every((h) => String(h.value).trim() !== ''), '이름 없는 허브 0');
  const b1 = graph.moments.find((m) => m.id === 'b1');
  assert.equal(b1.hubId, 'artist:아이유', '이름 없는 값은 소속으로도 섞지 않는다');
});

test('순간 10개: 꼬리표로 허브·1차 소속·함께 속함·선반이 만들어진다', () => {
  const moments = [
    M('s1', '2026-11-05', [stage('쇼챔피언'), song('15-LOVE'), artist('RESCENE'), member('지우')]),
    M('s2', '2026-11-06', [stage('쇼챔피언'), song('15-LOVE')]),
    M('s3', '2026-11-07', [stage('쇼챔피언')]),
    M('a1', '2026-11-08', [song('15-LOVE')]),
    M('a2', '2026-11-09', [song('15-LOVE')]),
    M('g1', '2026-11-10', [artist('RESCENE')]),
    M('g2', '2026-11-11', [artist('RESCENE')]),
    M('c1', '2026-11-12', [member('지우')]),
    M('c2', '2026-11-13', [member('지우')]),
    M('t1', '2026-11-14'),
  ];
  const graph = buildGraph(moments);
  // 허브: 무대 3·노래 4(s1·s2·a1·a2)·가수 3(s1·g1·g2)·멤버 3(s1·c1·c2) — 종류 우선순위 → 값 순서(결정론).
  assert.deepEqual(graph.hubs.map((h) => [h.kindId, h.value, h.count]), [
    ['stage', '쇼챔피언', 3], ['song', '15-LOVE', 4], ['artist', 'RESCENE', 3], ['member', '지우', 3],
  ]);
  // 1차 소속은 무대 > 노래 > 멤버 > 가수 순서 — s1은 무대 묶음에 살고 나머지는 함께 속함(키워드 순서).
  const s1 = graph.moments.find((m) => m.id === 's1');
  assert.equal(s1.hubId, 'stage:쇼챔피언');
  assert.deepEqual(s1.alsoHubIds, ['song:15-love', 'artist:rescene', 'member:지우']);
  // 멤버도 1차 소속 후보(문서 v2) — 멤버 꼬리표만 달린 순간은 멤버 묶음에 산다.
  const c1 = graph.moments.find((m) => m.id === 'c1');
  assert.equal(c1.hubId, 'member:지우');
  assert.deepEqual(c1.alsoHubIds, []);
  const memberHub = graph.hubs.find((h) => h.kindId === 'member');
  assert.deepEqual(memberHub.momentIds, ['c1', 'c2'], '멤버 묶음은 멤버 꼬리표만 달린 c1·c2');
  assert.deepEqual(memberHub.linkedIds, ['s1', 'c1', 'c2'], 's1은 무대 묶음에 살지만 이 값은 함께 가진다');
  // 꼬리표 없는 순간은 선반 목록으로.
  assert.deepEqual(graph.shelf, ['t1']);
  // 묶음(1차 소속)은 무대 허브에 세 순간 — 선반 순간은 어느 허브에도 없다.
  const stageHub = graph.hubs[0];
  assert.deepEqual(stageHub.momentIds, ['s1', 's2', 's3']);
  // 노래 허브의 묶음은 1차 소속(a1·a2)뿐 — s1·s2는 무대 묶음에 살므로 linkedIds에만 있다.
  const songHub = graph.hubs.find((h) => h.kindId === 'song');
  assert.deepEqual(songHub.momentIds, ['a1', 'a2']);
  assert.deepEqual(songHub.linkedIds, ['s1', 's2', 'a1', 'a2']);
});

test('1차 소속 우선순위: 멤버는 가수보다 앞서고, 무대·노래가 있으면 물러난다', () => {
  const moments = [
    M('c1', '2026-11-01', [member('지우')]),
    M('c2', '2026-11-02', [member('지우')]),
    M('sc', '2026-11-03', [stage('쇼챔피언'), member('지우')]),
    M('s2', '2026-11-04', [stage('쇼챔피언')]),
  ];
  const graph = buildGraph(moments);
  // 멤버 꼬리표만 있으면 멤버 허브의 1차 소속이 된다(문서 v2 순서: 무대 > 노래 > 멤버 > 가수).
  assert.deepEqual(graph.moments.find((m) => m.id === 'c1'), { id: 'c1', hubId: 'member:지우', alsoHubIds: [], stackId: null });
  const memberHub = graph.hubs.find((h) => h.kindId === 'member');
  assert.deepEqual(memberHub.momentIds, ['c1', 'c2']);
  // 무대가 함께 있으면 멤버는 물러난다 — 그 순간은 무대 묶음에 살고 멤버와는 함께 속함.
  assert.equal(graph.moments.find((m) => m.id === 'sc').hubId, 'stage:쇼챔피언');
  assert.deepEqual(graph.moments.find((m) => m.id === 'sc').alsoHubIds, ['member:지우']);
  assert.deepEqual(memberHub.momentIds, ['c1', 'c2'], 'sc는 멤버 묶음의 1차 소속이 아니다');
});

test('1차 소속 우선순위: 노래가 가수보다, 무대가 노래보다 먼저다', () => {
  const moments = [
    M('ag', '2026-11-01', [artist('RESCENE'), song('15-LOVE')]),
    M('sa', '2026-11-02', [song('15-LOVE'), stage('쇼챔피언')]),
    M('g1', '2026-11-03', [stage('데뷔쇼'), artist('RESCENE')]),
    M('g2', '2026-11-04', [stage('데뷔쇼'), artist('RESCENE')]),
    M('s1', '2026-11-05', [stage('쇼챔피언')]),
    M('s2', '2026-11-06', [stage('쇼챔피언')]),
    M('a1', '2026-11-07', [song('15-LOVE')]),
    M('a2', '2026-11-08', [song('15-LOVE')]),
  ];
  const graph = buildGraph(moments);
  assert.equal(graph.moments.find((m) => m.id === 'ag').hubId, 'song:15-love');
  assert.equal(graph.moments.find((m) => m.id === 'sa').hubId, 'stage:쇼챔피언');
  assert.equal(graph.moments.find((m) => m.id === 'g1').hubId, 'stage:데뷔쇼');
  // 문서 §2 예: 가수 허브가 다른 1차 소속에만 걸리면 1차 소속이 없는 고아 허브가 된다.
  const rescene = graph.hubs.find((h) => h.kindId === 'artist');
  assert.deepEqual(rescene.momentIds, [], 'RESCENE은 어느 순간의 1차 소속도 아니다 — 묶음이 비어 고아 허브');
  assert.deepEqual(rescene.linkedIds, ['ag', 'g1', 'g2'], '대신 값을 함께 가진 순간과는 점선으로 이어진다');
});

test('꼬리표가 없는 순간만 선반에 간다 — 종류 없는 옛 꼬리표는 꼬리표다', () => {
  const graph = buildGraph([
    M('t1', '2026-11-01'),                                  // keywords 없음
    M('t2', '2026-11-02', []),                              // 빈 배열
    M('t3', '2026-11-03', ['', '   ']),                     // 빈 낱말만
    M('l1', '2026-11-04', ['무대']),                        // 종류 없는 옛 꼬리표(평범한 낱말)
    M('l2', '2026-11-05', ['무대']),
  ]);
  assert.deepEqual(graph.shelf, ['t1', 't2', 't3']);
  const l1 = graph.moments.find((m) => m.id === 'l1');
  assert.equal(l1.hubId, null, '종류 없는 옛 꼬리표는 허브 재료가 아니다');
  assert.deepEqual(graph.hubs, [], '종류 없는 옛 꼬리표로는 허브를 만들지 않는다');
});

test('표기 차이는 하나의 허브로 센다(꼬리표 정리와 같은 tagKey)', () => {
  const graph = buildGraph([
    M('p1', '2026-11-01', [song('Super Shy')]),
    M('p2', '2026-11-02', [song('super shy.')]),
  ]);
  assert.deepEqual(graph.hubs.map((h) => [h.id, h.value, h.count]), [['song:super shy', 'Super Shy', 2]]);
  assert.equal(graph.moments[0].hubId, 'song:super shy');
  assert.equal(graph.moments[1].hubId, 'song:super shy');
  assert.deepEqual(graph.moments[1].alsoHubIds, []);
});

test('발자취: 날짜 순(오래된→최신), 같은 날은 내 순서(순위)→만든 순서→id', () => {
  const day = '2026-11-05';
  const moments = [
    M('f1', '2026-11-10', [], { createdOrder: 1 }),                       // 최신 날
    M('mb', day, [], { y: ORDER_Y_BASE + 1 }),                            // 순위 1
    M('mc', day, [], { y: ORDER_Y_BASE + 0 }),                            // 순위 0, id가 mb보다 뒤
    M('ma', day, [], { y: ORDER_Y_BASE + 0 }),                            // 순위 0(같음) → id로 mb보다 먼저
    M('me', day, [], { createdOrder: 5 }),                                // 순위 없음, 만든 순서 5
    M('md', day, [], { createdOrder: 3 }),                                // 순위 없음, 만든 순서 3
    M('mf', day, []),                                                     // 순위 없음, 만든 순서 없음(0)
    M('e1', '2026-11-01', [], { createdOrder: 1 }),                       // 가장 오래된 날
  ];
  const fp = footprint(moments);
  assert.deepEqual(fp.order, ['e1', 'ma', 'mc', 'mb', 'mf', 'md', 'me', 'f1']);
  assert.deepEqual(fp.segments.map(([a, b]) => a + '>' + b), [
    'e1>ma', 'ma>mc', 'mc>mb', 'mb>mf', 'mf>md', 'md>me', 'me>f1',
  ]);
  assert.deepEqual(fp.neighbors.mb, { prev: 'mc', next: 'mf' });
  assert.deepEqual(fp.neighbors.e1, { prev: null, next: 'ma' });
  assert.deepEqual(fp.neighbors.f1, { prev: 'me', next: null });
  // buildGraph이 넣은 발자취와 별도 호출 결과가 같다(한 벌).
  assert.deepEqual(buildGraph(moments).footprint, fp);
});

test('순위 값의 경계는 보드(board-model)와 같은 값을 쓴다', () => {
  const scope = { window: {}, LTEscapeHtml: globalThis.LTEscapeHtml };
  vm.runInNewContext(readFileSync(new URL('../public/v41/views/board/board-model.js', import.meta.url), 'utf8'), scope);
  const board = scope.window.LT58Model;
  assert.equal(board.ORDER_Y_BASE, ORDER_Y_BASE, '순위 시작값은 보드 한 벌과 같다');
  // 보드가 순위로 보는 경계 바로 밖(y = -3001)은 발자취에서도 순위가 아니다.
  const graph = buildGraph([
    M('mx', '2026-11-01', [], { y: ORDER_Y_BASE }),
    M('my', '2026-11-01', [], { y: ORDER_Y_BASE + ORDER_Y_RANGE, createdOrder: 9 }),
  ]);
  assert.deepEqual(graph.footprint.order, ['mx', 'my'], 'y=-3001은 순위가 아니라 만든 순서로 읽힌다');
});

test('pathFor(순간): 그 순간에 걸린 앞·뒤 구간만 돌려준다', () => {
  const moments = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => M(id, `2026-11-0${i + 1}`, []));
  const graph = buildGraph(moments);
  assert.deepEqual(pathFor(graph, { momentId: 'p3' }), { segments: [['p2', 'p3'], ['p3', 'p4']] });
  assert.deepEqual(pathFor(graph, { momentId: 'p1' }), { segments: [['p1', 'p2']] });
  assert.deepEqual(pathFor(graph, { momentId: 'p5' }), { segments: [['p4', 'p5']] });
});

test('pathFor(허브): 그 허브에 연결된 순간(1차+함께 속함)이 지나는 구간만', () => {
  const moments = [
    M('p1', '2026-11-01', []),
    M('p2', '2026-11-02', [stage('팬콘'), member('지우')]),
    M('p3', '2026-11-03', [stage('팬콘')]),
    M('p4', '2026-11-04', [stage('팬콘')]),
    M('p5', '2026-11-05', []),
    M('p6', '2026-11-06', [member('지우')]),
  ];
  const graph = buildGraph(moments);
  const stageHub = graph.hubs.find((h) => h.kindId === 'stage');
  const memberHub = graph.hubs.find((h) => h.kindId === 'member');
  // 무대 허브 묶음(p2·p3·p4)을 지나는 구간만 밝힌다.
  assert.deepEqual(pathFor(graph, { hubId: stageHub.id }), { segments: [['p1', 'p2'], ['p2', 'p3'], ['p3', 'p4'], ['p4', 'p5']] });
  // 멤버 허브는 1차 소속(p6)과 함께 속함(p2)을 한 벌로 지나는 구간이 나온다.
  assert.deepEqual(pathFor(graph, { hubId: memberHub.id }), { segments: [['p1', 'p2'], ['p2', 'p3'], ['p5', 'p6']] });
});

test('pathFor: 모르는 id·빈 선택은 빈 구간, 둘 다 넘기면 순간을 우선한다', () => {
  const moments = [
    M('p1', '2026-11-01', [stage('팬콘')]),
    M('p2', '2026-11-02', [stage('팬콘')]),
  ];
  const graph = buildGraph(moments);
  assert.deepEqual(pathFor(graph, { momentId: 'nope' }), { segments: [] });
  assert.deepEqual(pathFor(graph, { hubId: 'stage:없는무대' }), { segments: [] });
  assert.deepEqual(pathFor(graph, {}), { segments: [] });
  assert.deepEqual(pathFor(graph, null), { segments: [] });
  assert.deepEqual(pathFor(null, { momentId: 'p1' }), { segments: [] });
  const both = pathFor(graph, { hubId: 'stage:팬콘', momentId: 'p1' });
  assert.deepEqual(both, { segments: [['p1', 'p2']] }, '순간이 허브보다 구체적이다');
});

test('순간 300개: buildGraph는 30개에 비해 제곱으로 느려지지 않는다', () => {
  const moments = [];
  for (let i = 0; i < 300; i += 1) {
    const tags = [stage('무대 ' + (i % 30)), song('노래 ' + (i % 12)), artist('가수 ' + (i % 5))];
    // 날짜가 되감기지 않게 달·날을 i에서 한 벌로 계산한다(같은 날이 겹치지 않아 순서가 단순하다).
    const date = `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
    moments.push(M('m' + i, date, tags, { createdOrder: i + 1 }));
  }
  const { smallMs, bigMs, ratio, last: graph } = timingRatio({
    small: () => buildGraph(moments.slice(0, 30)),
    big: () => buildGraph(moments),
  });
  assert.equal(graph.hubs.length, 30 + 12 + 5, '무대 30·노래 12·가수 5 허브');
  assert.equal(graph.moments.length, 300);
  // 절대 ms 대신 같은 실행의 30개와 비교한다(#728 CI windows 러너 흔들림, #731).
  assert.ok(ratio <= TIMING_RATIO_LIMIT, `300개/30개 비율 ${ratio.toFixed(1)}배 ≤ ${TIMING_RATIO_LIMIT}배 (30개 ${smallMs.toFixed(2)}ms · 300개 ${bigMs.toFixed(1)}ms)`);
  assert.ok(bigMs <= TIMING_CEILING_MS, `300순간 계산 ${bigMs.toFixed(1)}ms ≤ ${TIMING_CEILING_MS}ms`);
  const counted = countRatio({ small: { fn: buildGraph, list: moments.slice(0, 30) }, big: { fn: buildGraph, list: moments } });
  assert.ok(counted.ratio <= TIMING_RATIO_LIMIT, `그래프 입력 읽기 300개/30개 ${counted.ratio.toFixed(1)}배 ≤ ${TIMING_RATIO_LIMIT}배 (${counted.smallCount} → ${counted.bigCount})`);
  // 300개에서도 발자취는 한 줄: 구간 299개, 앞뒤 이웃이 맞다.
  assert.equal(graph.footprint.segments.length, 299);
  assert.equal(graph.footprint.order[0], 'm0');
  assert.equal(graph.footprint.neighbors.m0.prev, null);
  assert.equal(graph.footprint.order[299], 'm299');
  assert.equal(graph.footprint.neighbors.m299.next, null);
});

test('같은 영상·같은 무대는 stacks 한 무더기 — leadId는 발자쭈다 가장 앞선 순간, stackId는 묶음 열쇠', () => {
  const moments = [
    M('v1', '2026-11-01', [stage('인기가요'), song('Super Shy')], { url: 'https://www.youtube.com/watch?v=aaa111bbb01' }),
    M('v2', '2026-11-02', [stage('인기가요'), song('Super Shy')], { url: 'https://youtu.be/aaa111bbb01?t=32' }),
    M('s1', '2026-11-05', [stage('뮤직뱅크'), song('The Chase')], { url: 'https://youtu.be/bbb222ccc02' }),
    M('s2', '2026-11-05', [stage('뮤직뱅크'), song('The Chase')], { url: 'https://youtu.be/ccc333ddd03' }),
    M('s3', '2026-11-05', [stage('뮤직뱅크'), song('The Chase')], { url: 'https://www.youtube.com/shorts/ddd444eee04' }),
    M('o1', '2026-11-08', [stage('쇼챔피언'), song('With')], { url: 'https://youtu.be/eee555fff05' }),
    M('o2', '2026-11-08', [stage('쇼챔피언'), song('With')], { url: 'https://www.youtube.com/embed/eee555fff05' }),
    M('u1', '2026-11-09', [], { url: 'https://youtu.be/fff666ggg06' }),
  ];
  const graph = buildGraph(moments);
  const videoStacks = graph.stacks.filter((s) => s.kind === 'same-video');
  assert.deepEqual(videoStacks.map((s) => [s.key, s.momentIds]), [
    ['aaa111bbb01', ['v1', 'v2']],
    ['eee555fff05', ['o1', 'o2']],
  ], '같은 영상 2번 — 주소 모양이 달라도 id가 같으면 한 무더기다');
  assert.equal(videoStacks[0].leadId, 'v1', 'leadId는 발자쭈다 가장 앞선 순간');
  const stageStacks = graph.stacks.filter((s) => s.kind === 'same-stage');
  const fancamStack = stageStacks.find((s) => s.momentIds.length === 3);
  assert.deepEqual(fancamStack.momentIds, ['s1', 's2', 's3'], '같은 무대 직캠 3개(영상은 셋 다 다르다)');
  assert.equal(fancamStack.leadId, 's1');
  assert.deepEqual(stageStacks.find((s) => s.momentIds.length === 2).momentIds, ['o1', 'o2']);
  assert.equal(graph.stacks.length, 4, '같은 영상 2 + 같은 무대 2');
  assert.equal(graph.moments.find((m) => m.id === 'v1').stackId, 'aaa111bbb01', 'stackId는 묶음 열쇠다(같은 영상은 영상 id)');
  assert.equal(graph.moments.find((m) => m.id === 's1').stackId, fancamStack.key);
  assert.equal(graph.moments.find((m) => m.id === 'o1').stackId, 'eee555fff05', '두 종류에 모두 걸리면 같은 영상 묶음을 권한다');
  assert.equal(graph.moments.find((m) => m.id === 'u1').stackId, null, '겹침이 없으면 null이다');
  // 허브·1차 소속·발자취 규칙은 그대로다.
  assert.deepEqual(graph.hubs.map((h) => [h.kindId, h.value, h.count]), [
    ['stage', '뮤직뱅크', 3], ['stage', '쇼챔피언', 2], ['stage', '인기가요', 2],
    ['song', 'Super Shy', 2], ['song', 'The Chase', 3], ['song', 'With', 2],
  ]);
  assert.equal(graph.moments.find((m) => m.id === 'v1').hubId, 'stage:인기가요');
  assert.equal(graph.moments.find((m) => m.id === 's1').hubId, 'stage:뮤직뱅크');
  assert.deepEqual(graph.shelf, ['u1']);
  assert.deepEqual(graph.footprint.order, ['v1', 'v2', 's1', 's2', 's3', 'o1', 'o2', 'u1']);
});

test('순간 300개(겹치는 영상·같은 무대 섞임): stacks는 30개에 비해 제곱으로 느려지지 않는다', () => {
  // 같은 영상끼리 같은 무대에 오도록 묶는다. 앞 30개도 같은 모양(영상 15개×2번, 무대 두 개)이라
  // 크기만 다른 두 입력을 비교한다(#1179 후속).
  const moments = [];
  for (let i = 0; i < 300; i += 1) {
    const video = Math.floor(i / 2) % 150; // 영상 150개 × 2번, 짝지은 두 순간은 같은 무대
    const first = video % 2 === 0;
    moments.push(M('m' + i, first ? '2026-11-05' : '2026-11-12', [stage(first ? '뮤직뱅크' : '인기가요'), song('Super Shy')], {
      url: `https://youtu.be/v${String(video).padStart(10, '0')}`,
      createdOrder: i + 1,
    }));
  }
  const { smallMs, bigMs, ratio, last: graph } = timingRatio({
    small: () => buildGraph(moments.slice(0, 30)),
    big: () => buildGraph(moments),
  });
  assert.equal(graph.stacks.filter((s) => s.kind === 'same-video').length, 150, '영상마다 2번씩 — 같은 영상 묶음 150');
  assert.deepEqual(graph.stacks.filter((s) => s.kind === 'same-stage').map((s) => s.momentIds.length), [150, 150], '같은 날 같은 무대·노래 150씩');
  assert.equal(graph.stacks[0].leadId, 'm0', '묶음의 얼굴은 발자쭈다 앞선 순간');
  assert.equal(graph.moments.filter((m) => m.stackId != null).length, 300, '모든 순간이 묶음에 든다');
  const videoKeys = new Set(graph.stacks.filter((s) => s.kind === 'same-video').map((s) => s.key));
  assert.ok(graph.moments.every((m) => videoKeys.has(m.stackId)), '두 종류에 모두 걸려도 stackId는 같은 영상 묶음 열쇠다');
  // 절대 ms 대신 같은 실행의 30개와 비교한다(#728 CI windows 러너 흔들림, #731).
  assert.ok(ratio <= TIMING_RATIO_LIMIT, `300개/30개 비율 ${ratio.toFixed(1)}배 ≤ ${TIMING_RATIO_LIMIT}배 (30개 ${smallMs.toFixed(2)}ms · 300개 ${bigMs.toFixed(1)}ms)`);
  assert.ok(bigMs <= TIMING_CEILING_MS, `300순간 stacks 계산 ${bigMs.toFixed(1)}ms ≤ ${TIMING_CEILING_MS}ms`);
  const counted = countRatio({ small: { fn: buildGraph, list: moments.slice(0, 30) }, big: { fn: buildGraph, list: moments } });
  assert.ok(counted.ratio <= TIMING_RATIO_LIMIT, `묶음 입력 읽기 300개/30개 ${counted.ratio.toFixed(1)}배 ≤ ${TIMING_RATIO_LIMIT}배 (${counted.smallCount} → ${counted.bigCount})`);
});
