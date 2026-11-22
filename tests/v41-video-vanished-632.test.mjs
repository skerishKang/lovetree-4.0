// #632: 사라진 영상(삭제·비공개) 감지·표시 시험.
// 동작은 함수 직접 호출로(video-status.mjs 분류·기억·요청, media-preview.js 표시), 마크업 속성·문구는
// 만들어진 결과물로 확인한다(docs/TESTING.md). 실제 응답 값(200/404/502)은 2026-11-15 유튜브·프록시 실측과 같다.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import '../public/v41/youtube-id.mjs'; // #1060: 정본 등록을 vm 시험에도 적용한다.
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 vm 에도 넣는다.
import {
  VIDEO_STATUS_TTL_MS,
  VIDEO_STATUS_CACHE_KEY,
  VIDEO_STATUS_CACHE_LIMIT,
  classifyOembedStatus,
  readVideoStatusCache,
  writeVideoStatusCache,
  fetchVideoStatus,
} from '../public/v41/video-status.mjs';

const HOUR = 60 * 60 * 1000;

// localStorage 대신 쓰는 작은 기억 장치(값은 어디에도 출력하지 않는다).
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    dump: () => Object.fromEntries(map)
  };
}

test('#666 분류: 200=정상, 404·400=없는 영상, 403=비공개, 401=임베드 금지, 5xx·응답 없음=unknown — 실측 응답 표', () => {
  // 실측(2026-11-15): 정상 200 / 삭제 404 / 비공개 403 / 임베드 금지 401 / 없는 id 400 — #666부터 서버가 유튜브 코드를 그대로 넘긴다.
  const rows = [
    [200, 'ok'],
    [404, 'gone'],
    [400, 'gone'], // 없는 영상 — 삭제와 같이 표시한다
    [403, 'private'], // 비공개 — 사라진 영상으로 표시(하루 기억하지 않는다)
    [401, 'noembed'], // 임베드 금지 — 사라진 영상으로 표시하지 않고 '유튜브에서 보기'로 안내
    [405, 'held'], // 답은 왔지만 판정하지 못하는 나머지
    [502, 'unknown'], // 5xx는 '사라졌다'고 말하지 않는다
    [500, 'unknown'],
    [503, 'unknown'],
    ['', 'unknown'], // 상태 코드가 없으면 답이 온 것이 아니다
    [undefined, 'unknown'],
    [0, 'unknown'],
  ];
  for (const [status, want] of rows) assert.equal(classifyOembedStatus(status), want, `status=${String(status)}`);
});

test('#632 기억: 확정 판정만 하루 기억하고, 보류(held)·응답 없음(unknown)은 기억하지 않는다', () => {
  const store = fakeStorage();
  assert.equal(writeVideoStatusCache(store, 'abc123DEF45', 'gone'), true);
  assert.equal(writeVideoStatusCache(store, 'kFenGaDfuI4', 'ok'), true);
  assert.equal(writeVideoStatusCache(store, 'yZIXLfi8CZQ', 'held'), false, '보류(held)는 기억하지 않는다');
  assert.equal(writeVideoStatusCache(store, '3xlegeyULX8', 'unknown'), false, '응답 없음도 기억하지 않는다');
  assert.equal(readVideoStatusCache(store, 'abc123DEF45'), 'gone');
  assert.equal(readVideoStatusCache(store, 'kFenGaDfuI4'), 'ok');
  assert.equal(readVideoStatusCache(store, '3xlegeyULX8'), null, '기억된 값이 없어 다시 묻는다');
  assert.equal(readVideoStatusCache(store, 'zzzzzzzzzzz'), null);
});

