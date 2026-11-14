// #627 1단계: 꼬리표(재료)의 한 벌 규칙 — 종류·저장 형식·검사·제목 해석·재사용 제안.
// 꼬리표는 순간의 keywords 칸에 담는다. 도메인(public/v41/domain.mjs)과 서버(src/domain.js)가 정한
// 규칙은 '문자열 1~24자, 제어문자 없음, 중복 없음, 최대 20개'다 — 이 모듈은 그 규칙 안에서 종류를
// 구분해 담는 형식을 정하고, 읽기·쓰기·검사를 한 곳에 모은다. 서버는 바꾸지 않는다.
//
// 저장 형식: '종류:값' — 종류 표시는 짧게(콜론 포함 3~4자)라 값이 20~21자 남는다.
//   예) '노래:Super Shy' · '멤버:카리나' · '활동기:2024 여름' · '무대:인기가요 240524' · '감정:설렘'
// 종류 표시가 없는 기존 keywords('무대', '여행' 같은 평범한 낱말)는 그대로 읽힌다(뒤로 호환) —
// 종류 없는 꼬리표로 취급하며 데이터를 잃지 않는다.
// 종류 목록은 이 파일 한 곳에서 정의한다. 노래·멤버·활동기·무대(방송·공연)·감정이 1차 목록이고,
// 강의·요리 같은 다른 대상으로 넓힐 때는 TAG_KINDS에 한 줄만 더한다.

// 도메인·서버의 keywords 규칙과 같은 수(한 벌) — 이 두 값을 바꾸면 안 된다.
export const TAG_MAX_LENGTH = 24;
export const TAG_MAX_COUNT = 20;

export const TAG_KINDS = [
  { id: 'song', label: '노래', prefix: '노래:' },
  { id: 'member', label: '멤버', prefix: '멤버:' },
  { id: 'era', label: '활동기', prefix: '활동기:' },
  { id: 'stage', label: '무대', prefix: '무대:' },
  { id: 'emotion', label: '감정', prefix: '감정:' },
];

const kindById = new Map(TAG_KINDS.map((k) => [k.id, k]));
const kindByPrefix = new Map(TAG_KINDS.map((k) => [k.prefix, k]));
const kindPrefixes = TAG_KINDS.map((k) => k.prefix).sort((a, b) => b.length - a.length);

// 제어문자·양끝 공백을 벗긴 낱말(후보를 만들 때 쓴다 — 저장 검사는 normalizeTags가 서버 규칙 그대로 거른다).
const cleanText = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

// 종류가 정해진 꼬리표를 만든다. 24자를 넘거나 값이 비면 만들지 않는다(null) — 조용히 잘라 내지 않는다.
export function makeTag(kindId, value) {
  const kind = kindById.get(kindId);
  if (!kind) return null;
  const v = cleanText(value);
  if (!v) return null;
  const raw = kind.prefix + v;
  return raw.length <= TAG_MAX_LENGTH ? raw : null;
}

// 저장된 문자열을 읽는다. 종류 표시로 시작하면 그 종류의 꼬리표, 아니면 종류 없는(기존) 꼬리표다.
export function parseTag(raw) {
  const s = cleanText(raw);
  if (!s) return null;
  const prefix = kindPrefixes.find((p) => s.startsWith(p) && s.length > p.length);
  if (prefix) {
    const kind = kindByPrefix.get(prefix);
    return { kindId: kind.id, label: kind.label, value: s.slice(prefix.length), raw: s };
  }
  return { kindId: null, label: null, value: s, raw: s };
}

// 꼬리표 목록을 서버 규칙에 맞게 정리한다. 잃어버린 것은 이유와 함께 돌려준다(조용히 지나가지 않게).
export function normalizeTags(list) {
  const tags = [];
  const dropped = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const drop = (value, reason) => dropped.push({ value: String(value), reason });
    if (typeof item !== 'string') { drop(item, 'type'); continue; }
    if (/[\u0000-\u001f\u007f]/.test(item)) { drop(item, 'control'); continue; } // 서버가 거르는 제어문자
    const s = item.trim().replace(/\s+/g, ' ');
    if (!s) { drop(item, 'empty'); continue; }
    if (s.length > TAG_MAX_LENGTH) { drop(s, 'length'); continue; }
    const key = s.normalize('NFKC').toLowerCase();
    if (seen.has(key)) { drop(s, 'duplicate'); continue; }
    seen.add(key);
    tags.push(s);
  }
  if (tags.length > TAG_MAX_COUNT) {
    for (const v of tags.splice(TAG_MAX_COUNT)) dropped.push({ value: v, reason: 'count' });
  }
  return { tags, dropped };
}

