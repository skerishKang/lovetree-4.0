const firstMoment=LTDEMO.moments.find(m=>m.first)||LTDEMO.moments[0]||null;
const rootJump=document.querySelector('[data-focus="m01"]');if(rootJump&&firstMoment){rootJump.dataset.focus=firstMoment.id;rootJump.querySelector('b').textContent=firstMoment.title;}
const SPREADS=firstMoment?LT59Model.buildSpreads(LTDEMO.moments):[];
if(!firstMoment){const note=document.createElement('p');note.className='book-empty';note.textContent='이 트리에 아직 순간이 없어요.';const host=document.querySelector('#book');if(host)host.after(note);else document.body.append(note);}
const shelfBack=document.getElementById('shelfBackBtn');if(shelfBack){if(LT59Model.shelfReturn({source:parent.LT41?.source,embedded:parent!==window})==='shelf'){shelfBack.addEventListener('click',()=>parent.postMessage({type:globalThis.LT41_MSG.navigate,view:'track32-bookshelf.html'},location.origin))}else{shelfBack.hidden=true}}
const DEMO_VIDEO='data:video/mp4;base64,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';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
/* #519: 닫힌 창(opacity 0) 안의 입력칸이 Tab 초점을 받던 문제 — open일 때만 inert를 뺀다.
   책의 닫힌 창(상세·크게 보기·링크·갈림길·목차·이어진 순간)은 처음부터 inert다. */
const bookDialogs=[]; /* 열린 창 스택 — Esc는 맨 위 창 하나만 닫는다(공통 창 닫기 규칙과 같은 방식). */
function setBookOpen(el, open){if(!el)return;el.classList.toggle('open',!!open);const i=bookDialogs.indexOf(el);if(i>=0)bookDialogs.splice(i,1);if(open){el.removeAttribute('inert');bookDialogs.push(el)}else el.setAttribute('inert','')}
const topBookDialog=()=>bookDialogs[bookDialogs.length-1]||null;
const bookWrap=$('#bookWrap'),book=$('#book'),leftPage=$('#leftPage'),rightPage=$('#rightPage'),mobilePage=$('#mobilePage'),mobileContent=$('#mobileContent');
let current=0,recent=[],lastMoment=null,selectedMomentId=null,lensOn=true,machineState='IDLE',turn=null,turnAnim=null,focusAfter=null;
let customConnections=[];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
/* #368 2차: 페이지 넘김 — '종이처럼'(기본)은 #411 종이 넘김, '부드럽게'는 움직임 줄이기와 같은 0.35초 교차 페이드.
   설정은 이 기기에만 저장된다(lt41.pageTurn, 아래 한 장/두 장 보기(VIEW_KEY)와 같은 읽기). 시스템 움직임 줄이기가
   켜져 있으면 고른 값과 상관없이 부드럽게다. 설정을 바꾸면 셸이 lt41-page-turn 메시지로 알려 주고
   book-extra.js가 setPageTurnMode로 받는다(새로고침 없이 다음 넘김부터 적용). */
const PAGE_TURN_KEY='lt41.pageTurn';
let pageTurn='paper';try{pageTurn=localStorage.getItem(PAGE_TURN_KEY)==='smooth'?'smooth':'paper'}catch{}
function smoothTurn(){return reduced||pageTurn==='smooth'}
function setPageTurnMode(value){pageTurn=value==='smooth'?'smooth':'paper'}
window.setPageTurnMode=setPageTurnMode;
/* #393 4: 한 장/두 장 보기 — 폭으로 자동 정하지 않고 사용자가 고른다. 고른 값은 localStorage가 기억하고
   읽지 못하면 기본값(컴퓨터 두 장·좁은 화면 한 장)으로 동작한다. 폰 폭(600px 미만)에서는 두 장을 쓰지 않는다. */
const VIEW_KEY='lt41-book-view';
function storedView(){try{const v=localStorage.getItem(VIEW_KEY);return v==='single'||v==='double'?v:null}catch{return null}}
function defaultView(){return innerWidth<=820?'single':'double'}
let viewChoice=storedView();
/* #537: 폰 폭(600px 미만)은 화면 모양이 휴대폰(스크롤 흐름)이고, 넓은 화면의 한 장은 두 장 책의 한 쪽을 크게 보여 준다. */
function narrow(){return innerWidth<600}
const phoneSession=narrow()||(matchMedia('(pointer:coarse)').matches&&Math.min(screen.width,screen.height)<600);
let mobileDoubleActive=false;
let mobileSpreadHistory=false;
function single(){return phoneSession?!mobileDoubleActive:(viewChoice??defaultView())==='single'}
function applyViewAttr(){
 document.documentElement.dataset.bookView=single()?'single':'double';
 document.documentElement.dataset.bookShape=phoneSession&&!mobileDoubleActive?'phone':'wide';
 document.documentElement.classList.toggle('book-mobile-spread',mobileDoubleActive);
 syncViewButtons();
}
function syncViewButtons(){
 const s=single(),one=$('#singleViewBtn'),two=$('#doubleViewBtn');
 if(one)one.setAttribute('aria-pressed',String(s));
 if(two){two.setAttribute('aria-pressed',String(!s));two.hidden=false;two.disabled=false;two.setAttribute('aria-label','2장 — 펼친 책처럼 두 쪽 보기')}
}
function mobileSpreadExitControl(){
 let control=document.getElementById('mobile-spread-exit');
 if(!control){
  control=document.createElement('button');
  control.id='mobile-spread-exit';control.type='button';control.textContent='1장';
  control.setAttribute('aria-label','한 장 보기로 돌아가기');
  control.addEventListener('click',()=>setViewChoice('single'));
  bookWrap.append(control);
 }
 control.hidden=!mobileDoubleActive;
}
function spreadOrientationNotice(show){
 let hint=document.getElementById('book-rotate-hint');
 if(!hint){hint=document.createElement('div');hint.id='book-rotate-hint';hint.setAttribute('role','status');hint.textContent='휴대폰을 가로로 돌려 주세요';bookWrap.append(hint)}
 hint.hidden=!show;
}
function finishMobileSpread(){
 if(!mobileDoubleActive)return;
 mobileDoubleActive=false;
 mobileSpreadExitControl();
 spreadOrientationNotice(false);
 try{screen.orientation?.unlock?.()}catch{}
 if(document.fullscreenElement===bookWrap)document.exitFullscreen?.().catch(()=>{});
 applyViewAttr();const focus=LTDEMO.get()||null;renderSpread(posOfMoment(focus),focus,false);
}
async function beginMobileSpread(){
 if(mobileDoubleActive)return;
 mobileDoubleActive=true;
 mobileSpreadExitControl();
 if(!mobileSpreadHistory){
  history.pushState({...history.state,ltBookSpread:true},'',location.href);
  mobileSpreadHistory=true;
 }
 applyViewAttr();const focus=LTDEMO.get()||null;renderSpread(posOfMoment(focus),focus,false);
 try{await bookWrap.requestFullscreen?.()}catch{}
 try{await screen.orientation?.lock?.('landscape')}catch{}
 spreadOrientationNotice(innerWidth<innerHeight);
}
window.addEventListener('popstate',()=>{if(mobileDoubleActive){mobileSpreadHistory=false;finishMobileSpread()}});
// #1287: book scrolling temporarily reduces the parent's floating add button.
let bookScrollIdle;
document.addEventListener('scroll',()=>{
 if(!phoneSession)return;
 try{parent.document.body.classList.add('lt-book-scrolling')}catch{return}
 clearTimeout(bookScrollIdle);
 bookScrollIdle=setTimeout(()=>{try{parent.document.body.classList.remove('lt-book-scrolling')}catch{}},180);
},true);
window.addEventListener('pagehide',()=>{clearTimeout(bookScrollIdle);try{parent.document.body.classList.remove('lt-book-scrolling')}catch{}});

