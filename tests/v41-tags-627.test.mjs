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
