window.addEventListener('resize',boardResize);

renderCards();
renderThreads();
formFor(addType);
setTimeout(boardStartView,40);
// #662 후속(CTO 지시): 안내는 상세 판이 닫혀 있을 때만 뜬다 — 이미 순간을 선택해 판이 열렸으면 '선택하라'는 안내는 필요 없다.
// #718: 셸 알림('내 기록을 불러왔어요.')과 같은 자리에 포개지지 않게 — ≤700px 말풍선은 화면 아래 중앙(bottom 95px)인데
// 셸 알림도 #666 규칙으로 아래 중앙(--lt-toast-bottom)에 뜬다. 첫 진입에서 두 안내가 겹친다(390 실측 최대 5,328px²).
// 안내는 한 번만 뜨는 일회성 말풍선이라 위치 규칙을 따라가는 것보다 셸 알림(약 3초)이 사라진 뒤 띄우는 편이 단순하다 —
// 같은 출처 iframe 이라 부모 문서의 알림 상태를 읽을 수 있다. 최대 6초 기다린 뒤에는 그래도 띄운다(안내를 잃지 않게).
(function boardGuide(){
  const GUIDE_TRIES=10, FIRST=900, RETRY=600;
  const show=(tries)=>setTimeout(()=>{
    if(document.getElementById('detail').classList.contains('open'))return;
    const shellToast=(window.parent&&window.parent!==window)?window.parent.document.getElementById('toast'):null;
    const shellShowing=!!shellToast&&!shellToast.hidden;
    if(shellShowing&&tries>0)return show(tries-1);
    toast('순간을 선택해 연결된 기록을 살펴보세요.');
  },tries===GUIDE_TRIES?FIRST:RETRY);
  show(GUIDE_TRIES);
})();

window.__LT58={moments,connections,get state(){return{moments:moments.length,connections:connections.length,view:{...view},selected,cinema}},fitAll,startCinema,selectMoment,addDemo:(type='photo')=>{addType=type;
formFor(type);
confirmAdd()},connect:(a,b,why='QA connection')=>{snapshot();
connections.push({id:'qa'+Date.now(),a,b,why,color:'cyan'});
renderThreads()},undo,refs:{moments,connections}}
;



/* === V1.1 PRODUCTIZATION PATCH === */
document.body.dataset.theme='pearl';

/* #536: '진주빛 보드 · 읽기 전용' 표시는 예시·공유(읽기 전용)에서만 '읽기 전용'을 붙인다.
   전에는 자기 기록(쓰기 가능)인데도 HTML에 박힌 '읽기 전용'이 그대로 보였다. */
/* 2026-11-16 대표 결정: 쓰기 가능한 내 보드에서는 고급 기능의 원본 테마 이름('진주빛 보드') 글자가
   고객에게 뜻이 없으니 표시 자체를 숨기고 글자도 비워 둔다(테마 고르기·lt41.boardTheme·[종이|밤] 스위치·
   '판' 이름표는 그대로). 읽기 전용(예시·남의 공개 보드·공유 감상)에서는 '진주빛 보드 · 읽기 전용'로 그대로 둔다. */
function boardThemeNameOf(){const b=document.querySelector('.themeBtn.active');return (b?.textContent||'진주빛').trim()}
function paintThemeBadge(){const el=document.getElementById('themeBadge');if(!el)return;if(!LTDEMO.readOnly){el.hidden=true;el.textContent='';return}el.hidden=false;el.textContent=boardThemeNameOf()+' 보드 · 읽기 전용'}
paintThemeBadge();

const LT_KEYWORDS=['첫만남','무대','표정','목소리','계절','밤','이동','저장','다시보기','추천','우연','위로','벚꽃','드라이브','편지','여행','팬심'];

const LT_EMOTIONS=['설렘','행복','그리움','위로','놀람','몰입','울컥함','아쉬움','감사','각성','궁금함','확신'];

const LT_PIN_STYLES=['pearl','crystal','flower','heart','star','magnet','disc'];

const LT_CARD_STYLES=['photo','postit','memo','rounded','film','ticket'];

let defaultPinStyle='pearl',defaultCardStyle='photo',lastAddedId=null,lastParentId=null,pathOnly=false,activePathIds=new Set(),activePathConns=new Set();

// #619-6: 꾸밈 카드 스타일(필름의 검은 테두리 등)은 예시 보드에서만 돌아가며 붙인다.
// 서버 기록은 사람이 고른 스타일이 없으면 기본(photo)으로 둔다 — 마지막 열에 검은 테두리 카드가 섞이던 원인.
moments.forEach((m,i)=>{m.keywords=m.keywords||[];m.pinStyle=m.pinStyle||LT_PIN_STYLES[i%LT_PIN_STYLES.length];m.cardStyle=m.cardStyle||(exampleBoard?LT_CARD_STYLES[i%LT_CARD_STYLES.length]:'photo');m.privacy=m.privacy||'PRIVATE';if(m.type==='youtube')m.thumbnailUrl=youtubeThumbUrl(m.url||'');m.createdOrder=m.createdOrder||i+1});

