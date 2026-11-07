// 인기 카드: 둘러보기가 이미 쓰는 공개 API만 재사용한다(새 API·DB 없음).
// 발견 목록은 최신 공개 순이며 별도 인기 지표가 없어 그 순서를 그대로 쓴다.
// 각 공개 트리를 읽어 사진·영상 썸네일(같은 출처·data:)이 있는 순간만 카드로 만든다.
import {createCommunityApi} from '../public/v41/community-api.mjs';
import {createShareApi} from '../public/v41/share-api.mjs';
import {localImage} from './home-moments.js';

const stamp = (moment) => {
  const value = moment?.updatedAt || moment?.createdAt || '';
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
};
const imageOf = moment => localImage(
  moment?.mediaMetadata?.thumbnail ||
  moment?.mediaMetadata?.poster ||
  moment?.mediaMetadata?.image ||
  moment?.attachment?.url ||
  moment?.media?.url
);

export async function fetchPopularCards({limit = 40, shareLimit = 6, community = createCommunityApi(), shares = createShareApi()} = {}) {
  let found;
  try { found = await community.discover({limit: 12}); } catch { return []; }
  if (found?.ok !== true || !Array.isArray(found.items)) return [];
  const items = found.items.slice(0, shareLimit);
  const answers = await Promise.all(items.map(item => shares.read(item.shareId).catch(() => null)));
  const cards = [];
  items.forEach((item, index) => {
    const tree = answers[index]?.tree;
    if (!tree || !Array.isArray(tree.moments)) return;
    for (const moment of tree.moments) {
      const image = imageOf(moment);
      if (!image || !moment?.id || !moment?.title) continue;
      cards.push({
        ...moment,
        key: `${item.shareId}/${moment.id}`,
        source: 'public',
        shareId: item.shareId,
        view: item.view || 'book',
        treeId: tree.id,
        title: moment.title,
        date: moment.date || '',
        emotion: moment.emotion || '',
        note: moment.note || moment.memo || moment.title,
        image,
        type: 'photo',
        createdAt: new Date(stamp(moment) || 0).toISOString(),
      });
    }
  });
  cards.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return cards.slice(0, limit);
}