test('#632 기억: 하루가 지나면 다시 묻고, 새 판정이 오래된 판정을 바꾼다', () => {
  const store = fakeStorage();
  const base = 1_700_000_000_000;
  writeVideoStatusCache(store, 'abc123DEF45', 'gone', base);
  assert.equal(readVideoStatusCache(store, 'abc123DEF45', base + VIDEO_STATUS_TTL_MS - HOUR), 'gone', '23시간 뒤에도 기억');
  assert.equal(readVideoStatusCache(store, 'abc123DEF45', base + VIDEO_STATUS_TTL_MS + HOUR), null, '25시간 뒤에는 만료');
  writeVideoStatusCache(store, 'abc123DEF45', 'ok', base + VIDEO_STATUS_TTL_MS + HOUR);
  assert.equal(readVideoStatusCache(store, 'abc123DEF45', base + VIDEO_STATUS_TTL_MS + HOUR + 1), 'ok', '영상이 돌아오면 표시를 되돌린다');
});

test('#632 기억: 한도(500)를 넘치면 오래된 것부터 버리고, 깨진 값은 무시한다', () => {
  const store = fakeStorage();
  const base = 1_700_000_000_000;
  for (let i = 0; i < VIDEO_STATUS_CACHE_LIMIT; i += 1) {
    writeVideoStatusCache(store, `id${String(i).padStart(4, '0')}`, 'ok', base + i);
  }
  writeVideoStatusCache(store, 'abc123DEF45', 'gone', base + VIDEO_STATUS_CACHE_LIMIT);
  assert.equal(readVideoStatusCache(store, 'abc123DEF45', base + VIDEO_STATUS_CACHE_LIMIT), 'gone');
  assert.equal(readVideoStatusCache(store, 'id0000', base + VIDEO_STATUS_CACHE_LIMIT), null, '가장 오래된 값이 먼저 흘러 나간다');
  assert.equal(readVideoStatusCache(store, `id${String(VIDEO_STATUS_CACHE_LIMIT - 1).padStart(4, '0')}`, base + VIDEO_STATUS_CACHE_LIMIT), 'ok');
  const saved = JSON.parse(store.dump()[VIDEO_STATUS_CACHE_KEY]);
  assert.equal(Object.keys(saved).length, VIDEO_STATUS_CACHE_LIMIT);

  const broken = fakeStorage();
  broken.setItem(VIDEO_STATUS_CACHE_KEY, '{깨진 값');
  assert.equal(readVideoStatusCache(broken, 'abc123DEF45'), null);
  assert.equal(writeVideoStatusCache(broken, 'abc123DEF45', 'gone'), true, '깨진 값 위에서도 새로 기억한다');
  assert.equal(readVideoStatusCache(broken, 'abc123DEF45'), 'gone');

  assert.equal(readVideoStatusCache(null, 'abc123DEF45'), null);
  assert.equal(writeVideoStatusCache(null, 'abc123DEF45', 'gone'), false);
});