function youtubeId(url=''){try{let u=new URL(url);
if(!['http:','https:'].includes(u.protocol))return '';
const d=(window.LTMedia&&typeof window.LTMedia.describe==='function')?window.LTMedia.describe(u.href):null;
if(d&&d.kind==='youtube')return d.videoId||'';
const hosts=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'];
if(!hosts.includes(u.hostname))return '';
if(u.hostname==='youtu.be'){const y=u.pathname.split('/').filter(Boolean)[0]||'';
return /^[A-Za-z0-9_-]{11}$/.test(y)?y:''}if(u.pathname==='/watch'){const v=u.searchParams.get('v')||'';
return /^[A-Za-z0-9_-]{11}$/.test(v)?v:''}const s=u.pathname.match(/^\/(shorts|live|embed)\/([^/?#]+)/);return s&&/^[A-Za-z0-9_-]{11}$/.test(s[2])?s[2]:''}catch(e){}return ''}
// #480 L12: 썸네일은 공용 한 벌(thumb-fallback.mjs)만 쓴다. 예전에는 이 파일이 자체 주소(img.youtube.com/hqdefault)와
// 자체 그림(SVG)을 따로 만들었는데, 그러면 책·보관함·첫 화면과 다른 단계(저장 주소 → oardefault/hqdefault → mqdefault → 글 카드)를 가진다.
// board-thumb.mjs가 thumb-fallback의 한 벌을 globalThis.LTThumbFallback으로 내놓는다.
function thumbApi(){return globalThis.LTThumbFallback||null}
// 저장할 대표 썸네일 주소(모자이크 카드·편집 미리보기가 함께 쓴다): 공용 후보의 첫 주소.
function youtubeThumbUrl(url){
  const api=thumbApi();
  const moment={url:String(url||'')};
  const list=api?api.thumbnailCandidates(moment,{autoLoad:true}):[];
  return list[0]||'';
}
// 미리보기 그림: 실제 썸네일이 있으면 그 주소, 없으면 글 카드 쪽으로 넘긴다(공용 규칙).
function youtubeThumb(url){return youtubeThumbUrl(url)}
// #480 L12: 그림이 실패하면 공용 한 벌의 다음 단계를 쓴다 — 깨진 그림이면 글 카드(ASSET.link)로 내려간다.
// 공용 단계(thumb-fallback.nextThumbnailStep)와 같은 판정을 쓰고, 단계가 없으면 예전처럼 data-fallback으로만 내려간다.
function thumbRetryAttrs(m){
  const api=thumbApi();
  const list=api&&m?.url?api.thumbnailCandidates({url:String(m.url||'')},{autoLoad:true}):[];
  const cands=list&&list.length?JSON.stringify(list):'';
  const idx=cands?'0':'';
  const extra=cands?` data-lt-candidates='${cands}' data-lt-cand-index='${idx}'`:'';
  return `onerror="this.onerror=null;this.src=this.dataset.fallback"${extra}`;
}
function pinClass(m){return `pinStyle-${m.pinStyle||'pearl'}`}
function cardClass(m){return `cardStyle-${m.cardStyle||'photo'}`}
cardHTML=function(m){let media='';if(m.url)media=LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id,null,null,{compact:true});else if(m.type==='note') media=`<div class="noteText">“${esc(m.memo)}”</div>`;else if(m.type==='video') media=`<div class="media"><video muted playsinline loop poster="${m.asset}" src="${m.video||''}"></video><span class="playBadge">▶</span><span class="duration">${m.duration||'00:03'}</span></div>`;else {let img=m.type==='youtube'?youtubeThumb(m.url||''):m.asset;media=`<div class="media ${m.type==='link'||m.type==='youtube'?'linkMedia':''}"><img src="${img}" data-fallback="${ASSET.link}" ${thumbRetryAttrs(m)} alt=""><span class="${m.type==='youtube'?'playBadge':''}">${m.type==='youtube'?'▶':''}</span></div>`}
// #601: 카드는 훑기용 — 큰 썸네일 + 제목 2줄 + 감정·날짜 한 줄만. 마음·출처·키워드·크게 보기는 상세가 맡는다.
return `<article class="card ${m.first?'first':''} ${m.type==='note'?'noteCard':''} ${pinClass(m)} ${cardClass(m)}" data-id="${m.id}" style="left:${m.x}px;top:${m.y}px;--rot:${m.rot}deg;--pin:${colors[m.color]};--halo:${colors[m.color]}55">${m.first?'<div class="firstTag">첫 순간</div>':''}<button class="pin" data-pin="${m.id}" aria-hidden="true" tabindex="-1"></button>${media}<div class="cardBody"><h3 class="cardTitle">${esc(titleMain(m))}</h3><div class="cardMeta"><span class="emotionDot"></span>${esc(m.emotion)} · ${esc(dateText(m.date))}</div></div></article>`}
// #601: 카드 안의 기본 끌기(그림 끌기)는 보드 끌기를 pointercancel로 취소하고 놓으면 화면을 갈아끊는다 — 막아 둔다.
if(cardLayer&&!cardLayer.dataset.noNativeDrag){cardLayer.dataset.noNativeDrag='1';cardLayer.addEventListener('dragstart',e=>e.preventDefault())}
const _renderCardsV1=renderCards;renderCards=function(){cardLayer.innerHTML=moments.map(cardHTML).join('');cardLayer.querySelectorAll('.card').forEach(el=>bindCardV11(el));
// #894: 카드 안의 그림·링크 기본 끌기를 막는다 — 끌기가 보드 밖(셸)으로 새어 나가 '놓으면 담아요' 판이 떴다.
cardLayer.querySelectorAll('.card img,.card a').forEach(x=>{x.draggable=false;x.setAttribute('draggable','false')});
if(selected)selectMoment(selected,false);applyFilters()}
function applyDecorMotion(){
  // #536: 휠 확대는 #346 판정의 입력에 없던 것이라 같은 한 벌로 따로 묶는다(이동·드래그 판정은 그대로).
  const zoomPause=typeof wheelZooming!=='undefined'&&LT58Model.decorationMotion({zooming:!!wheelZooming})==='paused';
  const movePause=LT58Model.decorationMotion({pan:!!pan,pinch:!!pinch,dragging:!!drag,touches:boardTouches.size})==='paused';
  document.body.classList.toggle('decor-paused',zoomPause||movePause);
}
addEventListener('pointerdown',()=>queueMicrotask(applyDecorMotion));
addEventListener('pointerup',()=>queueMicrotask(applyDecorMotion));
addEventListener('pointercancel',()=>queueMicrotask(applyDecorMotion));
addEventListener('blur',applyDecorMotion);
// #553 뒤: 상세의 '다음 순간'·'이전 순간' 단추 한 벌. 누르면 판이 그 카드로 부드럽게 이동하고
// 카드가 선택되며 상세가 그 순간으로 바뀐다. 이유(why) 글은 단추 아래 작은 글씨로 그대로 둔다.
// 상세 안의 단추는 이벤트 위임으로 한 번만 맞춘다 — 다음은 실을 따라 흘러가며 이동, 이전은 거꾸로.
$('#dConn').onclick=e=>{let b=e.target.closest('.connCard');if(!b)return;let c=connections.find(x=>x.id===b.dataset.cid);if(!c)return;if(b.dataset.dir==='next')moveViaConnection(c);else pulseConnection(c,()=>focusBoardMoment(c.a))};
// #619-6: 끼워 넣기 자리 표시 — 들어갈 카드에 테두리를 두른다(앞/뒤는 좌·우 테두리).
function clearInsertMark(){cardLayer.querySelectorAll('.insert-target').forEach((el)=>el.classList.remove('insert-target','insert-after'))}
function markInsertTarget(targetId,after){clearInsertMark();if(!targetId)return;const el=cardLayer.querySelector(`[data-id="${targetId}"]`);if(!el)return;el.classList.add('insert-target');if(after)el.classList.add('insert-after')}
function bindCardV11(el){let id=el.dataset.id,down=null,moved=false;el.addEventListener('pointerdown',e=>{if(e.target.closest('button,input,textarea,select,video')||e.target.classList.contains('pin'))return;if(cinema)return;if(typeof dragGuard==='function'&&!dragGuard())return;e.stopPropagation();snapshot();let m=moments.find(x=>x.id===id),p=screenToWorld(e.clientX,e.clientY);drag={id,dx:p.x-m.x,dy:p.y-m.y};down={x:e.clientX,y:e.clientY};moved=false;el.classList.add('dragLift');el.setPointerCapture?.(e.pointerId)});el.addEventListener('pointermove',e=>{if(!drag||drag.id!==id)return;let p=screenToWorld(e.clientX,e.clientY),m=moments.find(x=>x.id===id);if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)moved=true;m.x=Math.max(70,Math.min(1320,p.x-drag.dx));m.y=Math.max(120,Math.min(760,p.y-drag.dy));el.style.left=m.x+'px';el.style.top=m.y+'px';scheduleThreadFrame();
// #619-6: 끄는 동안 들어갈 자리를 표시한다(가장 가까운 카드에 테두리). #894: '내 배치'에서는 나머지 카드도 실시간으로 비켜 준다.
if(moved&&typeof insertIndexAt==='function'){const hit=insertIndexAt(p.x,p.y,id);markInsertTarget(hit?id:null,hit?hit.after:false);if(typeof previewShift==='function')previewShift(id,hit)}else if(moved){clearInsertMark();if(typeof clearPreviewShift==='function')clearPreviewShift()}});el.addEventListener('pointerup',e=>{if(drag?.id===id){let m=moments.find(x=>x.id===id);drag=null;el.classList.remove('dragLift');el.classList.add('dropSettle');setTimeout(()=>el.classList.remove('dropSettle'),420);el.releasePointerCapture?.(e.pointerId);if(!moved){selectMoment(id,true);return}
// #619-6: 끼워 넣기 — 다른 카드 사이에 놓으면 그 자리에 끼어들고 나머지는 밀린다(빈칸 없음).
// 순서는 좌표가 아니라 순서(순위)로 저장하고, 같은 순서로 다시 쌓는다.
clearInsertMark();if(typeof clearPreviewShift==='function')clearPreviewShift();const pUp=typeof screenToWorld==='function'?screenToWorld(e.clientX,e.clientY):null;const hit=pUp&&typeof insertIndexAt==='function'?insertIndexAt(pUp.x,pUp.y,id):null;
if(hit&&typeof commitInsert==='function')commitInsert(id,hit.index);else if(typeof persistBoard==='function')persistBoard();}});el.addEventListener('mouseenter',()=>{let v=el.querySelector('video:not(.lt-user-video)');if(v&&!cinema)v.play().catch(()=>{})});el.addEventListener('mouseleave',()=>{let v=el.querySelector('video:not(.lt-user-video)');if(v&&!el.classList.contains('cinemaFocus')){v.pause();v.currentTime=0}})}
function detailKeywords(m){return `<div class="keywordRow">${(m.keywords||[]).map(k=>`<span class="chip on">#${esc(k)}</span>`).join('')}</div>`}
// #601: 상세 플레이어 — 맨 위에서 바로 재생한다. YouTube는 썸네일을 그린 뒤 재생 단추를 눌러 임베드로,
// 로컬 영상은 controls·autoplay, 사진은 크게, 기록은 큰 글씨로 보여 준다.
// #840(도현 의견 34): 영상 칸 안의 '크게 보기'·'YouTube에서 열기'는 아래 단추 줄(#detailActions)과
// 두 번씩 보였다. 칸 안에서는 도구를 빼고 미리보기·바로 재생만 남긴다(compact 한 벌 — 카드와 같은 판정) —
// 크게 보기·원본 열기는 아래 단추 줄의 한 벌만 쓴다.
function detailPlayerHTML(m){
  const _yt=window.__LT58YT;if(_yt?.isYtMoment?.(m)){const u=_yt.originalUrl(m)||m.url;if(u)return LTMedia.markup(u,m.title,m.mediaMetadata,m.id,null,null,{compact:true})}
  if(m.url)return LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id,null,null,{compact:true});
  if(m.type==='note')return `<div class="detailNoteMedia">"${esc(m.memo)}"</div>`;
  if(m.type==='video')return `<video class="detailVideo" src="${m.video||''}" poster="${m.asset||''}" controls muted playsinline></video>`;
  return `<img class="detailPhoto" src="${m.asset||''}" data-fallback="${ASSET.link}" onerror="this.onerror=null;this.src=this.dataset.fallback" alt="">`;
}
// 이어진 순간 작은 카드: 썸네일 + 제목. 누르면 판이 그 순간으로 부드럽게 이동한다(#583 규칙 그대로).
// 썸네일이 없으면 '…'를 보인다.
function connThumb(t){
  if(!t)return '';
  const api=thumbApi();
  const moment={url:String(t.url||''),externalUrl:String(t.url||''),mediaMetadata:t.mediaMetadata||null,image:t.asset||''};
  const list=api?api.thumbnailCandidates(moment,{autoLoad:true}):[];
  if(list.length)return `<span class="connThumb"><img src="${esc(list[0])}" ${api.coverFallbackAttrs(list)} alt="" loading="lazy"></span>`;
  if(t.asset)return `<span class="connThumb"><img src="${esc(t.asset)}" alt="" loading="lazy"></span>`;
  return `<span class="connThumb connThumbText">…</span>`;
}
// #619-6: 위 내려가기 단계(회색 120×90 판정 포함)가 보드에서도 돌게 공용 감시를 한 번 건다.
// board-thumb.mjs(모듈)가 LTThumbFallback을 내놓은 뒤이므로 DOMContentLoaded에서 건다.
addEventListener('DOMContentLoaded',()=>{try{thumbApi()?.mountThumbFallback?.(document)}catch{}});
selectMoment=function(id,open=true){if(open)LTDEMO.select(id);selected=id;mobilePicker?.select(id);document.querySelectorAll('.card').forEach(c=>c.classList.toggle('selected',c.dataset.id===id));if(open){let m=moments.find(x=>x.id===id);if(!m)return;const _ti=titleInfo(m);$('#dTitle').textContent=_ti.main;const _ds=$('#detailSub');if(_ds){_ds.textContent=_ti.sub?'▶ '+_ti.sub:'';_ds.hidden=!_ti.sub}
// #601: 플레이어가 맨 위, 내 마음은 크게(비어 있으면 입력칸), 감정·날짜·트리 한 줄.
$('#detailPlayer').innerHTML=detailPlayerHTML(m);
const _heart=$('#dHeart'),_input=$('#dHeartInput'),_save=$('#dHeartSave');
if(_heart){if(m.memo){_heart.hidden=false;_heart.textContent=m.memo;if(_input)_input.hidden=true;if(_save)_save.hidden=true}else{_heart.hidden=true;_heart.textContent='';if(_input){_input.hidden=false;_input.value=''}if(_save)_save.hidden=false}}
const _treeName=document.getElementById('treeTitleText')?.textContent||'';
$('#dBasic').innerHTML=`<b>${esc(m.emotion)}</b> · ${esc(dateText(m.date))}${m.first?' <span class="firstMark" title="첫 순간">●</span>':''}${_treeName?` · ${esc(_treeName)}`:''}`;
let outs=connections.filter(c=>c.kind==='parent'&&c.a===id),ins=connections.filter(c=>c.kind==='parent'&&c.b===id);
// #583 규칙 한 벌: 다음 3개 + '나머지 N개 보기', 다음이 없으면 이전. board.js open()과 같은 규칙이다.
const _rowsHTML=(rows)=>rows.length>3?rows.slice(0,3).join('')+`<details><summary>나머지 ${rows.length-3}개 보기</summary>${rows.slice(3).join('')}</details>`:rows.join('');
$('#dConn').innerHTML=outs.length?_rowsHTML(outs.map(c=>connRow(c,'next'))):(ins.length?_rowsHTML(ins.map(c=>connRow(c,'prev'))):'아직 이어진 순간이 없어요');hideToast();$('#detail').classList.add('open');syncBoardPush();
const _st=LT58Model.detailButtonState(ins,outs);const _cin=$('#cinemaFromMoment');if(_cin){_cin.disabled=_st.nextDisabled;_cin.title=_st.nextDisabled?'이 순간에서 이어진 길이 없어요':''}
// 'YouTube에서 열기' — 원본 주소가 있을 때만 보인다.
// #891: 'YouTube ↗'는 단추가 아니라 영상 바로 아래 작은 링크(#836와 같은 모양) — 원본 주소가 있을 때만 보인다.
const _ytLink=$('#detailYtLink'),_ytRow=$('#ytLinkRow');if(_ytLink&&_ytRow){const _u=(window.__LT58YT?.originalUrl?.(m))||m.url||'';_ytRow.hidden=!_u;if(_u)_ytLink.href=_u}
 // 이슈 327 2부: 내 기록(서버)의 순간 상세에서 다른 트리로 옮기기. 공유·예시는 숨긴다.
 // #891: 단추는 이제 판 HTML의 '⋯ 더 보기' 메뉴 안에 있다 — 누름 길만 여기서 맞춘다.
 const mv=$('#detailMoveBtn');if(mv)mv.onclick=()=>{if(selected)parent.postMessage({type:'lt41-move',momentId:selected},location.origin)};
 // #582 4: '지도에서 관계 보기' — 관계도는 지도가 맡는다. 셸이 지도를 그 순간으로 열게 요청한다.
 const mapBtn=$('#detailMapBtn');if(mapBtn)mapBtn.onclick=()=>{if(selected)parent.postMessage({type:'lt41-open-network',treeId:window.parent?.LT41?.tree?.id,momentId:selected},location.origin)};
 if(mv)mv.hidden=!(window.parent!==window&&window.parent.LT41&&window.parent.LT41.source==='server'&&!LTDEMO.readOnly)}}
function connRow(c,dir){const t=moments.find(x=>x.id===(dir==='next'?c.b:c.a));return `<button type="button" class="connCard" data-cid="${c.id}" data-dir="${dir}">${connThumb(t)}<span class="connName">${esc(titleMain(t))}</span>${(c.why&&c.why!=='관련 순간')?`<span class="connWhy">${esc(c.why)}</span>`:''}</button>`}
let editBtn=[...$('#detail').querySelectorAll('button')].find(b=>b.textContent.trim()==='수정'||b.textContent.trim()==='편집');if(editBtn)editBtn.id='editMomentBtn';
// #891: '⋯ 더 보기' 메뉴 — 수정·지도에서 관계 보기·다른 트리로 옮기기가 들어간다. 밖 누름·Esc로 닫는다.
(function(){const btn=document.getElementById('detailMoreBtn'),menu=document.getElementById('detailMoreMenu');if(!btn||!menu)return;
btn.onclick=()=>{const open=menu.hidden;menu.hidden=!open;btn.setAttribute('aria-expanded',String(open))};
document.addEventListener('click',e=>{if(menu.hidden)return;if(e.target.closest?.('#detailMoreBtn')||e.target.closest?.('#detailMoreMenu'))return;menu.hidden=true;btn.setAttribute('aria-expanded','false')});
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||menu.hidden)return;menu.hidden=true;btn.setAttribute('aria-expanded','false');btn.focus()});
menu.addEventListener('click',e=>{if(e.target.closest?.('.moreItem')){menu.hidden=true;btn.setAttribute('aria-expanded','false')}});
})();
/* #315: 공유 감상은 쓰기·편집 도구(순간 추가·되돌리기·수정)를 렌더하지 않는다. */
if(LTDEMO.readOnly){if(editBtn)editBtn.hidden=true;for(const id of ['addBtn','undoBtn']){const b=document.getElementById(id);if(b)b.hidden=true;}}
// #601: 내 마음 입력 — 기존 순간 저장 경로(boardPayload의 note)로 그대로 저장한다.
$('#dHeartSave').onclick=()=>{let m=moments.find(x=>x.id===selected);if(!m)return;const v=$('#dHeartInput').value.trim();if(!v){toast('마음을 적어 주세요.');return}snapshot();m.memo=v;persistBoard();selectMoment(m.id,false)};/* #905: 자동 저장 성공은 알리지 않는다 — 마음이 카드에 바로 보인다. */
function focusBoardMoment(id,open=true){let m=moments.find(x=>x.id===id),el=cardLayer.querySelector(`[data-id="${id}"]`);if(!m||!el)return;let cx=m.x+el.offsetWidth/2,cy=m.y+el.offsetHeight/2,vw=viewport.clientWidth,vh=viewport.clientHeight;
/* #267: 좁은 판에서는 위의 탐색 판(선택·책 열기) 아래부터 카드가 보이게 한다 — 고정 156px는 판이 현재 위치(99~179)보다 위라 카드 머리가 판에 덮였다. */
let topOffset=156;if(vw<700){const pk=document.querySelector('.lt-moment-picker');if(pk){const r=pk.getBoundingClientRect(),vr=viewport.getBoundingClientRect();if(r.width)topOffset=Math.round(r.bottom-vr.top+12)}}
view.z=Math.min(vw<700?1.0:1.06,1.15);view.x=vw/2-cx*view.z;view.y=vw<700?topOffset-m.y*view.z:vh/2-cy*view.z;applyView(open);noteUserView();if(!open)LTDEMO.select(id);selectMoment(id,open)}
function pulseConnection(c,after){let g=threadLayer.querySelector(`[data-cid="${c.id}"]`);if(!g){after?.();return}g.classList.add('selectedPath');let p=g.querySelector('.threadColor');animateHotTip(p,760).then(()=>{setTimeout(()=>g.classList.remove('selectedPath'),600);after?.()})}
function moveViaConnection(c){$('#nextChooser').classList.remove('open');pulseConnection(c,()=>focusBoardMoment(c.b))}
let chooserOrigin=null;function chooseNext(dir='next'){chooserOrigin=dir==='next'?$('#nextMoment'):$('#prevMoment');$('#nextChooserTitle').textContent=dir==='next'?'다음 경로 선택':'이전 경로 선택';let list=LT58Model.nextConnections(dir,selected,connections);if(!list.length)return toast(dir==='next'?'다음으로 연결된 순간이 없어요.':'이전으로 연결된 순간이 없어요.');if(list.length===1){let c=list[0];if(dir==='next')moveViaConnection(c);else{pulseConnection(c,()=>focusBoardMoment(c.a))}return}let box=$('#nextChoices');box.innerHTML=list.map(c=>{let target=dir==='next'?moments.find(m=>m.id===c.b):moments.find(m=>m.id===c.a);return `<button class="routeChoice" data-cid="${c.id}" data-dir="${dir}">${esc(titleMain(target))}<small>${esc(c.why)}</small></button>`}).join('');$('#nextChooser').classList.add('open')}
function closeChooser(){$('#nextChooser').classList.remove('open');chooserOrigin?.focus()}$('#closeChooser').onclick=closeChooser;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#nextChooser').classList.contains('open'))closeChooser()});$('#nextChoices').onclick=e=>{let b=e.target.closest('.routeChoice');if(!b)return;let c=connections.find(x=>x.id===b.dataset.cid);if(b.dataset.dir==='next')moveViaConnection(c);else{pulseConnection(c,()=>focusBoardMoment(c.a));$('#nextChooser').classList.remove('open')}};$('#nextMoment')?.addEventListener('click',()=>chooseNext('next'));$('#prevMoment')?.addEventListener('click',()=>chooseNext('prev'));
const collectPathFrom=start=>LT58Model.collectPath(start,moments.length,connections);
function highlightPath(start=selected){let p=collectPathFrom(start);activePathIds=new Set(p.ids);activePathConns=new Set(p.cons);applyPathHighlight();return p}function highlightPathFromConnection(cid){let c=connections.find(x=>x.id===cid);if(!c)return;activePathIds=new Set([c.a,c.b]);activePathConns=new Set([cid]);applyPathHighlight()}
function applyPathHighlight(){document.querySelectorAll('.card').forEach(el=>el.classList.toggle('pathMember',activePathIds.has(el.dataset.id)))}

