// #590 — AI 고객 일지 쓰기 창에 '디자인 느낌' 안내 한 줄(선택 입력·본문 틀 예시). 마크업 글자로 고정한다(레포 관례).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('#590 일지 창 안내에 디자인 느낌 한 줄(선택·틀 예시)이 있다', () => {
  const html = read('public/v41/index.html');
  const start = html.indexOf('id="journal-panel"');
  const end = html.indexOf('id="myposts-panel"');
  assert.ok(start >= 0 && end > start, '일지 창 범위를 찾는다');
  const panel = html.slice(start, end);
  assert.ok(panel.includes('journal-form'), '일지 쓰기 폼이 있는 범위다');
  assert.match(panel, /\(선택\) 디자인 느낌도 한 줄 남겨 주세요/);
  assert.match(panel, /내가 자주 쓰는 ○○와 비교해서/);
  assert.match(panel, /익숙했던 점 \/ 어색했던 점/);
  // 안내는 폼 안(저장 오류 칸 앞)에 있어 제출 동작에는 손대지 않는다.
  const bodyAt = panel.indexOf('name="body"');
  const hintAt = panel.indexOf('디자인 느낌');
  assert.ok(bodyAt >= 0 && hintAt > bodyAt, '내용 칸 바로 뒤에 안내가 온다');
});
