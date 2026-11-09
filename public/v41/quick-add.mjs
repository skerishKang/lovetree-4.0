// 빠른 추가의 순수 계산 (2026-11-09, #빠른 추가 ②).
// 화면은 이 파일의 판정만 쓰고, DOM은 shell/quick-add.mjs가 만진다(docs/TESTING.md).
// 데이터 규칙(quickAdd·inbox)은 로컬1 계약을 따른다 — 화면은 이름만 쓴다.

export const QUICK_INBOX_LABEL = '모아둔 순간';
export const QUICK_SAVED_TEXT = '모아둔 순간에 담았어요';
export const QUICK_REFINE_LABEL = '지금 다듬기';
export const DROP_VEIL_TEXT = '놓으면 모아둔 순간에 담아요';
export const QUICK_EMPTY_ERROR = '주소를 먼저 붙여 넣어 주세요.';
export const QUICK_INVALID_ERROR = '링크 형식을 확인해 주세요.';
export const DROP_LOGIN_NOTICE = '로그인한 뒤 순간을 담을 수 있어요.';
export const DROP_READONLY_NOTICE = '서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.';

function httpUrl(value) {
  try {
    const parsed = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function readData(dataTransfer, type) {
  if (!dataTransfer) return '';
  if (typeof dataTransfer === 'string') return type === 'text/plain' ? dataTransfer : '';
  try { return String(dataTransfer.getData?.(type) || ''); } catch { return ''; }
}

// dataTransfer의 text/uri-list를 먼저, 없으면 text/plain을 본다.
// uri-list는 한 줄에 URL 하나이고 '#'으로 시작하는 줄은 주석이다(RFC 2483).
export function extractDropUrl(dataTransfer) {
  for (const raw of readData(dataTransfer, 'text/uri-list').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const url = httpUrl(line);
    if (url) return url;
  }
  return httpUrl(readData(dataTransfer, 'text/plain'));
}

// 드래그 중인 것이 우리가 받을 수 있는 것인지(주소 글자 또는 파일)만 본다.
export function hasDropPayload(dataTransfer) {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []).map(String);
  if (types.includes('text/uri-list') || types.includes('text/plain') || types.includes('Files')) return true;
  return Array.from(dataTransfer.files || []).length > 0;
}

export function firstImageFile(dataTransfer) {
  const files = Array.from(dataTransfer?.files || []);
  return files.find((file) => /^image\//.test(String(file?.type || ''))) || null;
}

// 붙여 넣은 주소를 즉시 판정한다. 빈 값과 지원하지 않는 주소를 구분한다.
export function parseQuickUrl(url, describe) {
  const value = String(url ?? '').trim();
  if (!value) return { status: 'empty', kind: 'none', value: '', videoId: '', label: '' };
  let media = null;
  try { media = describe(value); } catch { media = null; }
  if (!media || !media.openUrl || media.kind === 'none' || media.kind === 'invalid') {
    return { status: 'invalid', kind: 'invalid', value, videoId: '', label: '' };
  }
  return { status: 'ok', kind: media.kind, value, videoId: media.videoId || '', label: media.label || '' };
}

export function quickVideoThumb(videoId) {
  return /^[A-Za-z0-9_-]{6,20}$/.test(String(videoId || '')) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}

// 놓았을 때 어디로 갈지를 한 곳에서 정한다.
// share는 아무것도 받지 않고(#315 읽기 전용), 예시·파일·비로그인은 기존 로그인 안내를 쓴다.
// 자세한 추가가 열려 있으면 주소 칸으로, 빠른 추가가 열려 있으면 그 모달로, 아니면 바로 저장한다.
// 사진 파일은 자세한 추가가 열려 있으면 그 화면의 업로더로, 아니면 빠른 추가 업로더로 보낸다.
export function dropRoute({ source = 'example', owned = false, writable = false, quickOpen = false, editorOpen = false, image = false } = {}) {
  if (source === 'share') return { kind: 'ignore', target: '', veil: '' };
  if (source !== 'server' || !owned) return { kind: 'login', target: '', veil: '' };
  if (!writable) return { kind: 'readonly', target: '', veil: '' };
  if (image) return editorOpen
    ? { kind: 'photo', target: 'editor', veil: '놓으면 이 순간에 사진을 붙여요' }
    : { kind: 'photo', target: 'quick', veil: '놓으면 모아둔 순간에 사진을 담아요' };
  if (quickOpen) return { kind: 'modal', target: 'quick', veil: '놓으면 빠른 추가에 담아요' };
  if (editorOpen) return { kind: 'editor', target: 'editor', veil: '놓으면 이 순간의 주소 칸에 들어가요' };
  return { kind: 'quick', target: 'quick', veil: DROP_VEIL_TEXT };
}
