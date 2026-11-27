export function safePublicThumbnail(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return '';
  const raw = value.trim();
  if (!raw) return '';
  let parsed;
  try { parsed = new URL(raw); }
  catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  if (parsed.pathname.startsWith('/api/media/')) return '';
  return parsed.href;
}
