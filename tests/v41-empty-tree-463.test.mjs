// #463(2026-11-13) — 트리 0개 계정의 빈 화면 문구·단추 강조와 '빈 트리 미리보기' 그림.
//
// CTO 지적(2026-11-12 18시): ① 첫 화면 문구가 다시 온 사람용("기억은 아직 여기에서 이어지고 있어요"),
// ② "감상 예시 · 내 기록에는 저장되지 않아요"가 모호, ③ 빈 화면에서 '예시 둘러보기'가 강조되고
// '첫 트리 만들기'는 덜 강조, ④ 빈 화면 바탕이 너무 비어 보인다(대표 결정: 점선 빈 카드 3장 + 금빛 실).
import {waitForShownScreen} from './helpers/visible-frame.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const workspaceRuntime = read('public/v41/shell/workspace-runtime.mjs');
const memberRuntime = read('public/v41/shell/member-runtime.mjs');
function emptyCopyBody() {
  const match = workspaceRuntime.match(/function\s+paintEmptyCopy\s*\(\s*\)\s*\{([\s\S]*?)^\s*\}/m);
  assert.ok(match, 'paintEmptyCopy 함수가 있어야 한다');
  return match[1];
}
const index = read('public/v41/index.html');
const identity = read('public/v41/identity.css');
const home = read('v41/home.js');

// ── ③ 빈 화면 문구·단추: 로그인(트리 0개)이면 '첫 트리 만들기'가 주 버튼 ──
test('#463 트리 0개 빈 화면 문구는 처음 온 사람용 한 줄이고, 예시 안내를 밝힌다', () => {
  const body = emptyCopyBody();
  assert.match(body, /좋아하는 영상 주소 하나면 시작돼요/, '처음 온 사람용 한 줄(#463 고칠 방향)');
  assert.match(body, /지금 보이는 카드는 예시예요/, '떠 있는 카드가 예시라는 것을 밝힌다');
  assert.doesNotMatch(body, /예시를 둘러보거나 첫 트리를 만들어 보세요/, '옛 문구(다시 온 사람용)가 남아 있지 않다');
});

test('#463 로그인(트리 0개)에서는 "＋ 첫 트리 만들기"가 주 버튼, "예시 둘러보기"는 보조', () => {
  const body = emptyCopyBody();
  assert.match(body, /\+ 첫 트리 만들기|＋ 첫 트리 만들기/, '로그인 상태의 단추 이름');
  // 주 버튼 표시는 계정 상태에 따라 뒤집힌다.
  assert.match(body, /\(\s*0\s*,\s*ctx\.\$\s*\)\s*\(\s*'empty-records'\s*\)\s*\.\s*classList\s*\.\s*toggle\s*\(\s*'primary'\s*,\s*owned\s*\)/, '첫 트리 만들기가 주 버튼');
  assert.match(body, /\(\s*0\s*,\s*ctx\.\$\s*\)\s*\(\s*'empty-sample'\s*\)\s*\.\s*classList\s*\.\s*toggle\s*\(\s*'primary'\s*,\s*!\s*owned\s*\)/, '예시 둘러보기는 보조');
});


test('#463 제목·강조는 상태 갱신에도 유지된다(단추 이름·주 버튼이 엇갈리지 않게)', () => {
  // refreshWrite 가 이름을 다시 쓰면 한 곳과 같은 글자여야 하고, 강조도 같이 유지되어야 한다.
  assert.match(emptyCopyBody(), /'empty-records'\s*\)\s*\.\s*textContent\s*=\s*owned\s*\?\s*'＋ 첫 트리 만들기'/);
  assert.match(memberRuntime, /'empty-records'\s*\)\s*\.\s*textContent\s*=\s*status\.writable\s*\?\s*'＋ 첫 트리 만들기'/, '상태 갱신에서도 이름이 같다');
  assert.match(memberRuntime, /'empty-records'\s*\)\s*\.\s*classList\s*\.\s*toggle\s*\(\s*'primary'\s*,\s*!!\s*status\.writable\s*\)/);
  assert.match(memberRuntime, /'empty-sample'\s*\)\s*\.\s*classList\s*\.\s*toggle\s*\(\s*'primary'\s*,\s*!\s*status\.writable\s*\)/);
});
test('#463 로그아웃 문구·단추는 지금 그대로 둔다(2026-11-07 방침)', () => {
  const body = emptyCopyBody();
  assert.match(body, /'다시 펼칠 순간을 기다리고 있어요\.'/, '로그아웃 제목 그대로');
  assert.match(body, /'예시를 둘러보거나 로그인한 계정의 기록을 불러오세요\.'/, '로그아웃 문구 그대로');
  assert.match(body, /'내 기록 불러오기'/, '로그아웃 단추 이름 그대로');
});

