import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const BOOK=readFileSync(new URL('../public/v41/views/book/book.js',import.meta.url),'utf8');

// 책 화면 돋보기 루프 재측정(레인C, 2026-11-13): 가만히 있어도 매 프레임 예약 — 유휴 5초 rAF 600회(배포본 포함).
// #346 보드 실 루프를 없앤 것과 같은 원칙: 움직이는 동안에만 예약하고, 다시 움직일 때 pointermove가 깨운다.
// 게이트가 그리기 조건과 같은 식이므로 화면 결과는 그대로다.

test('책 돋보기: 다음 프레임 예약은 렌즈가 실제로 움직일 때만 한다 — 게이트는 그리기 조건과 같다',()=>{
 assert.match(BOOK,/function lensActive\(\)\{return overBook&&lensOn&&!single\(\)&&machineState==='INSPECTING'\}/,'게이트는 한 곳에 모은다');
 assert.match(BOOK,/lensFrame=lensActive\(\)\?requestAnimationFrame\(lensLoopTick\):0/,'게이트가 거짓이면 다음 프레임을 예약하지 않는다');
});

test('책 돋보기: pointermove 처리(updateLensTarget)에서 멈춘 루프를 다시 깨운다',()=>{
 assert.match(BOOK,/machineState='INSPECTING';tx=ev\.clientX;ty=ev\.clientY;kickLensLoop\(\);/,'돋보기가 켜지는 곳에서 깨운다');
 assert.match(BOOK,/function kickLensLoop\(\)\{if\(!lensFrame&&lensActive\(\)\)lensFrame=requestAnimationFrame\(lensLoopTick\)\}/,'이미 돌고 있으면 새로 예약하지 않는다');
});

test('책 돋보기: 뜰 때 무조건 도는 예약이 남아 있지 않다',()=>{
 assert.doesNotMatch(BOOK,/requestAnimationFrame\(lensLoop\)/,'예약은 lensLoopTick 한 벌로만 한다');
 assert.doesNotMatch(BOOK,/\)document\.addEventListener\('pointermove',updateLensTarget\);requestAnimationFrame/,'켤 때 무조건 예약하지 않는다');
});
