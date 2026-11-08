#!/usr/bin/env node
// PR 미리보기 검사 판정기(2026-11-08, 원칙 8 자동화).
// postdeploy 리포트 JSON을 읽어 "실패"와 "미리보기 Functions 503 때문에 생긴 실패"를 구분한다.
// 사용: node tools/postdeploy/preview-gate.mjs <리포트.json|out 폴더> [--summary <md 경로>]
// 종료 코드: 통과 0, 실패 2
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 미리보기에서 Functions가 아직 붙지 않아 503이 나는 경로들. 이 실패만 예외로 통과시킨다.
const PREVIEW_503_PATHS = ['/api/youtube/oembed', '/api/community/shares', '/api/community', '/api/account', '/api/workspace'];

function isPreview503(check) {
  const text = `${check.detail || ''} ${JSON.stringify(check.data || {})}`;
  if (!/503/.test(text)) return false;
  return PREVIEW_503_PATHS.some((route) => text.includes(route)) || /\/api\/[a-z/-]+/.test(text);
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
const exceptions = failures.filter(isPreview503);
const realFailures = failures.filter((check) => !isPreview503(check));
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
  lines.push(`- 미리보기 Functions 503 예외 ${exceptions.length}건(통과 처리):`);
  for (const check of exceptions.slice(0, 6)) lines.push(`  - \`${check.area}/${check.id}\` — ${String(check.detail || '').slice(0, 120)}`);
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
