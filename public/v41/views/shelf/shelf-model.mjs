// 내 트리(책장 화면)의 순수 계산 (#231 후속, 2026-11-09).
// views/shelf/shelf.js 안에 있던 계산을 화면(DOM) 없이 시험할 수 있게 그대로 옮겼다.
// 조건·문구·계산식 변경 0.
import { normalizeCoverDesign, coverDesignPaletteIndex, coverModeOf } from '../../domain.mjs';
import { thumbnailCandidates, thumbFallbackAttrs, fallbackCardMarkup } from '../../thumb-fallback.mjs';
import { youtubeIdFrom } from '../../youtube-id.mjs';

// A-15: 글자 막기 정본(html-escape.mjs) 한 벌 — 쓰던 이름은 그대로 다시 내보낸다.
import { escapeHtml } from '../../html-escape.mjs';
export const escapeShelf = escapeHtml;

// #212: 표지에 보이는 이름은 한 번만 쓴다. 자동 접미사(", 나의 순간들")는 표시 단계에서만 뺀다(tree-name.mjs).
export const treeTitleOf = (value, namer) => (namer ? namer(value) : value);

export function lastMomentDate(tree) {
  const dates = tree.moments.map((moment) => moment.date || '').filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : '';
}

// 표지 색은 테마 변수를 넘긴다(실제 색값은 identity.css의 --lt-cover-N에만 있다).
export const COVER_PALETTE = ['var(--lt-cover-1)', 'var(--lt-cover-2)', 'var(--lt-cover-3)', 'var(--lt-cover-4)'];

// #256-3: 책 표지를 무엇으로 그릴지 한 곳에서 정한다.
// 우선순위: coverMomentId 사진 > coverDesign(디자인 표지) > 지금 규칙(palette[index % 4] 색).
// 책장(shelf.js)과 펼친 책(shelf-reader.js)은 이 결과(book 객체)를 같이 쓴다.
// 사진·디자인이 둘 다 없으면 color·accent·coverMedia는 지금과 같은 값이라 기존 화면 변화가 없다.
export function coverMomentFor(tree) {
  if (!tree) return null;
  const mode = coverModeOf(tree);
  if (mode === 'design') return null;
  if (mode === 'basic') {
    const first = Array.isArray(tree.moments) ? tree.moments[0] : null;
    return first && (first.type === 'photo' || first.youtubeThumb) && first.image ? first : null;
  }
  const cover = (tree.moments || []).find((moment) => moment.id === tree.coverMomentId);
  return cover && (cover.type === 'photo' || cover.youtubeThumb) && cover.image ? cover : null;
}

export function coverChoice(tree, index, palette) {
  const color = palette[index % palette.length];
  // #380 5번: 표지 방법 하나만 따른다. 디자인을 고르면 사진 표지는 쓰지 않고(지우지도 않는다),
  // 순간·사진을 고르면 디자인 표지를 쓰지 않는다. 옛 저장본은 coverModeOf가 지금 규칙으로 읽는다.
  const mode = coverModeOf(tree);
  if (mode === 'design') {
    const design = normalizeCoverDesign(tree.coverDesign);
    if (design) {
      const designColor = palette[Math.max(0, coverDesignPaletteIndex(design)) % palette.length];
      return { color: designColor, accent: designColor, coverMedia: '', design };
    }
  }
  // 첫 순간(기본)은 첫 순간에 사진/썸네일이 있으면 쓰고 없으면 색 표지다. 저장해 둔 표지 순간·디자인은 지우지 않는다.
  const cover = coverMomentFor(tree);
  const coverMedia = cover ? cover.image || '' : '';
  if (coverMedia) return { color, accent: color, coverMedia, design: '' };
  return { color, accent: color, coverMedia: '', design: '' };
}

