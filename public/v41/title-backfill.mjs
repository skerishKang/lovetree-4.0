import { fetchVideoTitle } from './video-title.mjs';
import { isUserTitle } from './book-usability.mjs';
import { youtubeIdFrom } from './youtube-id.mjs';
import { isAutoTitle } from './auto-title.mjs';

// #347 후속 B: 예전 YouTube 순간의 영상 제목 채우기.
// 제목이 자동 제목('<도메인>에서 간직한 순간' — auto-title.mjs의 규칙 한 벌)인 YouTube 순간만,
// 본인 기록(server)에서만, 한 번에 limit개까지 시도한다. 같은 순간은 한 세션에서 한 번만 시도하고
// 실패는 건너뛴다. 사용자가 쓴 제목(title)은 절대 바꾸지 않는다. #678 후속(보람 트리 재발,
// 2026-11-15): mediaMetadata가 이미 있어도 순간 제목이 자동 문구로 남은 경우를 잡는다 —
// 적용(backfillTitles)은 mediaMetadata와 자동 제목을 함께 바로잡는다(domain cacheMomentMediaMetadata).

// 유튜브 주소 판정은 한 벌(public/v41/youtube-id.mjs)을 쓴다 — 예전 복사본은 지웠다.
// youtubeIdFrom 이 예전 복사본보다 ytimg 썸네일 주소·userinfo·2048자 초과까지 걸러 내지만,
// 채울 대상(YouTube 시청·쇼츠·라이브·임베드 주소) 판정은 그대로다.
export const youtubeVideoId = youtubeIdFrom;

const keyOf = (treeId, momentId) => `${treeId}/${momentId}`;

/** 채울 후보: server 기록만, 자동 제목 + 영상 제목 없음 + YouTube 주소. */
export function titleBackfillTargets(state) {
  const targets = [];
  for (const tree of state?.trees || []) {
    for (const moment of tree.moments || []) {
      const url = String(moment.url || '').trim();
      if (!url) continue;
      // #678 후속(보람 트리 재발): mediaMetadata가 이미 있어도 순간 제목이 자동 문구로 남은 경우를 잡는다.
      if (isUserTitle(moment.title)) continue; // 사용자가 직접 적은 제목은 절대 건드리지 않는다
      const videoId = youtubeVideoId(url);
      if (!videoId) continue;
      targets.push({ treeId: tree.id, momentId: moment.id, url, videoId, key: keyOf(tree.id, moment.id) });
    }
  }
  return targets;
}

/**
 * 후보를 limit개까지 조회해 한 번에 저장한다. apply(action, input)는 계정 저장 연결
 * (member.apply)이며, 여기서는 mediaMetadata만 담아 backfillTitles로 한 번에 넘긴다 — 적용 쪽
 * (domain cacheMomentMediaMetadata)이 자동 제목을 함께 바로잡는다(#678 후속).
 */
export async function backfillVideoTitles({ state, source = 'server', apply, fetchTitle = fetchVideoTitle, limit = 5, attempted = new Set() } = {}) {
  if (source !== 'server' || !apply) return { attempted: 0, filled: 0 };
  const targets = titleBackfillTargets(state).filter((target) => !attempted.has(target.key)).slice(0, limit);
  const items = [];
  for (const target of targets) {
    attempted.add(target.key);
    let title = '';
    try { title = await fetchTitle(target.videoId); } catch { title = ''; }
    if (title) items.push({ treeId: target.treeId, momentId: target.momentId, url: target.url, mediaMetadata: { title } });
  }
  if (items.length) {
    try { await apply('backfillTitles', { items }); } catch { /* 서버가 거절하면 다음 불러오기에 다시 시도한다 */ }
  }
  return { attempted: targets.length, filled: items.length };
}
