// #429 2/2 — 첫 화면 카드 배치 계약(불투명·크기·밝기 깊이·가운데 안전 구역·폭별 카드 수 상한)과
// 둘러보기 감상자 차단 문구("발견" → "둘러보기"). 소스 계약은 정규식, DOM 검증은 별도 브라우저 시험에서 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');
const orbitCSS = readFileSync(new URL('../src/views/orbit-source.css', import.meta.url), 'utf8');
const community = readFileSync(new URL('../public/v41/community-panel.mjs', import.meta.url), 'utf8');

test('카드 수 상한: 폭별 값을 코드가 약속대로 돌려준다', () => {
  // 1280 이상 28장, 900~1279 20장, 650~899 14장, 그 아래(390 포함) 10장 — PR 본문에 적은 값과 같다.
  assert.match(orbit, /CARD_CAPS=\[\[1280,28\],\[900,20\],\[650,14\],\[0,10\]\]/);
  const evalCap = (w) => {
    const m = orbit.match(/const CARD_CAPS=(\[\[.*?\]\]);/);
    assert.ok(m, 'CARD_CAPS 표가 있다');
    for (const [min, cap] of JSON.parse(m[1].replaceAll('],[', '],['))) if (w >= min) return cap;
    return 10;
  };
  assert.equal(evalCap(1440), 28);
  assert.equal(evalCap(1280), 28);
  assert.equal(evalCap(1279), 20);
  assert.equal(evalCap(900), 20);
  assert.equal(evalCap(899), 14);
  assert.equal(evalCap(650), 14);
  assert.equal(evalCap(649), 10);
  assert.equal(evalCap(390), 10);
});

test('상한을 넘는 카드는 frame에서 숨기고, 폭이 넓어지면 다시 보인다', () => {
  assert.match(orbit, /if\(i>=cardCapFor\(w\)\)\{el\.style\.display='none';return;\}/);
  assert.match(orbit, /if\(el\.style\.display==='none'\)el\.style\.display='';/);
});