function setViewChoice(v){
 if(machineState!=='IDLE'){setTimeout(()=>setViewChoice(v),120);return}
 if(phoneSession){
  if(v==='double'){beginMobileSpread();return}
  if(mobileDoubleActive){if(mobileSpreadHistory){history.back()}else finishMobileSpread();return}
  return;
 }
 const focus=LTDEMO.get()||'';
 viewChoice=v;try{localStorage.setItem(VIEW_KEY,v)}catch{}
 applyViewAttr();renderSpread(posOfMoment(focus),focus||null,false);
}
const allMoments=()=>SPREADS.flatMap((s,i)=>[{...s.left,spread:i,side:'left'},{...s.right,spread:i,side:'right'}]).filter(m=>!m.synthetic);
const esc=globalThis.LTEscapeHtml; // A-15: 글자 막기 정본(html-escape.js) 한 벌
function titleMainOf(m){try{const v=window.LTBookTitle?.view?.(m);return v?.main||m?.title||''}catch{return m?.title||''}}
function titleSubOf(m){try{return window.LTBookTitle?.view?.(m)?.sub||''}catch{return ''}}
function dateOf(v){try{return window.LTBookTitle?.date?.(v)||v||''}catch{return v||''}}
function momentContent(m,compact=false){const mark=m.first?'<span class="first-mark">첫 순간</span>':'';let v='';
 if(m.url){const media=LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id);const vertical=window.LTMedia?.verticalVideo?.(m.url,m.mediaMetadata);v=`<div class="clipping moment" data-moment="${m.id}">${vertical?media+`<h2>${esc(titleMainOf(m))}</h2><p>${esc(m.note)}</p>`:`<h2>${esc(titleMainOf(m))}</h2>`+media+`<p>${esc(m.note)}</p>`}</div>`}
 else if(m.kind==='photo')v=`<div class="photo-piece moment" data-moment="${m.id}">${mark}<img src="${m.image}" alt=""><span class="photo-caption">${esc(m.emotion||"")}</span></div>`;
 else if(m.kind==='video')v=`<div class="film-piece moment" data-moment="${m.id}"><img src="${m.image}" alt=""><span class="example-video-label">영상 예시 이미지</span></div>`;
 else if(m.kind==='note')v=`<div class="note-piece moment" data-moment="${m.id}"><h2>${esc(titleMainOf(m))}</h2><p>${esc(m.note)}</p></div>`;
 else if(m.kind==='link'){const thumb=m.image?`<img class="link-thumb" src="${m.image}" ${m.fallbackImage?`onerror="this.onerror=null;this.src='${m.fallbackImage}'"`:''} alt="">`:'';v=`<div class="clipping moment" data-moment="${m.id}">${thumb}<div class="link-domain">${esc(m.domain||m.source)}</div><h2>${esc(titleMainOf(m))}</h2><p>${esc(m.note)}</p><div class="link-url">${esc(m.url||'')}</div><p class="quote">${m.url?'“다음 순간을 찾게 만든 링크.”':'링크 예시 · 원본 주소 없음'}</p></div>`;}
 else if(m.kind==='companion')v=`<div class="connection-note"><b>${esc(m.title||'이어진 마음')}</b><p>${esc(m.note)}</p></div>`;
 else if(m.kind==='collage')v=`<div class="collage moment" data-moment="${m.id}"><div class="big"><img src="${m.image}" alt=""></div><div class="stamp">SPRING<br>MEMORY</div><div class="ticket"><b>18:08</b>CHERRY ROUTE<br>PLAYLIST 04</div></div>`;
 else if(m.kind==='text')v=`<div class="letter moment" data-moment="${m.id}"><h2>${esc(titleMainOf(m))}</h2><p>${esc(m.note)}<br><br>한 페이지를 넘길 때마다 이유가 하나씩 선명해졌다.</p><div class="sign">— 그날의 나</div></div>`;
 else v=`<div class="archive-piece moment" data-moment="${m.id}"><h2>${esc(titleMainOf(m))}</h2><p>${esc(m.note)}</p><div class="archive-stat"><div><b>07</b><span>순간</span></div><div><b>06</b><span>CONNECTIONS</span></div><div><b>03</b><span>EMOTIONS</span></div><div><b>01</b><span>갈림길</span></div></div></div>`;
 if(m.synthetic)return v;
 // #627: 카드(책 페이지)에 확정된 꼬리표를 1~3개만 작게 보인다(노래 → 멤버 → 무대 순서, LTTagLine 한 벌).
 // 꼬리표가 없으면 원본 모양(감정 칩)을 그대로 둔다. 모듈이 늦으면 lt41-tagline-ready에서 한 번 다시 그린다.
 const _ltSrc=window.LTDEMO?window.LTDEMO.moments.find(x=>x.id===m.id):null;
 const _ltTags=(window.LTTagLine&&_ltSrc)?window.LTTagLine.cardTags(_ltSrc.keywords):null;
 const _chips=_ltTags&&_ltTags.length?_ltTags.map(k=>`<span class="chip lt-tag-chip">${esc(k.value)}</span>`).join(''):m.keywords.map(k=>`<span class="chip">#${esc(k)}</span>`).join('');
 const info=`<div class="moment-title">${!m.url&&["photo","video","collage"].includes(m.kind)?`<h3>${esc(titleMainOf(m))}</h3>`:""}<p>${esc(dateOf(m.date))} · ${esc(m.emotion)} · ${esc(m.source)}</p><div class="chips">${_chips}</div></div>`;return v+info}
function pageFace(m,side){return `<div class="page-content">${momentContent(m)}</div><div class="folio ${side==='left'?'folio-left':'folio-right'}">${LT59Model.folioLabel(m.spread,side)}</div>`}
// #295: 순간 내용이 페이지보다 길면 그 페이지만 안에서 스크롤해 끝까지 읽게 한다(여유 4px = book-usability.mjs pageOverflows).
// 짧은 순간은 넘침이 없어 클래스가 붙지 않고 화면이 그대로다. 모바일은 현재 쪽이 넘칠 때만 book-wrap이 세로 터치 스크롤을 허용해
// 좌우 스와이프 넘기기는 그대로다(세로로 끌면 브라우저가 스크롤을 가져가고 pointercancel로 터치 상태가 정리된다).
// 보완(같은 날): 판정을 렌더 때만 하면 사진·영상 썸네일이 늦게 로드되어 페이지가 나중에 넘치게 될 때 다시 잘린다 —
// 이미지 load·창 크기 변경·페이지 크기 변화(ResizeObserver) 뒤에도 다시 판정한다. book.js는 클래식 스크립트라
// createOverflowRejudge(book-usability.mjs)를 못 불러 오므로 book-extra.js가 연결하고, 여기서는 관찰 대상만 넘긴다.
/* 이슈 584: 넓은 화면 두 장 모드에서 내용이 넘치면 스크롤 대신 영상 틀을 줄여 맞춘다.
   390 한 장 모드(휴대폰 모양)는 #537 대로 스크롤을 쓰므로 건드리지 않는다. 글자는 줄이지 않는다(#548 기준선). */
