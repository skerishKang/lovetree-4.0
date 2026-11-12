// #481 T3: modulepreload 기대값을 **도구와 다른 방법**으로 한 번 더 대조한다.
// tools/v41-modulepreload.mjs는 자기가 찾은 목록을 자기가 정답으로 삼는다(동어반복) — 도구에 버그가 있으면
// 시험도 같이 틀린다. 여기서는 브라우저가 하는 방식에 가깝게 독립적으로 다시 걸어 본다:
//   ① HTML에서 모듈 진입점(<script type="module" src>)과 인라인 모듈의 import 문을 정규식이 아닌
//      문자열 스캔으로 뽑는다 ② 그 파일들의 import를 한 겹씩 따라가며 닫힌 목록을 만든다
//      (동적 import()는 부르는 시점이 달라 브라우저도 미리 받지 않는다 — 제외).
// 그리고 실제 HTML에 적힌 목록과 '집합'으로 비교한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(repoRoot, 'public', 'v41');

const SCREENS = [
  { name: 'shell', html: 'public/v41/index.html', dir: '' },
  { name: 'book', html: 'public/v41/views/track59-sketchbook.html', dir: 'views' },
  { name: 'board', html: 'public/v41/views/track58-pinboard.html', dir: 'views' },
  { name: 'network', html: 'public/v41/views/track56-network.html', dir: 'views' },
  { name: 'shelf', html: 'public/v41/views/track32-bookshelf.html', dir: 'views' }
];

/** HTML의 <script> 태그를 순서대로 훑어 (속성, 본문)을 돌려준다(정규식 백트래킹 없이). */
function scriptTags(html) {
  const out = [];
  let i = 0;
  while (true) {
    const open = html.indexOf('<script', i);
    if (open < 0) break;
    const attrsEnd = html.indexOf('>', open);
    if (attrsEnd < 0) break;
    const close = html.indexOf('</script>', attrsEnd);
    if (close < 0) break;
    out.push({ attrs: html.slice(open + 7, attrsEnd), body: html.slice(attrsEnd + 1, close) });
    i = close + 9;
  }
  return out;
}

const attrOf = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`));
  return m ? m[1] : '';
};

/** 한 모듈 본문에서 정적 import/export 대상만 뽑는다. import('...') 같은 동적 호출은 세지 않는다. */
function staticSpecifiers(body) {
  const out = [];
  // 문장 경계에서 시작하는 import/export ... from '...' 및 부수효과 import '...'
  const stmt = /(?:^|[;\n}])\s*(?:import|export)\b([^;]*?)(?:from\s*)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = stmt.exec(body))) {
    const head = m[1] || '';
    if (/\(\s*$/.test(head)) continue; // import(...) 동적
    const spec = m[2];
    if (!/\.m?js$/.test(spec)) continue;
    out.push(spec);
  }
  return [...new Set(out)];
}

/** specifier를 public/v41 기준 상대 경로로 푼다. */
function resolveSpec(spec, fromFilePosix) {
  if (spec.startsWith('/v41/')) return path.posix.normalize(spec.slice(5));
  if (spec.startsWith('./') || spec.startsWith('../')) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(fromFilePosix), spec));
  }
  return null; // 패키지 등 — 이 저장소의 정적 파일이 아니다
}

/** 화면 하나의 진입점을 따라가며 닫힌 모듈 목록을 만든다(브라우저가 미리 받을 것과 같은 집합). */
function walkScreen(screen) {
  const html = fs.readFileSync(path.join(repoRoot, screen.html), 'utf8');
  const seen = new Set();
  const queue = [];
  for (const tag of scriptTags(html)) {
    if (!/\btype\s*=\s*["']module["']/.test(tag.attrs)) continue;
    const src = attrOf(tag.attrs, 'src');
    if (src) {
      const resolved = src.startsWith('/v41/') ? path.posix.normalize(src.slice(5))
        : src.startsWith('/') ? null
        : path.posix.normalize(path.posix.join(screen.dir, src));
      if (resolved) queue.push(resolved);
    } else {
      for (const spec of staticSpecifiers(tag.body)) {
        const resolved = resolveSpec(spec, path.posix.join(screen.dir, 'index.html'));
        if (resolved) queue.push(resolved);
      }
    }
  }
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const full = path.join(publicRoot, file);
    if (!fs.existsSync(full)) continue;
    for (const spec of staticSpecifiers(fs.readFileSync(full, 'utf8'))) {
      const resolved = resolveSpec(spec, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

/** HTML에 실제로 적힌 modulepreload 목록(도구가 만든 그 블록)을 읽는다. */
function preloadedIn(html, screen) {
  const start = html.indexOf('<!-- modulepreload:start');
  const end = html.indexOf('<!-- modulepreload:end -->');
  assert.ok(start >= 0 && end > start, `${screen}: modulepreload 블록이 있다`);
  const block = html.slice(start, end);
  const out = new Set();
  // 목록은 <link rel="modulepreload" href="..."> 태그로 적힌다(<script>가 아니다).
  const linkRe = /<link\s([^>]*)>/g;
  let m;
  while ((m = linkRe.exec(block))) {
    const attrs = m[1];
    if (!/rel\s*=\s*["']modulepreload["']/.test(attrs)) continue;
    const href = attrOf(attrs, 'href');
    if (!href) continue;
    out.add(href.startsWith('/v41/') ? path.posix.normalize(href.slice(5)) : path.posix.normalize(href));
  }
  return out;
}

for (const screen of SCREENS) {
  test(`#481 T3 [${screen.name}] 적힌 preload 목록이 독립 순회 결과와 정확히 같다`, () => {
    const html = fs.readFileSync(path.join(repoRoot, screen.html), 'utf8');
    const expected = walkScreen(screen);
    const actual = preloadedIn(html, screen);
    // 빠진 것(브라우저가 한 층씩 늦게 받는다)과 남는 것(쓸모없는 요청)을 따로 보여 준다.
    const missing = [...expected].filter((f) => !actual.has(f)).sort();
    const extra = [...actual].filter((f) => !expected.has(f)).sort();
    assert.deepEqual(missing, [], `목록에 빠진 모듈: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `목록에 남는 모듈: ${extra.join(', ')}`);
  });

  test(`#481 T3 [${screen.name}] 순회 결과는 비어 있지 않고 파일이 실제로 있다`, () => {
    const expected = walkScreen(screen);
    assert.ok(expected.size > 0, '진입점을 찾았다');
    for (const file of expected) {
      assert.ok(fs.existsSync(path.join(publicRoot, file)), `없는 파일: ${file}`);
    }
  });
}

test('#481 T3 셸 목록에는 셸 본체와 대표 모듈이 들어 있다(독립 순회로 확인)', () => {
  const files = walkScreen(SCREENS[0]);
  for (const must of ['shell.mjs', 'shell/panels.mjs', 'domain.mjs', 'frame-wiring.mjs']) {
    assert.ok(files.has(must), `${must}가 셸 정적 목록에 있다`);
  }
});

test('#481 T3 동적 import()는 목록에 넣지 않는다(브라우저도 미리 받지 않는다)', () => {
  // 셸·화면 어딘가에 동적 import가 있어도 순회 결과에 섞이지 않아야 한다 — 규칙을 값으로 고정.
  const body = "const m = await import('./late-module.mjs');\nimport { a } from './static-one.mjs';";
  const specs = staticSpecifiers(body);
  assert.ok(specs.includes('./static-one.mjs'), '정적 import는 잡는다');
  assert.ok(!specs.some((s) => s.includes('late-module')), '동적 import는 잡지 않는다');
});
