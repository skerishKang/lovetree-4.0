// #627 1단계: 꼬리표(재료)의 한 벌 규칙 — 종류·저장 형식·검사·제목 해석·재사용 제안.
// 꼬리표는 순간의 keywords 칸에 담는다. 도메인(public/v41/domain.mjs)과 서버(src/domain.js)가 정한
// 규칙은 '문자열 1~24자, 제어문자 없음, 중복 없음, 최대 20개'다 — 이 모듈은 그 규칙 안에서 종류를
// 구분해 담는 형식을 정하고, 읽기·쓰기·검사를 한 곳에 모은다. 서버는 바꾸지 않는다.
//
// 저장 형식: '종류:값' — 종류 표시는 짧게(콜론 포함 3~4자)라 값이 20~21자 남는다.
//   예) '노래:Super Shy' · '멤버:카리나' · '활동기:2024 여름' · '무대:인기가요 240524' · '감정:설렘'
// 종류 표시가 없는 기존 keywords('무대', '여행' 같은 평범한 낱말)는 그대로 읽힌다(뒤로 호환) —
// 종류 없는 꼬리표로 취급하며 데이터를 잃지 않는다.
// 종류 목록은 이 파일 한 곳에서 정의한다. 가수(그룹·솔로 가수)·노래·멤버·활동기·무대(방송·공연)·감정이 목록이고,
// 강의·요리 같은 다른 대상으로 넓힐 때는 TAG_KINDS에 한 줄만 더한다.
// '가수:' 표시도 3자라 값이 21자 남는다(노래·멤버·감정과 같고, 활동기 4자만 20자).

// 도메인·서버의 keywords 규칙과 같은 수(한 벌) — 이 두 값을 바꾸면 안 된다.
export const TAG_MAX_LENGTH = 24;
export const TAG_MAX_COUNT = 20;

