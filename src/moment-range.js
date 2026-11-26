// #792: 순간의 시작·끝 구간을 초 단위로 다루는 순수 계산. 화면·저장소·네트워크를 건드리지 않는다.
// 서버 사본(src/moment-range.js)과 같은 규칙 — tests/moment-range-792.test.mjs가 대조한다.
export const MAX_RANGE_SECONDS = 12 * 60 * 60;

/** '01:30'·'1:02:30'·'90' → 초. 0 이상 43200 이하 정수만 통과, 나머지는 null. */
export function parseTimecode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let seconds;
  if (/^\d+$/.test(raw)) {
    seconds = Number(raw);
  } else if (/^\d+m(?:\d+s?)?$/.test(raw)) {
    // #1316: 주소의 t=1m35s처럼 분·초를 붙여 쓴 값도 같은 해석 함수에서 초로 바꾼다.
    const parts = raw.match(/^(\d+)m(?:(\d+)s?)?$/);
    const minute = Number(parts[1]), second = Number(parts[2] || 0);
    if (second >= 60) return null;
    seconds = minute * 60 + second;
  } else {
    const parts = raw.split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d{1,2}$/.test(part))) return null;
    const nums = parts.map(Number);
    if (parts.length === 2) {
      if (nums[1] >= 60) return null;
      seconds = nums[0] * 60 + nums[1];
    } else {
      if (nums[1] >= 60 || nums[2] >= 60) return null;
      seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
    }
  }
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > MAX_RANGE_SECONDS) return null;
  return seconds;
}

/** 주소의 t=·start= (물음표·해시)에서 시작 초를 읽는다. src/media.js의 startFrom과 같은 자리. */
export function startFromUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  const hash = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
  for (const value of [parsed.searchParams.get('t'), parsed.searchParams.get('start'), hash.get('t'), hash.get('start')]) {
    if (value === null || value === '') continue;
    const seconds = parseTimecode(String(value).replace(/s$/, ''));
    if (seconds !== null) return seconds;
  }
  return null;
}

const hasValue = (value) => value !== undefined && value !== null && value !== '';

/** 불러오기용(관대): 틀린 값은 그 필드만 버린다. */
export function rangeFields(input = {}, url = input?.url || '') {
  const raw = input && typeof input === 'object' ? input : {};
  const hasStart = hasValue(raw.startSeconds);
  const hasEnd = hasValue(raw.endSeconds);
  if (!hasStart && !hasEnd) {
    const keyed = Object.prototype.hasOwnProperty.call(raw, 'startSeconds') || Object.prototype.hasOwnProperty.call(raw, 'endSeconds');
    if (!keyed) return {};
    const fromUrl = startFromUrl(url);
    return fromUrl === null ? {} : { startSeconds: fromUrl };
  }
  let start = hasStart ? parseTimecode(raw.startSeconds) : startFromUrl(url);
  const end = hasEnd ? parseTimecode(raw.endSeconds) : null;
  if (end !== null && start === null) start = 0;
  if (end !== null && start !== null && end <= start) return start === 0 ? {} : { startSeconds: start };
  if (start === null && end === null) return {};
  const out = {};
  if (start !== null) out.startSeconds = start;
  if (end !== null) out.endSeconds = end;
  return out;
}

/** 입력용(엄격): 형식이 틀리면 사용자 문구로 거부한다. 둘 다 없으면 빈 객체(키 자체를 넣지 않는다). */
export function validateRange(input = {}, url = input?.url || '') {
  const raw = input && typeof input === 'object' ? input : {};
  const hasStart = hasValue(raw.startSeconds);
  const hasEnd = hasValue(raw.endSeconds);
  if (!hasStart && !hasEnd) {
    const keyed = Object.prototype.hasOwnProperty.call(raw, 'startSeconds') || Object.prototype.hasOwnProperty.call(raw, 'endSeconds');
    if (!keyed) return {};
    const fromUrl = startFromUrl(url);
    if (fromUrl === null) return {};
    return { startSeconds: fromUrl };
  }
  if (hasStart && parseTimecode(raw.startSeconds) === null) throw new Error('시작 시간은 01:30 또는 01:02:30 형식으로 적어 주세요.');
  let start = hasStart ? parseTimecode(raw.startSeconds) : startFromUrl(url);
  const end = hasEnd ? parseTimecode(raw.endSeconds) : null;
  if (hasEnd) {
    const lower = start === null ? 0 : start;
    if (end === null || end <= lower) throw new Error('끝 시간은 시작 시간보다 뒤여야 해요.');
    if (start === null) start = 0;
  }
  const out = {};
  if (start !== null) out.startSeconds = start;
  if (hasEnd) out.endSeconds = end;
  return out;
}

function clock(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return '';
  const n = Number(seconds);
  if (!Number.isSafeInteger(n) || n < 0) return '';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 초를 입력 칸용 시간 표기(1:30·1:02:30)로 되돌린다. 없으면 빈 값. */
export function formatTimecode(seconds) {
  return clock(seconds);
}

/** 추가·고치기 창의 시작 칸 자동 채움: 이미 적은 값은 건드리지 않고, 주소의 t=만 읽어 채운다. */
export function fillStartFromUrl(url, currentValue) {
  if (String(currentValue ?? '').trim() !== '') return null;
  return startFromUrl(url);
}

/** 시작·끝을 '0:42–1:08'로, 끝이 없으면 '0:42부터'로 적는다. */
export function formatRange(start, end) {
  const from = clock(start);
  if (!from) return '';
  const to = Number.isSafeInteger(end) && end > start ? clock(end) : '';
  return to ? `${from}–${to}` : `${from}부터`;
}

/** 끝은 시작보다 클 때만 붙인다. */
export function youtubeRangeEmbedUrl(videoId, start, end) {
  const id = String(videoId ?? '').trim();
  const s = Number(start);
  if (!id || !Number.isSafeInteger(s) || s < 0) return '';
  const params = [`start=${s}`];
  if (Number.isSafeInteger(end) && end > s) params.push(`end=${end}`);
  params.push('rel=0');
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params.join('&')}`;
}
