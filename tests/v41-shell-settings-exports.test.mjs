// 셸 코드를 shell/ 모듈로 옮길 때 이름만 남기고 받지 않은 함수는 실행 중에야 '정의되지 않음'으로 멈춘다.
// 공유 주소(/t/…)가 빈 화면으로 남은 일(showPublicRoute, 이어서 screenForView)의 재발 방지 시험.
// 각 모듈에서 이름으로 부르는 함수가 그 모듈 안에서 정의·받기·들여오기 중 하나로 보이는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const dir = new URL('../public/v41/shell/', import.meta.url);
const root = new URL('../public/v41/', import.meta.url);
const shellUrl = new URL('../public/v41/shell.mjs', import.meta.url);
// 창에 정본으로 등록되는 이름(window.html-escape.js·window.youtube-id.js)과 셸이 읽는 계정 상태는
// 어느 모듈에서도 들여오지 않고 전역에서 쓴다 — 이 이름들은 대조에서 제외한다.
const GLOBALS = new Set(('window document localStorage sessionStorage location history console performance parent top self '
  + 'escapeHtml unescapeHtml youtubeIdFrom safeYoutubeThumb LT41').split(' '));

const BUILTINS = new Set(('String Number Boolean Array Object JSON Math Date Promise Set Map Error TypeError RegExp URL URLSearchParams '
  + 'encodeURIComponent decodeURIComponent parseInt parseFloat isNaN isFinite setTimeout clearTimeout setInterval clearInterval '
  + 'requestAnimationFrame cancelAnimationFrame requestIdleCallback fetch alert confirm structuredClone queueMicrotask getComputedStyle '
  + 'matchMedia Intl FormData Blob File Image CustomEvent Event KeyboardEvent ResizeObserver MutationObserver IntersectionObserver '
  + 'AbortController TextEncoder TextDecoder DataTransfer atob btoa Symbol WeakMap WeakSet Reflect Proxy BigInt Uint8Array globalThis '
  + 'addEventListener removeEventListener dispatchEvent focus').split(' '));