export function shelfBook(tree, index, palette, namer) {
  const choice = coverChoice(tree, index, palette);
  const chosenCover = choice.coverMedia ? coverMomentFor(tree) : null;
  const coverCandidates = chosenCover
    ? (() => { const list = thumbnailCandidates(chosenCover, { autoLoad: true }); return list.length ? list : [choice.coverMedia]; })()
    : (choice.coverMedia ? [choice.coverMedia] : []);
  return {
    id: tree.id,
    name: treeTitleOf(tree.title, namer),
    subject: tree.subject || '',
    category: 'all',
    // #327 2부: 모아둔 순간 트리는 책장 카드에 표시를 붙이고 맨 앞에 고정한다(shelfOrder).
    inbox: tree.inbox === true,
    color: choice.color,
    accent: choice.accent,
    symbol: '✦',
    coverMedia: choice.coverMedia,
    coverCandidates,
    design: choice.design,
    lastDate: lastMomentDate(tree),
    description: tree.subject ? '좋아하는 대상 · ' + tree.subject : '좋아하는 대상을 기록한 책입니다.',
    tags: [tree.subject || '좋아하는 대상'],
    chapters: tree.moments.map((m) => {
      const cands = m.image ? (() => { const list = thumbnailCandidates(m, { autoLoad: true }); return list.length ? list : [m.image]; })() : [];
      return {
        title: m.title, url: m.externalUrl || m.url || '', mood: m.emotion, note: m.memo || m.whyNext || '',
        id: m.id, type: m.type, image: m.image || '', date: m.date || '', mediaMetadata: m.mediaMetadata || null,
        youtubeThumb: !!m.youtubeThumb, thumbCandidates: cands, treeId: tree.id,
      };
    })
  };
}

export const buildShelf = (library, palette, namer) => library.map((tree, index) => shelfBook(tree, index, palette, namer));

export const allBooks = (books, customBooks) => books.concat(customBooks);
export const findBook = (list, id) => list.find((book) => book.id === id);

export const coverStyle = (book) => '--cover:' + book.color + ';--cover-accent:' + book.accent + ';--tilt:' + ((book.id.length % 5) - 2) + 'deg;';

// #212: 표지 아래 정보 줄은 "순간 N개 · …" 하나만.
// 261118 대표 지적 5: 뒤쪽은 언제 담았는지를 쉰 말로 — '어제 추가'·'3일 전 추가'.
// 7일이 넘으면 날짜('11월 8일 추가')로 쓴다. '마지막 2026-11-13' 같은 기계 표기는 쓰지 않는다.
export function addedLabel(lastDate, now = new Date()) {
  if (!lastDate) return '';
  const [y, m, d] = String(lastDate).split('-').map(Number);
  if (!y || !m || !d) return '';
  const then = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - then) / 86400000);
  if (days <= 0) return '오늘 추가';
  if (days === 1) return '어제 추가';
  if (days <= 7) return days + '일 전 추가';
  return (then.getMonth() + 1) + '월 ' + then.getDate() + '일 추가';
}

export const bookMeta = (book, now) => {
  const label = addedLabel(book.lastDate, now);
  return book.chapters.length + '개 순간' + (label ? ' · ' + label : '');
};

export function filterShelf(books, filter, query) {
  const needle = String(query || '').trim().toLowerCase();
  return books.filter((book) => {
    const filterOk = filter === 'all' || book.category === filter;
    const queryOk = !needle || [book.name, book.description].concat(book.tags).concat(book.chapters.map((chapter) => chapter.title)).join(' ').toLowerCase().indexOf(needle) >= 0;
    return filterOk && queryOk;
  });
}

// 목록이 바뀌면 가운데 책을 다시 고른다: 고른 책이 남아 있으면 그 자리, 아니면 지금 자리를 목록 안으로 당긴다.
export function resolveShelfIndex(list, selectedId, shelfIndex) {
  if (!list.length) return 0;
  if (selectedId) {
    const selectedIndex = list.findIndex((book) => book.id === selectedId);
    if (selectedIndex >= 0) return selectedIndex;
  }
  return Math.max(0, Math.min(shelfIndex, list.length - 1));
}

