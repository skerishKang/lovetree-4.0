// #627 1단계: 꼬리표(재료)의 데이터·규칙 계약.
// - 저장 형식: keywords 칸에 '종류:값'으로 담는다(노래·멤버·활동기·무대·감정 — TAG_KINDS 한 곳에서 정의).
//   24자 한도 안에서 종류 표시 뒤 값이 20~21자 남고, 종류 표시가 없는 기존 keywords는 그대로 읽힌다(뒤로 호환).
// - 제목 해석: 유튜브 제목처럼 생긴 문자열에서 꼬리표 후보를 '제안'만 한다 — 저장 호출은 이 단계에 없다.
// - 재사용 제안: 내가 쓴 꼬리표 가운데 제목과 맞는 것을 먼저 제안하고(표기 차이·대소문자 맞춤), 제목 규칙이 그 뒤를 잇는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeTag, parseTag, normalizeTags, tagValues, tagKey, TAG_KINDS, TAG_MAX_LENGTH, TAG_MAX_COUNT, suggestTagsFromTitle } from '../public/v41/tags.mjs';
import { createTree, addMoment, validateState } from '../src/domain.js';

const input = (title = '첫 목소리') => ({ subject: '윤슬', title, note: '오래 기억하고 싶은 마음', emotion: '설렘', date: '2026-10-27', url: '' });
const stateOf = (tree) => ({ version: 1, trees: [tree] });
const brief = (result) => result.proposals.map((p) => (p.kindId || 'plain') + ':' + p.value + (p.tooLong ? '(너무 길다)' : ''));

test('종류 목록은 한 곳(TAG_KINDS)에 있고, 접두어를 붙여 만들고 그대로 읽힌다', () => {
  assert.deepEqual(TAG_KINDS.map((k) => k.label), ['노래', '멤버', '활동기', '무대', '감정']);
  assert.deepEqual(TAG_KINDS.map((k) => k.id), ['song', 'member', 'era', 'stage', 'emotion']);
  // 만들기·읽기가 서로를 왕복한다.
  for (const k of TAG_KINDS) {
    const raw = makeTag(k.id, '값');
    assert.equal(raw, k.prefix + '값');
    const back = parseTag(raw);
    assert.equal(back.kindId, k.id);
    assert.equal(back.label, k.label);
    assert.equal(back.value, '값');
  }
  // 모르는 종류·빈 값·24자 넘음은 만들지 않는다(조용히 자르지 않는다).
  assert.equal(makeTag('lecture', '강의 1강'), null, '아직 없는 종류');
  assert.equal(makeTag('song', '   '), null);
  assert.equal(makeTag('song', 'x'.repeat(22)), null, '접두어 3자 + 22자 = 25자');
  assert.equal(makeTag('song', 'x'.repeat(21)), '노래:' + 'x'.repeat(21), '접두어 3자 + 21자 = 24자까지 된다');
  assert.equal(makeTag('era', 'x'.repeat(20)), '활동기:' + 'x'.repeat(20), '활동기 표시는 4자라 값이 20자까지');
});

test('종류 표시가 없는 기존 keywords는 그대로 읽힌다(뒤로 호환)', () => {
  for (const legacy of ['무대', '여행', '팬심', 'Super Shy', '노래', '활동기']) {
    const p = parseTag(legacy);
    assert.equal(p.kindId, null, `${legacy}는 종류 없는 꼬리표다`);
    assert.equal(p.value, legacy);
  }
  // '노래' 같은 낱말 자체는 접두어가 아니다 — 값이 비어 종류 없는 꼬리표다.
  const { tags } = normalizeTags(['무대', '여행', '팬심']);
  assert.deepEqual(tags, ['무대', '여행', '팬심'], '기존 데이터는 한 글자도 바뀌지 않는다');
});

