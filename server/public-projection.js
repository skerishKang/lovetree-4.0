import { safePublicThumbnail } from '../public/v41/public-thumbnail.mjs';
import { normalizePrefs } from '../src/domain.js';

export const PUBLIC_REACTION_KINDS = Object.freeze(['heart', 'like', 'love', 'laugh', 'wow', 'sad', 'angry']);
export const PUBLIC_TREE_FIELDS = Object.freeze(['id', 'subject', 'title', 'openView', 'coverMomentId', 'coverDesign', 'coverMode', 'createdAt', 'updatedAt', 'moments']);
export const PUBLIC_MOMENT_FIELDS = Object.freeze(['id', 'parentId', 'title', 'note', 'emotion', 'date', 'url', 'mediaMetadata', 'startSeconds', 'endSeconds', 'relation', 'links', 'x', 'y', 'rot', 'pinStyle', 'cardStyle', 'color', 'keywords', 'createdAt']);
export const PUBLIC_MEDIA_FIELDS = Object.freeze(['title', 'channel', 'source', 'thumbnail', 'vertical', 'width', 'height']);

export const PUBLIC_VISIT_PREFS = Object.freeze(['dateStyle', 'titleDisplay', 'bookDisplay', 'shelfView', 'treeChipOrder', 'theme']);

export function projectPublicVisitPrefs(value, shelfShareIds) {
  const prefs = normalizePrefs(value);
  prefs.treeChipOrder = prefs.treeChipOrder.filter(id => shelfShareIds.has(id)).map(id => shelfShareIds.get(id));
  return Object.fromEntries(PUBLIC_VISIT_PREFS.map(key => [key, prefs[key]]));
}

const text = value => typeof value === 'string' ? value : '';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function isPrivateMediaUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try { return new URL(value, 'https://lovetree.invalid').pathname.startsWith('/api/media/'); }
  catch { return true; }
}

function publicMediaMetadata(metadata, url) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const out = {};
  for (const key of ['title', 'channel']) if (typeof metadata[key] === 'string') out[key] = metadata[key];
  if (!isPrivateMediaUrl(url)) {
    // 원본 출처는 보관용 값이다. 공개 출처는 실제 공개 링크에서만 얻는다.
    try { const parsed = new URL(url); if (['http:', 'https:'].includes(parsed.protocol) && parsed.hostname) out.source = parsed.hostname; } catch {}
  }
  const thumbnail = safePublicThumbnail(metadata.thumbnail);
  if (thumbnail) out.thumbnail = thumbnail;
  if (typeof metadata.vertical === 'boolean') out.vertical = metadata.vertical;
  for (const key of ['width', 'height']) {
    const value = number(metadata[key]);
    if (value !== null && value >= 0 && value <= 100000) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function projectPublicMoment(moment, momentIds) {
  const out = {
    id: text(moment?.id),
    parentId: moment?.parentId === null ? null : text(moment?.parentId),
    title: text(moment?.title),
    note: text(moment?.note),
    emotion: text(moment?.emotion),
    date: text(moment?.date),
    url: isPrivateMediaUrl(moment?.url) ? '' : text(moment?.url),
    relation: text(moment?.relation),
    links: Array.isArray(moment?.links)
      ? [...new Set(moment.links.filter(id => typeof id === 'string' && (!momentIds || momentIds.has(id))))]
      : [],
    createdAt: text(moment?.createdAt)
  };
  const metadata = publicMediaMetadata(moment?.mediaMetadata, moment?.url);
  if (metadata) out.mediaMetadata = metadata;
  for (const key of ['startSeconds', 'endSeconds']) {
    const value = moment?.[key];
    if (Number.isSafeInteger(value) && value >= 0) out[key] = value;
  }
  for (const key of ['x', 'y', 'rot']) {
    const value = number(moment?.[key]);
    if (value !== null) out[key] = value;
  }
  for (const key of ['pinStyle', 'cardStyle', 'color']) if (typeof moment?.[key] === 'string') out[key] = moment[key];
  const keywords = Array.isArray(moment?.keywords)
    ? [...new Set(moment.keywords.filter(value => typeof value === 'string' && value.length > 0 && value.length <= 24 && !/[\u0000-\u001f]/.test(value)))].slice(0, 20)
    : [];
  if (keywords.length) out.keywords = keywords;
  return out;
}

export function projectPublicTree(source) {
  const moments = Array.isArray(source?.moments) ? source.moments : [];
  const momentIds = new Set(moments.map(moment => moment?.id).filter(id => typeof id === 'string'));
  const tree = {
    id: text(source?.id),
    subject: text(source?.subject),
    title: text(source?.title),
    openView: text(source?.openView),
    coverMomentId: text(source?.coverMomentId),
    coverDesign: text(source?.coverDesign),
    createdAt: text(source?.createdAt),
    updatedAt: text(source?.updatedAt),
    moments: moments.map(moment => projectPublicMoment(moment, momentIds))
  };
  if (typeof source?.coverMode === 'string') tree.coverMode = source.coverMode;
  return tree;
}

export function projectPublicStats(stats = {}) {
  const out = {
    favorites: number(stats?.favorites) ?? 0,
    hearts: number(stats?.hearts) ?? 0,
    comments: number(stats?.comments) ?? 0,
    favored: stats?.favored === true,
    hearted: stats?.hearted === true,
    reactions: Object.fromEntries(PUBLIC_REACTION_KINDS.map(kind => [kind, number(stats?.reactions?.[kind]) ?? 0])),
    mine: Array.isArray(stats?.mine) ? stats.mine.filter(kind => PUBLIC_REACTION_KINDS.includes(kind)) : []
  };
  if (Object.hasOwn(stats || {}, 'weeklyFavorites')) out.weeklyFavorites = number(stats?.weeklyFavorites) ?? 0;
  return out;
}

export function projectPublicMomentStats(stats = {}) {
  return {
    hearts: number(stats?.hearts) ?? 0,
    aiHearts: number(stats?.aiHearts) ?? 0,
    comments: number(stats?.comments) ?? 0,
    hearted: stats?.hearted === true
  };
}
