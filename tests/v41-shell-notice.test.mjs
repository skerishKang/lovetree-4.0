import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// #353 후속: 담기·중복·로그인 필요 안내가 상태 안내보다 먼저 일정 시간 보이는지 가짜 DOM·가짜 시계로 직접 부른다.
// shell.mjs 배선(입구 안내를 hold로 보내는 한 줄)은 글자로 고정한다(#245 전례와 같은 이유).
import { createNotifier, NOTICE_HOLD_MS, NOTICE_HIDE_MS, syncedNoticeText, newlyPublishedTrees, AUTO_PUBLISH_MIN_MOMENTS } from '../public/v41/shell/notice.mjs';

function harness() {
  const els = {};
  for (const id of ['settings-feedback', 'toast', 'account-settings']) els[id] = { textContent: '', hidden: false, open: false };
  let clock = 1000;
  let nextId = 1;
  const timers = [];
  const notifier = createNotifier({
    $: (id) => els[id],
    now: () => clock,
    setTimer: (fn, ms) => { const timer = { id: nextId++, fn, ms, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { if (timer) timer.cleared = true; },
  });
  return { els, notifier, timers, advance: (ms) => { clock += ms; } };
}

test('상태 안내: 토스트·설정 상태 줄에 함께 뜨고 숨김 타이머를 다시 건다', () => {
  const h = harness();
  assert.equal(h.notifier.notify('내 기록을 불러왔어요.'), true);
  assert.equal(h.els['toast'].textContent, '내 기록을 불러왔어요.');
  // #453 C2: 설정이 닫혀 있을 때 온 안내는 창 안 줄에 쌓이지 않는다.
  assert.equal(h.els['settings-feedback'].textContent, '', '닫힌 설정 창에는 쓰지 않는다');
  assert.equal(h.els['toast'].hidden, false);
  // 안내 하나에 숨김 타이머 1과 자리 다시 재기 2(600·1400 — 화면이 늦게 편성돼도 알림이 아래 내용을 덮지 않게)가 걸린다.
  assert.equal(h.timers.length, 3);
  assert.equal(h.timers[0].ms, 600);
  assert.equal(h.timers[1].ms, 1400);
  assert.equal(h.timers[2].ms, NOTICE_HIDE_MS);
  // 자리 다시 재기는 토스트를 숨기지 않는다.
  h.timers[0].fn();
  h.timers[1].fn();
  assert.equal(h.els['toast'].hidden, false);

  h.els['account-settings'].open = true;
  assert.equal(h.notifier.notify('설정 창이 열려 있을 때의 안내'), true);
  assert.equal(h.els['settings-feedback'].textContent, '설정 창이 열려 있을 때의 안내');
  assert.equal(h.els['toast'].hidden, true, '설정이 열려 있으면 토스트는 숨는다');
  assert.equal(h.timers[2].cleared, true, '이전 숨김 타이머를 지운다');
  h.timers[3].fn();
  assert.equal(h.els['toast'].hidden, true);
});

test('담기 안내 우선: hold 동안 상태 안내가 와도 덮지 않고, hold가 지나면 다시 보인다(#353 후속)', () => {
  const h = harness();
  h.els['account-settings'].open = true;
  assert.equal(h.notifier.notify('모아둔 순간에 담았어요', { hold: true }), true);
  h.advance(2000);
  assert.equal(h.notifier.notify('서버에 저장됐어요.'), false, 'hold 동안 상태 안내는 미룬다');
  assert.equal(h.els['toast'].textContent, '모아둔 순간에 담았어요');
  assert.equal(h.els['settings-feedback'].textContent, '모아둔 순간에 담았어요');
  h.advance(NOTICE_HOLD_MS - 2000 + 1);
  assert.equal(h.notifier.notify('내 기록을 불러왔어요.'), true, 'hold가 지나면 상태 안내가 보인다');
  assert.equal(h.els['toast'].textContent, '내 기록을 불러왔어요.');
  assert.equal(h.els['settings-feedback'].textContent, '내 기록을 불러왔어요.');
});

test('synced 안내 문구(#549): 기록 0개 새 계정은 첫 순간 안내로, 기록이 있으면 예전 문구', () => {
  assert.equal(syncedNoticeText({ writable: true, previousDirty: false, momentCount: 0 }), '반가워요. 첫 순간을 남겨 보세요.');
  assert.equal(syncedNoticeText({ writable: true, previousDirty: false, momentCount: 1 }), '내 기록을 불러왔어요.');
  assert.equal(syncedNoticeText({ writable: true, previousDirty: false, momentCount: 12 }), '내 기록을 불러왔어요.');
  assert.equal(syncedNoticeText({ writable: true, previousDirty: true, momentCount: 0 }), '서버에 저장됐어요.', '방금 저장한 뒤라면 저장 안내가 우선');
  assert.equal(syncedNoticeText({ writable: false, previousDirty: false, momentCount: 0 }), '기록을 읽었어요. 서버 편집 연결은 아직 준비되지 않았어요.');
});

// 셸 배선을 글자로 고정한다(#245 전례) — 문구 한 벌을 지나가지 않는 회귀를 막는다.
test('셸은 synced 안내를 notice.mjs의 한 벌에서 가져온다(#549)', () => {
  const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  assert.match(shell, /import \{createNotifier, syncedNoticeText, newlyPublishedTrees\} from '\.\/shell\/notice\.mjs';/, 'synced 안내는 notice.mjs 한 벌에서 온다(자동 공개 안내는 질문 창이 대신한다)');
  assert.match(shell, /syncedNoticeText\(\{writable:status\.writable,previousDirty,momentCount\}\)/);
  assert.doesNotMatch(shell, /notify\([^\n]*'내 기록을 불러왔어요\.'/, '안내 문구는 notice.mjs 한 벌에서만 온다');
});

test('중복·로그인 필요 안내도 같은 규칙으로 지켜진다', () => {
  const dup = harness();
  assert.equal(dup.notifier.notify('이미 모아둔 순간에 있는 주소예요.', { hold: true }), true);
  dup.advance(1000);
  assert.equal(dup.notifier.notify('내 기록을 불러왔어요.'), false);
  assert.equal(dup.els['toast'].textContent, '이미 모아둔 순간에 있는 주소예요.');

  const retry = harness();
  retry.els['account-settings'].open = true;
  assert.equal(retry.notifier.notify('로그인한 뒤 다시 공유해 주세요.', { hold: true }), true);
  retry.advance(1000);
  assert.equal(retry.notifier.notify('로그인이 필요해요.'), false, '재시도 안내가 상태 안내에 덮이지 않는다');
  assert.equal(retry.els['settings-feedback'].textContent, '로그인한 뒤 다시 공유해 주세요.');
});

test('배선: shell.mjs가 입구 안내를 hold로 보내고 안내 한 벌을 쓴다', () => {
  const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  // #666: 알림 줄을 띄우기 직전에 자리를 재는 길(beforeShow)이 붙었고, 띄운 뒤에도 다시 재는 길(afterShow)이 함께 붙었다 —
  // 화면이 늦게 편성되면 beforeShow 시점의 좌표가 낡는다. 안내 한 벌을 쓰는 사실은 그대로다.
  assert.match(shell, /const shellNotice=createNotifier\(\{\$,beforeShow:placeToast,afterShow:\(\)=>\{placeToast\(\);setTimeout\(placeToast,600\);setTimeout\(placeToast,1400\);\}\}\)/, 'shell.mjs가 안내 한 벌을 만들고 자리를 다시 잰다');
  assert.match(shell, /function notify\(text,options\)\{return shellNotice\.notify\(text,options\);\}/, '기존 notify 이름은 그대로다');
  assert.match(shell, /createQuickIntake\(\{[\s\S]*?notify:text=>notify\(text,\{hold:true\}\)/, '입구(담기·중복·로그인 필요) 안내만 hold로 보낸다');
});

// 2026-11-15 보고(게스트 책·자동 공개 안내) — 판정·문구·단추·셸 배선.
test('자동 공개 판정: 순간 3개에 처음 도달한 트리만 새로 공개다', () => {
  assert.deepEqual(newlyPublishedTrees({ t1: 2, t2: 3 }, { t1: 3, t2: 4 }), [{ treeId: 't1', momentCount: 3 }], '3 미만 → 3 이상 전이만 대상');
  assert.deepEqual(newlyPublishedTrees({ t1: 3 }, { t1: 5 }), [], '이미 3개 이상이었던 트리는 새로 공개가 아니다');
  assert.deepEqual(newlyPublishedTrees(null, { t1: 3 }), [{ treeId: 't1', momentCount: 3 }], '기기 첫 관측(before 없음)은 prev=0 — 3개 이상이면 대상');
  assert.deepEqual(newlyPublishedTrees({}, { t1: 2 }), [], '3개 미만은 대상이 아니다');
  assert.deepEqual(newlyPublishedTrees({}, { t1: 3, t2: 4 }).map((row) => row.treeId), ['t1', 't2'], '여러 트리는 전부 돌려준다 — 셸이 하나씩 안내한다');
  assert.equal(AUTO_PUBLISH_MIN_MOMENTS, 3, '둘러보기 소개 기준(#538 SQL moment_count>=3)과 같다');
});


test('hold+단추 안내: hold 동안 상태 안내가 덮지 않고, 단추 없는 안내는 기존 길을 탄다', () => {
  const h = harness();
  const holdText = '둘러보기에 소개했어요. 공유 판에서 언제든 끌 수 있어요.';
  assert.equal(h.notifier.notify(holdText, { hold: true, action: { label: '끄기', run: () => {} } }), true);
  assert.equal(h.els['toast'].textContent, holdText, '가짜 DOM(replaceChildren 없음)에서는 문장만 — 진짜 단추 모양은 화면 검사가 잡는다');
  h.advance(1000);
  assert.equal(h.notifier.notify('서버에 저장됐어요.'), false, 'hold 동안 상태 안내가 덮지 않는다');
  h.advance(NOTICE_HOLD_MS + 1);
  assert.equal(h.notifier.notify('내 기록을 불러왔어요.'), true, 'hold가 지나면 상태 안내가 보인다');
  // 단추가 없는 안내는 기존과 같다(가짜 DOM에서도).
  const h2 = harness();
  h2.notifier.notify('서버에 저장됐어요.');
  assert.equal(h2.els['toast'].textContent, '서버에 저장됐어요.');
});

test('셸 배선: 질문 창 트리거·discoverAsked 기억·배너가 한 벌을 쓴다', () => {
  const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  assert.match(shell, /import \{createNotifier, syncedNoticeText, newlyPublishedTrees\} from '\.\/shell\/notice\.mjs';/, '판정 한 벌은 notice.mjs에서 온다');
  assert.match(shell, /newlyPublishedTrees\(null,treeCounts\)/, '직전 스냅샷 재촬영 없이(3개 이상·안 물은 트리) 전이 판정');
  assert.doesNotMatch(shell, /treeCountsBefore/, '상태마다 treeCountsBefore 재촬영(#718 원인)을 남기지 않는다');
  assert.match(shell, /lt41\.discoverAsked/, '트리당 1회 질문 기억 키');
  assert.match(shell, /if\(askTree\)askDiscover\(askTree\.treeId\);/, '2→3 전이 트리 하나에 질문 창을 띄운다');
  assert.match(shell, /discoverAskedList\(\)\.includes\(treeId\)|markDiscoverAsked/, '고른 뒤 다시 묻지 않는다');
  assert.match(shell, /shareApi\.getTreeDiscover\(treeId\)/, '이미 켜진 트리(#739 백필)는 묻지 않는다');
  assert.match(shell, /shareApi\.setTreeDiscover\(treeId,discover\)/, '고른 값은 discover PUT으로 저장한다');
  assert.doesNotMatch(shell, /autoPublishNoticeText|AUTO_PUBLISH_ACTION_LABEL|notifyAutoPublish|turnTreePrivate/, '#718 안내는 질문 창으로 대신해 남지 않는다');
});
