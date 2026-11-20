// #1015(#886 항목5): !important·인라인 style 래칫이 늘면 실패·줄면 통과하는지 검증한다.
// 임시 사본은 os.tmpdir()에 만들고 저장소의 CSS·HTML은 고치지 않는다. 숫자는 기준 파일에서 읽는다(하드코딩 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {countText, isVarsOnly} from '../tools/v41-style-ratchet.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(repoRoot, 'tools', 'v41-style-ratchet.mjs');
const BASELINE = path.join(repoRoot, 'tests', 'fixtures', 'style-baseline.json');
const baselineFiles = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files;
// 늘림·줄음 시험의 대상: 기준에 !important가 2개 이상인 첫 파일(줄여도 항목이 남는다). 없으면 1개 이상인 파일.
const sortedKeys = Object.keys(baselineFiles).sort();
const targetKey = sortedKeys.find(k => baselineFiles[k].important > 1) ?? sortedKeys.find(k => baselineFiles[k].important > 0);
const targetBase = baselineFiles[targetKey].important;
const targetRel = targetKey.replace('public/v41/', '');

function runTool(args) {
  const r = spawnSync(process.execPath, [TOOL, ...args], {cwd: repoRoot, encoding: 'utf8'});
  return {status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '')};
}

function tmpCopy(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lt1015-ratchet-'));
  t.after(() => fs.rmSync(tmp, {recursive: true, force: true, maxRetries: 3, retryDelay: 100}));
  fs.cpSync(path.join(repoRoot, 'public', 'v41'), path.join(tmp, 'v41'), {recursive: true});
  return tmp;
}

test('#1015 지금 main에서 래칫이 통과한다', () => {
  const r = runTool([]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /스타일 래칫 통과/);
});

test('#1015 사본에 !important 하나를 넣으면 파일·전후 숫자·줄 번호를 보여주고 실패한다', t => {
  const tmp = tmpCopy(t);
  const file = path.join(tmp, 'v41', ...targetRel.split('/'));
  const before = fs.readFileSync(file, 'utf8');
  const probeLine = before.split(/\r?\n/).length + 1;
  fs.writeFileSync(file, before + '\n.lt-ratchet-probe{color:red !important}\n');
  const r = runTool(['--root', path.join(tmp, 'v41')]);
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes(targetKey), r.out);
  assert.ok(r.out.includes(`${targetBase} → ${targetBase + 1}`), r.out);
  assert.ok(r.out.includes('줄 번호:'), r.out);
  assert.ok(r.out.split('줄 번호:')[1].split(/\D+/).filter(Boolean).map(Number).includes(probeLine), r.out);
});

test('#1015 새 파일은 0이 기준 — 새 파일에 !important를 넣으면 실패한다', t => {
  const tmp = tmpCopy(t);
  fs.writeFileSync(path.join(tmp, 'v41', 'ratchet-new-file.css'), '.x{color:red !important}\n');
  const r = runTool(['--root', path.join(tmp, 'v41')]);
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes('public/v41/ratchet-new-file.css'), r.out);
  assert.ok(r.out.includes('0 → 1'), r.out);
});

test('#1015 줄었으면 통과하고 기준 낮춤 안내를 낸다', t => {
  const tmp = tmpCopy(t);
  const file = path.join(tmp, 'v41', ...targetRel.split('/'));
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('!important', ''));
  const r = runTool(['--root', path.join(tmp, 'v41')]);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes(`${targetBase} → ${targetBase - 1}`), r.out);
  assert.ok(r.out.includes('기준을 낮추세요: node tools/v41-style-ratchet.mjs --write'), r.out);
});

