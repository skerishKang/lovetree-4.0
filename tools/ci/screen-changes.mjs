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
import { TEST_OWNERS } from './screen-owners.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = resolve(ROOT, '.github/workflows/preview-check.yml');

// 화면 잡들은 screen-board부터 deploy 직전까지 나란히 적혀 있다. 그 구간에서 이름이 적힌 시험 파일을 뽑는다.
export function screenTestFiles(workflowText = readFileSync(WORKFLOW, 'utf8')) {
  workflowText = workflowText.replace(/\r\n/g, '\n');
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
export const SCREENS = ['home','board','book','shelf','map','shell','explore/settings'];
export const AREA_SOURCES = [
  [/^src\/views\/orbit[^/]*\.(js|css|json)$/, ['home']],
  [/^src\/views\/book(?:-source\.css|\.js)$/, ['book']],
  [/^src\/views\/shelf(?:-source\.css|\.css|\.js)$/, ['shelf']],
  [/^public\/v41\/views\/board\//, ['board']],
  [/^public\/v41\/views\/track58-pinboard\.html$/, ['board']],
  [/^public\/v41\/views\/book\//, ['book']],
  [/^public\/v41\/views\/track59-sketchbook\.html$/, ['book']],
  [/^public\/v41\/views\/shelf\//, ['shelf']],
  [/^public\/v41\/views\/track32-bookshelf\.html$/, ['shelf']],
  [/^public\/v41\/views\/(network|graph)\//, ['map']],
  [/^public\/v41\/views\/track56-network\.html$/, ['map']]
];
export const JOB_TOKEN = {};
export function tokenOf(job) { return job; }
export const SELECTABLE_JOBS = Object.keys(jobTestFiles());
export function selectScreens(changedFiles) {
  const picked = new Set();
  if (!changedFiles.length) return 'all';
  for (const f of changedFiles) {
    if (!f) return 'all';
    if (/^(docs|reference)\/.+\.md$/i.test(f) || /^(README|CHANGELOG)\.md$/i.test(f)) continue;
    const owners = TEST_OWNERS[f];
    if (owners) {
      if (owners.includes('common')) return 'all';
      owners.forEach(x => picked.add(x));
      continue;
    }
    const areas = AREA_SOURCES.filter(([re]) => re.test(f));
    if (!areas.length) return 'all';
    for (const [, screens] of areas) screens.forEach(x => picked.add(x));
  }
  return SCREENS.filter(x => picked.has(x)).join(',') || 'none';
}
export function mapChanged(files) {
  const screens = selectScreens(files);
  return screens === 'all' || screens.split(',').includes('map');
}
export function jobTestFiles(workflowText = readFileSync(WORKFLOW, 'utf8')) {
  workflowText = workflowText.replace(/\r\n/g, '\n');
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

export function selectJobs(changedFiles, jobTests = jobTestFiles()) {
  const selection = selectScreens(changedFiles);
  if (selection === 'all' || selection === 'none') return selection;
  const screens = new Set(selection.split(','));
  const picked = [];
  for (const [job, files] of Object.entries(jobTests)) {
    if (!files.size) return 'all';
    for (const file of files) if (!TEST_OWNERS[file]) return 'all';
    // Common jobs always run on a screen change; area jobs only run for their owner areas.
    if (job.startsWith('screen-common-') || [...files].some(f =>
      TEST_OWNERS[f].some(x => screens.has(x)))) picked.push(job);
  }
  return picked.length ? picked.join(',') : 'all';
}
export function classify(changedFiles) {
  const screens = selectScreens(changedFiles);
  return { changed: screens !== 'none', reasons: changedFiles.map(f => String(f)), screens };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = readFileSync(process.argv[2], 'utf8');
  const changed = raw.split(raw.includes('\0') ? '\0' : '\n').filter(Boolean);
  const result = classify(changed);
  const jobs = selectJobs(changed);
  const screens = jobs === 'all' ? 'all' : result.screens;
  const map = screens === 'all' || screens.split(',').includes('map');
  console.log(JSON.stringify({changed:result.changed,jobs,screens,files:changed}));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `changed=${result.changed}\nmap_changed=${map}\njobs=${jobs}\nscreens=${screens}\n`);
}

export function visualScenes(selection) {
  const all = ['home','shelf','book','board','network','account'];
  const map = {home:['home'],shelf:['shelf'],book:['book'],board:['board'],map:['network'],shell:all,'explore/settings':['account','home']};
  if (selection === 'none') return '';
  if (!selection || selection === 'all') return all.join(',');
  const keys = selection.split(',');
  if (keys.some(k => !Object.hasOwn(map,k))) return all.join(',');
  const picked = new Set(keys.flatMap(k => map[k]));
  return all.filter(k => picked.has(k)).join(',');
}