export const TAG_KINDS = [
  { id: 'artist', label: '가수', prefix: '가수:' },
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
  { label: '쇼챔피언', alias: ['쇼챔피언', '쇼챔', 'show champion'] },
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
const NOISE = /#shorts|쇼츠|\b4k\b|\b60fps\b|\b2160p\b|\b1080p\b|\b60p\b/gi;
const TAIL_MARKS = /\s*(M\/V|MV|Official (Music )?Video|Official MV|Performance Video|Dance Practice|Special Clip|Practice Video)\s*$/i;
// 직캠 표시는 노래 제목 뒤에 붙는 대상이 아니라 찍은 대상의 표시라 값에서 벗긴다.
const CAM_MARKS = /\s*(세로직캠|가로직캠|직캠|팬캠|fancam|fan cam)\s*$/gi;

// 따옴표 묶음(노래 제목이 가장 흔히 쓰는 모양) — 전부 찾는 판도 함께 쓴다.
const QUOTED = /['‘“"]([^'’“”"]{1,60})['’”"]/;
const QUOTED_ALL = /['‘“"]([^'’“”"]{1,60})['’”"]/g;

// 6자리(YYMMDD)·8자리(YYYYMMDD) 날짜 — 노래 덩어리에 섞인 날짜를 걸러 낼 때 쓴다(무대 꼬리표 값에는
// 날짜를 붙이지 않는다 — 2차 규칙: 무대는 방송 이름만 남긴다).
const DATE6 = /(?<!\d)(\d{6})(?!\d)/;
const DATE8 = /(?<!\d)(\d{8})(?!\d)/;

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

// ── 가수 후보(#627 2차) ─────────────────────────────────────────────────────────────
// 가수는 영문 표기로 통일한다(영문+한글이 같이 나오면 영문만 남기고 한글은 버린다 — 같은 그룹에
// 꼬리표 두 개가 생기지 않게). 두 모양만 본다: '영문(한글)' 괄호 꼬꼬와, 홀로 선 대문자 영문 이름.
// 멤버 이름·방송국·무대 이름까지 가수로 잘못 부르지 않게 걸러 낸다. 불확실하면 제안하지 않는다.

// 가수 후보에서 걸러 낸 낱말(대문자로 비교한다): 방송국·무대·잡동사니 표시.
const ARTIST_NOISE = new Set([
  'EP', 'MV', 'OFFICIAL', 'VIDEO', 'PERFORMANCE', 'DANCE', 'PRACTICE', 'SPECIAL', 'CLIP', 'STAGE',
  'SHORTS', 'AWARD', 'AWARDS', 'KBS', 'MBC', 'SBS', 'MNET', 'JTBC', 'THE', 'AND', 'OF',
  'COUNTDOWN', 'CHAMPION', 'BANK', 'CORE', 'FANCAM', 'CAM', 'VER', 'CHAN', 'M', 'V',
]);

// 낱말이 온전히 대문자 영문(가운데 숫자·& 허용)인지 — 적어도 글자 2개. 한 낱말짜리 대문자(M 같은)도
// 잡동사니 걸름에서 같이 본다.
const isCapsName = (w) => /^[A-Z][A-Z0-9&'’-]*$/.test(w) && (w.replace(/[^A-Z]/g, '').length >= 2);
const isCapsish = (w) => /^[A-Z]$/.test(w) || isCapsName(w);

// 글자로 시작해 가운데에 숫자가 박힌 영문 이름(Hearts2Hearts 같은 모양) — 짧은 표기(RUN2U)는 제외.
const isDigitName = (w) => w.length >= 6 && /^[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9]*$/.test(w) && w.replace(/[^A-Za-z]/g, '').length >= 4;

// 괄호 안팎이 영문·한글로 갈라진 꼬꼬에서 가수 이름을 찾는다. 영문이 괄호 밖이든 안이든 영문 쪽을 쓴다.
//   'RESCENE(리센느)' → RESCENE · '뉴진스 (NewJeans)' → NewJeans · '르세라핌(LE SSERAFIM)' → LE SSERAFIM
function artistFromParens(t) {
  const out = [];
  for (const m of t.matchAll(/\(([^()]*)\)/g)) {
    const inner = m[1].trim();
    if (!inner) continue;
    const before = (t.slice(0, m.index).match(/([A-Za-z][A-Za-z0-9&'’-]*)\s*$/) || [,''])[1].trim(); // 바로 앞의 한 단어만 — 'RESCENE ZENA (…)'에서 ZENA만 이 괄호의 짝이다
    const latinOf = (s) => (/^[A-Za-z][A-Za-z0-9 .&+'’-]*$/.test(s) ? s.trim() : '');
    let name = '';
    if (/[가-힣]/.test(inner) && before) name = latinOf(before); // '영문(한글)' — 영문은 괄호 밖
    else if (!/[가-힣]/.test(inner) && /(?:^|[^A-Za-z0-9])[가-힣]\s*$/.test(t.slice(0, m.index))) name = latinOf(inner); // '한글(영문)'
    if (!name || looksLikeCamCredit(name)) continue;
    out.push(name);
  }
  return out;
}

// 이름 후보에 직캠 크레딧·잡동사니가 섞였으면 가수 이름이 아니다.
function looksLikeCamCredit(name) {
  const words = name.split(/\s+/);
  if (words.length > 4) return true;
  return words.some((w) => ARTIST_NOISE.has(w.toUpperCase()) || /직캠|팬캠|fancam/i.test(w));
}

// 괄호를 덜어 낸 제목에서 홀로 선 가수 이름(모두 대문자, 또는 Hearts2Hearts 모양)을 찾는다.
// parens: 괄호 구간의 [시작, 끝] 목록 — 괄호 안의 낱말(직캠 크레딧 등)은 이름 후보에서 뺀다.
// 대문자 낱말이 연달아 오면(STRAY KIDS·RESCENE ZENA) 어디까지가 이름인지 사전 없이는 알 수 없어
// 제안하지 않는다. 다만 구간 바로 뒤에 한글 괄호 표기가 붙으면('RESCENE ZENA (리센느 제나)')
// 구간의 첫 낱말은 그룹 이름이다 — 첫 낱말만 제안한다.
function artistFromWords(t, parens = []) {
  const inParens = (tok) => parens.some(([a, b]) => tok.i >= a && tok.end <= b);
  const out = [];
  const tokens = [...t.matchAll(/[A-Za-z0-9&'’-]+/g)].map((m) => ({ w: m[0], i: m.index, end: m.index + m[0].length }));
  const gapIsSpace = (a, b) => /^\s*$/.test(t.slice(a.end, b.i));
  const capsish = (tok) => tok && isCapsish(tok.w.toUpperCase()) && !ARTIST_NOISE.has(tok.w.toUpperCase());
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (inParens(tok)) continue;
    const w = tok.w;
    const before = t.charAt(tok.i - 1);
    const after = t.charAt(tok.end);
    // '15-LOVE'처럼 붙임표·숫자에 붙어 있거나 한글에 붙어 있는 조각(MIX직캠의 MIX)은 이름이 아니다.
    if (before === '-' || /\d/.test(before) || /[가-힣]/.test(before)) continue;
    if (after === '-' || /\d/.test(after) || /[가-힣]/.test(after)) continue;
    const up = w.toUpperCase();
    if (ARTIST_NOISE.has(up)) continue;
    if (STAGE_ALIASES.has(up)) continue; // MAMA·MMA 같은 무대 이름은 가수가 아니다
    if (isDigitName(w)) { out.push(w); continue; } // Hearts2Hearts 모양은 홀로 이름이다
    if (!isCapsName(w)) continue;
    const prev = tokens[k - 1], next = tokens[k + 1];
    const runPrev = prev && !inParens(prev) && gapIsSpace(prev, tok) && capsish(prev);
    const runNext = next && !inParens(next) && gapIsSpace(tok, next) && capsish(next);
    if (runPrev || runNext) {
      if (runPrev) continue; // 구간의 첫 낱말만 검사한다
      let e = k;
      while (e + 1 < tokens.length && !inParens(tokens[e + 1]) && gapIsSpace(tokens[e], tokens[e + 1]) && capsish(tokens[e + 1])) e++;
      const paren = t.slice(tokens[e].end).match(/^\s*\(([^()]*)\)/);
      if (paren && /[가-힣]/.test(paren[1])) out.push(w);
      continue;
    }
    out.push(w);
  }
  return out;
}

// 무대 이름의 모든 별칭(대문자) — 가수 후보에서 무대 이름을 걸러 낼 때 쓴다.
const STAGE_ALIASES = new Set(STAGE_LABELS.flatMap((s) => s.alias.map((a) => tagKey(a).toUpperCase().replace(/[^A-Z0-9 ]/g, ''))));

// 제목에서 가수 후보를 모은다. 따옴표 묶음(노래 제목)과 붙임표 노래 덩어리는 먼저 덜어 낸다
// (괄호 안 노래 제목·노래 이름을 가수로 읽지 않게).
function findArtists(t) {
  let rest = t.replace(QUOTED_ALL, ' '); // 따옴표 안은 노래 제목이다
  const songChunk = findSong(t);
  if (songChunk && !QUOTED.test(t)) rest = rest.split(songChunk).join(' '); // 붙임표 덩어리가 노래였으면 그것도 뺀다
  const out = [];
  const seen = new Set();
  const add = (name) => { const k = tagKey(name); if (k && !seen.has(k)) { seen.add(k); out.push(name); } };
  for (const name of artistFromParens(rest)) add(name);
  const parens = [...rest.matchAll(/\([^()]*\)/g)].map((m) => [m.index, m.index + m[0].length]);
  for (const name of artistFromWords(rest, parens)) add(name);
  return out;
}

function findStage(t) {
  const hay = foldTitle(t);
  for (const stage of STAGE_LABELS) {
    for (const alias of stage.alias) {
      if (containsWord(hay, tagKey(alias))) return stage.label;
    }
  }
  return null;
}

function findSong(t) {
  // 1) 따옴표 묶음이 노래 제목이다(공식 뮤직비디오·직캠 모두 이 모양을 쓴다) — 따옴표는 믿는다.
  const q = t.match(QUOTED);
  if (q) return cleanText(q[1]).replace(NOISE, '').replace(CAM_MARKS, '').trim();
  // 2) '가수 - 노래 @무대' 모양(방송·공연 클립이 이 모양을 쓴다) — 붙임표 덩어리는 의심한다:
  //    직캠·화질·날짜·무대 이름·구분선이 섞인 덩어리는 노래라고 단정할 수 없어 제안하지 않는다.
  const dash = t.match(/-\s*([^@|#]+?)(?=\s*@|\s*$)/);
  if (dash) {
    const v = cleanText(dash[1]).replace(NOISE, '').replace(CAM_MARKS, '').replace(TAIL_MARKS, '').trim();
    if (!v) return null;
    if (/[|@]/.test(v)) return null;
    if (/직캠|팬캠|fancam/i.test(v)) return null;
    if (/#shorts|쇼츠|\b4k\b|\b60fps\b|\b2160p\b|\b1080p\b|\b60p\b/i.test(v)) return null;
    if (DATE6.test(v) || DATE8.test(v)) return null;
    if (findStage(v)) return null;
    return v;
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

  // 2) 제목 규칙: 가수 → 노래 → 무대(방송·시상식·공연 이름 — 날짜 숫자는 값에 섞지 않는다).
  for (const name of findArtists(t)) push('artist', name, 'title');
  const song = findSong(t);
  if (song) push('song', song, 'title');
  const stage = findStage(t);
  if (stage) push('stage', stage, 'title'); // 261111·240524 같은 날짜는 무대 꼬리표에 붙이지 않는다

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