test('#632 요청: 프록시 주소는 한 벌(/api/youtube/oembed?v=), 답이 오면 코드별 판정, 응답이 없으면 unknown', async () => {
  const calls = [];
  const ok = await fetchVideoStatus('abc123DEF45', {
    fetchImpl: async (url, init) => {
      calls.push({ url, accept: init?.headers?.accept });
      return { status: 200 };
    }
  });
  assert.equal(ok, 'ok');
  assert.deepEqual(calls, [{ url: '/api/youtube/oembed?v=abc123DEF45', accept: 'application/json' }]);

  assert.equal(await fetchVideoStatus('R5mpcDWpYSA', { fetchImpl: async () => ({ status: 404 }) }), 'gone', '삭제');
  assert.equal(await fetchVideoStatus('yZIXLfi8CZQ', { fetchImpl: async () => ({ status: 403 }) }), 'private', '비공개 — #666부터 프록시가 403을 그대로 넘긴다');
  assert.equal(await fetchVideoStatus('aaaaaaaaaaa', { fetchImpl: async () => ({ status: 400 }) }), 'gone', '없는 영상은 삭제와 같이');
  assert.equal(await fetchVideoStatus('3xlegeyULX8', { fetchImpl: async () => ({ status: 401 }) }), 'noembed', '임베드 금지는 사라진 영상이 아니다');
  assert.equal(await fetchVideoStatus('abc123DEF45', { fetchImpl: async () => ({ status: 502 }) }), 'unknown', '5xx는 사라졌다고 말하지 않는다');
  assert.equal(await fetchVideoStatus('abc123DEF45', { fetchImpl: async () => { throw new Error('끊김'); } }), 'unknown', '응답이 없으면 사라졌다고 말하지 않는다');
  assert.equal(await fetchVideoStatus('', { fetchImpl: async () => ({ status: 200 }) }), 'unknown');
  // 시간 초과도 응답이 없는 것이다.
  assert.equal(await fetchVideoStatus('abc123DEF45', {
    // signal 을 지키는 호출자 흉내 — 끊긴 요청이 끝내지 못하면 응답 없음으로 끝나야 한다.
    fetchImpl: (url, init) => new Promise((resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('시간 초과'))); }),
    timeoutMs: 20
  }), 'unknown', '시간 초과는 응답 없음');
  // 기기가 오프라인이면 묻지도 않는다 — 응답 없음(unknown).
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    let asked = 0;
    const off = await fetchVideoStatus('abc123DEF45', { fetchImpl: async () => { asked += 1; return { status: 200 }; } });
    assert.equal(off, 'unknown', '오프라인에는 사라진 영상으로 세지 않는다');
    assert.equal(asked, 0, '오프라인에는 요청을 보내지 않는다');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    const on = await fetchVideoStatus('abc123DEF45', { fetchImpl: async () => { asked += 1; return { status: 200 }; } });
    assert.equal(on, 'ok', '온라인이면 다시 묻는다');
    assert.equal(asked, 1);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc);
  }
});

// media-preview.js 는 클래식 스크립트(IIFE)라 vm 으로 읽어 window.LTMedia 를 본다(기존 시험과 같은 방법).
// 바닥에 도는 화면 연결(document·MutationObserver·addEventListener)도 최소 흉내를 둔다 — #632 표시 기본 문서 경로 시험용.
// 창 이벤트(online 등)는 밖에서 누르게 기록해 둔다.
const listeners = [];
const docStub = {
  documentElement: {},
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (tag) => fakeNode(tag),
  createTextNode: (text) => ({ text: String(text) }),
  addEventListener: () => {}
};
const scope = {
  window: {}, URL, URLSearchParams, setTimeout, clearTimeout,
  LTYouTubeId: globalThis.LTYouTubeId, // #1060: 정본이 등록한 단계 주소 함수를 vm 에도 넣는다.
  LTEscapeHtml: globalThis.LTEscapeHtml, // A-15: 글자 막기 정본을 vm 에도 넣는다.
  document: docStub,
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  // 화면에 보이는 판정을 흉내 낸다 — 관찰하는 순간 보이는 것으로 알려 준다(online 재검사 시험용).
  IntersectionObserver: function (cb) {
    this.observe = (el) => cb([{ target: el, isIntersecting: true }], this);
    this.unobserve = () => {};
    this.disconnect = () => {};
  },
  addEventListener: (type, fn) => { listeners.push({ type, fn }); }
};
vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js', import.meta.url), 'utf8'), scope);
const media = scope.window.LTMedia;

const YT = 'https://www.youtube.com/watch?v=abc123DEF45';

test('#632 마크업: 내 기록(auto) YouTube 카드만 감지 표시(data-lt-auto)를 남긴다', () => {
  const mine = media.markup(YT, '바다 산책', null, 'm1', { source: 'server', owned: true });
  assert.match(mine, /data-lt-auto="1"/);
  assert.match(mine, /data-lt-youtube="1"/);
  assert.match(mine, /data-lt-play/);
  // 공유·예시·로그아웃·일반 링크는 감지를 청하지 않는다(#327 누르기 전 외부 요청 0 유지).
  for (const ctx of [{ source: 'share', owned: true }, { source: 'example', owned: true }, { source: 'server', owned: false }, undefined]) {
    const html = media.markup(YT, '제목', null, 'm1', ctx);
    assert.doesNotMatch(html, /data-lt-auto/, `ctx=${JSON.stringify(ctx)}`);
  }
  const link = media.markup('https://blog.example.com/post/1', '글', null, 'm1', { source: 'server', owned: true });
  assert.doesNotMatch(link, /data-lt-auto/, 'YouTube가 아닌 링크는 감지하지 않는다');
});