// ── 누르면 실제로 그 일이 되는지: 단추 id가 셸의 동작과 이어져 있는지 ──
// ── ① 첫 화면 문구: 261116 PR 2로 둘째 줄은 치워졌다 — 그 자리에 '+ 순간 추가' 단추가 온다 ──
test('#463 예시 카드 안내는 "예시"임을 밝힌다(모호한 옛 문구 제거)', () => {
  // #426 이후 둘째 줄은 안내 한 줄만 — 옛 '감상 예시 · 내 기록에는 저장되지 않아요'는 로그인 화면에서 쓰지 않는다.
  const loginPart = home.slice(home.indexOf('if(loggedIn){'), home.indexOf('const mobileFit='));
  assert.doesNotMatch(loginPart, /감상 예시 · 내 기록에는 저장되지 않아요/, '로그인 첫 화면에 모호한 옛 안내가 없다');
});

// ── ④ 빈 트리 미리보기 그림 ──
test('#463 빈 화면에 점선 빈 카드 3장과 금빛 실 그림이 있다', () => {
  const art = index.slice(index.indexOf('id="empty-tree-art"'), index.indexOf('<h1>', index.indexOf('id="empty-tree-art"')));
  assert.equal((art.match(/class="eta-card eta-card-\d"/g) || []).length, 6, '가로 3장 + 세로 3장(한 번에 하나만 보인다)');
  assert.match(art, /class="eta-thread"/, '금빛 실');
});

test('#463 그림은 장식 — 화면 읽기 프로그램에는 숨긴다', () => {
  // 두 SVG 모두 장식으로 선언한다(그림 자체는 낭독하지 않고 옆 문구가 내용을 나른다).
  const art = index.slice(index.indexOf('id="empty-tree-art"'), index.indexOf('<h1>', index.indexOf('id="empty-tree-art"')));
  const svgs = art.match(/<svg[^>]*>/g) || [];
  assert.ok(svgs.length >= 1, '그림 SVG가 있다');
  for (const tag of svgs) assert.match(tag, /role="presentation"/, '모든 SVG가 presentation');
  assert.doesNotMatch(art, /aria-label|<title>/, '읽어 줄 이름을 달지 않는다');
});

