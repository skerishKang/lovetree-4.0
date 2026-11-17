// #611 새 소식: updates.json 형식·버전 비교·출처 문구·'한 번만 알림' 저장 규칙.
// 크롬 없는 시험 — 화면 동작(카드·창)은 updates-screen-611.test.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compareVersions, latestEntry, sourceLabel, sourceSummary, readSeen, markSeen, renderUpdates, renderEras, erasModel, mountUpdates
} from '../public/v41/updates.mjs';

const UPDATES = JSON.parse(readFileSync(new URL('../public/v41/updates.json', import.meta.url), 'utf8'));
const ERAS = JSON.parse(readFileSync(new URL('../public/v41/eras.json', import.meta.url), 'utf8'));

test('611: updates.json 은 버전·날짜·항목(kind·text·source·tester?) 모양을 지킨다', () => {
  assert.ok(Array.isArray(UPDATES) && UPDATES.length >= 1, '버전이 하나 이상 있다');
  for (const entry of UPDATES) {
    assert.match(entry.version, /^\d+\.\d+\.\d+$/, '버전 모양');
    assert.match(entry.date, /^\d{4}\.\d{2}\.\d{2}$/, '날짜 모양');
    assert.ok(Array.isArray(entry.items) && entry.items.length >= 1, '항목이 하나 이상 있다');
    for (const item of entry.items) {
      assert.ok(['new', 'fix', 'soon'].includes(item.kind), `kind는 new|fix|soon (받음: ${JSON.stringify(item)})`);
      assert.equal(typeof item.text, 'string', '한 줄 문구');
      assert.ok(item.text.trim(), '문구가 비지 않는다');
      assert.ok(!item.text.includes('\n'), '한 줄로 적는다');
      assert.ok(['ai_tester', 'user', 'team'].includes(item.source), `source는 ai_tester|user|team (받음: ${JSON.stringify(item)})`);
      if (item.source === 'ai_tester' && item.tester !== undefined) assert.equal(typeof item.tester, 'string', 'AI 명예회원 출처에 이름이 있으면 문자열이다 (받음: ' + JSON.stringify(item) + ')');
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
  // #625: 390 카드 위치 수정 한 줄은 팀 출처(source: team)다 — 나머지 고친 것은 AI 명예회원 출처(#678 회차 지적).
  assert.ok(fixed.every(i => (i.source === 'ai_tester' && i.tester === '윤제') || i.source === 'team'), '고친 것은 AI 명예회원 윤제 또는 팀 출처다');
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

test('611: 출처 이름표는 짧은 이름으로 AI 명예회원과 실제 사용자를 구분한다', () => {
  assert.equal(sourceLabel({source: 'ai_tester', tester: '윤제'}), '윤제 님');
  assert.equal(sourceLabel({source: 'ai_tester'}), 'AI 명예회원', '이름을 모르면 역할로만 보여 준다');
  assert.equal(sourceLabel({source: 'user'}), '사용자 의견');
  assert.equal(sourceLabel({source: 'team'}), '');
  assert.equal(sourceLabel({}), '');
});

test('261117: 창 맨 아래 출처 줄은 이름별 개수를 한 번만 모은다', () => {
  const items = [
    {source: 'ai_tester', tester: '윤제'}, {source: 'ai_tester', tester: '윤제'},
    {source: 'ai_tester', tester: '보람'}, {source: 'team'}, {source: 'user'}
  ];
  assert.equal(sourceSummary(items), 'AI 명예회원 윤제 님 2 · 보람 님 1');
  assert.equal(sourceSummary([{source: 'ai_tester', tester: '하은'}, {source: 'ai_tester', tester: '하은'}]), 'AI 명예회원 하은 님이 알려 준 것 2가지');
  assert.equal(sourceSummary([]), '');
  assert.equal(sourceSummary([{source: 'team'}]), '');
});

test('611: 렌더는 버전별·새로워진 것·고친 것 순서로 쉬운 말만 쓴다', () => {
  const html = renderUpdates(UPDATES, '4.1.3');
  assert.match(html, /러브트리 4\.1\.3/, '버전 제목');
  assert.match(html, /새로워진 것/, '새로워진 것 묶음');
  assert.match(html, /고친 것/, '고친 것 묶음');
  assert.match(html, /<span class="updates-source" aria-label="윤제 님이 알려 준 것"><span class="updates-heart" aria-hidden="true">♥<\/span><strong>윤제 님<\/strong><\/span>/, '항목 끝 이름표');
  assert.match(html, /<p class="updates-source-summary">AI 명예회원 /, '창 맨 아래 출처 집계 줄');
  assert.ok((html.match(/AI 명예회원 [^\n]*님이 알려 준 것/g) || []).length <= 1, '긴 출처 문장은 집계 줄에만 한 번');
  assert.match(html, /data-updates-version="4\.1\.3"/, '버전 자리');
  assert.match(html, /data-active="true"/, '연 버전 자리 표시');
  assert.doesNotMatch(html, /여러분이/, '금지 문구가 없다');
  assert.doesNotMatch(html, /이슈 #/, '이슈 번호를 보여 주지 않는다');
  const empty = renderUpdates([], '');
  assert.match(empty, /아직 새 소식이 없어요/, '빈 목록 안내');
});

test('616: 아직 준비 중(soon)은 고친 것 뒤에 한 버전에 한 번만 보인다', () => {
  const html = renderUpdates(UPDATES, '4.1.6');
  const start = html.indexOf('data-updates-version="4\.1\.6"');
  assert.ok(start > -1, '4.1.6 버전 자리가 있다');
  const end = html.indexOf('data-updates-version="4\.1\.5"', start);
  const section = html.slice(start, end > -1 ? end : undefined);
  assert.match(section, /새로워진 것/, '4.1.6에 새로워진 것 있다');
  assert.match(section, /고친 것/, '4.1.6에 고친 것 있다');
  assert.match(section, /아직 준비 중/, '4.1.6에 아직 준비 중 있다');
  assert.ok(section.indexOf('고친 것') < section.indexOf('아직 준비 중'), '아직 준비 중은 고친 것 뒤에 온다');
  assert.equal((html.match(/아직 준비 중/g) || []).length, 1, '아직 준비 중 제목은 전체 화면에서 한 번만 보인다');
  // soon 항목에는 출처 줄을 붙이지 않는다(team 출처 — 문구 자체가 없지만 묶음 규칙과 함께 다시 확인한다).
  assert.doesNotMatch(section, /아직 준비 중[\s\S]*?updates-source/, '아직 준비 중 묶음에는 출처 줄이 없다');
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
  const latest = latestEntry(UPDATES).version; // #619: 다음 버전(4.1.4)이 오면 그 버전이 카드에 뜬다고 시험한다
  assert.match(els['updates-card-text'].textContent, new RegExp(latest.replaceAll('.', '\\.')), '카드에 최신 버전이 적힌다');
  await els['updates-dismiss'].listeners.click();
  assert.equal(els['updates-card'].hidden, true, '닫으면 카드가 사라진다');
  assert.equal(readSeen(storage), latest, '본 버전을 저장한다');
  const again = mountUpdates({ $, showPanel: () => {}, storage, onDot: () => {}, fetchJson: async () => UPDATES });
  const r = await again.start();
  assert.equal(r.newer, false, '다시 접속하면 안 보인다');
  await again.openUpdates();
  assert.equal(readSeen(storage), latest, '창을 열어도 같은 버전으로 유지된다');
});

test('611: 버전 번호는 겹치지 않고, 위에서부터 큰 번호 순서다', () => {
  const versions = UPDATES.map(e => e.version);
  assert.equal(new Set(versions).size, versions.length, `버전 번호가 겹친다: ${versions.join(', ')}`);
  for (let i = 1; i < versions.length; i++) {
    assert.equal(compareVersions(versions[i - 1], versions[i]), 1, `${versions[i - 1]} 항목이 ${versions[i]}보다 위에 있어야 한다`);
  }
});

test('611: AI 명예회원 이름 칸에 역할 글자를 쓰지 않는다', () => {
  for (const entry of UPDATES) {
    for (const item of entry.items) {
      if (item.source !== 'ai_tester' || item.tester === undefined) continue;
      assert.ok(item.tester.trim(), `이름이 있으면 비지 않는다 (${JSON.stringify(item)})`);
      assert.doesNotMatch(item.tester, /^(AI ?테스터|테스터)$/, `역할 글자를 이름으로 쓰지 않는다 (${JSON.stringify(item)})`);
    }
  }
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

// 261116(대표 확정): 4.1.1·4.1.2 복원 — 4.1.3 아래·4.1.0 위에 문구 그대로 끼워 넣는다.
test('261116: 4.1.2·4.1.1은 4.1.3 아래·4.1.0 위에 문구 그대로 들어 있다', () => {
  const order = UPDATES.map(e => e.version);
  const at = v => order.indexOf(v);
  assert.ok(at('4.1.3') >= 0 && at('4.1.0') >= 0, '4.1.3·4.1.0이 있다');
  assert.ok(at('4.1.3') < at('4.1.2'), '4.1.2는 4.1.3 아래');
  assert.ok(at('4.1.2') < at('4.1.1'), '4.1.1은 4.1.2 아래');
  assert.ok(at('4.1.1') < at('4.1.0'), '4.1.1은 4.1.0 위');
  // 261116 대표 손질: 4.1.2의 '보드에서 순간 날짜' 줄은 4.1.3과 겹쳐 지웠다 — 새로워진 것 1줄 + 고친 것 1줄.
  assert.deepEqual(UPDATES.find(e => e.version === '4.1.2').items.map(i => i.text), [
    '지도에서 새 순간이 앞 순간과 저절로 이어지고, 점마다 이름이 보여요',
    '핀보드에서 사진 위를 잡아도 카드가 끌려요. 좁은 화면에서 머리글이 겹치지 않아요'
  ]);
  const dup = UPDATES.find(e => e.version === '4.1.3').items.map(i => i.text).filter(t => t.includes('순간 날짜'));
  assert.ok(dup.length >= 1, '4.1.3에 순간 날짜 줄이 있다(4.1.2에서 지운 이유)');
  assert.equal(UPDATES.find(e => e.version === '4.1.2').items.filter(i => i.text.includes('순간 날짜')).length, 0, '4.1.2에는 같은 줄이 남지 않는다');
  assert.deepEqual(UPDATES.find(e => e.version === '4.1.1').items.map(i => i.text), [
    '보드가 핀보드로 바뀌었어요. 카드를 끌어 원하는 자리에 꽂고, 날짜순과 내 배치를 오갈 수 있어요',
    '첫 트리를 만들면 바로 이름을 바꿀 수 있어요',
    '지도가 나무 부채꼴로 펼쳐지고, 점을 누르면 그 순간이 열려요',
    '책에서 YouTube 영상이 더 잘 재생돼요. 첫 화면 카드를 끌 때 덜 버벅여요. 화면 글자 크기를 맞췄어요'
  ]);
  for (const v of ['4.1.2', '4.1.1']) {
    const entry = UPDATES.find(e => e.version === v);
    assert.equal(entry.date, '2026.11.14', `${v} 날짜`);
    assert.ok(entry.items.every(i => i.source === 'team'), `${v}는 팀 출처`);
  }
});

// 옛 판을 다시 끼워 넣어도 최신 판(4.1.11)이 그대로라 '새 소식' 점이 다시 뜨면 안 된다(#611 저장 규칙).
test('261117: 옛 판 복원으로 새 소식 점이 다시 뜨지 않는다', () => {
  assert.equal(latestEntry(UPDATES).version, '4.1.11', '최신 판은 4.1.11 그대로');
  const map = new Map();
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
  markSeen(storage, '4.1.11');
  const latest = latestEntry(UPDATES).version;
  assert.equal(compareVersions(latest, readSeen(storage)), 0, '본 판과 최신 판이 같아 점이 뜨지 않는다');
  // 4.1.1·4.1.2가 끼어도 그 사이 판을 본 사람에게만 새 소식이 뜬다.
  markSeen(storage, '4.1.0');
  assert.equal(compareVersions(latest, readSeen(storage)), 1, '4.1.0까지 본 사람에게는 여전히 새 소식이 있다');
});

// 261116(대표 확정): '러브트리가 걸어온 길' — 세대 카드 다섯 장, 옛것 → 지금 순서.
test('261116: 걸어온 길 자료는 다섯 세대를 옛것 → 지금 순서로 담는다', () => {
  assert.ok(Array.isArray(ERAS) && ERAS.length === 5, '세대 카드 다섯 장');
  assert.deepEqual(ERAS.map(e => e.mark), ['1', '2', '3', '4.0', '4.1'], '번호 순서');
  assert.deepEqual(ERAS.map(e => e.name), ['첫 씨앗', '러브버드', '리모네·3.0', '러브트리 4.0', '러브트리 4.1']);
  for (const era of ERAS) {
    assert.equal(typeof era.when, 'string', '때');
    assert.ok(era.when.trim(), '때가 비지 않는다');
    assert.equal(typeof era.line, 'string', '한 줄');
    assert.ok(era.line.trim(), '한 줄이 비지 않는다');
    // 화면 문구에 저장소 주소·추정·개발 용어를 넣지 않는다.
    const joined = `${era.mark} ${era.name} ${era.when} ${era.line}`;
    assert.doesNotMatch(joined, /https?:|github|저장소|추정/, `개발 용어 없음: ${joined}`);
  }
});

test('261116: 걸어온 길 카드는 마지막(지금) 한 장만 금테이고, 못 읽으면 그리지 않는다', () => {
  const html = renderEras(ERAS);
  assert.equal((html.match(/class="eras-card"/g) || []).length, 5, '카드 다섯 장');
  assert.equal((html.match(/data-current="true"/g) || []).length, 1, '금테는 한 장만');
  assert.ok(html.indexOf('data-current') > html.indexOf('러브트리 4.0'), '마지막(4.1) 카드가 금테다');
  assert.ok(html.indexOf('첫 씨앗') < html.indexOf('러브트리 4.1'), '옛것 → 지금 순서');
  // 자료가 없거나 모양이 깨지면 빈 문자열 — 구획을 조용히 숨긴다.
  assert.equal(renderEras([]), '');
  assert.equal(renderEras(null), '');
  assert.equal(renderEras([{ name: '이름만' }]), '', '번호가 없으면 버린다');
  assert.deepEqual(erasModel([{ mark: ' ', name: 'x' }, { mark: '1', name: 'ok' }]).map(e => e.name), ['ok']);
  // 화면 글자로 넣기 전에 그대로 escape한다.
  assert.match(renderEras([{ mark: '1', name: '<b>가&나</b>', when: '', line: '' }]), /&lt;b&gt;가&amp;나&lt;\/b&gt;/);
});