// applyVanished·checkVanished를 함수로 직접 부르기 위한 최소 가짜 문서(#632).
function fakeNode(tag) {
  const el = {
    tag,
    className: '',
    textContent: '',
    children: [],
    dataset: {},
    removed: false,
    isConnected: true,
    afterArgs: null,
    classList: {
      list: new Set(),
      add(...names) { for (const n of names) this.list.add(n); },
      remove(...names) { for (const n of names) this.list.delete(n); },
      contains(name) { return this.list.has(name); }
    },
    setAttribute(name, value) { el.attrs = { ...el.attrs, [name]: String(value) }; },
    append(...nodes) { el.children.push(...nodes); },
    remove() { el.removed = true; },
    after(...nodes) { el.afterArgs = nodes; }
  };
  return el;
}

function fakeDoc() {
  const created = [];
  return {
    created,
    createElement(tag) { const el = fakeNode(tag); created.push(el); return el; },
    createTextNode(text) { return { text: String(text) }; }
  };
}

function vanishedRoot({ withPlay = true, withStatus = true, withFallbackNotice = false, withFallback = true } = {}) {
  const root = fakeNode('div');
  root.dataset.ltUrl = YT;
  root.dataset.ltAuto = '1';
  const body = fakeNode('div');
  body.className = 'lt-media-body';
  const play = withPlay ? fakeNode('button') : null;
  if (play) play.dataset.ltPlay = '';
  const status = withStatus ? fakeNode('p') : null;
  if (status) status.className = 'lt-media-status';
  const notice = withFallbackNotice ? fakeNode('small') : null;
  if (notice) notice.className = 'lt-fallback-notice';
  const fb = withFallback ? fakeNode('div') : null;
  if (fb) fb.dataset.ltFallback = 'text';
  root.querySelectorAll = (selector) => {
    if (selector.includes('data-lt-play') || selector.includes('lt-media-toolbar') || selector.includes('lt-media-status') || selector.includes('lt-fallback-notice')) {
      return [play, status, notice].filter(Boolean);
    }
    if (selector === '.lt-media-body') return [body];
    return [];
  };
  root.querySelector = (selector) => {
    if (selector.includes('data-lt-fallback') || selector.includes('lt-fallback-notice')) return fb;
    if (selector === '.lt-media-body') return body;
    return null;
  };
  root.play = play;
  root.status = status;
  root.notice = notice;
  root.fallback = fb;
  root.body = body;
  return root;
}

test('#632 표시: 사라진 영상 칸은 재생·크게 보기·기존 안내를 치우고 배지와 안내를 놓는다', () => {
  const doc = fakeDoc();
  const root = vanishedRoot({ withFallbackNotice: true });
  media.applyVanished(root, doc);
  assert.equal(root.dataset.ltVanished, '1');
  assert.ok(root.classList.list.has('lt-media-vanished'));
  assert.equal(root.play.removed, true, '재생 단추는 치운다');
  assert.equal(root.status.removed, true, '재생 안내 줄은 치운다');
  assert.equal(root.notice.removed, true, '기존 안내(영상을 볼 수 없어요)는 겹치지 않게 치운다');
  const note = doc.created.find((el) => el.className === 'lt-media-vanished-note');
  assert.ok(note, '안내 한 줄');
  assert.equal(note.attrs.role, 'status');
  const badge = note.children[0];
  assert.equal(badge.className, 'lt-media-vanished-badge');
  assert.equal(badge.textContent, '사라진 영상');
  assert.match(note.children[1].text, /영상이 삭제되었거나 비공개예요/);
  assert.deepEqual(root.body.afterArgs, [note], '몸통 뒤에 놓인다');
  // 두 번 부르면 두 배로 놓지 않는다.
  media.applyVanished(root, doc);
  assert.equal(doc.created.filter((el) => el.className === 'lt-media-vanished-note').length, 1);
});

