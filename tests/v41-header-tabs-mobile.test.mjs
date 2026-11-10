// 2026-11-10 대표 승인: 좁은 폭에서는 가운데 메뉴를 접고 트리 ▾·S만 남긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');

function mediaBlock(source, query) {
  const bodies = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(`@media(${query})`, from);
    if (start < 0) break;
    const open = source.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) break;
    bodies.push(source.slice(open + 1, end));
    from = end + 1;
  }
  return bodies.join('\n');
}

const narrow = mediaBlock(css, 'max-width:780px');

test('좁은 폭: 가운데 메뉴·추가 버튼은 숨기고 트리·S·접기만 남는다', () => {
  assert.match(narrow, /\.main-nav>button\[data-view\][^{]*\{display:none!important\}/);
  assert.match(narrow, /\.main-nav #community-menu[^{]*\{display:none!important\}/);
  assert.match(narrow, /\.main-nav \.tree-views\{display:none!important\}/);
  assert.match(narrow, /\.header-actions #write-menu[^{]*\{display:none!important\}/);
  assert.match(narrow, /#mobile-more\{display:flex!important\}/);
  assert.match(narrow, /\.app-header\{display:flex;min-height:56px/, '한 줄');
});

test('접기 메뉴는 기존 화면 버튼을 복제해 같은 동작을 부른다', () => {
  assert.match(shell, /function buildFoldMenu\(\)/);
  assert.match(shell, /add\('첫 화면'/);
  assert.match(shell, /add\('내 책장'/);
  assert.match(shell, /add\('둘러보기'/);
  assert.match(shell, /add\('기억책'/);
  assert.match(shell, /add\('기억 보드'/);
  assert.match(shell, /add\('관계 지도'/);
  assert.match(shell, /if\(event\.target\.closest\('button'\)\)closeMore\(\)/);
});

test('트리 드롭다운은 버튼 아래로 펼쳐지고 좁은 폭에서는 화면 폭을 쓴다', () => {
  assert.match(html, /id="tree-popover" class="tree-popover" role="menu"/);
  assert.match(css, /\.tree-popover\{position:absolute;top:calc\(100% \+ 8px\);left:0/);
  assert.match(narrow, /\.tree-popover\{position:fixed;left:10px;right:10px;top:60px/);
  assert.match(shell, /role="menuitemradio"/);
  assert.match(shell, /data-tree-action="new"/);
  assert.match(shell, /data-tree-action="manage"/);
  assert.match(shell, /data-tree-action="share"/);
});

test('맨 위 메뉴는 한 줄이고 "선택한 트리" 둘째 줄이 없다', () => {
  assert.doesNotMatch(html, /id="view-context"/);
  assert.match(css, /\.app-header\{min-height:64px;padding:10px 20px/);
});

test('메뉴 순서: 첫 화면·내 책장·둘러보기 → 트리 ▾ → 기억책·보드·지도 → 추가 → S', () => {
  const nav = html.slice(html.indexOf('<nav class="main-nav"'), html.indexOf('</nav>'));
  const order = ['첫 화면', '내 책장', '둘러보기', 'id="record-menu"', '기억책', '기억 보드', '관계 지도'];
  let at = -1;
  for (const token of order) {
    const next = nav.indexOf(token, at + 1);
    assert.ok(next > at, token + ' 순서');
    at = next;
  }
  assert.ok(html.indexOf('id="write-menu"') > html.indexOf('</nav>'), '추가 버튼은 메뉴 오른쪽');
  assert.ok(html.indexOf('id="account-avatar"') > html.indexOf('id="write-menu"'), 'S는 맨 오른쪽');
});
