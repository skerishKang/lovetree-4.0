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
  let seenSignal = false;
  const ok = await functionsReady('https://preview.example', {
    fetcher: (url, { signal }) => {
      seenSignal = signal instanceof AbortSignal;
      return new Promise((resolve, reject) => {
        // 상한 신호가 오면 즉시 정리하고, 신호가 없어도 시험이 매달리지 않게 자력으로 물러난다.
        const fallback = setTimeout(() => reject(new Error('응답 없음')), 2000);
        signal?.addEventListener('abort', () => {
          clearTimeout(fallback);
          reject(new Error('요청 시간 초과'));
        }, { once: true });
      });
    },
    timeoutMs: 40,
    intervalMs: 10
  });
  assert.equal(ok, false);
  assert.equal(seenSignal, true, '시도에 상한 신호가 실린다');
});

test('404를 준비 성공으로 바꿔 놓으면 시험이 잡는다(강도 증명용 대목)', () => {
  const src = read('../tools/postdeploy/preview-ready.mjs');
  assert.ok(src.includes('res.status !== 404'), '404는 아직 준비 아님으로 본다');
  assert.ok(!/status !== 404[^;\n]*\?\? *true/.test(src));
});
