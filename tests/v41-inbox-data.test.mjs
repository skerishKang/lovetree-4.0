// #327(① 데이터 규칙): 빠른 추가(기본 트리 "모아둔 순간", inbox=true)·순간 옮기기·고른 순간으로
// 새 트리 만들기의 도메인 규칙. 서버(src/domain.js)와 클라이언트(public/v41/domain.mjs) 두 벌이
// 같은 규칙이므로 같은 시험 표를 두 벌에 모두 돌린다. 동작은 함수 직접 호출로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as serverDomain from '../src/domain.js';
import * as webDomain from '../public/v41/domain.mjs';

const CLOCK = '2026-11-09T10:00:00.000Z';
const URL = 'https://example.com/watch/abc';
const PHOTO = 'https://lovetree-4-0.pages.dev/api/media/0f0e0d0c-0b0a-4999-8999-000000000001.png';

function moment(id, parentId, title, extra = {}) {
  return { id, parentId, links: [], title, note: '', emotion: '설렘', date: '2026-11-09', relation: '', url: '', createdAt: extra.createdAt || `2026-11-0${extra.seq || 1}T09:00:00.000Z`, ...extra.fields };
}
function tree(id, moments, extra = {}) {
  const first = moments.find(m => m.parentId === null);
  return { id, subject: extra.subject || '윤슬', title: extra.title || `${extra.subject || '윤슬'}, 나의 순간들`, coverMomentId: extra.coverMomentId || '', coverDesign: '', createdAt: CLOCK, updatedAt: CLOCK, moments, ...extra.fields };
}
// a(시작) → b → c 사슬 + a↔b 링크
function chainState() {
  const a = moment('ma', null, '첫 순간', { seq: 1 }), b = moment('mb', 'ma', '둘째 순간', { seq: 2 }), c = moment('mc', 'mb', '셋째 순간', { seq: 3 });
  const linked = [a, b, c].map(m => m.id === 'ma' ? { ...m, links: ['mb'] } : m.id === 'mb' ? { ...m, links: ['ma'] } : m);
  return { version: 1, trees: [tree('t1', linked, { coverMomentId: 'mb' }), tree('t2', [moment('mx', null, '대상 트리 시작', { seq: 1 })])] };
}
const validate = d => d.validateState;

test('두 벌의 INBOX_SUBJECT와 새 함수들이 같다', () => {
  assert.equal(serverDomain.INBOX_SUBJECT, '모아둔 순간');
  assert.equal(webDomain.INBOX_SUBJECT, serverDomain.INBOX_SUBJECT);
  for (const name of ['quickAdd', 'moveMoment', 'treeFromMoments']) {
    assert.equal(typeof serverDomain[name], 'function', '서버 벌 ' + name);
    assert.equal(typeof webDomain[name], 'function', '클라이언트 벌 ' + name);
  }
});

// ── 규칙 1: 트리 필드 inbox ──
test('inbox는 화이트리스트에 들고 true가 아니면 false로 정리된다', () => {
  for (const d of [serverDomain, webDomain]) {
    const state = chainState();
    state.trees[0].inbox = true;
    const kept = validate(d)(state);
    assert.equal(kept.trees[0].inbox, true, '참은 유지');
    assert.equal(kept.trees[1].inbox, false, '없으면 거짓');
    for (const bad of ['yes', 1, 'true', null]) {
      const s = chainState();
      s.trees[0].inbox = bad;
      assert.equal(validate(d)(s).trees[0].inbox, false, String(bad) + ' → false');
    }
    const clean = validate(d)(chainState());
    assert.equal(clean.trees[0].secretField, undefined, '모르는 필드는 여전히 잘라낸다');
  }
});

test('inbox 트리는 한 계정에 최대 1개 — 2개 이상이면 첫 번째만 true다', () => {
  for (const d of [serverDomain, webDomain]) {
    const state = chainState();
    state.trees[0].inbox = true;
    state.trees[1].inbox = true;
    const kept = validate(d)(state);
    assert.equal(kept.trees[0].inbox, true, '첫 번째만 true');
    assert.equal(kept.trees[1].inbox, false, '두 번째는 false로 정리');
    assert.equal(kept.trees.length, 2, '트리 개수는 그대로(저장 거부가 아니다)');
  }
});

