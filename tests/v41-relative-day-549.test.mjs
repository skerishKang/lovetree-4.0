// #549: '마지막 순간 · 0일 전'을 처음 보는 표현이라는 고객 지적 → 0일은 '오늘', 1일은 '어제',
// 그 뒤는 'N일 전'. 일수 계산 규칙은 #547의 지역 날짜 한 벌(public/v41/local-date.*)에 둔다 —
// UTC 기준 floor 계산은 새벽을 넣은 순간 하루가 밀렸다(#547과 같은 원인).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localDaysBetween, relativeDayLabel } from '../public/v41/local-date.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* ── 1. 말로: 0일 오늘 · 1일 어제 · 그 뒤 N일 전 ───────────────────── */
test('#549 지난 날 안내: 0일은 오늘, 1일은 어제, 그 뒤는 N일 전', () => {
  assert.equal(relativeDayLabel(0), '오늘');
  assert.equal(relativeDayLabel(1), '어제');
  assert.equal(relativeDayLabel(2), '2일 전');
  assert.equal(relativeDayLabel(10), '10일 전');
  assert.equal(relativeDayLabel(-1), '오늘', '미래 시각(시계 차이)도 오늘');
  assert.equal(relativeDayLabel(Number.NaN), '오늘', '알 수 없으면 오늘');
});

/* ── 2. 일수: 기기 지역 날짜 기준 (UTC 계산과 어긋나는 지점) ────────── */
test('#549 일수는 지역 날짜 기준: 같은 지역 날짜면 0, 지역 날짜가 바뀌면 1', () => {
  assert.equal(localDaysBetween(new Date(2026, 10, 15, 1, 0), new Date(2026, 10, 14, 23, 30)), 1, '밤 11시 반에 담고 새벽 1시에 보면 어제');
  assert.equal(localDaysBetween(new Date(2026, 10, 15, 9, 0), new Date(2026, 10, 15, 0, 1)), 0, '같은 날이면 오늘');
  assert.equal(localDaysBetween(new Date(2026, 10, 15, 0, 0), new Date(2026, 10, 5, 12, 0)), 10, '열흘 전');
});

/* ── 3. 시간대 경계: 자식 프로세스에 TZ를 고정해 실제로 돌린다 ──────── */
function runInZone(tz, expression) {
  const asUrl = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);
  const code = `import { localDaysBetween, relativeDayLabel } from ${asUrl('public/v41/local-date.mjs')};
const answer = ${expression};
console.log(JSON.stringify(answer));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
    cwd: ROOT,
  }).trim().split('\n').at(-1));
}

test('#549 시간대 경계(한국 새벽): UTC 계산과 어긋나던 지점에서 지역 날짜를 따른다', () => {
  // KST 13일 23:00에 담고(=13T14:00Z) KST 14일 01:00에 보면(=13T16:00Z): UTC floor는 0일, 지역 날짜는 1일.
  const overMidnight = runInZone('Asia/Seoul', `relativeDayLabel(localDaysBetween(new Date('2026-11-13T16:00:00Z'), new Date('2026-11-13T14:00:00Z')))`);
  assert.equal(overMidnight, '어제');
  // KST 14일 08:00에 담고(=13T23:00Z) KST 14일 10:00에 보면(=14T01:00Z): UTC floor는 1일, 지역 날짜는 0일.
  const sameLocalDay = runInZone('Asia/Seoul', `relativeDayLabel(localDaysBetween(new Date('2026-11-14T01:00:00Z'), new Date('2026-11-13T23:00:00Z')))`);
  assert.equal(sameLocalDay, '오늘');
});

/* ── 4. 첫 화면 배선: 궤도 카드가 이 한 벌을 쓴다 ──────────────────── */
test('#549 첫 화면 최근 순간 카드는 이 규칙을 쓴다(두 벌로 갈라지지 않게)', () => {
  const orbit = readFileSync(path.join(ROOT, 'src/views/orbit.js'), 'utf8');
  assert.match(orbit, /import \{localDaysBetween, relativeDayLabel\} from '\.\.\/\.\.\/public\/v41\/local-date\.mjs';/);
  assert.match(orbit, /relativeDayLabel\(days\)/);
  assert.doesNotMatch(orbit, /Math\.floor\(\(Date\.now\(\)-raw\)\/86400000\)/, 'UTC floor 계산의 잔여가 없어야 한다');
});
