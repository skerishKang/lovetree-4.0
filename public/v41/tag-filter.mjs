// #627 후속: 순간 목록의 '꼬리표로 찾기·걸러 보기' 계산만 모은 모듈(DOM 없음).
// 저장 형식·종류·표기 열쇠는 tags.mjs 한 벌을 그대로 쓴다 — 여기서 새 규칙을 만들지 않는다.
// 결과는 평범한 배열·객체라 화면(셸 '순간 목록')이 그대로 받아 쓸 수 있고, 걸러 보기 상태는 저장하지 않는다.
import { TAG_KINDS, parseTag, tagKey } from './tags.mjs';

const PLAIN_LABEL = '그 밖';

const listOf = (moments) => (Array.isArray(moments) ? moments : []);

// 꼬리표 하나의 값 열쇠 — 종류 표시('노래:')가 붙은 저장값과 값만 온 선택 열쇠를 같은 열쇠로 맞춘다.
const keyOf = (raw) => {
  if (typeof raw !== 'string') return '';
  const tag = parseTag(raw);
  return tag ? tagKey(tag.value) : '';
};

// 이 순간이 가진 꼬리표 값 열쇠들(한 순간 안의 중복 표기는 한 번만).
function keysOfMoment(moment) {
  const keys = new Set();
  for (const raw of Array.isArray(moment?.keywords) ? moment.keywords : []) {
    const key = keyOf(raw);
    if (key) keys.add(key);
  }
  return keys;
}

// 종류별 꼬리표 목록: [{ kindId, label, tags: [{ key, value, count }] }].
// - 종류는 TAG_KINDS 순서, 종류 없는 옛 꼬리표는 마지막 '그 밖' 묶음(kindId: null).
// - 같은 값은 tagKey로 한 칸(표시 값은 가장 많이 쓴 표기, 같으면 먼저 본 표기).
// - count는 그 꼬리표를 가진 순간 수(한 순간에 두 번 적혀도 한 번) — 많이 쓰인 순서로 정렬한다.
export function tagFacets(moments) {
  const groups = new Map(); // 'artist' | ... | 'plain' → Map(key → { key, count, spellings })
  for (const moment of listOf(moments)) {
    const counted = new Set(); // 이 순간에서 이미 센 (종류, 값)
    for (const raw of Array.isArray(moment?.keywords) ? moment.keywords : []) {
      const tag = parseTag(raw);
      if (!tag) continue;
      const key = tagKey(tag.value);
      if (!key) continue;
      const groupId = tag.kindId || 'plain';
      const seenKey = groupId + '|' + key;
      if (counted.has(seenKey)) continue;
      counted.add(seenKey);
      if (!groups.has(groupId)) groups.set(groupId, new Map());
      const group = groups.get(groupId);
      if (!group.has(key)) group.set(key, { key, count: 0, spellings: new Map() });
      const entry = group.get(key);
      entry.count += 1;
      entry.spellings.set(tag.value, (entry.spellings.get(tag.value) || 0) + 1);
    }
  }

  const facetsOf = (group) => {
    const tags = [...group.values()].map((entry) => {
      let value = '';
      let best = -1;
      for (const [spelling, count] of entry.spellings) {
        if (count > best) { best = count; value = spelling; }
      }
      return { key: entry.key, value, count: entry.count };
    });
    return tags.sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value));
  };

  const out = [];
  for (const kind of TAG_KINDS) {
    const group = groups.get(kind.id);
    if (group?.size) out.push({ kindId: kind.id, label: kind.label, tags: facetsOf(group) });
  }
  const plain = groups.get('plain');
  if (plain?.size) out.push({ kindId: null, label: PLAIN_LABEL, tags: facetsOf(plain) });
  return out;
}

// 고른 꼬리표가 모두 붙은 순간만 남긴다(그리고). 선택이 비면 전부 — 원래 배열은 건드리지 않는다.
// 선택 열쇠는 tagKey 비교라 'Super Shy'·'super shy.'·'노래:Super Shy'가 같은 꼬리표다.
export function filterMomentsByTags(moments, selectedKeys) {
  const list = listOf(moments);
  const selected = Array.isArray(selectedKeys) ? selectedKeys : selectedKeys == null ? [] : [selectedKeys];
  const wanted = [...new Set(selected.map(keyOf).filter(Boolean))];
  if (!wanted.length) return list.slice();
  return list.filter((moment) => {
    const owned = keysOfMoment(moment);
    return wanted.every((key) => owned.has(key));
  });
}

// 목록 검색칸: 제목·마음(note)·꼬리표 값에서 찾는다. 꼬리표는 tagKey로 표기 차이를 무시하고,
// 한글·영문 모두 tagKey가 소문자로 맞춘다. 검색어에 종류 표시('노래:')가 붙어 와도 값만 본다.
// 빈 검색어는 모두 맞는다.
export function matchMomentText(moment, query) {
  const needle = keyOf(query);
  if (!needle) return true;
  for (const field of [moment?.title, moment?.note]) {
    if (tagKey(field).includes(needle)) return true;
  }
  for (const raw of Array.isArray(moment?.keywords) ? moment.keywords : []) {
    if (keyOf(raw).includes(needle)) return true;
  }
  return false;
}