// ── 규칙 3: quickAdd ──
test('quickAdd: inbox 트리가 없으면 만들고 그 순간이 시작 순간이 된다', () => {
  for (const d of [serverDomain, webDomain]) {
    const result = d.quickAdd({ version: 1, trees: [] }, { url: URL }, CLOCK);
    const inbox = result.state.trees[0];
    assert.equal(result.state.trees.length, 1);
    assert.equal(inbox.inbox, true, 'inbox=true');
    assert.equal(inbox.subject, d.INBOX_SUBJECT, '대상 기본값');
    assert.equal(inbox.title, d.INBOX_SUBJECT, '트리 이름 기본값');
    const moment = inbox.moments[0];
    assert.equal(moment.parentId, null, '시작 순간');
    assert.equal(moment.title, 'example.com에서 간직한 순간', '주소로 자동 제목');
    assert.equal(moment.emotion, '설렘', '기본 감정');
    assert.equal(moment.url, URL);
    assert.deepEqual({ treeId: result.treeId, momentId: result.momentId }, { treeId: inbox.id, momentId: moment.id });
    assert.doesNotThrow(() => validate(d)(result.state), '결과는 검증을 통과한다');
  }
});

test('quickAdd: inbox 트리가 있으면 시작 순간 아래에 붙인다', () => {
  for (const d of [serverDomain, webDomain]) {
    const first = d.quickAdd({ version: 1, trees: [] }, { url: URL }, CLOCK);
    const second = d.quickAdd(first.state, { url: 'https://example.com/next' }, '2026-11-09T11:00:00.000Z');
    assert.equal(second.treeId, first.treeId, '같은 inbox 트리');
    const inbox = second.state.trees[0];
    assert.equal(inbox.moments.length, 2);
    assert.equal(inbox.moments[1].parentId, inbox.moments[0].id, '시작 순간 아래');
    assert.equal(inbox.updatedAt, '2026-11-09T11:00:00.000Z', '트리 갱신 시각');
    assert.doesNotThrow(() => validate(d)(second.state));
  }
});

test('quickAdd: 사진 주소는 기존 자동 규칙으로 제목을 붙인다', () => {
  for (const d of [serverDomain, webDomain]) {
    const result = d.quickAdd({ version: 1, trees: [] }, { url: PHOTO }, CLOCK);
    assert.equal(result.state.trees[0].moments[0].title, '사진으로 남긴 순간');
  }
});

test('quickAdd: 주소가 없으면 기존 문구로 막는다', () => {
  for (const d of [serverDomain, webDomain]) {
    assert.throws(() => d.quickAdd({ version: 1, trees: [] }, { url: '' }, CLOCK), /순간 제목, 마음 한마디, 링크나 첨부 중 하나는 남겨 주세요./);
    assert.throws(() => d.quickAdd({ version: 1, trees: [] }, { url: 'ftp://example.com/a' }, CLOCK), /http 또는 https 링크만 사용할 수 있어요./);
  }
});

test('quickAdd: 한도를 넘으면 기존 문구로 막는다', () => {
  for (const d of [serverDomain, webDomain]) {
    // 순간 300개: inbox 트리를 만들고 addMoment로 채운다
    let state = d.quickAdd({ version: 1, trees: [] }, { url: URL }, CLOCK).state;
    let grown = state.trees[0];
    for (let i = 0; i < 299; i++) grown = d.addMoment(grown, { url: 'https://example.com/' + i }, grown.moments[0].id, CLOCK);
    state = { version: 1, trees: [grown] };
    assert.throws(() => d.quickAdd(state, { url: URL }, CLOCK), /한 트리에는 300개의 순간까지 담을 수 있어요./);
    // 트리 50개: inbox가 없는 상태에서 quickAdd
    const many = { version: 1, trees: Array.from({ length: 50 }, (_, i) => tree('t' + i, [moment('m' + i, null, '순간', { seq: 1 })])) };
    assert.throws(() => d.quickAdd(many, { url: URL }, CLOCK), /트리는 50개까지 만들 수 있어요./);
  }
});

// ── 규칙 4: moveMoment ──
test('moveMoment: 순간 하나만 옮기고 자식은 원래 부모에게 다시 붙는다', () => {
  for (const d of [serverDomain, webDomain]) {
    const result = d.moveMoment(chainState(), 't1', 'mb', 't2', null, CLOCK);
    const from = result.state.trees.find(t => t.id === 't1'), target = result.state.trees.find(t => t.id === 't2');
    assert.equal(from.moments.map(m => m.id).join(','), 'ma,mc', 'b는 사라지고 c는 남는다');
    assert.equal(from.moments.find(m => m.id === 'mc').parentId, 'ma', 'c는 b의 부모인 a에게 다시 붙는다');
    assert.equal(from.moments.find(m => m.id === 'mc').relation, '', '붙는 부모가 바뀌면 연결 이유도 비운다');
    assert.equal(from.moments.find(m => m.id === 'ma').links.includes('mb'), false, 'a가 가진 b 링크를 지운다');
    const moved = target.moments.find(m => m.id === 'mb');
    assert.ok(moved, 'b는 대상 트리로');
    assert.equal(moved.parentId, 'mx', 'parentId가 없으면 대상 트리 시작 순간 아래');
    assert.equal(moved.relation, '');
    assert.deepEqual(moved.links, [], '옮긴 순간의 링크는 비운다');
    assert.equal(from.coverMomentId, '', '표지가 옮긴 순간이면 해제');
    assert.equal(result.treeId, 't2');
    assert.equal(result.momentId, 'mb');
    assert.doesNotThrow(() => validate(d)(result.state));
  }
});