// 레일 위 카드 배치(거리 → 좌표·배율·투명도). #212에서 중앙 카드를 위로 띄우지 않는다.
// 261118 대표 지적 2차: 옆 책도 설명 글자가 실제 크기(12px)로 읽혀야 하므로 배율·깊이 이동으로 글자를 줄이지 않는다.
// 책은 좌우 간격과 살짝 돌림·투명도로만 깊이를 내고, 4번째 이후 책도 투명도 0.6으로 남긴다.
// wide(넓은 화면, 레일 1800px 이상)에서는 흐림 기준을 ±2→±4로 완화한다(#서재-빈공간):
// 흐림 필터는 4칸까지 없고(선명 5권), 6칸까지는 누를 수 있다. 좌표·배율·돌림은 그대로다.
export function carouselTransform(distance, wide = false) {
  const absolute = Math.abs(distance);
  const x = distance * 200;
  if (wide) {
    const alpha = absolute === 0 ? 1 : absolute === 1 ? 0.9 : absolute === 2 ? 0.85 : absolute === 3 ? 0.8 : absolute === 4 ? 0.75 : 0.6;
    return {
      x, y: 0, z: 0,
      scale: absolute === 0 ? 1.06 : 1,
      rotate: distance === 0 ? 0 : distance > 0 ? -12 : 12,
      alpha,
      zIndex: 100 - absolute,
      pointerEvents: absolute > 6 ? 'none' : 'auto',
      filter: absolute > 4 ? 'saturate(.72) brightness(.86)' : 'none'
    };
  }
  return {
    x,
    y: 0,
    z: 0,
    scale: absolute === 0 ? 1.06 : 1,
    rotate: distance === 0 ? 0 : distance > 0 ? -12 : 12,
    alpha: absolute === 0 ? 1 : absolute === 1 ? 0.9 : absolute === 2 ? 0.8 : 0.6,
    zIndex: 100 - absolute,
    pointerEvents: absolute > 3 ? 'none' : 'auto',
    filter: absolute > 2 ? 'saturate(.72) brightness(.86)' : 'none'
  };
}

// 책 가로 배치 방식(#889 원래 결정, 11-19 대표 결정, #944 보완).
// 책이 한 줄에 다 들어가면 화면 폭과 무관하게 책장처럼 왼쪽 안쪽 여백부터 나란히 세운다.
// 다 안 들어가도 처음 위치는 같다 — 첫 책 왼쪽 끝을 책장 안쪽 여백에 맞추고,
// 좌우 화살표로 pitch만큼씩 밀어 넘긴다(고른 책을 가운데에 강제로 두지 않는다, #944).
// 좌표는 레일 가운데가 0. 카드 left:50% + translate(-50%)라서 --x=0이면 카드가 가운데에 온다.
// 첫 책 왼쪽 끝을 레일 왼쪽(책장 안쪽 여백)에 맞추려면 leftX = cardW/2 - railWidth/2.
export function shelfRowLayout(count, railWidth, { pitch = 200, cardW = 190, pad = 24, wideRail = 1760 } = {}) {
  const needed = (Math.max(count, 1) - 1) * pitch + cardW;
  const wide = railWidth >= wideRail;
  // 왼쪽 시작점은 책장 안쪽 여백이라 오른쪽 여백(pad)만 남기면 된다.
  const fits = needed + pad <= railWidth;
  const mode = fits ? 'row' : 'carousel';
  const leftX = cardW / 2 - railWidth / 2;
  // 레일에 끝까지 보이는 책 수: 마지막 카드 오른쪽 끝이 railWidth - pad 안에 들어와야 한다.
  const visible = Math.max(1, Math.floor((railWidth - pad - cardW) / pitch) + 1);
  const maxOffset = Math.max(0, count - visible);
  return {
    mode,
    wide,
    fits,
    leftX,
    visible,
    maxOffset,
    // offset은 왼쪽에서 밀어 낸 책 수. 다 들어가면 maxOffset이 0이라 늘 첫 책이 왼쪽 끝이다.
    xOf: (index, offset = 0) => leftX + (index - offset) * pitch,
    // 고른 책이 이미 보이면 그대로, 아니면 최소만 밀어 보이게 한다(가운데 정렬 금지).
    offsetFor: (index, current = 0) => {
      const at = Math.max(0, Math.min(maxOffset, current));
      if (index >= at && index < at + visible) return at;
      if (index < at) return Math.max(0, index);
      return Math.min(maxOffset, index - visible + 1);
    }
  };
}

