// #496: 판정기가 환경 문제와 제품 결함을 나눠 적는지, **#493에서 실제로 실패한 실행 2건**의 리포트로 확인한다.
//
// 배경: 2026-11-12 미리보기 검사가 배포 직후 Functions 503 상태에서 채점에 들어가, 환경 문제와 제품 결함이
// 똑같이 "빨강"으로 보였다(#493 e102493·9a1488a 두 실행이 같은 모양: "1번째 시도에서 응답 503" → 111건 콘솔 오류).
// 그 두 실행의 리포트를 그대로 옮겨 와, 새 분류가 어떻게 나누는지 보인다.
//
// 두 실행의 공통 사실(실행 기록에서 그대로 읽었다):
//   · 준비 단계: "Functions 준비 확인: 1번째 시도(193ms/62ms 경과)에서 응답 503"  ← 503을 준비 완료로 읽었다
//   · fail 15건: visual/* 7건 + console/console-errors 1건 + 나머지
//   · 페이지 오류 0건 / 콘솔 111건
//   · 그때 #493에 있던 진짜 결함: modulepreload 목록이 '../../public/v41/...' 같은 없는 경로를 적어
//     모듈 로딩이 전부 실패(콘솔 오류 111건). **이건 제품 결함이므로 여전히 빨강이어야 한다.**
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, summaryMarkdown, EXIT } from '../tools/postdeploy/preview-gate.mjs';

const MODULE_MIME = (file) => `Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec. [https://660970a2.lovetree-4-0.pages.dev/public/v41/${file}]`;

const VISUAL = (screen, detail) => ({ id: `visual-${screen}`, area: 'visual', status: 'fail', detail, data: null });

/** #493 실행 e102493(또는 9a1488a)의 리포트를 그대로 옮긴 것 — 실패 15건 + 페이지 오류 0 + 콘솔 111. */
function run493Report({ consoleErrors }) {
  const checks = [
    { id: 'page-load', area: 'page', status: 'pass', detail: 'title ok', data: null },
    // visual/* 7건: 프레임이 about:blank(모듈이 안 떠서 화면이 그려지지 않음) — 로그아웃 상태가 아직 반영되지 않았다.
    VISUAL('home', '로그아웃인데 트리 보기 탭이 보임; 탭 5개 (기대 1)'),
    VISUAL('book', 'home-screen 클래스가 남아 있음; 탭 5개 (기대 1); 금테 프레임 없음'),
    VISUAL('board', 'home-screen 클래스가 남아 있음; 안쪽 화면 표시  (기대 board)'),
    VISUAL('network', '안쪽 화면에 --lt-stage 토큰 없음 (빈 값)'),
    VISUAL('shelf', '안쪽 화면 표시  (기대 shelf)'),
    VISUAL('theme', '정원으로 바꾸지 못함; 정원 전환 {"theme":""}'),
    { id: 'screen-settings', area: 'visual', status: 'fail', detail: '1440: 로그아웃인데 ◐ 단추가 없음 []', data: null },
    // 나머지 fail 들도 같은 이유(화면이 안 떠서 확인 불가).
    ...['share-panel-open-close', 'write-menu-open', 'account-menu-open', 'journey-open'].map((id) => ({
      id, area: 'screen', status: 'fail', detail: '화면이 그려지지 않아 확인하지 못함', data: null
    })),
    { id: 'community-cards', area: 'community', status: 'fail', detail: '미리보기 API 503: /api/community/shares', data: null },
    { id: 'youtube-oembed', area: 'youtube', status: 'fail', detail: '미리보기 API 503: /api/youtube/oembed', data: null },
    { id: 'console-errors', area: 'console', status: 'fail', detail: `콘솔 ${consoleErrors.length}건 / 페이지 오류 0건`, data: null },
    { id: 'pass-1', area: 'page', status: 'pass', detail: 'ok', data: null }
  ];
  return {
    meta: { target: 'https://660970a2.lovetree-4-0.pages.dev/v41/', startedAt: '2026-11-12T15:02:27Z' },
    login: { loggedIn: false },
    checks,
    console: { errors: consoleErrors, pageErrors: [], warnings: [] },
    summary: { pass: 12, fail: 15, warn: 1, skip: 3 }
  };
}

/** #493의 진짜 결함: 없는 경로(../../public/v41/...)를 modulepreload가 가리켜 모듈 로딩이 전부 실패. */
const REAL_MODULE_ERRORS = ['domain.mjs', 'book-usability.mjs', 'thumb-fallback.mjs', 'tree-name.mjs']
  .map(MODULE_MIME);

