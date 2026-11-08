#!/usr/bin/env node
// PR 머리 커밋의 Cloudflare Pages 미리보기 주소를 찾는다(2026-11-08, 원칙 8 자동화).
// 배포 체크가 끝날 때까지 기다리고, 체크 요약(output.summary)에 적힌 Preview URL을 읽는다.
// 사용: GITHUB_TOKEN=... node tools/postdeploy/preview-url.mjs <owner/repo> <headSha> [--wait 600] [--quiet]
// --quiet: 주소를 못 찾아도 요약에 쓰지 않는다(기준 커밋 조회 등 호출자가 처리할 때).
import { appendFileSync } from 'node:fs';

const [repoArg, shaArg] = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const waitIndex = process.argv.indexOf('--wait');
const waitSeconds = waitIndex >= 0 ? Number(process.argv[waitIndex + 1]) || 600 : 600;
const token = process.env.GITHUB_TOKEN || '';
const repo = repoArg || process.env.GITHUB_REPOSITORY || '';
const sha = shaArg || process.env.PR_HEAD_SHA || '';
if (!repo || !sha) {
  console.error('사용법: preview-url.mjs <owner/repo> <headSha> [--wait 초]');
  process.exit(2);
}
const api = `https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100`;
const headers = { accept: 'application/vnd.github+json', 'user-agent': 'lovetree-preview-check' };
if (token) headers.authorization = `Bearer ${token}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function urlFromCheck(check) {
  const text = `${check.output?.summary || ''} ${check.output?.text || ''} ${check.details_url || ''}`;
  const match = text.match(/https:\/\/([a-z0-9-]+)\.lovetree-4-0\.pages\.dev/);
  return match ? match[0] : '';
}

let previewUrl = '';
let reason = '';
const deadline = Date.now() + waitSeconds * 1000;
while (Date.now() < deadline) {
  let payload = null;
  try {
    const response = await fetch(api, { headers });
    if (!response.ok) {
      reason = `체크 조회 실패 HTTP ${response.status}`;
      await sleep(15000);
      continue;
    }
    payload = await response.json();
  } catch (error) {
    reason = `체크 조회 오류: ${error.message.slice(0, 80)}`;
    await sleep(15000);
    continue;
  }
  const pages = (payload.check_runs || []).filter((check) => /cloudflare pages|pages/i.test(check.name));
  if (!pages.length) {
    reason = 'Cloudflare Pages 배포 체크가 아직 없음';
    await sleep(15000);
    continue;
  }
  for (const check of pages) {
    const url = urlFromCheck(check);
    if (url) { previewUrl = url; break; }
  }
  if (previewUrl) break;
  const done = pages.every((check) => check.status === 'completed');
  if (done) {
    // 배포는 끝났는데 미리보기 주소가 체크에 없는 경우(오늘 #258·#260 사례) — 더 기다리지 않는다.
    if (pages.some((check) => /fail|action_required|cancelled|timed_out/i.test(check.conclusion || ''))) {
      reason = `배포 체크 결론: ${pages.map((check) => check.conclusion).join(', ')}`;
      break;
    }
    await sleep(15000);
    reason = '배포 체크는 끝났지만 미리보기 주소가 없음';
    continue;
  }
  await sleep(15000);
}
if (!previewUrl) reason = reason || '미리보기 주소를 찾지 못함';

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `url=${previewUrl}\nreason=${reason}\n`);
}
console.log(`preview=${previewUrl || '(없음)'} reason=${reason}`);
if (!previewUrl && !process.argv.includes('--quiet')) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(summary, `## 미리보기 검사 건너뜀\n\n- 이유: ${reason}\n- 커밋: \`${sha}\`\n- Cloudflare Pages 미리보기 배포가 없거나 주소를 확인할 수 없어 검사를 실행하지 않았습니다.\n`);
  }
}
process.exit(0);
