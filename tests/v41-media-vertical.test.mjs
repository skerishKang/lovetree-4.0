import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {parseMomentLink} from '../src/media.js';
// media-preview.js 는 클래식 스크립트(IIFE)라 vm 으로 읽어 window.LTMedia 를 본다(기존 시험과 같은 방법).
const scope={window:{},URL,URLSearchParams};vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js',import.meta.url),'utf8'),scope);const media=scope.window.LTMedia;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const SHORTS='https://www.youtube.com/shorts/9NXOCr-T8LU';
const WATCH='https://www.youtube.com/watch?v=abc123DEF45';
const OWNER={source:'server',owned:true};

test('#393 세로 판정 한 벌: /shorts/ 주소는 세로, 그 밖의 YouTube 형태는 가로',()=>{
 const rows=[
  [SHORTS,true],[SHORTS+'?t=30',true],['https://youtube.com/shorts/abc123DEF45',true],['https://m.youtube.com/shorts/abc123DEF45',true],
  [WATCH,false],['https://youtu.be/abc123DEF45',false],['https://youtube.com/live/abc123DEF45',false],['https://youtube.com/embed/abc123DEF45',false],
  ['https://example.test/a.mp4',false],['https://example.test/a.png',false],['https://example.test/notes',false],['',false]];
 for(const [url,want] of rows)assert.equal(media.verticalVideo(url),want,url);
 // 주소 판정은 src/media.js 파서와 같다(파서 동기화).
 for(const url of [SHORTS,WATCH])assert.equal(media.describe(url).vertical,parseMomentLink(url).vertical,url);
});

test('#393 세로 판정: 영상 정보의 가로세로(세로가 더 길면 세로)도 같은 함수로',()=>{
 assert.equal(media.verticalVideo(WATCH,{width:1080,height:1920}),true,'세로 비율 정보 → 세로 틀');
 assert.equal(media.verticalVideo(WATCH,{width:1920,height:1080}),false,'가로 비율 정보 → 가로 틀');
 assert.equal(media.verticalVideo(WATCH,{width:0,height:0}),false,'0 값은 판정에 쓰지 않는다');
 assert.equal(media.verticalVideo(WATCH,null),false);
 assert.equal(media.verticalVideo('https://example.test/a.mp4',{width:1080,height:1920}),false,'YouTube 가 아니면 주소·정보 모두 세로 아님');
});

