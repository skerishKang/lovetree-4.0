// #459: 낱말 표(docs/WORDS.md) 계약 — 화면 글자에서 옛 낱말이 0건인지 실행으로 확인한다.
// 금지 낱말: '기억책 열기'·'기억책에서 보기'·'내 책장'·'순간 남기기'.
// 예외(이유는 docs/WORDS.md 표의 '바꾸면 안 되는 예외' 열과 같다):
//  - 보드 '＋ 순간 꽂기'·'순간 꽂기'·'새 순간을 기억판에 꽂기'(track58) — 보드만의 핀 꽂기 동작,
//    셸 순간 추가 창과 다른 보드 자체 모달(#459 본문 기준 예외).
//  - 책 안내 '책장 넘기기'(book.js #turnWhy) — 책의 한 장(페이지)을 넘기는 다른 뜻.
//  - 화면 안 제목의 긴 이름 '기억 보드'·'관계 지도'(각 화면 topbar 기본값) — 본문 범위 밖.
//  주석(//·/* */)과 <title>은 화면 글자가 아니므로 검사에서 제외한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../public/v41/', import.meta.url);
const v41root = new URL('../v41/', import.meta.url);

const BANNED = ['기억책 열기', '기억책에서 보기', '내 책장', '순간 남기기'];

function collect(dir, out = []) {
  const dirPath = dir instanceof URL ? fileURLToPath(dir) : dir;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.(mjs|js|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripNonText(source) {
  // 주석(// · /* */)과 <title>은 화면 글자가 아니다 — 제거한 뒤 검사한다.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/<title>[\s\S]*?<\/title>/g, ' ');
}

test('#459 화면 글자에서 옛 낱말(기억책 열기·기억책에서 보기·내 책장·순간 남기기)은 0건이다', () => {
  const files = [...collect(root), ...collect(v41root)];
  const hits = [];
  for (const file of files) {
    const src = stripNonText(fs.readFileSync(file, 'utf8'));
    for (const word of BANNED) {
      if (src.includes(word)) hits.push({ file: path.relative(process.cwd(), file), word });
    }
  }
  assert.deepEqual(hits, [], '옛 낱말이 남은 곳: ' + JSON.stringify(hits));
});

test('#459 낱말 표(docs/WORDS.md)가 있고 금지 낱말·예외를 적는다', () => {
  const words = read('docs/WORDS.md');
  for (const word of BANNED) assert.match(words, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), word);
  assert.match(words, /보드만의 동작\(핀 꽂기\)/, '보드 꽂기 예외 이유');
  assert.match(words, /책의 한 장\(페이지\)을 넘기는 동작/, '책장 넘기기 예외 이유');
  assert.match(words, /범위 밖/, '범위 밖(화면 안 제목) 항목');
});

test('#459 새 말이 실제로 쓰이는 곳: 메뉴·단추·화면 제목', () => {
  const html = read('public/v41/index.html');
  // 맨 위 메뉴: 책·보드·지도, 책장 진입은 트리 ▾의 '내 트리 전체 보기'
  assert.match(html, /data-view="track59-sketchbook\.html">책<\/button>/);
  assert.match(html, /data-view="track58-pinboard\.html">보드<\/button>/);
  assert.match(html, /data-view="track56-network\.html">지도<\/button>/);
  // 순간 추가 창 제목과 서버 읽기 전용 단추
  assert.match(html, /id="write-panel-title">순간 추가<\/h2>/);
  const nav = read('public/v41/shell/navigation.mjs');
  assert.match(nav, /\['shelf', 'track32-bookshelf\.html', '내 트리'\]/);
  assert.match(nav, /\['book', 'track59-sketchbook\.html', '책'\]/);
});

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}