function fitPageMedia(el){
 if(document.documentElement.dataset.bookView!=='double')return;
 const frames=[...el.querySelectorAll('.yt-play,.yt-frame')].filter(f=>!f.closest('.lt-fallback-card'));
 if(!frames.length)return;
 frames.forEach(f=>{f.style.height='';delete f.dataset.ltFit}); // 지난 번에 줄인 높이를 지우고 자연 크기에서 다시 잰다
 let excess=el.scrollHeight-el.clientHeight;
 if(excess<=4)return;
 for(const f of frames){
  if(excess<=4)break;
  const h=f.getBoundingClientRect().height;
  const min=f.classList.contains('is-vertical')?220:180; // 이 밑으로는 줄이지 않는다(글자 기준선은 그대로)
  const next=Math.max(min,h-excess-8);
  f.style.height=next+'px';f.dataset.ltFit='min';
  excess=el.scrollHeight-el.clientHeight;
 }
}
function markOverflowPages(root){const els=(root||document).querySelectorAll('.page-content,.mobile-content');let mobileOverflows=false;els.forEach(el=>{if(!el.classList.contains('mobile-content'))fitPageMedia(el);const over=el.scrollHeight-el.clientHeight>4;el.classList.toggle('lt-overflow',over);if(over&&el.classList.contains('mobile-content')&&el.closest('#mobilePage'))mobileOverflows=true});bookWrap.classList.toggle('lt-page-scroll',mobileOverflows);window.__TRACK59__?.overflowRejudge?.observe(els)}
function connectionSummary(id){return LT59Model.connectionSummary(id,LTDEMO.moments,LTDEMO.edges)} function updateConnectionSummary(id){$('#whyMargin').innerHTML=`<span>연결 이유 · 실제 연결</span>${esc(connectionSummary(id))}`} function metadataFor(id){return allMoments().find(m=>m.id===id)}function metaWhy(m){const c=customConnections.find(c=>c.targetMomentId===m.id);const source=LTDEMO.moments.find(x=>x.id===m.id);return c?.why||source?.whyNext||'다음 순간에 대한 설명이 없습니다.'}
/* #537: 보기 모드(한 장/두 장)와 화면 모양(휴대폰/넓은 화면)은 따로 정한다 — 폰 폭에서만 휴대폰 모양이다.
   넘기는 단위도 모드를 따른다: 한 장은 순간 하나(1/26 … 26/26), 두 장은 펼침면 하나(1/13 … 13/13).
   그래서 위치(current)의 뜻은 한 장이면 '순간 순번', 두 장이면 '펼침면 순번'이다. 변환은 LT59Model이 맡는다. */
const pageSteps=()=>LT59Model.pageSteps(SPREADS);
const pageCount=()=>single()?pageSteps().length:SPREADS.length;
const spreadOfPos=pos=>LT59Model.spreadOfPos(SPREADS,pos,single());
const posOfMoment=id=>LT59Model.posOfMoment(SPREADS,id,single());
const currentSpread=()=>SPREADS[spreadOfPos(current)];
const momentAtPos=pos=>{if(!single())return SPREADS[pos]?.left||null;const step=pageSteps()[pos];return step?SPREADS[step.spread]?.[step.side]||null:null};
const pad2=v=>String(v).padStart(2,'0');
/* 한 장 페이지: 휴대폰은 지금 모양 그대로(스크롤 흐름), 넓은 화면은 두 장 책의 한 쪽과 같은 종이·글씨 크기로
   오른쪽 페이지(#rightPage)에 그린다. book-extra.js가 이 함수를 감싸 제목·다음 순간 안내를 덧그린다. */
function singlePageContent(m,pos,total){const kicker=`${pad2(pos+1)} · ${dateOf(m.date)}`;return `<div class="mobile-kicker"><span>${esc(kicker)}</span><span>${pad2(pos+1)} / ${pad2(total)}</span></div>${momentContent(m)}`}
function singleFaceMarkup(m,pos,phone){if(phone)return `<div class="mobile-content">${singlePageContent(m,pos,pageCount())}</div>`;return `<div class="page-content">${momentContent(m)}</div><div class="folio folio-right">${pad2(pos+1)}</div>`}
function renderSpread(idx,focusId=null,land=true){
 const total=pageCount();if(!total)return;
 current=Math.max(0,Math.min(total-1,idx));
 const si=spreadOfPos(current),s=SPREADS[si],phone=narrow(),one=single()?momentAtPos(current):null;
 if(single()){if(land||focusId)LTDEMO.select(focusId||(one?one.id:SPREADS[si].left.id))}
 else if(land||focusId)LTDEMO.select(focusId||SPREADS[si].left.id);
 if(one){/* 한 장: 이 순간 하나가 한 쪽 전체다(작은 줄 없음) */
  if(phone)mobileContent.innerHTML=singlePageContent(one,current,total);
  else{rightPage.innerHTML=momentContent({...one,spread:si});mobileContent.innerHTML=''}
 }else{leftPage.innerHTML=momentContent({...s.left,spread:si});rightPage.innerHTML=momentContent({...s.right,spread:si})}
 $('#eyebrow').textContent=single()?(one?`${dateOf(one.date)}${one.emotion?' · '+one.emotion:''}`:''):s.eyebrow;
 $('#leftFolio').textContent=pad2(si*2+1);$('#rightFolio').textContent=single()?pad2(current+1):pad2(si*2+2);
 updateConnectionSummary(focusId||(one?one.id:s.left.id));
 $('#pageLabel').textContent=`${pad2(current+1)} / ${pad2(total)}`;
 $('#prevBtn').disabled=current<=0;$('#nextBtn').disabled=current>=total-1;
 const b=$('#branchTab');if(s.branch){b.hidden=false;const outs=LTDEMO.edges.filter(e=>e.kind==='parent'&&e.from===s.branch.source).length;b.innerHTML=`<span class="branch-icon" aria-hidden="true">⑂</span> 갈림길 ${outs}`;b.title=s.branch.label;b.setAttribute('aria-label',s.branch.label+' — 갈림길 선택');b.dataset.to=String(posOfMoment(s.branch.moment));b.dataset.focus=s.branch.moment}else b.hidden=true;
 const seen=focusId||(one?one.id:s.left.id);if(land||focusId){recent=recent.filter(id=>id!==seen);recent.push(seen);recent=recent.slice(-5)}
 setTimeout(()=>{if(focusId){document.querySelector(`[data-moment="${focusId}"]`)?.classList.add('focused')}if(land){(document.querySelector(`[data-moment="${focusId||(one?one.id:s.left.id)}"]`)||document.querySelector('.moment'))?.classList.add('landed')}},35);
 renderArchive();syncLensClone();markOverflowPages();machineState='IDLE';bookWrap.classList.remove('turning');
 if(phone&&(land||focusId))window.scrollTo({top:0,behavior:'auto'});
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>e.classList.remove('show'),1200)}
function hideLens(){overBook=false;$('#lens').classList.remove('active');$('#lensHandle').classList.remove('active');$('#lensMeta').classList.remove('active');$('#mobileInspect').classList.remove('active');if(machineState==='INSPECTING')machineState='IDLE'}
/* #393 3: 넘김 동안 매 프레임 하는 일은 transform·opacity뿐이다. 아래 페이지 그림·clip-path·drop-shadow는
   prepareTurn에서 한 번 끝내고, 그림자·어둠·광은 미리 만든 층의 opacity로만 움직인다(innerHTML·filter·clip-path 재계산 없음). */
