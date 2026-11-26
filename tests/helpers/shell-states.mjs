// 셸 공통 틀 화면 시험의 상태 준비(#1488): 가짜 계정·가짜 트리·공개 감상 응답으로 상태별 주소를 연다.
// 시험 계정·실제 사용자 기록은 쓰지 않는다. 영상 썸네일은 1px 그림, 영상 iframe은 막는다.
import { createTree, addMoment } from '../../public/v41/domain.mjs';

const T = '2026-11-20T00:00:00.000Z';
const YT = ['dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk', 'JGwWNGJdvx8'];
export const SHARE_ID = 'shell-states-share-0000001';
export const SCREEN_FILES = { shelf: 'track32-bookshelf.html', tree: 'track61-tree.html', board: 'track58-pinboard.html', book: 'track59-sketchbook.html', map: 'track56-network.html', home: 'src064-orbit.html' };
export const INNER_SCREENS = ['shelf', 'tree', 'board', 'book', 'map'];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export function fixtureTree() {
  let tree = createTree({ subject: '시험 트리', title: '공통 틀 시험 트리', note: '', emotion: '설렘', date: '2026-11-18', url: 'https://www.youtube.com/watch?v=' + YT[0] }, T);
  let parent = tree.moments[0].id;
  [['둘째 순간', '2026-11-17', YT[1]], ['셋째 순간', '2026-11-16', YT[2]], ['넷째 순간', '2026-11-15', YT[3]]].forEach(([title, date, id], i) => {
    tree = addMoment(tree, { title, note: '시험 메모 ' + (i + 1), emotion: '설렘', date, url: 'https://www.youtube.com/watch?v=' + id }, parent, T);
    parent = tree.moments.at(-1).id;
  });
  return { ...tree, inbox: false, createdAt: T, updatedAt: T, moments: tree.moments.map((m) => ({ ...m, createdAt: T, links: m.links || [] })) };
}

/** 상태 하나를 새 브라우저 맥락에서 연다. kind: member(로그인)·guest(로그아웃)·share(공개 감상 손님). */
export async function openShellState(browser, origin, { kind = 'member', screen = 'book', width = 1440, height = 900, theme = 'night', logoutNotice = false } = {}) {
  const tree = fixtureTree();
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.addInitScript(([t, ids, notice]) => {
    try {
      localStorage.setItem('lt41.theme', t);
      localStorage.setItem('lt41.boardTheme', t === 'garden' ? 'paper' : 'night');
      localStorage.setItem('lt41.discoverAsked', JSON.stringify(ids));
      if (notice) sessionStorage.setItem('lt41.logoutNotice', '1');
    } catch {}
  }, [theme, [tree.id], logoutNotice]);
  await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**://img.youtube.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**://www.youtube.com/**', (r) => r.abort());
  await ctx.route('**://www.youtube-nocookie.com/**', (r) => r.abort());
  await ctx.route('**/api/**', (r) => {
    const u = new URL(r.request().url());
    const json = (status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const member = kind === 'member';
    if (u.pathname === '/api/public/shares/' + SHARE_ID) return json(200, { ok: true, share: { id: SHARE_ID, view: 'book', entryMomentId: tree.moments[0].id }, tree });
    if (u.pathname === '/api/account') return member ? json(200, { ok: true, subject: 'shell-states-member', email: 'member@example.test' }) : json(401, { ok: false, error: { code: 'not_logged_in' } });
    if (u.pathname === '/api/workspace') return member ? json(200, { revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: 'shell-states-member', writeSubjectBound: true, savedAt: T }) : json(401, { ok: false, error: { code: 'not_logged_in' } });
    if (u.pathname.startsWith('/api/youtube/oembed')) return json(200, { title: '시험 영상', author_name: '시험 채널', thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg', width: 480, height: 270 });
    return json(200, { ok: true, items: [], shares: [] });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  const route = screen === 'map' ? 'network' : screen;
  let url;
  if (kind === 'share') url = origin + '/v41/#share/' + SHARE_ID + '/' + route;
  else if (screen === 'home') url = origin + '/v41/' + (kind === 'member' ? '?account=1' : '') + '#home';
  else url = origin + '/v41/' + (kind === 'member' ? '?account=1' : '') + '#my/' + route;
  await page.goto(url, { waitUntil: 'load' });
  if (kind === 'member') await page.waitForFunction(() => window.LT41?.source === 'server', null, { timeout: 20000 });
  if (kind === 'share') await page.waitForFunction(() => window.LT41?.source === 'share', null, { timeout: 20000 });
  if (kind === 'guest' && screen !== 'home') await page.waitForFunction(() => !!document.querySelector('#empty h1') && document.querySelector('#empty').getClientRects().length > 0, null, { timeout: 20000 });
  else await page.waitForFunction((f) => { const v = document.querySelector('#view'); const p = v?.contentWindow?.location?.pathname || ''; return !!v && !v.hidden && v.contentDocument?.readyState === 'complete' && (p.endsWith(f) || (f === 'src064-orbit.html' && p.endsWith('/home.html'))); }, SCREEN_FILES[screen], { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(900);
  return { ctx, page, errors, tree };
}

/** 보이는 요소의 셸 좌표 상자(소수 한 자리). 안 보이면 null. */
export const BOX_FN = function (selector) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el || !el.getClientRects().length) return null;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return null;
  const r = el.getBoundingClientRect();
  const f = (n) => Math.round(n * 10) / 10;
  return { x: f(r.left), y: f(r.top), r: f(r.right), b: f(r.bottom), w: f(r.width), h: f(r.height) };
};

/** 화면 iframe(#view) 안에서 보이는 단추·링크·입력과 글자를 가진 요소를 셸 좌표로 모은다(그림자 DOM 포함). */
export const FRAME_ITEMS_FN = function () {
  const out = [];
  const v = document.querySelector('#view');
  const doc = v?.contentDocument;
  if (!doc) return out;
  const fr = v.getBoundingClientRect();
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      const cs = el.ownerDocument.defaultView.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
      // 조상이 투명(opacity 0)·숨김이면 눈에 보이지 않는다 — 계산에서 뺀다.
      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const interactive = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!own && !interactive) continue;
      const x = fr.left + r.left, y = fr.top + r.top, right = fr.left + r.right, b = fr.top + r.bottom;
      if (b <= fr.top || y >= fr.bottom || right <= fr.left || x >= fr.right) continue;
      // 굴러가는 상자(실제로 넘쳐 스크롤되는 조상) 안의 내용인지 — 화면에 고정된 단추 줄·안내와 구분한다.
      let scroll = false;
      // 문서 전체(html·body)의 스크롤은 세지 않는다 — 요소 안의 실제 스크롤 상자(가로 목록·판)만 굴러가는 내용으로 본다.
      for (let n = el.parentElement; n && n !== n.ownerDocument.body && n !== n.ownerDocument.documentElement; n = n.parentElement) {
        const s = n.ownerDocument.defaultView.getComputedStyle(n);
        const sy = /auto|scroll/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1;
        const sx = /auto|scroll/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1;
        if (sy || sx) { scroll = true; break; }
      }
      out.push({ tag: el.tagName.toLowerCase(), interactive, scroll, fixed: cs.position === 'fixed' || cs.position === 'sticky', t: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), x, y, r: right, b });
    }
  };
  walk(doc);
  return out;
};

export const overlapArea = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
export const gapBetween = (a, b) => {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.r, b.r));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.b, b.b));
  return Math.round(Math.hypot(dx, dy) * 10) / 10;
};