test('#632 표시: 썸네일이 실패한 카드만 묻고, gone·held는 표시(ok는 그대로), 썸네일이 살아 있으면 묻지 않는다', async () => {
  const fetches = [];
  const store = fakeStorage();
  media.setVideoStatusLoader(() => ({
    readVideoStatusCache: (s, id) => readVideoStatusCache(s, id),
    writeVideoStatusCache: (s, id, status) => writeVideoStatusCache(s, id, status),
    fetchVideoStatus: async (id) => {
      fetches.push(id);
      return id === 'R5mpcDWpYSA' ? 'gone' : id === 'kFenGaDfuI4' ? 'ok' : 'held';
    }
  }));
  try {
    // 삭제된 영상(썸네일 실패 + 프록시 404) — 표시까지 이어진다.
    const gone = vanishedRoot();
    gone.dataset.ltUrl = 'https://www.youtube.com/watch?v=R5mpcDWpYSA';
    await media.checkVanished(gone, { doc: fakeDoc(), store });
    assert.equal(gone.dataset.ltVanished, '1');
    assert.deepEqual(fetches, ['R5mpcDWpYSA']);
    assert.equal(readVideoStatusCache(store, 'R5mpcDWpYSA'), 'gone', '확정 판정은 기억된다');

    // 썸네일만 잠깐 실패한 정상 영상(프록시 200) — 표시를 바꾸지 않는다.
    fetches.length = 0;
    const fine = vanishedRoot();
    fine.dataset.ltUrl = 'https://www.youtube.com/watch?v=kFenGaDfuI4';
    await media.checkVanished(fine, { doc: fakeDoc(), store });
    assert.equal(fine.dataset.ltVanished, undefined);
    assert.equal(readVideoStatusCache(store, 'kFenGaDfuI4'), 'ok', '정상 판정도 기억된다');

    // 비공개(썸네일 실패 + 프록시 502 보류 held) — 썸네일 실패가 짝 신호이므로 표시한다(기억은 하지 않는다).
    const held = vanishedRoot();
    held.dataset.ltUrl = 'https://www.youtube.com/watch?v=yZIXLfi8CZQ';
    await media.checkVanished(held, { doc: fakeDoc(), store });
    assert.equal(held.dataset.ltVanished, '1');
    assert.equal(readVideoStatusCache(store, 'yZIXLfi8CZQ'), null, '보류(held)는 기억하지 않는다');

    // 썸네일이 살아 있는 카드(임베드 금지 — 영상이 아직 있음)는 묻지도 않는다.
    fetches.length = 0;
    const alive = vanishedRoot({ withFallback: false });
    alive.dataset.ltUrl = 'https://www.youtube.com/watch?v=3xlegeyULX8';
    await media.checkVanished(alive, { doc: fakeDoc(), store });
    assert.deepEqual(fetches, [], '썸네일이 살아 있으면 요청하지 않는다');
    assert.equal(alive.dataset.ltVanished, undefined);

    // 기억된 'gone'이면 요청 없이 바로 표시한다(화면을 열 때마다 다시 묻지 않는다).
    fetches.length = 0;
    const cached = vanishedRoot();
    cached.dataset.ltUrl = 'https://youtu.be/R5mpcDWpYSA';
    await media.checkVanished(cached, { doc: fakeDoc(), store });
    assert.deepEqual(fetches, [], '기억으로 판정한다');
    assert.equal(cached.dataset.ltVanished, '1');

    // YouTube가 아닌 칸은 검사하지 않는다.
    const notYt = vanishedRoot();
    notYt.dataset.ltUrl = 'https://blog.example.com/post/1';
    await media.checkVanished(notYt, { doc: fakeDoc(), store });
    assert.deepEqual(fetches, []);
    assert.equal(notYt.dataset.ltVanished, undefined);
  } finally {
    media.setVideoStatusLoader(null);
  }
});

