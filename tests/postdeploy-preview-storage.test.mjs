// #1254 — 미리보기에는 저장 API가 없다. 저장 API 의존 확인은 건너뛰고,
// 저장 API가 아닌 곳의 503은 여전히 실패인지 고정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PREVIEW_SKIP_DETAIL, STORAGE_CHECKS, isPreviewTarget, isStorageApiUrl,
  isStorageApi503, previewSkippedConsoleErrors
} from '../tools/postdeploy/preview-target.mjs';
import { classify, EXIT } from '../tools/postdeploy/preview-gate.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PREVIEW = 'https://abc123.lovetree-4-0.pages.dev/v41/';
const PROD = 'https://lovetree.padiem.net/v41/';
const storage503 = (path) => `Failed to load resource: the server responded with a status of 503 () [https://abc123.lovetree-4-0.pages.dev${path}]`;
const other503 = storage503('/v41/app.js');
const api503 = storage503('/api/workspace');

test('미리보기 별칭은 *.pages.dev 중 배포별 이름이 붙은 주소다', () => {
  assert.equal(isPreviewTarget(PREVIEW), true);
  assert.equal(isPreviewTarget('https://a.lovetree-4-0.pages.dev'), true);
  // 프로젝트 도메인 자체(운영 대체)와 운영 주소는 미리보기가 아니다.
  assert.equal(isPreviewTarget('https://lovetree-4-0.pages.dev/v41/'), false);
  assert.equal(isPreviewTarget(PROD), false);
  assert.equal(isPreviewTarget(''), false);
});

test('저장 API 판별은 /api/* 경로만 해당한다', () => {
  assert.equal(isStorageApiUrl('/api/workspace'), true);
  assert.equal(isStorageApiUrl('https://abc123.lovetree-4-0.pages.dev/api/account'), true);
  assert.equal(isStorageApiUrl('/v41/app.js'), false);
  assert.equal(isStorageApi503(api503), true);
  assert.equal(isStorageApi503(other503), false, '저장 API가 아닌 곳의 503은 남는다');
  assert.equal(isStorageApi503(storage503('/api/workspace').replace('503', '200')), false);
});

test('#1254 미리보기+저장 API 503 → skip, 비저장 503 → 실패로 남는다', () => {
  assert.deepEqual(previewSkippedConsoleErrors([api503], PREVIEW), [api503]);
  assert.deepEqual(previewSkippedConsoleErrors([other503], PREVIEW), [], '비저장 503은 건너뛰지 않는다');
  assert.deepEqual(previewSkippedConsoleErrors([api503, other503], PREVIEW), [api503]);
});

test('#1254 운영 대상에서는 저장 API 503도 건너뛰지 않는다', () => {
  assert.deepEqual(previewSkippedConsoleErrors([api503], PROD), [], '운영에서는 지금처럼 전부 검사한다');
  assert.equal(isStorageApi503(api503), true, '같은 줄이어도 대상이 운영이면 실패로 남는다');
});

test('#1254 저장 API 확인 목록이 이슈 본문의 목록과 같다', () => {
  assert.deepEqual(STORAGE_CHECKS.map((c) => `${c.area}/${c.id}`), [
    'auth/session-probe', 'community/community-cards', 'community/browse-aggregates',
    'youtube/youtube-oembed', 'youtube/youtube-caption'
  ]);
  assert.equal(PREVIEW_SKIP_DETAIL, '미리보기에는 저장 API 없음');
});

test('postdeploy는 미리보기에서만 저장 API 확인을 skip으로 기록한다', () => {
  const src = read('../tools/postdeploy/postdeploy.mjs');
  assert.ok(src.includes('previewTarget = isPreviewTarget(target)'), '대상 주소로 미리보기를 판별한다');
  assert.ok(src.includes("record('storage-api', 'api', 'skip', PREVIEW_SKIP_DETAIL)"), '미리보기 진입을 skip으로 남긴다');
  assert.ok(src.includes("record('session-probe', 'auth', 'skip', PREVIEW_SKIP_DETAIL)"), '세션 탐사 skip');
  assert.ok(src.includes("record('community-cards', 'community', 'skip', PREVIEW_SKIP_DETAIL)"), '공유 목록 skip');
  assert.ok(src.includes("record('youtube-oembed', 'youtube', 'skip', PREVIEW_SKIP_DETAIL)"), 'oEmbed skip');
  assert.ok(src.includes("const storageConsoleSkipped = previewSkippedConsoleErrors(consoleErrors, target.href)"), '콘솔 503도 대상별로 가른다');
  assert.ok(src.includes('if (previewTarget) return false;'), '미리보기에서는 세션 확인 요청 자체를 하지 않는다');
});

test('#1254 비저장 503은 판정기에서도 그대로 실패다(종료 코드 규칙 유지)', () => {
  const report = {
    meta: { target: PREVIEW }, login: { loggedIn: false },
    checks: [
      { id: 'app-js', area: 'page', status: 'fail', detail: `정적 자산 503 [https://a.lovetree-4-0.pages.dev/v41/app.js]`, data: null }
    ],
    console: { errors: [], pageErrors: [], warnings: [] },
    summary: { pass: 0, fail: 1, warn: 0, skip: 0 }
  };
  const ready = classify(report, { readiness: 'ready' });
  assert.equal(ready.verdict, 'product', '저장 API가 아닌 곳의 503은 제품 실패');
  const cold = classify(report, { readiness: 'cold' });
  assert.ok(EXIT[cold.verdict] !== 0, '옛 cold 분류에서도 빨강(종료 2) 또는 환경(종료 3)으로 실패다');
  assert.notEqual(cold.verdict, 'pass', '시험 기준을 낮추지 않았다');
});