function updateKeywordFilter(){let vals=[...new Set(moments.flatMap(m=>m.keywords||[]))].sort();$('#keywordFilter').innerHTML='<option value="all">모든 키워드</option>'+vals.map(v=>`<option value="${esc(v)}">#${esc(v)}</option>`).join('')}
function applyFilters(){const state={mediaFilter:$('#mediaFilter')?.value||'all',keywordFilter:$('#keywordFilter')?.value||'all',maxOrder:LT58Model.maxCreatedOrder(moments)};document.querySelectorAll('.card').forEach(el=>{const m=moments.find(x=>x.id===el.dataset.id);const ok=LT58Model.filterVisible(m,state,connections);el.classList.toggle('filteredOut',!ok)})}
$('#mediaFilter').onchange=applyFilters;$('#keywordFilter').onchange=applyFilters;updateKeywordFilter();
$('#themeGrid').onclick=e=>{let b=e.target.closest('.themeBtn');if(!b)return;document.body.dataset.theme=b.dataset.theme;document.querySelectorAll('.themeBtn').forEach(x=>x.classList.toggle('active',x===b));paintThemeBadge();toast(`${b.textContent} 테마로 바꿨어요.`)};$('#defaultPin').onchange=e=>defaultPinStyle=e.target.value;$('#defaultCard').onchange=e=>defaultCardStyle=e.target.value;
$('#leftCollapse').onclick=()=>{if(innerWidth<760)$('#leftPanel').classList.toggle('mobileOpen');else $('#leftPanel').classList.toggle('collapsed')};/* #891: 도구 줄의 '+ 순간 추가'는 뺐다 — 머리줄 단추(#addBtn) 한 벌만 둔다 */$('#toolCinema').onclick=()=>startCinemaV11(0);$('#toolFit').onclick=()=>fitAll(true);
// #736: 이미 붙은 꼬리표는 고정 목록에 없어도 칩으로 보인다 — 편집 저장이 꼬리표를 몰래 지우지 않게('가수:PSY' 같은
// 종류:값 꼬리표·옛 낱말 전부). 표기는 꼬리표 칩과 같은 모양(tag-line.mjs의 parseTag·chipText 한 벌, 모듈이 늦으면
// '#값'으로 표시), data-key는 저장값 그대로라 selectedKeywords가 그대로 읽는다. 고정 목록 17개 고르기는 그대로.
function tagChipText(raw){try{const tl=window.LTTagLine;if(tl&&tl.parseTag&&tl.chipText){const p=tl.parseTag(raw);if(p)return tl.chipText(p)}}catch(e){}return '#'+raw}
function keywordPickerHTML(prefix,selected=[]){const sel=selected||[];/* #736: 켜진 칩은 저장 순서 그대로(고정·커스텀 섞여도 원래 순서) — 저장 때 순서도 보존된다. 고정 목록 나머지는 그 뒤에. */const offFixed=LT_KEYWORDS.filter(k=>!sel.includes(k));const btn=(k,on,custom)=>`<button type="button" class="keywordBtn ${on?'on':''}${custom?' is-custom-tag':''}" data-key="${custom?esc(k):k}"${custom?` title="누르면 꼬리표를 뗀다"`:''}>${custom?esc(tagChipText(k)):k}</button>`;return `<div class="label" style="margin-top:10px">KEYWORDS · 다중선택</div><div class="keywordPicker" id="${prefix}KeywordPicker">${sel.map(k=>btn(k,true,!LT_KEYWORDS.includes(k))).join('')}${offFixed.map(k=>btn(k,false,false)).join('')}</div><div style="display:flex;gap:6px"><input class="field" id="${prefix}CustomKeyword" placeholder="커스텀 키워드 추가"><button type="button" class="miniBtn" id="${prefix}AddKeyword" style="margin-top:10px">추가</button></div>`}
function styleFieldsHTML(prefix,m={}){return `<div class="extraFields"><select class="field selectField" id="${prefix}Emotion">${LT_EMOTIONS.map(x=>`<option ${x===(m.emotion||'설렘')?'selected':''}>${x}</option>`).join('')}</select><input class="field" id="${prefix}Source" placeholder="source label" value="${esc(m.source||'내 보관함')}"><select class="field selectField" id="${prefix}PinStyle">${LT_PIN_STYLES.map(x=>`<option ${x===(m.pinStyle||defaultPinStyle)?'selected':''}>${x}</option>`).join('')}</select><select class="field selectField" id="${prefix}CardStyle">${LT_CARD_STYLES.map(x=>`<option ${x===(m.cardStyle||defaultCardStyle)?'selected':''}>${x}</option>`).join('')}</select></div>${keywordPickerHTML(prefix,m.keywords||[])}`}
function bindKeywordPicker(prefix,refresh){let box=$(`#${prefix}KeywordPicker`);box.onclick=e=>{let b=e.target.closest('.keywordBtn');if(!b)return;b.classList.toggle('on');refresh?.()};$(`#${prefix}AddKeyword`).onclick=()=>{let v=$(`#${prefix}CustomKeyword`).value.trim();if(!v)return;/* #736: 같은 값 버튼이 있으면 새로 붙이지 않고 켠다 — 중복 칩·중복 저장을 막는다 */let existing=[...box.querySelectorAll('.keywordBtn')].find(b=>b.dataset.key===v);if(existing){existing.classList.add('on')}else{let b=document.createElement('button');b.type='button';b.className='keywordBtn on is-custom-tag';b.dataset.key=v;b.textContent=tagChipText(v);box.appendChild(b)}$(`#${prefix}CustomKeyword`).value='';refresh?.()}}
function selectedKeywords(prefix){return [...$(`#${prefix}KeywordPicker`).querySelectorAll('.keywordBtn.on')].map(b=>b.dataset.key)}
const _formForV1=formFor;formFor=function(type){_formForV1(type);let area=$('#formArea');area.insertAdjacentHTML('beforeend',styleFieldsHTML('add',{emotion:$('#momentEmotion').value||'설렘',source:type==='photo'?'Local image':type==='video'?'Local video':type==='note'?'마음 한마디':'Prototype link metadata',pinStyle:defaultPinStyle,cardStyle:defaultCardStyle,keywords:[]}));bindKeywordPicker('add',updateComposerPreview);area.querySelectorAll('input,select,textarea').forEach(x=>x.addEventListener('input',updateComposerPreview));let mf=$('#mediaFile');if(mf)mf.addEventListener('change',updateComposerPreview);let uf=$('#urlField');if(uf){uf.value=type==='youtube'?'https://youtu.be/dQw4w9WgXcQ':'https://lovetree.example/memory';uf.addEventListener('input',updateComposerPreview)}setTimeout(updateComposerPreview,0)}
let addPreview=document.createElement('div');addPreview.id='composerPreviewWrap';addPreview.innerHTML='<div class="label">LIVE PREVIEW · 저장 전 모습</div><div id="composerPreview" style="margin-top:12px"></div>';$('#addModal .modal').appendChild(addPreview);$('#momentTitle').addEventListener('input',()=>updateComposerPreview());$('#momentMemo').addEventListener('input',()=>updateComposerPreview());
function currentAddPreviewAsset(type){let file=$('#mediaFile')?.files?.[0];if(file)return URL.createObjectURL(file);if(type==='youtube')return youtubeThumb($('#urlField')?.value||'');if(type==='link')return ASSET.link;if(type==='video')return ASSET.first;if(type==='photo')return ASSET.glance;return ASSET.note}
function updateComposerPreview(){let type=addType,title=$('#momentTitle').value||'새로운 순간',memo=$('#momentMemo').value||'',emotion=$('#addEmotion')?.value||'설렘',asset=currentAddPreviewAsset(type);let media=type==='note'?`<div class="previewMedia" style="background:#fff6dd;color:#4d3d50;padding:20px;font-size:16px">“${esc($('#noteField')?.value||memo)}”</div>`:type==='video'&&$('#mediaFile')?.files?.[0]?`<div class="previewMedia"><video src="${asset}" muted playsinline controls></video></div>`:`<div class="previewMedia"><img src="${asset}" data-fallback="${ASSET.link}" ${thumbRetryAttrs({url:$('#urlField')?.value||'',type})}></div>`;$('#composerPreview').innerHTML=`<div class="previewCard"><span class="previewPin"></span>${media}<div style="margin-top:12px;font-size:9px;color:#64566f">${esc(type.toUpperCase())} · ${esc(emotion)}</div><h3 style="margin:5px 0;color:#34283d">${esc(title)}</h3><div style="font-size:10px;color:#5d4f66">${esc(memo)}</div></div>`}
openAdd=function(){lastParentId=selected;formFor(addType);$('#addModal').classList.add('open');setTimeout(updateComposerPreview,40)}
confirmAdd=function(){let id=newBoardId(),type=addType,title=$('#momentTitle').value||'새로운 순간',emotion=$('#addEmotion')?.value||'설렘',memo=$('#momentMemo').value||'',source=$('#addSource')?.value||'내 보관함',asset=ASSET.note,video=null,url=null;let file=$('#mediaFile')?.files?.[0];if((type==='photo'||type==='video')&&file){asset=URL.createObjectURL(file);if(type==='video')video=asset}else if(type==='photo')asset=ASSET.glance;else if(type==='video'){asset=ASSET.first;video=ASSET.video}else if(type==='link'||type==='youtube'){url=$('#urlField')?.value||'https://lovetree.example';asset=type==='youtube'?youtubeThumb(url):ASSET.link}if(type==='note')memo=$('#noteField')?.value||memo;let n={id,type,title,emotion,date:LTLocalDate.localDateOnly(),source,memo,x:620+(moments.length%3)*120,y:360+(moments.length%2)*100,rot:[-4,3,-2,4,2][moments.length%5],color:['rose','violet','cyan','amber'][moments.length%4],asset,video,url,duration:'00:03',keywords:selectedKeywords('add'),pinStyle:$('#addPinStyle')?.value||defaultPinStyle,cardStyle:$('#addCardStyle')?.value||defaultCardStyle,privacy:'PRIVATE',thumbnailUrl:type==='youtube'?youtubeThumbUrl(url||''):'',createdOrder:Math.max(...moments.map(m=>m.createdOrder||0))+1};$('#addModal').classList.remove('open');addMomentV11(n,lastParentId)}
function addMomentV11(m,parent){snapshot();moments.push(m);if(!momentOrder.includes(m.id))momentOrder.push(m.id);placeAll();settlePlacedCards();lastAddedId=m.id;lastParentId=parent;renderCards();updateKeywordFilter();let el=cardLayer.querySelector(`[data-id="${m.id}"]`);el.classList.add('landing');setTimeout(()=>el.classList.remove('landing'),1000);selectMoment(m.id,true);if(boardSaveEnabled()){if(parent)connections.push({id:'c'+(connections.length+1),kind:'parent',a:parent,b:m.id,why:'새로 추가한 순간',color:m.color||'rose'});persistBoard()}toast(parent?'순간이 추가되었어요. 방금 선택한 순간과 이어졌어요.':'순간이 추가되었어요.')}

