// 2026-11-24: PR에서 Windows 전체 시험이 필요한지 가린다. 브라우저에서 도는 화면 파일·문서·화면 시험만
// 바뀌었으면 운영체제 차이가 날 곳이 없어 거짓이다. 그 밖의 파일(도구·서버·함수·스크립트·패키지·설정·
// 일반 시험 등)이 하나라도 있거나 애매하면 참이다. main 병합 뒤에는 이 판정 없이 Windows도 다 돈다.
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OS_FREE = [
  // 브라우저에서 도는 화면 코드: 단위 시험이 node로 불러도 경로·줄바꿈을 다루지 않는다.
  /^public\//,
  /^src\/views\//,
  /^docs\//,
  /\.md$/,
  /^\.github\/workflows\/(?:preview-check|nightly-screen-perf)\.yml$/
];

export function osChanged(files) {
  const reasons = [];
  let changed = false;
  for (const f of files) {
    if (!f) continue;
    if (OS_FREE.some((re) => re.test(f))) reasons.push(`운영체제 무관: ${f}`);
    else { reasons.push(`운영체제 확인 필요: ${f}`); changed = true; }
  }
  return { changed, reasons };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readFileSync(process.argv[2], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const result = osChanged(files);
  for (const line of result.reasons) console.log(line);
  console.log(`Windows 시험 필요: ${result.changed} (${files.length}개 파일)`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
}
