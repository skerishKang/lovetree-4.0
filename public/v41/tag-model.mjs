// #627 PR B: 꼬리표를 화면에 붙이는 규칙의 한 벌(계산만 — DOM은 tag-line.mjs, 저장은 기존 경로).
// 저장 형식·검사·제안은 tags.mjs 한 벌을 그대로 쓴다(새 규칙을 만들지 않는다). 서버·저장 경로는 바꾸지 않는다.
// 저장은 기존 순간 수정 경로로 keywords만 바꾼다 — 여기서는 '어떤 순간의 keywords가 어떻게 바뀌는지'를
// 순수 계산으로만 답하고, 실제 저장 호출은 셸(shell/tag-save.mjs)이 한다.
import { parseTag, makeTag, normalizeTags, tagKey, suggestTagsFromTitle, TAG_MAX_LENGTH } from './tags.mjs';

// 카드에 보일 순서: 가수 → 노래 → 멤버 → 무대가 먼저(#627 2차 요구), 그 뒤는 활동기·감정·종류 없는
// 옛 꼬리표가 저장된 순서대로 이어진다. 종류 없는 옛 keywords도 확정된 꼬리표다(데이터를 잃지 않는다).
const KIND_ORDER = { artist: 0, song: 1, member: 2, stage: 3, era: 4, emotion: 5, plain: 6 };
const kindRank = (t) => KIND_ORDER[t.kindId ?? 'plain'] ?? KIND_ORDER.plain;

const listOf = (keywords) => (Array.isArray(keywords) ? keywords : []).map(parseTag).filter(Boolean);

// 칩 글자: 종류가 있으면 '노래 · 값', 없으면(옛 꼬리표) '#값' — 카드·상세·정리 화면이 같은 모양을 쓴다.
export function chipText(tag) {
  return tag.label ? `${tag.label} · ${tag.value}` : `#${tag.value}`;
}

// 카드(보드·책)에 보일 확정 꼬리표 — 최대 max개(기본 3개), 노래 → 멤버 → 무대 순서.
export function cardTags(keywords, max = 3) {
  return listOf(keywords)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (kindRank(a.t) - kindRank(b.t)) || (a.i - b.i))
    .slice(0, Math.max(0, max) || 3)
    .map(({ t }) => ({ kindId: t.kindId, label: t.label, value: t.value, raw: t.raw }));
}

// 상세의 꼬리표 줄 한 벌: 확정(진한 칩)·제안(흐린 칩)·너무 긴 후보(회색)를 한 번에 정한다.
// 제안은 재사용이 먼저다(tags.mjs suggestTagsFromTitle의 순서를 그대로 따른다). 이미 확정한 값은
// 다시 제안하지 않고(같은 값을 두 번 권하지 않는다), 24자를 넘는 후보는 tooLong 표시로 남긴다.
export function tagLineChips({ keywords, title, knownTags } = {}) {
  const confirmed = listOf(keywords).map((t) => ({ state: 'confirmed', kindId: t.kindId, label: t.label, value: t.value, raw: t.raw }));
  const seen = new Set(confirmed.map((c) => tagKey(c.value)));
  const { proposals } = suggestTagsFromTitle(title ?? '', { knownTags: Array.isArray(knownTags) ? knownTags : [] });
  const suggested = [];
  for (const p of proposals) {
    const key = tagKey(p.value);
    if (!p.tooLong && seen.has(key)) continue;
    seen.add(key);
    suggested.push({ state: p.tooLong ? 'tooLong' : 'proposal', kindId: p.kindId, label: p.label, value: p.value, raw: p.raw || '' });
  }
  return { confirmed, proposals: suggested };
}

// 값 하나의 중복 열쇠(저장된 문자열이 종류 표시를 붙고 빼고에도 같은 값으로 묶인다).
const valueKeyOf = (raw) => tagKey(parseTag(raw)?.value ?? raw);

// 제안·확정 칩을 눌렀을 때: 확정하지 않았으면 더하고(확정), 이미 확정했으면 뺀다(해제).
// 결과는 항상 서버 규칙(normalizeTags)으로 정리한다 — 20개·24자·중복 규칙을 여기서도 지킨다.
export function toggledKeywords(keywords, raw) {
  const list = Array.isArray(keywords) ? keywords : [];
  const key = valueKeyOf(raw);
  if (!key) return normalizeTags(list).tags;
  const has = list.some((k) => valueKeyOf(k) === key);
  const next = has ? list.filter((k) => valueKeyOf(k) !== key) : [...list, raw];
  return normalizeTags(next).tags;
}

// 직접 입력: 종류를 고르고 값을 적어 붙인다. 24자를 넘거나 비면 만들지 않고 이유를 돌려준다
// (조용히 잘라 내지 않는다 — tags.mjs makeTag와 같은 원칙).
export function inputTag(kindId, value) {
  const v = String(value ?? '').trim();
  if (!v) return { ok: false, reason: 'empty' };
  const raw = kindId ? makeTag(kindId, v) : (v.length <= TAG_MAX_LENGTH ? v.replace(/\s+/g, ' ') : null);
  return raw ? { ok: true, raw } : { ok: false, reason: 'long' };
}

// ── 꼬리표 정리 화면(트리 메뉴의 '정리' 옆) ────────────────────────────────────────────