function editMediaFields(m){if(m.type==='photo')return `<div class="label">PHOTO</div><div style="font-size:10px;color:#a995b1;margin:5px 0">기존 이미지 미리보기 · 교체하거나 기본 상태로 복귀할 수 있어요.</div><input class="field" id="editMediaFile" type="file" accept="image/*"><button type="button" class="miniBtn" id="removePhoto" style="margin-top:7px">이미지 제거</button>`;if(m.type==='video')return `<div class="label">VIDEO</div><input class="field" id="editMediaFile" type="file" accept="video/*">`;if(m.type==='link'||m.type==='youtube')return `<div class="label">${m.type==='youtube'?'VIDEO LINK / YOUTUBE':'LINK'}</div><input class="field" id="editUrl" value="${esc(m.url||'')}">`;return `<div class="label">NOTE BODY</div><textarea class="field" id="editNoteBody" rows="4">${esc(m.memo)}</textarea>`}
let editBase=null,editTempAsset=null,removePhotoFlag=false;function openEdit(){if(LTDEMO.readOnly)return;/* #315: 공유 감상은 편집하지 않는다 */let m=moments.find(x=>x.id===selected);if(!m)return;editBase=JSON.parse(JSON.stringify(m));removePhotoFlag=false;let f=$('#editFields');f.innerHTML=`${editMediaFields(m)}<input class="field" id="editTitle" value="${esc(m.title)}"><textarea class="field" id="editMemo" rows="3">${esc(m.memo)}</textarea>${styleFieldsHTML('edit',m)}<div style="font-size:10px;color:#94829e;margin-top:10px">DATE · ${esc(m.date)} &nbsp; PRIVACY · ${esc(m.privacy||'PRIVATE')}</div>`;bindKeywordPicker('edit',updateEditPreview);f.querySelectorAll('input,textarea,select').forEach(x=>x.addEventListener('input',updateEditPreview));$('#editMediaFile')?.addEventListener('change',updateEditPreview);$('#editUrl')?.addEventListener('input',updateEditPreview);$('#removePhoto')?.addEventListener('click',()=>{removePhotoFlag=true;updateEditPreview()});$('#editModal').classList.add('open');updateEditPreview()}
function editPreviewState(){let m=moments.find(x=>x.id===selected),type=m.type,asset=m.asset,video=m.video,url=$('#editUrl')?.value??m.url;let file=$('#editMediaFile')?.files?.[0];if(file){editTempAsset=URL.createObjectURL(file);asset=editTempAsset;if(type==='video')video=editTempAsset}if(removePhotoFlag&&type==='photo')asset=ASSET.note;if(type==='youtube')asset=youtubeThumb(url||'');return{...m,title:$('#editTitle')?.value||m.title,memo:$('#editNoteBody')?.value||$('#editMemo')?.value||m.memo,emotion:$('#editEmotion')?.value||m.emotion,source:$('#editSource')?.value||m.source,pinStyle:$('#editPinStyle')?.value||m.pinStyle,cardStyle:$('#editCardStyle')?.value||m.cardStyle,keywords:selectedKeywords('edit'),asset,video,url,thumbnailUrl:type==='youtube'?youtubeThumbUrl(url||''):m.thumbnailUrl||''}}
function updateEditPreview(){let m=editPreviewState(),media=m.type==='note'?`<div class="previewMedia" style="background:#fff6dd;color:#4d3d50;padding:20px">“${esc(m.memo)}”</div>`:m.type==='video'?`<div class="previewMedia"><video src="${m.video||''}" poster="${m.asset}" muted playsinline controls></video></div>`:`<div class="previewMedia"><img src="${m.asset}" data-fallback="${ASSET.link}" ${thumbRetryAttrs(m)}></div>`;$('#editPreview').innerHTML=`<div class="label">LIVE PREVIEW</div><div class="previewCard" style="margin-top:12px"><span class="previewPin"></span>${media}<div style="margin-top:10px;font-size:9px;color:#64566f">${esc(LTLabels.type(m.originalType||m.type))} · ${esc(m.emotion)}</div><h3 style="color:#34283d">${esc(m.title)}</h3><div style="font-size:10px;color:#5d4f66">${esc(m.memo)}</div></div>`}
function saveEdit(){if(LTDEMO.readOnly)return;/* #315: 공유 감상은 저장하지 않는다 */let m=moments.find(x=>x.id===selected),n=editPreviewState();snapshot();Object.assign(m,n);if(m.type==='video'&&editTempAsset)m.video=editTempAsset;if(m.type==='link'||m.type==='youtube')m.url=n.url;$('#editModal').classList.remove('open');renderCards();renderThreads();updateKeywordFilter();selectMoment(m.id,true);persistBoard();toast('순간 편집을 저장했어요. Connection과 provenance는 유지됩니다.')}
$('#editMomentBtn').onclick=openEdit;$('#editCancel').onclick=()=>$('#editModal').classList.remove('open');$('#editRevert').onclick=()=>{if(!editBase)return;let m=moments.find(x=>x.id===selected);Object.assign(m,JSON.parse(JSON.stringify(editBase)));openEdit();toast('편집 입력을 원래 값으로 되돌렸어요.')};$('#editSave').onclick=saveEdit;
openViewer=function(id){let m=moments.find(x=>x.id===id);if(!m)return;const _vi=titleInfo(m);$('#vTitle').textContent=_vi.main;let box=$('#viewerMedia');if(m.url)box.innerHTML=LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id);else if(m.type==='video')box.innerHTML=`<video src="${m.video}" poster="${m.asset}" controls autoplay muted playsinline style="width:100%;max-height:420px;object-fit:contain"></video>`;else if(m.type==='note')box.innerHTML=`<div style="padding:40px;color:#f7edf8;font-size:22px;line-height:1.6">“${esc(m.memo)}”</div>`;else box.innerHTML=`<img src="${m.type==='youtube'?youtubeThumb(m.url||''):m.asset}" data-fallback="${ASSET.link}" ${thumbRetryAttrs(m)} style="width:100%;max-height:420px;object-fit:cover">`;$('#vMeta').innerHTML=(_vi.sub?'<div class="videoTitle">▶ '+esc(_vi.sub)+'</div>':'')+`${esc(LTLabels.type(m.originalType||m.type))} · ${esc(dateText(m.date))} · ${esc(m.emotion)}<br>출처: ${esc(m.source)}${m.url?`<br>URL: ${esc(m.url)}`:''}<br>Keywords: ${(m.keywords||[]).map(k=>'#'+esc(k)).join(' ')}<br>마음 한마디: ${esc(m.memo)}`;
 // #327 2부: 내 기록(서버)의 순간 보기에서 다른 트리로 옮기기. 공유·예시는 숨긴다.
 if(window.parent!==window&&window.parent.LT41&&window.parent.LT41.source==='server'&&!LTDEMO.readOnly){const button=document.createElement('button');button.type='button';button.className='lt-move-btn';button.textContent='다른 트리로 옮기기';button.addEventListener('click',()=>parent.postMessage({type:'lt41-move',momentId:m.id},location.origin));$('#vMeta').append(button)}$('#viewerModal').classList.add('open')}
