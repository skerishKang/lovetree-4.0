import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCREENS, collect, apply} from '../tools/v41-modulepreload.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readScreen = s => fs.readFileSync(path.join(repoRoot, s.html), 'utf8');

for (const screen of SCREENS) {
  test(`#400 [${screen.name}] modulepreload 목록이 화면의 정적 import와 같다`, () => {
    const html = readScreen(screen);
    assert.equal(apply(html, collect(screen), screen.href), html,
      'node tools/v41-modulepreload.mjs 로 목록을 갱신하세요');
  });

  test(`#400 [${screen.name}] 목록 파일이 실제로 있고 중복이 없다`, () => {
    const files = collect(screen);
    assert.equal(new Set(files).size, files.length);
    for (const f of files) assert.ok(fs.existsSync(path.join(repoRoot, 'public', 'v41', f)), f);
  });
}

test('#400 [shell] 목록에 셸 본체와 대표 모듈이 있다', () => {
  const files = collect(SCREENS[0]);
  assert.ok(files.includes('shell.mjs') && files.includes('shell/panels.mjs') && files.includes('domain.mjs'));
});

test('#400 [book/board/shelf] 목록에 화면 진입 모듈이 있다', () => {
  const byName = Object.fromEntries(SCREENS.map(s => [s.name, s]));
  assert.ok(collect(byName.book).includes('views/book/book-extra.js'));
  assert.ok(collect(byName.board).includes('views/board/board-mode.mjs'));
  assert.ok(collect(byName.shelf).includes('views/shelf/shelf.js'));
});

test('#400 [network] 지금은 모듈 스크립트가 없다 — 생기면 목록 갱신이 필요하다', () => {
  const byName = Object.fromEntries(SCREENS.map(s => [s.name, s]));
  assert.deepEqual(collect(byName.network), []);
});

// home.html은 vite 진입점이라 빌드가 번들+modulepreload를 만든다.
// 빌드 결과에서 진입 청크의 정적 import 전체(간접 포함)가 preload 목록과 일치하는지 검증한다.
test('#400 [home] 빌드가 진입 청크의 정적 import를 남김없이 modulepreload 한다', async () => {
  const {build} = await import('vite');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lt400-home-'));
  try {
    await build({
      root: repoRoot,
      configFile: path.join(repoRoot, 'vite.config.js'),
      cacheDir: path.join(tmp, '.vite'),
      logLevel: 'silent',
      build: {outDir: tmp, emptyOutDir: true},
    });
    const html = fs.readFileSync(path.join(tmp, 'v41', 'home.html'), 'utf8');
    assert.ok(!html.includes('modulepreload:start'), 'home.html에 수동 목록을 넣지 않는다(vite가 만든다)');

    const tags = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
    const entryAttrs = tags.filter(a => /\btype\s*=\s*["']module["']/.test(a) && /\bsrc\s*=/.test(a));
    assert.equal(entryAttrs.length, 1, 'home.html 모듈 진입점은 하나');
    const entryHref = entryAttrs[0].match(/\bsrc\s*=\s*["']([^"']+)["']/)[1];

    const preloads = new Set([...html.matchAll(/<link\b([^>]*)>/g)]
      .map(m => m[1])
      .filter(a => /\brel\s*=\s*["']modulepreload["']/.test(a))
      .map(a => a.match(/\bhref\s*=\s*["']([^"']+)["']/)[1]));

    // 빌드된 청크의 정적 import는 파일 맨 앞에 모여 있다(rollup 출력 규칙).
    const chunkImports = code => {
      const out = [];
      let rest = code;
      const re = /^(?:import|export)\s*(?:[^;'"()]*?\bfrom\s*)?["']([^"']+)["']\s*;/;
      let m;
      while ((m = re.exec(rest))) { out.push(m[1]); rest = rest.slice(m[0].length); }
      return out;
    };
    const seen = new Set();
    const visit = href => {
      if (seen.has(href)) return;
      seen.add(href);
      const file = path.join(tmp, href.replace(/^\//, ''));
      const dir = path.posix.dirname(href);
      for (const spec of chunkImports(fs.readFileSync(file, 'utf8'))) {
        visit(path.posix.normalize(path.posix.join(dir, spec)));
      }
    };
    visit(entryHref);
    seen.delete(entryHref); // 진입 청크 자신은 module script로 불러진다
    assert.deepEqual([...seen].sort(), [...preloads].sort(),
      '진입 청크의 정적 import(간접 포함)와 preload 목록이 같아야 한다');
    assert.ok(seen.size > 0, '검증할 의존 청크가 없다 — 진입점 구조가 바뀐 것은 아닌지 확인');
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});