// 이 트리에서 쓴 꼬리표 목록과 개수. 표기 차이(대소문자·띄어쓰기·따옴표·마침표)는 tagKey로 묶어
// 하나로 센다 — 묶음의 이름은 처음 본 저장값(대표 raw)으로 보여 주고, 묶음의 모든 표기를 함께 바꾼다.
export function tagInventory(tree) {
  const groups = new Map();
  for (const moment of tree?.moments || []) {
    for (const raw of Array.isArray(moment.keywords) ? moment.keywords : []) {
      const p = parseTag(raw);
      if (!p) continue;
      const key = tagKey(p.value);
      let g = groups.get(key);
      if (!g) {
        g = { key, raw: p.raw, label: p.label, value: p.value, kindId: p.kindId, raws: new Set(), momentIds: [], count: 0 };
        groups.set(key, g);
      }
      g.raws.add(p.raw);
      if (!g.momentIds.includes(moment.id)) { g.momentIds.push(moment.id); g.count += 1; }
    }
  }
  return [...groups.values()].sort((a, b) => (b.count - a.count) || a.raw.localeCompare(b.raw));
}

// (내부) 묶음의 모든 표기를 새 raw로 바꾼 moments 배열. 그 꼬리표가 없는 순간은 같은 객체로 돌려
// '바뀌는 것은 이 꼬리표뿐'을 드러낸다. 옛 keywords(종류 표시 없는 것 포함)는 그대로 보존된다.
function replaceGroup(tree, group, raw) {
  return (tree?.moments || []).map((m) => {
    const kws = Array.isArray(m.keywords) ? m.keywords : [];
    if (!kws.some((k) => group.raws.has(k))) return m;
    return { ...m, keywords: normalizeTags([...kws.filter((k) => !group.raws.has(k)), raw]).tags };
  });
}

// 이름 바꾸기: 이 꼬리표를 모든 순간에서 새 값으로 바꾼다. 종류는 묶음의 종류를 유지하고
// (종류 없는 옛 꼬리표는 종류 없이), 24자를 넘거나 비었으면 바꾸지 않고 이유를 돌려준다.
export function renamedMoments(tree, group, newValue) {
  if (!group) return { error: 'empty' };
  const v = String(newValue ?? '').trim();
  if (!v) return { error: 'empty' };
  const raw = group.kindId ? makeTag(group.kindId, v) : (v.length <= TAG_MAX_LENGTH ? v.replace(/\s+/g, ' ') : null);
  if (!raw) return { error: 'long' };
  const made = parseTag(raw);
  if (made && tagKey(made.value) === group.key) return { error: 'same' };
  return { raw, moments: replaceGroup(tree, group, raw) };
}

// 합치기: 한 꼬리표(묶음)를 다른 꼬리표로 바꿔 모든 순간에 반영한다. 같은 꼬리표면 하지 않는다.
export function mergedMoments(tree, sourceGroup, targetGroup) {
  if (!sourceGroup || !targetGroup) return { error: 'empty' };
  if (sourceGroup.key === targetGroup.key) return { error: 'same' };
  return { raw: targetGroup.raw, moments: replaceGroup(tree, sourceGroup, targetGroup.raw) };
}

// 지정한 순간들의 keywords만 바꾼 새 moments 배열(나머지 순간은 같은 객체 — 옛 keywords 보존).
// 저장은 이 배열을 기존 워크스페이스 저장 경로로 넘기는 것뿐이다(셸 tag-save.mjs).
export function momentsWithKeywords(tree, changes) {
  const map = new Map((Array.isArray(changes) ? changes : []).map((c) => [c.momentId, normalizeTags(c.keywords).tags]));
  return (tree?.moments || []).map((m) => (map.has(m.id) ? { ...m, keywords: map.get(m.id) } : m));
}

// 꼬리표 없는 순간들에 제목 해석 제안을 한 번에 모은다. 제안일 뿐이다 — 사용자가 확인하기 전에는
// 저장하지 않는다(저장은 momentsWithAddedTags로 확인한 것만 넘긴다).
export function suggestForTree(tree) {
  const known = [];
  for (const m of tree?.moments || []) {
    for (const k of Array.isArray(m.keywords) ? m.keywords : []) if (!known.includes(k)) known.push(k);
  }
  const out = [];
  for (const moment of tree?.moments || []) {
    if ((Array.isArray(moment.keywords) ? moment.keywords : []).length) continue;
    const { proposals } = suggestTagsFromTitle(moment.title || '', { knownTags: known });
    if (proposals.length) out.push({ momentId: moment.id, title: moment.title || '', proposals });
  }
  return out;
}

// 확인한 제안만 붙인다 — 선택하지 않은 순간·제안은 한 글자도 바뀌지 않는다.
export function momentsWithAddedTags(tree, picks) {
  const byMoment = new Map();
  for (const p of Array.isArray(picks) ? picks : []) {
    if (!p?.momentId || !p.raw) continue;
    if (!byMoment.has(p.momentId)) byMoment.set(p.momentId, []);
    byMoment.get(p.momentId).push(p.raw);
  }
  return (tree?.moments || []).map((m) => {
    const add = byMoment.get(m.id);
    if (!add?.length) return m;
    return { ...m, keywords: normalizeTags([...(Array.isArray(m.keywords) ? m.keywords : []), ...add]).tags };
  });
}
