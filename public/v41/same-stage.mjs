// #627 후속: 같은 영상·같은 무대 찾기 한 벌 — DOM도 그리기도 없는 순수 규칙(graph-model.mjs와 같은 자리).
// '같은 영상'은 유튜브 영상 id가 같은 순간들(youtube-id.mjs 한 벌을 쓴다).
// '같은 무대'는 꼬리표 무대·노래 값과 무대 날짜(순간의 date 칸 — 순간 폼 라벨과 같은 이름)가
// 모두 같은 순간들이다. 하나라도 비면 묶지 않는다 — 틀린 묶음보다 안 묶는 게 낫다(#627 꼬리표 제안과 같은 원칙).
// 꼬리표 읽기·표기 차이 묶기는 tags.mjs 한 벌(tagValues·tagKey)을 그대로 쓴다(새 규칙을 만들지 않는다).
import { youtubeIdFrom } from './youtube-id.mjs';
import { tagKey, tagValues } from './tags.mjs';

const idOf = (m) => (m && typeof m.id === 'string' && m.id ? m.id : null);

/** 순간 주소를 영상 열쇠(유튜브 id)로 바꾼다. 유튜브가 아니면 ''. watch·youtu.be·shorts·m.youtube·embed·t=·ytimg 썸네일 주소를 모두 본다. */
export function videoKey(url) {
  return youtubeIdFrom(url);
}

// 묶음 만들기 — 처음 본 순서를 지킨다(결정론), 2개 이상일 때만 묶음이다(graph-model 허브와 같은 기준).
// entryOf(m)는 묶음의 열쇠와 표시 값을 돌려주거나, 이 순간이 어디에도 못 낄 때(null)를 돌려준다.
function groupsOf(moments, entryOf) {
  const groups = new Map();
  for (const m of Array.isArray(moments) ? moments : []) {
    if (!idOf(m)) continue;
    const entry = entryOf(m);
    if (!entry) continue;
    if (!groups.has(entry.key)) groups.set(entry.key, { ...entry, momentIds: [] });
    groups.get(entry.key).momentIds.push(m.id);
  }
  return [...groups.values()].filter((g) => g.momentIds.length >= 2);
}

/** 같은 영상 묶음 — 유튜브 id가 같은 순간. [{ key: 'dQw4w9WgXcQ', momentIds: ['m1', 'm2'] }] */
export function findDuplicates(moments) {
  return groupsOf(moments, (m) => {
    const key = videoKey(m?.url);
    return key ? { key } : null;
  });
}

/**
 * 같은 무대 묶음 — 꼬리표 무대·노래 값과 무대 날짜가 모두 같고 하나도 비지 않은 순간.
 * [{ key, stage, song, date, momentIds }] — stage·song·date는 처음 본 원본 값.
 * 같은 종류 꼬리표가 여러 개면 첫 꼬리표를 본다(graph-model 1차 소속과 같은 규칙).
 */
export function findSameStage(moments) {
  return groupsOf(moments, (m) => {
    const stage = tagValues(m?.keywords, 'stage')[0] || '';
    const song = tagValues(m?.keywords, 'song')[0] || '';
    const date = String(m?.date || '').trim();
    if (!stage || !song || !date) return null; // 하나라도 비면 묶지 않는다
    // 표기 차이('Super Shy'와 'super shy.')는 tags.mjs tagKey로 하나로 센다(#684 꼬리표 정리와 같은 판정).
    // 열쇠는 값 규칙이 금지한 제어문자로 잇는다 — '|'로 잇으면 '노래:B|C'와 '무대:A|B' 같은 값이
    // 서로 다른 묶음을 같은 열쇠로 뭉갠다(A|B|C|D). 그래프의 stackId가 이 열쇠를 그대로 쓴다.
    return { key: `${tagKey(stage)}\u001f${tagKey(song)}\u001f${date}`, stage, song, date };
  });
}