test('moveMoment: 시작 순간을 옮기면 남은 순간 중 가장 먼저 만든 것이 새 시작이 된다', () => {
  for (const d of [serverDomain, webDomain]) {
    // a(시작, 1일) ← b(2일), c(3일): 둘 다 a의 직계
    const a = moment('ma', null, '시작', { seq: 1 }), b = moment('mb', 'ma', '둘째', { seq: 2 }), c = moment('mc', 'ma', '셋째', { seq: 3 });
    const state = { version: 1, trees: [tree('t1', [a, b, c]), tree('t2', [moment('mx', null, '대상 시작', { seq: 1 })])] };
    const result = d.moveMoment(state, 't1', 'ma', 't2', 'mx', CLOCK);
    const from = result.state.trees.find(t => t.id === 't1');
    const root = from.moments.find(m => m.parentId === null);
    assert.equal(root.id, 'mb', '가장 먼저 만든 b가 새 시작 순간');
    assert.equal(from.moments.find(m => m.id === 'mc').parentId, 'mb', '나머지 직계 자식 c는 b 아래로');
    assert.doesNotThrow(() => validate(d)(result.state), '시작 순간은 하나다');
    // 대상 트리에서 옮긴 시작 순간은 지정한 부모 아래로
    assert.equal(result.state.trees.find(t => t.id === 't2').moments.find(m => m.id === 'ma').parentId, 'mx');
  }
});

test('moveMoment: 원래 트리가 비면 그 트리를 지운다(inbox도 같다)', () => {
  for (const d of [serverDomain, webDomain]) {
    const single = { version: 1, trees: [tree('t1', [moment('ma', null, '혼자', { seq: 1 })]), tree('t2', [moment('mx', null, '대상 시작', { seq: 1 })])] };
    const result = d.moveMoment(single, 't1', 'ma', 't2', null, CLOCK);
    assert.equal(result.state.trees.length, 1, '빈 t1은 삭제');
    assert.ok(result.state.trees[0].moments.some(m => m.id === 'ma'));
    // inbox 트리도 같은 규칙
    const inboxState = d.quickAdd({ version: 1, trees: [] }, { url: URL }, CLOCK).state;
    const withTarget = { version: 1, trees: [...inboxState.trees, tree('t2', [moment('mx', null, '대상 시작', { seq: 1 })])] };
    const inboxId = withTarget.trees.find(t => t.inbox === true).id;
    const moved = d.moveMoment(withTarget, inboxId, withTarget.trees.find(t => t.id === inboxId).moments[0].id, 't2', null, CLOCK);
    assert.equal(moved.state.trees.some(t => t.id === inboxId), false, '빈 inbox 트리도 삭제');
    const again = d.quickAdd(moved.state, { url: URL }, CLOCK);
    assert.equal(again.state.trees.some(t => t.inbox === true), true, '다음 빠른 추가 때 inbox 트리가 다시 생긴다');
  }
});

test('moveMoment: 같은 트리·없는 트리·없는 순간·가득 찬 대상은 막는다', () => {
  for (const d of [serverDomain, webDomain]) {
    const state = chainState();
    assert.throws(() => d.moveMoment(state, 't1', 'mb', 't1', null, CLOCK), /같은 트리 안에서는 옮길 수 없어요/);
    assert.throws(() => d.moveMoment(state, '없는트리', 'mb', 't2', null, CLOCK), /트리를 찾을 수 없어요/);
    assert.throws(() => d.moveMoment(state, 't1', '없는순간', 't2', null, CLOCK), /이 순간을 찾을 수 없어요/);
    assert.throws(() => d.moveMoment(state, 't1', 'mb', 't2', '없는순간', CLOCK), /옮겨 붙일 순간을 대상 트리에서 골라 주세요/);
    let full = state.trees.find(t => t.id === 't2');
    for (let i = 0; i < 299; i++) full = d.addMoment(full, { url: 'https://example.com/' + i }, full.moments[0].id, CLOCK);
    const fullState = { version: 1, trees: [state.trees[0], full] };
    assert.throws(() => d.moveMoment(fullState, 't1', 'mb', 't2', null, CLOCK), /한 트리에는 300개의 순간까지 담을 수 있어요/);
  }
});

