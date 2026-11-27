// 서버 검사 바뀜 판정: 서버가 불러 쓰는 파일과 운영 설치 대상이 바뀐 PR에서만 서버 잡을 돌린다.
// server/ 아래 파일의 상대 import를 따라가 저장소 안 파일을 모은다(화면 판정이 시험 파일을 자동으로 뽑는 방식).
import { existsSync, readFileSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// 운영 자동 배포가 서버 설치 대상으로 보는 파일(설치 스크립트 목록과 맞춘다).
const INSTALL_FILES = new Set([
  'src/domain.js', 'src/moment-range.js', 'src/stage-key.js',
  'public/v41/tags.mjs', 'public/v41/tree-open-view.mjs', 'public/v41/public-thumbnail.mjs', 'public/v41/youtube-id.mjs', 'public/v41/youtube-id.js',
  'tools/admin-role.mjs', 'tools/env-file.mjs', 'tools/ops-reply.mjs',
  'tools/relink-opinion-author.mjs', 'tools/export-ai-customer-db.mjs',
  'tools/ci/server-changes.mjs', '.github/workflows/ci.yml',
  'package.json', 'package-lock.json'
]);

export function collectServerDependencies(root = ROOT) {
  const found = new Set();
  const visit = (file) => {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (found.has(rel)) return;
    found.add(rel);
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { return; }
    for (const match of text.matchAll(/(?:from\s+|import\s*\(?\s*|require\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), match[1]);
      if (!target.startsWith(root)) continue;
      for (const candidate of [target, `${target}.js`, `${target}.mjs`, resolve(target, 'index.js')]) {
        try {
          if (statSync(candidate).isFile()) { visit(candidate); break; }
        } catch { /* 다음 후보를 본다 */ }
      }
    }
  };
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.m?js$/.test(entry.name)) visit(path);
    }
  };
  const serverDir = resolve(root, 'server');
  if (existsSync(serverDir)) walk(serverDir);
  return [...found].sort();
}

export function classify(changedFiles = [], dependencies = collectServerDependencies()) {
  const deps = new Set([...dependencies, ...INSTALL_FILES]);
  const reasons = [];
  let changed = false;
  for (const raw of changedFiles) {
    const file = String(raw || '').trim();
    if (!file) continue;
    let server = false;
    if (deps.has(file) || file.startsWith('server/') || file.startsWith('functions/') ||
        file.startsWith('src/') || file.startsWith('deploy/host-com2/lovetree-api/')) server = true;
    else if (file.startsWith('tests/')) server = file.includes('postgres') || file.includes('migrations') || file.includes('install-');
    else if (file.startsWith('public/') || file.startsWith('docs/') || file.startsWith('reference/') ||
             file.endsWith('.md') || file.startsWith('v41/') || file === '.gitignore' || file === 'LICENSE') server = false;
    else server = true; // 확실히 서버와 무관한 것만 밖으로, 나머지는 바뀜으로.
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
