import {displayTreeTitle} from './tree-name.mjs';
import {normalizeDateStyle} from './domain.mjs';
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

/* #347 후속(2026-11-10 대표 결정): 제목 보기 설정.
   both = 큰 제목 내 제목 + 작은 줄 영상 제목, mine = 내 제목(없으면 영상), video = 영상 제목(없으면 내 제목). */
export const TITLE_DISPLAYS = ['both', 'mine', 'video'];
export function normalizeTitleDisplay(value) {
  return TITLE_DISPLAYS.includes(value) ? value : 'both';
}
/** 셸 문맥(LT41)이나 화면 문맥(LTDEMO)에서 설정을 읽는다. 모르는 값은 둘 다. */
export function readTitleDisplay(context) {
  return normalizeTitleDisplay(context?.prefs?.titleDisplay ?? context?.titleDisplay);
}

/** 영상 제목(작은 글씨용). 받기 전에는 빈 값. */
export function videoTitle(moment = {}) {
  const meta = moment.mediaMetadata || {};
  return typeof meta.title === 'string' ? meta.title.trim() : '';
}

/** 내가 쓴 제목만. 빈 값·도메인 자동 제목·#344가 채운 영상 제목과 같은 값은 '없음'. */
export function userTitleText(moment = {}) {
  const title = String(moment.title ?? '').trim();
  if (!isUserTitle(title)) return '';
  const media = videoTitle(moment);
  if (media && title === media) return '';
  return title;
}

/**
 * 화면에 쓸 제목 한 벌(#347 후속). 큰 제목(main)과 작은 줄(sub)을 돌려준다.
 * - both: main = 내 제목(없으면 영상 제목), sub = 내 제목과 영상 제목이 둘 다 있을 때만 영상 제목
 * - mine: main = 내 제목(없으면 영상 제목), sub 없음
 * - video: main = 영상 제목(없으면 내 제목), sub 없음
 */
export function titleView(moment = {}, setting = 'both') {
  const mode = normalizeTitleDisplay(setting);
  const mine = userTitleText(moment);
  const video = videoTitle(moment);
  const main = mode === 'video' ? (video || mine) : (mine || video);
  const sub = mode === 'both' && mine && video ? video : '';
  return { setting: mode, main, sub, mine, video, note: String(moment.note ?? '').trim() };
}

/** 화면에 보이는 날짜 표기. 스타일은 계정 설정(#368 3차): 'dot'(2026. 11. 10, 기본)·'dash'(2026-11-10)·'long'(11월 10일).
    저장 형식은 건드리지 않는다. style을 주지 않으면 기본 표기(지금과 같다). */
