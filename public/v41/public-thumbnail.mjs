// 대표 결정 11-27: 지금은 유튜브만, 틱톡·인스타는 나중에 추가
const PUBLIC_THUMBNAIL_HOSTS = ['ytimg.com'];

export function safePublicThumbnail(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return '';
  const raw = value.trim();
  if (!raw) return '';
  let parsed;
  try { parsed = new URL(raw); }
  catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  if (parsed.pathname.startsWith('/api/media/')) return '';
  if (!PUBLIC_THUMBNAIL_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host))) return '';
  return parsed.href;
}
