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
  { group: '방탄소년단', count: 5 },
  { group: '뉴진스', count: 7 },
  { group: '아이브', count: 2 },
  { group: 'RIIZE', count: 3 },
  { group: '탄방소년', count: 1 },
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

    // 그룹 찾기 창 열기.
    await page.getByRole('button', { name: '그룹 찾기' }).click();
    await page.waitForSelector('dialog.community-group-find[open]');
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

if (REQUIRE && skipReason) throw new Error('LT_COMMUNITY_784_REQUIRE=1 인데 화면 시험을 건너뛴다 — 깨진 채로 두지 않는다');
