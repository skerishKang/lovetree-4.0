#!/usr/bin/env node
// 기억책 사용성 1~9(2026-11-08 대표 피드백)을 원본 Track59 화면 두 사본에 같은 내용으로 적용한다.
// - public/v41/views/track59-sketchbook.html        : 실제 기록(셸이 views/를 연다)
// - public/v41/design/views/track59-sketchbook.html : 예시 기록(셸이 design/views/를 연다)
// 원본 구조·질감은 그대로 두고, 어댑터 CSS + 화면 보조 스크립트를 덧붙인다. 여러 번 실행해도 결과가 같다.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOK_UI_FONT, bookTitleFont } from '../public/v41/book-usability.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const COPIES = [
  ['public/v41/views/track59-sketchbook.html', '../'],
  ['public/v41/design/views/track59-sketchbook.html', '../../'],
];

const STYLE_TAG = '<style id="lt-book-usability">';
const PANEL_TAG = '<div class="detail-panel" id="detailSide" role="dialog" aria-label="순간 상세" hidden></div>';

function styleBlock() {
  return `${STYLE_TAG}
/* 2026-11-08 기억책 사용성(대표 피드백 1~9). 색·모양은 identity.css의 --lt-* 토큰만 쓴다.
   밤/정원 모두 같은 규칙을 쓰고, 밤의 강조는 금테, 종이 위 글자는 --lt-rose-ink(--lt-gold-ink)다. */
html[data-v41-screen=book] .moment{cursor:pointer}
html[data-v41-screen=book] .moment:hover{filter:brightness(1.02)}
/* 7. 글꼴(대표 결정 2026-11-08): 밤은 기억책 큰 제목까지 전부 Pretendard. 마루부리는 쓰지 않는다.
   정원(html[data-lt-theme=garden])만 큰 제목에 마루부리(한글 포함)를 쓴다. 본문·날짜·단추·안내는 두 테마 모두 Pretendard. */
html[data-v41-screen=book]{--book-serif:${BOOK_UI_FONT};--hand:${BOOK_UI_FONT};--lt-reading:${bookTitleFont('night')}}
html[data-v41-screen=book] .moment-title h3,html[data-v41-screen=book] .note-piece h2,html[data-v41-screen=book] .clipping h2,
html[data-v41-screen=book] .letter h2,html[data-v41-screen=book] .archive-piece h2,html[data-v41-screen=book] .viewer-card h2,
html[data-v41-screen=book] .detail h2,html[data-v41-screen=book] .folio,html[data-v41-screen=book] .photo-caption{font-family:var(--lt-reading)!important}
html[data-v41-screen=book] .note-piece p,html[data-v41-screen=book] .letter p,html[data-v41-screen=book] .clipping p,
html[data-v41-screen=book] .detail-why,html[data-v41-screen=book] .turn-why span,html[data-v41-screen=book] .why-margin,
html[data-v41-screen=book] .connection-note p,html[data-v41-screen=book] .link-preview p,html[data-v41-screen=book] .link-preview .preview-why,
html[data-v41-screen=book] .link-preview h3,html[data-v41-screen=book] .archive-item b,html[data-v41-screen=book] .meta-why{font-family:var(--lt-ui)!important}
/* 정원 테마의 한글 제목: Gowun Batang 라틴 서브셋에는 한글 글리프가 없어 다른 글꼴로 그려졌다.
   종이(책장)는 원본 종이를 그대로 두고, 어댑터가 새로 그리는 면(안내·상세·재생 단추)만 정원 토큰을 쓴다. */
html[data-v41-screen=book][data-lt-theme=garden]{--lt-reading:${bookTitleFont('garden')}}
html[data-v41-screen=book][data-lt-theme=garden] .moment-title h3,html[data-v41-screen=book][data-lt-theme=garden] .note-piece h2,
html[data-v41-screen=book][data-lt-theme=garden] .clipping h2,html[data-v41-screen=book][data-lt-theme=garden] .letter h2,
html[data-v41-screen=book][data-lt-theme=garden] .archive-piece h2{font-family:${bookTitleFont('garden')}!important}
/* 2026-11-08: 카드 위 겹침이 재생 단추 클릭을 가로채지 않게 한다. */
html[data-v41-screen=book] .yt-play{position:relative;z-index:3;cursor:pointer}
html[data-v41-screen=book] .moment-title{pointer-events:none}
html[data-v41-screen=book] .moment-title .title-edit{pointer-events:auto}
/* #212: 목차 머리에 붙는 트리 이름 한 줄. 두 테마 모두 UI 글꼴을 쓴다. */
html[data-v41-screen=book] .archive-tree{margin:6px 0 0;font:12px var(--lt-ui);letter-spacing:.06em;color:var(--lt-muted,#a78f92)}
html[data-v41-screen=book] .next-page button{background:var(--lt-gold-ink);border-color:var(--lt-gold-ink);color:var(--lt-paper)}
html[data-v41-screen=book][data-lt-theme=garden] .ambient{background:linear-gradient(135deg,var(--lt-stage),var(--lt-stage-2) 56%,var(--lt-garden-edge))}
html[data-v41-screen=book][data-lt-theme=garden] .next-page button{background:var(--lt-primary);border-color:var(--lt-primary);color:var(--lt-primary-ink)}
html[data-v41-screen=book][data-lt-theme=garden] .yt-placeholder{background:var(--lt-paper);color:var(--lt-ink)}
/* 8. 책 가운데 머리 표시("01 · 날짜")를 없앤다. 날짜는 카드 아래 정보 줄에만, 페이지 번호는 아래 모서리에만. */
html[data-v41-screen=book] .eyebrow{display:none}
/* 모바일 머리 표시도 같은 이유로 감춘다(날짜는 정보 줄에만, 페이지 위치는 아래 이동 줄에). */
html[data-v41-screen=book] .mobile-kicker{display:none}
html[data-v41-screen=book] .mobile-content{padding:22px 22px 26px 26px}
html[data-v41-screen=book] .mobile-page .note-piece{padding:18px 16px 16px;margin:6px 0 0}
html[data-v41-screen=book] .mobile-page .clipping{margin:6px 0 0;padding:14px 15px 15px}
html[data-v41-screen=book] .mobile-page .note-piece h2,html[data-v41-screen=book] .mobile-page .clipping h2{font-size:20px;margin-bottom:8px}
html[data-v41-screen=book] .mobile-page .note-piece p{font-size:14px;line-height:1.7}
html[data-v41-screen=book] .mobile-support{margin-top:12px;padding:8px 10px}
html[data-v41-screen=book] .mobile-page .moment-title{margin:8px 0 0}
html[data-v41-screen=book] .mobile-page .moment-title h3{font-size:18px}
html[data-v41-screen=book] .mobile-page .moment-title .moment-note{font-size:15px;-webkit-line-clamp:2}
html[data-v41-screen=book] .mobile-support.next-page{position:static;inset:auto;display:block;height:auto;text-align:center;padding:14px 12px}
html[data-v41-screen=book] .mobile-support.next-page b{font-family:var(--lt-reading);font-size:15px}
/* 390에서는 상세를 아래에서 올라오는 카드로 보여 준다(넘겨도 닫기·Esc 그대로). */
@media (max-width:820px){
 html[data-v41-screen=book] #detailSide{position:fixed;left:8px;right:8px;bottom:8px;top:auto;max-height:70vh;overflow:auto;z-index:70;box-shadow:0 18px 48px rgba(20,8,16,.45)}
}
html[data-v41-screen=book] .mobile-support.next-page button{margin-top:10px;min-height:44px;padding:9px 16px;border-radius:var(--lt-r-pill);border:1px solid var(--lt-gold-ink);background:var(--lt-gold-ink);color:var(--lt-paper);font-size:14px;cursor:pointer}
/* 3. 한 순간이 한 페이지에 다 들어오게: 페이지 안 스크롤 없이 썸네일 최대 높이와 여백을 줄인다. */
html[data-v41-screen=book] .page-content{overflow:hidden;overscroll-behavior:auto}
html[data-v41-screen=book] .page-content>.moment{display:block;margin-top:auto;margin-bottom:auto;max-height:100%}
html[data-v41-screen=book] .page-content>.moment .link-thumb{height:120px}
html[data-v41-screen=book] .photo-piece img{height:clamp(140px,26vh,250px)}
html[data-v41-screen=book] .film-piece img{height:clamp(130px,24vh,232px)}
html[data-v41-screen=book] .film-piece{margin:8px auto;padding:12px}
html[data-v41-screen=book] .photo-piece{padding:8px 8px 26px;margin:2px auto 10px}
html[data-v41-screen=book] .note-piece{min-height:0;margin:10px 8px 0;padding:24px 22px 20px}
html[data-v41-screen=book] .clipping{margin:6px 6px 0;padding:18px 20px 20px}
html[data-v41-screen=book] .letter{min-height:0;margin:4px 8px 0;padding:22px 24px 20px}
html[data-v41-screen=book] .archive-piece{margin:10px 10px 0;padding:20px}
html[data-v41-screen=book] .moment-title{margin:10px 8px 0}
html[data-v41-screen=book] .moment-title h3{font-size:20px;line-height:1.32;word-break:keep-all;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
html[data-v41-screen=book] .moment-title .moment-note{font-family:var(--lt-reading);font-size:17px;line-height:1.5;color:var(--lt-ink);margin:0 0 4px;word-break:keep-all;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
html[data-v41-screen=book] .moment-title .moment-video{font-size:12px;line-height:1.45;color:var(--lt-muted);margin:0 0 4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
html[data-v41-screen=book] .moment-title p,.mobile-content .moment-title p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
html[data-v41-screen=book] .chips{margin-top:6px;max-height:26px;overflow:hidden}
/* 1. YouTube 그 자리 재생: 누르기 전에는 썸네일·버튼뿐이고 외부 요청은 없다. */
html[data-v41-screen=book] .yt-play{position:relative;display:block;width:100%;padding:0;border:0;background:transparent;cursor:pointer}
html[data-v41-screen=book] .yt-play img{display:block;width:100%;height:clamp(130px,24vh,232px);object-fit:cover}
html[data-v41-screen=book] .yt-play .yt-play-label{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);white-space:nowrap;padding:7px 14px;border-radius:var(--lt-r-pill);border:1px solid var(--lt-gold-line);background:rgba(7,7,12,.7);color:var(--lt-pearl);font-size:13px}
html[data-v41-screen=book] .yt-placeholder{display:grid;place-items:center;height:clamp(130px,24vh,232px);background:var(--lt-paper);color:var(--lt-ink)}
html[data-v41-screen=book] .yt-placeholder .yt-play-label{position:static;transform:none}
html[data-v41-screen=book] .yt-frame{display:block;width:100%;height:clamp(130px,24vh,232px);border:0;background:#000}
/* 4·5. 오른쪽 빈 페이지 안내와 '다음 순간 남기기' */
html[data-v41-screen=book] .next-page{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;height:100%;padding:24px 18px;text-align:center}
html[data-v41-screen=book] .next-page b{font-family:var(--lt-reading);font-size:19px;font-weight:400;color:var(--lt-ink);word-break:keep-all}
html[data-v41-screen=book] .next-page p{margin:0;font-size:13px;line-height:1.6;color:var(--lt-muted);word-break:keep-all}
html[data-v41-screen=book] .next-page button{min-height:44px;padding:10px 18px;border-radius:var(--lt-r-pill);border:1px solid var(--lt-gold-ink);background:var(--lt-gold-ink);color:var(--lt-paper);font-size:14px;cursor:pointer}
html[data-v41-screen=book] .next-page button:hover{filter:brightness(1.06)}
html[data-v41-screen=book] .read-folio{position:absolute;right:20px;bottom:40px;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--lt-muted)}
html[data-v41-screen=book] .read-folio button[hidden]{display:none}
html[data-v41-screen=book] .read-folio button{min-height:44px;min-width:44px;border:0;background:transparent;color:var(--lt-rose-ink);font-size:13px;cursor:pointer}
html[data-v41-screen=book] .next-page{position:absolute;inset:0 0 56px}
/* 2. 제목 바로 고치기(기존 저장 경로 재사용: 셸 편집기에서 제목만 채우고 연다). */
html[data-v41-screen=book] .moment-title .title-edit{min-height:44px;padding:6px 10px;margin:0 8px 0 0;border:1px solid var(--lt-line-paper);border-radius:var(--lt-r-pill);background:transparent;color:var(--lt-rose-ink);font-size:13px;cursor:pointer}
html[data-v41-screen=book] .moment-title .title-edit[hidden],html[data-v41-screen=book] .moment-title .moment-video[hidden],html[data-v41-screen=book] .moment-title .moment-note[hidden]{display:none}
/* 6. 상세: 오른쪽 페이지가 비었으면 오른쪽 페이지에, 다음 순간이 있으면 카드 옆 작은 패널로. */
html[data-v41-screen=book] .page-detail{display:flex;flex-direction:column;gap:8px;padding:4px 2px}
html[data-v41-screen=book] .page-detail .detail-kicker{font-size:12px;color:var(--lt-rose-ink)}
html[data-v41-screen=book] .page-detail h2{font-family:var(--lt-reading);font-size:22px;font-weight:400;margin:0;color:var(--lt-ink);word-break:keep-all}
html[data-v41-screen=book] .page-detail p,html[data-v41-screen=book] .side-detail p{margin:0;font-size:13px;line-height:1.6;color:var(--lt-ink)}
html[data-v41-screen=book] .page-detail .detail-why{padding:9px 11px;border-left:2px solid var(--lt-rose-ink);background:rgba(189,93,114,.07);font-size:13px;line-height:1.55;color:var(--lt-ink)}
html[data-v41-screen=book] .page-detail .detail-actions,html[data-v41-screen=book] .side-detail .detail-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:4px}
html[data-v41-screen=book] .page-detail .detail-actions button,html[data-v41-screen=book] .page-detail .detail-actions a{min-height:44px;padding:8px 13px;border-radius:var(--lt-r-pill);border:1px solid var(--lt-line-paper);background:var(--lt-paper);color:var(--lt-ink);font-size:13px;cursor:pointer}
html[data-v41-screen=book] .detail-panel{position:absolute;z-index:60;width:min(240px,78%);padding:12px 13px;border:1px solid var(--lt-line-paper);border-radius:var(--lt-r-card);background:var(--lt-paper);box-shadow:0 12px 24px rgba(0,0,0,.22);display:flex;flex-direction:column;gap:7px}
html[data-v41-screen=book] .detail-panel .side-detail{display:flex;flex-direction:column;gap:7px;max-height:210px;overflow:auto}
html[data-v41-screen=book] .detail-panel .detail-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
html[data-v41-screen=book] .detail-panel .detail-kicker{font-size:11px;color:var(--lt-rose-ink)}
html[data-v41-screen=book] .detail-panel h2{font-family:var(--lt-reading);font-size:16px;font-weight:400;margin:0;color:var(--lt-ink)}
html[data-v41-screen=book] .detail-panel .detail-why{font-size:12px;line-height:1.5;padding:7px 9px;border-left:2px solid var(--lt-rose-ink);background:rgba(189,93,114,.07);color:var(--lt-ink)}
html[data-v41-screen=book] .detail-panel .detail-actions button,html[data-v41-screen=book] .detail-panel .detail-actions a{min-height:44px;padding:6px 10px;border-radius:var(--lt-r-pill);border:1px solid var(--lt-line-paper);background:transparent;color:var(--lt-ink);font-size:12px;cursor:pointer}
html[data-v41-screen=book] .detail-panel .close{width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:var(--lt-ink);font-size:17px;cursor:pointer}
@media(max-width:820px){
 html[data-v41-screen=book] .page-content{overflow:hidden}
 html[data-v41-screen=book] .mobile-content{overflow:hidden}
 html[data-v41-screen=book] .mobile-page .photo-piece img{height:clamp(150px,30vh,240px)}
 html[data-v41-screen=book] .mobile-page .film-piece img{height:clamp(140px,28vh,226px)}
 html[data-v41-screen=book] .mobile-page .note-piece{min-height:0}
 html[data-v41-screen=book] .detail-panel{left:8px;right:8px;width:auto;bottom:8px;max-height:62%}
}
</style>`;
}

