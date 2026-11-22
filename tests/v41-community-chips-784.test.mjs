// #784 그룹 찾기 창·검색 자동완성 — 설계(issuecomment-6985967913)의 시험 목록.
// 순수: 'ㅂㅌㅅㄴㄷ'→'방탄소년단' 먼저, 'riize'→'RIIZE', '방 탄'→'방탄소년단'(공백 무시), 섹션 순서 ㄱ이 첫.
// (설계 댓글의 'ㅂㅅㅅㄴㄷ' 예는 두 번째 초성(탄=ㅌ)이 잘못 적힌 것 — 실제 초성은 'ㅂㅌㅅㄴㄷ'이다.)
// 서버: groups(공개 트리 수 상위 8)·groupsAll(가나다순, 상한 200).
// 화면(1440·390): 창 열림 때 목록 항목 높이 ≥44px, 고른 그룹 칩이 1번(전체 칩 앞)·칩 8·줄 수 1,
// 자동완성 후보 1위 일치, Esc 닫힘·초점 복귀, 창 안 글자에 undefined·null·NaN 없음, 페이지 가로 넘침 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadStream, readFileSync } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { searchKey, choseong, matchGroups, sectionGroups } from '../public/v41/group-search.mjs';

// ── 순수 규칙 ──
test('#784 searchKey: 소문자 + 공백 제거 (서버 discover와 같은 규칙)', () => {
  assert.equal(searchKey('방 탄 소년 단'), '방탄소년단');
  assert.equal(searchKey('RIIze'), 'riize');
  assert.equal(searchKey('  NEW JEANS '), 'newjeans');
});

test('#784 choseong: 완성형 한글에서 초성만 뽑는다', () => {
  assert.equal(choseong('방탄소년단'), 'ㅂㅌㅅㄴㄷ');
  assert.equal(choseong('뉴진스'), 'ㄴㅈㅅ');
  assert.equal(choseong('RIIZE'), 'RIIZE');
});

const pool = [
  { group: '방탄소년단', count: 5 },
  { group: '뉴진스', count: 7 },
  { group: '아이브', count: 2 },
  { group: 'RIIZE', count: 3 },
  { group: '탄방소년', count: 1 },
];

test('#784 matchGroups: 초성 입력이 먼저 맞는다 (ㅂㅌㅅㄴㄷ → 방탄소년단)', () => {
  const out = matchGroups(pool, 'ㅂㅌㅅㄴㄷ');
  assert.equal(out[0].group, '방탄소년단');
});

test('#784 matchGroups: 대소문자·띄어쓰기를 무시한다', () => {
  assert.equal(matchGroups(pool, 'riize')[0].group, 'RIIZE');
  assert.equal(matchGroups(pool, 'RIIZE')[0].group, 'RIIZE');
  assert.equal(matchGroups(pool, '방 탄')[0].group, '방탄소년단');
  assert.equal(matchGroups(pool, '방탄소년단')[0].group, '방탄소년단');
});

test('#784 matchGroups: 시작 일치 > 포함 일치 > 초성 일치', () => {
  const prefix = matchGroups(pool, '탄방');
  assert.equal(prefix[0].group, '탄방소년', '시작 일치가 먼저다(탄방소년은 보내며 시작한다)');
  const includes = matchGroups(pool, '소년단');
  assert.equal(includes[0].group, '방탄소년단', '포함 일치는 시작 일치보다 뒤다');
  const jamo = matchGroups(pool, 'ㄴㅈㅅ');
  assert.equal(jamo[0].group, '뉴진스', '초성 일치는 마지막이다');
});

test('#784 sectionGroups: ㄱ이 첫(초성 순서), 영문 Latin 섹션은 뒤', () => {
  const sections = sectionGroups(pool);
  const labels = sections.map((s) => s.label);
  assert.equal(labels[0], 'ㄴ', '풀에 있는 가장 앞 초성은 뉴진스의 ㄴ');
  const rank = (v) => 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.indexOf(v);
  for (let i = 1; i < labels.length; i++) {
    const a = labels[i - 1], b = labels[i];
    assert.ok(rank(a) <= rank(b) || 'R' !== a, `초성 순서가 어긋남 ${a}→${b}`);
  }
  assert.ok(labels.includes('R'), '영문 섹션이 있다');
  assert.equal(sections.every((s) => s.items.length > 0), true, '빈 섹션은 내지 않는다');
});

// ── 서버: groups / groupsAll ──
import { createTree, editTree, addMoment } from '../src/domain.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createMemoryCommunityRepo } from '../server/testing/memory-community-repo.js';
import { createCommunityHandler, createCommunityService } from '../server/community-service.js';

const PRODUCT = 'lovetree-test', CLOCK = '2026-11-01T00:00:00.000Z';
const principal = (subjectId) => ({ productId: PRODUCT, subjectId });