/* #635 PR B: 책장 넘기기 힌트 상자(.turn-why)는 쪽 가운데 글 위에 떠 있다(390 감상에서 특히). 감상 화면에서는 아예 내지 않는다 — 내 트리는 넘기는 동안의 힌트로 그대로 둔다. */
function setTurnProgress(p){p=Math.max(0,Math.min(1,p));turn.progress=p;const sh=$('#flipSheet'),dir=turn.dir;$('#turnWhy').classList.toggle('show',p>.16&&!LTDEMO.readOnly);bookWrap.classList.toggle('turning',p>.04);if(smoothTurn()){sh.style.opacity=(1-p).toFixed(3);return}const {deg,bend}=LT59Model.turnAngle(p,dir);sh.style.transform=`rotateY(${deg}deg) rotateZ(${dir==='next'?-bend:bend}deg)`;sh.classList.toggle('curl',p>.05&&p<.95);if(turn.frontFace)turn.frontFace.style.opacity=(1-p*.92).toFixed(3);if(turn.backFace)turn.backFace.style.opacity=(.08+p*.92).toFixed(3);if(turn.shadowLayer)turn.shadowLayer.style.opacity=(.18+.5*Math.sin(Math.PI*p)).toFixed(3);if(turn.shadeLayer)turn.shadeLayer.style.opacity=p.toFixed(3);if(turn.sheenLayer)turn.sheenLayer.style.opacity=(1-p).toFixed(3)}
function prepareTurn(dir,target=null,whyOverride=null){if(machineState==='PAGE_DRAGGING'||machineState==='PAGE_COMMITTING'||machineState==='LANDING')return false;hideLens();const total=pageCount();const t=target??(dir==='next'?(single()?current+1:(SPREADS[current].nextOverride??current+1)):(single()?current-1:(SPREADS[current].prevOverride??current-1)));if(t<0||t>=total)return false;machineState='PAGE_DRAGGING';turn={dir,target:t,progress:0,startX:0,lastX:0,moved:false};const sh=$('#flipSheet'),front=$('#flipFront'),back=$('#flipBack');sh.className=`flip-sheet active ${dir}${smoothTurn()?' reduced':''}`;sh.style.opacity='';const phone=narrow(),curPos=current,cur=SPREADS[spreadOfPos(curPos)],tar=SPREADS[spreadOfPos(t)],curM=single()?momentAtPos(curPos):null,tarM=single()?momentAtPos(t):null;
/* #393 3: 재생 중인 영상은 넘기는 동안 썸네일로 대체된다(넘김 면을 새로 그리므로) — 살아 있는 페이지의 video는 잠깐 멈춘다. */
for(const v of book.querySelectorAll('video'))try{v.pause()}catch{}
if(smoothTurn()){/* 부드럽게(움직임 줄이기와 같은 속도): 종이 넘김 대신 0.35초 교차 페이드 — 낡은 펼침 면을 얇게 덮고 서서히 걷는다. */
 front.innerHTML=single()?singleFaceMarkup(curM,curPos,phone):`<div class="reduced-faces">${pageFace({...cur.left,spread:curPos},'left')}${pageFace({...cur.right,spread:curPos},'right')}</div>`;back.innerHTML=''}
else if(single()){front.innerHTML=singleFaceMarkup(curM,curPos,phone);back.innerHTML=singleFaceMarkup(tarM,t,phone)}
else{front.innerHTML=dir==='next'?pageFace({...cur.right,spread:curPos},'right'):pageFace({...cur.left,spread:curPos},'left');back.innerHTML=dir==='next'?pageFace({...tar.left,spread:t},'left'):pageFace({...tar.right,spread:t},'right')}
/* #393 3: 아래 페이지는 여기 한 번만 그린다 — 넘기는 동안에는 다시 그리지 않는다. 덮인 쪽 표 번호도 미리 바꾼다. */
if(!single()){if(smoothTurn()){leftPage.innerHTML=momentContent({...tar.left,spread:t});rightPage.innerHTML=momentContent({...tar.right,spread:t});$('#leftFolio').textContent=pad2(t*2+1);$('#rightFolio').textContent=pad2(t*2+2)}else if(dir==='next'){rightPage.innerHTML=momentContent({...tar.right,spread:t});$('#rightFolio').textContent=pad2(t*2+2)}else{leftPage.innerHTML=momentContent({...tar.left,spread:t});$('#leftFolio').textContent=pad2(t*2+1)}}
else if(phone){mobileContent.innerHTML=singlePageContent(tarM,t,total)}
else{rightPage.innerHTML=momentContent({...tarM,spread:spreadOfPos(t)});$('#rightFolio').textContent=pad2(t+1)}
markOverflowPages();turn.frontFace=front;turn.backFace=back;turn.shadowLayer=sh.querySelector('.flip-shadow');turn.shadeLayer=sh.querySelector('.flip-shade');turn.sheenLayer=sh.querySelector('.flip-sheen');$('#turnWhy').querySelector('span').textContent=whyOverride||'책의 순서대로 페이지를 넘깁니다.';setTurnProgress(0);return true}
function finishTurn(commit){if(!turn)return;machineState=commit?'PAGE_COMMITTING':'PAGE_DRAGGING';/* #1231: 움직임 감소에서는 화면 넘김 효과를 유지하되, 현재 장과 단추의 상태만 클릭 즉시 확정한다. */
if(reduced&&commit){current=turn.target;$('#prevBtn').disabled=current<=0;$('#nextBtn').disabled=current>=pageCount()-1;}
const from=turn.progress,to=commit?1:0,dur=smoothTurn()?350:Math.max(220,650*Math.abs(to-from));const start=performance.now();function step(now){const q=Math.min(1,(now-start)/dur);/* #393 3: 천천히 들리고 가운데 빠르고 천천히 내려앉는 ease-in-out */const ease=smoothTurn()?q:(q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2);setTurnProgress(from+(to-from)*ease);if(q<1){turnAnim=requestAnimationFrame(step);return}const target=turn.target;$('#turnWhy').classList.remove('show');
/* #393 3: 새 페이지를 먼저 완성하고 같은 프레임에 종이를 치운다 — 넘김 끝 빈 틈 0. (기존 80ms setTimeout 틈이 '뚝'이었다) */
if(commit){machineState='LANDING';const landingFocus=focusAfter||(single()?momentAtPos(target)?.id:SPREADS[target].left.id)||'';focusAfter=null;renderSpread(target,landingFocus,true)}else{machineState='IDLE';renderSpread(current,LTDEMO.get(),false)}
const sh=$('#flipSheet');sh.className='flip-sheet';sh.style.transform='';sh.style.opacity='';turn=null}turnAnim=requestAnimationFrame(step)}
function autoTurn(dir,target=null,focus=null,whyOverride=null){if(!prepareTurn(dir,target,whyOverride))return;focusAfter=focus;machineState='PAGE_COMMITTING';finishTurn(true)}
function startEdgeDrag(e,dir){if(e.button!==undefined&&e.button!==0)return;if(!prepareTurn(dir))return;turn.startX=e.clientX;turn.lastX=e.clientX;try{e.currentTarget.setPointerCapture(e.pointerId)}catch{};e.currentTarget.classList.add('hot');e.preventDefault()}
function moveEdgeDrag(e){if(!turn||machineState!=='PAGE_DRAGGING'||!turn.startX)return;const dx=e.clientX-turn.startX;turn.lastX=e.clientX;turn.moved=turn.moved||Math.abs(dx)>5;const denom=Math.max(220,bookWrap.getBoundingClientRect().width*.40);const p=turn.dir==='next'?-dx/denom:dx/denom;setTurnProgress(p)}
function endEdgeDrag(e){if(!turn)return;e.currentTarget?.classList?.remove('hot');const click=!turn.moved;const commit=click||turn.progress>=.38;finishTurn(commit)}
['prev','next'].forEach(dir=>{const el=$(`#${dir}Edge`);el.addEventListener('pointerdown',e=>startEdgeDrag(e,dir));el.addEventListener('pointermove',moveEdgeDrag);el.addEventListener('pointerup',endEdgeDrag);el.addEventListener('pointercancel',e=>{if(turn)finishTurn(false)})});
$('#prevBtn').onclick=()=>autoTurn('prev');$('#nextBtn').onclick=()=>autoTurn('next');document.addEventListener('keydown',e=>{if($('#archivePanel').classList.contains('open')||document.querySelector('.lt-lightbox')||e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(e.key==='ArrowRight')autoTurn('next');if(e.key==='ArrowLeft')autoTurn('prev')});
/* Desktop magnifier — exact DOM clone + 1.95x actual zoom */
const lens=$('#lens'),lensStage=$('#lensStage'),lensHandle=$('#lensHandle'),lensMeta=$('#lensMeta');let tx=0,ty=0,lx=0,ly=0,overBook=false,hoverMoment=null;
function syncLensClone(){if(machineState==='PAGE_DRAGGING'||machineState==='PAGE_COMMITTING')return;const clone=book.cloneNode(true);clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));clone.querySelectorAll('.flip-sheet,.binding-light').forEach(n=>n.remove());clone.style.width=bookWrap.clientWidth+'px';clone.style.height=bookWrap.clientHeight+'px';lensStage.innerHTML='';lensStage.appendChild(clone);const mobile=$('#mobileLensStage');const mc=mobilePage.cloneNode(true);mc.removeAttribute('id');mc.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));mobile.innerHTML='';mobile.appendChild(mc)}
function updateLensTarget(ev){if(ev.target.closest?.('.lt-media')){overBook=false;hideLens();return;}if(narrow()||!lensOn||!['IDLE','INSPECTING'].includes(machineState))return;const r=bookWrap.getBoundingClientRect();overBook=ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;if(!overBook){hideLens();return}machineState='INSPECTING';tx=ev.clientX;ty=ev.clientY;kickLensLoop();if(!lens.classList.contains('active')){lx=tx;ly=ty}hoverMoment=ev.target.closest?.('[data-moment]')?.dataset.moment||null;lens.classList.add('active');lensHandle.classList.add('active');if(hoverMoment){const m=metadataFor(hoverMoment);lensMeta.innerHTML=`<b>${esc(titleMainOf(m))}</b><div class="meta-line">${esc(m.source)} · ${esc(dateOf(m.date))} · ${esc(m.emotion)}<br>${m.keywords.map(k=>'#'+esc(k)).join(' ')}</div><div class="meta-why">연결 이유 · ${esc(metaWhy(m))}</div>`;lensMeta.classList.add('active')}else lensMeta.classList.remove('active')}
function lensLoop(){lx+=(tx-lx)*.7;ly+=(ty-ly)*.7;if(overBook&&lensOn&&!narrow()&&machineState==='INSPECTING'){const size=238,half=size/2,left=Math.max(8,Math.min(innerWidth-size-8,lx-half)),top=Math.max(76,Math.min(innerHeight-size-8,ly-half));lens.style.left=left+'px';lens.style.top=top+'px';lensHandle.style.left=(left+size-28)+'px';lensHandle.style.top=(top+size-22)+'px';const r=bookWrap.getBoundingClientRect(),px=Math.max(0,Math.min(r.width,lx-r.left)),py=Math.max(0,Math.min(r.height,ly-r.top)),scale=1.95;lensStage.style.width=r.width+'px';lensStage.style.height=r.height+'px';lensStage.style.transform=`translate(${size/2-px*scale}px,${size/2-py*scale}px) scale(${scale})`;const ml=(left+size+282<innerWidth)?left+size+12:Math.max(8,left-282);lensMeta.style.left=ml+'px';lensMeta.style.top=Math.max(76,Math.min(innerHeight-160,top+40))+'px'}}
/* 재측정(책 유휴 5초 rAF 600회, #346 보드와 같은 원칙): 렌즈가 실제로 움직이는 동안에만 다음 프레임을 예약한다.
   게이트는 위 그리기 조건과 같은 식이라 화면 결과는 그대로이고, 감춰져 있을 때는 예약하지 않는다.
   다시 움직일 때는 pointermove(updateLensTarget)가 깨운다. */