test('정리(검사)는 서버 규칙 그대로: 길이·제어문자·중복·개수 — 잃은 것은 이유를 남긴다', () => {
  // 중복(표기 차이 포함)은 하나만 남는다.
  const dedup = normalizeTags(['노래:Super Shy', '노래:super shy', '노래:Ｓuper Shy']);
  assert.deepEqual(dedup.tags, ['노래:Super Shy']);
  assert.deepEqual(dedup.dropped.map((d) => d.reason), ['duplicate', 'duplicate']);
  // 24자 넘음·제어문자·빈 값·문자열 아님 — 서버가 거르는 것과 같은 이유로 거른다.
  const bad = normalizeTags(['x'.repeat(25), '나쁨\u0001표', '   ', 42, '노래:Super Shy']);
  assert.deepEqual(bad.tags, ['노래:Super Shy']);
  assert.deepEqual(bad.dropped.map((d) => d.reason), ['length', 'control', 'empty', 'type']);
  // 20개를 넘으면 앞의 20개를 남기고 넘는 것은 'count'로 기록한다(서버의 slice와 같은 순서).
  const many = Array.from({ length: 25 }, (_, i) => '감정:마음' + i);
  const over = normalizeTags(many);
  assert.equal(over.tags.length, TAG_MAX_COUNT);
  assert.deepEqual(over.dropped, many.slice(20).map((v) => ({ value: v, reason: 'count' })));
  // 종류별 값 뽑기(다음 단계 그래프 묶음용).
  assert.deepEqual(tagValues(['노래:Super Shy', '무대', '노래:ETA'], 'song'), ['Super Shy', 'ETA']);
  assert.deepEqual(tagValues(['무대:인기가요 240524'], 'stage'), ['인기가요 240524']);
  // 표기 차이 열쇠: 대소문자·전각·따옴표·마침표를 묶는다.
  assert.equal(tagKey('Ｓuper　Shy.'), tagKey('super shy'));
});

test('도메인이 꼬리표 형식을 그대로 받아 저장한다(기존 keywords와 섞여도)', () => {
  const tree = createTree(input());
  const second = addMoment(tree, input('둘째 마음'), tree.moments[0].id);
  const state = stateOf(second.tree ?? second);
  const moments = state.trees[0].moments;
  moments[0].keywords = ['무대', '여행', '노래:Super Shy', '멤버:카리나', '무대:인기가요 240524', '감정:설렘', '활동기:2024 여름'];
  const out = validateState(state).trees[0].moments[0].keywords;
  assert.deepEqual(out, ['무대', '여행', '노래:Super Shy', '멤버:카리나', '무대:인기가요 240524', '감정:설렘', '활동기:2024 여름'],
    '기존 낱말과 종류 표시 꼬리표가 함께 저장된다');
  // 도메인의 옛 규칙도 그대로다: 24자 넘는 키워드는 여전히 버려진다.
  moments[0].keywords = ['x'.repeat(25), '노래:Super Shy'];
  const strict = validateState(state).trees[0].moments[0].keywords;
  assert.deepEqual(strict, ['노래:Super Shy']);
});

