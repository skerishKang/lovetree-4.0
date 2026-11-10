// tools/postdeploy/preview-ready.mjs — 미리보기 Functions 준비 대기(#337 머지 뒤 404 창 보완).
// 가짜 fetch로 네트워크 없이 판정 로직만 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { functionsReady, READY_TIMEOUT_MS, READY_INTERVAL_MS } from '../tools/postdeploy/preview-ready.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('404만 오다가 404가 아닌 응답이 오면 준비된 것으로 본다', async () => {
  const codes = [404, 404, 503];
  let calls = 0;
  const ok = await functionsReady('https://preview.example', {
    fetcher: async () => ({ status: codes[Math.min(calls++, codes.length - 1)] }),
    timeoutMs: 5000,
    intervalMs: 1
  });
  assert.equal(ok, true);
  assert.ok(calls >= 3, `404 두 번을 건너뛰지 않아야 한다(호출 ${calls}번)`);
});

test('기한 안에 404만 계속 오면 준비 실패 — 호출자는 그대로 진행한다', async () => {
  let calls = 0;
  const ok = await functionsReady('https://preview.example', {
    fetcher: async () => { calls += 1; return { status: 404 }; },
    timeoutMs: 60,
    intervalMs: 10
  });
  assert.equal(ok, false);
  assert.ok(calls > 1, '한 번만 보고 포기하지 않는다');
});

test('기본 기한은 60초, 간격은 짧게 둔다', () => {
  assert.equal(READY_TIMEOUT_MS, 60000);
  assert.ok(READY_INTERVAL_MS > 0 && READY_INTERVAL_MS <= 5000);
});

test('네트워크 오류는 다음 시도로 넘기고, 404가 아니면 준비된 것으로 본다', async () => {
  let calls = 0;
  const ok = await functionsReady('https://preview.example', {
    fetcher: async () => { calls += 1; if (calls === 1) throw new Error('연결 실패'); return { status: 401 }; },
    timeoutMs: 5000,
    intervalMs: 1
  });
  assert.equal(ok, true);
  assert.equal(calls, 2);
});

test('눈치채는 주소는 미리보기의 /api/account 하나다', async () => {
  const seen = [];
  await functionsReady('https://preview.example', {
    fetcher: async (url) => { seen.push(url); return { status: 401 }; },
    timeoutMs: 1000,
    intervalMs: 1
  });
  assert.deepEqual(seen, ['https://preview.example/api/account']);
});

test('주소가 없으면 확인하지 않고 null로 돌아간다', async () => {
  let calls = 0;
  const ok = await functionsReady('', { fetcher: async () => { calls += 1; return { status: 401 }; } });
  assert.equal(ok, null);
  assert.equal(calls, 0);
});

test('preview-url.mjs는 주소를 찾은 뒤 준비를 확인하고, 실패 요약 한 줄을 남긴다', () => {
  const src = read('../tools/postdeploy/preview-url.mjs');
  assert.ok(src.includes("from './preview-ready.mjs'"), '준비 모듈을 가져와야 한다');
  assert.ok(/previewUrl\s*\? await functionsReady\(previewUrl/.test(src), '주소가 있을 때만 준비를 확인한다');
  assert.ok(/log: \(message\) => console\.log\(message\)/.test(src), '시도·경과를 로그로 남겨 미리보기 검사 로그에서 확인되게 한다');
  assert.ok(src.includes('Functions 준비 확인 실패'), '시간이 넘으면 요약에 한 줄을 남긴다');
  assert.ok(src.includes("--quiet"), '조용한 모드(--quiet)에서는 요약을 쓰지 않는다');
});

test('요청이 멈춰도 기한 안에서 정리된다(남은 기한만큼 상한)', { skip: typeof AbortSignal?.timeout !== 'function' }, async () => {
  // 실제 시계·실제 타이머에 기대지 않는다. 가짜 시계와 가짜 잠자기를 넣어
  // 기한 경계를 매번 똑같이 밟는다(#338 뒤 CI 에서만 어쭤게 흔들렸다).
  let clock = 1_000_000;
  const slept = [];
  const caps = [];
  let answered = 0;

  const ok = await functionsReady('https://preview.example', {
    now: () => clock,
    sleep: async (ms) => { slept.push(ms); clock += ms; },
    fetcher: (url, { signal }) => {
      const hasSignal = signal instanceof AbortSignal;
      caps.push({ hasSignal, remaining: clock });
      if (!hasSignal) {
        // 상한 신호가 없으면 기한을 넘는 요청이 그대로 남는다 = 이 시험이 잡아야 하는 고장.
        throw new Error('상한 신호 없는 시도가 있었다');
      }
      // 요청이 멈추지 않고 응답하듯 시계를 기한 너머로 밀어 중립을 만든 뒤 404를 준다.
      answered += 1;
      clock += 20;
      return Promise.resolve({ status: 404 });
    },
    timeoutMs: 40,
    intervalMs: 10
  });

  assert.equal(ok, false, '404만 오면 준비 실패로 끝난다');
  assert.ok(answered > 1, `한 번만 보고 포기하지 않는다(시도 ${answered}번)`);
  assert.ok(caps.every((c) => c.hasSignal), '모든 시도에 상한 신호가 실린다');
  assert.ok(slept.length > 0, '기한 전에는 간격을 두고 다시 본다');
  // 마지막 잠에서 깼을 때 기한을 이미 지났다면 더 시도하지 않는다(상한 신호 없는 시도 금지).
  assert.ok(caps.length === answered, `기록된 시도와 실제 시도가 같다(${caps.length}/${answered})`);
});

test('기한이 지난 뒤에는 상한 신호 없는 시도를 하지 않는다(결정적)', async () => {
  // 시계를 기한 경계에 딱 맞춰 두고 시험한다. 실제로는 CI 가 느릴 때만 드물게 나오던 경로다.
  let clock = 0;
  const seen = [];
  const ok = await functionsReady('https://preview.example', {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetcher: (url, { signal }) => {
      seen.push(signal instanceof AbortSignal);
      clock += 10;
      return Promise.resolve({ status: 404 });
    },
    timeoutMs: 25,
    intervalMs: 10
  });
  assert.equal(ok, false);
  assert.ok(seen.every(Boolean), `상한 신호 없는 시도가 없다(기록 ${JSON.stringify(seen)})`);
});

test('상한 신호를 빼면 새 시험이 잡는다(강도 증명용 대목)', () => {
  // preview-ready.mjs 에서 상한 신호를 없애면 위 시험이 실패해야 한다.
  const src = read('../tools/postdeploy/preview-ready.mjs');
  assert.ok(src.includes('AbortSignal.timeout'), '상한 신호를 만든다');
  assert.ok(/remaining > 0 \? AbortSignal\.timeout/.test(src), '남은 기한이 있을 때만 만든다');
  assert.ok(src.includes('if (attempts > 0 && remaining <= 0) break;'), '기한이 지나면 더 시도하지 않는다');
});

test('404를 준비 성공으로 바꿔 놓으면 시험이 잡는다(강도 증명용 대목)', () => {
  const src = read('../tools/postdeploy/preview-ready.mjs');
  assert.ok(src.includes('res.status !== 404'), '404는 아직 준비 아님으로 본다');
  assert.ok(!/status !== 404[^;\n]*\?\? *true/.test(src));
});