function lensActive(){return overBook&&lensOn&&!narrow()&&machineState==='INSPECTING'}
let lensFrame=0;function lensLoopTick(){lensLoop();lensFrame=lensActive()?requestAnimationFrame(lensLoopTick):0}function kickLensLoop(){if(!lensFrame&&lensActive())lensFrame=requestAnimationFrame(lensLoopTick)}
document.addEventListener('pointermove',updateLensTarget);
/* Mobile gesture arbitration: tap / long press / horizontal swipe / vertical scroll */
let touch=null,pressTimer=null;const mobileLens=$('#mobileInspect'),mobileLensStage=$('#mobileLensStage');
function positionMobileLens(x,y){const size=150,left=Math.max(8,Math.min(innerWidth-size-8,x-size/2)),top=Math.max(66,Math.min(innerHeight-size-12,y-size-178));mobileLens.style.left=left+'px';mobileLens.style.top=top+'px';const r=mobilePage.getBoundingClientRect(),px=Math.max(0,Math.min(r.width,x-r.left)),py=Math.max(0,Math.min(r.height,y-r.top)),scale=2.1;mobileLensStage.style.width=r.width+'px';mobileLensStage.style.height=r.height+'px';mobileLensStage.style.transform=`translate(${size/2-px*scale}px,${size/2-py*scale}px) scale(${scale})`}
bookWrap.addEventListener('pointerdown',e=>{if(!narrow()||e.pointerType==='mouse')return;if(machineState!=='IDLE')return;const m=e.target.closest('[data-moment]');touch={id:e.pointerId,x:e.clientX,y:e.clientX,lastX:e.clientX,lastY:e.clientY,mode:'pending'};if(m){pressTimer=setTimeout(()=>{if(!touch||touch.mode!=='pending')return;touch.mode='inspect';machineState='INSPECTING';mobileLens.classList.add('active');positionMobileLens(touch.lastX,touch.lastY)},420)}/* 이슈 638: 고치기 손잡이 위 손끝은 가두지 않는다 — 가두면 탭 뒤 click이 bookWrap으로 가서 '✎ 고치기'의 수정 창이 열리지 않았다(마우스는 애초에 가두지 않아 열렸다). */;if(!(e.target.closest&&e.target.closest('[data-title-edit],[data-note-edit]'))){try{bookWrap.setPointerCapture(e.pointerId)}catch{}}});
bookWrap.addEventListener('pointermove',e=>{if(!narrow()||!touch||e.pointerId!==touch.id)return;touch.lastX=e.clientX;touch.lastY=e.clientY;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;if(touch.mode==='inspect'){positionMobileLens(e.clientX,e.clientY);return}if(touch.mode==='pending'){if(Math.abs(dx)>12||Math.abs(dy)>12)clearTimeout(pressTimer);if(Math.abs(dx)>32&&Math.abs(dx)>Math.abs(dy)*1.25){touch.mode='swipe';clearTimeout(pressTimer);const dir=dx<0?'next':'prev';if(prepareTurn(dir)){turn.startX=touch.x;turn.lastX=e.clientX;const denom=Math.max(180,bookWrap.clientWidth*.72);setTurnProgress(Math.abs(dx)/denom)}}else if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)*1.1){touch.mode='vertical';clearTimeout(pressTimer)}}else if(touch.mode==='swipe'&&turn){const dx2=e.clientX-touch.x;const denom=Math.max(180,bookWrap.clientWidth*.72);setTurnProgress(Math.abs(dx2)/denom)}});
function mobileEnd(e,cancel=false){if(!narrow()||!touch||e.pointerId!==touch.id)return;clearTimeout(pressTimer);const dx=e.clientX-touch.x,dy=e.clientY-touch.y,mode=touch.mode;touch=null;if(mode==='inspect'){mobileLens.classList.remove('active');machineState='IDLE';return}if(mode==='swipe'&&turn){finishTurn(!cancel&&turn.progress>=.34);return}if(mode==='pending'&&Math.abs(dx)>18&&Math.abs(dx)<32){toast('짧은 스와이프 · 페이지 유지')}machineState='IDLE'}bookWrap.addEventListener('pointerup',e=>mobileEnd(e,false));bookWrap.addEventListener('pointercancel',e=>mobileEnd(e,true));
/* Detail + viewer */
function showDetail(id){LTDEMO.select(id);recent=recent.filter(item=>item!==id);recent.push(id);recent=recent.slice(-5);updateConnectionSummary(id);const m=metadataFor(id);if(!m)return;lastMoment=m;selectedMomentId=id;$('#detailTag').textContent=`${LTLabels.type(m.kind)} · ${dateOf(m.date)} · ${m.emotion}`;$('#detailTitle').textContent=titleMainOf(m);$('#detailBody').textContent=`${m.note} · 출처: ${m.source}`;$('#detailChips').innerHTML=m.keywords.map(k=>`<span class="chip">#${esc(k)}</span>`).join('');$('#detailWhy').textContent='연결 이유 · '+metaWhy(m);const a=$('#detailOriginalLinkBtn');if(m.kind==='link'&&m.url){a.href=m.url;a.textContent=isYouTubeUrl(m.url)?'YouTube에서 열기 ↗':'원본 링크 열기 ↗';a.hidden=false}else{a.hidden=true;a.removeAttribute('href')}setBookOpen($('#detail'),true)}
function openViewer(){if(!lastMoment)return;const m=lastMoment;$('#viewerTitle').textContent=titleMainOf(m);$('#viewerText').textContent=`${titleSubOf(m)?'▶ '+titleSubOf(m)+' · ':''}${m.note} · ${dateOf(m.date)} · ${m.emotion}`;const a=$('#viewerOriginalLinkBtn');a.hidden=true;a.removeAttribute('href');if(m.url)$('#viewerMedia').innerHTML=LTMedia.markup(m.url,m.title,m.mediaMetadata,m.id,null,{emotion:m.emotion,date:m.date,note:m.note});else if(m.kind==='video')$('#viewerMedia').innerHTML=`<img src="${m.image}" alt=""><p class="viewer-note">영상 예시 이미지 · 재생할 원본 영상은 없습니다.</p>`;else if(m.kind==='link'){const thumb=m.image?`<img src="${m.image}" ${m.fallbackImage?`onerror="this.onerror=null;this.src='${m.fallbackImage}'"`:''} alt="">`:'';$('#viewerMedia').innerHTML=thumb||`<div class="viewer-link-card">${esc(titleMainOf(m))}<br><small class="viewer-link-meta">${esc(m.domain||m.source)}<br>${esc(m.url||'')}</small></div>`;if(m.url){a.href=m.url;a.textContent=isYouTubeUrl(m.url)?'YouTube에서 열기 ↗':'원본 링크 열기 ↗';a.hidden=false}}else if(m.image)$('#viewerMedia').innerHTML=`<img src="${m.image}" alt="${esc(m.title)}">`;else $('#viewerMedia').innerHTML=`<div class="viewer-text-card">${esc(m.note)}</div>`;setBookOpen($('#viewer'),true)}
// Moment cards are reading surfaces; only their explicit controls open editors or media.
$('#detailClose').onclick=()=>setBookOpen($('#detail'),false);$('#openViewerBtn').onclick=openViewer;$('#viewerClose').onclick=()=>setBookOpen($('#viewer'),false);$('#viewer').addEventListener('click',e=>{if(e.target===$('#viewer'))setBookOpen($('#viewer'),false)});

