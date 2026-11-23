// #400: 화면마다 정적으로 부르는 모듈을 모두 찾아 HTML 맨 위에 modulepreload 목록으로 적는다.
// 브라우저가 한 층씩 열어 보며 다음 파일을 알아내는 연쇄 로딩을 없애, 전부 한꺼번에 받게 한다.
// 사용: node tools/v41-modulepreload.mjs          → 화면별 목록 갱신
//       node tools/v41-modulepreload.mjs --check  → 목록이 어긋났으면 실패(시험이 부른다)
// home.html(v41/home.html)은 vite 진입점이라 빌드가 번들+modulepreload를 자동 생성한다.
// 그 목록은 시험이 빌드 결과로 검증한다(tools가 아닌 vite가 목록을 만든다).
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(repoRoot, 'public', 'v41');
const START = '<!-- modulepreload:start (tools/v41-modulepreload.mjs가 만든다) -->';
const END = '<!-- modulepreload:end -->';

// 목록을 정적 파일로 받는 화면. href는 브라우저가 보는 경로 모양을 화면마다 맞춘다.
export const SCREENS = [
  {name: 'shell', html: 'public/v41/index.html', href: f => f},
  {name: 'book', html: 'public/v41/views/track59-sketchbook.html', href: f => '/v41/' + f},
  {name: 'board', html: 'public/v41/views/track58-pinboard.html', href: f => '/v41/' + f},
  {name: 'network', html: 'public/v41/views/track56-network.html', href: f => '/v41/' + f},
  {name: 'graph', html: 'public/v41/views/graph/track60-graph.html', href: f => '/v41/' + f},
  {name: 'shelf', html: 'public/v41/views/track32-bookshelf.html', href: f => '/v41/' + f},
  {name: 'tree', html: 'public/v41/views/track61-tree.html', href: f => '/v41/' + f},
];

