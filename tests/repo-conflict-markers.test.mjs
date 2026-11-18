import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'test-results', 'coverage', '.zwork', '.zref', '.playwright', '.cache']);
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.ts', '.css', '.json', '.md', '.yml', '.yaml', '.sh', '.ps1', '.sql', '.txt', '.svg', '.xml', '.example']);
const MARKER = /^(?:<<<<<<<|=======|>>>>>>>)/;

function textFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...textFiles(full));
    else if (entry.isFile() && TEXT_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

test('저장소 텍스트 파일에 병합 충돌 표시가 없다', () => {
  const hits = [];
  for (const file of textFiles(ROOT)) {
    if (!statSync(file).isFile()) continue;
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);
    const hasConflict = lines.some((line) => /^<<<<<<</.test(line)) && lines.some((line) => /^>>>>>>>/.test(line));
    if (!hasConflict) continue;
    lines.forEach((line, index) => {
      if (MARKER.test(line)) hits.push(path.relative(ROOT, file) + ':' + (index + 1));
    });
  }
  assert.deepEqual(hits, [], `충돌 표시 ${hits.length}건: ${hits.slice(0, 10).join(', ')}`);
});