/* V1.1 · Real Link 순간 input */
function normalizeHttpUrl(raw){let v=String(raw||'').trim();if(!v)return null;if(!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(v))v='https://'+v;try{const u=new URL(v);if(!['http:','https:'].includes(u.protocol))return null;return u.href}catch{return null}}
// #1059: 사본을 걷어내고 정본(youtube-id.mjs → globalThis.LTYouTubeId)을 부른다. 전역 스크립트 화면은 LTMedia를 거친다.
function youtubeId(raw){const n=normalizeHttpUrl(raw);if(!n)return null;try{const direct=globalThis.LTYouTubeId?.youtubeIdFrom;if(direct)return direct(n, {allowThumbnail:false})||null;
const d=(window.LTMedia&&typeof window.LTMedia.describe==='function')?window.LTMedia.describe(n):null;
return (d&&d.kind==='youtube')?d.videoId||null:null}catch{return null}}
function isYouTubeUrl(raw){return !!youtubeId(raw)}

/* Index */
function renderArchive(){const all=allMoments();$('#archiveList').innerHTML=all.map(m=>{const at=posOfMoment(m.id);return `<button class="archive-item ${at===current?'current':''}" data-jump="${at}" data-focus="${m.id}"><b>${pad2(at+1)} · ${esc(titleMainOf(m))}</b><small>${esc(LTLabels.type(m.kind))} · ${esc(m.emotion)} · ${esc(m.source)}</small></button>`}).join('');$('#pathViz').innerHTML=SPREADS.map((s,i)=>`${i?'<span class="path-line"></span>':''}<span class="path-dot ${spreadOfPos(current)===i?'current':''}" title="${esc(s.left.title)}"></span>`).join('');$('#recentList').innerHTML=[...recent].reverse().map(id=>metadataFor(id)).filter(Boolean).map(m=>`<button class="archive-item" data-jump="${posOfMoment(m.id)}" data-focus="${esc(m.id)}"><b>${posOfMoment(m.id)+1}</b><small>${esc(titleMainOf(m))}</small></button>`).join('')}
let archiveOpener=null,archiveByDisplay=false;
function paintInlineBookDisplay(mode){
 const toggle=$('#book-display-inline');
 toggle?.querySelectorAll('[data-book-display]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.bookDisplay===mode)));
}
function closeArchive(){if(archiveByDisplay){
 archiveByDisplay=false;
 paintInlineBookDisplay('book');
 try{localStorage.setItem('lt41.bookDisplay','book')}catch{}
 try{parent.postMessage({type:globalThis.LT41_MSG.prefs,patch:{bookDisplay:'book'}},location.origin)}catch{}
 }
const panel=$('#archivePanel');panel.classList.remove('open');panel.inert=true;$('#archiveBtn').setAttribute('aria-expanded','false');archiveOpener?.focus()}function openArchive(){archiveOpener=document.activeElement;renderArchive();const panel=$('#archivePanel');panel.inert=false;panel.classList.add('open');$('#archiveBtn').setAttribute('aria-expanded','true');$('#archiveClose').focus()}$('#archiveBtn').setAttribute('aria-expanded','false');$('#archiveBtn').setAttribute('aria-controls','archivePanel');$('#archiveBtn').onclick=openArchive;$('#book-display-inline')?.addEventListener('click',e=>{
 const choice=e.target.closest('[data-book-display]')?.dataset.bookDisplay;
 if(!choice)return;
 paintInlineBookDisplay(choice);
 if(choice==='list'){archiveByDisplay=true;openArchive()}
 else if($('#archivePanel').classList.contains('open'))closeArchive();
});$('#archiveClose').onclick=closeArchive;$('#archivePanel').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeArchive()}});$('#archivePanel').addEventListener('click',e=>{const b=e.target.closest('[data-jump]');if(!b)return;const target=+b.dataset.jump,focus=b.dataset.focus||(momentAtPos(target)?.id||'');closeArchive();if(target===current){renderSpread(current,focus,false)}else autoTurn(target>current?'next':'prev',target,focus)});$('#detailIndexBtn').onclick=()=>{setBookOpen($('#detail'),false);openArchive()};
/* Branch chooser */
/* 갈림길 고르는 창 — 맨 위 창 하나만 닫고, 초점은 연 책갈피로 돌려 준다. */
let branchOpener=null,branchTargets=[],branchCurrentId='',branchExpanded=false,branchQuery='';
function branchPathCount(id){const seen=new Set();const walk=x=>{for(const e of LTDEMO.edges){if(e.kind==='parent'&&e.from===x&&!seen.has(e.to)){seen.add(e.to);walk(e.to)}}};walk(id);return seen.size}
// #1060: ytimg 주소는 정본(youtube-id.mjs)에 크기 옵션만 넘겨 만든다(책 모델·media-preview와 같은 값).
function branchThumb(m){const id=youtubeId(m.url||m.externalUrl||'');if(id){const stage=globalThis.LTYouTubeId?.youtubeStageThumbUrl;const src=stage?stage(id,'hqdefault'):(window.LTMedia?.youtubeThumbUrl?window.LTMedia.youtubeThumbUrl(id):'');if(src)return `<img src="${esc(src)}" referrerpolicy="no-referrer" alt="" loading="lazy">`;}if(m.image)return `<img src="${esc(m.image)}" alt="" loading="lazy">`;return '✦'}
function branchCardMarkup(m){const tone=window.LT59Model?LT59Model.emotionTone(m.emotion):1;const main=m.id===branchCurrentId;const cnt=branchPathCount(m.id);const countLine=cnt?`<span class="branch-count">순간 ${cnt}개가 이어짐</span>`:'';return `<button class="choice${main?' current-path':''}" data-branch-target="${posOfMoment(m.id)}" data-focus="${esc(m.id)}"><span class="branch-thumb" aria-hidden="true">${branchThumb(m)}</span><span class="branch-info"><span class="branch-kind">${main?'현재 경로 계속':'다른 경로'}</span><b>${esc(titleMainOf(m))}</b><span class="branch-meta"><span class="emotion-dot" data-tone="${tone}" aria-hidden="true"></span>${esc(m.emotion||'기록')} · ${esc(dateOf(m.date))}</span>${countLine}</span></button>`}
function renderBranchChoices(){const box=$('#branchChoices');const q=branchQuery.trim().toLowerCase();const shown=q?branchTargets.filter(m=>titleMainOf(m).toLowerCase().includes(q)):branchTargets;const list=branchExpanded||q?shown:shown.slice(0,6);box.innerHTML=list.length?list.map(branchCardMarkup).join(''):`<p class="branch-empty">제목이 일치하는 길이 없어요.</p>`;const more=$('#branchMore');if(more){more.hidden=!(shown.length>6&&!q);more.textContent=`더 보기 · ${shown.length-6}개`}}
function openBranch(){const s=currentSpread();if(!s.branch)return;const source=LTDEMO.moments.find(m=>m.id===s.branch.source);if(!source)return;const raw=LTDEMO.edges.filter(e=>e.kind==='parent'&&e.from===source.id).map(e=>LTDEMO.moments.find(m=>m.id===e.to)).filter(Boolean);if(!raw.length)return;branchTargets=[raw[0],...raw.slice(1).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))];branchCurrentId=raw[0].id;branchOpener=document.activeElement;branchExpanded=false;branchQuery='';$('#branchSearch').value='';$('#branchTitle').textContent=`${titleMainOf(source)}에서 이어진 길 ${branchTargets.length}개`;$('#branchSearchWrap').hidden=branchTargets.length<7;renderBranchChoices();setBookOpen($('#branchModal'),true);$('#branchClose').focus()}
function closeBranch(){if(!$('#branchModal').classList.contains('open'))return;setBookOpen($('#branchModal'),false);const opener=branchOpener;branchOpener=null;if(opener&&opener.isConnected)opener.focus();else $('#branchTab').focus()}
$('#branchTab').onclick=openBranch;
$('#branchClose').onclick=closeBranch;
$('#branchModal').addEventListener('click',e=>{if(e.target===$('#branchModal'))closeBranch()});
$('#branchSearch').addEventListener('input',e=>{branchQuery=e.target.value;renderBranchChoices()});
$('#branchMore').onclick=()=>{branchExpanded=true;renderBranchChoices();$('#branchChoices').scrollTop=0};
$('#branchChoices').onclick=e=>{if(e.target.closest('#branchMore'))return;const b=e.target.closest('[data-branch-target]');if(!b)return;const t=+b.dataset.branchTarget;closeBranch();t===current?renderSpread(t,b.dataset.focus,false):autoTurn(t>current?'next':'prev',t,b.dataset.focus)};
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||topBookDialog()!==$('#branchModal'))return;e.preventDefault();e.stopPropagation();closeBranch()},true);
$('#lensBtn').onclick=()=>{lensOn=!lensOn;$('#lensBtn').classList.toggle('active',lensOn);if(!lensOn)hideLens()};
/* #642: 전체 화면 단추로도 resize 가 일어난다. 그때 renderSpread 가 장을 처음부터 다시 그려
   재생 중이던 iframe 을 지우므로 재생이 끊기고 썸네일로 되돌아갔다. 그래서 ① 전체 화면 중
   (document.fullscreenElement)과 fullscreenchange 직후의 resize 는 장을 다시 그리지 않고
   ② 책 안에서 재생 중(그 자리 iframe · 재생 중 video)일 때도 창 크기가 바뀌어도
   배치 속성(applyViewAttr)만 바꾼다. 재생하지 않는 상태에서는 창 크기에 맞춰 다시
   배치된다(기존 동작). 휴대폰 세로↔가로 돌리기도 같은 resize 경로다. */