async function groupSetup() {
  const workspaceRepo = createMemoryWorkspaceRepo();
  const workspace = createWorkspaceService({ repo: workspaceRepo, productId: PRODUCT });
  const trees = [];
  // 트리 문서 검증(invalid_document)을 어기지 않게 공식 생성자(createTree/addMoment)로 만든다.
  const mkTree = (i, keywords) => {
    let tree = createTree({ subject: '윤슬', title: '트이 ' + i, note: '다시 보고 싶은 빛', emotion: '설렘', date: '2026-11-01', url: 'https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg' }, CLOCK);
    tree = addMoment(tree, { type: 'note', note: '두 번째 순간' }, tree.moments[0].id, CLOCK);
    tree = addMoment(tree, { type: 'note', note: '세 번째 순간' }, tree.moments[0].id, CLOCK);
    tree = { ...tree, moments: tree.moments.map((m, j) => (j === 0 ? { ...m, keywords } : m)) };
    return tree;
  };
  // 방탄소년단은 두 트리, 아이브 뉴진스는 한 트리씩. 개수 = 공개 트리 수.
  trees.push(mkTree(1, ['가수:방탄소년단']));
  trees.push(mkTree(2, ['가수:방탄소년단']));
  trees.push(mkTree(3, ['가수:아이브']));
  trees.push(mkTree(4, ['가수:뉴진스']));
  // 내 꼬리표 표기 차이('IVE' 과 'Ive')는 하나로 묶이고, 첫 표기가 표시 이름이다.
  trees.push(mkTree(5, ['가수:IVE']));
  trees.push(mkTree(6, ['가수:Ive']));
  // #935: 채널 이름이 '가수' 꼬리표로 잘못 들어가 있어도 칩에는 오르지 않는다(저장 값은 그대로).
  trees.push(mkTree(7, ['가수:RIIZE Choreography']));
  trees.push(mkTree(8, ['가수:RIIZE Official']));
  await workspace.write(principal('alice'), { state: { version: 1, trees }, expectedRevision: 0, clientKey: 'seed-784' });
  const shareRepo = createMemoryShareRepo();
  const shares = [];
  for (const [i, tree] of trees.entries()) {
    const shareId = 's' + i.toString(36).repeat(23);
    let share = await shareRepo.create({ productId: PRODUCT, shareId, subjectId: 'alice', treeId: tree.id, entryMomentId: 'm0', view: 'book', momentCount: 3 });
    share = await shareRepo.setDiscoverable({ productId: PRODUCT, subjectId: 'alice', shareId: share.shareId, discoverable: true });
    shares.push(share);
  }
  const communityRepo = createMemoryCommunityRepo();
  communityRepo.seedShares(shares);
  let id = 0;
  const service = createCommunityService({ communityRepo, shareRepo, workspaceRepo, productId: PRODUCT, admin: { roleFor: async () => null }, makeId: () => String(++id).padStart(24, 'd'), now: () => Date.UTC(2026, 10, 1) });
  const authenticate = async (request) => { const subjectId = request.headers?.account; if (!subjectId) throw new Error('no account'); return principal(subjectId); };
  const handle = createCommunityHandler({ authenticate, service, productId: PRODUCT });
  const call = (path, query = '') => handle({ method: 'GET', path, query: new URLSearchParams(query), headers: { account: 'alice' }, body: '' });
  return { call };
}

test('#784 discover: groups는 공개 트리 수 상위 8, groupsAll는 가나다순·상한 200', async () => {
  const { call } = await groupSetup();
  const list = await call('/api/community/shares');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.groups), 'groups가 따라온다');
  assert.ok(Array.isArray(list.body.groupsAll), 'groupsAll가 따라온다');
  const names = list.body.groups.map((g) => g.value);
  assert.equal(names[0], '방탄소년단', '공개 트리 2개가 첫째다');
  assert.equal(list.body.groups[0].count, 2);
  assert.ok(list.body.groups.length <= 8);
  const allNames = list.body.groupsAll.map((g) => g.value);
  const sorted = [...allNames].sort((a, b) => a.localeCompare(b, 'ko'));
  assert.deepEqual(allNames, sorted, 'groupsAll는 가나다순이다');
  assert.ok(list.body.groupsAll.length <= 200);
  // #935: 채널 이름은 가수 칩에 0개 — 잘못 붙은 '가수' 꼬리표가 있어도 집계에서만 거른다.
  assert.equal(names.filter((value) => /Choreography|Official/i.test(value)).length, 0, '칩에 채널 이름 없음');
  assert.equal(allNames.filter((value) => /Choreography|Official/i.test(value)).length, 0, '찾기 창에도 채널 이름 없음');
  // 표기 차이(IVE/Ive)는 tagKey로 하나로 묶고, 첫 표기가 표시 이름이다.
  const ive = list.body.groupsAll.filter((g) => /^ive$/i.test(g.value));
  assert.equal(ive.length, 1);
  assert.equal(ive[0].value, 'IVE');
  assert.equal(ive[0].count, 2);
  // 카드 계산 속성(artistTags/artistTagValues/searchText)은 응답에 내보내지 않는다.
  const raw = JSON.stringify(list.body);
  assert.equal(raw.includes('artistTags'), false);
  assert.equal(raw.includes('artistTagValues'), false);
  assert.equal(raw.includes('searchText'), false);
});

// ── 화면 ──
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

let chromium, skipReason = null;
const REQUIRE = process.env.LT_COMMUNITY_784_REQUIRE === '1';
try {
  ({ chromium } = await import('playwright'));
} catch { skipReason = 'playwright 없음'; }
if (!skipReason) {
  try {
    const { existsSync } = await import('node:fs');
    if (!existsSync(chromium.executablePath())) skipReason = 'Chromium 없음';
  } catch { skipReason = 'Chromium 없음'; }
}
const testOrSkip = (name, fn) => test(name, { skip: skipReason || undefined }, fn);