test('#1015 --write는 줄어든 쪽만 반영한다', t => {
  const tmp = tmpCopy(t);
  const file = path.join(tmp, 'v41', ...targetRel.split('/'));
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('!important', ''));
  const base = path.join(tmp, 'baseline.json');
  fs.copyFileSync(BASELINE, base);
  const r = runTool(['--root', path.join(tmp, 'v41'), '--baseline', base, '--write']);
  assert.equal(r.status, 0, r.out);
  const written = JSON.parse(fs.readFileSync(base, 'utf8'));
  assert.equal(written.files[targetKey]?.important ?? 0, targetBase - 1);
  for (const [k, v] of Object.entries(baselineFiles)) {
    if (k !== targetKey) assert.deepEqual(written.files[k], v);
  }
});

test('#1015 --write는 늘어난 파일이 있으면 쓰지 않고 실패한다', t => {
  const tmp = tmpCopy(t);
  const file = path.join(tmp, 'v41', ...targetRel.split('/'));
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8') + '\n.lt-ratchet-probe{color:red !important}\n');
  const base = path.join(tmp, 'baseline.json');
  fs.copyFileSync(BASELINE, base);
  const before = fs.readFileSync(base, 'utf8');
  const r = runTool(['--root', path.join(tmp, 'v41'), '--baseline', base, '--write']);
  assert.equal(r.status, 1, r.out);
  assert.equal(fs.readFileSync(base, 'utf8'), before);
});

test('#1015 CSS 변수만 넣는 인라인 style은 세지 않는다', () => {
  assert.equal(isVarsOnly('--n:3'), true);
  assert.equal(isVarsOnly('--a:1; --b:2'), true);
  assert.equal(isVarsOnly('--n:3;color:red'), false);
  assert.equal(countText('<i style="--n:0"></i><i style="--a:1;--b:2"></i>', '.html').inlineStyle, 0);
  assert.equal(countText('<i style="color:red"></i>', '.html').inlineStyle, 1);
  assert.equal(countText('<i style="--n:3;color:red"></i>', '.html').inlineStyle, 1);
  assert.equal(countText("<i style='color:red'></i>", '.html').inlineStyle, 1);
  assert.equal(countText('<button data-date-style="dot">2026. 11. 10</button>', '.html').inlineStyle, 0);
});

test('#1015 !important 개수는 대소문자·JS style 문자열을 보고, !importantFlag 같은 코드는 세지 않는다', () => {
  assert.equal(countText('.a{color:red !important}', '.css').important, 1);
  assert.equal(countText('.a{color:red !IMPORTANT}', '.css').important, 1);
  assert.equal(countText("el.style.cssText='color:red !important'", '.mjs').important, 1);
  assert.equal(countText("el.style.cssText='color:red !important'", '.mjs').inlineStyle, 0);
  assert.equal(countText('if(!importantFlag) return;', '.mjs').important, 0);
});

test('#1015 .js와 .mjs 템플릿 문자열의 인라인 style도 센다(CSS 변수 전용은 제외)', t => {
  const jsKey = sortedKeys.find(k => k.endsWith('.js') && baselineFiles[k].inlineStyle > 0);
  const jsBase = baselineFiles[jsKey].inlineStyle;
  const tmp = tmpCopy(t);
  const file = path.join(tmp, 'v41', ...jsKey.replace('public/v41/', '').split('/'));
  const before = fs.readFileSync(file, 'utf8');
  const probeLine = before.split(/\r?\n/).length + 1;
  fs.writeFileSync(file, before + '\nconst probe = \'<div style="color:red"></div>\';\n');
  const r = runTool(['--root', path.join(tmp, 'v41')]);
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes(jsKey), r.out);
  assert.ok(r.out.includes(`인라인 style ${jsBase} → ${jsBase + 1}`), r.out);
  assert.ok(r.out.includes('줄 번호:'), r.out);
  assert.ok(r.out.includes(String(probeLine)), r.out);
  assert.equal(countText('<div style="--x:${v}"></div>', '.js').inlineStyle, 0);
  assert.equal(countText('<div style="color:red"></div>', '.js').inlineStyle, 1);
  assert.equal(countText("el.style.color = 'red'", '.js').inlineStyle, 0);
});