// 정적 import/export ... from '...' 와 import '...' 만 본다(동적 import()는 필요할 때 부르므로 제외).
const IMPORT_RE = /(?:^|[\n;}])\s*(?:import|export)\s*(?:[^'"()]*?\bfrom\s*)?['"]([^'"]+\.m?js)['"]/g;

// 모듈 specifier를 public/v41 기준 상대 경로로 바꾼다. 화면 안쪽은 /v41/... 절대 경로도 쓴다.
function resolve(spec, fromFile) {
  if (spec.startsWith('/v41/')) return path.posix.normalize(spec.slice('/v41/'.length));
  if (spec.startsWith('./') || spec.startsWith('../')) return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  return null;
}

function importsOf(text) {
  const re = new RegExp(IMPORT_RE.source, 'g');
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

// HTML에서 모듈 진입점(<script type="module" src>)과 인라인 모듈의 import를 찾는다.
export function entries(html, htmlDir) {
  const out = [];
  const tagRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const [, attrs, body] = m;
    if (!/\btype\s*=\s*["']module["']/.test(attrs)) continue;
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/);
    if (src) {
      // HTML src는 URL이라 ./ 없는 상대 경로(shell.mjs)도 문서 기준으로 풀린다.
      const s = src[1];
      const target = s.startsWith('/v41/') ? path.posix.normalize(s.slice('/v41/'.length))
        : s.startsWith('/') ? null
        : path.posix.normalize(path.posix.join(htmlDir, s));
      if (target) out.push(target);
    } else {
      for (const spec of importsOf(body)) {
        const target = resolve(spec, path.posix.join(htmlDir, '_.html'));
        if (target) out.push(target);
      }
    }
  }
  return out;
}

export function collect(screen) {
  const htmlPath = path.join(repoRoot, screen.html);
  const htmlDir = path.posix.normalize(path.relative(publicRoot, path.dirname(htmlPath)).split(path.sep).join('/'));
  const html = fs.readFileSync(htmlPath, 'utf8');
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(path.join(publicRoot, file), 'utf8');
    for (const spec of importsOf(text)) {
      const target = resolve(spec, file);
      if (target) visit(target);
    }
  };
  for (const entry of entries(html, htmlDir === '.' ? '' : htmlDir)) visit(entry);
  return [...seen].sort();
}

export function block(files, href = f => f) {
  return START + files.map(f => `<link rel="modulepreload" href="${href(f)}">`).join('') + END;
}

export function apply(html, files, href = f => f) {
  const next = files.length ? block(files, href) : '';
  if (html.includes(START)) {
    const re = new RegExp(START.replace(/[()]/g, '\\$&') + '[\\s\\S]*?' + END);
    return html.replace(re, () => next);
  }
  if (!next) return html;
  return html.replace('</title>', '</title>' + next);
}

// Vite emits the production HTML and its hashed dependency graph together.
// Raw source fixtures keep the source preloads above; deployed shell/home
// must instead match the exact static chunk graph, never the raw modules.
export function builtGraph(dist) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
  const chunks = new Map(JSON.parse(fs.readFileSync(path.join(dist, '.vite/v41-module-graph.json'), 'utf8'))
    .map(chunk => [chunk.file, chunk]));
  function entry(source, htmlFile) {
    const main = manifest[source]?.file;
    assert.ok(main && chunks.has(main), source + ': missing built entry');
    const html = fs.readFileSync(path.join(dist, htmlFile), 'utf8');
    assert.ok(!html.includes('modulepreload:start'), htmlFile + ': raw preload block');
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1])
      .filter(a => /\btype\s*=\s*["']module["']/.test(a))
      .map(a => a.match(/\bsrc\s*=\s*["']([^"']+)["']/)?.[1]);
    assert.deepEqual(scripts, ['/' + main], htmlFile + ': entry script');
    const links = [...html.matchAll(/<link\b([^>]*)>/g)].map(m => m[1])
      .filter(a => /\brel\s*=\s*["']modulepreload["']/.test(a))
      .map(a => a.match(/\bhref\s*=\s*["']([^"']+)["']/)?.[1]);
    const seen = new Set();
    function visit(file) {
      if (seen.has(file)) return;
      seen.add(file);
      assert.ok(chunks.has(file) && fs.existsSync(path.join(dist, file)), 'Missing chunk: ' + file);
      for (const dep of chunks.get(file).imports) visit(dep);
    }
    visit(main);
    const deps = [...seen].filter(file => file !== main).map(file => '/' + file).sort();
    assert.deepEqual(links.sort(), deps, htmlFile + ': static hashed preloads');
    const members = new Map();
    for (const file of seen) {
      for (const module of chunks.get(file).modules) {
        if (!members.has(module)) members.set(module, new Set());
        members.get(module).add(file);
      }
    }
    return { main, chunks: seen, members };
  }
  const shell = entry('public/v41/index.html', 'v41/index.html');
  const home = entry('v41/home.html', 'v41/home.html');
  const shared = [...shell.members.keys()].filter(module => home.members.has(module)).sort();
  const duplicates = shared.filter(module => new Set([...shell.members.get(module), ...home.members.get(module)]).size > 1);
  assert.ok(shared.length > 0, 'Expected shell/home shared modules');
  return { shell, home, shared, duplicates };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let drifted = false;
  for (const screen of SCREENS) {
    const file = path.join(repoRoot, screen.html);
    const html = fs.readFileSync(file, 'utf8');
    const next = apply(html, collect(screen), screen.href);
    if (next === html) continue;
    if (check) {
      console.error(`[${screen.name}] modulepreload 목록이 어긋났습니다. node tools/v41-modulepreload.mjs 로 갱신하세요.`);
      drifted = true;
    } else {
      fs.writeFileSync(file, next);
      console.log(`[${screen.name}] 목록 갱신`);
    }
  }
  if (drifted) process.exit(1);
  if (check) {
    const {build} = await import('vite');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lt400-built-'));
    try {
      await build({ root: repoRoot, logLevel: 'silent', build: {outDir: tmp, emptyOutDir: true} });
      const graph = builtGraph(tmp);
      assert.deepEqual(graph.duplicates, [], 'Shell/home duplicate modules');
      console.log('Built shell/home preloads OK; shared modules:', graph.shared.length);
    } finally {
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  }
}