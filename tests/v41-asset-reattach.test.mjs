import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountPrivateUpload} from '../public/v41/private-upload.mjs';

const read = name => readFileSync(new URL('../public/v41/' + name, import.meta.url), 'utf8');
const html = read('index.html');
const shell = read('shell.mjs');
const upload = read('private-upload.mjs');
const css = read('shell.css');
const formStart = html.indexOf('<form id="moment-form">');
const form = html.slice(formStart, html.indexOf('</form>', formStart));

// 2026-11-08 보관 파일 다시 첨부: 편집기 안 선택 버튼, reset 뒤 URL 유지, Esc 시 입력 보존.

test('편집기 링크 묶음에 보관 파일 선택 버튼이 있고 계정 메뉴와 같은 목록을 연다', () => {
  assert.match(form, /id="editor-assets-open"[^>]*aria-haspopup="dialog"[^>]*>내가 올린 사진·영상에서 고르기</);
  // #1097: 선택 버튼은 '영상 바꾸기' 펼침(media-change-box) 안에 있다(링크 입력 뒤, 파일 슬롯도 같은 펼침).
  const url = form.indexOf('name="url"');
  const changeBox = form.indexOf('id="media-change-box"');
  const slot = form.indexOf('data-media-slot');
  const picker = form.indexOf('id="editor-assets-open"');
  assert.ok(changeBox >= 0 && url > changeBox && slot > url && picker > slot, '영상 바꾸기 펼침 안에서 링크·슬롯 뒤에 있다');
  // #425: 편집기는 한 창(write-panel)의 자세한 추가 구역이다.
});

test('보관 파일을 고르면 편집기를 먼저 연 뒤 URL을 채우고, 이미 열린 편집기 입력은 보존한다', async () => {
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch, oldWindow = globalThis.window, oldLocation = globalThis.location;
  const pending = [];
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.textContent = ''; this.value = ''; this.open = false; this.hidden = false; this.disabled = false; this.attrs = {}; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
    focus() { this.focused = true; }
    close() { this.open = false; }
  }
  const slot = new Element(), assetsEl = new Element();
  const slotElements = new Map(), assetElements = new Map();
  for (const key of ['[data-media-file]', '[data-upload-status]', '[data-stop]']) slotElements.set(key, new Element());
  slot.querySelector = key => slotElements.get(key);
  for (const key of ['[data-assets]', '[data-usage]', '[data-refresh]', '[data-assets-detail]']) assetElements.set(key, new Element());
  assetsEl.querySelector = key => assetElements.get(key);
  globalThis.document = { createElementNS: (ns, tag) => ({ tagName: String(tag), namespaceURI: String(ns), attrs: {}, children: [], setAttribute(n,v){this.attrs[n]=String(v)}, getAttribute(n){return this.attrs[n]??null}, append(...k){this.children.push(...k)}, querySelector(){return null}, querySelectorAll(){return []} }), createElement: () => new Element()};
  globalThis.window = {LTMedia: {privateAssetName: () => null}};
  globalThis.location = {origin: 'https://example.test'};
  globalThis.fetch = () => new Promise(resolve => pending.push(resolve));
  const formStub = {querySelector: key => key === '[data-media-slot]' ? slot : key === '[type=submit]' ? new Element() : null, elements: {url: {value: '', focus() { this.focused = true; }}, note: {value: ''}}};
  const response = () => Response.json({subject: 'user', usedBytes: 1, quotaBytes: 100, maxItems: 200, items: [{name: 'a.png', mime: 'image/png', size: 1, createdAt: '2026-01-01'}]});
  const findByText = (root, text) => { const stack = [...(root.children || [])]; while (stack.length) { const node = stack.pop(); if (node.textContent === text) return node; stack.push(...(node.children || [])); } return null; };
  try {
    let editorOpen = false, opened = 0;
    mountPrivateUpload({
      form: formStub, assets: assetsEl, getSubject: () => 'user', getState: () => ({trees: []}), onChange() {},
      onUseAsset: () => { opened += 1; if (!editorOpen) { editorOpen = true; formStub.elements.url.value = ''; } return true; },
    });
    const refresh = assetElements.get('[data-refresh]').onclick();
    pending[0](response()); await refresh;
    // #1097: 격자 카드 → 누르면 상세(이 파일 첨부)가 보인다.
    const card = assetElements.get('[data-assets]').children[0];
    card.children[0].onclick();
    const detail = assetElements.get('[data-assets-detail]');
    const use = findByText(detail, '이 파일 첨부');
    assert.ok(use, '파일을 누르면 상세에 첨부 단추가 있다');
    assert.equal(use.textContent, '이 파일 첨부');
    assetsEl.open = true;
    use.onclick();
    assert.equal(opened, 1, '편집기를 먼저 연다');
    assert.equal(assetsEl.open, false, '목록을 닫는다');
    assert.equal(formStub.elements.url.value, 'https://example.test/api/media/a.png', 'reset 뒤 URL이 남는다');
    assert.equal(formStub.elements.url.focused, true, '선택 후 링크 칸으로 돌아간다');
    formStub.elements.url.value = 'https://kept.example';
    formStub.elements.note.value = '기존 마음';
    use.onclick();
    assert.equal(opened, 2);
    assert.equal(formStub.elements.note.value, '기존 마음', 'Esc·재선택에도 편집기 입력은 보존된다');
    assert.ok(formStub.elements.url.focused, '링크 칸에 초점을 둔다');
  } finally {
    globalThis.document = oldDocument; globalThis.fetch = oldFetch; globalThis.window = oldWindow; globalThis.location = oldLocation;
  }
});

test('새 선택 버튼 스타일은 --lt-* 토큰만 쓴다', () => {
  const start = css.indexOf('.asset-picker{');
  const block = css.slice(start, css.indexOf('\n', css.indexOf('.asset-picker:hover', start)));
  assert.match(block, /var\(--lt-line\)/);
  assert.match(block, /var\(--lt-pearl\)/);
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(block), false, '새 hex 색을 쓰지 않는다');
  assert.equal(/rgba?\(/.test(block), false, '새 rgba 색도 쓰지 않는다');
});