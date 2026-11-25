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

// 2026-11-24: 화면이 바뀌어도 한 화면 안에서만 바뀐 PR은 그 화면 잡과 공통 검사기(a·b·c)·지도 잡만 돌린다.
// 고를 수 있는 잡은 아래 여섯이다. 공통 검사기와 지도 잡은 지금처럼 늘 판정대로 돈다.
// 화면 시험 파일이 바뀌면 그 파일을 실행하는 잡을, 보드 전용 소스가 바뀌면 보드 잡을 고른다.
// 그 밖의 화면 파일(공용 모듈·셸·CSS·빌드 설정·helpers 등)이 하나라도 있으면 전부(all)다 — 애매하면 다 돈다.
export const SELECTABLE_JOBS = ['screen-board', 'screen-home', 'screen-book', 'screen-reload', 'screen-shell', 'screen-book-screen'];
const AREA_SOURCES = [
  [/^public\/v41\/views\/board\//, 'screen-board'],
  [/^public\/v41\/views\/track58-pinboard\.html$/, 'screen-board']
];

export function jobTestFiles(workflowText = readFileSync(WORKFLOW, 'utf8')) {
  const start = workflowText.indexOf('  screen-board:');
  const end = workflowText.indexOf('  deploy:');
  const section = workflowText.slice(start, end);
  const jobs = {};
  const heads = [...section.matchAll(/^  ([a-z0-9-]+):\n/gm)];
  heads.forEach((h, i) => {
    const body = section.slice(h.index, i + 1 < heads.length ? heads[i + 1].index : section.length);
    jobs[h[1]] = new Set([...body.matchAll(/tests\/[A-Za-z0-9_./-]+\.(?:test\.mjs|mjs|js)/g)].map((m) => m[0]));
  });
  return jobs;
}

export function selectJobs(changedFiles, jobTests, screenTests, screenHelpers) {
  const picked = new Set();
  for (const f of changedFiles) {
    if (!f) continue;
    const one = classify([f], screenTests, screenHelpers);
    if (!one.changed) continue;
    if (screenTests.has(f)) {
      for (const [job, files] of Object.entries(jobTests)) if (files.has(f) && SELECTABLE_JOBS.includes(job === 'screen-home-followup' ? 'screen-home' : job)) picked.add(job === 'screen-home-followup' ? 'screen-home' : job);
      continue;
    }
    const area = AREA_SOURCES.find(([re]) => re.test(f));
    if (area) { picked.add(area[1]); continue; }
    return 'all';
  }
  // 고른 잡이 하나도 없으면 빈 값이 아니라 'none'으로 적는다. 빈 값은 '판정 도구가 jobs를 몰랐다'(옛 가지)로 보고
  // 워크플로·결과 모음이 전부 돌린다 — 최신 main을 받지 않은 가지에서 화면 잡이 조용히 다 건너뛰어지지 않게.
  return SELECTABLE_JOBS.filter((j) => picked.has(j)).join(',') || 'none';
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
  const jobs = result.changed ? selectJobs(changed, jobTestFiles(), new Set(tests), new Set(helperFiles(tests))) : '';
  console.log(`돌릴 화면 잡: ${jobs === 'all' ? '전부' : (jobs || '없음(공통 검사기·지도만)')}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\nmap_changed=${map}\njobs=${jobs}\n`);
}