let fullscreenGuardUntil=0,fullscreenRecheck=0;
document.addEventListener('fullscreenchange',()=>{fullscreenGuardUntil=Date.now()+800;clearTimeout(fullscreenRecheck);fullscreenRecheck=setTimeout(()=>{fullscreenGuardUntil=0;if(machineState==='IDLE'&&!document.fullscreenElement&&!playingInBook())renderSpread(current,null,false)},850)});
const playingInBook=()=>book.querySelector('.yt-frame,.lt-yt-frame')||[...book.querySelectorAll('video.lt-user-video')].some(v=>!v.paused);
window.addEventListener('resize',()=>{if(mobileDoubleActive)spreadOrientationNotice(innerWidth<innerHeight);applyViewAttr();if(machineState!=='IDLE')return;if(document.fullscreenElement||Date.now()<fullscreenGuardUntil||playingInBook())return;renderSpread(current,null,false);setTimeout(syncLensClone,70)});
/* #393 4: 한 장/두 장 보기 단추 — 고른 값은 기억되고, 지금 보던 순간은 그대로 둔다. 첫 그림 전에 속성부터 정한다. */
applyViewAttr();
$('#singleViewBtn').onclick=()=>setViewChoice('single');
$('#doubleViewBtn').onclick=()=>setViewChoice('double');
renderSpread(posOfMoment(LTDEMO.get()),LTDEMO.get(),true);setTimeout(syncLensClone,120);
// #627: 꼬리표 칩 규칙(tag-line.mjs)이 클래식 스크립트 뒤에 도착한다 — 페이지를 한 번 다시 그려 칩을 붙인다.
addEventListener('lt41-tagline-ready',()=>{if(machineState==='IDLE'&&!document.fullscreenElement)renderSpread(current,null,false)});
window.__TRACK59__={playbackMoments:()=>allMoments(),getState:()=>({current,machineState,lensOn,recent:[...recent],detail:$('#detail').classList.contains('open'),viewer:$('#viewer').classList.contains('open'),archive:$('#archivePanel').classList.contains('open'),branch:$('#branchModal').classList.contains('open'),page:current,total:pageCount(),pageIds:pageSteps().map(x=>x.id),shape:narrow()?'phone':'wide',mobile:single(),view:single()?'single':'double'}),turnNext:()=>autoTurn('next'),turnPrev:()=>autoTurn('prev'),jump:(i,id)=>renderSpread(i,id,false),jumpToMoment:id=>renderSpread(posOfMoment(id),id,false),pageSteps,pageCount,posOfMoment,momentAtPos,currentSpread,spreadOfPos,setView:setViewChoice,showDetail,openArchive,openBranch,closeBranch,meta:metadataFor,normalizeHttpUrl,youtubeId,rejudgeOverflow:()=>markOverflowPages()};
/* #1001 (3): 같은 트리 안 순간 변경(고치기·삭제·이전 순간 바꾸기·연결·해제)은 셸이 모델만 갱신하고
   lt41-moments-saved로 알린다 — 화면을 다시 띄우지 않고 지금 펼침면·고른 순간·열린 상세·스크롤을 그대로 다시 그린다.
   boardSync·editTree(#997)와 같은 방식: 알림을 받아 화면이 자기 상태를 다시 그린다. 재적재 0. */
