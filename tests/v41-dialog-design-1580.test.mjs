import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/v41/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/v41/shell.css',import.meta.url),'utf8');
const panels=readFileSync(new URL('../public/v41/shell/panels.mjs',import.meta.url),'utf8');
const cleanup=readFileSync(new URL('../public/v41/shell/cleanup.mjs',import.meta.url),'utf8');

test('#1580 순간 추가는 스크롤 입력과 고정 오류·하단 단추가 별도 형제 영역이다',()=>{
 const form=html.slice(html.indexOf('<form id="moment-form">'),html.indexOf('</form></section></dialog>',html.indexOf('<form id="moment-form">')));
 const fields=form.indexOf('<div class="editor-fields">'),error=form.indexOf('<p id="form-error"'),footer=form.indexOf('<div class="editor-bottom">');
 assert.ok(fields>=0&&fields<error&&error<footer);
 assert.match(form,/<\/div><p id="form-error" role="alert" aria-live="assertive">/);
 assert.match(css,/#write-panel #moment-form>\.editor-fields\{flex:1 1 auto;min-height:0;overflow-y:auto/);
 assert.match(css,/#write-panel #moment-form>\.editor-bottom\{position:relative/);
 assert.match(css,/#write-panel #moment-form>#form-error:not\(:empty\)/);
});

test('#1580 테마 밖의 가운데 창에 전체 변경을 강제하지 않는다',()=>{
 assert.match(css,/#write-panel\[open\]\{\s*display:flex/);
 assert.match(css,/#tree-manager\[open\]\{\s*display:flex/);
 assert.doesNotMatch(css,/dialog\[data-lt-panel=center\]\[open\]\{display:flex/);
 for(const id of ['write-panel','tree-manager','journal-panel','community-preview','account-assets']){
  assert.ok(html.includes('id="'+id+'"'),id+' 창은 그대로 존재');
 }
});

test('#1580 이어지는 순간 표지·제목을 함께 보여 준다',()=>{
 for(const id of ['editor-parent-summary','editor-parent-thumb','editor-parent-title','editor-parent-fallback']) assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(panels,/function paintEditorParentSummary\(parent\)/);
 assert.match(panels,/paintEditorParentSummary\(mode === 'add' \? m : null\)/);
 assert.match(css,/#editor-parent-title\{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis/);
});

test('#1580 트리 공개·표지 디자인은 기본 fieldset 테두리와 11px 이름 대신 지정 틀을 쓴다',()=>{
 assert.match(html,/<fieldset id="tree-design"><legend>디자인 고르기<\/legend><div class="cover-design-options">/);
 assert.match(html,/<fieldset id="tree-cover-method" class="cover-method"><legend>표지<\/legend><div class="cover-method-options">/);
 assert.match(css,/#tree-design \.cover-design-name\{[^}]*font-size:12px/);
 assert.match(css,/#tree-form \.tree-visibility\{[^}]*border:1px solid var\(--lt-line\)/);
 assert.match(css,/html\[data-lt-theme=garden\] #tree-form input:not\(\[type=radio\]\)/);
});

test('#1580 다른 트리가 없으면 안내를 남기고 옮기기·복사하기는 막는다',()=>{
 assert.match(html,/id="cleanup-target-empty"[^>]*>옮길 다른 트리가 없어요\.<\/p>/);
 assert.match(cleanup,/empty\.hidden = targets\.length > 0/);
 assert.match(cleanup,/narrow\(\) && !targetPage && targetRows\.length > 0/);
 assert.match(cleanup,/\$\('cleanup-move'\)\.hidden = !targets\.length/);
 assert.match(css,/#cleanup-panel \.panel-foot button:not\(\.primary\)\{min-width:90px/);
});
