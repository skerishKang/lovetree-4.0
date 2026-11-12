import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = name => readFileSync(new URL('../public/v41/' + name, import.meta.url), 'utf8');
const html = read('index.html');
const shell = read('shell.mjs');
// #231 1-B③-2: 순간 패널·편집기·책 정보는 shell/panels.mjs로 옮겼다.
const panels = read('shell/panels.mjs');
const upload = read('private-upload.mjs');
const css = read('shell.css');
const formStart = html.indexOf('<form id="moment-form">');
const form = html.slice(formStart, html.indexOf('</form>', formStart));

// 2026-11-08 순간 추가·수정 패널 정리: 탭 2개, 링크·사진 먼저, '더 적기' 접힘, 백업·보관 파일은 계정 메뉴.

test('순간 추가 한 창(#425): 탭은 쉬운 추가·자세한 추가 두 개이고, 수정은 탭 없이 제목만 바꾼다', () => {
  // #425: 옛 모드 탭(순간 추가·이 순간 수정)은 없다 — 위쪽 탭 [쉬운 추가 | 자세한 추가]가 그 자리를 쓴다.
  assert.equal(/editor-modes/.test(html), false, '옛 모드 탭 줄은 없다');
  assert.deepEqual([...html.matchAll(/id="write-tab-([a-z]+)"/g)].map(m => m[1]), ['easy', 'detailed'], '탭은 두 개');
  assert.match(html, />쉬운 추가</);
  assert.match(html, />자세한 추가</);
  assert.equal(/data-mode="new"/.test(html), false, '새 트리 탭은 없다');
  assert.equal(/새 트리<\/button>/.test(html), false);
  // 수정은 탭 줄을 숨기고 제목만 '순간 수정'으로 바꾼다(panels.mjs).
  assert.match(panels, /dwrite\.setTabsVisible\(mode !== 'edit'\)/);
  assert.match(panels, /mode === 'edit' \? '순간 수정' : '순간 추가'/);
});

test('입력 순서는 링크·사진 → 마음 한마디 → 더 적기(제목·감정·날짜)다', () => {
  const url = form.indexOf('data-media-slot');
  const note = form.indexOf('name="note"');
  const more = form.indexOf('id="more-fields"');
  const title = form.indexOf('name="title"');
  const emotion = form.indexOf('name="emotion"');
  const date = form.indexOf('name="date"');
  const relation = form.indexOf('name="relation"');
  assert.ok(url > 0 && note > url, '링크·사진 묶음이 맨 위에 있다');
  assert.ok(more > note, '더 적기는 마음 한마디 뒤에 접혀 있다');
  assert.ok(title > more && emotion > title && date > emotion, '제목·감정·날짜는 더 적기 안에 있다');
  assert.ok(relation > date, '연결 이유는 더 적기 뒤에 남는다');
  assert.match(form, /<details class="more-fields" id="more-fields"><summary>더 적기 · 제목·감정·날짜<\/summary>/);
  assert.equal(/id="subject-label"/.test(html), false, '새 트리 전용 대상 칸은 패널에서 빠진다');
});

test('파일은 선택하면 바로 올라가고 파일 올리기 2단계 버튼이 없다', () => {
  assert.equal(/data-upload[^-]/.test(upload), false, '별도 업로드 버튼을 두지 않는다');
  assert.equal(/data-upload>/.test(html), false);
  assert.match(upload, /fileInput\.addEventListener\('change',[\s\S]*?void upload\(\);/);
  assert.match(upload, /const SIZE_PROBLEM='PNG·JPEG·GIF·WebP\(약 4\.2MB\), MP4·WebM\(약 8\.4MB\)만 올릴 수 있어요\.'/, '검증 문구는 그대로다');
  // #462: 자세한 추가의 용량 안내는 한 줄 — 어색한 '약 4.2MB · 계정당 약 105MB·200개'를 쓰지 않는다.
  assert.match(upload, /<p class="panel-note media-limit-note">사진 4MB, 영상 8MB까지 · 사진은 나만 볼 수 있어요<\/p>/, '용량 안내 한 줄');
  assert.doesNotMatch(upload, /사진 약 4\.2MB · 영상 약 8\.4MB/, '순간 폼에는 옛 용량 문구가 없다');
  assert.match(upload, /data-stop/, '전송 취소는 남긴다');
  assert.match(form, /사진·영상 파일|data-media-slot/, '파일 선택은 링크와 한 묶음이다');
});

test('더 적기는 기본 접힘이고 수정 모드에서 기존 값이 있으면 펼친다', () => {
  assert.equal(/<details class="more-fields"[^>]*\bopen\b/.test(html), false, '마크업 기본값은 접힘');
  // 더 적기 펼침은 함수 시험으로 옮겼다(tests/v41-panels-flow.test.mjs의 setEditorMode 표).
});

test('내 기록 백업·가져오기·탈퇴는 설정의 고급 묶음으로 이동했다', () => {
  const popover = html.slice(html.indexOf('id="account-popover"'), html.indexOf('id="mobile-more"'));
  assert.match(popover, /id="account-open-settings"/);
  assert.match(popover, /id="account-assets-open"/);
  assert.doesNotMatch(popover, /id="account-backup"/, '계정 메뉴에는 백업을 두지 않는다');
  assert.doesNotMatch(popover, /id="account-records"/, '계정 메뉴에는 백업 패널을 두지 않는다');
  assert.match(html, /id="account-settings-advanced"/);
  assert.match(html, /id="advanced-backup"/);
  assert.match(html, /id="advanced-import"/);
  assert.match(html, /id="account-delete"/, '탈퇴는 설정 고급 안에 남는다');
  assert.match(shell, /\$\('advanced-backup'\)\.onclick=\(\)=>backup\(\)/);
  assert.match(shell, /\$\('advanced-import'\)\.onclick=\(\)=>\$\('file'\)\.click\(\)/);
  assert.match(shell, /\$\('account-assets-open'\)\.onclick=/);
  assert.match(shell, /assets:\$\('account-assets'\)/, '업로드 모듈이 계정 다이얼로그를 쓴다');
  assert.match(upload, /A\('\[data-refresh\]'\)\.onclick=refresh/);
  assert.match(upload, /openAssets\(\)\{/);
});

test('저장 경로·미디어 메타데이터 규칙은 그대로다', () => {
  // 저장 경로(member.apply)는 함수 시험으로 옮겼다(tests/v41-panels-flow.test.mjs).
  const messages = read('shell/messages.mjs');
  assert.match(messages, /type === 'lt41-media-metadata'/);
  assert.match(messages, /apply\('cacheMediaMetadata'/);
  assert.match(upload, /form\.elements\.url\.value=result\.media\.url/, '업로드는 기존 url 필드에만 쓴다');
});

test('새로 넣은 패널 스타일은 --lt-* 토큰만 쓴다', () => {
  const from = css.indexOf('.link-photo-field{');
  const last = css.indexOf('.upload-asset button{', from);
  const block = css.slice(from, css.indexOf('\n', last));
  assert.match(block, /var\(--lt-line\)/);
  assert.match(block, /var\(--lt-pearl\)/);
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(block), false, '새 hex 색을 쓰지 않는다');
  assert.equal(/rgba?\(/.test(block), false, '새 rgba 색도 쓰지 않는다');
});
