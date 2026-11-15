// #627 2단계 그래프 보기(설계 docs/GRAPH_VIEW_20261115.md §2)의 순수 규칙 한 벌 — DOM도 배치 좌표도 없다.
// 꼬리표('종류:값')를 점·선 재료로 바꾸는 일만 한다: 허브(큰 점)·1차 소속(묶음)·함께 속함·꼬리표 없는
// 선반·발자취(시간 순서)·고른 곳에 걸린 구간, 그리고 겹치는 순간의 묶음(stacks — same-stage.mjs 한 벌:
// 같은 영상·같은 무대). 그리기(views/graph/)는 이 결과를 받아 그릴 뿐이고, 종류·저장 형식은 tags.mjs
// 한 벌을 그대로 쓴다(새 규칙을 만들지 않는다).
//
// 용어(설계 문서 §2 그대로):
//   허브(큰 점)   — 같은 꼬리표 값을 가진 순간이 2개 이상일 때만 만든다. 1개뿐이면 허브가 아니다.
//                    momentIds는 1차 소속(묶음) 순간, linkedIds는 그 값을 함께 가진 모든 순간이다.
//   1차 소속      — 순간 하나는 하나의 묶음에만 산다. 무대 > 노래 > 멤버 > 가수 순으로 첫 꼬리표를 고른다.
//   함께 속함     — 1차가 아닌 허브와의 이음. 상세 판 칩과 점선 묶음의 재료다.
//   선반          — 꼬리표가 아예 없는 순간(종류 없는 옛 꼬리표가 하나라도 있으면 선반이 아니다).
//   발자취        — 전체 순간을 시간 순서로 잇는 한 줄. 화면은 전체를 그리지 않고 pathFor로 고른 곳만 밝힌다.
import { parseTag, tagKey } from './tags.mjs';
import { findDuplicates, findSameStage } from './same-stage.mjs';

// 허브가 될 수 있는 종류 — 방향 문서의 '노래·멤버·무대가 큰 점' + 가수(설계 문서 v2 §2: 가수-만 순간의
// 묶음 장소로, 화면에서 한 단계 작은 점). 활동기·감정·종류 없는 옛 꼬리표는 허브가 아니라 상세 판
// 칩으로 쓴다. 종류 id는 tags.mjs TAG_KINDS의 그것이라 종류가 늘어도 여기만 고치면 된다.
export const HUB_KIND_IDS = ['stage', 'song', 'artist', 'member'];

// 1차 소속 우선순위 — 설계 문서 v2 §2 순서(무대 > 노래 > 멤버 > 가수)를 그대로 따른다. 멤버도 허브이자
// 묶음이다: 팬의 기억 단위에서 무대(언제·어디서)가 없으면 노래(무엇), 멤버(누구)가 남는다. 나머지
// 규칙(1차 소속 하나·함께 속함·고아 허브 점선)은 문서 §2 그대로다.
export const PRIMARY_KIND_ORDER = ['stage', 'song', 'member', 'artist'];

// 보드의 '내 순서'(#619-6) 저장 규약 — views/board/board-model.js의 ORDER_Y_BASE·isOrderY와 같은 값.
// 순위는 순간 y 칸에 y = -10000 + rank(0부터 7000 미만 정수)로 실린다. 옛 좌표는 지우지 않는다(계약).
export const ORDER_Y_BASE = -10000;
export const ORDER_Y_RANGE = 7000;

const idOf = (m) => (m && typeof m.id === 'string' && m.id ? m.id : null);
const listOf = (keywords) => (Array.isArray(keywords) ? keywords : []).map(parseTag).filter(Boolean);