test('#666 표시: 비공개(403)는 사라진 영상, 임베드 금지(401)는 유튜브에서 보기 안내, 없는 영상(400)은 삭제와 같이', async () => {
  const store = fakeStorage();
  const answers = { yZIXLfi8CZQ: 'private', '3xlegeyULX8': 'noembed', aaaaaaaaaaa: 'gone', dQw4w9WgXcQ: 'unknown' };
  media.setVideoStatusLoader(() => ({
    readVideoStatusCache: (s, id) => readVideoStatusCache(s, id),
    writeVideoStatusCache: (s, id, status) => writeVideoStatusCache(s, id, status),
    fetchVideoStatus: async (id) => answers[id] || 'unknown'
  }));
  try {
    // 비공개(403) — 사라진 영상으로 표시하되, 나중에 공개로 바뀔 수 있으니 기억하지 않는다.
    const priv = vanishedRoot();
    priv.dataset.ltUrl = 'https://www.youtube.com/watch?v=yZIXLfi8CZQ';
    await media.checkVanished(priv, { doc: fakeDoc(), store });
    assert.equal(priv.dataset.ltVanished, '1');
    assert.equal(readVideoStatusCache(store, 'yZIXLfi8CZQ'), null, '비공개는 하루 기억하지 않는다');

    // 임베드 금지(401) — 사라진 영상으로 표시하지 않고 '유튜브에서 보기'로 보낸다.
    const noembedDoc = fakeDoc();
    const noembed = vanishedRoot();
    noembed.dataset.ltUrl = 'https://www.youtube.com/watch?v=3xlegeyULX8';
    await media.checkVanished(noembed, { doc: noembedDoc, store });
    assert.equal(noembed.dataset.ltVanished, undefined, '임베드 금지는 사라진 영상이 아니다');
    assert.equal(noembed.classList.list.has('lt-media-noembed'), true);
    const note = noembedDoc.created.find((el) => el.className === 'lt-media-noembed-note');
    assert.ok(note, '안내 한 줄');
    assert.equal(note.attrs.role, 'status');
    const link = note.children[1];
    assert.equal(link.className, 'lt-media-noembed-link');
    assert.equal(link.textContent, '유튜브에서 보기');
    assert.equal(link.href, 'https://www.youtube.com/watch?v=3xlegeyULX8');
    assert.equal(link.target, '_blank');
    assert.match(note.children[0].text, /여기서 볼 수 없어요/);
    assert.deepEqual(noembed.body.afterArgs, [note], '몸통 뒤에 놓인다');
    assert.equal(readVideoStatusCache(store, '3xlegeyULX8'), null, '임베드 금지도 기억하지 않는다');

    // 없는 영상(400) — 삭제와 같이 표시하고 기억한다.
    const missing = vanishedRoot();
    missing.dataset.ltUrl = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
    await media.checkVanished(missing, { doc: fakeDoc(), store });
    assert.equal(missing.dataset.ltVanished, '1');
    assert.equal(readVideoStatusCache(store, 'aaaaaaaaaaa'), 'gone');

    // 5xx·응답 없음(unknown) — 표시를 바꾸지 않고 다시 묻도록 검사 표시를 지운다.
    const unknown = vanishedRoot();
    unknown.dataset.ltUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    await media.checkVanished(unknown, { doc: fakeDoc(), store });
    assert.equal(unknown.dataset.ltVanished, undefined);
    assert.equal(unknown.dataset.ltVanishedChecked, undefined);
    assert.equal(unknown.dataset.ltNoembed, undefined);
  } finally {
    media.setVideoStatusLoader(null);
  }
});

