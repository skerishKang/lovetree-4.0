#!/usr/bin/env node
// PR 미리보기 검사 판정기(2026-11-08, 원칙 8 자동화 / #496 분류 나눔).
// postdeploy 리포트 JSON을 읽어 **제품 결함**과 **환경 문제**를 나눈다.
// 사용: node tools/postdeploy/preview-gate.mjs <리포트.json|out 폴더> [--summary <md 경로>] [--readiness ready|cold|unknown]
// 종료 코드: 통과 0, 제품 결함 2, 환경 문제 3
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// #496: 분류는 셋이다.
//   'product'    — 제품 결함. 빨강(종료 2).
//   'environment'— 미리보기가 아직 안 떠서 난 실패. 빨강이 아니라 따로 표시(종료 3).
//   'pass'       — 통과.
export const EXIT = { pass: 0, product: 2, environment: 3 };

// 미리보기 Functions 503에 직접 의존하는 검사만 예외로 인정한다(2026-11-08 CTO 판단).
// 화면 검사(visual/*)는 503과 무관하므로 예외 대상이 아니다 — 진짜 회귀가 묻히지 않게 한다.
export const PREVIEW_503_CHECK_IDS = new Set([
  'youtube/youtube-oembed',      // oEmbed API 응답을 그대로 확인하는 검사
  'youtube/youtube-caption',     // 같은 oEmbed 경로
  'community/community-cards',   // 공유 목록 API(/api/community/shares)
  'console/console-errors'       // 콘솔에 찍힌 503만 있을 때(아래에서 한 번 더 확인)
]);

const API_503 = (text) => /503/.test(text) && /\/api\/[a-z0-9/-]+/.test(text);

export function exceptionReason(check, report) {
  const id = `${check.area}/${check.id}`;
  if (!PREVIEW_503_CHECK_IDS.has(id)) return '';
  const text = `${check.detail || ''} ${JSON.stringify(check.data || {})}`;
  if (id === 'console/console-errors') {
    const errors = report.console?.errors || [];
    if (!errors.length) return '';
    // 콘솔 오류가 전부 미리보기 503이면 예외, 하나라도 아니면 실제 오류로 본다.
    return errors.every((line) => API_503(line)) ? '콘솔 오류가 모두 미리보기 503' : '';
  }
  if (id === 'community/community-cards') {
    return API_503(text) || /카드 0개/.test(text) ? '공유 목록 API 503' : '';
  }
  return API_503(text) ? '미리보기 Functions 503' : '';
}

/** 콘솔 오류 한 줄이 '미리보기 API 503'인지 — 환경 문제로 넘길 수 있는지. */
export const isPreviewApi503 = (line) => API_503(String(line));

/**
 * 리포트 + 준비 상태 → 분류. 순수 함수(파일·네트워크 없음)라 옛 실행 기록으로도 그대로 돌려 볼 수 있다.
 * @param {object} report postdeploy 리포트
 * @param {{readiness?: 'ready'|'cold'|'unknown'}} opts 준비 단계가 남긴 상태
 * @returns {{verdict: 'pass'|'product'|'environment', counts: object, realFailures: object[],
 *            envFailures: object[], exceptions: object[], reason: string, ready: string}}
 */
export function classify(report, { readiness = 'unknown' } = {}) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const failures = checks.filter((check) => check.status === 'fail');
  const exceptions = failures
    .map((check) => ({ check, reason: exceptionReason(check, report) }))
    .filter((row) => row.reason);
  const exceptionChecks = new Set(exceptions.map((row) => row.check));
  const unexplained = failures.filter((check) => !exceptionChecks.has(check));

  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const check of checks) counts[check.status] = (counts[check.status] || 0) + 1;

  // 콘솔 오류를 둘로 가른다: 미리보기 API 503(환경) / 그 밖(제품).
  const consoleErrors = report?.console?.errors || [];
  const consoleEnv = consoleErrors.filter(isPreviewApi503);
  const consoleProduct = consoleErrors.filter((line) => !isPreviewApi503(line));
  const consoleFailure = unexplained.find((check) => check.area === 'console' && check.id === 'console-errors');
  const pageErrors = report?.console?.pageErrors || [];

  // 환경 문제로 넘길 수 있는 실패: 허용 목록 503 예외 + '콘솔 오류가 전부 미리보기 503'인 경우.
  const envFailures = [];
  const productFailures = [];
  for (const check of unexplained) {
    const isConsole = check.area === 'console' && check.id === 'console-errors';
    if (isConsole && consoleErrors.length > 0 && consoleProduct.length === 0) {
      envFailures.push({ check, reason: '콘솔 오류가 모두 미리보기 API 503' });
      continue;
    }
    productFailures.push(check);
  }

  // 준비 단계가 'cold'(기한 안에 404·503만 봤다)이고 **페이지 오류가 없으면**
  // 남은 실패는 환경 문제로 본다 — 미리보기가 아직 안 떠서 난 실패이지 제품 결함이 아니다.
  // 단, 페이지 오류(pageErrors)가 하나라도 있거나 콘솔 오류가 미리보기 503이 아니면 제품 결함이다.
  let reason = '';
  if (readiness === 'cold' && productFailures.length > 0 && pageErrors.length === 0 && consoleProduct.length === 0) {
    for (const check of productFailures) envFailures.push({ check, reason: '미리보기 Functions가 아직 안 떰(준비 대기 상한 초과)' });
    productFailures.length = 0;
    reason = '미리보기 준비 대기 상한을 넘겼고, 남은 실패에 제품 신호(페이지 오류·비-503 콘솔 오류)가 없다';
  }

  const ready = readiness;
  const verdict = productFailures.length > 0 ? 'product' : envFailures.length > 0 ? 'environment' : 'pass';
  return {
    verdict,
    ready,
    counts,
    realFailures: productFailures,
    envFailures,
    exceptions,
    consoleEnv,
    consoleProduct,
    pageErrors,
    consoleFailure: consoleFailure || null,
    reason
  };
}

