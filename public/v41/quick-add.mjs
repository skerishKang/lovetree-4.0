// 빠른 추가의 순수 계산 (2026-11-09, #빠른 추가 ②).
// 화면은 이 파일의 판정만 쓰고, DOM은 shell/quick-add.mjs가 만진다(docs/TESTING.md).
// 데이터 규칙(quickAdd·inbox)은 로컬1 계약을 따른다 — 화면은 이름만 쓴다.

export const QUICK_INBOX_LABEL = '모아둔 순간';
export const QUICK_SAVED_TEXT = '모아둔 순간에 담았어요';
export const QUICK_REFINE_LABEL = '지금 다듬기';
export const DROP_VEIL_TEXT = '놓으면 모아둔 순간에 담아요';
export const QUICK_EMPTY_ERROR = '주소를 먼저 붙여 넣어 주세요.';
export const QUICK_INVALID_ERROR = '링크 형식을 확인해 주세요.';
// #343(2026-11-10): 미리보기 카드·붙여넣기 알약·안내 줄의 표시 규칙은 이 파일의 순수 함수가 정한다.
export const QUICK_PASTE_LABEL = '붙여넣기';
export const QUICK_CLEAR_LABEL = '지우기';
export const QUICK_EMPTY_PREVIEW = '주소를 넣으면 여기 미리보기가 보여요';
export const QUICK_INVALID_PREVIEW = '이 주소는 담을 수 없어요. YouTube 영상이나 http(s) 링크 주소를 넣어 주세요.';
export const QUICK_PASTE_EMPTY = '붙여 넣을 주소가 없어요.';
export const QUICK_PASTE_ERROR = '주소를 읽지 못했어요. 직접 붙여 넣어 주세요.';
export const DROP_LOGIN_NOTICE = '로그인한 뒤 순간을 담을 수 있어요.';
export const DROP_READONLY_NOTICE = '서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.';
// #638(고른 트리 우선): 담기 창의 트리 한 줄·단추·담은 안내는 고른 트리 이름을 따른다.
// 트리가 0개일 때는 기본 트리('모아둔 순간')가 새로 만들어지므로 QUICK_INBOX_LABEL을 쓴다.
export function quickTreeLineText(name) { return `${name}에 담겨요`; }
// 이슈 671: '그 순간 다음에 담기'로 열렸을 때의 트리 한 줄 — 어디에 담기는지 순간 제목까지 알려 준다.
// 하은 2회차 손질 ③(261116): '두 번째 트리 트리에 담겨요'처럼 이름이 '트리'로 끝나면 겹쳤다 — 이름을 그대로 쓴다.
export function quickTreeAfterText(momentTitle, name) { return `${momentTitle} 다음에 ${name}에 담겨요`; }
export function quickSubmitText(name) { return `${name}에 담기`; }
export function quickSavedTreeText(name) { return `${name}에 담았어요`; }

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
    return { status: 'invalid', kind: 'invalid', value, videoId: '', label: '', thumb: '' };
  }
  // 썸네일 주소는 기존 판정 한 벌(LTMedia.describe의 loadUrl)을 재사용한다 — 새로 만들지 않는다.
  return { status: 'ok', kind: media.kind, value, videoId: media.videoId || '', label: media.label || '', thumb: media.loadUrl || '' };
}

// 미리보기 카드가 그릴 것: empty(빗금 안내) · invalid(같은 틀에 안내) · youtube · tiktok · link.
// 화면(shell/quick-add.mjs)은 이 판정만 보고 그리고, 시험은 표로 확인한다.
export function previewState(parsed) {
  if (!parsed || parsed.status === 'empty') return 'empty';
  if (parsed.status !== 'ok') return 'invalid';
  if (parsed.kind === 'youtube') return 'youtube';
  // #791: 틱톡은 저장 전에 제목을 받아 두고 세로 미리보기를 그린다.
  if (parsed.kind === 'tiktok') return 'tiktok';
  // #791 2단계: 릴스는 도착 전 caption을 받아 글 카드로 미리본다.
  if (parsed.kind === 'instagram') return 'instagram';
  return 'link';
}

// 금테 꼬리표: 어디서 온 주소인지 한눈에. YouTube는 Shorts·Live 모양까지 구분한다.
export function previewTag(url, kind = '') {
  let parsed;
  try { parsed = new URL(String(url ?? '').trim()); } catch { return ''; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
    const shape = (parsed.pathname.match(/^\/(shorts|live)\//) || [])[1];
    return shape ? `YOUTUBE · ${shape.toUpperCase()}` : 'YOUTUBE';
  }
  // #791: 틱톡 정본·짧은 주소는 모두 TIKTOK 꼬리표.
  if (host === 'tiktok.com' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return 'TIKTOK';
  // #791 2단계: 인스타그램 릴스와 짧은 공유 주소는 모두 INSTAGRAM 꼬리표.
  if (host === 'instagram.com' || host === 'instagr.am') return 'INSTAGRAM';
  return kind === 'youtube' ? 'YOUTUBE' : kind === 'tiktok' ? 'TIKTOK' : kind === 'instagram' ? 'INSTAGRAM' : host;
}

// 안내 줄 제목 요약: 한 줄로 접고 max자 뒤는 말줄임(안내 줄 높이가 고정이라서).
export function noticeSummary(title, max = 32) {
  const text = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('').trimEnd() + '…' : text;
}

// 담은 뒤 안내: "✓ 담았어요 · 제목 요약". 제목이 없으면 담긴 사실만 남긴다.
export function savedNoticeText(title) {
  const summary = noticeSummary(title);
  return summary ? `✓ 담았어요 · ${summary}` : '✓ 담았어요';
}

// 놓았을 때 어디로 갈지를 한 곳에서 정한다.
// share는 아무것도 받지 않고(#315 읽기 전용), 예시·파일·비로그인은 기존 로그인 안내를 쓴다.
// 자세한 추가가 열려 있으면 주소 칸으로, 빠른 추가가 열려 있으면 그 모달로, 아니면 바로 저장한다.
// 사진 파일(#425 2번: 올린 사진은 나만 보기)은 늘 자세한 추가의 업로더로 보낸다 —
// 쉬운 추가 탭에는 사진 올리기가 없으므로 빠른 추가가 열려 있어도 자세한 추가로 옮긴다.
export function dropRoute({ source = 'example', owned = false, writable = false, quickOpen = false, editorOpen = false, image = false } = {}) {
  if (source === 'share') return { kind: 'ignore', target: '', veil: '' };
  if (source !== 'server' || !owned) return { kind: 'login', target: '', veil: '' };
  if (!writable) return { kind: 'readonly', target: '', veil: '' };
  if (image) return { kind: 'photo', target: 'editor', veil: '놓으면 이 순간에 사진을 붙여요' };
  if (quickOpen) return { kind: 'modal', target: 'quick', veil: '놓으면 빠른 추가에 담아요' };
  if (editorOpen) return { kind: 'editor', target: 'editor', veil: '놓으면 이 순간의 주소 칸에 들어가요' };
  return { kind: 'quick', target: 'quick', veil: DROP_VEIL_TEXT };
}