headerFade=function(on){document.querySelector('header').style.opacity=on?'.12':'1';document.querySelector('.toolbar').style.opacity=on?'0':'1';$('#cinemaBtn').style.opacity=on?'0':'1';$('#leftPanel').style.opacity=on?'.07':'1';$('#leftPanel').style.pointerEvents=on?'none':'auto';$('#themeBadge').style.opacity=on?'.08':'1';if(on)$('#detail').classList.remove('open');}
/* Beat-controlled cinema */
const cinemaV11={active:false,paused:false,beats:[],index:0,progress:0,last:0,focused:null,raf:0,fromMoment:null};
function makeCinemaBeats(startId=null){let path=startId?collectPathFrom(startId).ids:replayPath.filter(id=>moments.some(m=>m.id===id));if(!path.length)path=collectPathFrom(moments.find(m=>m.first)?.id||moments[0].id).ids;let beats=LT58Model.cinemaBeats(path,moments,connections);
// #582: 줄이 없으므로 연결·이유·갈림 비트는 건너뛴다 — 시네마는 순간을 차례로 걷는다.
return beats.filter(b=>!['connection','why','branch'].includes(b.type))}
function resetCinemaVisuals(){document.querySelectorAll('.card').forEach(c=>c.classList.remove('cinemaDim','cinemaFocus'));threadLayer.querySelectorAll('.threadGroup').forEach(g=>{g.classList.remove('selectedPath');/* #662: hotTip 요소는 판 화면에서 빠져 있다 — 없으면 건너뛰고 종료 뒤 정리가 이어지게 한다(종료 단추를 누르면 항상 터졌다). */g.querySelector('.threadGlow')?.style.setProperty('opacity','')});const ht=$('#hotTip');ht&&ht.setAttribute('opacity','0');$('#cinemaCaption').classList.remove('show');$('#finalCTA').classList.remove('show');document.body.classList.remove('boardBloom')}
function enterBeatVisual(beat){resetCinemaVisuals();$('#beatLabel').textContent=beat.label;if(beat.type==='moment'){cinemaV11.focused=beat.id;let m=moments.find(x=>x.id===beat.id);focusMoment(beat.id,`${m.emotion} · ${titleMain(m)}`)}else if(beat.type==='connection'||beat.type==='why'){let c=connections.find(x=>x.id===beat.cid);cinemaV11.focused=c?.a||beat.id;let g=threadLayer.querySelector(`[data-cid="${beat.cid}"]`);g?.classList.add('selectedPath');if(beat.type==='why'){let c=connections.find(x=>x.id===beat.cid);$('#cinemaCaption').textContent=c?.why||'연결 이유';$('#cinemaCaption').classList.add('show')}}else if(beat.type==='branch'){$('#cinemaCaption').textContent='여기서 다른 경로도 열렸어요.';$('#cinemaCaption').classList.add('show');cinemaV11.focused=beat.id}else if(beat.type==='bloom'){document.querySelectorAll('.card').forEach(c=>c.classList.remove('cinemaDim','cinemaFocus'));fitAll(true);document.body.classList.add('boardBloom');threadLayer.querySelectorAll('.threadGlow').forEach(p=>p.style.opacity='.82');cinemaV11.focused=beat.id}else if(beat.type==='final'){fitAll(true);document.body.classList.add('boardBloom');$('#finalCTA').classList.add('show');cinemaV11.focused=beat.id}}
function renderBeatProgress(beat,p){if(beat.type==='connection'){let g=threadLayer.querySelector(`[data-cid="${beat.cid}"]`),path=g?.querySelector('.threadColor');if(path){let len=path.getTotalLength(),pt=path.getPointAtLength(len*Math.max(0,Math.min(1,p)));$('#hotTip').setAttribute('opacity','1');$('#hotTip').setAttribute('cx',pt.x);$('#hotTip').setAttribute('cy',pt.y);$('#hotTip').setAttribute('r',String(5+2*Math.sin(p*Math.PI)));g.querySelector('.threadGlow').style.opacity=String(.45+.45*Math.sin(p*Math.PI));let c=connections.find(x=>x.id===beat.cid);$('#cinemaCaption').textContent=c?.why||'';$('#cinemaCaption').classList.add('show')}}}
function cinemaOverall(){let n=cinemaV11.beats.length;return n<=1?0:((cinemaV11.index+cinemaV11.progress)/(n-1))*100}
function setCinemaPosition(index,progress=0){cinemaV11.index=Math.max(0,Math.min(cinemaV11.beats.length-1,index));cinemaV11.progress=Math.max(0,Math.min(.999,progress));let beat=cinemaV11.beats[cinemaV11.index];enterBeatVisual(beat);renderBeatProgress(beat,cinemaV11.progress);$('#cinProgress').value=cinemaOverall()}
function cinemaTick(now){if(!cinemaV11.active)return;if(!cinemaV11.last)cinemaV11.last=now;let dt=now-cinemaV11.last;cinemaV11.last=now;if(!cinemaV11.paused){let beat=cinemaV11.beats[cinemaV11.index];cinemaV11.progress+=dt/beat.dur;if(cinemaV11.progress>=1&&cinemaV11.index<cinemaV11.beats.length-1){cinemaV11.index++;cinemaV11.progress=0;enterBeatVisual(cinemaV11.beats[cinemaV11.index])}renderBeatProgress(cinemaV11.beats[cinemaV11.index],cinemaV11.progress);$('#cinProgress').value=cinemaOverall()}cinemaV11.raf=requestAnimationFrame(cinemaTick)}
function startCinemaV11(fromIndex=0,fromMoment=null){if(cinemaV11.active){endCinemaV11(false)}cinema=true;cinemaV11.active=true;cinemaV11.paused=false;cinemaV11.fromMoment=fromMoment;cinemaV11.beats=makeCinemaBeats(fromMoment);cinemaV11.index=Math.max(0,Math.min(fromIndex,cinemaV11.beats.length-1));cinemaV11.progress=0;cinemaV11.last=0;$('#detail').classList.remove('open');$('#cinemaOverlay').classList.add('active');$('#cinemaTitle').classList.add('show');$('#cinemaControls').classList.add('show');$('#cinPlay').textContent='일시정지';headerFade(true);enterBeatVisual(cinemaV11.beats[cinemaV11.index]);cinemaV11.raf=requestAnimationFrame(cinemaTick)}
function endCinemaV11(openBoard=true){cinema=false;cinemaV11.active=false;cancelAnimationFrame(cinemaV11.raf);$('#cinemaOverlay').classList.remove('active');$('#cinemaTitle').classList.remove('show');$('#cinemaControls').classList.remove('show');resetCinemaVisuals();headerFade(false);if(openBoard)fitAll(true)}
startCinema=function(fromIndex=0){startCinemaV11(fromIndex,null)};endCinema=function(){endCinemaV11(true)};
$('#cinemaBtn').onclick=()=>startCinemaV11(0);$('#toolCinema').onclick=()=>startCinemaV11(0);$('#cinemaFromMoment').onclick=()=>startCinemaV11(0,selected);$('#cinPlay').onclick=()=>{cinemaV11.paused=!cinemaV11.paused;$('#cinPlay').textContent=cinemaV11.paused?'계속 보기':'일시정지';cinemaV11.last=performance.now()};$('#cinPrev').onclick=()=>setCinemaPosition(cinemaV11.index-1,0);$('#cinNext').onclick=()=>setCinemaPosition(cinemaV11.index+1,0);$('#cinRestart').onclick=()=>setCinemaPosition(0,0);$('#cinExit').onclick=()=>endCinemaV11(true);$('#cinProgress').oninput=e=>{let pct=+e.target.value/100,n=cinemaV11.beats.length-1,pos=pct*n,idx=Math.floor(pos),p=pos-idx;cinemaV11.paused=true;$('#cinPlay').textContent='계속 보기';setCinemaPosition(idx,p)};$('#enterBeat').onclick=()=>{let id=cinemaV11.focused;endCinemaV11(false);if(id){focusBoardMoment(id);selectMoment(id,true);toast('Cinema의 이 장면에서 기억 보드로 들어왔어요.')}};$('#walkAgain').onclick=()=>startCinemaV11(0,cinemaV11.fromMoment);$('#backBoard').onclick=()=>endCinemaV11(true);$('#finalOpen').onclick=()=>{let id=cinemaV11.focused;endCinemaV11(false);if(id){focusBoardMoment(id);openViewer(id)}};
/* Wire theme/style inspector quick controls */
let styleSec=document.createElement('div');styleSec.className='section';styleSec.hidden=false;styleSec.id='styleSection';styleSec.innerHTML=`<div class="label">STYLE</div><div class="ctaRow" style="margin-top:8px"><button class="miniBtn" id="quickPin">핀 바꾸기</button><button class="miniBtn" id="quickCard">카드 바꾸기</button></div>`;$('#detail .section.ctaRow').before(styleSec);$('#quickPin').onclick=()=>{let m=moments.find(x=>x.id===selected);snapshot();m.pinStyle=LT_PIN_STYLES[(LT_PIN_STYLES.indexOf(m.pinStyle)+1)%LT_PIN_STYLES.length];renderCards();selectMoment(m.id,true);persistBoard()};$('#quickCard').onclick=()=>{let m=moments.find(x=>x.id===selected);snapshot();m.cardStyle=LT_CARD_STYLES[(LT_CARD_STYLES.indexOf(m.cardStyle)+1)%LT_CARD_STYLES.length];renderCards();selectMoment(m.id,true);persistBoard()};
if($('#addBtn'))$('#addBtn').onclick=()=>{if(LTDEMO.readOnly)return;openAdd()};$('#confirmAdd').onclick=()=>{if(LTDEMO.readOnly)return;confirmAdd()};renderCards();renderThreads();updateKeywordFilter();formFor(addType);fitAll(false);applyPathHighlight();setTimeout(()=>{/* #891: 탭으로 들어오면 닫힘, ?open= 주소만 자동 열림(board.js bootDetailPanel) */bootDetailPanel()},100);
window.__LT58V11={youtubeId,youtubeThumb,youtubeThumbUrl,openEdit,saveEdit,chooseNext,highlightPath,startCinema:startCinemaV11,endCinema:endCinemaV11,setCinemaPosition,theme:t=>{document.body.dataset.theme=t},setMomentStyle:(id,pin,card)=>{let m=moments.find(x=>x.id===id);m.pinStyle=pin;m.cardStyle=card;renderCards()},get cinema(){return{active:cinemaV11.active,paused:cinemaV11.paused,index:cinemaV11.index,beat:cinemaV11.beats[cinemaV11.index]?.label,focused:cinemaV11.focused}},get state(){return{moments:moments.length,connections:connections.length,theme:document.body.dataset.theme,selected,keywords:[...new Set(moments.flatMap(m=>m.keywords||[]))]}}};