const SCRIPT = `<script type="module">
// 2026-11-08 기억책 사용성 1~9 화면 보조. 데이터·저장 계약은 그대로 두고 표시만 바꾼다.
import {displayTitle,withoutAutoTitle,titleParts,embedUrl,connectionLine,readLens,writeLens,detailPlacement,nextMomentMessage,NEXT_PAGE_COPY,NEXT_PAGE_ACTION,treeTitleText} from 'PATH_PREFIXbook-usability.mjs';
const $b=s=>document.querySelector(s);
const t=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
/* 5. 돋보기: 기본 꺼짐. 선택값은 localStorage(실패하면 꺼짐). */
let lensPref=readLens(window.localStorage);
try{lensOn=lensPref}catch{}
function paintLensButton(){const b=$b('#lensBtn');if(!b)return;b.classList.toggle('active',lensPref);b.textContent=lensPref?'돋보기 켜짐':'돋보기';b.setAttribute('aria-pressed',String(lensPref))}
/* 4. '다음 순간 남기기': 이 순간을 부모로 기존 순간 추가 편집기를 연다. */
function requestNextMoment(parentId){
 if(!parentId)return;
 if(window.parent===window){toast('순간 추가는 러브트리 화면에서 열 수 있어요');return}
 // 편집기는 지금 고른 순간을 기준으로 열린다. 먼저 이 순간을 고른 뒤 추가를 연다.
 window.parent.postMessage({type:'lt41-select',id:parentId},location.origin);
 window.parent.postMessage({...nextMomentMessage(parentId)},location.origin);
}
/* 6. 상세 카드: 오른쪽 페이지가 비면 오른쪽 페이지에, 아니면 카드 옆 작은 패널로. */
let detailAnchor=null;
function nextMomentOf(id){
 const m=LTDEMO.moments.find(x=>x.id===id);
 const next=m&&LTDEMO.moments.find(x=>x.id===m.next);
 if(!next)return null;
 const edge=LTDEMO.edges.find(e=>e.kind==='parent'&&e.from===id&&e.to===next.id);
 return {id:next.id,title:displayTitle(next.title)||String(next.memo||'').trim(),reason:edge?.reason||''};
}
function closeDetail(){
 const panel=$b('#detailSide'),card=detailAnchor;
 if(panel){panel.hidden=true;panel.replaceChildren()}
 detailAnchor=null;
 $b('#detail')?.classList.remove('open');
 if(card&&card.isConnected){card.classList.remove('detail-open');card.setAttribute('tabindex','-1');try{card.focus({preventScroll:true})}catch{}}
}
function detailMarkup(m){
 const nextInfo=nextMomentOf(m.id);
 const line=connectionLine(nextInfo?.title,nextInfo?.reason);
 const open=m.url&&isYouTubeUrl(m.url)?'YouTube에서 열기 ↗':'원본 링크 열기 ↗';
 return '<div class="detail-kicker">'+t(LTLabels.type(m.kind))+' · '+t(m.date)+' · '+t(m.emotion)+'</div>'+
  (displayTitle(m.title)?'<h2>'+t(displayTitle(m.title))+'</h2>':'')+
  '<p>'+t(m.note)+' · 출처: '+t(m.source)+'</p>'+
  '<div class="chips">'+m.keywords.map(k=>'<span class="chip">#'+t(k)+'</span>').join('')+'</div>'+
  '<div class="detail-why">'+t(line||'연결 이유는 아직 적지 않았어요')+'</div>'+
  '<div class="detail-actions"><button type="button" data-detail-viewer>순간 열기</button>'+
  (m.url?'<a href="'+t(m.url)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+open+'</a>':'')+
  '<button type="button" data-detail-index>목차에서 보기</button></div>';
}
function cardFor(id){return [...document.querySelectorAll('.moment[data-moment]')].find(el=>el.dataset.moment===id&&el.closest('.page,.mobile-page'))||null}
function placeDetail(id,card){
 const m=metadataFor(id);if(!m)return;
 // 390에서는 오른쪽 페이지가 화면에 없으므로 카드 옆 패널을 쓴다.
 const rightEmpty=!!SPREADS[current].right?.synthetic&&window.innerWidth>820;
 if(detailPlacement(rightEmpty)==='right-page'){
  rightPage.innerHTML='<div class="page-detail">'+detailMarkup(m)+'</div>';
 }else{
  const panel=$b('#detailSide');if(!panel)return;
  panel.innerHTML='<div class="detail-top"><span class="detail-kicker">'+t(LTLabels.type(m.kind))+' · '+t(m.date)+'</span><button type="button" class="close" data-detail-close aria-label="상세 닫기">×</button></div><div class="side-detail">'+detailMarkup(m)+'</div>';
  panel.hidden=false;
  if(window.innerWidth<=820){panel.style.top='';}
  else{
  // 카드가 놓인 페이지의 바깥쪽 여백에 세운다. 자리가 없으면 페이지 안쪽으로 붙인다.
  const page=card.closest('.page'),rect=card.getBoundingClientRect();
  const host=panel.offsetParent||document.body,hostRect=host.getBoundingClientRect();
  const pageRect=(page||host).getBoundingClientRect();
  const pw=panel.offsetWidth||280;
  const isLeft=!page||page.classList.contains('left');
  let left=isLeft?pageRect.left-hostRect.left-pw-14:pageRect.right-hostRect.left+14;
  if(left<0||left+pw>hostRect.width)left=Math.max(8,pageRect.left-hostRect.left+10);
  panel.style.left=left+'px';panel.style.right='auto';
  panel.style.top=Math.max(8,Math.round(rect.top-hostRect.top))+'px';
  }
 }
 if(detailAnchor&&detailAnchor!==card)detailAnchor.classList.remove('detail-open');
 detailAnchor=card;
 card.classList.add('detail-open');card.setAttribute('tabindex','-1');
}
const originalShowDetail=showDetail;
showDetail=function(id){
 originalShowDetail(id);
 $b('#detail')?.classList.remove('open');
 const card=cardFor(id);
 if(card)placeDetail(id,card);
};
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const panel=$b('#detailSide');if(panel&&!panel.hidden){e.preventDefault();closeDetail();}},true);
/* 1. 실제 기록에서 재생 단추가 눌리지 않던 문제(2026-11-08): 카드 위 겹침·다른 리스너의 전파 차단에
   영향받지 않도록 pointerdown에서 먼저 잡고, 재생 주소를 못 만들면 원본 링크를 새 창으로 연다. */
function playInline(yt,media){
 const url=embedUrl(yt.dataset.ytPlay,Number(yt.dataset.ytStart||0));
 if(!url){if(media&&media.openUrl)window.open(media.openUrl,'_blank','noopener');return}
 const frame=document.createElement('iframe');frame.className='yt-frame';frame.src=url;frame.title='YouTube 영상 재생';
 frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';frame.allowFullscreen=true;
 frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 const host=yt.parentElement;if(!host)return;host.replaceChildren(frame);
}
document.addEventListener('pointerdown',e=>{
 const yt=e.target.closest&&e.target.closest('[data-yt-play]');
 if(!yt)return;
 e.preventDefault();e.stopPropagation();
 const url=yt.dataset.ytPlay?{openUrl:'https://www.youtube.com/watch?v='+yt.dataset.ytPlay+(Number(yt.dataset.ytStart||0)?'&t='+Number(yt.dataset.ytStart||0):'')}:null;
 playInline(yt,url);
},true);
document.addEventListener('click',e=>{
 const next=e.target.closest('[data-next-moment]');
 if(next){e.preventDefault();e.stopPropagation();requestNextMoment(next.dataset.nextMoment||selectedMomentId);return}
 /* 1. YouTube 그 자리 재생: 누른 뒤에만 iframe을 만든다(시작 시점 반영, referrerpolicy 엄격). */
 const yt=e.target.closest('[data-yt-play]');
 if(yt){e.preventDefault();e.stopPropagation();if(!yt.parentElement||yt.parentElement.querySelector('iframe.yt-frame'))return;
  playInline(yt,{openUrl:'https://www.youtube.com/watch?v='+yt.dataset.ytPlay});return}
 const edit=e.target.closest('[data-title-edit]');
 if(edit){e.preventDefault();e.stopPropagation();if(window.parent===window){toast('제목 고치기는 러브트리 화면에서 열 수 있어요');return}
  window.parent.postMessage({type:'lt41-select',id:edit.dataset.titleEdit},location.origin);
  window.parent.postMessage({type:'lt41-write',mode:'edit',momentId:edit.dataset.titleEdit},location.origin);return}
 if(e.target.closest('[data-detail-viewer]')){e.preventDefault();openViewer();return}
 if(e.target.closest('[data-detail-index]')){e.preventDefault();closeDetail();openArchive();return}
 if(e.target.closest('[data-detail-close]')){e.preventDefault();closeDetail();return}
},true);
/* 2. 자동 제목은 표시 단계에서만 거른다(데이터 그대로). 제목·영상 제목·마음 한마디를 나눠 그린다. */
function paintTitle(m){
 const parts=titleParts(m);
 return '<div class="moment-title">'+
  (parts.main?'<h3>'+t(parts.main)+'</h3>':'<p class="moment-note">'+t(parts.note||'아직 마음 한마디를 남기지 않았어요')+'</p>')+
  (parts.main&&parts.note?'<p class="moment-note">'+t(parts.note)+'</p>':'')+
  (parts.media?'<p class="moment-video">'+t(parts.media)+'</p>':'')+
  '<p>'+t(m.date)+' · '+t(m.emotion)+' · '+t(m.source)+'</p>'+
  '<div class="chips">'+m.keywords.map(k=>'<span class="chip">#'+t(k)+'</span>').join('')+'</div>'+
  (m.synthetic?'':'<button type="button" class="title-edit" data-title-edit="'+t(m.id)+'">제목 고치기</button>')+
  '</div>';
}
/* 3. 한 페이지에 다 들어오게 + 1. YouTube는 그 자리에서 재생(누르기 전 외부 요청 0). */
const NEXT_TITLE='이 순간 다음 이야기를 남겨 보세요';
function localThumb(m){const src=String(m.image||'');if(src.startsWith('data:image/'))return src;if(src.startsWith('/api/media/'))return src;return ''}
const originalMomentContent=momentContent;
momentContent=function(m,compact=false){
 const safe=withoutAutoTitle(m);
 if(safe.url&&window.LTMedia&&LTMedia.describe){
  const media=LTMedia.describe(safe.url);
  if(media.kind==='youtube'){
   const thumb=localThumb(safe);
   const label=media.startSeconds?('여기서 재생 · '+media.label.replace('YouTube 링크 · ','')):'여기서 재생';
   const piece='<div class="clipping moment" data-moment="'+t(safe.id)+'">'+
    '<button type="button" class="yt-play" data-yt-play="'+t(media.videoId)+'" data-yt-start="'+t(media.startSeconds||0)+'">'+
    (thumb?'<img src="'+t(thumb)+'" alt="">':'<span class="yt-placeholder"></span>')+
    '<span class="yt-play-label">'+t(label)+'</span></button>'+
    '<a class="ui-btn ui-link" href="'+t(media.openUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">YouTube에서 열기 ↗</a></div>';
   return piece+paintTitle(safe);
  }
 }
 return originalMomentContent(safe,compact);
};
/* 8. 가운데 머리 표시는 CSS로 지우고, 4. 오른쪽 빈 페이지 문구·버튼을 여기서 만든다. */
const originalRenderSpread=renderSpread;
renderSpread=function(idx,focusId=null,land=true){
 originalRenderSpread(idx,focusId,land);
 for(const [host,side] of [[leftPage,'left'],[rightPage,'right']]){
  const m=SPREADS[current][side];if(!m||m.synthetic)continue;
  const old=host.querySelector('.moment-title');if(old)old.outerHTML=paintTitle(m);
 }
 const right=SPREADS[current].right;
 if(right&&right.synthetic){
  rightPage.innerHTML='<div class="next-page"><div><b>'+t(NEXT_PAGE_COPY)+'</b></div><button type="button" data-next-moment="'+t(SPREADS[current].left.id)+'">'+t(NEXT_PAGE_ACTION)+'</button></div>';
 }
 paintLensButton();
};
/* 9. 연결 안내는 한 줄, 다음 순간이 없으면 숨긴다. 시스템 용어를 쓰지 않는다. */
const originalUpdateConnectionSummary=updateConnectionSummary;
updateConnectionSummary=function(id){
 const next=nextMomentOf(id),host=$b('#whyMargin');
 const line=connectionLine(next&&next.title,next&&next.reason);
 if(!line){host.hidden=true;host.replaceChildren();return}
 host.hidden=false;
 host.innerHTML='<span></span>'+t(line);
};
/* 4. 모바일에서도 같은 문구·버튼. */
const originalMobileSpreadContent=mobileSpreadContent;
mobileSpreadContent=function(s,focusId=null){
 let html=originalMobileSpreadContent(s,focusId);
 if(s.right&&s.right.synthetic){
  const at=html.lastIndexOf('<div class="mobile-support">');
  if(at>=0){const close=html.indexOf('</div>',at);
   if(close>at)html=html.slice(0,at)+'<div class="mobile-support next-page"><b>'+t(NEXT_TITLE)+'</b><button type="button" data-next-moment="'+t(s.left.id)+'">'+t(NEXT_PAGE_ACTION)+'</button></div>'+html.slice(close+6);}
 }
 return html;
};
/* 5. 돋보기는 도구 줄에서 켜고 끈다. */
$b('#lensBtn').onclick=()=>{lensPref=!lensPref;writeLens(lensPref,window.localStorage);paintLensButton();if(!lensPref)hideLens()};
paintLensButton();if(!lensPref)hideLens();
/* #212: 책 위쪽 갈래 글자와 목차 머리에 트리 이름을 보여 준다(자동 접미사는 표시 단계에서만 뺀다). */
function paintTreeTitles(){
 const name=treeTitleText(LTDEMO&&LTDEMO.title);
 if(!name)return;
 for(const el of document.querySelectorAll('.crumb')){if(el.textContent!==name)el.textContent=name;}
 const head=document.querySelector('.archive-head');
 if(head){
  let line=head.querySelector('.archive-tree');
  if(!line){line=document.createElement('p');line.className='archive-tree';head.after(line);}
  if(line.textContent!==name)line.textContent=name;
 }
 if(document.body.dataset.treeName!==name)document.body.dataset.treeName=name;
}
paintTreeTitles();
/* 원본 화면은 이 모듈보다 먼저 한 번 그린다. 새 규칙으로 다시 그린다(저장·선택은 그대로). */
renderSpread(current,LTDEMO.get(),false);
syncLensClone();
window.__BOOK_USABILITY__={titleParts,closeDetail,placeDetail,nextMomentOf,paintTitle,get lensPref(){return lensPref}};
</script>`;

