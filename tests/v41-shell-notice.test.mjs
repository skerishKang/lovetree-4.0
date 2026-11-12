import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// #353 후속: 담기·중복·로그인 필요 안내가 상태 안내보다 먼저 일정 시간 보이는지 가짜 DOM·가짜 시계로 직접 부른다.
// shell.mjs 배선(입구 안내를 hold로 보내는 한 줄)은 글자로 고정한다(#245 전례와 같은 이유).
import { createNotifier, NOTICE_HOLD_MS, NOTICE_HIDE_MS } from '../public/v41/shell/notice.mjs';

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
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, NOTICE_HIDE_MS);

  h.els['account-settings'].open = true;
  assert.equal(h.notifier.notify('설정 창이 열려 있을 때의 안내'), true);
  assert.equal(h.els['settings-feedback'].textContent, '설정 창이 열려 있을 때의 안내');
  assert.equal(h.els['toast'].hidden, true, '설정이 열려 있으면 토스트는 숨는다');
  assert.equal(h.timers[0].cleared, true, '이전 숨김 타이머를 지운다');
  h.timers[1].fn();
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
  assert.match(shell, /const shellNotice=createNotifier\(\{\$\}\);/, 'shell.mjs가 안내 한 벌을 만든다');
  assert.match(shell, /function notify\(text,options\)\{return shellNotice\.notify\(text,options\);\}/, '기존 notify 이름은 그대로다');
  assert.match(shell, /createQuickIntake\(\{[\s\S]*?notify:text=>notify\(text,\{hold:true\}\)/, '입구(담기·중복·로그인 필요) 안내만 hold로 보낸다');
});
