// 이슈 947 뒤 사줄: 화면 바뀜 판정. preview-check.yml의 화면 잡들이 실제로 실행하는 시험 파일과
// 그 파일이 import하는 시험 helpers가 바뀌었을 때만 '화면 바뀜'이다. 화면 시험 목록은 워크플로
// 파일에서 자동으로 뽑는다(손으로 따로 적지 않는다 — 워크플로와 판정이 어긋나지 않게).
// 나머지 규칙: public/**·src/views/**·v41·vite 설정·package·index.html·이 워크플로 자체와
// 화면 잡이 쓰는 도구(screen-changes·postdeploy·visual-baseline·v41-*)는 화면. 문서·서버·함수·
// 일반 tools·배포 등은 화면 밖, 목록에 없는 tests/ 파일도 화면 잡이 실행하지 않으므로 화면 밖.
// 그 외 애매한 파일은 무조건 화면 바뀜이다.
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = resolve(ROOT, '.github/workflows/preview-check.yml');

// 화면 잡들은 screen-board부터 deploy 직전까지 나란히 적혀 있다. 그 구간에서 이름이 적힌 시험 파일을 뽑는다.
export function screenTestFiles(workflowText = readFileSync(WORKFLOW, 'utf8')) {
  const start = workflowText.indexOf('  screen-board:');
  const end = workflowText.indexOf('  deploy:');
  if (start < 0 || end < 0 || end <= start) throw new Error('워크플로에서 화면 잡 구간을 못 찾는다');
  const files = new Set();
  for (const m of workflowText.slice(start, end).matchAll(/tests\/[A-Za-z0-9_./-]+\.(?:test\.mjs|mjs|js)/g)) {
    files.add(m[0]);
  }
  return [...files].sort();
}

// 위 시험 파일들이 import하는 tests/ 보조 파일(helpers·fixture)도 화면 시험의 일부다.
export function helperFiles(testFiles) {
  const helpers = new Set();
  for (const f of testFiles) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
      const rel = resolve(dirname(p), m[1]).slice(ROOT.length + 1).replaceAll('\\', '/');
      if (rel.startsWith('tests/')) helpers.add(rel);
    }
  }
  return [...helpers].sort();
}

// 화면 잡이 직접 쓰는 도구만 화면으로 친다. 나머지 tools/는 서버·배포·일반 도구라 화면 밖.
const SCREEN_TOOLS = /^tools\/(?:ci\/screen-changes\.mjs|postdeploy\/|visual-baseline\/|v41-[^/]+)/;
function isScreenTool(file) {
  return SCREEN_TOOLS.test(file);
}

// 지도(추후 개발) 쪽 파일: 지도 화면·지도 시험과 helpers·지도가 쓰는 테마 공통 파일. 이 판정 도구와
// 화면 워크플로가 바뀌어도 지도 시험을 돌린다. 애매하면 바뀜으로 두지 않는다 — 지도는 지금 손대지 않으므로
// 지도 파일이 실제로 바뀐 PR만 잰다.
const MAP_FILE = /(?:network|graph|map-|-map|\/map\.|views\/network|identity\.css|theme\.mjs)/;
export function mapChanged(changedFiles) {
  return changedFiles.some((f) => f && (
    MAP_FILE.test(f) || f === '.github/workflows/preview-check.yml' || f === 'tools/ci/screen-changes.mjs'
  ));
}

export function classify(changedFiles, screenTests, screenHelpers) {
  const reasons = [];
  let changed = false;
  for (const f of changedFiles) {
    if (!f) continue;
    if (screenTests.has(f) || screenHelpers.has(f)) {
      reasons.push(`화면 시험: ${f}`); changed = true;
    } else if (f.startsWith('tests/')) {
      reasons.push(`화면 밖 시험(화면 잡이 실행하지 않는다): ${f}`);
    } else if (
      f.startsWith('public/') || f.startsWith('src/views/') || f.includes('v41') ||
      /^vite\.[^.]*\.?config/.test(f) || f === 'package.json' || f === 'package-lock.json' ||
      f === 'index.html' || f === '.github/workflows/preview-check.yml'
    ) {
      reasons.push(`화면: ${f}`); changed = true;
    } else if (
      f.startsWith('docs/') || f.endsWith('.md') || f.startsWith('reference/') ||
      f.startsWith('scripts/') || f.startsWith('src/server/') || f.startsWith('server/') ||
      f.startsWith('functions/') || f.startsWith('deploy/') ||
      (f.startsWith('tools/') && !isScreenTool(f)) ||
      f.startsWith('.github/') || f === '.gitignore' || f === 'LICENSE'
    ) {
      reasons.push(`화면 밖: ${f}`);
    } else {
      reasons.push(`애매 — 바뀜으로: ${f}`); changed = true;
    }
  }
  return { changed, reasons };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = readFileSync(process.argv[2], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const tests = screenTestFiles();
  const result = classify(changed, new Set(tests), new Set(helperFiles(tests)));
  for (const line of result.reasons) console.log(line);
  console.log(`화면 바뀜: ${result.changed} (${changed.length}개 파일)`);
  const map = result.changed && mapChanged(changed);
  console.log(`지도 바뀜: ${map}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\nmap_changed=${map}\n`);
}