export function formatDisplayDate(value, style) {
  const chosen = normalizeDateStyle(style);
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const matched = raw.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (matched) {
    const y = matched[1], m = matched[2].padStart(2, '0'), d = matched[3].padStart(2, '0');
    if (chosen === 'dash') return `${y}-${m}-${d}`;
    if (chosen === 'long') return `${Number(matched[2])}월 ${Number(matched[3])}일`;
    return `${y}. ${m}. ${d}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  if (chosen === 'dash') return `${y}-${m}-${d}`;
  if (chosen === 'long') return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return `${y}. ${m}. ${d}`;
}

/** 화면에 쓸 제목. 직접 쓴 제목이 없으면 ''(렌더러가 마음 한마디를 큰 글씨로 쓴다). */
export function displayTitle(title) {
  return isUserTitle(title) ? String(title).trim() : '';
}

/**
 * 저장된 자동 제목을 표시 단계에서만 걸러 낸다. 데이터는 그대로 두고 화면용 값만 바꾼다.
 * #345: #344가 저장한 영상 제목(mediaMetadata.title과 같은 값)도 자동 제목으로 본다 —
 * 큰 제목과 영상 아래 출처 줄이 같은 글자를 두 번 보여 주지 않게, 영상 제목은 출처 줄에만 둔다.
 */
export function withoutAutoTitle(moment) {
  if (!moment) return moment;
  const title = String(moment.title ?? '').trim();
  const mediaTitle = typeof moment.mediaMetadata?.title === 'string' ? moment.mediaMetadata.title.trim() : '';
  if (isUserTitle(title) && !(mediaTitle && title === mediaTitle)) return moment;
  return { ...moment, title: '' };
}

/**
 * #345: 이 순간 면에 어떤 편집 손잡이를 그릴지 한 곳에서 정한다.
 * 공유·예시(readOnly)와 동반(합성) 페이지에는 편집 손잡이를 그리지 않는다.
 * 제목이 있으면 제목 단추+작은 ✎, 마음 한마디가 비었으면 흐린 안내(쓰기)를 그린다.
 */
export function editAffordances({readOnly = false, synthetic = false, hasTitle = false, hasNote = false} = {}) {
  const writable = !readOnly && !synthetic;
  return {
    title: writable && hasTitle,
    hint: writable && hasTitle,
    guide: writable && !hasNote
  };
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

/**
 * #345: 영상 바로 아래 출처 한 줄의 문구. mediaMetadata.title이 없으면 빈 값 —
 * 화면은 그때 원본 링크(YouTube ↗)만 보여 준다.
 */
export function mediaSourceText(mediaMetadata = {}) {
  const title = typeof mediaMetadata?.title === 'string' ? mediaMetadata.title.trim() : '';
  if (!title) return '';
  const channel = typeof mediaMetadata?.channel === 'string' ? mediaMetadata.channel.trim() : '';
  return channel ? `${title} · ${channel}` : title;
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

/**
 * 좁은 화면에서 손을 뗀 순간 무엇을 할지 정한다(#296).
 * 420ms 넘게 누르면 돋보기(inspect)가 켜지는데, 그대로 두면 상세가 영영 열리지 않는다.
 * 430px 이하에서는 같은 자리에서 손을 떼면 돋보기를 닫고 상세를 연다(넘김·스와이프는 그대로).
 */
export function tapIntent({mode, longPressed, dx = 0, dy = 0, hasMoment = false, width = 1440, cancel = false} = {}) {
  const still = Math.hypot(dx, dy) < 10;
  if (mode === 'inspect') return width <= 430 && !cancel && hasMoment && still ? 'detail' : 'close-lens';
  if (mode === 'pending' && !longPressed && still && hasMoment) return 'detail';
  return 'none';
}

/** 오른쪽 페이지의 '다음 순간 남기기'는 이 순간을 부모로 편집기를 연다. */
export function nextMomentMessage(parentId) {
  return { type: 'lt41-write', mode: 'add', parentId: String(parentId ?? '') };
}

/* ── 글꼴(대표 결정 2026-11-08) ─────────────────────────────────────────────
   밤(기본) = 기억책 큰 제목까지 전부 Pretendard(--lt-ui). 마루부리는 쓰지 않는다.
   정원(html[data-lt-theme=garden]) = 큰 제목만 마루부리(한글 글리프 포함). 나머지는 Pretendard. */
// 트리 이름 표시(#212): 자동 접미사(", 나의 순간들")는 표시 단계에서만 뗀다(저장값 불변).
// 규칙의 원본은 tree-name.mjs 하나이고, 화면은 이 함수를 통해서만 이름을 쓴다.
export function treeTitleText(title) {
  return displayTreeTitle(title);
}

export const BOOK_UI_FONT = 'var(--lt-ui)';
export const BOOK_TITLE_FONT = Object.freeze({
  night: 'var(--lt-ui)',
  garden: "MaruBuri,'Noto Serif CJK KR',Batang,serif",
});

/** 밤/정원 이름만 받는다. 모르는 값은 밤(기본)이다. */
export function bookTheme(theme) {
  return String(theme ?? '').trim().toLowerCase() === 'garden' ? 'garden' : 'night';
}

/** 기억책 큰 제목에 쓸 글꼴. 밤은 Pretendard, 정원은 마루부리. */
export function bookTitleFont(theme) {
  return BOOK_TITLE_FONT[bookTheme(theme)];
}

/* 2026-11-08 #231 2단계: 제자리 재생은 왼쪽 클릭·탭(주 버튼)에만 반응한다.
   오른쪽(2)·가운데(1) 버튼은 상황 메뉴·새 탭 열기 같은 브라우저 기본 동작을 막지 않는다. */
export function isPrimaryButton(event) {
  return !event || event.button === undefined || event.button === 0;
}

/* 2026-11-09 #295: 순간 내용이 페이지보다 길면 그 페이지만 안에서 스크롤한다.
   여유 4px는 세로 반올림 오차를 걸러 내기 위한 것으로, 짧은 순간은 이 판정을 통과하지 않아
   화면이 그대로다(안1 — 페이지 안 스크롤. 안2 페이지 분할은 펼침·넘기기 구조를 바꾸므로 쓰지 않았다). */
export const PAGE_OVERFLOW_SLACK = 4;
export function pageOverflows(scrollHeight, clientHeight, slack = PAGE_OVERFLOW_SLACK) {
  const sh = Number(scrollHeight);
  const ch = Number(clientHeight);
  if (!Number.isFinite(sh) || !Number.isFinite(ch)) return false;
  return sh - ch > slack;
}

/* 2026-11-09 #295 보완: 넘침 판정을 다시 매기는 연결. 판정을 렌더 때만 하면 사진·영상 썸네일이 늦게
   로드되어 페이지가 나중에 넘치게 될 때 lt-overflow가 붙지 않아 다시 잘린다. 이미지 load(캡처 —
   load는 올라오지 않는다)·창 크기 변경·페이지 요소 크기 변화(ResizeObserver)를 보고 rAF로 묶어
   판정을 다시 실행한다. 화면(book.js)은 진짜 문서·창을 넘기고, 시험은 가짜를 넘겨 같은 연결을 검증한다. */
export function createOverflowRejudge({ judge, raf, cancelRaf = () => {}, addDocListener, addWinListener, ResizeObserver: ROClass, isPageImage }) {
  let pending = 0;
  let observer = null; // null=미연결, false=연결했으나 관찰자 없음(ResizeObserver 미지원), 그 외=관찰자
  let targets = [];
  const run = () => { pending = 0; judge(); };
  const schedule = () => { if (pending) return; pending = raf(run); };
  const onDocLoad = (event) => { if (isPageImage(event.target)) schedule(); };
  return {
    schedule,
    observe(els) {
      if (observer === null) {
        observer = false;
        addDocListener('load', onDocLoad, true);
        addWinListener('resize', schedule);
        if (ROClass) observer = new ROClass(schedule);
      }
      const list = [...els];
      if (observer) {
        targets.forEach((el) => observer.unobserve(el));
        targets = list;
        list.forEach((el) => observer.observe(el));
      }
    },
    stop() {
      if (observer) targets.forEach((el) => observer.unobserve(el));
      targets = [];
      if (pending) { cancelRaf(pending); pending = 0; }
    }
  };
}

/* #481: 제목 보기 설정도 날짜 표기와 같은 방식으로 '값이 실제로 바뀌었을 때만' 문서를 다시 띄운다.
   2026-11-12 사고(lt41-date-style 고리)와 같은 모양이 두 화면에 남아 있었다 — 첫 화면(v41/home.js)과
   책장(public/v41/views/shelf/shelf.js)이 lt41-title-display를 받으면 값과 무관하게 location.reload() 했다.
   셸이 지금은 설정에서 바꿀 때만 보내므로 평상시엔 무해하지만, 보내는 시점이 '뜰 때마다'로 바뀌면 곧바로 고리가 된다.

   다시 띄우는 조건 둘(날짜 표기와 같은 판정):
   ① 지금 그려진 값과 다르다 ② 기기 미러(lt41.titleDisplay)가 이미 그 값이다 — 다시 뜨면 새 값으로 그려진다는 보장.
   미러를 못 읽는 창(저장소 차단)이나 셸이 아직 계정 값을 못 읽어 기본값을 보낸 경우는 그대로 둔다. */
export const titleDisplayOf = (value) => normalizeTitleDisplay(value);
export function shouldReloadForTitleDisplay({ value, rendered, mirror } = {}) {
  const next = titleDisplayOf(value);
  if (next === titleDisplayOf(rendered)) return false;
  return mirror != null && mirror !== '' && titleDisplayOf(mirror) === next;
}