// 실제 제목 형태 21개 — 공식 뮤직비디오·직캠·음악방송·시상식·쇼츠·연습·팬 찍은 영상이 섞여 있다.
const TITLES = [
  ['뉴진스 (NewJeans) ‘Super Shy’ Official MV', ['song:Super Shy']],
  ['TWICE "CHEER UP" M/V', ['song:CHEER UP']],
  ['STRAY KIDS "특(S-Class)" M/V', ['song:특(S-Class)']],
  ['(여자)아이들 \'퀸카 (Queencard)\' Official MV', ['song:퀸카 (Queencard)']],
  ['아이브 (IVE) \'아이엠 I AM\' Official MV', ['song:아이엠 I AM']],
  ['BTS (방탄소년단) \'Dynamite\' Official MV', ['song:Dynamite']],
  ['BLACKPINK - ‘Pink Venom’ M/V', ['song:Pink Venom']],
  ['르세라핌(LE SSERAFIM) \'UNFORGIVEN (feat. Nile Rodgers)\' Official MV', ['song:UNFORGIVEN (feat. Nile Rodgers)(너무 길다)'], '24자를 넘는 노래 제목은 너무 길다는 표시로 남긴다(조용히 버리지 않는다)'],
  ['[직캠] 뉴진스 혜인 \'Super Shy\' (NewJeans Hyein Fancam) @인기가요 23716', ['song:Super Shy', 'stage:인기가요']],
  ['에스파 카리나 직캠 \'Supernova\' (aespa Karina Fancam) @뮤직뱅크 240524', ['song:Supernova', 'stage:뮤직뱅크 240524']],
  ['[안방1열 직캠4K] 소녀시대 태연 \'우주별\' (TAEYEON Fancam) @뮤직뱅크 240517', ['song:우주별', 'stage:뮤직뱅크 240517']],
  ['세븐틴 - 손오공 @엠카운트다운 240502', ['song:손오공', 'stage:엠카운트다운 240502']],
  ['뉴진스 - ETA @SBS 인기가요 23716', ['song:ETA', 'stage:인기가요'], '인기가요 회차 번호(5자리)는 날짜로 읽지 않는다'],
  ['쇼! 음악중심 240525 아이브 - 해야(HEYA)', ['song:해야(HEYA)', 'stage:음악중심 240525']],
  ['KBS 가요대축제 231215 에스파 - Drama', ['song:Drama', 'stage:가요대축제 231215']],
  ['MBC 가요대제전 231231 뉴진스 - ETA', ['song:ETA', 'stage:가요대제전 231231']],
  ['2024 MAMA AWARDS 스트레이키즈 - 청(LALALALA)', ['song:청(LALALALA)', 'stage:MAMA']],
  ['M COUNTDOWN 240411 아이들 - 클락션', ['song:클락션', 'stage:엠카운트다운 240411'], '영문 별칭도 같은 무대 이름으로'],
  ['골든디스크 어워즈 240106 르세라핌 - Smart', ['song:Smart', 'stage:골든디스크 240106']],
  ['더쇼 240521 스테이씨 - RUN2U', ['song:RUN2U', 'stage:더쇼 240521']],
  ['마마무 - 데칼코마니 직캠 4K', ['song:데칼코마니'], '직캠 표시가 노래 값에 섞이지 않고, 마마무가 MAMA 시상식으로 오탐되지 않는다'],
  ['지민 \'Closer Than This\' #Shorts', ['song:Closer Than This']],
  ['쇼츠) 뉴진스 \'ETA\' #Shorts', ['song:ETA']],
  ['투바투 \'가면무도회\' Dance Practice', ['song:가면무도회']],
  ['뉴진스 \'How Sweet\' Performance Video', ['song:How Sweet']],
  ['잇지 \'마.피.아. In the morning\' 직캠 4K', ['song:마.피.아. In the morning']],
  ['콘서트 20241115 세븐틴 - 아낄없이', ['song:아낄없이', 'stage:콘서트 241115'], '8자리 날짜는 6자리로 통일한다'],
  ['세븐틴 호시 직캠 \'아낄없이\' 991299', ['song:아낄없이'], '달·날이 실제 범위가 아닌 6자리는 날짜로 읽지 않는다'],
];