test('#463 움직임 줄이기 설정이면 반짝임을 멈춘다', () => {
  const reduced = identity.slice(identity.lastIndexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced, /\.eta-card-1\{animation:none/, '움직임 줄이기에서 애니메이션 없음');
});

test('#463 움직임은 CSS만 — 가만히 있을 때 화면 그리기 호출(rAF/setInterval) 0', () => {
  // JS로 애니메이션 고리를 돌리면 idle에서도 draw 호출이 남는다. 이 그림은 정적 SVG + CSS 애니메이션이다.
  const artMarkup = index.slice(index.indexOf('id="empty-tree-art"'), index.indexOf('<h1>', index.indexOf('id="empty-tree-art"')));
  assert.doesNotMatch(artMarkup, /<script/, '그림에 스크립트가 없다');
});

test('#463 모바일(390)은 세로 3장, 넓은 화면은 가로 3장 (가로 넘침 0)', () => {
  const mobile = identity.slice(identity.indexOf('@media(max-width:600px)'));
  assert.match(mobile, /\.eta-wide\{display:none\}/, '좁은 화면에서 가로를 숨긴다');
  assert.match(mobile, /\.eta-tall\{display:block\}/, '좁은 화면에서 세로를 보인다');
});

test('#463 흐림(blur)·반투명 겹침을 쓰지 않는다(2026-11-08 대표)', () => {
  const artBlock = identity.slice(identity.lastIndexOf('/* #463(2026-11-13): 트리 0개 빈 화면의'));
  assert.doesNotMatch(artBlock, /filter:blur|backdrop-filter/, '흐림 없음');
});

// ─── 이슈 970: 빈 화면(순간 0개)을 실제 화면에서 본다(390·1440) ───
// 로그인 계정에 순간이 0개(트리 0개)면 빈 안내와 다음 할 일 단추가 화면 안에 보이고,
// 단추를 누르면 맞는 창(첫 트리 만들기 여정)이 열린다. 운영 API·운영 계정 없이 가짜 작업장만 쓴다.
// LT_970_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패).
const REQUIRE970 = process.env.LT_970_REQUIRE === '1';
let chromium970, skip970 = false;
try {
  ({ chromium: chromium970 } = await import('playwright'));
  if (!existsSync(chromium970.executablePath())) skip970 = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip970 = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }

test('970 실행: 빈 화면(순간 0개) — 안내·단추가 화면 안에, 누르면 맞는 창', { skip: skip970 || !REQUIRE970 ? skip970 || 'LT_970_REQUIRE=1 일 때 실행' : false, timeout: 120000 }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium970.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      const state = { version: 1, trees: [], prefs: {} };
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      // 빈 안내는 기록 화면에서 보인다(홈은 예시 궤도를 보여 준다 — 261118 결정). 책 화면으로 들어간다.
      await page.goto(`${origin}/v41/?account=1#my/book`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => document.body.dataset.treeCount === '0' && !document.getElementById('empty')?.hidden, null, { timeout: 20000 });
      await page.locator('#discover-ask-no').click().catch(() => {});
      const m = await page.evaluate(() => {
        const rect = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
        const empty = document.getElementById('empty');
        const h1 = empty.querySelector('h1'), p = empty.querySelector('p');
        const btn = document.getElementById('empty-records');
        return {
          h1: h1.textContent.trim(), p: p.textContent.trim(),
          btnText: btn.textContent.trim(), btnPrimary: btn.classList.contains('primary'),
          btnShown: !btn.hidden && btn.getClientRects().length > 0,
          h1Rect: rect(h1), pRect: rect(p), btnRect: rect(btn),
          vw: innerWidth, vh: innerHeight
        };
      });
      assert.ok(m.h1.length > 0, `${width}: 빈 안내 제목이 있다`);
      assert.ok(m.p.length > 0, `${width}: 빈 안내 한 줄이 있다`);
      assert.equal(m.btnShown, true, `${width}: 다음 할 일 단추가 보인다`);
      assert.equal(m.btnPrimary, true, `${width}: 로그인 빈 화면에서는 주 단추로 강조`);
      const inside = (r) => r.l >= 0 && r.t >= 0 && r.r <= m.vw && r.b <= m.vh;
      assert.ok(inside(m.h1Rect), `${width}: 안내 제목이 화면 안(${JSON.stringify(m.h1Rect)})`);
      assert.ok(inside(m.pRect), `${width}: 안내 한 줄이 화면 안(${JSON.stringify(m.pRect)})`);
      assert.ok(inside(m.btnRect), `${width}: 다음 할 일 단추가 화면 안(${JSON.stringify(m.btnRect)})`);
      // 단추를 누르면 맞는 창이 열린다 — 트리 0개에서는 '첫 트리 만들기' 첫 여정 화면.
      // 첫 여정은 iframe을 location.replace로 연다(src 속성이 아니라 실제 주소로 판정).
      await page.click('#empty-records');
      await waitForShownScreen(page, {path: 'first-journey\\.html'}, 10000);
      assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), true, `${width}: 첫 여정이 열리면 빈 안내는 숨는다`);
      await ctx.close();
    }
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});