addEventListener('message',e=>{if(e.data?.type==='lt41-title-display'){if(typeof renderCards==='function')renderCards();if(typeof renderThreads==='function')renderThreads();if(selected)selectMoment(selected,$('#detail').classList.contains('open'));}});
addEventListener('lt-title-ready',()=>{if(typeof renderCards==='function')renderCards();if(typeof renderThreads==='function')renderThreads();if(selected)selectMoment(selected,$('#detail').classList.contains('open'));});

// #368 3차: 설정의 날짜 표기가 바뀌면 카드·실을 다시 그린다(상세는 다음에 열 때 새 표기).
addEventListener('lt-date-style-changed',()=>{try{renderCards()}catch{}try{renderThreads()}catch{}});

// #514 메모: 모바일 '선택한 순간' 줄의 top 을 머리줄 높이에서 계산한다.
// 고정 96px 은 머리줄이 두 줄이 되면 '진주빛 보드 · 읽기 전용' 표시와 다시 겹친다.
// 머리줄·테마 표시의 실제 아래끝을 재서 그보다 7px 아래에 둔다(390 한 줄일 때 96px 과 같은 값).
// 같은 재기로 판(boardFrame)의 시작 위치도 내려 보낸다 — 두 줄 머리줄(＋ 순간 추가가 둘째 줄)에서는
// 고정 100px보다 아래끝이 낮아(로그인 화면 107px 실측) 카드가 도구 줄 밑으로 들어가 비쳤다.
function syncMomentPickerTop(){
  const head=document.querySelector('header');
  const badge=document.getElementById('themeBadge');
  const bottoms=[head,badge].filter(Boolean).map(el=>el.getBoundingClientRect().bottom);
  const bottom=bottoms.length?Math.max(...bottoms):0;
  if(bottom>0) document.documentElement.style.setProperty('--lt-board-picker-top',Math.round(bottom+7)+'px');
  else document.documentElement.style.removeProperty('--lt-board-picker-top');
  const headBottom=head?head.getBoundingClientRect().bottom:0;
  /* #891(CTO): 판 제목(기억 보드·설명 줄)은 무대 밖 머리글 — 카드 무대(판)는 제목 아래끝 + 16px부터 시작한다.
     제목이 없으면 이처럼 머리줄 아래끝을 판 시작으로 쓴다(두 줄 머리줄 화면도 함께 이긴다). */
  const title=document.querySelector('.boardTitle');
  const titleBottom=title?title.getBoundingClientRect().bottom:0;
  const frameTop=titleBottom>0?titleBottom+16:headBottom;
  if(frameTop>0) document.documentElement.style.setProperty('--lt-board-frame-top',Math.round(frameTop)+'px');
  else document.documentElement.style.removeProperty('--lt-board-frame-top');
}
syncMomentPickerTop();
addEventListener('resize',syncMomentPickerTop);
if(typeof ResizeObserver==='function'){
  const pickerTopObserver=new ResizeObserver(syncMomentPickerTop);
  [document.querySelector('header'),document.getElementById('themeBadge'),document.querySelector('.boardTitle')].filter(Boolean).forEach(el=>pickerTopObserver.observe(el));
}
/* #662: 좁은 폭(≤580)에서는 머리줄이 두 줄이 되는데 테마 표시가 top:66 고정이라 머리줄 둘째 줄(배치 전환) 밑에 깔린다 —
   좁은 폭에서는 표시를 머리줄 안으로 옮겨 둘째 줄에서 함께 흐르게 하고, 넓어지면 제자리(main 안)로 되돌린다. */
