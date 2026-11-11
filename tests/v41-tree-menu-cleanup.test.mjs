import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCleanup} from '../public/v41/shell/cleanup.mjs';
import {titleView, withoutAutoTitle} from '../public/v41/book-usability.mjs';

// #380 3·6: 드롭다운 빈 표지 기본값 + 정리 목록 제목·썸네일.
const dir = new URL('../public/v41/', import.meta.url);
const shellCss = readFileSync(new URL('shell.css', dir), 'utf8');
const shell = readFileSync(new URL('shell.mjs', dir), 'utf8');
const cleanup = readFileSync(new URL('shell/cleanup.mjs', dir), 'utf8');

function cssRule(selector) {
  const start = shellCss.indexOf(selector);
  assert.notEqual(start, -1, `CSS 규칙 ${selector} 존재`);
  return shellCss.slice(start, shellCss.indexOf('}', start));
}

test('1. 드롭다운 빈 표지 기본값은 트리 관리 "기본" 칩과 같은 언어를 쓴다', () => {
  const base = cssRule('.tree-cover{');
  assert.match(base, /background-color:var\(--lt-cover-1\)/, '기본 칩과 같은 표지 토큰');
  assert.match(base, /box-shadow:inset 8px 0 0 rgba\(0,0,0,\.13\)/, '같은 책등 그림자');
  assert.doesNotMatch(base, /linear-gradient|145deg/, '기존 그라데이션 제거');
  assert.match(base, /width:36px;height:46px/, '드롭다운 크기 유지');
  // #380 5번: 표지 판정은 coverModeOf 한 벌을 따르고, 디자인 보지는 같은 토큰을 그대로 쓴다.
  assert.match(shell, /const mode=coverModeOf\(tree\);/);
  assert.match(shell, /if\(mode==='design'\)\{/, '디자인을 고른 트리는 디자인 보지를 보여 준다');
  assert.match(shell, /data-cover-design="\$\{escHTML\(design\)\}"/, '디자인 표지 경로는 그대로');
});

test('2. 드롭다운 트리 클릭은 위치를 옮기고 주소도 쓴다', () => {
  assert.match(shell, /const TREE_VIEWS=new Set\(\['track59-sketchbook\.html','track58-pinboard\.html','track56-network\.html'\]\)/, '보기 유지 대상');
  assert.match(shell, /TREE_VIEWS\.has\(current\)/, '보던 중 보기 판정');
  assert.match(shell, /show\('track59-sketchbook\.html',false\)/, '그 외에는 그 트리의 책으로');
  assert.match(shell, /writeLocation\(\);/, '주소 갱신');
});

test('3. 정리 목록은 주입된 화면 규칙으로 제목·썸네일을 그린다', async () => {
  const el = tag => {
    const node = {
      tagName: String(tag || 'div').toUpperCase(), children: [], className: '', textContent: '', value: '', checked: false,
      disabled: false, hidden: false, src: '', alt: '', loading: '', referrerPolicy: '', selectedOptions: [],
      append(...ns) { this.children.push(...ns); },
      replaceChildren(...ns) { this.children = ns; },
      querySelectorAll(sel) {
        const wantsInput = sel.includes('input');
        return this.children.filter(child => wantsInput ? child.tagName === 'INPUT' : true).filter(child => sel.includes(':checked') ? child.checked : true);
      },
      setAttribute() {}, addEventListener() {},
      classList:{add:(...names)=>{node.className=[node.className,...names].filter(Boolean).join(' ');},remove:(...names)=>{node.className=names.reduce((acc,name)=>acc.split(/\s+/).filter(w=>w&&w!==name).join(' '),node.className);},contains:name=>node.className.split(/\s+/).includes(name),toggle(){}},
    };
    return node;
  };
  const ids = ['cleanup-moments','cleanup-desc','cleanup-error','cleanup-new-name','cleanup-target','cleanup-count','cleanup-create','cleanup-move','cleanup-move-box','cleanup-panel'];
  const els = Object.fromEntries(ids.map(id => [id, el()]));
  globalThis.document = {createElement: tag => el(tag)};
  globalThis.window = {LT41: {tree: {id: 'inbox', inbox: true, moments: [
    {id: 'm1', title: 'youtube.com에서 간직한 순간', parentId: null, url: 'https://youtu.be/abcdefghijk', mediaMetadata: {title: '영상 제목', thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'}},
    {id: 'm2', title: '내 제목', parentId: 'm1', url: 'https://example.com/x', mediaMetadata: {}},
     {id: 'm3', title: 'youtu.be에서 간직한 순간', parentId: 'm2', url: 'https://youtu.be/z', mediaMetadata: null},
     {id: 'm4', title: '', parentId: 'm2', url: 'https://example.com/y'},
   ]}}};
  const chosen = [];
  const cleanup = createCleanup({
    $: id => els[id],
    getMember: () => ({snapshot: () => ({owned: true, writable: true})}),
    getSource: () => 'server',
    getTrees: () => [],
    choose: (id) => { chosen.push(id); },
    notify: () => {},
    panel: () => {},
    treeMomentThumb: moment => moment.mediaMetadata?.thumbnail || '',
    momentTitle: moment => titleView(moment, 'both').main || withoutAutoTitle(moment).title,
  });
  assert.equal(cleanup.open({}), true);
  const host = els['cleanup-moments'];
  assert.equal(host.children.length, 4, '네 순간');
  const [first, second, third, fourth] = host.children;
  assert.equal(first.children[0].tagName, 'INPUT');
  assert.equal(first.children[0].checked, false);
  assert.equal(first.children[1].src, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', '썸네일 연결');
  assert.equal(first.children[2].textContent, '영상 제목 · 시작 순간', '자동 제목 대신 화면 규칙 제목');
    assert.equal(second.children.length, 2, '썸네일 없는 순간은 img 없이');
    assert.equal(second.children[1].textContent, '내 제목');
    assert.equal(third.children.length, 2, '썸네일 자리는 유지');
    assert.equal(third.children[1].textContent, '제목 없는 영상', '영상 제목 미확보 → 흐린 대체 문구');
    assert.equal(third.children[1].className.includes('is-blank'), true);
    assert.equal(fourth.children.length, 2);
    assert.equal(fourth.children[1].textContent, '제목 없는 순간', '비영상 → 다른 문구');
  delete globalThis.document;
  delete globalThis.window;
});

test('4. 정리 목록 제목 대체값은 자동 도메인 제목을 화면에 내보내지 않는다', () => {
  assert.equal(withoutAutoTitle({title: 'youtu.be에서 간직한 순간'}).title, '', '자동 제목은 화면용 대체에서 빈 값');
  assert.equal(withoutAutoTitle({title: '내가 쓴 제목'}).title, '내가 쓴 제목', '사용자가 쓴 제목은 그대로');
  assert.match(shell, /withoutAutoTitle\(moment\)\.title/, '셸이 화면용 대체 규칙을 재사용한다');
});
