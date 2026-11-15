import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const preflight = fileURLToPath(new URL('../deploy/host-com2/lovetree-api/preflight_imports.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const installShPath = fileURLToPath(new URL('../deploy/host-com2/lovetree-api/install.sh', import.meta.url));
const autodeployShPath = fileURLToPath(new URL('../deploy/host-com2/lovetree-api/autodeploy.sh', import.meta.url));

// 설치 때와 같은 조건을 만든다: LOVETREE_* 환경값을 모두 비워 index.js가
// 본문(서버 기동)이 아니라 import 해석 단계에서만 평가되게 한다.
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('LOVETREE_')) delete env[key];
  }
  return env;
}

function runPreflight(cwd, entry = './server/index.js') {
  return spawnSync(process.execPath, [preflight, entry], { cwd, env: cleanEnv(), encoding: 'utf8' });
}

test('실제 저장 API 진입점의 import 그래프는 전부 해석된다(회귀 감시)', () => {
  const result = runPreflight(repoRoot);
  assert.equal(result.status, 0, `preflight failed: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /LOVETREE_IMPORT_PREFLIGHT=PASS/);
});

test('상대 경로 파일이 사라지면 ERR_MODULE_NOT_FOUND로 설치가 중단된다', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lovetree-preflight-missing-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'server'));
  await writeFile(join(dir, 'server', 'index.js'), "import './missing.js';\n");
  const result = runPreflight(dir);
  assert.equal(result.status, 1, '누락된 import는 실패로 끝나야 한다');
  assert.match(`${result.stdout}${result.stderr}`, /LOVETREE_IMPORT_PREFLIGHT=FAIL/);
  assert.match(`${result.stdout}${result.stderr}`, /ERR_MODULE_NOT_FOUND/);
});

test('그래프가 완전하면 PASS한다', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lovetree-preflight-ok-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'server'));
  await writeFile(join(dir, 'server', 'index.js'), "import './dep.js';\n");
  await writeFile(join(dir, 'server', 'dep.js'), 'export const value = 1;\n');
  const result = runPreflight(dir);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /LOVETREE_IMPORT_PREFLIGHT=PASS/);
});

test('install.sh는 사전점검을 유닛 설치 이전에 실행하고 실패 시 중단한다', async () => {
  const script = await readFile(installShPath, 'utf8');
  assert.match(script, /install -m 0644 "\$here\/preflight_imports\.mjs" "\$app\/preflight_imports\.mjs"/);
  assert.match(script, /env -i "\$node_bin" preflight_imports\.mjs \.\/server\/index\.js/);
  assert.match(script, /fail IMPORT_PREFLIGHT_FAILED/);
  // 사전점검은 npm ci 뒤, systemd 유닛 설치 전이어야 재시작 루프로 이어지지 않는다.
  assert.ok(script.indexOf('preflight_imports.mjs ./server/index.js') > script.indexOf('npm ci --omit=dev'));
  assert.ok(script.indexOf('preflight_imports.mjs ./server/index.js') < script.indexOf('/etc/systemd/system/$unit'));
  // 과거 사고의 근원: src/domain.js가 원본에 없으면 복사 전에 멈춘다.
  assert.match(script, /\[\[ -f "\$source_root\/server\/index\.js" && -f "\$source_root\/src\/domain\.js"/);
});

test('server/의 정적 import 그래프는 install.sh가 복사하는 파일 안에서 모두 풀린다(#695)', async (t) => {
  // install.sh가 옮기는 목록을 스크립트에서 그대로 읽는다 — 설치 목록이 늘면 이 시험도 따라간다.
  const script = await readFile(installShPath, 'utf8');
  const singleFiles = [...script.matchAll(/install -m 0644 "\$source_root\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(/cp -a "\$source_root\/server" "\$app\/server"/.test(script), 'server/ 디렉터리는 통째로 복사된다');
  assert.ok(singleFiles.includes('src/domain.js'), 'src/domain.js는 서버·화면 한 벌로 복사된다');
  assert.ok(singleFiles.includes('public/v41/tags.mjs'), 'public/v41/tags.mjs는 꼬리표 판정 한 벌(#695) — 누락되면 운영 설치가 preflight에서 멈춘다');
  // 꼬리표 규칙만 바뀌어도 서버가 다시 설치되게 한다(autodeploy has_api 목록).
  const autodeploy = await readFile(autodeployShPath, 'utf8');
  assert.match(autodeploy, /src\/domain\.js\|public\/v41\/tags\.mjs\|/, '꼬리표 규칙 변경도 has_api에 든다');

  const dir = await mkdtemp(join(tmpdir(), 'lovetree-install-graph-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // install.sh의 복사 행을 그대로 옮긴다: server/는 통째로, 나머지는 install 행 경로 그대로.
  await cp(join(repoRoot, 'server'), join(dir, 'server'), { recursive: true });
  for (const file of singleFiles) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await copyFile(join(repoRoot, file), join(dir, file));
  }
  // 운영 설치의 npm ci에 해당하는 의존성 — 저장소의 node_modules를 가리킨다.
  await symlink(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'junction').catch(async () => {
    await symlink(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir');
  });
  // check_config·preflight도 설치 때와 같은 자리에 둔다(그래프와 무관하지만 설치 모양을 맞춘다).
  await copyFile(join(dirname(installShPath), 'check_config.mjs'), join(dir, 'check_config.mjs'));
  await copyFile(preflight, join(dir, 'preflight_imports.mjs'));
  const result = runPreflight(dir);
  assert.equal(result.status, 0, `설치 목록대로 옮겼는데 import 그래프가 풀리지 않는다: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /LOVETREE_IMPORT_PREFLIGHT=PASS/);
});