function fitThemeBadge(){
  const el=document.getElementById('themeBadge'),head=document.querySelector('header');
  if(!el||!head)return;
  const narrow=matchMedia('(max-width:580px)').matches;
  if(narrow&&el.parentElement!==head){head.appendChild(el);syncMomentPickerTop()}
  else if(!narrow&&el.parentElement!==document.querySelector('main')){document.querySelector('main').appendChild(el);syncMomentPickerTop()}
}
fitThemeBadge();
addEventListener('resize',fitThemeBadge);

/* #601: 말풍선 설명(#584의 책 화면 mountTips와 같은 동작) — 마우스 올림·키보드 초점·휴대폰 길게 누름.
   문구는 단추의 aria-label과 같아서 낭독기와 눈이 같은 말을 듣는다. */
let tipTimer=0,tipTarget=null;
function showBoardTip(el){
 const text=el?.getAttribute?.('data-lt-tip');if(!text)return;
 let bubble=document.getElementById('lt-tip-bubble');
 if(!bubble){bubble=document.createElement('div');bubble.id='lt-tip-bubble';bubble.className='lt-tip-bubble';bubble.setAttribute('role','tooltip');document.body.appendChild(bubble)}
 tipTarget=el;bubble.textContent=text;bubble.hidden=false;
 const r=el.getBoundingClientRect(),b=bubble.getBoundingClientRect();
 const left=Math.max(8,Math.min(r.left+r.width/2-b.width/2,innerWidth-b.width-8));
 let top=r.top-b.height-8;if(top<8)top=r.bottom+8;
 bubble.style.left=left+'px';bubble.style.top=top+'px';
}
function hideBoardTip(){tipTarget=null;clearTimeout(tipTimer);const bubble=document.getElementById('lt-tip-bubble');if(bubble)bubble.hidden=true}
document.addEventListener('mouseover',e=>{const el=e.target.closest?.('[data-lt-tip]');if(el)showBoardTip(el)});
document.addEventListener('mouseout',e=>{if(tipTarget&&(!e.relatedTarget||!tipTarget.contains(e.relatedTarget)))hideBoardTip()});
document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-lt-tip]');if(el)showBoardTip(el)});
document.addEventListener('focusout',()=>hideBoardTip());
addEventListener('scroll',hideBoardTip,true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideBoardTip()});
document.addEventListener('pointerdown',e=>{const el=e.target.closest?.('[data-lt-tip]');if(!el||matchMedia('(hover:hover)').matches)return;tipTimer=setTimeout(()=>showBoardTip(el),500)},{passive:true});
for(const kind of ['pointerup','pointercancel','pointermove'])document.addEventListener(kind,e=>{if(matchMedia('(hover:hover)').matches)return;clearTimeout(tipTimer);if(kind!=='pointermove'||!tipTarget?.contains(e.target))hideBoardTip()},{passive:true});
