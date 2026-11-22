// 셸이 설정 모듈로 옮긴 함수를 이름만으로 부르면 실행 중에 '정의되지 않음'으로 멈춘다.
// 공유 주소(/t/…)가 빈 화면으로 남은 일(showPublicRoute)의 재발 방지 시험.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
const settings = await readFile(new URL('../public/v41/shell/settings.mjs', import.meta.url), 'utf8');

function settingsFunctions() {
  return [...settings.matchAll(/^(?:async )?function ([A-Za-z0-9_]+)\(/gm)].map(m => m[1]);
}
function shellOwnNames() {
  const names = new Set();
  for (const m of shell.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  const pulled = /const\s*\{([^}]*)\}\s*=\s*shellSettings/.exec(shell);
  if (pulled) for (const n of pulled[1].split(',')) names.add(n.trim());
  for (const m of shell.matchAll(/import\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) names.add(n.trim().split(/\s+as\s+/).pop());
  return names;
}

test('설정 모듈 함수를 셸에서 이름으로 부르면 셸이 그 이름을 받아 둔다', () => {
  const own = shellOwnNames();
  const missing = settingsFunctions().filter(name =>
    new RegExp(`(^|[^.A-Za-z0-9_])${name}\\(`).test(shell) && !own.has(name));
  assert.deepEqual(missing, [], `셸이 받지 않은 채 부르는 설정 함수: ${missing.join(', ')}`);
});

test('공유 주소 열기는 설정 모듈이 내보낸다', () => {
  const ret = /return\s*\{([^}]*)\}\s*;?\s*\}\s*$/.exec(settings.trimEnd());
  assert.ok(ret && /\bshowPublicRoute\b/.test(ret[1]), 'createSettings가 showPublicRoute를 돌려주지 않는다');
});