const KEYWORDS = new Set('if else for while switch catch return typeof new function await async import super delete void of in'.split(' '));

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1');
}
// 따옴표 글자 안(선택자 ':not(' 같은 것)은 부르기가 아니다.
function stripStrings(src) {
  return src.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
}
function stripTemplates(src) {
  return src.replace(/`(?:\\.|[^`\\])*`/g, m => [...m.matchAll(/\$\{([^{}]*)\}/g)].map(x => x[1]).join('\n'));
}
function stripRegexes(src) {
  return src.replace(/\/(?:\\.|[^/\\\n])+\/[gimsuy]*/g, ' ');
}

function unresolvedCalls(src) {
  const s = stripRegexes(stripTemplates(stripStrings(stripComments(src))));
  const calls = new Set([...s.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
  const defs = new Set();
  for (const m of s.matchAll(/(?:function\s*\*?\s*|const\s+|let\s+|var\s+|class\s+)([A-Za-z_$][\w$]*)/g)) defs.add(m[1]);
  for (const m of s.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) defs.add(n.trim().split(/\s*[:=]\s*/).pop().trim());
  for (const m of s.matchAll(/import\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) defs.add(n.trim().split(/\s+as\s+/).pop());
  for (const m of s.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) defs.add(m[1]);
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) for (const n of m[1].split(',')) defs.add(n.trim().replace(/^\.\.\./, '').replace(/=.*/, '').trim());
  for (const m of s.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) defs.add(m[1]);
  for (const m of s.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)/g)) for (const n of m[1].split(',')) defs.add(n.trim().replace(/^\.\.\./, '').replace(/=.*/, '').trim());
  // 함수가 객체로 받는 인자 function f({ a, b = () => 0 }) — 받은 이름도 정의로 본다.
  for (const m of s.matchAll(/function\s*[\w$]*\s*\(\s*\{([\s\S]*?)\}\s*(?:=\s*\{\s*\})?\s*\)/g)) {
    const flat = m[1].replace(/\([^()]*\)/g, '');
    for (const n of flat.matchAll(/(?:^|,)\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/g)) defs.add(n[1]);
  }
  // 객체 안 메서드 줄임 정의 name(args){ … }
  for (const m of s.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g)) defs.add(m[1]);
  // 한 줄에 여러 개를 선언하거나(let a = 1, b = () => {}) 대체 이름으로 받거나({ A: B }) 기본값을 준 이름도 정의다.
  for (const m of s.matchAll(/(?:const|let|var)\s+([^;\n]+)/g)) for (const n of m[1].split(',')) {
    const name = n.trim().match(/^([A-Za-z_$][\w$]*)/);
    if (name) defs.add(name[1]);
  }
  for (const m of s.matchAll(/function\s*[\w$]*\s*\(/g)) {
    let i = m.index + m[0].length, depth = 1, buf = '';
    for (; i < s.length && depth > 0; i += 1) {
      if (s[i] === '(') depth += 1;
      else if (s[i] === ')') { depth -= 1; if (!depth) break; }
      buf += s[i];
    }
    for (const n of buf.split(',')) defs.add(n.trim().replace(/^\.\.\./, '').split(/\s*[:=]\s*/).pop().trim());
  }
  for (const m of s.matchAll(/(?:^|[,{(\s])([A-Za-z_$][\w$]*)\s*=/g)) defs.add(m[1]);
  return [...calls].filter(n => !defs.has(n) && !KEYWORDS.has(n) && !BUILTINS.has(n) && !GLOBALS.has(n)).sort();
}

test('셸과 셸·공통 모듈마다 이름으로 부르는 함수는 그 파일이 정의하거나 받거나 들여온다', async () => {
  const problems = [];
  const targets = [['shell.mjs', shellUrl]];
  for (const name of (await readdir(root)).filter(n => n.endsWith('.mjs') && n !== 'shell.mjs')) targets.push([name, new URL(name, root)]);
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.mjs'))) targets.push([`shell/${name}`, new URL(name, dir)]);
  for (const [name, url] of targets) {
    const missing = unresolvedCalls(await readFile(url, 'utf8'));
    if (missing.length) problems.push(`${name}: ${missing.join(', ')}`);
  }
  assert.deepEqual(problems, [], `받지 않은 채 부르는 이름이 있다:\n${problems.join('\n')}`);
});

test('셸이 설정 모듈 함수를 이름으로 부르면 그 모듈이 이름을 받거나 공유 연결을 가진다', async () => {
  const names = (await readdir(dir)).filter(n => n.endsWith('.mjs'));
  const all = await Promise.all(names.map(async name => [name, stripComments(await readFile(new URL(name, dir), 'utf8'))]));
  const runtime = all.filter(([,source]) => /Object\.defineProperties\s*\(\s*ctx\s*,/.test(source) || /export\s+function\s+create\w+\s*\(\s*ctx\s*\)/.test(source));
  const sources = [['shell.mjs', stripComments(await readFile(shellUrl, 'utf8'))], ...runtime];
  const settings = await readFile(new URL('settings.mjs', dir), 'utf8');
  const fns = [...settings.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map(m => m[1]);
  const providers = new Map();
  for (const [name, source] of runtime) {
    for (const m of source.matchAll(/^\s*([\w$]+)\s*:\s*\{\s*(?:value|get)\s*:/gm)) {
      const existing = providers.get(m[1]) || [];
      existing.push(name);
      providers.set(m[1], existing);
    }
  }
  const problems = [];
  for (const [name, source] of sources) {
    const own = new Set();
    for (const m of source.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) own.add(m[1]);
    for (const m of source.matchAll(/\{([^}]+)\}\s*=\s*shellSettings\b/g)) for (const n of m[1].split(',')) own.add(n.trim());
    for (const m of source.matchAll(/import\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) own.add(n.trim().split(/\s+as\s+/).pop());
    for (const n of fns) if (new RegExp(String.raw`(^|[^.A-Za-z0-9_$])${n}\s*\(`).test(source) && !own.has(n)) problems.push(name + ': ' + n);
    // 공유 ctx로 접근하는 이름(함수와 상태)은 정확히 한 모듈에서 연결해야 한다.
    for (const m of stripStrings(source).matchAll(/\bctx\s*\.\s*([\w$]+)/g)) {
      if (providers.get(m[1])?.length !== 1) problems.push(name + ': ctx.' + m[1]);
      if (fns.includes(m[1]) && providers.get(m[1])?.[0] !== 'settings-runtime.mjs') problems.push(name + ': settings ctx.' + m[1]);
    }
  }
  assert.deepEqual(problems, [], '받지 않은 채 부르는 설정 함수 또는 중복/누락 공유 연결');
});
