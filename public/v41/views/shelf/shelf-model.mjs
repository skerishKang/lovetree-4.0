// 내 책장의 순수 계산 (#231 후속, 2026-11-09).
// views/shelf/shelf.js 안에 있던 계산을 화면(DOM) 없이 시험할 수 있게 그대로 옮겼다.
// 조건·문구·계산식 변경 0.
import { normalizeCoverDesign, coverDesignPaletteIndex } from '../../domain.mjs';

export const escapeShelf = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

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
export function coverChoice(tree, index, palette) {
  const color = palette[index % palette.length];
  const cover = tree.moments.find((moment) => moment.id === tree.coverMomentId);
  const coverMedia = cover && cover.type === 'photo' ? cover.image || '' : '';
  if (coverMedia) return { color, accent: color, coverMedia, design: '' };
  const design = normalizeCoverDesign(tree.coverDesign);
  if (design) {
    const designColor = palette[Math.max(0, coverDesignPaletteIndex(design)) % palette.length];
    return { color: designColor, accent: designColor, coverMedia: '', design };
  }
  return { color, accent: color, coverMedia: '', design: '' };
}

export function shelfBook(tree, index, palette, namer) {
  const choice = coverChoice(tree, index, palette);
  return {
    id: tree.id,
    name: treeTitleOf(tree.title, namer),
    subject: tree.subject || '',
    category: 'all',
    color: choice.color,
    accent: choice.accent,
    symbol: '✦',
    coverMedia: choice.coverMedia,
    design: choice.design,
    lastDate: lastMomentDate(tree),
    description: tree.subject ? '좋아하는 대상 · ' + tree.subject : '좋아하는 대상을 기록한 책입니다.',
    tags: [tree.subject || '좋아하는 대상'],
    chapters: tree.moments.map((m) => ({
      title: m.title, url: m.externalUrl || '', mood: m.emotion, note: m.memo || m.whyNext || '',
      id: m.id, type: m.type, image: m.image || ''
    }))
  };
}

export const buildShelf = (library, palette, namer) => library.map((tree, index) => shelfBook(tree, index, palette, namer));

export const allBooks = (books, customBooks) => books.concat(customBooks);
export const findBook = (list, id) => list.find((book) => book.id === id);

export const coverStyle = (book) => '--cover:' + book.color + ';--cover-accent:' + book.accent + ';--tilt:' + ((book.id.length % 5) - 2) + 'deg;';

// #212: 표지 아래 정보 줄은 "순간 N개 · 마지막 YYYY-MM-DD" 하나만.
export const bookMeta = (book) => book.chapters.length + '개 순간 · 마지막 ' + (book.lastDate || '-');

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

// 레일 위 카드 배치(거리 → 좌표·배율·투명도). #212에서 중앙 카드를 위로 띄우지 않고 살짝 내린다.
export function carouselTransform(distance) {
  const absolute = Math.abs(distance);
  const x = distance * 158 + (distance > 0 ? Math.min(absolute * 8, 22) : distance < 0 ? -Math.min(absolute * 8, 22) : 0);
  const scale = absolute === 0 ? 1.06 : absolute === 1 ? 0.82 : absolute === 2 ? 0.66 : 0.54;
  return {
    x,
    y: absolute === 0 ? 6 : Math.min(absolute * 8, 28),
    z: -absolute * 78,
    scale,
    rotate: distance === 0 ? 0 : distance > 0 ? -22 : 22,
    alpha: absolute === 0 ? 1 : absolute === 1 ? 0.9 : absolute === 2 ? 0.66 : absolute === 3 ? 0.28 : 0,
    zIndex: 100 - absolute,
    pointerEvents: absolute > 3 ? 'none' : 'auto',
    filter: absolute > 2 ? 'saturate(.72) brightness(.86)' : 'none'
  };
}