addEventListener('message',e=>{
 if(!globalThis.LT41_isShellMessage?.(e)||(e.data?.type!==globalThis.LT41_MSG.momentsSaved&&!(e.data?.type===globalThis.LT41_MSG.treesSaved&&e.data.background)))return;
 if(typeof LTDEMO.refresh!=='function'||!LTDEMO.refresh())return;
 if(e.data.background)LTDEMO.refreshLibrary?.();
 const fm=LTDEMO.moments.find(m=>m.first)||LTDEMO.moments[0]||null;
 const next=fm?LT59Model.buildSpreads(LTDEMO.moments):[];
 SPREADS.length=0;for(const sp of next)SPREADS.push(sp);
 let sel=LTDEMO.get();
 if(!LTDEMO.moments.some(m=>m.id===sel)){sel=e.data.momentId||fm?.id||'';if(sel)LTDEMO.select(sel);}
 if(machineState!=='IDLE')return;
 // 책의 실제 상세 판은 book-extra.js가 오른쪽 페이지(.page-detail)나 옆 패널(#detailSide)에 배치한다(#detail은 닫힘).
 const detailWasOpen=!!selectedMomentId&&(!!document.querySelector('.page-detail')||($('#detailSide')&&!$('#detailSide').hidden));
 renderSpread(current,null,false);
 if(sel)document.querySelector(`[data-moment="${sel}"]`)?.classList.add('focused');
 if(detailWasOpen){if(LTDEMO.moments.some(m=>m.id===selectedMomentId))showDetail(selectedMomentId);else{const side=$('#detailSide');if(side)side.hidden=true;}}
});

