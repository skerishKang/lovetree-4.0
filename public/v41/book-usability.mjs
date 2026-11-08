// 기억책 사용성 규칙(2026-11-08 대표 피드백 1~9). 화면(iframe)과 셸이 같은 규칙을 쓰고,
// 시험은 이 파일을 직접 불러 확인한다. 데이터는 읽기만 하고 바꾸지 않는다(표시 단계에서만 거른다).

/** 자동 생성 제목: "<도메인>에서 간직한 순간" (예: "youtu.be에서 간직한 순간"). 정확히 일치할 때만 자동으로 본다. */
const AUTO_TITLE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?에서 간직한 순간$/i;

/** 사용자가 직접 쓴 제목인지. 자동 제목·빈 값이면 false. */
export function isUserTitle(title) {
  const value = String(title ?? '').trim();
  if (!value) return false;
  return !AUTO_TITLE.test(value);
}

/** 화면에 쓸 제목. 직접 쓴 제목이 없으면 ''(렌더러가 마음 한마디를 큰 글씨로 쓴다). */
export function displayTitle(title) {
  return isUserTitle(title) ? String(title).trim() : '';
}

/** 저장된 자동 제목을 표시 단계에서만 걸러 낸다. 데이터는 그대로 두고 화면용 값만 바꾼다. */
export function withoutAutoTitle(moment) {
  if (!moment || isUserTitle(moment.title)) return moment;
  return { ...moment, title: '' };
}

/**
 * 영상 제목(작은 글씨)과 마음 한마디(큰 글씨)를 나눈다.
 * 미디어 메타데이터 제목/채널은 작은 글씨, 사용자가 쓴 마음 한마디는 큰 글씨다.
 */
export function titleParts(moment = {}) {
  const meta = moment.mediaMetadata || {};
  const sub = [meta.title, meta.channel].filter((value) => typeof value === 'string' && value.trim()).join(' · ');
  return { main: displayTitle(moment.title), note: String(moment.note ?? '').trim(), media: sub.trim() };
}

/** YouTube oEmbed 프록시로 이미 받아 둔 영상 제목(작은 글씨용). 받기 전에는 빈 값. */
export function videoTitle(moment = {}) {
  const meta = moment.mediaMetadata || {};
  return typeof meta.title === 'string' ? meta.title.trim() : '';
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * 그 자리 재생용 youtube-nocookie embed 주소. 누른 뒤에만 쓴다.
 * referrerpolicy 는 embed iframe 쪽에서 넣는다(호출 쪽 책임). 잘못된 id 는 null.
 */
export function embedUrl(videoId, startSeconds = 0) {
  const id = String(videoId ?? '').trim();
  if (!YT_ID.test(id)) return null;
  const seconds = Number(startSeconds);
  const t = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${t ? `&start=${t}` : ''}`;
}

/** 연결 안내 한 줄. 다음 순간이 없으면 null(줄 자체를 숨긴다). 시스템 용어는 쓰지 않는다. */
export function connectionLine(nextTitle, reason) {
  const title = String(nextTitle ?? '').trim();
  if (!title) return null;
  const why = String(reason ?? '').trim();
  return `다음 순간으로 이어진 이유: ${why || '이어진 이유를 아직 적지 않았어요'}`;
}

/** 오른쪽 페이지가 비었을 때의 다음 안내(대표 지시 2026-11-08: "상단"은 무엇인지 알 수 없다). */
export const NEXT_PAGE_COPY = '이 순간 다음 이야기를 남겨 보세요';
export const NEXT_PAGE_ACTION = '다음 순간 남기기';

/** 돋보기 선택값 저장 키. 기본은 꺼짐. 실패하면 꺼짐으로 둔다. */
export const LENS_KEY = 'lt41.bookLens';

function safeStorage(storage) {
  try {
    return storage || null;
  } catch {
    return null;
  }
}

/** localStorage 에서 돋보기 선택값을 읽는다. 없거나 실패하면 false(꺼짐). */
export function readLens(storage) {
  try {
    const store = safeStorage(storage);
    return store?.getItem(LENS_KEY) === 'on';
  } catch {
    return false;
  }
}

/** 돋보기 선택값을 저장한다. 실패해도 화면은 계속 동작한다(저장만 건너뛴다). */
export function writeLens(on, storage) {
  try {
    const store = safeStorage(storage);
    if (store) store.setItem(LENS_KEY, on ? 'on' : 'off');
    return !!on;
  } catch {
    return !!on;
  }
}

/**
 * 상세 카드를 어디에 그릴지 정한다.
 * - 오른쪽 페이지가 비어 있음 → 오른쪽 페이지에 상세 전체
 * - 오른쪽 페이지에 다음 순간이 있음 → 누른 카드 옆에 붙는 작은 패널
 */
export function detailPlacement(rightEmpty) {
  return rightEmpty ? 'right-page' : 'card-side';
}

/** 오른쪽 페이지의 '다음 순간 남기기'는 이 순간을 부모로 편집기를 연다. */
export function nextMomentMessage(parentId) {
  return { type: 'lt41-write', mode: 'add', parentId: String(parentId ?? '') };
}