test('제목 해석: 실제 제목 형태 27개에서 노래·무대를 제안한다(제안일 뿐, 저장은 없다)', () => {
  assert.ok(TITLES.length >= 20, '실제 형태 20개 이상');
  for (const [title, expected, why] of TITLES) {
    const got = brief(suggestTagsFromTitle(title));
    assert.deepEqual(got, expected, why ? `${title} — ${why}` : title);
  }
  // 제안은 저장하지 않는다 — 이 모듈에는 저장·보내기 코드가 없다(파일에 persist·fetch·apply가 없다).
  const src = readFileSync(new URL('../public/v41/tags.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /apply\(|persist|postMessage|fetch\(|localStorage|sessionStorage/, '제안 모듈은 저장을 부르지 않는다');
});

test('재사용 제안: 내가 쓴 꼬리표가 먼저고, 제목 규칙이 그 뒤를 잇는다', () => {
  // 멤버는 사전 없이는 가수 이름과 구별할 수 없어 이미 쓴 꼬리표에서만 찾는다.
  const fancam = '[직캠] 뉴진스 혜인 \'Super Shy\' (NewJeans Hyein Fancam) @인기가요 23716';
  const withMember = suggestTagsFromTitle(fancam, { knownTags: ['멤버:혜인', '감정:설렘'] });
  assert.deepEqual(brief(withMember), ['member:혜인', 'song:Super Shy', 'stage:인기가요'], '재사용이 먼저, 제목 규칙이 뒤');
  assert.equal(withMember.proposals[0].how, 'reuse');
  // 대소문자·띄어쓰기 차이를 맞춘다.
  const reuse = suggestTagsFromTitle('뉴진스 (NewJeans) ‘SUPER  SHY’ Official MV', { knownTags: ['노래:Super Shy'] });
  assert.deepEqual(brief(reuse), ['song:Super Shy'], '표기 차이(대소문자·공백)를 맞춰 재사용하고, 제목 규칙이 같은 값을 다시 제안하지 않는다');
  // 종류 없는 기존 꼬리표도 재사용한다(제목 규칙이 같은 값을 제안하면 재사용이 이긴다).
  const plain = suggestTagsFromTitle('소녀시대 태연 \'우주별\' @뮤직뱅크 240517', { knownTags: ['우주별'] });
  assert.deepEqual(brief(plain), ['plain:우주별', 'stage:뮤직뱅크 240517']);
  assert.equal(plain.proposals[0].how, 'reuse');
  // 제목에 없는 꼬리표는 제안하지 않는다.
  const none = suggestTagsFromTitle('뉴진스 \'ETA\' @인기가요', { knownTags: ['멤버:카리나', '노래:Drama'] });
  assert.ok(!brief(none).some((s) => s.includes('카리나') || s.includes('Drama')), '제목과 맞지 않는 꼬리표는 건너뛴다');
});

test('제목 해석의 한계(문서화한 대로) — 멤버 사전이 없으면 멤버를 추측하지 않는다', () => {
  // 그룹 직캠(멤버 이름이 없는 제목)에서 멤버 꼬리표를 잘못 만들지 않는다.
  const group = suggestTagsFromTitle('뉴진스 직캠 \'Super Shy\' (NewJeans Fancam) @인기가요 23716');
  assert.ok(!brief(group).some((s) => s.startsWith('member:')), '그룹 이름을 멤버로 제안하지 않는다');
  assert.deepEqual(brief(group), ['song:Super Shy', 'stage:인기가요']);
  // 활동기·감정은 제목만으로 정할 수 없다 — 제안하지 않는다(재사용 경로로만 들어온다).
  const noEra = suggestTagsFromTitle('뉴진스 \'Super Shy\' Official MV');
  assert.ok(!noEra.proposals.some((p) => p.kindId === 'era' || p.kindId === 'emotion'));
});


// ── #627 1단계 PR B: 꼬리표를 화면에 붙이기 — 화면 규칙의 한 벌(tag-model.mjs) 계약 ──
// 그리기(DOM)는 tag-line.mjs가 맡고, 저장은 셸 tag-save.mjs가 기존 경로(boardSync)로 keywords만 바꾼다.
// 여기서는 규칙만 본다: 제안 → 확정해야 저장, 해제, 직접 입력, tooLong 거절, 이름 바꾸기·합치기, 옛 keywords 보존.
import { cardTags, chipText, tagLineChips, toggledKeywords, inputTag, tagInventory, renamedMoments, mergedMoments, momentsWithKeywords, suggestForTree, momentsWithAddedTags } from '../public/v41/tag-model.mjs';

// 순수 함수는 순간 배열만 보지만, 서버 규칙 통과를 함께 확인하기 위해 진짜 트리를 만들어 쓴다.
const realTreeOf = (keywordsList = []) => {
  const tree = createTree(input('첫 목소리'));
  const second = addMoment(tree, input('둘째 마음'), tree.moments[0].id);
  const made = second.tree ?? second;
  made.moments.forEach((m, i) => { if (keywordsList[i]) m.keywords = keywordsList[i]; });
  return made;
};

test('카드 칩: 확정 꼬리표를 노래 → 멤버 → 무대 순서로 1~3개만 보인다', () => {
  const all = ['감정:설렘', '무대:인기가요 240524', '멤버:카리나', '노래:Supernova', '활동기:2024 여름', '여행'];
  const got = cardTags(all);
  assert.deepEqual(got.map((t) => t.value), ['Supernova', '카리나', '인기가요 240524'], '노래 → 멤버 → 무대가 먼저다');
  assert.equal(got.length, 3, '카드에는 3개까지만');
  assert.deepEqual(cardTags(all, 2).map((t) => t.value), ['Supernova', '카리나'], '자리가 좁으면 더 줄인다');
  // 종류 없는 옛 keywords도 확정된 꼬리표다(데이터를 잃지 않는다).
  assert.deepEqual(cardTags(['무대', '여행']).map((t) => t.value), ['무대', '여행']);
  assert.equal(cardTags([]).length, 0);
  // 칩 글자: 종류가 있으면 '노래 · 값', 없으면 '#값'.
  assert.equal(chipText(cardTags(['노래:Supernova'])[0]), '노래 · Supernova');
  assert.equal(chipText(cardTags(['여행'])[0]), '#여행');
});

test('꼬리표 줄: 흐린 칩은 제안, 진한 칩은 확정 — 눌러 확정하기 전에는 keywords가 바뀌지 않는다', () => {
  const line = tagLineChips({
    keywords: ['노래:Supernova'],
    title: '에스파 카리나 직캠 \'Supernova\' (aespa Karina Fancam) @뮤직뱅크 240524',
    knownTags: ['멤버:카리나', '감정:설렘']
  });
  assert.deepEqual(line.confirmed.map((c) => c.value), ['Supernova']);
  assert.ok(line.confirmed.every((c) => c.state === 'confirmed'));
  // 제안: 재사용(멤버)이 먼저고, 제목 규칙(노래·무대)이 뒤에 온다. 이미 확정한 값은 다시 제안하지 않는다.
  assert.deepEqual(line.proposals.map((p) => p.kindId), ['member', 'stage'], '노래:Supernova는 이미 확정이라 다시 제안하지 않는다');
  assert.ok(line.proposals.every((p) => p.state === 'proposal'));
  // 아무것도 확정하지 않은 상태에서는 keywords가 그대로다(제안은 저장하지 않는다).
  const before = ['노래:Supernova'];
  assert.deepEqual(toggledKeywords(before, '멤버:카리나'), ['노래:Supernova', '멤버:카리나'], '눌러야 확정된다');
  assert.deepEqual(before, ['노래:Supernova'], '원래 keywords는 누르기 전까지 그대로');
  // 꼬리표가 전혀 없는 순간: 제목 해석 제안만 흐린 칩으로 보인다.
  const empty = tagLineChips({ keywords: [], title: '뉴진스 \'How Sweet\' Performance Video', knownTags: [] });
  assert.equal(empty.confirmed.length, 0);
  assert.deepEqual(empty.proposals.map((p) => p.value), ['How Sweet']);
});

test('꼬리표 줄: 누르면 확정되고 다시 누르면 해제된다(서버 규칙으로 정리된 결과)', () => {
  let kws = ['노래:Supernova'];
  kws = toggledKeywords(kws, '멤버:카리나');
  assert.deepEqual(kws, ['노래:Supernova', '멤버:카리나'], '확정');
  kws = toggledKeywords(kws, '멤버:카리나');
  assert.deepEqual(kws, ['노래:Supernova'], '해제');
  // 표기 차이로 눌러도 같은 값으로 묶여 해제된다(중복이 만들어지지 않는다).
  kws = toggledKeywords(kws, '노래:supernova');
  assert.deepEqual(kws, [], '이미 확정한 값(표기 차이)을 누르면 해제다');
  // 20개를 넘게 누르면 서버 규칙과 같이 잘린다.
  let many = [];
  for (let i = 0; i < 25; i++) many = toggledKeywords(many, '감정:마음' + i);
  assert.equal(many.length, 20);
});

test('직접 입력: 종류를 고르고 값을 적어 붙인다 — 24자를 넘거나 비면 만들지 않는다', () => {
  assert.deepEqual(inputTag('song', 'Supernova'), { ok: true, raw: '노래:Supernova' });
  assert.deepEqual(inputTag('era', '2024 여름'), { ok: true, raw: '활동기:2024 여름' });
  // 종류 없이 붙이면 옛 keywords와 같은 모양으로 저장된다(뒤로 호환).
  assert.deepEqual(inputTag('', '여행'), { ok: true, raw: '여행' });
  // 24자를 넘으면 거절하고 이유를 돌려준다(조용히 잘라 내지 않는다).
  assert.deepEqual(inputTag('song', 'x'.repeat(22)), { ok: false, reason: 'long' });
  assert.deepEqual(inputTag('', 'x'.repeat(25)), { ok: false, reason: 'long' });
  assert.deepEqual(inputTag('song', '   '), { ok: false, reason: 'empty' });
  // 거절된 입력은 keywords를 바꾸지 않는다.
  const kws = ['노래:Supernova'];
  assert.deepEqual(toggledKeywords(kws, inputTag('song', 'x'.repeat(22)).raw ?? ''), kws);
});

test('tooLong 후보는 회색으로 알려 줄 뿐이고, 눌러도 저장되지 않는다', () => {
  const line = tagLineChips({
    keywords: [],
    title: '르세라핌(LE SSERAFIM) \'UNFORGIVEN (feat. Nile Rodgers)\' Official MV',
    knownTags: []
  });
  const long = line.proposals.find((p) => p.state === 'tooLong');
  assert.ok(long, '24자를 넘는 후보도 버리지 않고 표시한다');
  assert.equal(long.raw, '', '너무 긴 후보는 저장값이 없다(눌러도 붙지 않는다)');
  // raw가 빈 제안을 눌러도 keywords는 그대로다.
  assert.deepEqual(toggledKeywords([], long.raw || ''), []);
});

test('꼬리표 정리: 목록과 개수는 표기 차이를 하나로 묶어 센다', () => {
  const tree = realTreeOf([['노래:Super Shy', '무대'], ['노래:super shy', '노래:ETA'], []]);
  const groups = tagInventory(tree);
  const shy = groups.find((g) => g.value === 'Super Shy');
  assert.equal(shy.count, 2, '대소문자 차이는 같은 꼬리표다');
  assert.deepEqual(shy.momentIds, [tree.moments[0].id, tree.moments[1].id]);
  assert.ok(shy.raws.has('노래:Super Shy') && shy.raws.has('노래:super shy'), '묶음의 모든 표기를 함께 바꾸기 위해 모아 둔다');
  assert.equal(groups.find((g) => g.value === 'ETA').count, 1);
  assert.equal(groups.length, 3, '꼬리표 없는 순간은 목록에 없다');
});

test('이름 바꾸기: 모든 순간에 반영되고 서버 규칙을 통과한다 — 옛 keywords는 그대로 보존된다', () => {
  const tree = realTreeOf([['무대', '여행', '노래:Super Shy'], ['노래:super shy'], ['노래:ETA']]);
  const group = tagInventory(tree).find((g) => g.value === 'Super Shy');
  const result = renamedMoments(tree, group, 'Super Shy!');
  assert.equal(result.error, undefined);
  const [m1, m2, m3] = result.moments;
  assert.deepEqual(m1.keywords, ['무대', '여행', '노래:Super Shy!'], '바뀐 꼬리표만 바뀐다');
  assert.deepEqual(m2.keywords, ['노래:Super Shy!'], '묶음의 모든 표기가 함께 바뀐다');
  assert.equal(m3, tree.moments[2], '그 꼬리표가 없는 순간은 한 글자도 바뀌지 않는다');
  // 바뀐 결과는 서버 규칙을 그대로 통과한다(기존 저장 경로로 저장 가능).
  const state = validateState(stateOf({ ...tree, moments: result.moments }));
  assert.deepEqual(state.trees[0].moments[1].keywords, ['노래:Super Shy!']);
  assert.deepEqual(state.trees[0].moments[0].keywords, ['무대', '여행', '노래:Super Shy!'], '옛 keywords(종류 표시 없는 것)도 그대로 보존된다');
  // 24자를 넘거나 비었거나 같은 이름이면 바꾸지 않는다.
  assert.deepEqual(renamedMoments(tree, group, 'x'.repeat(25)), { error: 'long' });
  assert.deepEqual(renamedMoments(tree, group, '   '), { error: 'empty' });
  assert.deepEqual(renamedMoments(tree, group, 'Super shy'), { error: 'same' }, '표기 차이뿐인 이름은 같은 꼬리표다');
  // 종류 없는 옛 꼬리표는 종류 없이 바꾼다.
  const plain = tagInventory(tree).find((g) => g.value === '무대');
  const plainOut = renamedMoments(tree, plain, '무대 일기');
  assert.deepEqual(plainOut.moments[0].keywords, ['여행', '노래:Super Shy', '무대 일기'], '종류 없는 옛 꼬리표는 종류 없이 바꾼다(순서는 검사 규칙이 유지한다)');
});

test('합치기: 한 꼬리표를 다른 꼬리표로 바꿔 모든 순간에 반영한다', () => {
  const tree = realTreeOf([['노래:Super Shy', '무대'], ['노래:super shy', '노래:ETA']]);
  const groups = tagInventory(tree);
  const shy = groups.find((g) => g.value === 'Super Shy');
  const eta = groups.find((g) => g.value === 'ETA');
  const result = mergedMoments(tree, shy, eta);
  assert.deepEqual(result.moments[0].keywords, ['무대', '노래:ETA']);
  assert.deepEqual(result.moments[1].keywords, ['노래:ETA']);
  assert.deepEqual(validateState(stateOf({ ...tree, moments: result.moments })).trees[0].moments[1].keywords, ['노래:ETA']);
  assert.deepEqual(mergedMoments(tree, shy, shy), { error: 'same' }, '같은 꼬리표로는 합치지 않는다');
});

test('저장에 쓸 moments 계산: 지정한 순간의 keywords만 바뀌고 나머지는 그대로다', () => {
  const tree = realTreeOf([['무대'], ['여행']]);
  const out = momentsWithKeywords(tree, [{ momentId: tree.moments[0].id, keywords: ['무대', '노래:Supernova'] }]);
  assert.deepEqual(out[0].keywords, ['무대', '노래:Supernova']);
  assert.equal(out[1], tree.moments[1], '다른 순간은 같은 객체로 돌아온다(옛 keywords 보존)');
  // 지우는 것도 저장된다(빈 keywords는 서버 규칙에서 없는 칸이 된다).
  const cleared = momentsWithKeywords(tree, [{ momentId: tree.moments[1].id, keywords: [] }]);
  assert.deepEqual(cleared[1].keywords, []);
  const clean = validateState(stateOf({ ...tree, moments: cleared })).trees[0].moments[1];
  assert.deepEqual(clean.keywords ?? [], []);
});

test('제목에서 꼬리표 한 번에 제안받기: 꼬리표 없는 순간만, 제안일 뿐 — 확인한 것만 저장값이 된다', () => {
  const tree = realTreeOf();
  tree.moments[0].title = '에스파 카리나 직캠 \'Supernova\' (aespa Karina Fancam) @뮤직뱅크 240524';
  tree.moments[1].title = '뉴진스 \'How Sweet\' Performance Video';
  tree.moments[0].keywords = [];
  tree.moments[1].keywords = ['노래:Drama', '멤버:카리나'];
  const rows = suggestForTree(tree);
  assert.deepEqual(rows.map((r) => r.momentId), [tree.moments[0].id], '꼬리표 없는 순간만 제안받는다');
  assert.deepEqual(rows[0].proposals.map((p) => p.kindId), ['member', 'song', 'stage'], '재사용(멤버)이 먼저다');
  // 확인한 것만 저장값이 된다 — 고르지 않은 순간·제안은 한 글자도 바뀌지 않는다.
  const picks = [
    { momentId: tree.moments[0].id, raw: '노래:Supernova' },
    { momentId: tree.moments[0].id, raw: '무대:뮤직뱅크 240524' }
  ];
  const out = momentsWithAddedTags(tree, picks);
  assert.deepEqual(out[0].keywords, ['노래:Supernova', '무대:뮤직뱅크 240524']);
  assert.deepEqual(out[1], tree.moments[1], '고르지 않은 순간은 그대로');
  assert.deepEqual(validateState(stateOf({ ...tree, moments: out })).trees[0].moments[0].keywords, ['노래:Supernova', '무대:뮤직뱅크 240524']);
});
