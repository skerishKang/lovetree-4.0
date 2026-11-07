// 첫 화면 카드로 올릴 내 순간 고르기 — 순수 계산만 한다.
// 2026-11-08 대표 지시: 사진·영상 썸네일이 있는 순간만 카드로 쓰고, 글만 있는 순간은 최대 2장.
// 썸네일은 저장된 값 중 data: 이미지와 같은 출처 경로만 인정한다(클릭 전 외부 요청 0).
export const HOME_ORBIT_LIMIT = 40;
export const HOME_TEXT_LIMIT = 2;
export const HOME_PHOTO_MIN = 3;

const text = value => (typeof value === 'string' ? value.trim() : '');
export const localImage = (value) => {
  const url = text(value);
  if (/^data:image\//i.test(url)) return url;
  return /^\/(?!\/)/.test(url) ? url : '';
};
const PUBLIC_ORIGINS = new Set(['https://lovetree-4-0.pages.dev', 'https://lovetree.padiem.net']);
const PRIVATE_MEDIA_PATH = /^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(png|jpg|gif|webp|mp4|webm)$/i;

export function privateMediaKind(value, currentOrigin = globalThis.location?.origin) {
  const raw = text(value);
  if (!raw || !currentOrigin) return null;
  const canonical = globalThis.LTMedia?.describe?.(raw);
  if (canonical?.privateFile && (canonical.kind === 'photo' || canonical.kind === 'video')) {
    const href = canonical.loadUrl || canonical.openUrl;
    if (href) return {href, kind: canonical.kind};
  }
  let url;
  try { url = new URL(raw, currentOrigin); } catch { return null; }
  if (url.username || url.password || url.search || url.hash) return null;
  const sameOrigin = url.origin === currentOrigin;
  const officialAlias = !sameOrigin && PUBLIC_ORIGINS.has(currentOrigin) && PUBLIC_ORIGINS.has(url.origin);
  if (!sameOrigin && !officialAlias) return null;
  const match = PRIVATE_MEDIA_PATH.exec(url.pathname);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return {href: currentOrigin + url.pathname, kind: ext === 'mp4' || ext === 'webm' ? 'video' : 'photo'};
}
const stamp = (moment) => {
  const value = text(moment?.updatedAt) || text(moment?.createdAt);
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
};
const imageCandidates = moment => [
  moment?.mediaMetadata?.thumbnail,
  moment?.mediaMetadata?.poster,
  moment?.mediaMetadata?.image,
  moment?.attachment?.url,
  moment?.media?.url,
];
const mediaImage = (moment, currentOrigin) => {
  for (const value of imageCandidates(moment)) {
    const local = localImage(value);
    if (local) return local;
    const privateMedia = privateMediaKind(value, currentOrigin);
    if (privateMedia?.kind === 'photo') return privateMedia.href;
  }
  const privateMedia = privateMediaKind(moment?.url, currentOrigin);
  return privateMedia?.kind === 'photo' ? privateMedia.href : '';
};
const noteOf = moment => text(moment?.note) || text(moment?.memo) || text(moment?.whyNext) || text(moment?.title);
const recent = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

function cardOf(treeId, moment, currentOrigin) {
  const image = mediaImage(moment, currentOrigin);
  const video = !image && privateMediaKind(moment?.url, currentOrigin)?.kind === 'video';
  return {
    ...moment,
    key: `${treeId}/${text(moment?.id)}`,
    source: 'mine',
    treeId,
    id: text(moment?.id),
    title: text(moment?.title),
    date: text(moment?.date),
    emotion: text(moment?.emotion),
    note: noteOf(moment),
    image,
    type: image ? 'photo' : video ? 'video' : 'memo',
    // orbitRecords는 createdAt 내림차순이므로 최근 수정 순서를 그대로 옮긴다.
    createdAt: new Date(stamp(moment) || 0).toISOString(),
  };
}

export function homeMomentCards(context, limit = HOME_ORBIT_LIMIT, currentOrigin = globalThis.location?.origin) {
  const trees = Array.isArray(context?.trees) ? context.trees : (context?.tree ? [context.tree] : []);
  const photos = [], memos = [], seen = new Set();
  for (const tree of trees) {
    const treeId = text(tree?.id);
    if (!treeId || !Array.isArray(tree.moments)) continue;
    for (const moment of tree.moments) {
      const id = text(moment?.id);
      if (!id || !text(moment?.title)) continue;
      const key = `${treeId}/${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const card = cardOf(treeId, moment, currentOrigin);
      (card.image ? photos : memos).push(card);
    }
  }
  photos.sort(recent);
  memos.sort(recent);
  return { photos: photos.slice(0, limit), memos: memos.slice(0, limit) };
}