// #1093 회전 보기 — git 기록 3b56d9f8(#839 직전)의 책장 회전 배치를 되살린다.
// 옛판은 고른 책을 가운데 두고 옆 책을 rotateY로 기울였지만, 일정 거리 밖 책은
// alpha·pointer-events로 숨겨 눌을 수 없었고 드래그마다 모든 카드에 스타일을 다시 썼다(끊김).
// 여기서는 모든 책을 끝까지 보이게 두고(가림 0), 누름마다 한 번만 좌표를 정한다.
export function shelfRotationLayout(count, railWidth, { pitch = 200, cardW = 190, pad = 24 } = {}) {
  const safeWidth = Math.max(railWidth || 0, cardW + pad);
  const maxCenter = Math.max(0, count - 1);
  return {
    pitch, cardW, safeWidth, maxCenter,
    // 고른 책이 레일 가운데에 온다. 좌표는 레일 가운데가 0.
    xOf: (index, center) => (index - center) * pitch,
    rotate: (index, center) => {
      const distance = index - center;
      return distance === 0 ? 0 : distance > 0 ? -22 : 22;
    },
    scale: (index, center) => index === center ? 1.06 : 1,
    depth: (index, center) => index === center ? 0 : -Math.abs(index - center) * 40,
    centerFor: (index, current = 0) => Math.max(0, Math.min(maxCenter, Number.isFinite(index) ? index : current))
  };
}

// #1366 ⑥: 고른 트리의 최근 순간 줄. 순간이 없으면 빈 줄을 만들지 않는다.
export function recentChapters(chapters = [], limit = 6) {
  return chapters.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, limit);
}

// 책 안 페이지 표시와 화살표 상태.
export function pageMeta(index, count) {
  return {
    counter: String(index + 1).padStart(2, '0') + ' / ' + String(count).padStart(2, '0'),
    prevDisabled: index === 0,
    nextDisabled: index === count - 1
  };
}

// 넘길 수 있는지: 없으면 -1/넘침은 그대로 알려 준다(문구는 화면이 정한다).
export function pageTarget(index, count, direction, forcedIndex) {
  const next = typeof forcedIndex === 'number' ? forcedIndex : index + direction;
  if (next < 0 || next >= count) return null;
  return next;
}

// #1059: 사본을 걷어내고 정본(youtube-id.mjs)을 부른다. describe 인자는 기존 규칙대로 먼저 본다.
export function youtubeId(url, describe) {
  const described = typeof describe === 'function' ? describe(String(url || '')) : null;
  if (described && described.kind === 'youtube') return described.videoId || '';
  return youtubeIdFrom(url, { allowThumbnail: false });
}

// 책 안 두 쪽(왼쪽=지난 장, 오른쪽=지금 장) 마크업. 문구·클래스 이름은 원본 그대로.
export function leftPageMarkup(book, index, esc = escapeShelf) {
        if(index===0)return '<span class="page-label">첫 마음 · '+esc(book.name)+'</span><div class="chapter-art"><span>'+esc(book.symbol)+'</span></div><span class="page-number">첫 순간</span>';
        var previous=book.chapters[index-1];
        return '<span class="page-label">PREVIOUS CHAPTER · '+String(index).padStart(2,'0')+'</span><h3>'+esc(previous.title)+'</h3><p>'+esc(previous.note)+'</p><span class="page-number">기록 경로 · '+String(index).padStart(2,'0')+'</span>';
      }