const PROBE_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/v41/shell.css"><link rel="stylesheet" href="/v41/community.css"></head>
<body><main id="stage">
<button id="open-btn" type="button">둘러보기</button>
<dialog id="community-panel">
  <header><button data-close="community-panel" type="button">×</button></header>
  <form id="community-search-form">
    <label for="community-query">가수·노래·무대 찾기</label>
    <input id="community-query" type="search" maxlength="80" placeholder="가수·노래·무대 찾기" autocomplete="off">
    <label><span>정렬</span><select id="community-sort"><option value="newest">최신순</option><option value="popular">많이 담긴 순</option></select></label>
    <button type="submit">찾기</button>
  </form>
  <div class="community-group-rail"><div id="community-groups" role="group" aria-label="가수 그룹" tabindex="0"></div></div>
  <p id="community-feedback" role="status"></p>
  <section id="community-list" aria-live="polite"></section>
  <button id="community-more" type="button" hidden>다음 공개 트리 보기</button>
  <dialog id="community-preview"></dialog>
</dialog></main>
<script type="module">
import { mountCommunity } from '/v41/community-panel.mjs';
mountCommunity({
  button: document.getElementById('open-btn'),
  dialog: document.getElementById('community-panel'),
  onOpenShare: () => {}, onStartRecord: () => {}, onShareOwn: () => {},
  hasOwnTree: () => true,
  getArtistGroups: () => ['뉴진스', 'RIIZE'],
});
</script></body></html>`;

const GROUPS = [
  { value: '방탄소년단', count: 5 },
  { value: '뉴진스', count: 7 },
  { value: '아이브', count: 2 },
  { value: 'RIIZE', count: 3 },
  { value: '탄방소년', count: 1 },
];

testOrSkip('#784 화면: 창 열림 때 항목 높이 ≥44px / 고른 그룹 칩 1번 / 자동완성 1위 일치 / Esc·초점 복귀 / 가로 넘침 0', async () => {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/probe') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(PROBE_HTML); return; }
    const file = path.join(PUB, clean);
    try {
      const st = await stat(file);
      if (!st.isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.route('**/api/community/shares*', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null, totalVisible: 0, groups: GROUPS.slice(0, 3), groupsAll: GROUPS }),
    }));
    await page.goto(`http://127.0.0.1:${port}/probe`);
    await page.getByRole('button', { name: '둘러보기' }).click();
    await page.waitForSelector('#community-panel[open]');
    await page.waitForSelector('.community-group-find');
    await page.waitForTimeout(200);

    // 그룹 찾기 창 열기 — 둘러보기 창은 열린 채로 남는다(미리보기와 같은 집 안에서 열린다).
    await page.getByRole('button', { name: '그룹 찾기' }).click();
    await page.waitForSelector('dialog.community-group-find[open]');
    const panelStillOpen = await page.evaluate(() => document.getElementById('community-panel')?.open);
    assert.equal(panelStillOpen, true, '그룹 찾기 창이 열려도 둘러보기 창은 열린다');
    assert.ok((await page.locator('[role=option]').count()) >= 5, '그룹 목록이 뜬 두');
    for (const opt of await page.locator('[role=option]').all()) {
      const box = await opt.boundingBox();
      assert.ok(box && box.height >= 44, `항목 높이가 44 이상: ${box?.height}`);
    }
    const dialogText = await page.locator('dialog.community-group-find').innerText();
    assert.doesNotMatch(dialogText, /undefined|null|NaN/, '창 안에 undefined·null·NaN이 없다');

    // 목록에서 '방탄소년단'을 고른다 → 칩이 1번(전체 칩 앞)이 된다.
    await page.locator('[data-group-name="방탄소년단"]').click();
    await page.waitForSelector('dialog.community-group-find:not([open])', { timeout: 3000 }).catch(() => {});
    const chipLabels = await page.locator('#community-groups .community-group-chip').allTextContents();
    assert.ok(chipLabels.length <= 8, '칩은 최대 8개');
    assert.equal(chipLabels[0].trim(), '방탄소년단', '고른 그룹이 칩 1번');
    assert.equal(chipLabels[1].trim(), '전체', '전체 칩은 2번');
    const chipTops = await page.evaluate(() => [...document.querySelectorAll('#community-groups .community-group-chip')].map((c) => Math.round(c.getBoundingClientRect().top)));
    assert.ok(chipTops.every((t) => t === chipTops[0]), '칩은 한 줄이다');

    // 자동완성: 검색칸에 '방 탄'을 치면 후보 1위가 방탄소년단 — 공백을 무시한다.
    await page.locator('#community-query').click();
    await page.locator('#community-query').fill('방 탄');
    await page.waitForSelector('#community-suggest .community-suggest-option', { timeout: 3000 });
    const firstOption = (await page.locator('#community-suggest .community-suggest-option').first().innerText()).trim();
    assert.match(firstOption, /방탄소년단/, '자동완성 후보 1위가 맞다');
    await page.locator('#community-suggest .community-suggest-option').first().click();
    await page.waitForTimeout(200);
    const chipsAfter = await page.locator('#community-groups .community-group-chip').allTextContents();
    assert.equal(chipsAfter[0].trim(), '방탄소년단', '후보 선택도 칩 1번');

    // Esc로 창을 닫으면 초점이 그룹 찾기 단추로 돌아온다.
    await page.getByRole('button', { name: '그룹 찾기' }).click();
    await page.waitForSelector('dialog.community-group-find[open]');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const activeIsFindButton = await page.evaluate(() => document.activeElement?.textContent?.trim() === '그룹 찾기');
    assert.ok(activeIsFindButton, 'Esc 뒤 초점이 그룹 찾기 단추로 돌아온다');

    // 390 폭에서도 같은 규칙 + 가로 넘침 0.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: '그룹 찾기' }).click();
    await page.waitForSelector('dialog.community-group-find[open]');
    for (const opt of await page.locator('[role=option]').all()) {
      assert.ok((await opt.boundingBox())?.height >= 44, '휴대폰에서도 항목 높이 44 이상');
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(overflow <= 1, true, `가로 넘침 0: ${overflow}`);
    await page.keyboard.press('Escape');
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

// #792 4단계 ⑤: 둘러보기의 '이번 주 인기 무대' 줄과 미리보기의 '이 무대 담기'.
// 숫자로만 판정한다: 3표 미만 행 제외, null 숫자 없음, 단추 44px, 안내는 단추 바로 아래(≤12px),
// 가로 넘침 0, 7일 안내 문구는 화면에 한 번만.
const STAGE_POPULAR = [
  { stageId: 'stage-a', platform: 'youtube', videoId: 'popularOne', kind: 'video', title: '이번 주 인기 무대 하나', weeklyVoters: 7, publicTreeCount: 4 },
  { stageId: 'stage-b', platform: 'youtube', videoId: 'popularTwo', kind: 'video', title: '표가 모자란 무대', weeklyVoters: null, publicTreeCount: 2 },
];
const STAGE_CARDS = [{
  shareId: 'c0000000000000000000000b', title: '무대 있는 공개 트리', subject: '확인 대상', summary: '첫 순간 소개',
  createdAt: '2026-11-18T09:00:00.000Z', momentCount: 3, emotions: ['설렘'],
  cover: { momentId: 'm-cover', url: '', title: 'Super Shy', emotion: '설렘', type: 'youtube' },
  stats: { favorites: 0, hearts: 0, favored: false, hearted: false, reactions: { heart: 0, like: 0, love: 0, laugh: 0, wow: 0, sad: 0, angry: 0 }, mine: [] },
}];

testOrSkip('#792 ⑤ 화면: 인기 무대 줄(3표 미만 제외)과 미리보기 담기 단추(44px·안내 한 줄·가로 넘침 0)', async () => {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/probe') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(PROBE_HTML); return; }
    const file = path.join(PUB, clean);
    try {
      const st = await stat(file);
      if (!st.isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const json = (body) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  try {
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (url.includes('/api/community/stages/popular')) return route.fulfill(json({ weekStart: '2026-11-16', weekEndExclusive: '2026-11-23', items: STAGE_POPULAR }));
      if (/\/moments\/[^/]+\/stage$/.test(url)) return route.fulfill(json({ stageId: 'stage-a' }));
      if (/\/stages\/[^/]+\/vote$/.test(url)) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'vote_too_new', message: '가입하고 7일이 지나면 투표할 수 있어요.' } }) });
      if (/\/api\/community\/stages\/[^/]+$/.test(url)) return route.fulfill(json({ stageId: 'stage-a', title: 'Super Shy', voted: false, saved: false, weeklyVoters: 5, publicTreeCount: 4, trees: [], nextCursor: null }));
      if (url.includes('/api/community/shares')) return route.fulfill(json({ items: STAGE_CARDS, nextCursor: null, totalVisible: 1, groups: [], groupsAll: [] }));
      return route.fulfill(json({ ok: true, items: [] }));
    });
    await page.goto(`http://127.0.0.1:${port}/probe`);
    await page.getByRole('button', { name: '둘러보기' }).click();
    await page.waitForSelector('#community-panel[open]');
    await page.waitForSelector('.community-stage', { timeout: 5000 });

    const row = await page.evaluate(() => {
      const popular = document.getElementById('community-popular-stages');
      const rows = [...document.querySelectorAll('.community-stage')];
      const heading = document.querySelector('#community-panel .panel-heading, #community-panel h2');
      const form = document.getElementById('community-search-form');
      return {
        exists: Boolean(popular),
        rows: rows.length,
        text: popular?.innerText || '',
        hasNull: /undefined|null|NaN/.test(popular?.innerText || ''),
        belowTitle: heading ? Math.round(popular.getBoundingClientRect().top - heading.getBoundingClientRect().bottom) : -999,
        aboveForm: form ? Math.round(form.getBoundingClientRect().top - popular.getBoundingClientRect().bottom) : -999,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(row.exists, true, '인기 무대 줄이 있다');
    assert.equal(row.rows, 1, '3표 미만 행은 그리지 않는다');
    assert.match(row.text, /이번 주 인기 무대/);
    assert.match(row.text, /이번 주 담은 사람 7/);
    assert.equal(row.hasNull, false, 'null·undefined·NaN이 없다');
    assert.ok(row.belowTitle >= -1, `인기 무대 줄은 제목 아래에 있다(${row.belowTitle}px)`);
    assert.ok(row.aboveForm >= -1, `검색칸 위에 있다(${row.aboveForm}px)`);
    assert.ok(row.overflow <= 1, `가로 넘침 0: ${row.overflow}`);

    // 미리보기: 표지 순간이 공개 무대면 '이 무대 담기'가 즐겨찾기 옆에 선다.
    await page.locator('.community-card').first().click();
    await page.waitForSelector('#community-preview[open]');
    await page.waitForSelector('#community-preview .community-stage-vote', { timeout: 5000 });
    const measure = () => page.evaluate(() => {
      const button = document.querySelector('#community-preview .community-stage-vote');
      const favorite = document.querySelector('#community-preview [data-community-action="favorite"]');
      const box = (node) => node.getBoundingClientRect();
      return {
        text: button.textContent.trim(),
        pressed: button.getAttribute('aria-pressed'),
        height: Math.round(box(button).height),
        rowDelta: Math.round(box(button).top - box(favorite).top),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    const desktop = await measure();
    assert.equal(desktop.text, '이 무대 담기');
    assert.equal(desktop.pressed, 'false');
    assert.ok(desktop.height >= 44, `담기 단추 높이 44 이상: ${desktop.height}`);
    assert.ok(Math.abs(desktop.rowDelta) <= 4, `즐겨찾기와 같은 줄에 있다(차이 ${desktop.rowDelta}px)`);

    await page.locator('#community-preview .community-stage-vote').click();
    await page.waitForFunction(() => {
      const note = document.querySelector('#community-preview .community-stage-note');
      return Boolean(note && !note.hidden && note.textContent.trim());
    }, null, { timeout: 5000 });
    const blocked = await page.evaluate(() => {
      const note = document.querySelector('#community-preview .community-stage-note');
      const button = document.querySelector('#community-preview .community-stage-vote');
      const texts = [...document.querySelectorAll('#community-preview *')].filter((node) => node.children.length === 0 && node.textContent.includes('가입하고 7일')).length;
      return { gap: Math.round(note.getBoundingClientRect().top - button.getBoundingClientRect().bottom), text: note.textContent.trim(), noticeCount: texts };
    });
    assert.equal(blocked.text, '가입하고 7일이 지나면 투표할 수 있어요.');
    assert.equal(blocked.noticeCount, 1, '미리보기 안에 7일 안내는 하나다');
    assert.ok(blocked.gap >= -1 && blocked.gap <= 12, `안내가 담기 단추 바로 아래(${blocked.gap}px ≤ 12px)`);

    // 390에서도 같은 규칙 + 가로 넘침 0.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const mobile = await measure();
    assert.ok(mobile.height >= 44, `휴대폰 담기 단추 높이 44 이상: ${mobile.height}`);
    assert.ok(mobile.overflow <= 1, `휴대폰 가로 넘침 0: ${mobile.overflow}`);
    const mobileRowOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(mobileRowOverflow <= 1, `휴대폰 인기 무대 줄 가로 넘침 0: ${mobileRowOverflow}`);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

// #1098 1단계 시험 — 반응·댓글 수가 겉에 보이는 공개 트리 하나(댓글 5개). 작성자 이름은 서버가 내리는 표시 라벨만 흉내 낸다.
const COUNTS_CARDS = [{
  shareId: 'r000000000000000000000a', title: '반응·댓글 있는 공개 트리', subject: '확인 대상', summary: '첫 순간 소개',
  createdAt: '2026-11-20T09:00:00.000Z', momentCount: 3, emotions: ['설렘'],
  cover: { momentId: 'm-cover-1098', url: '', title: '첫 순간', emotion: '설렘' },
  stats: { favorites: 0, hearts: 5, favored: false, hearted: false, comments: 5,
           reactions: { heart: 5, like: 1, love: 1, laugh: 0, wow: 0, sad: 0, angry: 0 }, mine: [] },
}];
const COUNTS_COMMENTS = [1, 2, 3, 4, 5].map((n) => ({
  id: `c1098-${n}`, authorLabel: `팬 ${n}`, body: `${n}번째 댓글`, createdAt: `2026-11-20T${String(9 + n).padStart(2, '0')}:00:00.000Z`,
  edited: false, canEdit: false, canDelete: false,
}));

async function openCountsPreview(page, port) {
  await page.goto(`http://127.0.0.1:${port}/probe`);
  await page.getByRole('button', { name: '둘러보기' }).click();
  await page.waitForSelector('#community-panel[open]');
  await page.locator('.community-card').first().click();
  await page.waitForSelector('#community-preview[open]');
  await page.waitForSelector('#community-preview .community-comment', { timeout: 5000 });
}

testOrSkip('#1098 1단계: 판 아래에 최근 댓글 3개·댓글 모두 보기 — ⋯에는 신고·차단만, 겉에 반응 수·댓글 수', async () => {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/probe') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(PROBE_HTML); return; }
    const file = path.join(PUB, clean);
    try {
      const st = await stat(file);
      if (!st.isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const json = (body) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  try {
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (/\/comments$/.test(url)) return route.fulfill(json({ comments: COUNTS_COMMENTS }));
      if (url.includes('/api/community/shares')) return route.fulfill(json({ items: COUNTS_CARDS, nextCursor: null, totalVisible: 1, groups: [], groupsAll: [] }));
      return route.fulfill(json({ ok: true, items: [] }));
    });
    await openCountsPreview(page, port);
    const state = await page.evaluate(() => {
      const preview = document.getElementById('community-preview');
      const host = preview.querySelector('.community-comment-host');
      const panel = preview.querySelector('.community-more-panel');
      return {
        metaText: preview.querySelector('.community-preview-meta')?.textContent || '',
        heading: preview.querySelector('.community-preview-comments .community-menu-title')?.textContent || '',
        articles: host.querySelectorAll('.community-comment').length,
        firstBody: host.querySelector('.community-comment p')?.textContent || '',
        hasMore: [...host.querySelectorAll('button')].some((b) => b.textContent.includes('댓글 모두 보기')),
        menuLabel: preview.querySelector('.community-more-menu summary')?.getAttribute('aria-label') || '',
        menuHasReport: Boolean(panel?.querySelector('.community-report-form')),
        menuHasComment: Boolean(panel?.querySelector('.community-comment, .community-comment-host')),
        heartCount: preview.querySelector('[data-reaction-kind="heart"]')?.textContent.trim() || '',
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(state.articles, 3, `판 아래에는 최근 댓글 3개만: ${state.articles}`);
    assert.equal(state.firstBody, '1번째 댓글', '최신 댓글부터');
    assert.equal(state.hasMore, true, '댓글 모두 보기 단추가 있다');
    assert.doesNotMatch(state.metaText, /반응/, '한 줄 정보에는 반응 수를 두지 않는다(반응 수는 ♡ 단추 한 곳)');
    assert.match(state.metaText, /댓글 5/, '겉에 댓글 수가 보인다');
    assert.equal(state.heading, '댓글 5', '댓글 줄 머리글에도 수가 있다');
    assert.equal(state.heartCount, '7', '♡ 단추에 반응 전체 수가 보인다(공감 5+좋아요 1+사랑 1)');
    assert.equal(state.menuLabel, '신고, 차단 메뉴', '⋯ 메뉴는 신고·차단만');
    assert.equal(state.menuHasReport, true, '⋯ 안에 신고가 남는다');
    assert.equal(state.menuHasComment, false, '⋯ 안에는 댓글이 없다');
    assert.ok(state.overflow <= 1, `1440 가로 넉침 0: ${state.overflow}`);
    await page.getByRole('button', { name: '댓글 모두 보기' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#community-preview .community-comment').length === 5, null, { timeout: 3000 });
    // 390에서도 겉 숫자·판 아래 댓글이 한 줄 안넘치게.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, meta: document.querySelector('#community-preview .community-preview-meta')?.textContent || '' }));
    assert.ok(mobile.overflow <= 1, `390 가로 넉침 0: ${mobile.overflow}`);
    assert.match(mobile.meta, /댓글 5/);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

testOrSkip('#1098 1단계: ♡는 크게 하나 — 빠르게 누르면 공감 토글, 길게 누르면 일곱 종 칩(#678 펼침 규칙 재사용)', async () => {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/probe') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(PROBE_HTML); return; }
    const file = path.join(PUB, clean);
    try {
      const st = await stat(file);
      if (!st.isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const json = (body) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  let reactionBody = '';
  try {
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (/\/comments$/.test(url)) return route.fulfill(json({ comments: COUNTS_COMMENTS }));
      if (/\/reaction$/.test(url)) { reactionBody = route.request().postData() || ''; return route.fulfill(json({ stats: { ...COUNTS_CARDS[0].stats, hearted: true, mine: ['heart'], reactions: { heart: 6, like: 1, love: 1, laugh: 0, wow: 0, sad: 0, angry: 0 } } })); }
      if (url.includes('/api/community/shares')) return route.fulfill(json({ items: COUNTS_CARDS, nextCursor: null, totalVisible: 1, groups: [], groupsAll: [] }));
      return route.fulfill(json({ ok: true, items: [] }));
    });
    await openCountsPreview(page, port);
    const before = await page.evaluate(() => {
      const group = document.querySelector('#community-preview .community-reaction-group');
      const heart = group?.querySelector('[data-reaction-kind="heart"]');
      return {
        chips: group ? group.querySelectorAll('.community-reaction').length : 0,
        pressed: heart?.getAttribute('aria-pressed') || '',
        label: heart?.getAttribute('aria-label') || '',
        height: heart ? Math.round(heart.getBoundingClientRect().height) : 0,
        favHeight: (() => { const fav = document.querySelector('#community-preview [data-community-action="favorite"]'); return fav ? Math.round(fav.getBoundingClientRect().height) : 0; })(),
      };
    });
    assert.equal(before.chips, 1, '기본에는 ♡ 하나만 선다');
    assert.equal(before.pressed, 'false');
    assert.equal(before.label, '공감 · 반응 7', '♡ 단추 이름에 반응 전체 수가 들어간다');
    assert.ok(before.height >= 44, `누르는 자리 44px 이상: ${before.height}`);
    assert.ok(before.height > before.favHeight, `♡가 즐겨찾기보다 크다: ♡ ${before.height} > 즐겨찾기 ${before.favHeight}`);
    // 빠르게 누르면 공감(heart) 토글 한 번.
    await page.locator('#community-preview [data-reaction-kind="heart"]').click();
    await page.waitForFunction(() => document.querySelector('#community-preview [data-reaction-kind="heart"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 3000 });
    assert.equal(reactionBody.includes('"heart"'), true, `누른 것은 공감: ${reactionBody}`);
    // 길게 누르면(0.45초) 일곱 종 칩으로 펼쳐진다.
    const box = await page.locator('#community-preview [data-reaction-kind="heart"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelectorAll('#community-preview .community-reaction').length === 7, null, { timeout: 3000 });
    await page.mouse.up();
    const kinds = await page.evaluate(() => [...document.querySelectorAll('#community-preview .community-reaction')].map((b) => b.dataset.reactionKind).sort());
    assert.deepEqual(kinds, ['angry', 'heart', 'laugh', 'like', 'love', 'sad', 'wow'], '일곱 종이 모두 펼쳐진다');
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

// #1098 2단계: 판의 순간 목록 — 판 위쪽은 트리 숫자(1단계)를 유지하고, 목록의 순간 카드는 그 순간의 ♡·댓글 수를 보인다.
// ♡ 누르기·댓글 쓰기는 순간 단위 API(서버 #1136), AI 명예회원 댓글은 트리 작성자 표시와 같은 방식으로 구분,
// 막히면(횟수 제한 모의) 서버 응답 안내를 그대로 보여 주고 눌림 표시를 되돌려 화면이 깨지지 않게 한다.
// 로그인 없이 모의 응답만 쓴다(실제 계정·비밀값 미사용).
const MOMENT_TARGETS = { share: { shareId: 'r000000000000000000000a', treeId: 't-1098-2' }, tree: { id: 't-1098-2', title: '반응·댓글 있는 공개 트리', moments: [
  { id: 'm-1098-2-1', title: '첫 순간', date: '2026-11-01', emotion: '설렘' },
  { id: 'm-1098-2-2', title: '둘째 순간', date: '2026-11-02', emotion: '설렘' },
  { id: 'm-1098-2-3', title: '셋째 순간', date: '2026-11-03', emotion: '설렘' },
] } };
const MOMENT_STATS = {
  'm-1098-2-1': { hearts: 7, aiHearts: 2, comments: 4, hearted: false },
  'm-1098-2-2': { hearts: 1, aiHearts: 0, comments: 0, hearted: false },
  'm-1098-2-3': { hearts: 4, aiHearts: 0, comments: 2, hearted: true },
};
const MOMENT_COMMENTS = [
  { id: 'mc-1', authorLabel: '기록한 사람', body: '이 순간을 처음 본 날의 기억이 나요.', createdAt: '2026-11-20T09:00:00.000Z', edited: false, aiTester: true },
  { id: 'mc-2', authorLabel: '기록한 사람', body: '같은 무대 다녀온 사람으로서 공감해요.', createdAt: '2026-11-20T10:00:00.000Z', edited: false },
];
testOrSkip('#1098 2단계: 판의 순간 목록 — 순간 카드에 그 순간의 ♡·댓글 수(트리 숫자와 안 섞임), ♡ 누르기·댓글 쓰기는 순간 API, 서버 안내 그대로', async () => {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/probe') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(PROBE_HTML); return; }
    const file = path.join(PUB, clean);
    try {
      const st = await stat(file);
      if (!st.isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const json = (body) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  const momentStats = JSON.parse(JSON.stringify(MOMENT_STATS));
  const momentComments = JSON.parse(JSON.stringify(MOMENT_COMMENTS));
  let reactionCalls = [], commentCalls = 0, limitReaction = false;
  try {
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (/\/moments\/[^/]+\/comments$/.test(url)) {
        if (method === 'POST') { commentCalls += 1; return route.fulfill(json({ comment: { id: 'mc-new-' + commentCalls, authorLabel: '나', body: '순간 댓글 새로', createdAt: '2026-11-20T11:00:00.000Z', edited: false } })); }
        return route.fulfill(json({ comments: momentComments }));
      }
      if (/\/moments\/[^/]+\/reaction$/.test(url)) {
        const momentId = decodeURIComponent(url.split('/moments/')[1].split('/reaction')[0]);
        if (limitReaction) return route.fulfill({ status: 429, ...json({ error: { code: 'rate_limited', message: '조금 쉬었다가 다시 시도해 주세요.' } }) });
        const enabled = method === 'PUT';
        const stats = momentStats[momentId] || (momentStats[momentId] = { hearts: 0, aiHearts: 0, comments: 0, hearted: false });
        stats.hearts += enabled ? 1 : -1; stats.hearted = enabled;
        reactionCalls.push({ momentId, method });
        return route.fulfill(json({ ...stats }));
      }
      const statsMatch = url.match(/\/moments\/([^/]+)$/);
      if (statsMatch) return route.fulfill(json(momentStats[decodeURIComponent(statsMatch[1])] || { hearts: 0, aiHearts: 0, comments: 0, hearted: false }));
      if (/\/api\/public\/shares\//.test(url)) return route.fulfill(json(MOMENT_TARGETS));
      if (/\/comments$/.test(url)) return route.fulfill(json({ comments: COUNTS_COMMENTS }));
      if (url.includes('/api/community/shares')) return route.fulfill(json({ items: COUNTS_CARDS, nextCursor: null, totalVisible: 1, groups: [], groupsAll: [] }));
      return route.fulfill(json({ ok: true, items: [] }));
    });
    await openCountsPreview(page, port);
    await page.waitForSelector('#community-preview .community-moment', { timeout: 5000 });
    const state = await page.evaluate(() => {
      const preview = document.getElementById('community-preview');
      const rows = [...preview.querySelectorAll('.community-moment')].map((row) => ({
        id: row.dataset.momentId,
        title: row.querySelector('.community-moment-title')?.textContent || '',
        glyph: row.querySelector('.community-moment-heart .community-moment-heart-glyph')?.textContent || '',
        count: row.querySelector('.community-moment-heart .community-moment-count')?.textContent || '',
        pressed: row.querySelector('.community-moment-heart')?.getAttribute('aria-pressed') || '',
        aiBadge: Boolean(row.querySelector('.community-moment-heart .community-ai')),
        commentsToggle: row.querySelector('.community-moment-comments-toggle')?.textContent.trim() || '',
      }));
      return {
        rows,
        metaText: preview.querySelector('.community-preview-meta')?.textContent || '',
        treeComments: preview.querySelectorAll('.community-preview-comments .community-comment').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(state.rows.length, 3, `순간 목록에 공개 트리의 순간이 3장: ${JSON.stringify(state.rows)}`);
    assert.equal(state.rows[0].title, '첫 순간', '목록은 공개 트리 읽기 순서를 따른다');
    assert.equal(state.rows[0].glyph, '♡', '기본은 빈 하트');
    assert.equal(state.rows[0].count, '7', '그 순간의 ♡ 수가 보인다(3 이상)');
    assert.equal(state.rows[0].aiBadge, false, '♡ 단추에는 AI 배지를 두지 않는다 — 그 순간의 수만 보인다');
    assert.equal(state.rows[0].commentsToggle, '댓글 4', '그 순간의 댓글 수가 보인다');
    assert.equal(state.rows[1].count, '', '3 미만 ♡ 수는 숫자를 남기지 않는다(#824 결정 7 규칙)');
    assert.equal(state.rows[1].commentsToggle, '댓글', '3 미만 댓글 수도 숫자를 남기지 않는다');
    assert.equal(state.rows[2].pressed, 'true', '내가 누른 순간은 눌린 표시로 시작한다');
    assert.doesNotMatch(state.metaText, /♡ 7|댓글 4/, '판 위쪽 한 줄 정보(트리 숫자)에 순간 수가 섞이지 않는다');
    assert.match(state.metaText, /댓글 5/, '판 위쪽은 여전히 트리 댓글 수다');
    assert.equal(state.treeComments, 3, '트리 댓글 묶음(1단계)은 그대로다');
    assert.ok(state.overflow <= 1, `1440 가로 넉침 0: ${state.overflow}`);
    // ♡ 누르기 — 순간 단위 API(PUT)로, 누른 순간 카드의 수만 바뀐다.
    const firstHeart = page.locator('#community-preview .community-moment[data-moment-id="m-1098-2-1"] .community-moment-heart');
    await firstHeart.click();
    await page.waitForFunction(() => document.querySelector('#community-preview .community-moment[data-moment-id="m-1098-2-1"] .community-moment-heart .community-moment-count')?.textContent === '8', null, { timeout: 3000 });
    assert.equal(reactionCalls.length, 1, '♡ 누르면 순간 반응 API를 한 번 부른다');
    assert.equal(reactionCalls[0].momentId, 'm-1098-2-1', '순간 단위 API다(트리가 아닌 그 순간)');
    assert.equal(await firstHeart.getAttribute('aria-pressed'), 'true', '눌림 표시');
    assert.equal(await firstHeart.locator('.community-moment-heart-glyph').textContent(), '♥', '누른 하트는 채운 하트');
    await firstHeart.click();
    await page.waitForFunction(() => document.querySelector('#community-preview .community-moment[data-moment-id="m-1098-2-1"] .community-moment-heart .community-moment-count')?.textContent === '7', null, { timeout: 3000 });
    assert.equal(await firstHeart.getAttribute('aria-pressed'), 'false', '다시 누르면 눌림이 풀린다');
    assert.equal(reactionCalls.length, 2, '끄기도 순간 반응 API(DELETE)로 간다');
    // 댓글 펼치기 — 순간 단위 API(트리 댓글과 다른 응답), AI 명예회원 머리말 구분.
    const firstToggle = page.locator('#community-preview .community-moment[data-moment-id="m-1098-2-1"] .community-moment-comments-toggle');
    await firstToggle.click();
    await page.waitForFunction(() => document.querySelectorAll('#community-preview .community-moment[data-moment-id="m-1098-2-1"] .community-comment').length === 2, null, { timeout: 3000 });
    const drawer = await page.evaluate(() => {
      const box = document.querySelector('#community-preview .community-moment[data-moment-id="m-1098-2-1"] .community-moment-comments');
      const heads = [...box.querySelectorAll('.community-comment small')].map((n) => n.textContent || '');
      return { first: heads[0] || '', visible: !box.hidden };
    });
    assert.equal(drawer.visible, true, '누르면 그 순간의 댓글이 그 자리에서 펼쳐진다');
    assert.match(drawer.first, /^AI 명예회원/, 'AI 명예회원 댓글은 트리 작성자 표시와 같은 방식으로 구분된다');
    // 댓글 쓰기 — 순간 단위 API(POST)로, 트리 댓글 묶음과 섞이지 않는다.
    const row = page.locator('#community-preview .community-moment[data-moment-id="m-1098-2-1"]');
    await row.locator('.community-comment-form textarea').fill('순간 댓글 새로');
    await row.locator('.community-comment-form button').click();
    await page.waitForFunction(() => document.querySelectorAll('#community-preview .community-moment[data-moment-id="m-1098-2-1"] .community-comment').length === 3, null, { timeout: 3000 });
    assert.equal(commentCalls, 1, '댓글 쓰기도 순간 단위 API를 부른다');
    const treeAfter = await page.evaluate(() => document.querySelectorAll('#community-preview .community-preview-comments .community-comment').length);
    assert.equal(treeAfter, 3, '순간 댓글을 써도 트리 댓글 묶음은 그대로다');
    // 막히면(횟수 제한 모의 429) 서버 응답 안내를 그대로 보여 주고 눌림 표시를 되돌린다.
    limitReaction = true;
    await firstHeart.click();
    await page.waitForFunction(() => {
      const note = document.querySelector('#community-preview .community-moment[data-moment-id="m-1098-2-1"] .community-moment-note');
      return note && !note.hidden && note.textContent.includes('조금 쉬었다가');
    }, null, { timeout: 3000 });
    assert.equal(await firstHeart.getAttribute('aria-pressed'), 'false', '막힌 요청은 눌림 표시를 되돌린다');
    const overflow390 = await page.setViewportSize({ width: 390, height: 844 }).then(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    assert.ok(overflow390 <= 1, `390 가로 넉침 0: ${overflow390}`);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

if (REQUIRE && skipReason) throw new Error('LT_COMMUNITY_784_REQUIRE=1 인데 화면 시험을 건너뛴다 — 깨진 채로 두지 않는다');
