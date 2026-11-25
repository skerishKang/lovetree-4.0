import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=fileURLToPath(new URL('../dist/',import.meta.url));
const MAIN=process.env.LT_ORBIT1086_MAIN_DIST;
const REQUIRE=process.env.LT_ORBIT1086_REQUIRE==='1';
let chromium,skip;
try{
 ({chromium}=await import('playwright'));
 if(!existsSync(chromium.executablePath()))skip='Chromium 없음';
}catch{skip='화면 시험 도구 없음';}
if(!existsSync(path.join(ROOT,'v41/home.html')))skip='첫 화면 빌드 없음';
if(!MAIN||!existsSync(path.join(MAIN,'v41/home.html')))skip='기준 브랜치 첫 화면 빌드 없음';
if(REQUIRE&&skip)throw Error('#1086 필수 회귀 방지 시험: '+skip);

// 실제 사용자 성능의 50ms 초과 0개 판정은 하드웨어 가속 Chrome에서 별도로 한다.
// 헤드리스에서는 같은 실행기·브라우저·화면 조건의 기준 브랜치와 세 묶음 전체를 번갈아 재어 비교한다.
// 2026-11-23 대표 결정(#1229): 최댓값 한 개·초과 프레임 한 개 차이는 실행기 잡음이라 판정에 쓰지 않는다.
// 전체 프레임 중 50ms 초과 비율, 묶음 중앙 간격, 최대 간격을 함께 보고 실제로 느려졌을 때만 실패한다.
// 성공한 묶음만 고르거나 다시 재지 않는다.
test('#1086 첫 화면 궤도 헤드리스 회귀 방지 — 기준 브랜치 대비 초과 수·최대 간격 증가 없음',{skip,timeout:480000},async()=>{
 const {compareOrbit,combinations}=await import('../tools/orbit-perf/1086-compare.mjs');
 const results=await compareOrbit({main:MAIN,current:ROOT,out:process.env.LT_ORBIT1086_CAPTURE_DIR});
 assert.equal(results.length,combinations.length*2);
 const med=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
 const summarize=r=>{const frames=r.groups.reduce((n,g)=>n+g.frames,0),over50=r.groups.reduce((n,g)=>n+g.over50,0);
  return {frames,over50,ratio:Math.round(over50/Math.max(1,frames)*10000)/10000,median:Math.round(med(r.groups.map(g=>g.median))*10)/10,max:Math.round(Math.max(...r.groups.map(g=>g.max))*10)/10};};
 // 실제 회귀 판정: ① 50ms 초과 비율이 기준의 두 배를 넘고 1%p 이상 늘었다 ② 묶음 중앙 간격이 기준보다 20% 넘게 늘었다(한 프레임 16.7ms가 33ms로) ③ 최대 간격이 기준보다 50ms 넘게 늘었다.
 const regressed=(b,a)=>(a.ratio>b.ratio*2&&a.ratio-b.ratio>=0.01)||a.median>b.median*1.2||a.max>b.max+50;
 const failures=[];
 for(const [width,,theme] of combinations){
  const before=summarize(results.find(x=>x.width===width&&x.theme===theme&&x.variant==='before'));
  const after=summarize(results.find(x=>x.width===width&&x.theme===theme&&x.variant==='after'));
  console.log(JSON.stringify({width,theme,before,after}));
  if(regressed(before,after))failures.push({width,theme,before,after});
 }
 assert.deepEqual(failures,[],'헤드리스 궤도 성능 회귀');
});