// ── 규칙 5: treeFromMoments ──
test('treeFromMoments: 고른 순서의 첫 순간이 시작이고 나머지는 그 아래에 붙는다', () => {
  for (const d of [serverDomain, webDomain]) {
    const result = d.treeFromMoments(chainState(), 't1', ['mc', 'ma'], { subject: '겨울 소리' }, CLOCK);
    const made = result.state.trees.find(t => t.id === result.treeId);
    assert.equal(made.inbox, false, '새 트리는 inbox=false');
    assert.equal(made.subject, '겨울 소리');
    assert.equal(made.title, '겨울 소리, 나의 순간들', '기존 트리 이름 규칙');
    const root = made.moments.find(m => m.parentId === null);
    assert.equal(root.id, 'mc', '고른 순서의 첫 순간이 시작');
    assert.equal(made.moments.find(m => m.id === 'ma').parentId, 'mc.id' === 'mc.id' ? 'mc' : 'mc', '나머지는 그 아래');
    assert.deepEqual(made.moments.map(m => m.links), [[], []], '옮긴 순간의 링크는 비운다');
    const from = result.state.trees.find(t => t.id === 't1');
    assert.deepEqual(from.moments.map(m => m.id), ['mb'], '옮긴 순간은 원래 트리에서 떠난다');
    assert.equal(from.moments[0].links.includes('ma'), false, '남은 순간이 가진 옮긴 순간 링크도 지운다');
    assert.equal(from.coverMomentId, 'mb', '표지가 옮긴 순간이 아니면 유지');
    assert.doesNotThrow(() => validate(d)(result.state));
  }
});

test('treeFromMoments: 이름은 필수이고 고른 목록도 검증한다', () => {
  for (const d of [serverDomain, webDomain]) {
    const state = chainState();
    assert.throws(() => d.treeFromMoments(state, 't1', ['ma'], { subject: '' }, CLOCK), /좋아하는 대상을\(를\) 1~60자로 적어 주세요/);
    assert.throws(() => d.treeFromMoments(state, 't1', [], { subject: '겨울 소리' }, CLOCK), /옮길 순간을 먼저 골라 주세요/);
    assert.throws(() => d.treeFromMoments(state, 't1', ['ma', 'ma'], { subject: '겨울 소리' }, CLOCK), /같은 순간을 두 번 골랐어요/);
    assert.throws(() => d.treeFromMoments(state, 't1', ['없는순간'], { subject: '겨울 소리' }, CLOCK), /이 순간을 찾을 수 없어요/);
    assert.throws(() => d.treeFromMoments(state, '없는트리', ['ma'], { subject: '겨울 소리' }, CLOCK), /트리를 찾을 수 없어요/);
  }
});

test('treeFromMoments: 원래 트리가 비면 지우고, 남은 자식은 가까운 남은 조상에게 붙인다', () => {
  for (const d of [serverDomain, webDomain]) {
    // 전부 골라 가져가면 원래 트리는 삭제
    const single = { version: 1, trees: [tree('t1', [moment('ma', null, '혼자', { seq: 1 })])] };
    const all = d.treeFromMoments(single, 't1', ['ma'], { subject: '새 책' }, CLOCK);
    assert.equal(all.state.trees.length, 1, '빈 원래 트리는 삭제');
    assert.equal(all.state.trees[0].subject, '새 책');
    // 사슬 a→b→c→d에서 b·d를 옮기면: c는 a 아래로(b의 남은 조상 a), d는 c 아래 유지
    const a = moment('ma', null, '첫', { seq: 1 }), b = moment('mb', 'ma', '둘', { seq: 2 }), c = moment('mc', 'mb', '셋', { seq: 3 }), dd = moment('md', 'mc', '넷', { seq: 4 });
    const chain = { version: 1, trees: [tree('t1', [a, b, c, dd])] };
    const result = d.treeFromMoments(chain, 't1', ['mb', 'md'], { subject: '옮긴 책' }, CLOCK);
    const from = result.state.trees.find(t => t.id === 't1');
    assert.equal(from.moments.find(m => m.id === 'mc').parentId, 'ma', 'c는 옮겨진 b 대신 남은 조상 a 아래로');
    assert.equal(from.moments.find(m => m.id === 'ma').parentId, null, 'a는 시작 순간 유지');
    assert.doesNotThrow(() => validate(d)(result.state));
    // 트리 50개에서 새 트리 만들기는 막는다
    const many = { version: 1, trees: Array.from({ length: 50 }, (_, i) => tree('t' + i, [moment('m' + i, null, '순간', { seq: 1 })])) };
    assert.throws(() => d.treeFromMoments(many, 't0', ['m0'], { subject: '새 책' }, CLOCK), /트리는 50개까지 만들 수 있어요/);
  }
});