test('카드는 언제나 불투명하고, blur 대신 밝기로 깊이를 낸다', () => {
  assert.doesNotMatch(orbit, /el\.style\.opacity=/, '카드 opacity 인라인 없음');
  // 카드 규칙(.card를 포함한 선택자) 하나하를 훑어 반투명·mix-blend·blur가 없음을 확인한다.
  const rules=[...orbitCSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const cardRules=rules.filter(([,sel])=>/\.card/.test(sel));
  assert.ok(cardRules.length>0, '카드 규칙이 있다');
  for (const [sel,body] of cardRules) {
    assert.doesNotMatch(body, /opacity:\s*0?\.[0-9]/, `반투명 없음: ${sel.trim().slice(0,40)}`);
    assert.doesNotMatch(body, /mix-blend/, `mix-blend 없음: ${sel.trim().slice(0,40)}`);
    assert.doesNotMatch(body, /blur/, `blur 없음: ${sel.trim().slice(0,40)}`);
  }
  assert.match(orbit, /el\.style\.filter=`brightness\(/, '깊이 = 밝기');
  assert.match(orbit, /0\.78\+0\.22\*depth/, '뒤쪽 카드는 밝기 0.78까지');
  // 원형 배치(8장 이하)는 같은 깊이이므로 전체가 어두워지지 않게 밝기 1이다.
  assert.match(orbit, /const depth=\(!demo&&cards\.length<=8\)\?1:/);
});

test('가운데 안전 구역: 제목·버튼 묶음 사각형+여백을 재고, 창이 바뀌면 다시 잰다', () => {
  assert.match(orbit, /const measureSafeZone=\(\)=>\{const c=shadow\.querySelector\('\.center'\)/);
  assert.match(orbit, /,M=32;/, '안전 구역 여백 32px');
  assert.match(orbit, /fitNotice=\(\)=>\{host\.style\.height=`calc\(100dvh - \$\{noticeOuter\(\)\}px\)`;safeZoneDirty=true;schedule\(\);/, '창 크기 변경(fitNotice)마다 다시 잰다');
  assert.match(orbit, /setTimeout\(\(\)=>\{safeZoneDirty=true;schedule\(\);\},1500\)/, '글꼴 도착 뒤에도 다시 잰다(fonts.ready 접근은 뼈대 완성을 늦추므로 타이머를 쓴다)');
  // 카드 사각형(회전 여유 18%)과 겹치면 가장 얇은 쪽으로 민다 — 겹침 0 보장.
  assert.match(orbit, /const sxp=w\/2\+\(Cx0-w\/2\+x2\*sc\)\*k/, '카드 위치까지 포함한 원근 투영 계산');
  assert.match(orbit, /const pushL=maxX-zs\.l,pushR=zs\.r-minX,pushT=maxY-zs\.t,pushB=zs\.b-minY/, '가장 얇은 쪽으로 밀어낸다');
  // 옛 고정 타원 밀어내기는 안전 구역 판정으로 대체됐다.
  assert.doesNotMatch(orbit, /Math\.hypot\(x\/520,y\/260\)/);
});

test('#457 좁은 화면(≤650): 가로는 먼저 화면 안으로 당기고, 안전 구역과 겹치면 위·아래 띠로만 민다', () => {
  // 넓은 화면은 네 쪽 중 가장 얇은 쪽(가로 포함)으로 민다 — 기존 동작(#440) 유지.
  assert.match(orbit, /const pushL=maxX-zs\.l,pushR=zs\.r-minX,pushT=maxY-zs\.t,pushB=zs\.b-minY,m=Math\.min\(pushL,pushR,pushT,pushB\);/, '넓은 화면은 그대로');
  assert.match(orbit, /if\(m===pushL\)px-=pushL;else if\(m===pushR\)px\+=pushR;else if\(m===pushT\)py-=pushT;else py\+=pushB;/);
  // 좁은 화면 분기: 가로를 먼저 화면 안(0..w)으로 당긴다.
  assert.match(orbit, /if\(narrow\)\{/);
  const narrowBlock = orbit.split('if(narrow){')[1]?.split('} else if(maxX>zs.l')[0] || '';
  assert.match(narrowBlock, /if\(minX<0\)\{px-=minX;maxX-=minX;minX=0;\}else if\(maxX>w\)\{const over=maxX-w;px-=over;maxX-=over;minX-=over;\}/, '가로 클램프가 세로 밀기보다 먼저');
  // 가로로 당긴 뒤의 위치로 안전 구역과 겹치는지 다시 보고, 겹치면 위·아래 띠로만 민다(가로는 더 건드리지 않는다).
  assert.match(narrowBlock, /const pushT=maxY-zs\.t,pushB=zs\.b-minY,upFits=minY-pushT>=0,downFits=maxY\+pushB<=h;/);
  assert.doesNotMatch(narrowBlock.split('pushT=maxY-zs.t')[1], /\bpx-=|\bpx\+=/, '겹침을 다시 민 뒤에는 px(가로)를 건드리지 않는다');
  // 띠 둘 다 못 담는 카드는 보여 주는 대신 숨긴다("카드 수를 줄인다").
  assert.match(narrowBlock, /if\(!upFits&&!downFits\)\{el\.style\.display='none';return;\}/);
  // 민 뒤에도 화면 세로 안(0..h)에 남게 마지막으로 다듬고, 그래도 안전 구역과 겹치면 숨긴다(안전 구역 침범 0 보장).
  assert.match(narrowBlock, /if\(minY<0\)\{py-=minY;maxY-=minY;minY=0;\}else if\(maxY>h\)/);
  assert.match(narrowBlock, /if\(maxX>zs\.l&&minX<zs\.r&&maxY>zs\.t&&minY<zs\.b\)\{el\.style\.display='none';return;\}/);
});

test('둘러보기 감상자 차단 문구에 "발견"이 남지 않는다', () => {
  assert.match(community, /내 둘러보기 목록에서 숨길까요\?/);
  assert.match(community, /내 둘러보기 목록에서 숨겼어요\./);
  assert.doesNotMatch(community, /발견 목록/);
});