// 책 안 페이지 표시와 화살표 상태.
export function pageMeta(index, count) {
  return {
    counter: 'PAGE ' + String(index + 1).padStart(2, '0') + ' / ' + String(count).padStart(2, '0'),
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

// #256 2번: 책이 3권부터 책등을 목차처럼 한 줄로 세운다. 0~2권은 목차가 시끄러우니 숨긴다.
export const spineVisible = (count) => count >= 3;

// 책등 목차 항목: 책장 순서 그대로 한 줄에 세운다. 눈금마다 살짝 기울여 책장에 꽂힌 모양을 낸다.
export function spineItems(books) {
  return books.map((book, index) => ({ id: book.id, name: book.name, index, color: book.color, tilt: ((index % 3) - 1) * 2 }));
}

// 책등에 새울 모양(표지 색 변수 + 기울임). 실제 색값은 identity.css의 --lt-cover-N이 테마별로 정한다.
export const spineStyle = (item) => '--cover:' + item.color + ';--tilt:' + item.tilt + 'deg;';

// 책등을 눌렀을 때 아래 넘기기(레일)가 이동할 자리. 목차에 없는 책이면 -1(화면이 무시한다).
export const spineTargetIndex = (books, id) => books.findIndex((book) => book.id === id);

// 활성 책등을 목차 줄 가운데로 모는 가로 위치. 줄(row) 안에서만 자른다 —
// scrollIntoView와 달리 스크롤 가능한 조상(책장 문서·셸 부모 문서)을 움직이지 않게 하기 위한 계산(#256 2번 후속).
export function spineScrollLeft(rowClientWidth, rowScrollWidth, itemLeft, itemWidth) {
  const max = Math.max(0, rowScrollWidth - rowClientWidth);
  const ideal = itemLeft + itemWidth / 2 - rowClientWidth / 2;
  return Math.max(0, Math.min(ideal, max));
}

export function youtubeId(url, describe) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch (e) { return ''; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
  const hosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
  if (hosts.indexOf(parsed.hostname) < 0) return '';
  const described = typeof describe === 'function' ? describe(String(url || '')) : null;
  if (described && described.kind === 'youtube') return described.videoId || '';
  if (parsed.hostname === 'youtu.be') {
    const id1 = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return /^[A-Za-z0-9_-]{11}$/.test(id1) ? id1 : '';
  }
  if (parsed.pathname === '/watch') {
    const id2 = parsed.searchParams.get('v') || '';
    return /^[A-Za-z0-9_-]{11}$/.test(id2) ? id2 : '';
  }
  const match = parsed.pathname.match(/^\/(shorts|live|embed)\/([^/?#]+)/);
  return match && /^[A-Za-z0-9_-]{11}$/.test(match[2]) ? match[2] : '';
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
        var art=chapter.image?'<img src="'+esc(chapter.image)+'" alt="" loading="lazy" />':'<span class="poster-caption">기록해 둔 마음</span>';
        var info=type==='video'?'<span class="poster-caption">영상의 예시 이미지입니다</span>':'';
        return '<div class="page-video"><span class="page-label">순간 · '+String(index+1).padStart(2,'0')+' · '+esc(chapter.mood)+'</span><div class="video-holder"><div class="video-poster">'+art+info+'</div></div><h3>'+esc(chapter.title)+'</h3><p>'+esc(chapter.note)+'</p><span class="poster-caption">'+esc(label)+' · 내 기록</span></div>';
      }

// ── 이어 읽기 칸(#256-1, 2026-11-09) ────────────────────────────────────────
// 마지막 위치는 새로 저장하지 않는다. 셸이 이미 저장·복원하는 계정 위치
// (selection-location.mjs의 `lovetree.v41.account-positions.v1`, shell/location.mjs의
// writeLocation → rememberAccountPosition)를 화면 진입 시 그대로 읽어 쓴다.
export const RESUME_ACTION = '이어 보기';
export const RESUME_COPY = { example: '예시 책 펼쳐 보기', first: '첫 책을 펼쳐 보세요' };

// 자동 제목이 메모의 마침표를 그대로 물려받아 "기록.까지 봤어요"가 되던 표시를 다듬는다.
// 저장 데이터는 바꾸지 않고 이 칸의 문구만 정리한다.
const resumeName = (value) => String(value || '').trim().replace(/[.。!?！？]+$/u, '');

// source: 'server'면 실제 기록(로그인), 그 외(예시·파일·공유)는 예시 칸으로 본다.
export function resumeCard({ source = 'server', treeId = '', momentId = '', books = [] } = {}) {
  if (source !== 'server') {
    const book = books[0] || null;
    return { kind: 'example', book, moment: null, title: RESUME_COPY.example, action: '' };
  }
  // 저장 위치의 트리가 지워졌으면 첫 책으로 대신 보여 준다(셸의 resolveAccountPosition과 같은 방향).
  const book = books.find((item) => item.id === treeId) || books[0] || null;
  if (!book) return { kind: 'first', book: null, moment: null, title: RESUME_COPY.first, action: '' };
  const moment = book.chapters.find((chapter) => chapter.id === momentId) || book.chapters[0] || null;
  return { kind: 'resume', book, moment, title: '지난번 ' + resumeName(moment ? moment.title : book.name) + '까지 봤어요', action: RESUME_ACTION };
}
