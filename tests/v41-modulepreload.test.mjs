import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collect, apply} from '../tools/v41-modulepreload.mjs';

const html = fs.readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');

test('#400 index.html의 modulepreload 목록이 셸의 정적 import와 같다', () => {
  assert.equal(apply(html), html, 'node tools/v41-modulepreload.mjs 로 목록을 갱신하세요');
});

test('#400 목록에 셸 본체와 대표 모듈이 있고 중복이 없다', () => {
  const files = collect();
  assert.ok(files.includes('shell.mjs') && files.includes('shell/panels.mjs') && files.includes('domain.mjs'));
  assert.equal(new Set(files).size, files.length);
  for (const f of files) assert.ok(fs.existsSync(new URL('../public/v41/' + f, import.meta.url)), f);
});
