import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOTICE_SCENES, showFixedNotices } from '../tools/visual-baseline/notice-scenes.mjs';
import { STABILIZE } from '../tools/visual-baseline/capture-stability.mjs';

const captureSource = readFileSync(new URL('../tools/visual-baseline/visual-baseline.mjs', import.meta.url), 'utf8');

test('#1626 기존 숨김·비교 기준과 일반 장면을 유지한다', () => {
  assert.match(STABILIZE, /#toast,\.toast,\[role="status"\]\{visibility:hidden!important\}/);
  assert.match(captureSource, /const SCENE_THRESHOLDS = \{ board: 0\.5 \};/);
  assert.match(captureSource, /threshold: 0\.1/);
  assert.match(captureSource, /const SHOT_BUDGET_MS = 25000;/);
  assert.match(captureSource, /scene\.notices && theme !== 'night'/);
  assert.match(captureSource, /viewport\.tag === '1440' \|\| viewport\.tag === '390'/);
  assert.deepEqual(NOTICE_SCENES.map(({name,hash,expect,notices})=>({name,hash,expect,notices})), [
    {name:'home-notices',hash:'',expect:'/v41/home',notices:true},
    {name:'shelf-notices',hash:'#shelf',expect:'track32-bookshelf',notices:true}
  ]);
});

test('#1626 전용 장면에서만 기존 알림·새 소식·상태 표시를 고정 문구로 드러낸다', () => {
  const elems = Object.fromEntries(['toast','updates-card','updates-card-text','save-feedback','save-message','save-actions'].map(id=>[id,{hidden:true,textContent:'',childNodes:[{}],replaceChildren(){this.childNodes=[];this.empty=true}}]));
  const appended = [];
  const classes = new Set();
  const doc = {
    getElementById(id) {return elems[id]||null},
    querySelector(selector) {return selector==='style[data-visual-notices]'?appended[0]||null:null},
    createElement(name) {assert.equal(name,'style');return {dataset:{},textContent:''}},
    documentElement: {classList:{add(name){classes.add(name)}},append(style){appended.push(style)}}
  };
  const previous=globalThis.document;
  globalThis.document=doc;
  try {
    assert.deepEqual(showFixedNotices(),{
      toast:'시험 알림: 기록이 안전하게 저장되었습니다.',
      update:'시험 새 소식: 업데이트를 확인해 주세요.',
      status:'시험 상태: 저장을 완료했습니다.'
    });
    for(const id of ['toast','updates-card','save-feedback'])assert.equal(elems[id].hidden,false,id);
    assert.equal(elems['save-actions'].empty,true);
    assert.equal(classes.has('visual-baseline-notices'),true);
    assert.equal(appended.length,1);
    assert.match(appended[0].textContent,/visibility:visible!important/);
    assert.match(appended[0].textContent,/translate:0 0px!important/);
    showFixedNotices({shift:32});
    assert.equal(appended.length,1,'추가 촬영에서도 같은 시험용 스타일을 재사용한다');
    assert.match(appended[0].textContent,/translate:0 32px!important/);
  } finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous}
});
