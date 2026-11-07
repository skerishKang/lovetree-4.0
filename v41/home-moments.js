// 첫 화면 궤도 카드 계획 — 로그인한 사람의 순간을 최근 수정 순으로 채운다.
// 이 파일은 순수 계산만 한다: DOM·네트워크·저장소를 건드리지 않는다.
//
// 2026-11-08 대표 지시: 로그인한 사람에게는 예시만 돌리지 않고 내 기록을 보여 준다.
// 내 순간이 궤도 카드 수보다 적으면 남는 자리는 예시로 채우되 흐리게 구분한다.

// 예시 궤도가 실제로 도는 카드 수와 같게 둔다(ORBIT_EXAMPLE.moments 40장).
export const HOME_ORBIT_LIMIT = 40;

const text = value => (typeof value === 'string' ? value.trim() : '');
const stamp = (moment) => {
  const value = text(moment?.updatedAt) || text(moment?.createdAt);
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
};

// 저장된 값만 쓴다. 외부 http(s) 이미지는 클릭 전 요청이 생기므로 쓰지 않고,
// data: 이미지와 같은 출처 경로만 카드 표지로 인정한다.
const localImage = (value) => {
  const url = text(value);
  if (/^data:image\//i.test(url)) return url;
  return /^\/(?!\/)/.test(url) ? url : '';
};
const mediaImage = moment => localImage(
  moment?.mediaMetadata?.thumbnail ||
  moment?.mediaMetadata?.poster ||
  moment?.mediaMetadata?.image ||
  moment?.attachment?.url ||
  moment?.media?.url
);
const noteOf = moment => text(moment?.note) || text(moment?.memo) || text(moment?.whyNext) || text(moment?.title);

export function homeOrbitPlan(context, limit = HOME_ORBIT_LIMIT) {
  const member = context?.member === 'in' || context?.source === 'server';
  const trees = Array.isArray(context?.trees) ? context.trees : (context?.tree ? [context.tree] : []);
  const collected = [];
  const seen = new Set();
  if (member) {
    for (const tree of trees) {
      if (!tree || !Array.isArray(tree.moments)) continue;
      const treeId = text(tree.id);
      for (const moment of tree.moments) {
        const id = text(moment?.id);
        const title = text(moment?.title);
        if (!treeId || !id || !title) continue;
        const key = `${treeId}/${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({treeId, moment, key});
      }
    }
  }
  collected.sort((a, b) => stamp(b.moment) - stamp(a.moment) || a.key.localeCompare(b.key));
  const cards = collected.slice(0, Math.max(0, limit)).map(({treeId, moment, key}) => {
    const image = mediaImage(moment);
    return {
      ...moment,
      key,
      treeId,
      title: text(moment.title),
      date: text(moment.date),
      emotion: text(moment.emotion),
      note: noteOf(moment),
      image,
      type: image ? 'photo' : 'memo',
      // orbitRecords는 createdAt 내림차순으로 정렬하므로 최근 수정 순서를 그대로 옮긴다.
      createdAt: new Date(stamp(moment) || 0).toISOString(),
    };
  });
  const kind = !member ? 'out' : cards.length === 0 ? 'empty' : cards.length < limit ? 'mixed' : 'mine';
  return {
    kind,
    cards,
    fill: kind === 'mixed' ? limit - cards.length : 0,
    note: kind === 'mine' ? '내가 남긴 순간들이에요' : kind === 'mixed' ? '흐린 카드는 감상 예시예요' : '',
  };
}