test('#632 표시: 응답이 없으면(unknown) 표시하지 않고, 검사 표시를 지워 다시 묻는다', async () => {
  const fetches = [];
  const store = fakeStorage();
  media.setVideoStatusLoader(() => ({
    readVideoStatusCache: (s, id) => readVideoStatusCache(s, id),
    writeVideoStatusCache: (s, id, status) => writeVideoStatusCache(s, id, status),
    fetchVideoStatus: async (id) => {
      fetches.push(id);
      return 'unknown';
    }
  }));
  try {
    // 지하철·기내 모드처럼 응답이 없으면 멀쩡한 영상을 사라진 영상으로 세지 않는다.
    const root = vanishedRoot();
    await media.checkVanished(root, { doc: fakeDoc(), store });
    assert.equal(root.dataset.ltVanished, undefined, '끊김은 사라진 영상이 아니다');
    assert.equal(root.dataset.ltVanishedChecked, undefined, '검사 표시를 지워 다시 묻는다');
    assert.equal(readVideoStatusCache(store, 'abc123DEF45'), null, '기억하지 않는다');
    // 검사 표시가 지워졌으니 다시 청하면 다시 묻는다(다시 보일 때·online 때와 같은 길).
    const before = fetches.length;
    media.scheduleVanishedCheck(root);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(fetches.length > before, '다시 검사한다');
  } finally {
    media.setVideoStatusLoader(null);
  }
});

test('#632 표시: unknown 뒤 online 이벤트가 오면 다시 검사한다', async () => {
  const fetches = [];
  media.setVideoStatusLoader(() => ({
    readVideoStatusCache: () => null,
    writeVideoStatusCache: () => {},
    fetchVideoStatus: async (id) => {
      fetches.push(id);
      return 'unknown';
    }
  }));
  const online = listeners.find((l) => l.type === 'online');
  assert.ok(online, '화면 연결이 online 이벤트를 듣는다');
  try {
    const root = vanishedRoot();
    await media.checkVanished(root, { doc: fakeDoc(), store: fakeStorage() });
    assert.equal(root.dataset.ltVanishedChecked, undefined, 'unknown은 검사 표시를 지운다');
    const before = fetches.length;
    // online → 300ms 뒤 watchVanished → 보이는 카드를 다시 청한다(화면 흉내가 카드를 내민다).
    docStub.querySelectorAll = (selector) => (selector.includes('data-lt-auto') ? [root] : []);
    online.fn();
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.ok(fetches.length > before, '연결이 돌아오면 다시 묻는다');
    assert.equal(root.dataset.ltVanished, undefined, '여전히 응답이 없으면 표시하지 않는다');
  } finally {
    docStub.querySelectorAll = () => [];
    media.setVideoStatusLoader(null);
  }
});

test('#632 표시: 시험 문서(doc)를 끼우지 않아도 기본 문서로 표시한다(null은 기본 값을 무효로 만들지 않는다)', async () => {
  const store = fakeStorage();
  writeVideoStatusCache(store, 'R5mpcDWpYSA', 'gone');
  media.setVideoStatusLoader(() => ({
    readVideoStatusCache: (s, id) => readVideoStatusCache(s, id),
    writeVideoStatusCache: () => {},
    fetchVideoStatus: async () => 'gone'
  }));
  try {
    const root = vanishedRoot();
    // hooks에 doc을 끼우지 않는다 — 운영에서는 이 경로로 불린다.
    await media.checkVanished(root, { store });
    assert.equal(root.dataset.ltVanished, '1');
    const note = root.body.afterArgs && root.body.afterArgs[0];
    assert.ok(note, '기본 문서로 안내를 놓는다');
    assert.equal(note.children[0].textContent, '사라진 영상');
  } finally {
    media.setVideoStatusLoader(null);
  }
});
