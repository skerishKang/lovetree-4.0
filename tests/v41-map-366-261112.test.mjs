// #366(2026-11-12) 관계 지도 마무리: 7항목 중 "일부"였던 것을 채운 자리 — 두 보기(그물·동심원) 공통.
// ① 첫 로드에 맨 위 안내가 흐려지지 않는다(자동 맞춤이 안내를 덮지 않게)
// ③ 연결 이유(relation)가 화면 그래프까지 전달되고, 마우스·터치·키보드로 보인다
// ④ 지나온 길 강조는 보기와 상관없이 같은 계산(모델 originPath)을 쓴다
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=src('public/v41/views/track56-network.html');
const js=src('public/v41/views/network/network.js');
const css=src('public/v41/views/network/network.css');
const model=src('public/v41/views/network/network-model.js');

test('#366 ① 맨 위 한 줄 안내가 있고, 첫 로드에 흐려지지 않는다',()=>{
  assert.match(html,/첫 순간에서 어떻게 이어졌는지 보는 지도예요/);
  // 첫 로드에서 선택 자동 맞춤(centerOn)을 하면 .hero가 .07까지 흐려져 안내가 사라진다 — 더 이상 부르지 않는다.
  const boot=js.split("const n=nodes.find(n=>n.id===LTDEMO.get());")[1]?.split('\n')[0]||'';
  assert.match(boot,/state\.selected=n/,'첫 순간 선택은 남긴다');
  assert.doesNotMatch(boot,/centerOn\(/,'첫 로드에 안내를 덮는 자동 맞춤 없음');
});

test('#366 ③ 연결 이유: 저장된 relation이 화면 그래프(reason)까지 온다',()=>{
  assert.match(model,/function relationText\(edge\) \{\s*return typeof edge\?\.reason === 'string' \? edge\.reason\.trim\(\) : '';/);
  // 화면이 LTDEMO.edges를 그래프로 옮길 때 reason을 버리면 툴팁이 영원히 비어 있다.
  const carry=js.split('LTDEMO.edges.forEach')[1]?.split('\n')[0]||'';
  assert.match(carry,/reason:e\.reason\|\|''/,'그래프로 옮길 때 reason 유지');
  // 마우스 호버·터치(누름) 모두 툴팁을 띄운다.
  assert.match(js,/paintEdgeTip\(he,e\.clientX,e\.clientY\)/,'호버');
  assert.match(js,/paintEdgeTip\(he,e\.clientX,e\.clientY,true\)/,'누름(터치)');
  // 이유가 비면 표시를 생략한다(모델 규칙 그대로).
  assert.match(js,/if\(!text\)\{hideEdgeTip\(\);return\}/);
});

test('#366 ③ 키보드: 캔버스에 초점이 오고, 연결 이유는 낭독기로도 읽힌다',()=>{
  assert.match(html,/<canvas id="stage" tabindex="0" aria-label="[^"]*방향키로 순간을 옮기고/);
  assert.match(html,/aria-describedby="mapKbHint"/);
  assert.match(html,/id="edgeTip" role="status" aria-live="polite"/,'툴팁이 상태 알림으로 읽힌다');
  assert.doesNotMatch(html,/id="edgeTip"[^>]*aria-hidden/,'낭독기가 읽도록 aria-hidden 제거');
  assert.match(css,/#stage:focus-visible\{/,'초점 테두리');
  for (const key of ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End','Enter',' ','Escape']) {
    assert.ok(js.includes(`'${key}'`), `키 처리: ${key}`);
  }
  // 방향키는 길만 밝히고(미리보기) 연결 이유를 띄운다. Enter는 상세 판을 함께 연다.
  assert.match(js,/function kbHighlight\(n\)\{[^}]*applyPathHighlight\(n\)[^}]*kbRelation\(n\)/);
  assert.match(js,/if\(key==='Enter'\|\|key===' '\)\{e\.preventDefault\(\);const n=state\.selected;if\(n&&n\.kind==='moment'\)\{selectMoment\(n,true\);kbRelation\(n\)\}return\}/);
  assert.match(js,/if\(key==='Escape'\)\{e\.preventDefault\(\);hideEdgeTip\(\);clearSelection\(\);return\}/);
});

test('#366 ④ 지나온 길 강조는 두 보기가 같은 계산 한 벌을 쓴다',()=>{
  // 첫 순간→이 순간 사슬은 모델 originPath 한 벌, 밝기 표는 pathEmphasis 한 곳.
  assert.match(js,/function applyPathHighlight\(n\)\{const path=LT56Model\.originPath\(n\.id,LTDEMO\.moments,LTDEMO\.edges\)/);
  assert.match(js,/state\.pathEdges\.add\(e\.id\)/);
  // 보기별 분기는 세기(alpha)에서만 갈라지고, 강조 대상은 같다.
  assert.match(js,/function edgeAlpha\(e\)\{if\(state\.view==='concentric'\)return state\.mode==='MOMENT_FOCUS'\?\(state\.pathEdges\.has\(e\.id\)\?LT56Model\.pathEmphasis\.lit:LT56Model\.pathEmphasis\.dim\)/);
  assert.match(js,/function nodeAlpha\(n\)\{if\(state\.view==='concentric'\)\{[^}]*state\.pathIds\.has\(n\.id\)\?LT56Model\.pathEmphasis\.litNode:LT56Model\.pathEmphasis\.dimNode/);
});

test('#366 유휴 rAF 0: 키보드 조작은 한 번만 그리고, 반복 프레임은 재생·등장 연출에만 있다',()=>{
  assert.match(js,/function animating\(\)\{return !!state\.play\?\.active\|\|!!state\.animEdge\|\|revealAnimating\(\)\}/);
  assert.match(js,/function frame\(now\)\{rafPending=0;[\s\S]*?if\(animating\(\)\)rafPending=requestAnimationFrame\(frame\)\}/);
  // 키보드 처리기는 kbHighlight만 부르고(kbHighlight가 scheduleDraw 한 번), 연속 프레임을 만들지 않는다.
  const kb=js.split("canvas.addEventListener('keydown'")[1]?.split("canvas.addEventListener('wheel'")[0]||'';
  assert.match(kb,/kbHighlight\(list\[next\]\)/);
  assert.doesNotMatch(kb,/requestAnimationFrame/,'키보드가 연속 프레임을 만들지 않는다');
  assert.match(js,/function kbHighlight\(n\)\{[^}]*scheduleDraw\(\)\}/);
});