// 보드가 쓰는 순위 값인지(같은 판정) — 순위가 아니면 옛 좌표로 보고 발자취의 날 안 순서에 쓰지 않는다.
function rankOf(m) {
  const y = Number(m?.y);
  return Number.isInteger(y) && y >= ORDER_Y_BASE && y < ORDER_Y_BASE + ORDER_Y_RANGE ? y - ORDER_Y_BASE : null;
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// 발자취: 전체 순간을 시간 순서(오래된 → 최신)로 잇는 한 줄의 재료.
// 날짜(무대 날짜, YYYY-MM-DD 문자열 비교) → 같은 날은 보드의 '내 순서'(#619-6 순위 작은 것이 먼저,
// 같은 순위는 id) → 순위가 없는 순간은 그 날 안에서 만든 순서(createdOrder, 보드가 매기는 값) 순,
// 그래도 같으면 id. 순위의 끊김 검사(보드의 거짓 양성 방지)는 여기서 하지 않는다 — 발자취는 화면
// 배치가 아니라 걷는 순서이므로 실린 순위 값을 그대로 작은 순서로 읽는다.
export function footprint(moments) {
  const list = (Array.isArray(moments) ? moments : []).filter((m) => idOf(m));
  const ordered = [...list].sort((a, b) => {
    const da = String(a?.date || ''), db = String(b?.date || '');
    if (da !== db) return da < db ? -1 : 1;
    const ra = rankOf(a), rb = rankOf(b);
    if (ra !== null && rb !== null) return ra !== rb ? ra - rb : byId(a, b);
    if (ra !== null) return -1;
    if (rb !== null) return 1;
    const ca = Number(a?.createdOrder) || 0, cb = Number(b?.createdOrder) || 0;
    return ca !== cb ? ca - cb : byId(a, b);
  });
  const order = ordered.map((m) => m.id);
  const neighbors = {};
  order.forEach((id, i) => { neighbors[id] = { prev: order[i - 1] ?? null, next: order[i + 1] ?? null }; });
  const segments = [];
  for (let i = 1; i < order.length; i += 1) segments.push([order[i - 1], order[i]]);
  return { order, neighbors, segments };
}

// 그래프 만들기. moments는 트리의 순간 배열(예시·실제 같은 모양)이라고만 가정하고, id가 없는 엉뚱한
// 값은 건너뛴다. 결과는 JSON 그대로 넘길 수 있게 평범한 배열·객체뿐이다(화면 iframe 전달 대비).
export function buildGraph(moments) {
  const list = (Array.isArray(moments) ? moments : []).filter((m) => idOf(m));

  // 1) 허브 후보: 허브 종류 꼬리표를 '종류:tagKey'로 모은다. 표기 차이('Super Shy'와 'super shy.')
  //    는 꼬리표 정리(#684)와 같은 tagKey로 하나로 센다. 표시 값은 처음 본 원본 값.
  const groups = new Map();
  for (const m of list) {
    const seen = new Set();
    for (const t of listOf(m.keywords)) {
      if (!HUB_KIND_IDS.includes(t.kindId)) continue;
      const key = t.kindId + ':' + tagKey(t.value);
      if (seen.has(key)) continue;
      seen.add(key);
      let g = groups.get(key);
      if (!g) { g = { id: key, kindId: t.kindId, key: tagKey(t.value), value: t.value, ids: [] }; groups.set(key, g); }
      g.ids.push(m.id);
    }
  }
  const hubs = [...groups.values()]
    .filter((g) => g.ids.length >= 2)
    .sort((a, b) => {
      const ka = HUB_KIND_IDS.indexOf(a.kindId), kb = HUB_KIND_IDS.indexOf(b.kindId);
      if (ka !== kb) return ka - kb;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    })
    .map((g) => ({ id: g.id, kindId: g.kindId, value: g.value, count: g.ids.length, linkedIds: [...g.ids], momentIds: [] }));
  const hubById = new Map(hubs.map((h) => [h.id, h]));

  // 2) 순간 소속: 1차는 무대 > 노래 > 멤버 > 가수 순으로 '허브가 된' 첫 꼬리표. 나머지 허브는 함께 속함.
  //    허브가 아닌 꼬리표(값이 1개뿐인 것·활동기·감정·종류 없는 옛 꼬리표)는 여기에 들지 않는다 —
  //    상세 판 칩의 재료라 화면이 순간.keywords에서 직접 읽는다.
  const entries = list.map((m) => {
    const hubIds = [];
    const seen = new Set();
    for (const t of listOf(m.keywords)) {
      if (!HUB_KIND_IDS.includes(t.kindId)) continue;
      const key = t.kindId + ':' + tagKey(t.value);
      if (seen.has(key) || !hubById.has(key)) continue;
      seen.add(key);
      hubIds.push(key);
    }
    let hubId = null;
    for (const kindId of PRIMARY_KIND_ORDER) {
      const hit = hubIds.find((id) => id.startsWith(kindId + ':'));
      if (hit) { hubId = hit; break; }
    }
    return { id: m.id, hubId, alsoHubIds: hubIds.filter((id) => id !== hubId) };
  });
  const shelf = list.filter((m) => listOf(m.keywords).length === 0).map((m) => m.id);
  // 묶음은 '1차 소속' 순간만이다(순간 하나는 하나의 묶음에만 산다). 그 값을 함께 가진 모든 순간은
  // linkedIds — 고아 허브(1차 소속 없는 묶음)의 점선과 pathFor의 재료다.
  for (const h of hubs) {
    h.momentIds = entries.filter((e) => e.hubId === h.id).map((e) => e.id);
  }

  // #627 후속: 같은 영상·같은 무대 묶음(stacks) — 그림 쪽이 겹치는 순간을 '한 무더기 + 개수'로 그릴 때의 재료.
  // 묶음 판정은 same-stage.mjs 한 벌(findDuplicates·findSameStage)을 그대로 쓰고, 여기서는 발자취
  // 순서의 leadId(묶음을 대표해 먼저 보여 줄 순간)와 순간별 stackId만 붙인다. 허브·1차 소속·발자취
  // 규칙은 바뀌지 않는다. 한 순간이 두 종류 묶음에 모두 걸리면 같은 영상 묶음을 stackId로 권한다 —
  // 영상이 같으면 더 강한 겹침이다(두 묶음은 stacks에 둘 다 남는다). stackId는 묶음 열쇠 그대로다:
  // 같은 영상은 영상 id, 같은 무대는 '무대·노래·날짜' 열쇠라 종류 사이 겹침이 없다.
  const fp = footprint(list);
  const stacks = [
    ...findDuplicates(list).map((g) => ({ key: g.key, kind: 'same-video', momentIds: g.momentIds })),
    ...findSameStage(list).map((g) => ({ key: g.key, kind: 'same-stage', momentIds: g.momentIds })),
  ];
  const orderAt = new Map(fp.order.map((id, i) => [id, i]));
  const stackIdOf = new Map();
  for (const s of stacks) {
    s.leadId = s.momentIds.reduce((lead, id) => (orderAt.get(id) < orderAt.get(lead) ? id : lead), s.momentIds[0]);
    for (const id of s.momentIds) if (!stackIdOf.has(id)) stackIdOf.set(id, s.key);
  }
  for (const e of entries) e.stackId = stackIdOf.get(e.id) ?? null;

  return { hubs, stacks, moments: entries, shelf, footprint: fp };
}

// 고른 곳(허브 또는 순간)에 걸린 발자취 구간만 — 화면이 전체 줄 대신 이것만 밝힌다(대표 결정:
// 기본 화면에는 발자취 줄을 다 그리지 않는다). 구간은 발자취 순서 그대로이므로 이어서 걷기도 가능.
//   {momentId} — 그 순간의 앞·뒤 구간(앞끝은 한 구간).
//   {hubId}    — 그 허브에 연결된 순간(1차 소속 + 함께 속함)이 지나는 구간. 고아 허브(1차 소속 없는
//                묶음)의 꼬리표를 눌렀을 때도 그 순간들을 지나는 줄이 보인다.
// 둘 다 넘기면 더 구체적인 순간을 우선하고, 모르는 id면 빈 구간(화면이 아무것도 밝히지 않는다).
export function pathFor(graph, selector = {}) {
  const { hubId, momentId } = selector || {};
  const segments = graph?.footprint?.segments || [];
  const neighbors = graph?.footprint?.neighbors || {};
  let want = null;
  if (momentId != null && neighbors[momentId]) {
    want = [momentId];
  } else if (hubId != null) {
    const hub = (graph?.hubs || []).find((h) => h.id === hubId);
    if (hub && hub.linkedIds.length) want = hub.linkedIds;
  }
  if (!want || !want.length) return { segments: [] };
  const set = new Set(want);
  return { segments: segments.filter(([a, b]) => set.has(a) || set.has(b)) };
}
