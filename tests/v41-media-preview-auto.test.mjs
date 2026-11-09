import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {embedUrl} from '../public/v41/book-usability.mjs';
// media-preview.js 는 클래식 스크립트(IIFE)라 vm 으로 읽어 window.LTMedia 를 본다(기존 시험과 같은 방법).
const scope={window:{},URL,URLSearchParams};vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js',import.meta.url),'utf8'),scope);const media=scope.window.LTMedia;
const YT='https://www.youtube.com/watch?v=abc123DEF45&start=83';
const PHOTO='https://example.test/a.png';
const PRIVATE='https://lovetree-4-0.pages.dev/api/media/12345678-1234-4234-8234-123456789abc.png';

test('autoLoadMedia: 내 기록(서버·로그인 소유자)만 자동으로 불러온다',()=>{
 // source × owned 전체 표 — 'server'+소유자만 참이다.
 const rows=[
  ['server',true,true],['server',false,false],['server',undefined,false],
  ['share',true,false],['example',true,false],['file',true,false],
  ['',true,false],[undefined,undefined,false],['SERVER',true,false]];
 for(const [source,owned,want] of rows)assert.equal(media.autoLoadMedia(source,owned),want,`source=${source} owned=${owned}`);
});

test('내 기록의 YouTube 순간은 처음부터 썸네일을 보여 주고 재생 표시를 덮는다',()=>{
 const html=media.markup(YT,'바다 산책',null,'m1',{source:'server',owned:true});
 // 썸네일: i.ytimg.com 요청이 처음부터 마크업에 있다(no-referrer·lazy).
 assert.match(html,/src="https:\/\/i\.ytimg\.com\/vi\/abc123DEF45\/hqdefault\.jpg"/);
 assert.match(html,/referrerpolicy="no-referrer"/);
 assert.match(html,/loading="lazy"/);
 assert.match(html,/decoding="async"/);
 assert.match(html,/alt="바다 산책"/);
 // 재생 표시: 썸네일 위 단추. 누르기 전에는 iframe 이 없다(autoplay 는 누른 뒤에만).
 assert.match(html,/data-lt-play/);
 assert.match(html,/aria-label="여기서 재생"/);
 assert.doesNotMatch(html,/<iframe/i);
 assert.doesNotMatch(html,/autoplay/);
 // 원본 링크는 그대로 남고, 시작 시간도 안내에 유지된다.
 assert.match(html,/href="https:\/\/www\.youtube\.com\/watch\?v=abc123DEF45&amp;t=83s"/);
 assert.match(html,/원본 링크|YouTube에서 열기/);
 assert.match(html,/시작 1:23/);
 assert.match(html,/재생을 누르면 여기서 바로 재생해요\./);
 // 기존 '불러오기' 단추로는 바뀌지 않는다.
 assert.doesNotMatch(html,/data-lt-load/);
});

test('공유·예시·파일·로그아웃은 기존 규칙 그대로 — 누를 때만 요청한다',()=>{
 for(const ctx of [{source:'share',owned:true},{source:'example',owned:true},{source:'file',owned:true},{source:'server',owned:false},undefined]){
  const html=media.markup(YT,'제목',null,'m1',ctx);
  assert.match(html,/data-lt-load/,'ctx='+JSON.stringify(ctx));
  assert.match(html,/영상 썸네일 불러오기/);
  assert.doesNotMatch(html,/i\.ytimg\.com/,'ctx='+JSON.stringify(ctx));
  assert.doesNotMatch(html,/data-lt-play/);
  assert.doesNotMatch(html,/<img|<iframe/i);
  assert.match(html,/불러오기를 누르면 원본 사이트에 연결됩니다\./);
 }
});

test('비공개 /api/media 사진·영상 불러오기와 일반 링크는 내 기록에서도 그대로다',()=>{
 const priv=media.markup(PRIVATE,'내 사진',null,'m1',{source:'server',owned:true});
 assert.match(priv,/data-lt-load/);
 assert.match(priv,/사진 불러오기/);
 assert.doesNotMatch(priv,/data-lt-play/);
 assert.doesNotMatch(priv,/<img/i);
 const photo=media.markup(PHOTO,'사진 링크',null,'m1',{source:'server',owned:true});
 assert.match(photo,/data-lt-load/);
 assert.doesNotMatch(photo,/data-lt-play/);
 const invalid=media.markup('javascript:alert(1)','x',null,'m1',{source:'server',owned:true});
 assert.doesNotMatch(invalid,/href=/);
});

test('그 자리 재생 주소는 book-usability.mjs 의 embedUrl 한 벌에서 만든다',()=>{
 // 재생 단추를 누른 뒤 만들어지는 embed 주소(autoplay 포함)는 기존 한 벌을 재사용한다.
 assert.equal(embedUrl('abc123DEF45',83),'https://www.youtube-nocookie.com/embed/abc123DEF45?autoplay=1&rel=0&start=83');
 assert.equal(embedUrl('abc123DEF45',0),'https://www.youtube-nocookie.com/embed/abc123DEF45?autoplay=1&rel=0');
 assert.equal(embedUrl('short',1),null);
 // 페이지 스크립트 동작(재생 단추 → embedUrl 로 iframe 교체)은 글자 검사로 연결을 고정한다.
 const src=readFileSync(new URL('../public/v41/media-preview.js',import.meta.url),'utf8');
 assert.match(src,/import\('\/v41\/book-usability\.mjs'\)/,'재생 주소는 book-usability 의 embedUrl 에서만 만든다');
 assert.match(src,/usability\.embedUrl\(m\.videoId,m\.startSeconds\)/,'시작 시간을 유지한다');
 assert.match(src,/youtube-nocookie|embedUrl/);
 assert.match(src,/data-lt-play/);
});

test('markup 은 기존 호출(문맥 인수 없음)과도 같은 결과를 낸다 — 화면 고침 없이 판정을 쓴다',()=>{
 // 문맥 인수를 넣지 않아도 기존 화면 호출이 그대로 동작한다(누를 때만).
 const before=media.markup(YT,'제목',null,'m1');
 assert.match(before,/data-lt-load/);
 assert.doesNotMatch(before,/i\.ytimg\.com/);
});