// 꼬리표 목록에서 한 종류의 값만 뽑아 쓸 때(그래프 묶음 등 다음 단계용).
export function tagValues(tags, kindId) {
  return (Array.isArray(tags) ? tags : []).map(parseTag).filter((t) => t && t.kindId === kindId).map((t) => t.value);
}

// 표기 차이를 묶어 보는 열쇠(NFKC + 소문자 + 공백 한 칸 + 따옴표·마침표 제거) — 재사용 제안·중복 판정에 쓴다.
export function tagKey(text) {
  return cleanText(text).normalize('NFKC').toLowerCase().replace(/['’"“”.]/g, '').replace(/\s+/g, ' ').trim();
}

// ── 제목 해석(제안일 뿐이다 — 이 모듈은 저장하지 않는다) ──────────────────────────────

// 무대(방송·시상식·공연) 이름의 한 벌 목록. 별칭을 함께 적고, 꼬리표 값은 label로 통일한다.
const STAGE_LABELS = [
  { label: '인기가요', alias: ['인기가요'] },
  { label: '뮤직뱅크', alias: ['뮤직뱅크', 'music bank'] },
  { label: '음악중심', alias: ['음악중심', 'music core'] },
  { label: '엠카운트다운', alias: ['엠카운트다운', 'm countdown', 'mcountdown'] },
  { label: '쇼챔피언', alias: ['쇼챔피언', 'show champion'] },
  { label: '더쇼', alias: ['더쇼', 'the show'] },
  { label: '팩트스타', alias: ['팩트스타', 'fact in star'] },
  { label: '가요대축제', alias: ['가요대축제'] },
  { label: '가요대제전', alias: ['가요대제전'] },
  { label: '가요대전', alias: ['가요대전'] },
  { label: 'MAMA', alias: ['mama awards', 'mama'] },
  { label: '멜론뮤직어워드', alias: ['멜론뮤직어워드', 'melon music awards', 'mma'] },
  { label: '골든디스크', alias: ['골든디스크', 'golden disc'] },
  { label: '서울가요대상', alias: ['서울가요대상'] },
  { label: '더팩트뮤직어워즈', alias: ['더팩트뮤직어워즈', 'the fact music awards'] },
  { label: '콘서트', alias: ['콘서트', 'concert'] },
  { label: '팬미팅', alias: ['팬미팅', 'fan meeting', 'fanmeeting'] },
  { label: '투어', alias: ['월드투어', 'world tour'] },
];

// 제목에서 흔히 잡동사니로 섞이는 표시 — 꼬리표 값에서 벗긴다.
const NOISE = /#shorts|쇼츠|\b4k\b|\b60fps\b|\b2160p\b|\b1080p\b/gi;
const TAIL_MARKS = /\s*(M\/V|MV|Official (Music )?Video|Official MV|Performance Video|Dance Practice|Special Clip|Practice Video)\s*$/i;
// 직캠 표시는 노래 제목 뒤에 붙는 대상이 아니라 찍은 대상의 표시라 값에서 벗긴다.
const CAM_MARKS = /\s*(세로직캠|가로직캠|직캠|팬캠|fancam|fan cam)\s*$/gi;

// 따옴표 묶음(노래 제목이 가장 흔히 쓰는 모양).
const QUOTED = /['‘“"]([^'’“”"]{1,60})['’”"]/;

// 6자리(YYMMDD)·8자리(YYYYMMDD) 날짜 — 달·날이 실제 범위일 때만 무대 날짜로 본다.
const DATE6 = /(?<!\d)(\d{6})(?!\d)/;
const DATE8 = /(?<!\d)(\d{8})(?!\d)/;

const validYMD = (s) => { // s는 MMDD(앞의 연도 두 자리는 이미 뗐다)
  const mm = Number(s.slice(0, 2)), dd = Number(s.slice(2, 4));
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
};

// 단어 경계가 있는 부분 일치 — 'MAMA'가 'MAMAMOO' 안에서 잘못 걸리지 않게 한다.
const containsWord = (hay, needle) => {
  if (!needle) return false;
  let at = hay.indexOf(needle);
  while (at !== -1) {
    const after = hay.charAt(at + needle.length);
    if (!after || !/[a-z0-9가-힣]/.test(after)) return true;
    at = hay.indexOf(needle, at + 1);
  }
  return false;
};

const foldTitle = (t) => ' ' + tagKey(t) + ' ';

function findStage(t) {
  const hay = foldTitle(t);
  for (const stage of STAGE_LABELS) {
    for (const alias of stage.alias) {
      if (containsWord(hay, tagKey(alias))) return stage.label;
    }
  }
  return null;
}

function findDate(t) {
  const m8 = t.match(DATE8);
  if (m8 && /^(19|20)/.test(m8[1]) && validYMD(m8[1].slice(4))) return m8[1].slice(2); // YYYYMMDD → YYMMDD
  const m6 = t.match(DATE6);
  if (m6 && validYMD(m6[1].slice(2))) return m6[1]; // YYMMDD의 뒤 네 자리가 MMDD
  return null;
}

function findSong(t) {
  // 1) 따옴표 묶음이 노래 제목이다(공식 뮤직비디오·직캠 모두 이 모양을 쓴다).
  const q = t.match(QUOTED);
  if (q) return cleanText(q[1]).replace(NOISE, '').replace(CAM_MARKS, '').trim();
  // 2) '가수 - 노래 @무대' 모양(방송·공연 클립이 이 모양을 쓴다).
  const dash = t.match(/-\s*([^@|#]+?)(?=\s*@|\s*$)/);
  if (dash) {
    const v = cleanText(dash[1]).replace(NOISE, '').replace(CAM_MARKS, '').replace(TAIL_MARKS, '').trim();
    if (v) return v;
  }
  return null;
}

// 제목에서 꼬리표 후보를 제안한다. 결과는 '제안'일 뿐 — 사용자가 확인하기 전에는 저장하지 않는다.
// options.knownTags: 사용자가 이미 쓴 꼬리표(순서대로 앞에 제안한다 — 재사용이 제목 규칙보다 앞선다).
// 멤버는 사전 없이는 가수 이름과 구별할 수 없어서(그룹 직캠을 멤버로 잘못 달 위험) 이미 쓴 꼬리표에서만 찾는다.
export function suggestTagsFromTitle(title, options = {}) {
  const known = Array.isArray(options.knownTags) ? options.knownTags : [];
  const t = String(title ?? '');
  const proposals = [];
  const push = (kindId, value, how) => {
    const raw = kindId ? makeTag(kindId, value) : (() => { const s = cleanText(value); return s && s.length <= TAG_MAX_LENGTH ? s : null; })();
    if (!raw) { proposals.push({ kindId, label: kindId ? kindById.get(kindId).label : null, value: cleanText(value), how, tooLong: true }); return; }
    proposals.push({ kindId, label: kindId ? kindById.get(kindId).label : null, value: parseTag(raw).value, raw, how });
  };

  // 1) 내가 쓴 꼬리표 가운데 제목에 맞는 것부터(표기 차이·대소문자 정도는 tagKey로 맞춘다).
  const hay = foldTitle(t);
  for (const k of known) {
    const p = parseTag(k);
    if (!p) continue;
    const needle = tagKey(p.value);
    if (needle.length >= 2 && hay.includes(needle)) push(p.kindId, p.value, 'reuse');
  }

  // 2) 제목 규칙: 노래 → 무대(방송·시상식·공연 이름 + 날짜).
  const song = findSong(t);
  if (song) push('song', song, 'title');
  const stage = findStage(t);
  const date = findDate(t);
  if (stage && date) push('stage', `${stage} ${date}`, 'title');
  else if (stage) push('stage', stage, 'title');
  else if (date) push('stage', date, 'title');

  // 같은 값(표기 차이 포함)은 하나만 — 앞에 온 것(재사용)이 이긴다. 종류 없는 꼬리표로 이미 제안한 값은
  // 제목 규칙이 종류를 붙여 다시 제안하지 않는다(같은 값을 두 번 권하지 않는다).
  const plainKeys = new Set(proposals.filter((p) => !p.kindId).map((p) => tagKey(p.value)));
  const seen = new Set();
  const out = [];
  for (const p of proposals) {
    const vk = tagKey(p.value);
    const key = (p.kindId || 'plain') + '|' + vk;
    if (seen.has(key)) continue;
    if (p.kindId && plainKeys.has(vk)) continue;
    seen.add(key);
    out.push(p);
  }
  return { proposals: out };
}