function patch(html, prefix) {
  const script = SCRIPT.replaceAll('PATH_PREFIX', prefix);
  let out = html;
  // 스타일은 이미 있으면 같은 자리에서 새 내용으로 바꾼다(규칙을 고쳐도 두 번 실행으로 맞출 수 있다).
  if (out.includes(STYLE_TAG)) {
    const start = out.indexOf(STYLE_TAG);
    const end = out.indexOf('</style>', start);
    out = out.slice(0, start) + styleBlock() + out.slice(end + '</style>'.length);
  } else {
    out = out.replace('</head>', () => styleBlock() + '</head>');
  }
  if (!out.includes(PANEL_TAG)) out = out.replace('<section class="detail" id="detail">', () => PANEL_TAG + '<section class="detail" id="detail">');
  if (out.includes('book-usability.mjs')) {
    const start = out.indexOf('<script type="module">');
    const end = out.indexOf('</script>', start);
    out = out.slice(0, start) + script + out.slice(end + '</script>'.length);
  } else {
    out = out.replace('</body>', () => script + '\n</body>');
  }
  return out;
}

for (const [file, prefix] of COPIES) {
  const full = path.join(ROOT, file);
  const before = readFileSync(full, 'utf8');
  const after = patch(before, prefix);
  if (before === after) console.log('변경 없음', file);
  else { writeFileSync(full, after); console.log('적용', file); }
}