test('#496 옛 실행 분류 A — 준비 안 됨 상태에서 났다면 "환경 문제"로 넘어간다(제품 결함 아님)', () => {
  // 콘솔 오류가 전부 '미리보기 API 503'뿐인 경우(= 환경 신호만 있는 경우).
  const envOnly = Array.from({ length: 111 }, () => 'Failed to load resource: the server responded with a status of 503 () [https://x.pages.dev/api/account]');
  const report = run493Report({ consoleErrors: envOnly });
  const result = classify(report, { readiness: 'cold' });
  assert.equal(result.verdict, 'environment', '준비 상한을 넘겼고 제품 신호가 없으면 환경 문제');
  assert.equal(EXIT[result.verdict], 3, '종료 코드 3 — 빨강(2)과 구분된다');
  assert.equal(result.realFailures.length, 0, '제품 결함 0');
  assert.ok(result.envFailures.length > 0, '환경 문제로 적힌 항목이 있다');
  const md = summaryMarkdown(report, result);
  assert.match(md, /환경 준비 안 됨\(제품 결함 아님\)/);
  assert.match(md, /### 제품 결함 0건/);
});

test('#496 옛 실행 분류 B — #493의 진짜 결함(모듈 로딩 111건)은 **여전히 제품 결함(빨강)**', () => {
  // 실행 e102493 그대로: 콘솔 오류 111건이 전부 module MIME 오류 = 제품 결함.
  const report = run493Report({ consoleErrors: REAL_MODULE_ERRORS });
  const result = classify(report, { readiness: 'cold' });
  assert.equal(result.verdict, 'product', '준비가 안 떴어도 제품 신호(비-503 콘솔 오류)가 있으면 제품 결함');
  assert.equal(EXIT[result.verdict], 2, '종료 코드 2 = 빨강');
  const ids = result.realFailures.map((c) => `${c.area}/${c.id}`);
  assert.ok(ids.includes('console/console-errors'), '콘솔 오류가 제품 결함으로 남는다');
  assert.ok(ids.includes('visual/visual-home'), '화면 검사도 제품 결함으로 남는다(503과 무관한 검사)');
  const md = summaryMarkdown(report, result);
  assert.match(md, /미리보기 검사 실패\(제품 결함\)/);
  assert.doesNotMatch(md, /환경 준비 안 됨\(제품 결함 아님\)/, '환경 문제로 눙치지 않는다');
  // 콘솔 오류 수를 제품/환경으로 나눠 적는다.
  assert.match(md, /콘솔 오류 \d+건\(제품\)/);
});

test('#496 옛 실행 분류 C — 503만 있고 준비 상태를 모르면(unknown) 지금처럼 실패로 남는다', () => {
  // 준비 단계가 없던 옛 실행을 그대로 재생하면 환경으로 넘길 근거가 없다 — 조용히 통과시키지 않는다.
  const envOnly = Array.from({ length: 111 }, () => 'status of 503 [https://x.pages.dev/api/account]');
  const report = run493Report({ consoleErrors: envOnly });
  const result = classify(report, { readiness: 'unknown' });
  assert.equal(result.verdict, 'product', 'unknown은 보수적으로 제품 결함');
  assert.equal(EXIT[result.verdict], 2);
});

test('#496 판정 B의 근거 — 페이지 오류 0이어도 모듈 MIME 오류는 제품 신호다', () => {
  const report = run493Report({ consoleErrors: REAL_MODULE_ERRORS });
  const result = classify(report, { readiness: 'cold' });
  assert.equal(result.pageErrors.length, 0, '페이지 오류는 0건이었다(그래서 예전엔 조용히 지나갈 수 있었다)');
  assert.equal(result.consoleProduct.length, REAL_MODULE_ERRORS.length, '콘솔 111건이 모두 제품 신호로 분류된다');
  assert.equal(result.consoleEnv.length, 0, '미리보기 503으로 볼 것이 없다');
});

test('#496 정말 다 통과하면 통과(종료 0)이고 환경 문제 항목이 비어 있다', () => {
  const report = {
    meta: { target: 'https://x/v41/' },
    login: { loggedIn: false },
    checks: [{ id: 'page-load', area: 'page', status: 'pass', detail: 'ok', data: null }],
    console: { errors: [], pageErrors: [], warnings: [] },
    summary: { pass: 1, fail: 0, warn: 0, skip: 0 }
  };
  for (const readiness of ['ready', 'cold', 'unknown']) {
    const result = classify(report, { readiness });
    assert.equal(result.verdict, 'pass', `readiness=${readiness}`);
    assert.equal(EXIT[result.verdict], 0);
  }
});

test('#496 준비 상태 문구가 요약에 그대로 남는다(무엇을 근거로 나눴는지 보이게)', () => {
  const report = run493Report({ consoleErrors: REAL_MODULE_ERRORS });
  const cold = summaryMarkdown(report, classify(report, { readiness: 'cold' }));
  assert.match(cold, /준비 상태: cold — 기한 안에 404·503만 봤다\(아직 안 뜸\)/);
  const ready = summaryMarkdown(report, classify(report, { readiness: 'ready' }));
  assert.match(ready, /준비 상태: ready — Functions가 응답했다/);
});