test('#393 썸네일 주소 한 벌: 세로는 원본 비율(oardefault·잘림 없음), 가로는 hqdefault',()=>{
 assert.equal(media.youtubeThumbUrl('abc123DEF45',true),'https://i.ytimg.com/vi/abc123DEF45/oardefault.jpg');
 assert.equal(media.youtubeThumbUrl('abc123DEF45',false),'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
 assert.equal(media.describe(SHORTS).loadUrl,'https://i.ytimg.com/vi/9NXOCr-T8LU/oardefault.jpg');
 assert.equal(media.describe(WATCH).loadUrl,'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
});

test('#393 세로 영상 마크업: 세로 틀 표시·원본 비율 썸네일·hqdefault/mqdefault 물러남·크게 보기 단추',()=>{
 const html=media.markup(SHORTS,'세로 영상',null,'m1',OWNER);
 assert.match(html,/data-lt-vertical="1"/);
 assert.match(html,/src="https:\/\/i\.ytimg\.com\/vi\/9NXOCr-T8LU\/oardefault\.jpg"/);
 assert.match(html,/data-lt-candidates="[^"]*oardefault\.jpg[^"]*hqdefault\.jpg[^"]*mqdefault\.jpg[^"]*"/);
 assert.match(html,/data-lt-expand/);
 assert.match(html,/크게 보기/);
 // 누르기 전에는 iframe·autoplay 가 없다(기존 규칙 그대로).
 assert.doesNotMatch(html,/<iframe/i);
 assert.doesNotMatch(html,/autoplay/);
 assert.match(html,/referrerpolicy="no-referrer"/);
});

test('#393 가로 영상 마크업: 가로 틀 유지·잘림 없는 썸네일·크게 보기 단추',()=>{
 const html=media.markup(WATCH,'가로 영상',null,'m1',OWNER);
 assert.doesNotMatch(html,/data-lt-vertical/);
 assert.match(html,/src="https:\/\/i\.ytimg\.com\/vi\/abc123DEF45\/hqdefault\.jpg"/);
 assert.match(html,/data-lt-expand/);
 // 세로 비율 정보가 붙은 watch 주소도 세로 틀 + 원본 비율 썸네일(물러남 포함).
 const meta=media.markup(WATCH,'세로 정보', {width:1080,height:1920},'m1',OWNER);
 assert.match(meta,/data-lt-vertical="1"/);
 assert.match(meta,/oardefault\.jpg/);
 assert.match(meta,/data-lt-candidates="[^"]*hqdefault\.jpg[^"]*mqdefault\.jpg/);
});

test('#393 공유·예시·로그아웃: 누르기 전 외부 요청 0 그대로 — 크게 보기는 눌렀을 때만 연다',()=>{
 for(const ctx of [{source:'share',owned:true},{source:'example',owned:true},{source:'server',owned:false},undefined]){
  const html=media.markup(SHORTS,'제목',null,'m1',ctx);
  assert.doesNotMatch(html,/<img|<iframe/i,'ctx='+JSON.stringify(ctx));
  assert.doesNotMatch(html,/i\.ytimg\.com/,'ctx='+JSON.stringify(ctx));
  assert.match(html,/data-lt-load/);
  assert.match(html,/data-lt-expand/,'크게 보기 단추는 있어도 눌렀을 때만 요청한다');
 }
 // 사진·일반 링크에는 크게 보기 단추를 붙이지 않는다(영상 전용).
 assert.doesNotMatch(media.markup('https://example.test/a.png','사진',null,'m1',OWNER),/data-lt-expand/);
 assert.doesNotMatch(media.markup('https://example.test/notes','링크',null,'m1',OWNER),/data-lt-expand/);
 assert.doesNotMatch(media.markup('javascript:alert(1)','x',null,'m1',OWNER),/data-lt-expand/);
});

test('#393 크게 보기 연결: embed 한 벌·전체 화면 허용·바깥 클릭/Esc 복귀·닫으면 재생 정지',()=>{
 const src=read('public/v41/media-preview.js');
 // 재생 주소는 기존 embedUrl 한 벌에서만 만든다(시작 시간 유지).
 assert.match(src,/import\('\/v41\/book-usability\.mjs'\)/);
 assert.match(src,/usability\.embedUrl\(m\.videoId,m\.startSeconds\)/);
 // 유튜브 자체 전체 화면은 그대로 쓸 수 있다.
 assert.match(src,/frame\.allowFullscreen=true/);
 // 바깥 클릭·Esc·닫기 단추로 닫고, 닫으면 노드를 치워 재생도 멈춘다.
 assert.match(src,/if\(e\.target===overlay\)closeLightbox\(\)/);
 assert.match(src,/e\.key==='Escape'/);
 assert.match(src,/node\.remove\(\)/);
 // 초점 복귀·비공개 파일 blob 정리.
 assert.match(src,/opener\.focus\(\{preventScroll:true\}\)/);
 assert.match(src,/URL\.revokeObjectURL\(lightboxBlob\)/);
 // 크게 보기 단추 클릭 연결.
 assert.match(src,/closest\('\[data-lt-expand\]'\)/);
 // 세로 영상 파일은 영상 정보(가로세로)로 틀을 바꾼다.
 assert.match(src,/video\.videoHeight>video\.videoWidth/);
 assert.match(src,/element\.videoHeight>element\.videoWidth/);
});

test('#393 기억책 연결: 세로 틀·원본 비율 썸네일·크게 보기·재생 틀까지 같은 판정',()=>{
 const extra=read('public/v41/views/book/book-extra.js');
 const css=read('public/v41/views/book/book-usability.css');
 const book=read('public/v41/views/book/book.js');
 // 판정·주소는 LTMedia 한 벌(화면 하드코딩 없음).
 assert.match(extra,/LTMedia\.verticalVideo\(safe\.url,safe\.mediaMetadata\)/);
 assert.match(extra,/LTMedia\.youtubeThumbUrl\(media\.videoId,true\)/);
 assert.match(extra,/thumbFallbackAttrs\(m,/,'공용 썸네일 내려가기 모듈로 물러난다(#429)');
 assert.doesNotMatch(extra,/i\.ytimg\.com/);
 // 세로 표시·재생 틀.
 assert.match(extra,/class="yt-play'\+\(vertical\?' is-vertical':''\)/);
 assert.match(extra,/data-yt-vertical="1"/);
 assert.match(extra,/frame\.className='yt-frame'\+\(yt\.dataset\.ytVertical==='1'\?' is-vertical':''\)/);
 // 크게 보기 단추와 연결.
 assert.match(extra,/data-yt-expand/);
 assert.match(extra,/LTMedia\.openLightbox\(m\.url,titleViewFor\(m\)\.main,LTMedia\.verticalVideo\(m\.url,m\.mediaMetadata\)\)/);
 // CSS: 가로 16:9, 세로 9:16, 세로 썸네일은 잘리지 않게 contain.
 assert.match(css,/\.yt-play\{[^}]*aspect-ratio:16\/9/);
 assert.match(css,/\.yt-play\.is-vertical\{[^}]*aspect-ratio:9\/16/);
 assert.match(css,/\.yt-play\.is-vertical img\{object-fit:contain\}/);
 assert.match(css,/\.yt-frame\{[^}]*aspect-ratio:16\/9/);
 assert.match(css,/\.yt-frame\.is-vertical\{[^}]*aspect-ratio:9\/16/);
 // 크게 보기 중에는 화살표 넘김·상세 Esc 가 책 뒤에서 동작하지 않는다.
 assert.match(book,/document\.querySelector\('\.lt-lightbox'\)/);
 assert.match(extra,/if\(document\.querySelector\('\.lt-lightbox'\)\)return/);
 // 세로 영상(주소 판정)은 책 페이지 위쪽 크게, 제목·메모는 아래로.
 assert.match(book,/vertical\?media\+`<h2>/);
});

test('#393 순간 상세 창(첫 화면 궤도 대화상자)도 같은 틀 규칙',()=>{
 const orbit=read('src/views/orbit.js');
 assert.match(orbit,/globalThis\.LTMedia\?\.verticalVideo\?\.\(c\.url,c\.mediaMetadata\)/);
 assert.match(orbit,/detail-image\$\{vertical\?' detail-image--vertical':''\}/);
 assert.match(orbit,/\.detail-image--vertical\{[^}]*aspect-ratio:9\/16/);
});

test('#393 공통 틀·크게 보기 CSS: 세로 9:16·어두운 깔개·최상단·움직임 줄이기 배려',()=>{
 const css=read('public/v41/identity.css');
 assert.match(css,/\.lt-media\[data-lt-vertical="1"\] \.lt-yt-frame\{[^}]*aspect-ratio:9\/16/);
 assert.match(css,/\.lt-media\[data-lt-vertical="1"\] \.lt-yt-preview\{[^}]*aspect-ratio:9\/16/);
 assert.match(css,/\.lt-media\[data-lt-vertical="1"\] \.lt-media-body img\{[^}]*object-fit:contain!important/);
 assert.match(css,/\.lt-lightbox\{position:fixed;inset:0;z-index:400/);
 assert.match(css,/\.lt-lightbox-vertical \.lt-lightbox-media\{[^}]*aspect-ratio:9\/16/);
 assert.match(css,/\.lt-lightbox-media\{[^}]*aspect-ratio:16\/9/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.lt-lightbox\{backdrop-filter:none\}\}/);
});