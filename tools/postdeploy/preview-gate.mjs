#!/usr/bin/env node
// PR 미리보기 검사 판정기(2026-11-08, 원칙 8 자동화).
// postdeploy 리포트 JSON을 읽어 "실패"와 "미리보기 Functions 503 때문에 생긴 실패"를 구분한다.
// 사용: node tools/postdeploy/preview-gate.mjs <리포트.json|out 폴더> [--summary <md 경로>]
// 종료 코드: 통과 0, 실패 2
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 미리보기 Functions 503에 직접 의존하는 검사만 예외로 인정한다(2026-11-08 CTO 판단).
// 화면 검사(visual/*)는 503과 무관하므로 예외 대상이 아니다 — 진짜 회귀가 묻히지 않게 한다.
const PREVIEW_503_CHECK_IDS = new Set([
  'youtube/youtube-oembed',      // oEmbed API 응답을 그대로 확인하는 검사
  'youtube/youtube-caption',     // 같은 oEmbed 경로
  'community/community-cards',   // 공유 목록 API(/api/community/shares)
  'console/console-errors'       // 콘솔에 찍힌 503만 있을 때(아래에서 한 번 더 확인)
]);
const API_503 = (text) => /503/.test(text) && /\/api\/[a-z0-9/-]+/.test(text);

function exceptionReason(check, report) {
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

const args = process.argv.slice(2);
const target = args.find((value) => !value.startsWith('--'));
const summaryIndex = args.indexOf('--summary');
const summaryPath = summaryIndex >= 0 ? args[summaryIndex + 1] : null;
if (!target) {
  console.error('사용법: node preview-gate.mjs <리포트.json|out 폴더> [--summary <md>]');
  process.exit(2);
}
const reportPath = await resolveReport(target);
if (!reportPath) {
  console.error(`리포트를 찾지 못했습니다: ${target}`);
  process.exit(2);
}
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const checks = Array.isArray(report.checks) ? report.checks : [];
const failures = checks.filter((check) => check.status === 'fail');
const exceptions = failures.map((check) => ({ check, reason: exceptionReason(check, report) })).filter((row) => row.reason);
const exceptionChecks = new Set(exceptions.map((row) => row.check));
const realFailures = failures.filter((check) => !exceptionChecks.has(check));
const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
for (const check of checks) counts[check.status] = (counts[check.status] || 0) + 1;
const meta = report.meta || {};
const login = report.login || {};
const ok = realFailures.length === 0;

const lines = [];
lines.push(`## 미리보기 검사 ${ok ? '통과' : '실패'}`);
lines.push('');
lines.push(`- 대상: \`${meta.target || '(주소 미기록)'}\``);
lines.push(`- 시각: ${meta.startedAt || meta.stamp || '(미기록)'} · 브라우저: ${meta.browser || 'chromium'} · 로그인: ${login.loggedIn ? '예' : '아니오'}(로그아웃 검사)`);
lines.push(`- 결과: pass ${counts.pass} · fail ${counts.fail} · warn ${counts.warn} · skip ${counts.skip}`);
if (exceptions.length) {
  lines.push(`- 미리보기 Functions 503 예외 ${exceptions.length}건(검사 id 허용 목록으로만 인정):`);
  for (const row of exceptions.slice(0, 6)) lines.push(`  - \`${row.check.area}/${row.check.id}\` — ${row.reason}: ${String(row.check.detail || '').slice(0, 100)}`);
}
if (realFailures.length) {
  lines.push('');
  lines.push('### 실패 항목');
  for (const check of realFailures.slice(0, 12)) lines.push(`- \`${check.area}/${check.id}\` — ${String(check.detail || '').slice(0, 200)}`);
}
const consoleErrors = (report.console?.errors || []).length;
lines.push('');
lines.push(`- 페이지/콘솔 오류: pageerror ${(report.console?.pageErrors || []).length} · console ${consoleErrors}`);
lines.push('');
lines.push(ok ? '판정: 통과(visual·페이지 오류 0)' : '판정: 실패 — 위 실패 항목을 확인하세요.');

const markdown = `${lines.join('\n')}\n`;
console.log(markdown);
if (summaryPath) await writeFile(summaryPath, markdown, 'utf8');
process.exit(ok ? 0 : 2);
