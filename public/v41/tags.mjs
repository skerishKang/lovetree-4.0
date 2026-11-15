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
  'CHOREOGRAPHY', 'CHOREO', // 무용·연습 영상 채널 이름 — 가수가 아니다(AI 고객 회차 지적)
]);

// 낱말이 온전히 대문자 영문(가운데 숫자·& 허용)인지 — 적어도 글자 2개. 한 낱말짜리 대문자(M 같은)도
// 잡동사니 걸름에서 같이 본다.
const isCapsName = (w) => /^[A-Z][A-Z0-9&'’-]*$/.test(w) && (w.replace(/[^A-Z]/g, '').length >= 2);
const isCapsish = (w) => /^[A-Z]$/.test(w) || isCapsName(w);

// 글자로 시작해 가운데에 숫자가 박힌 영문 이름(Hearts2Hearts 같은 모양) — 짧은 표기(RUN2U)는 제외.
const isDigitName = (w) => w.length >= 6 && /^[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9]*$/.test(w) && w.replace(/[^A-Za-z]/g, '').length >= 4;

// 위치 at 바로 앞(공백만 사이에 둔) 대문자 영문 낱말 이음을 거꾸로 모은다 — 꼬꼬 짝('RESCENE ZENA (리센느 제나)')
// 과 따옴표 노래 제목 앞 모양('STRAY KIDS "특"')을 볼 때 쓴다. 괄호 안 낱말·잡동사니·무대 이름은 이음에서 뺀다.
function capsRunBefore(t, at) {
  const ranges = [...t.matchAll(/\([^()]*\)/g)].map((m) => [m.index, m.index + m[0].length]);
  const inParens = (i) => ranges.some(([a, b]) => i >= a && i < b);
  const tokens = [...t.matchAll(/[A-Za-z0-9&'’-]+/g)];
  const capsish = (tk) => isCapsish(tk[0].toUpperCase()) && !ARTIST_NOISE.has(tk[0].toUpperCase()) && !stageOfToken(tk[0]);
  let e = -1;
  for (let k = tokens.length - 1; k >= 0; k--) {
    if (tokens[k].index < at && /^\s*$/.test(t.slice(tokens[k].index + tokens[k][0].length, at))) { e = k; break; }
  }
  if (e < 0 || inParens(tokens[e].index) || !capsish(tokens[e])) return [];
  let s = e;
  while (s - 1 >= 0 && !inParens(tokens[s - 1].index) && /^\s*$/.test(t.slice(tokens[s - 1].index + tokens[s - 1][0].length, tokens[s].index)) && capsish(tokens[s - 1])) s--;
  return tokens.slice(s, e + 1).map((tk) => tk[0]);
}

// 괄호 안팎이 영문·한글로 갈라진 꼬꼬에서 가수 이름을 찾는다. 영문이 괄호 밖이든 안이든 영문 쪽을 쓴다.
//   'RESCENE(리센느)' → RESCENE · '뉴진스 (NewJeans)' → NewJeans · '르세라핌(LE SSERAFIM)' → LE SSERAFIM
// 한글 괄호 앞에 대문자 이음이 붙으면 낱말 수가 꼬꼬 안 한글 낱말 수와 같을 때만(두 낱말까지) 첫 낱말을
// 가수로 고른다('RESCENE ZENA (리센느 제나)' → RESCENE — ZENA는 membersFromParens가 멤버로 찾는다).
// 수가 다르면 어디까지가 그룹 이름인지 알 수 없어 제안하지 않는다(틀린 제안보다 안 하는 게 낫다).
function artistFromParens(t) {
  const out = [];
  for (const m of t.matchAll(/\(([^()]*)\)/g)) {
    const inner = m[1].trim();
    if (!inner) continue;
    const latinOf = (s) => (/^[A-Za-z][A-Za-z0-9 .&+'’-]*$/.test(s) ? s.trim() : '');
    let name = '';
    if (/[가-힣]/.test(inner)) { // '영문(한글)' — 영문은 괄호 밖, 낱말 수가 맞는 꼬꼬 짝만
      const koWords = inner.match(/[가-힣]+/g) || [];
      const run = capsRunBefore(t, m.index);
      if (run.length >= 1 && run.length === koWords.length && run.length <= 2) name = run[0];
    } else if (!/[가-힣]/.test(inner) && /(?:^|[^A-Za-z0-9])[가-힣]\s*$/.test(t.slice(0, m.index))) {
      // '한글(영문)'. 다만 괄호 바로 앞 한국어가 직캠 표시로 끝나면('라이즈 직캠 (RIIZE Choreography)')
      // 괄호는 찍은 곳(채널) 크레딧이다 — 가수로 읽지 않는다(틀린 제안보다 안 하는 게 낫다).
      const lastKo = (t.slice(0, m.index).match(/[가-힣]+/g) || []).slice(-1)[0] ?? '';
      if (!/(?:직캠|팬캠)$/.test(lastKo)) name = latinOf(inner);
    }
    if (!name || looksLikeCamCredit(name) || stageOfToken(name) || hasYearSuffix(name)) continue;
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
// 제안하지 않는다. 다만 두 낱말 이음 바로 뒤에 한글 괄호 표기가 붙으면('RESCENE ZENA (리센느 제나)')
// 첫 낱말은 그룹 이름이다 — 첫 낱말만 가수로 제안한다(멤버는 membersFromParens가 꼬꼬 짝의 낱말 수가
// 맞을 때 찾는다). 세 낱말 이상 이음(STRAY KIDS FELIX 같은 모양)은 그대로 제안하지 않는다.
function artistFromWords(t, parens = []) {
  const inParens = (tok) => parens.some(([a, b]) => tok.i >= a && tok.end <= b);
  const out = [];
  const tokens = [...t.matchAll(/[A-Za-z0-9&'’-]+/g)].map((m) => ({ w: m[0], i: m.index, end: m.index + m[0].length }));
  const gapIsSpace = (a, b) => /^\s*$/.test(t.slice(a.end, b.i));
  const capsish = (tok) => tok && isCapsish(tok.w.toUpperCase()) && !ARTIST_NOISE.has(tok.w.toUpperCase()) && !stageOfToken(tok.w);
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
    if (stageOfToken(w)) continue; // MAMA·MMA·MMA2026 같은 무대 이름(연도 붙은 꼴 포함)은 가수가 아니다
    if (hasYearSuffix(w)) continue; // MAMA2025처럼 영문+4자리 연도 꼴은 가수 이름이 아니다
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
      // 두 낱말 이음 + 바로 뒤 한글 괄호에서만 첫 낱말을 그룹(가수)으로 제안한다.
      if (e - k + 1 === 2 && paren && /[가-힣]/.test(paren[1])) out.push(w);
      continue;
    }
    // 한 낱말 뒤에 '그룹 멤버' 한글 괄호('ZENA (리센느 제나)')가 붙으면 멤버 모양이다 — 가수로 제안하지 않는다.
    const nextParen = t.slice(tok.end).match(/^\s*\(([^()]*)\)/);
    if (nextParen && (nextParen[1].match(/[가-힣]+/g) || []).length >= 2) continue;
    out.push(w);
  }
  return out;
}

// 꼬꼬 짝(한글 괄호 ↔ 바로 앞 대문자 이음)에서 멤버를 찾는다(#627 2단계 — 그래프 보기에서 가수와 멤버는
// 다른 큰 점이다). 'RESCENE ZENA (리센느 제나)': 바로 앞 대문자 낱말 2와 괄호 안 한글 낱말 2가 같으면
// 낱말끼리 짝이고 첫 낱말은 그룹(가수), 다음 낱말은 개인(멤버)다. 한 낱말 뒤에 '그룹 멤버' 한글 괄호가
// 붙으면('ZENA (리센느 제나)') 그 낱말은 멤버다. 수가 다르면('RESCENE ZENA (리센느)') 그룹 이름이 한
// 낱말일 수도 두 낱말일 수도 있어 멤버를 추측하지 않는다(틀린 제안보다 안 하는 게 낫다).
function membersFromParens(t) {
  const out = [];
  for (const m of t.matchAll(/\(([^()]*)\)/g)) {
    const inner = m[1].trim();
    if (!/[가-힣]/.test(inner)) continue;
    const koWords = inner.match(/[가-힣]+/g) || [];
    if (koWords.length < 2) continue;
    const run = capsRunBefore(t, m.index);
    if (run.length === 2 && koWords.length === 2) out.push(run[1]);
    else if (run.length === 1) out.push(run[0]);
  }
  return out;
}

// 직캠·원픽캠·fancam 문맥의 '가수 멤버' 두 낱말 — 가수가 이미 확실할 때(재사용·꼬꼬 짝으로 가수로 골라졌을
// 때)만 그다음 대문자 낱말을 멤버로 제안한다. 세 낱말 이상이면(STRAY KIDS FELIX 같은 모양) 어디까지가
// 그룹 이름인지 알 수 없어 제안하지 않는다.
function membersFromCamRun(rest, parens, artistKeys) {
  if (!/직캠|원픽캠|팬캠|fancam|fan\s*cam/i.test(rest)) return [];
  const inParens = (tok) => parens.some(([a, b]) => tok.i >= a && tok.end <= b);
  const out = [];
  const tokens = [...rest.matchAll(/[A-Za-z0-9&'’-]+/g)].map((m) => ({ w: m[0], i: m.index, end: m.index + m[0].length }));
  const gapIsSpace = (a, b) => /^\s*$/.test(rest.slice(a.end, b.i));
  const capsish = (tok) => tok && isCapsish(tok.w.toUpperCase()) && !ARTIST_NOISE.has(tok.w.toUpperCase()) && !stageOfToken(tok.w);
  for (let k = 1; k < tokens.length; k++) {
    const prev = tokens[k - 1], tok = tokens[k];
    if (inParens(prev) || inParens(tok)) continue;
    if (!gapIsSpace(prev, tok)) continue;
    if (!capsish(prev) || !capsish(tok)) continue;
    const next = tokens[k + 1];
    if (next && !inParens(next) && gapIsSpace(tok, next) && capsish(next)) continue; // 세 낱말 이음 — 불확실
    const before = tokens[k - 2];
    if (before && !inParens(before) && gapIsSpace(before, prev) && capsish(before)) continue; // 이음의 중간 — 불확실
    if (artistKeys.has(tagKey(prev.w)) && !artistKeys.has(tagKey(tok.w))) out.push(tok.w);
  }
  return out;
}

// 여러 단어 대문자 그룹명(STRAY KIDS)은 바로 뒤에 따옴표 노래 제목이 붙는 모양일 때만 가수로 제안한다
// — 이음 전체가 그룹 이름 하나다. 다른 모양은 지금처럼 제안하지 않는다(끝을 사전 없이는 알 수 없다).
function artistFromQuotedRun(t) {
  const out = [];
  const ranges = [...t.matchAll(/\([^()]*\)/g)].map((m) => [m.index, m.index + m[0].length]);
  const inParens = (i) => ranges.some(([a, b]) => i >= a && i < b);
  const tokens = [...t.matchAll(/[A-Za-z0-9&'’-]+/g)];
  const capsish = (tk) => isCapsish(tk[0].toUpperCase()) && !ARTIST_NOISE.has(tk[0].toUpperCase()) && !stageOfToken(tk[0]);
  for (const q of t.matchAll(QUOTED_ALL)) {
    let e = -1;
    for (let k = tokens.length - 1; k >= 0; k--) {
      if (tokens[k].index < q.index && /^\s*$/.test(t.slice(tokens[k].index + tokens[k][0].length, q.index))) { e = k; break; }
    }
    if (e < 0 || inParens(tokens[e].index) || !capsish(tokens[e])) continue;
    let s = e;
    while (s - 1 >= 0 && !inParens(tokens[s - 1].index) && /^\s*$/.test(t.slice(tokens[s - 1].index + tokens[s - 1][0].length, tokens[s].index)) && capsish(tokens[s - 1])) s--;
    if (e - s + 1 < 2) continue; // 한 낱말은 기존 홀로 이름 경로가 맡는다
    out.push(tokens.slice(s, e + 1).map((tk) => tk[0]).join(' '));
  }
  return out;
}

// 무대 이름의 모든 별칭(대문자) — 가수 후보에서 무대 이름을 걸러 낼 때 쓴다.
const STAGE_ALIAS_LABEL = new Map(STAGE_LABELS.flatMap((s) => s.alias.map((a) => [tagKey(a).toUpperCase().replace(/[^A-Z0-9 ]/g, ''), s.label])));
const STAGE_ALIASES = new Set(STAGE_ALIAS_LABEL.keys());

// 영문+숫자 4자리 연도 꼴(MMA2026·MAMA2025) — 가수 이름이 아니라 시상식·방송 이름에 연도가 붙은 모양이다.
// 해시태그로 흔히 붙는다('#아일릿 #ILLIT #MMA2026 퍼포먼스' — 2026-11-16 하은 1회차 제보).
const YEAR_SUFFIX_NAME = /^[A-Z][A-Z0-9&'. ]*?(?:19|20)\d{2}$/;
const hasYearSuffix = (word) => YEAR_SUFFIX_NAME.test(String(word ?? '').toUpperCase().trim());

// 낱말이 무대 이름인가 — 연도가 붙은 꼴(MMA2026)이면 그 무대 이름(label)을 돌려준다. 아니면 null.
const stageOfToken = (word) => {
  const up = String(word ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  if (!up) return null;
  if (STAGE_ALIAS_LABEL.has(up)) return STAGE_ALIAS_LABEL.get(up);
  const base = up.replace(/(?:19|20)\d{2}$/, '').trim();
  if (base !== up && STAGE_ALIAS_LABEL.has(base)) return STAGE_ALIAS_LABEL.get(base);
  return null;
};

// 따옴표 묶음(노래 제목)과 붙임표 노래 덩어리를 덜어 낸 제목 — 이름 후보를 볼 때 쓴다
// (괄호 안 노래 제목·노래 이름을 가수·멤버로 읽지 않게).
function titleRest(t) {
  let rest = t.replace(QUOTED_ALL, ' '); // 따옴표 안은 노래 제목이다
  const songChunk = findSong(t);
  if (songChunk && !QUOTED.test(t)) rest = rest.split(songChunk).join(' '); // 붙임표 덩어리가 노래였으면 그것도 뺀다
  return rest;
}

// 제목에서 가수 후보를 모은다.
function findArtists(t) {
  const rest = titleRest(t);
  const out = [];
  const seen = new Set();
  const add = (name) => { const k = tagKey(name); if (k && !seen.has(k)) { seen.add(k); out.push(name); } };
  for (const name of artistFromParens(rest)) add(name);
  const parens = [...rest.matchAll(/\([^()]*\)/g)].map((m) => [m.index, m.index + m[0].length]);
  for (const name of artistFromWords(rest, parens)) add(name);
  for (const name of artistFromQuotedRun(t)) add(name); // 'STRAY KIDS "특"' 모양 — 원본 제목에서 본다
  return out;
}

// 제목에서 멤버 후보를 모은다. 확실한 모양(꼬꼬 짝의 낱말 짝, 직캠 문맥에서 가수가 확실한 두 낱말 이음)만
// 제안하고 나머지는 제안하지 않는다 — 그룹 이름이 두 낱말일 수도 있어(STRAY KIDS) 사전 없이는 구별할 수 없다.
function findMembers(t, artistKeys) {
  const out = [];
  const seen = new Set();
  const add = (name) => { const k = tagKey(name); if (k && !seen.has(k)) { seen.add(k); out.push(name); } };
  for (const name of membersFromParens(t)) add(name);
  const rest = titleRest(t);
  const parens = [...rest.matchAll(/\([^()]*\)/g)].map((m) => [m.index, m.index + m[0].length]);
  for (const name of membersFromCamRun(rest, parens, artistKeys)) add(name);
  return out;
}

function findStage(t) {
  const hay = foldTitle(t);
  // 'MMA2026'·'MAMA2025'처럼 방송·시상식 이름 뒤에 연도가 붙은 꼴도 같은 무대로 읽는다(해시태그에서 흔하다).
  const containsStage = (needle) => {
    if (containsWord(hay, needle)) return true;
    const base = needle.replace(/[^a-z0-9 \u3131-\uD7A3]/g, ' ').trim().split(' ').join('\\s+');
    if (!base) return false;
    return new RegExp('(?<![a-z0-9\u3131-\uD7A3])' + base + '(?:19|20)[0-9]{2}(?![0-9])').test(hay);
  };
  for (const stage of STAGE_LABELS) {
    for (const alias of stage.alias) {
      if (containsStage(tagKey(alias))) return stage.label;
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
// 멤버는 확실한 모양(꼬꼬 짝의 낱말 짝·직캠 문맥에서 가수가 확실한 두 낱말 이음·이미 쓴 꼬리표)에서만
// 찾는다 — 그룹 이름이 두 낱말일 수도 있어(STRAY KIDS) 불확실한 모양은 제안하지 않는다.
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

  // 2) 제목 규칙: 가수 → 멤버(확실한 모양만) → 노래 → 무대(방송·시상식·공연 이름 — 날짜 숫자는 값에 섞지 않는다).
  const artists = findArtists(t);
  // 멤버 제안의 '가수 확신' 재료 — 제목 규칙이 고른 가수에 재사용으로 정해진 가수를 더한다.
  const artistKeys = new Set([
    ...artists.map((name) => tagKey(name)),
    ...proposals.filter((p) => p.how === 'reuse' && p.kindId === 'artist').map((p) => tagKey(p.value)),
  ]);
  for (const name of artists) push('artist', name, 'title');
  for (const name of findMembers(t, artistKeys)) push('member', name, 'title');
  const song = findSong(t);
  if (song) push('song', song, 'title');
  const stage = findStage(t);
  if (stage) push('stage', stage, 'title'); // 261111·240524 같은 날짜는 무대 꼬리표에 붙이지 않는다

  // 같은 값(표기 차이 포함)은 하나만 — 앞에 온 것(재사용)이 이긴다. 사용자가 이미 쓴 값(종류까지)과 같은
  // 값을 제목 규칙이 다시 제안하지 않는다: '멤버:ZENA'를 쓴 적 있으면 제목이 그 값을 가수로 권하지 않는다.
  const reuseKeys = new Set(proposals.filter((p) => p.how === 'reuse').map((p) => tagKey(p.value)));
  const seen = new Set();
  const out = [];
  for (const p of proposals) {
    const vk = tagKey(p.value);
    const key = (p.kindId || 'plain') + '|' + vk;
    if (seen.has(key)) continue;
    if (p.how === 'title' && reuseKeys.has(vk)) continue;
    seen.add(key);
    out.push(p);
  }
  return { proposals: out };
}

// ── 여러 순간 한꺼번에 제안(#627 후속 — 그래프·정리 화면용 재료. 저장은 하지 않는다) ──────────────
// 각 순간 제목에 suggestTagsFromTitle 규칙을 그대로 쓴다. 재사용 재료는 트리 안에서 이미 쓰인 꼬리표
// 전부(처음 본 순서) — 제목 규칙만으로 못 찾는 값(짧은 노래 제목 같은)도 제목과 맞으면 권한다.
// 이미 이 순간이 가진 값은 다시 권하지 않고, 종류가 정해진 꼬리표가 없는 종류만 권한다 — 이미 확정된
// 종류를 다른 값으로 다시 권하면 고민만 늘어난다('AI는 제안만' — 결과는 제안이고 사용자가 확인해야 저장된다).
// 종류 없는 옛 꼬리표는 어떤 종류도 차지하지 않는다(뒤로 호환) — 그 순간의 빈 종류는 여전히 빈 칸이지만,
// 새 제안은 '종류:값' 한 벌 형식으로만 낸다(종류 없는 옛 값은 읽을 때만 지원한다). 24자를 넘는 제안과
// 20개 한도에 닿은 뒤의 제안은 내지 않는다. 종류별로는 첫 제안 하나만(1차 소속의 '첫 꼬리표'와 같은 셈).
export function suggestForMoments(moments) {
  const list = Array.isArray(moments) ? moments : [];
  const used = [];
  const seenUsed = new Set();
  for (const m of list) {
    for (const raw of Array.isArray(m?.keywords) ? m.keywords : []) {
      const p = parseTag(raw);
      if (!p) continue;
      const key = (p.kindId || 'plain') + '|' + tagKey(p.value);
      if (!seenUsed.has(key)) { seenUsed.add(key); used.push(p.raw); }
    }
  }
  const out = [];
  for (const m of list) {
    if (!m || typeof m.id !== 'string' || !m.id) continue;
    const owned = (Array.isArray(m.keywords) ? m.keywords : []).map(parseTag).filter(Boolean);
    const ownedValues = new Set(owned.map((p) => tagKey(p.value)));
    const ownedKinds = new Set(owned.map((p) => p.kindId).filter(Boolean));
    const budget = TAG_MAX_COUNT - owned.length;
    if (budget <= 0) continue;
    const { proposals } = suggestTagsFromTitle(String(m?.title ?? ''), { knownTags: used });
    const suggestions = [];
    const suggestedValues = new Set();
    const perKind = new Set();
    for (const p of proposals) {
      if (suggestions.length >= budget) break;
      if (p.tooLong || !p.kindId) continue; // 24자 넘는 제안·종류 없는 제안은 내지 않는다
      if (ownedKinds.has(p.kindId)) continue; // 이미 정해진 종류는 다시 권하지 않는다
      const valueKey = tagKey(p.value);
      if (ownedValues.has(valueKey) || suggestedValues.has(valueKey)) continue; // 이미 있는 값·이미 권한 값
      if (perKind.has(p.kindId)) continue; // 종류별 하나
      perKind.add(p.kindId);
      suggestedValues.add(valueKey);
      suggestions.push(p.raw);
    }
    if (suggestions.length) out.push({ momentId: m.id, suggestions });
  }
  return out;
}
