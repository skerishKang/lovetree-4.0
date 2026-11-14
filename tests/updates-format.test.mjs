// #611 새 소식: updates.json 형식·버전 비교·출처 문구·'한 번만 알림' 저장 규칙.
// 크롬 없는 시험 — 화면 동작(카드·창)은 updates-screen-611.test.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compareVersions, latestEntry, sourceLabel, readSeen, markSeen, renderUpdates, mountUpdates
} from '../public/v41/updates.mjs';

const UPDATES = JSON.parse(readFileSync(new URL('../public/v41/updates.json', import.meta.url), 'utf8'));

test('611: updates.json 은 버전·날짜·항목(kind·text·source·tester?) 모양을 지킨다', () => {
  assert.ok(Array.isArray(UPDATES) && UPDATES.length >= 1, '버전이 하나 이상 있다');
  for (const entry of UPDATES) {
    assert.match(entry.version, /^\d+\.\d+\.\d+$/, '버전 모양');
    assert.match(entry.date, /^\d{4}\.\d{2}\.\d{2}$/, '날짜 모양');
    assert.ok(Array.isArray(entry.items) && entry.items.length >= 1, '항목이 하나 이상 있다');
    for (const item of entry.items) {
      assert.ok(['new', 'fix'].includes(item.kind), `kind는 new|fix (받음: ${JSON.stringify(item)})`);
      assert.equal(typeof item.text, 'string', '한 줄 문구');
      assert.ok(item.text.trim(), '문구가 비지 않는다');
      assert.ok(!item.text.includes('\n'), '한 줄로 적는다');
      assert.ok(['ai_tester', 'user', 'team'].includes(item.source), `source는 ai_tester|user|team (받음: ${JSON.stringify(item)})`);
      if (item.source === 'ai_tester') assert.equal(typeof item.tester, 'string', 'AI 테스터 출처는 테스터 이름을 함께 적는다');
      // 이달용 이슈 번호는 연결용으로만 두는 필드 — 화면 문구에는 넣지 않는다.
      if (item.issue !== undefined) assert.match(item.issue, /^#[\w.-]+$/, '이슈 연결 모양');
    }
  }
});

test('611: 첫 버전(4.1.3)은 새로워진 것·고친 것을 쉬운 말 한 줄씩 담는다', () => {
  const entry = UPDATES.find(e => e.version === '4.1.3');
  assert.ok(entry, '첫 버전 4.1.3 항목이 있다');
  const fresh = entry.items.filter(i => i.kind === 'new');
  const fixed = entry.items.filter(i => i.kind === 'fix');
  assert.ok(fresh.length >= 8, `새로워진 것 줄이 넉넉히 있다(${fresh.length})`);
  assert.ok(fixed.length >= 8, `고친 것 줄이 넉넉히 있다(${fixed.length})`);
  assert.ok(fixed.every(i => i.source === 'ai_tester' && i.tester === '윤제'), '첫 고친 것은 AI 테스터 윤제가 찾아 준 것이다');
  const joined = entry.items.map(i => i.text).join(' ');
  assert.match(joined, /핀보드/, '핀보드');
  assert.match(joined, /재생/, '재생');
  assert.match(joined, /부채꼴/, '지도 부채꼴');
  assert.match(joined, /공개가 기본/, '공개 기본');
  assert.match(joined, /새벽/, '새벽 날짜');
  assert.match(joined, /글씨/, '작던 글씨');
  assert.match(joined, /오늘·어제/, '오늘·어제');
  assert.match(joined, /이름 바꾸기/, '첫 트리 이름');
  assert.match(joined, /날짜/, '보드 날짜 수정');
  assert.doesNotMatch(joined, /#\d/, '화면 문구에 이슈 번호를 쓰지 않는다');
  assert.doesNotMatch(joined, /여러분이/, '“여러분이 알려 주신” 같은 말을 쓰지 않는다');
  assert.doesNotMatch(joined, /UI|컴포넌트|API|PR|버그/, '개발 용어를 쓰지 않는다');
});

test('611: 버전 비교·최신 버전 선택은 숫자 세 자리로만 한다', () => {
  assert.equal(compareVersions('4.1.3', '4.1.2'), 1);
  assert.equal(compareVersions('4.1.2', '4.1.3'), -1);
  assert.equal(compareVersions('4.2.0', '4.1.9'), 1);
  assert.equal(compareVersions('4.1.3', '4.1.3'), 0);
  const list = [
    {version: '4.1.2', date: '2026.11.10', items: []},
    {version: '4.1.3', date: '2026.11.14', items: []},
    {version: 'x.y', date: '', items: []}
  ];
  assert.equal(latestEntry(list).version, '4.1.3');
  assert.equal(latestEntry([]), null);
  assert.equal(latestEntry(null), null);
});

test('611: 출처 한 줄은 AI 테스터와 실제 사용자를 구분한다', () => {
  assert.equal(sourceLabel({source: 'ai_tester', tester: '윤제'}), 'AI 테스터가 찾아 준 것 · 윤제');
  assert.equal(sourceLabel({source: 'user'}), '사용자 의견으로 고친 것');
  assert.equal(sourceLabel({source: 'team'}), '');
  assert.equal(sourceLabel({}), '');
});

test('611: 렌더는 버전별·새로워진 것·고친 것 순서로 쉬운 말만 쓴다', () => {
  const html = renderUpdates(UPDATES, '4.1.3');
  assert.match(html, /러브트리 4\.1\.3/, '버전 제목');
  assert.match(html, /새로워진 것/, '새로워진 것 묶음');
  assert.match(html, /고친 것/, '고친 것 묶음');
  assert.match(html, /AI 테스터가 찾아 준 것 · 윤제/, '출처 표시');
  assert.match(html, /data-updates-version="4\.1\.3"/, '버전 자리');
  assert.match(html, /data-active="true"/, '연 버전 자리 표시');
  assert.doesNotMatch(html, /여러분이/, '금지 문구가 없다');
  assert.doesNotMatch(html, /이슈 #/, '이슈 번호를 보여 주지 않는다');
  const empty = renderUpdates([], '');
  assert.match(empty, /아직 새 소식이 없어요/, '빈 목록 안내');
});

test('611: 닫으면 그 버전은 다시 안 띄운다(브라우저 저장, try/catch)', async () => {
  let shown = 0;
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const els = {};
  const $ = id => (els[id] ||= { hidden: true, textContent: '', innerHTML: '', listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; }, showModal() { this.open = true; } });
  const mount = mountUpdates({
    $, showPanel: () => {}, storage, onDot: () => {},
    fetchJson: async () => UPDATES
  });
  await mount.start();
  assert.equal(els['updates-card'].hidden, false, '새 버전이면 한 번 작은 카드를 보인다');
  assert.match(els['updates-card-text'].textContent, /4\.1\.3/, '카드에 버전이 적힌다');
  await els['updates-dismiss'].listeners.click();
  assert.equal(els['updates-card'].hidden, true, '닫으면 카드가 사라진다');
  assert.equal(readSeen(storage), '4.1.3', '본 버전을 저장한다');
  const again = mountUpdates({ $, showPanel: () => {}, storage, onDot: () => {}, fetchJson: async () => UPDATES });
  const r = await again.start();
  assert.equal(r.newer, false, '다시 접속하면 안 보인다');
  await again.openUpdates();
  assert.equal(readSeen(storage), '4.1.3', '창을 열어도 같은 Versions 로 유지된다');
});

test('611: 저장소가 막혀도 화면이 멈추지 않는다', async () => {
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readSeen(storage), null);
  markSeen(storage, '4.1.3'); // throw 없이 지나간다
  const els = {};
  const $ = id => (els[id] ||= { hidden: true, textContent: '', innerHTML: '', listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; }, showModal() { this.open = true; } });
  const dot = [];
  const mount = mountUpdates({ $, showPanel: () => {}, storage, onDot: v => dot.push(v), fetchJson: async () => UPDATES });
  const r = await mount.start();
  assert.equal(r.newer, true, '저장소가 없어도 새 버전이면 알린다');
  assert.deepEqual(dot, [true]);
  await mount.openUpdates();
  assert.deepEqual(dot, [true, true], '저장소가 막히면 본 버전을 남기지 못해 점이 그대로다(에러는 만들지 않는다)');
});