export function rightPageMarkup(book, index, esc = escapeShelf) {
        var chapter=book.chapters[index];
        var type=chapter.type||'photo';
        var label=({photo:'사진',video:'영상 예시',memo:'메모',link:'링크'})[type]||'순간';
        var writable=!(globalThis.LTDEMO&&globalThis.LTDEMO.readOnly);
        var momentShape={id:chapter.id,treeId:book.id,title:chapter.title,url:chapter.url||'',emotion:chapter.mood,date:chapter.date||'',note:chapter.note||'',mediaMetadata:chapter.mediaMetadata||null,youtubeThumb:!!chapter.youtubeThumb,type:type};
        var fallbackAttrs=chapter.image?thumbFallbackAttrs(momentShape,{candidates:chapter.thumbCandidates&&chapter.thumbCandidates.length?chapter.thumbCandidates:[chapter.image],writable:writable,variant:'shelf-page',momentId:chapter.id,treeId:book.id}):'';
        var art=chapter.image?'<img src="'+esc(chapter.image)+'"'+fallbackAttrs+' alt="" loading="lazy" referrerpolicy="no-referrer" />':(chapter.url?fallbackCardMarkup(momentShape,{writable:writable,variant:'shelf-page',momentId:chapter.id,treeId:book.id}):'<span class="poster-caption">기록해 둔 마음</span>');
        var info=(type==='video'&&!chapter.youtubeThumb&&!chapter.url)?'<span class="poster-caption">영상의 예시 이미지입니다</span>':'';
        return '<div class="page-video"><span class="page-label">순간 · '+String(index+1).padStart(2,'0')+' · '+esc(chapter.mood)+'</span><div class="video-holder"><div class="video-poster" data-lt-thumb-host>'+art+info+'</div></div><h3>'+esc(chapter.title)+'</h3><p>'+esc(chapter.note)+'</p><span class="poster-caption">'+esc(label)+' · 내 기록</span></div>';
      }

// ── 이어 읽기 칸(#256-1, 2026-11-09) ────────────────────────────────────────
// 마지막 위치는 새로 저장하지 않는다. 셸이 이미 저장·복원하는 계정 위치
// (selection-location.mjs의 `lovetree.v41.account-positions.v1`, shell/location.mjs의
// writeLocation → rememberAccountPosition)를 화면 진입 시 그대로 읽어 쓴다.
export const RESUME_ACTION = '이어 보기';
export const RESUME_COPY = { example: '예시 책 펼쳐 보기', first: '첫 책을 펼쳐 보세요' };

// 자동 제목이 메모의 마침표를 그대로 물려받아 "기록.까지 봤어요"가 되던 표시를 다듬는다.
// 저장 데이터는 바꾸지 않고 이 칸의 문구만 정리한다.
export const resumeName = (value) => String(value || '').trim().replace(/[.。!?！？]+$/u, '');

// 이어 보기 띠가 쓸 값. source: 'server'면 실제 기록(로그인), 그 외(예시·파일·공유)는 예시 칸으로 본다.
export function resumeCard({ source = 'server', treeId = '', momentId = '', books = [] } = {}) {
  if (source !== 'server') {
    const book = books[0] || null;
    const moment = book ? book.chapters[0] || null : null;
    return { kind: 'example', book, moment, treeName: book ? book.name : '', momentTitle: moment ? resumeName(moment.title) : '', title: RESUME_COPY.example, action: '펼쳐 보기' };
  }
  // 저장 위치의 트리가 지워졌으면 첫 책으로 대신 보여 준다(셸의 resolveAccountPosition과 같은 방향).
  const book = books.find((item) => item.id === treeId) || books[0] || null;
  if (!book) return { kind: 'first', book: null, moment: null, treeName: '', momentTitle: '', title: RESUME_COPY.first, action: '' };
  const moment = book.chapters.find((chapter) => chapter.id === momentId) || book.chapters[0] || null;
  return { kind: 'resume', book, moment, treeName: book.name, momentTitle: moment ? resumeName(moment.title) : '', title: '지난번 ' + resumeName(moment ? moment.title : book.name) + '까지 봤어요', action: RESUME_ACTION };
}
