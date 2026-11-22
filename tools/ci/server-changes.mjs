// 서버 검사 바뀜 판정: 서버 코드·배포 스크립트·의존성·관련 시험이 바뀐 PR에서만 서버 잡을 돌린다.
// 판정 도구 자체와 다른 워크플로는 서버 바뀜으로 세지 않는다.
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function classify(changedFiles = []) {
  const reasons = [];
  let changed = false;
  for (const raw of changedFiles) {
    const file = String(raw || '').trim();
    if (!file) continue;
    const server =
      file.startsWith('server/') ||
      file.startsWith('deploy/host-com2/') ||
      file === 'package.json' || file === 'package-lock.json' ||
      (file.startsWith('tests/') && (file.includes('postgres') || file.includes('migrations') || file.includes('install-'))) ||
      /^tools\/server-/.test(file);
    if (server) { reasons.push(`서버: ${file}`); changed = true; }
    else reasons.push(`서버 밖: ${file}`);
  }
  return { changed, reasons };
}

if (process.argv[1] && process.argv[1].endsWith('server-changes.mjs')) {
  const files = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean);
  const result = classify(files);
  for (const line of result.reasons) console.log(line);
  console.log(`서버 바뀜: ${result.changed} (${files.length}개 파일)`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
}
