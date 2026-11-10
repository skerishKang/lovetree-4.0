import { fetchVideoTitle } from './video-title.mjs';
import { isUserTitle } from './book-usability.mjs';

// #347 후속 B: 예전 YouTube 순간의 영상 제목 채우기.
// 제목이 자동 제목이고 mediaMetadata.title이 비어 있을 때만, 본인 기록(server)에서만,
// 한 번에 limit개까지 시도한다. 같은 순간은 한 세션에서 한 번만 시도하고 실패는 건너뛴다.
// 사용자가 쓴 제목(title)은 절대 바꾸지 않고 mediaMetadata만 채운다.

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { return ''; }
  if (!['http:', 'https:'].includes(url.protocol)) return '';
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return '';
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] || '';
    return VIDEO_ID.test(id) ? id : '';
  }
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') || '';
    return VIDEO_ID.test(id) ? id : '';
  }
  const matched = url.pathname.match(/^\/(shorts|live|embed)\/([^/?#]+)/);
  return matched && VIDEO_ID.test(matched[2]) ? matched[2] : '';
}

const keyOf = (treeId, momentId) => `${treeId}/${momentId}`;

/** 채울 후보: server 기록만, 자동 제목 + 영상 제목 없음 + YouTube 주소. */
export function titleBackfillTargets(state) {
  const targets = [];
  for (const tree of state?.trees || []) {
    for (const moment of tree.moments || []) {
      const url = String(moment.url || '').trim();
      if (!url) continue;
      if (String(moment.mediaMetadata?.title || '').trim()) continue;
      if (isUserTitle(moment.title)) continue;
      const videoId = youtubeVideoId(url);
      if (!videoId) continue;
      targets.push({ treeId: tree.id, momentId: moment.id, url, videoId, key: keyOf(tree.id, moment.id) });
    }
  }
  return targets;
}

/**
 * 후보를 limit개까지 조회해 한 번에 저장한다. apply(action, input)는 계정 저장 연결
 * (member.apply)이며, 여기서는 mediaMetadata만 담아 backfillTitles로 한 번에 넘긴다.
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
