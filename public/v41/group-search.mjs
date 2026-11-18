// #784 그룹 찾기·자동완성 순수 규칙. 네트워크·화면 없이 시험한다.
// 색인에는 쓰지 않는다 — 화면에서 한 번씩만 부르는 소규모 매칭이다(그룹 ≤ 200).
const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JAMO = /^[ㄱ-ㅎ]+$/;

// 소문자(ko-KR)+공백 제거. 대소문자·띄어쓰기 차이를 없앤다.
// (서버 discover의 toLocaleLowerCase('ko-KR')와 같은 규칙 — 저장소에 이미 있는 한 벌.)
export function searchKey(name) {
  return String(name ?? '').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}

// 완성형 한글(0xAC00~0xD7A3)에서 초성만 뽑는다. 홀자모·외 나머지는 그대로 둔다.
// (초성 검사기는 저장소에 없어 새로 만든다 — 알려진 초성 19개로만 짧게 둔다.)
export function choseong(name) {
  let out = '';
  for (const ch of String(name ?? '')) {
    const code = ch.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHOSEONG[Math.floor((code - 0xac00) / 588)];
    else if (ch >= 'ㄱ' && ch <= 'ㅎ') out += ch;
    else out += ch;
  }
  return out;
}

// 그룹 목록에서 질의와 맞는 그룹을 순서대로 돌려준다.
// 순서: 시작 일치 → 포함 일치 → 초성 일치. 동점(같은 순서)은 localeCompare(ko) 가나다순.
// groups: [{ group, count }] 또는 [{ name, count }] — 받은 객체로 돌려준다.
export function matchGroups(groups, query, { limit = 5 } = {}) {
  const q = searchKey(query);
  const qChoseong = JAMO.test(String(query ?? '').replace(/\s+/g, '')) ? choseong(query).replace(/\s+/g, '') : '';
  const out = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    const name = g?.group ?? g?.name;
    if (!name) continue;
    const k = searchKey(name);
    let rank = -1;
    if (q) {
      if (k.startsWith(q)) rank = 0;
      else if (k.includes(q)) rank = 1;
    }
    if (rank === -1 && qChoseong) {
      const c = choseong(name).replace(/\s+/g, '');
      if (c === qChoseong || c.startsWith(qChoseong)) rank = 2;
      else if (c.includes(qChoseong)) rank = 3;
    }
    if (rank >= 0) out.push({ rank, name, group: g });
  }
  out.sort((a, b) => a.rank - b.rank || String(a.name).localeCompare(String(b.name), 'ko'));
  return out.slice(0, Math.max(1, limit)).map((r) => r.group);
}

// 찾기 목록 섹션: 첫 글자의 초성 블록(ㄱㄴㄷ…) → A-Z → 기타.
// sectionGroups(groups) → [{ label, items }] (빈 섹션 없음, 순서 고정).
export function sectionGroups(groups) {
  const blocks = [{ label: '기타', items: [] }];
  const inBlocks = new Map();
  for (const g of Array.isArray(groups) ? groups : []) {
    const name = g?.group ?? g?.name;
    if (!name) continue;
    const first = String(name)[0] || '';
    let label = '기타';
    if (/[가-힣]/.test(first)) label = CHOSEONG[Math.floor((first.codePointAt(0) - 0xac00) / 588)];
    else if (/[A-Za-z]/.test(first)) label = String(first).toUpperCase();
    if (!inBlocks.has(label)) {
      const b = { label, items: [] };
      blocks.push(b);
      inBlocks.set(label, b);
    }
    inBlocks.get(label).items.push(g);
  }
  inBlocks.clear();
  const ordered = blocks.filter((b) => b.items.length);
  ordered.sort((a, b) => {
    const rank = (v) => (CHOSEONG.includes(v) ? CHOSEONG.indexOf(v) : 999);
    return rank(a.label) - rank(b.label) || String(a.label).localeCompare(String(b.label), 'ko');
  });
  for (const b of ordered) b.items.sort((a, b2) => String(a.group ?? a.name).localeCompare(String(b2.group ?? b2.name), 'ko'));
  return ordered;
}