/** 판정 요약 마크다운. 환경 문제와 제품 결함을 나눠 적는다. */
export function summaryMarkdown(report, result, { target } = {}) {
  const meta = report?.meta || {};
  const login = report?.login || {};
  const lines = [];
  const head = result.verdict === 'pass' ? '미리보기 검사 통과'
    : result.verdict === 'environment' ? '미리보기 검사 — 환경 준비 안 됨(제품 결함 아님)'
      : '미리보기 검사 실패(제품 결함)';
  lines.push(`## ${head}`);
  lines.push('');
  lines.push(`- 대상: \`${target || meta.target || '(주소 미기록)'}\``);
  lines.push(`- 시각: ${meta.startedAt || meta.stamp || '(미기록)'} · 브라우저: ${meta.browser || 'chromium'} · 로그인: ${login.loggedIn ? '예' : '아니오'}(로그아웃 검사)`);
  lines.push(`- 준비 상태: ${READY_LABEL[result.ready] || result.ready}`);
  lines.push(`- 결과: pass ${result.counts.pass} · fail ${result.counts.fail} · warn ${result.counts.warn} · skip ${result.counts.skip}`);
  if (result.reason) lines.push(`- 판정 근거: ${result.reason}`);

  // ① 제품 결함
  lines.push('');
  lines.push(`### 제품 결함 ${result.realFailures.length}건`);
  if (!result.realFailures.length) lines.push('- 없음');
  for (const check of result.realFailures.slice(0, 12)) lines.push(`- \`${check.area}/${check.id}\` — ${String(check.detail || '').slice(0, 200)}`);

  // ② 환경 문제
  lines.push('');
  lines.push(`### 환경 문제 ${result.envFailures.length + result.exceptions.length}건(제품 결함 아님)`);
  if (!result.envFailures.length && !result.exceptions.length) lines.push('- 없음');
  for (const row of result.exceptions.slice(0, 6)) {
    lines.push(`- \`${row.check.area}/${row.check.id}\` — ${row.reason}: ${String(row.check.detail || '').slice(0, 100)}`);
  }
  for (const row of result.envFailures.slice(0, 6)) {
    lines.push(`- \`${row.check.area}/${row.check.id}\` — ${row.reason}: ${String(row.check.detail || '').slice(0, 100)}`);
  }

  // ③ 오류 신호 — 같은 숫자도 어느 쪽인지 나눠 적는다.
  lines.push('');
  lines.push(`- 오류 신호: 페이지 오류 ${result.pageErrors.length} · 콘솔 오류 ${result.consoleProduct.length}건(제품) / ${result.consoleEnv.length}건(미리보기 API 503 = 환경)`);
  lines.push('');
  lines.push(result.verdict === 'pass' ? '판정: 통과(제품 결함 0)'
    : result.verdict === 'environment' ? '판정: **환경 준비 안 됨** — 제품 결함으로 세지 않는다. 배포가 다 뜬 뒤 다시 실행하세요.'
      : '판정: 실패 — 위 제품 결함 항목을 확인하세요.');
  return `${lines.join('\n')}\n`;
}

export const READY_LABEL = {
  ready: 'ready — Functions가 응답했다(채점해도 된다)',
  cold: 'cold — 기한 안에 404·503만 봤다(아직 안 뜸)',
  unknown: 'unknown — 준비 단계를 거치지 않았다'
};

async function resolveReport(input) {
  const candidates = [];
  const stat = await readdir(input, { withFileTypes: true }).catch(() => null);
  if (stat) {
    for (const entry of stat) {
      if (entry.isFile() && /^report-.*\.json$/.test(entry.name)) candidates.push(path.join(input, entry.name));
    }
    candidates.sort();
    return candidates.at(-1) || null;
  }
  return input.endsWith('.json') ? input : null;
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((value) => !value.startsWith('--'));
  const summaryIndex = args.indexOf('--summary');
  const summaryPath = summaryIndex >= 0 ? args[summaryIndex + 1] : null;
  const readyIndex = args.indexOf('--readiness');
  const readiness = readyIndex >= 0 ? args[readyIndex + 1] : 'unknown';
  if (!target) {
    console.error('사용법: node preview-gate.mjs <리포트.json|out 폴더> [--summary <md>] [--readiness ready|cold|unknown]');
    process.exit(2);
  }
  const reportPath = await resolveReport(target);
  if (!reportPath) {
    console.error(`리포트를 찾지 못했습니다: ${target}`);
    process.exit(2);
  }
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const result = classify(report, { readiness });
  const markdown = summaryMarkdown(report, result);
  console.log(markdown);
  if (summaryPath) await writeFile(summaryPath, markdown, 'utf8');
  process.exit(EXIT[result.verdict]);
}

// 직접 실행할 때만 CLI로 돈다(시험이 classify를 그대로 import할 수 있게).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
