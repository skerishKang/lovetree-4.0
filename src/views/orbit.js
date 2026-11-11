import originalCSS from './orbit-source.css?inline';
import {titleView, formatDisplayDate} from '../../public/v41/book-usability.mjs';
import {filterMomentEntries, momentHeadTitle} from '../../v41/moment-list.js';
import {fallbackCardMarkup, thumbFallbackAttrs, needsFallbackCard, mountThumbFallback, VIDEO_UNAVAILABLE_TEXT} from '../../public/v41/thumb-fallback.mjs';
import samples from './orbit-samples.json';
import {escape as esc, orbitRecords, resume, remember} from './memory.js';
import {SERVICE, GO_TREES, READ_BOOK, VIEW_TREE, NEW_TREE, BOOK_IS_READING} from '../terms.js';
import {mediaLinkView} from '../media.js';
import {createView} from './lifecycle.js';

export const ORBIT_EXAMPLE = {
  id: 'orbit-example', title: '다시, 그 순간으로', subject: '감상 예시', updatedAt: '2026-01-01',
  moments: samples.map((c,i) => ({id:c.id, title:c.title, note:c.memo || c.whyNext, emotion:c.emotion, date:c.date.replaceAll('.','-'), parentId:i?samples[i-1].id:null, relation:i?samples[i-1].whyNext:'', image:c.image, poster:c.type==='video', nextIds:[c.next,c.branch].filter(Boolean), createdAt:`2026-01-01T00:00:${String(i).padStart(2,'0')}Z`}))
};
const rings={main:{rx:700,ry:330,zAmp:420,zBase:0,speed:1,band:0},inner:{rx:520,ry:260,zAmp:330,zBase:-80,speed:1.18,band:0},outer:{rx:900,ry:430,zAmp:520,zBase:-40,speed:.82,band:0},upper:{rx:760,ry:260,zAmp:460,zBase:-120,speed:.92,band:-250},lower:{rx:780,ry:250,zAmp:470,zBase:-100,speed:1.06,band:250}};
const extraCSS=`:host{display:block;height:100dvh;min-height:540px;font-family:var(--ui,system-ui,sans-serif)}.app{height:100%;font-family:var(--ui,system-ui,sans-serif)}.card{text-align:left;padding:0;border:3px solid #f2cd7c;box-shadow:0 24px 60px rgba(0,0,0,.38),0 0 0 1px rgba(255,225,160,.72),0 0 16px rgba(230,177,76,.45)}.card:after{content:'';position:absolute;inset:2px;border:1px solid rgba(255,234,183,.9);border-radius:inherit;pointer-events:none;transition:border-color .2s,box-shadow .2s}.card .surface{transition:transform .25s ease}.card:hover,.card:focus-visible{z-index:3000!important;border-color:#ffe6a6;box-shadow:0 24px 60px rgba(0,0,0,.4),0 0 0 2px rgba(255,224,158,.75),0 0 26px rgba(238,190,104,.68)}.card:hover:after,.card:focus-visible:after{border-color:#fff0c7;box-shadow:inset 0 0 18px rgba(255,221,150,.28)}.card:hover .surface,.card:focus-visible .surface{transform:scale(1.035)}.card:hover img,.card:focus-visible img{filter:saturate(.9) brightness(1.06)}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}.card.mine{border-color:var(--lt-gold-line);box-shadow:0 24px 60px rgba(0,0,0,.38),0 0 0 1px var(--lt-gold-line),0 0 22px var(--lt-gold-glow)}.card.mine:after{border-color:var(--lt-gold-line)}.card:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #e8b8c9;outline-offset:5px}.topbar{z-index:70;gap:16px}.topbar button{pointer-events:auto}.top-actions{display:flex;gap:20px;align-items:center}.center{pointer-events:none;max-width:90vw}.center .actions{pointer-events:none}.center .actions button{pointer-events:auto}.center h1{font-size:clamp(30px,4vw,54px)}.center p{line-height:1.8}.actions{flex-wrap:wrap}.subtleBtn{min-height:44px}.primary-cta{background:#eee7e0!important;color:#28212b!important;border-color:#eee7e0!important}.hint{pointer-events:none}.caption{pointer-events:none}.card .memoText{overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow-wrap:anywhere}.orbit-dialog{border:1px solid #564957;color:#eee7e9;background:#151118;border-radius:22px;width:min(900px,94vw);max-height:88dvh;padding:0;overflow:auto}.orbit-dialog::backdrop{background:#030307d9;backdrop-filter:blur(12px)}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:42px}.detail-image{width:100%;height:390px;object-fit:contain;background:#08070a;border-radius:12px}.detail-image--vertical{display:block;width:auto;max-width:100%;aspect-ratio:9/16;margin:0 auto}.detail-paper{min-height:280px;background:#eae2d3;color:#4d3a40;padding:35px;font:24px/1.7 Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:8px;transform:rotate(-2deg)}.detail-copy h2{font-size:30px;line-height:1.3;overflow-wrap:anywhere}.detail-copy p{font-size:15px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;color:#c8beca}.detail-copy small{color:#bd9cad}.detail-buttons{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}.detail-buttons button,.detail-buttons a,.close{padding:10px 14px;border:1px solid #615364;background:#302537;border-radius:99px;color:#eee3eb;text-decoration:none;cursor:pointer;min-height:44px}.media-unrecognized{display:block;margin-top:20px;padding:10px 14px;border:1px solid #615364;border-radius:10px;background:#241d2a;color:#c8beca;font-size:13px;line-height:1.8;overflow-wrap:anywhere}.close{position:absolute;right:12px;top:10px}.index-list{padding:35px;display:grid;gap:8px}.index-list h2{margin:8px 0 20px}.index-list button{text-align:left;border:1px solid #514454;background:#221b27;color:#eee5ed;padding:14px;border-radius:10px;cursor:pointer}.index-list small{display:block;color:#b9a4be;margin-top:6px}.center-scrim{position:absolute;z-index:10;left:50%;top:50%;width:min(820px,96vw);height:min(560px,74dvh);transform:translate(-50%,-50%);pointer-events:none;background:radial-gradient(ellipse 62% 58% at 50% 49%,rgba(3,3,8,.9) 0%,rgba(3,3,8,.78) 40%,rgba(3,3,8,.42) 68%,rgba(3,3,8,0) 100%)}.center{z-index:22}.center .center-note{margin:15px 0 0;font-size:11px;letter-spacing:0;line-height:1.7;color:#d4cee0}.menuBtn{pointer-events:auto;min-height:44px;padding:10px 15px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(9,8,14,.62);color:#ece7f1;font-size:11px;letter-spacing:.06em;backdrop-filter:blur(8px)}.menuBtn:hover{border-color:rgba(255,255,255,.44);background:rgba(255,255,255,.09)}.hint{font-size:10px;letter-spacing:.04em;color:#9c97a6}@media(max-width:650px){.center-scrim{width:min(560px,104vw);height:min(430px,56dvh);background:radial-gradient(ellipse 64% 58% at 50% 47%,rgba(3,3,8,.93) 0%,rgba(3,3,8,.84) 40%,rgba(3,3,8,.46) 70%,rgba(3,3,8,0) 100%)}.center .center-note{font-size:10px}.topbar{padding:14px 18px}.brand{font-size:9px;letter-spacing:.12em}.top-actions{gap:12px}.detail-grid{grid-template-columns:1fr;padding:48px 22px 24px;gap:14px}.detail-image{height:220px}.detail-paper{min-height:150px;padding:20px;font-size:20px}.detail-copy h2{font-size:24px}.center h1{font-size:30px}.hint{font-size:10px;bottom:18px}.actions{gap:8px}.subtleBtn{padding:10px 12px;font-size:12px}.detail-copy p{font-size:14px}}@media(max-width:768px){.brand{font-size:12px}.menuBtn{font-size:14px}.subtleBtn{font-size:14px}.hint{font-size:14px}.center .center-note{font-size:14px}.eyebrow{font-size:12px}.focusActions button,.focusActions a{font-size:14px}.focusInfo .kicker{font-size:12px}.meta{font-size:14px}.why b{font-size:14px}.panelHead strong{font-size:14px}.media-unrecognized{font-size:14px}.card.video .playGlyph{font-size:12px}.card.video .duration{font-size:12px}.card.link .surface:after{font-size:12px}.card.memo .memoKicker{font-size:12px}.card.memo .memoFoot{font-size:12px}.card .caption{font-size:12px}.firstMark{font-size:12px}.index-list small{font-size:14px}}.index-filters{display:flex;flex-wrap:wrap;gap:8px;margin:-6px 0 20px}.indexFilter{padding:7px 14px;border:1px solid #514454;border-radius:999px;background:#221b27;color:#cfc3d6;font:inherit;font-size:13px;cursor:pointer;min-height:36px}.indexFilter.active{border-color:#e8b8c9;color:#fff;background:#3a2c40}.indexFilter:focus-visible{outline:3px solid #e8b8c9;outline-offset:2px}.index-empty{color:#b9a4be;font-size:14px;line-height:1.7;margin:6px 0 0}.detail-grid{position:relative}.detail-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:6;min-width:44px;min-height:44px;padding:8px 13px;border:1px solid #615364;border-radius:999px;background:#302537;color:#eee3eb;font:inherit;font-size:15px;cursor:pointer}.detail-nav--prev{left:10px}.detail-nav--next{right:10px}.detail-nav:disabled{opacity:.35;cursor:default}.detail-nav:focus-visible{outline:3px solid #e8b8c9;outline-offset:2px}.detail-nav-note{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:6;margin:0;color:#bd9cad;font-size:12px}`;

export function mountOrbit(host,{trees,storage,context,actions,authHtml='',onSelect=()=>{},recordNote=null,examples=[],onOpen=null,empty=false,titleDisplay='both',momentList=null}) {
 const example=context.readOnly;
 const {root:shadow, signal, track, dispose}=createView(host);
 const demo=empty?false:(example || !trees.length);
 const records=orbitRecords(trees);
 // #347 후속: 화면 제목 한 벌(book-usability)로 큰 제목·작은 영상 제목·날짜를 그린다.
 const titleMode=titleDisplay;
 const titleOf=m=>titleView(m,titleMode);
 const mainOf=m=>titleOf(m).main||m.title||'';
 const dateOf=m=>formatDisplayDate(m.date);
 const subMarkup=m=>{const sub=titleOf(m).sub;return sub?'<span class="videoTitle">▶ '+esc(sub)+'</span>':''};
 // 2026-11-08: 내 순간이 궤도 수보다 적으면 남는 자리만 예시로 채운다(흐린 카드).
 // 2026-11-10(#340): 내 기록 YouTube 썸네일 카드(youtubeThumb)는 사진 카드 모양에 재생 표시(.card.video .playGlyph)를 붙인다.
 const memberCards=records.map((m,i)=>({...m,type:m.youtubeThumb&&m.image?'video':(m.image?'photo':'memo'),first:m.parentId===null,ring:Object.keys(rings)[i%5],baseAngle:i*2.399967,phaseOffset:i*.29,zOffset:(i%7-3)*28,tiltX:(i%5-2)*3.2,tiltY:(i%7-3)*4.2,tiltZ:(i%9-4)*1.8,sizeClass:i%3===0?'lg':'md'}));
  // #379: 채우는 예시 카드는 줄여서 궤도를 가볍게 — 내 카드가 먼저 채워진다.
  const fillers=demo?[]:(Array.isArray(examples)?examples:[]).slice(0,Math.max(0,24-memberCards.length)).map((c,extraIndex)=>{const i=memberCards.length+extraIndex;return {...c,key:'example-'+c.id,treeId:ORBIT_EXAMPLE.id,example:true,type:c.image?'photo':'memo',first:false,note:c.memo||c.whyNext,next:c.nextIds?.[0]||null,branch:c.nextIds?.[1]||null,ring:Object.keys(rings)[i%5],baseAngle:i*2.399967,phaseOffset:i*.29,zOffset:(i%7-3)*28,tiltX:(i%5-2)*3.2,tiltY:(i%7-3)*4.2,tiltZ:(i%9-4)*1.8,sizeClass:i%3===0?'lg':'md'};});
  const all=demo?samples.map(c=>({...c,key:c.id,treeId:ORBIT_EXAMPLE.id,note:c.memo||c.whyNext})):[...memberCards,...fillers];
  // #394: 순간 목록은 모든 트리의 순간(최근 순)을 쓴다. 없으면(예시 판본) 기존 카드 목록을 그대로 쓴다.
  // 목록에서 연 순간의 앞·뒤 순서는 열기 전 목록 순서(트리 고르기 포함)를 그대로 따른다.
  let listFilter=momentList?.initialTreeId||'all';
  const listRows=()=>momentList?filterMomentEntries(momentList.entries,listFilter):all;
  const findMoment=key=>(momentList?momentList.entries:all).find(c=>c.key===key)||all.find(c=>c.key===key)||null;
  const poolFor=c=>(momentList&&momentList.entries.some(x=>x.key===c.key))?momentList.entries:all;
  // #379: 궤도마다 카드 수를 세어 각도를 같은 간격으로 나눈다 — 같은 궤도에 카드가 몰리면 서로 포개진다.
  // 간격은 여기서 한 번만 정하고(회전 중에도 유지), 프레임 계산은 더하지 않는다.
  if(!demo){const ringNames=Object.keys(rings);const perRing={},slot={};for(const c of all)perRing[c.ring]=(perRing[c.ring]||0)+1;for(const c of all){const k=slot[c.ring]||0;slot[c.ring]=k+1;c.baseAngle=(k/perRing[c.ring])*Math.PI*2;c.phaseOffset=ringNames.indexOf(c.ring)*.42;}}
  // #429 2/2: 화면 폭별 카드 수 상한 — 1280 이상 28장, 900~1279 20장, 650~899 14장, 그 아래(390 포함) 10장.
 // 값은 마운트 때 정하지 않고 frame마다 폭으로 다시 판정해 창 크기가 바뀌면 따라간다(넘치는 카드는 숨긴다).
 const CARD_CAPS=[[1280,28],[900,20],[650,14],[0,10]];
 const cardCapFor=w=>{for(const [min,cap] of CARD_CAPS)if(w>=min)return cap;return 10;};
 const cards=all.slice(0,48), last=demo?all[0]:resume(storage,trees);
 const lastCard=demo?all[0]:all.find(c=>c.treeId===last?.tree.id&&c.id===last?.moment.id)||all[0];
 shadow.innerHTML=`<style>${originalCSS}${extraCSS}.auth-entry{white-space:nowrap}</style><section class="app" aria-label="${SERVICE} 첫 화면"><div class="topbar"><span class="brand">${SERVICE} · MEMORY ORBIT</span><div class="top-actions"><button class="menuBtn" data-do="index">순간 목록</button>${authHtml}</div></div><div class="world"></div><div class="center-scrim" aria-hidden="true"></div><div class="center"><div class="eyebrow">${demo?'나의 첫 순간':'WELCOME BACK'}</div><h1>${demo?'좋아하는 순간부터.':'다시, 그 순간으로.'}</h1><p>${demo?'간직하고 싶은 장면에 마음을 남겨 보세요.<br>지금 떠오르는 순간 하나면 충분해요.':'기억은 아직 여기에서 이어지고 있어요.'}</p><div class="actions"><button class="subtleBtn primary-cta" data-do="${demo?'new':'continue'}">${demo?NEW_TREE:'이어 보던 순간'}</button><button class="subtleBtn" data-do="${demo?'continue':'new'}">${demo?'예시 순간 감상':NEW_TREE}</button><button class="subtleBtn" data-do="trees">${GO_TREES}</button></div><p class="center-note">${demo?'감상 예시 · 내 기록에는 저장되지 않아요':esc(recordNote??`${all.length}개의 순간 · 서버에 보관`)}</p></div><div class="hint">드래그 · 금테 카드를 눌러 감상</div></section><dialog class="orbit-dialog" aria-label="순간 감상"></dialog>`;
 const app=shadow.querySelector('.app'),world=shadow.querySelector('.world'),dialog=shadow.querySelector('dialog');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let paused=reduced,phase=0,raf=0,previous=0,drag=null,moved=0,opener=null,hoveredCard=null;
 // #41 마우스 패럴랙스: 중심 기준 제한된 변위를 보간한다(phase를 누적하지 않음). 멈춤·reduced·팝업·백그라운드에서 정지, 터치에는 걸지 않는다.
 // 깊이별 차등은 SRC064 원본의 카메라를 그대로 쓴다(reference/originals/src064-orbit.html):
 //   목표 = (포인터 - 화면 중심) × 배율, 카드 이동량 = 카메라 × (0.45 + sc × 0.3) — 가까운 카드가 더 크게 움직인다.
 // 하나의 층(.world)을 통째로 미는 방식은 배경이 함께 밀려 깊이로 읽히지 않았다.
 const finePointer=matchMedia('(pointer:fine) and (hover:hover)'), CAMERA_X=.045, CAMERA_Y=.030, CAMERA_LIMIT_X=34, CAMERA_LIMIT_Y=22, CAMERA_LERP=.055;
 let cameraTarget={x:0,y:0}, camera={x:0,y:0};
 const motionOn=() => !paused && !hoveredCard && !dialog.open && !document.hidden;
 const neutralizePointer=() => { cameraTarget={x:0,y:0}; camera={x:0,y:0}; world.style.transform=''; };
 // #213 2번: 움직임 켜기/멈춤은 도구 줄의 "보기" 메뉴가 부른다(setMotionPaused).
 const setMotionPaused=(next)=>{paused=!!next;if(paused)neutralizePointer();schedule();};
 function rememberCard(c){if(!demo)remember(storage,c.treeId,c.id);}
 // #394 1번: 상세 창에서 열기 전 목록 순서(트리 고르기 포함) 그대로 앞·뒤로 옮겨 본다.
 // 목록에 없는 순간(예시 채움 카드 등)은 옮겨 볼 목록이 없으니 화살표를 두지 않는다.
 let detailMoment=null;
 function stepDetail(dir){const order=listRows();const at=order.findIndex(x=>x.key===detailMoment?.key);const next=order[at+dir];if(!next)return;renderDetail(next);dialog.querySelector(dir<0?'[data-do=prev]':'[data-do=next]')?.focus();}
 function focus(c){if(!c)return;if(!c.example){onSelect(c.id);rememberCard(c);}if(!dialog.open)opener=shadow.activeElement;renderDetail(c);}
 function renderDetail(c){detailMoment=c;
  const children=c.example?[all.find(x=>x.id===c.next),all.find(x=>x.id===c.branch)].filter(Boolean):demo?[all.find(x=>x.id===c.next),all.find(x=>x.id===c.branch)].filter(Boolean):poolFor(c).filter(x=>x.treeId===c.treeId&&x.parentId===c.id);
  const link = mediaLinkView(c.url);
  // #393: 순간 상세 창도 같은 틀 규칙 — 세로 영상(쇼츠·세로 비율 정보)은 세로 틀, 썸네일 잘림 없음.
  const vertical=!!(c.url&&globalThis.LTMedia?.verticalVideo?.(c.url,c.mediaMetadata));
  const order=listRows(),at=order.findIndex(x=>x.key===c.key),hasNav=at>=0&&order.length>1;
  const atStart=hasNav&&at===0,atEnd=hasNav&&at===order.length-1;
  // #394 3번: 제목은 정리 화면과 같은 규칙(momentHeadTitle) — 자동 기본 문구("youtube.com에서 간직한 순간")는
  // 표시하지 않고, 직접 쓴 제목이 없으면 마음 한마디를 큰 글씨로 쓴다(둘 다 없으면 제목 칸을 비워 둔다).
  const head=momentHeadTitle(c,titleMode);
  const nav=hasNav?`<button class="detail-nav detail-nav--prev" data-do="prev" aria-label="이전 순간"${atStart?' disabled':''}>←</button><button class="detail-nav detail-nav--next" data-do="next" aria-label="다음 순간"${atEnd?' disabled':''}>→</button>${atStart||atEnd?`<p class="detail-nav-note" role="status">${atStart?'처음 순간':'마지막 순간'}</p>`:''}`:'';
  dialog.innerHTML=`<button class="close" data-do="close" aria-label="순간 닫기">닫기 ×</button>${nav}<div class="detail-grid"><div data-lt-thumb-host>${c.image?`<img class="detail-image${vertical?' detail-image--vertical':''}" src="${esc(c.image)}" alt="${esc(head.main||c.title)}"${thumbFallbackAttrs(c,{candidates:c.thumbCandidates||[c.image],writable:!demo&&!c.example,variant:'detail'})} referrerpolicy="no-referrer">`:(!demo&&!c.example&&needsFallbackCard(c,{autoLoad:false})?fallbackCardMarkup(c,{writable:!demo&&!c.example,variant:'detail'}):`<div class="detail-paper">${esc(c.note)}</div>`)}</div><div class="detail-copy"><small>${demo||c.example?'감상 예시':esc(c.subject||'내 순간')} · ${esc(c.emotion)}</small>${head.main?`<h2>${esc(head.main)}</h2>`:''}${head.sub?`<span class="videoTitle">▶ ${esc(head.sub)}</span>`:''}<small>${esc(dateOf(c))}${(demo||c.example)&&c.type==='video'?' · 영상 포스터 예시':''}</small>${head.memoAsMain?'':`<p>${esc(c.note)}</p>`}${c.relation?`<small>이전 순간에서 이어진 이유</small><p>${esc(c.relation)}</p>`:''}<div class="detail-buttons"><button data-do="book" title="${BOOK_IS_READING}">${READ_BOOK}</button><button data-do="work">${demo||c.example?NEW_TREE:VIEW_TREE}</button>${link ? (link.kind === 'invalid' ? `<span class="media-unrecognized" role="note">${esc(link.text)}</span>` : `<a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">${esc(link.text)} ↗</a>`) : ''}</div>${children.length?`<p>다음으로 이어진 순간</p><div class="detail-buttons">${children.map(x=>`<button data-next="${esc(x.key)}">${esc(mainOf(x))}</button>`).join('')}</div>`:'<p>다음 이야기를 기다리는 순간이에요.</p>'}</div></div>`;
  dialog.querySelector('[data-do=book]').onclick=()=>{dialog.close();if(onOpen&&!c.example)onOpen(c);else actions.openBook(c.treeId,c.id,demo)};
  dialog.querySelector('[data-do=work]').onclick=()=>{dialog.close();demo?actions.requestMoment('new'):actions.openWorkspace(c.treeId,c.id)};
  dialog.querySelector('[data-do=prev]')?.addEventListener('click',()=>stepDetail(-1));
  dialog.querySelector('[data-do=next]')?.addEventListener('click',()=>stepDetail(1));
  if(!dialog.open)dialog.showModal();else dialog.querySelector('.close').focus();
 }
 // #394: 순간 목록 — 모든 트리의 순간을 최근 순으로, 위에서 트리를 골라 본다([전체][모아둔 순간][트리1]…).
 // 제목은 정리 화면과 같은 규칙(momentHeadTitle): 자동 기본 문구는 표시하지 않고 마음 한마디를 큰 글씨로 쓴다.
 function index(){opener=shadow.activeElement;
  const rows=listRows();
  const filterChips=(momentList?.trees||[]).map(t=>`<button class="indexFilter${listFilter===t.id?' active':''}" data-tree-filter="${esc(t.id)}" aria-pressed="${listFilter===t.id}">${esc(t.label)}</button>`).join('');
  const filterMarkup=filterChips?`<div class="index-filters" role="group" aria-label="트리별로 보기"><button class="indexFilter${listFilter==='all'?' active':''}" data-tree-filter="all" aria-pressed="${listFilter==='all'}">전체</button>${filterChips}</div>`:'';
  const heading=listFilter==='all'?(demo?'예시 순간':'나의 순간'):(momentList?.trees||[]).find(t=>t.id===listFilter)?.label||'나의 순간';
  const rowOf=c=>{
   const head=momentHeadTitle(c,titleMode).main;
   const thumb=c.image?`<span class="index-row-thumb"><img src="${esc(c.image)}" alt=""${thumbFallbackAttrs(c,{candidates:c.thumbCandidates||[c.image],mode:'thumb-slot'})} referrerpolicy="no-referrer" loading="lazy" decoding="async"></span>`:'';
   if(!head&&!demo&&!c.example){
    return `<button data-next="${esc(c.key)}" data-lt-moment-row class="index-row-card">${thumb}<span class="index-row-body">${fallbackCardMarkup(c,{writable:!demo&&!c.example,variant:'row'})}${listFilter==='all'&&c.treeLabel?`<small>${esc(c.treeLabel)}</small>`:''}</span></button>`;
   }
   return `<button data-next="${esc(c.key)}" data-lt-moment-row>${thumb}<span class="index-row-body">${head?esc(head):''}<small class="lt-row-unavailable" data-lt-row-unavailable hidden>${VIDEO_UNAVAILABLE_TEXT}</small><small>${listFilter==='all'&&c.treeLabel?esc(c.treeLabel)+' · ':''}${esc(dateOf(c))} · ${esc(c.emotion)}</small></span></button>`;
  };
  dialog.innerHTML=`<button class="close" data-do="close">닫기 ×</button><div class="index-list"><h2>${esc(heading)} · ${rows.length}</h2>${filterMarkup}${rows.length?rows.map(rowOf).join(''):`<p class="index-empty">${listFilter==='all'?'아직 순간이 없어요.':'이 트리에 아직 순간이 없어요.'}</p>`}</div>`;
  dialog.querySelectorAll('[data-tree-filter]').forEach(b=>b.onclick=()=>{listFilter=b.dataset.treeFilter||'all';index();});
  dialog.showModal();}
 shadow.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.next){focus(findMoment(b.dataset.next));return;}switch(b.dataset.do){case'close':dialog.close();break;case'new':actions.requestMoment('new');break;case'trees':actions.navigate('trees');break;case'continue':focus(lastCard);break;case'index':index();break;}},{signal});
 dialog.addEventListener('close',()=>{opener?.focus();schedule()},{signal});
 // #394 1번: 상세 창에서 화살표 키와(모바일) 옆으로 밀기로도 앞·뒤 순간으로 옮겨 간다.
 dialog.addEventListener('keydown',e=>{if(!detailMoment)return;if(e.key==='ArrowLeft'){e.preventDefault();stepDetail(-1);}else if(e.key==='ArrowRight'){e.preventDefault();stepDetail(1);}},{signal});
 let detailSwipe=null;
 dialog.addEventListener('touchstart',e=>{if(!detailMoment)return;const t=e.touches[0];detailSwipe={x:t.clientX,y:t.clientY};},{passive:true,signal});
 dialog.addEventListener('touchend',e=>{if(!detailSwipe||!detailMoment)return;const t=e.changedTouches[0];const dx=t.clientX-detailSwipe.x,dy=t.clientY-detailSwipe.y;detailSwipe=null;if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.5)stepDetail(dx<0?1:-1);},{passive:true,signal});
 const disposeThumb=mountThumbFallback(shadow,{
  isReadOnly:()=>demo,
  onEditTitle:({momentId,treeId})=>{
   if(dialog.open)dialog.close();
   if(typeof window!=='undefined'&&window.parent&&window.parent!==window){
    window.parent.postMessage({type:'lt41-write',mode:'edit',treeId:treeId||'',momentId,focusTitle:true},location.origin);
   }
  }
 });
 track(disposeThumb);
 const elements=cards.map(c=>{const b=document.createElement('button');b.className=`card ${c.type} ${c.sizeClass}${c.example?' example':''}${c.source==='mine'?' mine':''}`;b.dataset.example=c.example?'1':'';b.innerHTML=`<div class="surface" data-lt-thumb-host>${c.image?`<img src="${esc(c.image)}" alt="" draggable="false" style="object-fit:${c.fitMode==='contain'?'contain':'cover'}"${thumbFallbackAttrs(c,{candidates:c.thumbCandidates||[c.image],writable:!demo&&!c.example,variant:'orbit'})}${c.youtubeThumb?' referrerpolicy="no-referrer" loading="lazy" decoding="async"':''}>`:(!demo&&!c.example&&needsFallbackCard(c,{autoLoad:false})?fallbackCardMarkup(c,{writable:!demo&&!c.example,variant:'orbit'}):`<div class="memoKicker">${esc(dateOf(c))}</div><div class="memoText">${esc(mainOf(c))}</div><div class="memoFoot">${esc(c.emotion)}</div>`)}</div>${c.youtubeThumb&&c.image?'<span class="playGlyph" aria-hidden="true">▶</span>':''}${c.first?'<div class="firstMark">FIRST</div>':''}<div class="caption"><span>${esc(mainOf(c))}${subMarkup(c)}</span></div>`;b.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&!drag)hoveredCard=b;},{signal});b.addEventListener('pointerleave',()=>{if(hoveredCard===b)hoveredCard=null;},{signal});b.onclick=e=>{if(e.target?.closest?.('[data-lt-title-edit]'))return;if(e.detail===0||moved<9){if(onOpen&&!c.example){onOpen(c);return;}focus(c)}};world.append(b);return b;});
 // #429 2/2: 카드 기본 폭·높이는 한 번만 잰다(프레임마다 offsetWidth를 읽으면 레이아웃을 강제한다 — #400 속도 유지).
 const cardSizes=elements.map(el=>({w:el.offsetWidth||180,h:el.offsetHeight||232}));
 function frame(now){raf=0;const dt=Math.min(40,now-previous||16);previous=now;if(!paused&&!dialog.open&&!drag&&!hoveredCard)phase+=.000006*dt;const w=app.clientWidth,h=app.clientHeight;
  // 밀어낼 때는 프레임 사이 각도·위상 변화를 덮는 12px 여유를 더 붙인다(실측 침범 0 유지).
  const zs=safeZone?{l:safeZone.l-12,t:safeZone.t-12,r:safeZone.r+12,b:safeZone.b+12}:null;
  cards.forEach((c,i)=>{const cfg=rings[c.ring],th=c.baseAngle+phase*cfg.speed+c.phaseOffset;let x=Math.cos(th)*cfg.rx,y=Math.sin(th)*cfg.ry+cfg.band+Math.sin(th*1.7+c.phaseOffset*3)*45,z=Math.sin(th+1.1+c.phaseOffset*4)*cfg.zAmp+cfg.zBase+c.zOffset;if(!demo&&cards.length<=8){const angle=i*Math.PI*2/cards.length+phase;x=Math.cos(angle)*Math.min(w*.34,420);y=Math.sin(angle)*Math.min(h*.3,250)+(i%2===0?80:-80);z=0;}const sc=Math.max(.18,Math.min(1.82,1050/(1050-z))),fit=Math.min(1,w/780,h/850);const placementFit=!demo&&cards.length<=8?1:fit;const el=elements[i];
   // #429 2/2: 폭별 상한을 넘는 카드는 숨긴다(가로 넘침·과밀 방지). 창이 넓어지면 다시 보인다.
   if(i>=cardCapFor(w)){el.style.display='none';return;}
   if(el.style.display==='none')el.style.display='';
   // #429 2/2: 가운데 안전 구역(제목·문구·버튼 묶음+여백)과 카드 사각형이 겹치면 겹침이 0이 되도록 가장 얇은 쪽으로 민다.
   // 카드는 소각 회전을 하므로 폭·높이에 18% 여유를 두고 사각형으로 판정한다.
   let px=(x+camera.x*(.45+sc*.3))*sc*placementFit-90,py=(y+camera.y*(.38+sc*.24))*sc*placementFit-116;
   if(safeZone){const size=cardSizes[i];
    // 카드 사각형을 정확히: rotateX·Y·Z 합성 회전 → scale → 원근(1200px) 투영까지 네 귀퉁이로 계산한다.
    // 원근은 월드 중심 원점 기준이므로 카드 중심 위치(Cx0·Cy0)도 함께 투영된다.
    const AX=(c.tiltX+Math.sin(th)*9)*Math.PI/180,AY=(c.tiltY+Math.cos(th)*18)*Math.PI/180,AZ=(c.tiltZ+Math.sin(th*.6)*7)*Math.PI/180;
    const rX=Math.cos(AX),uX=Math.sin(AX),rY=Math.cos(AY),uY=Math.sin(AY),rZ=Math.cos(AZ),uZ=Math.sin(AZ);
    const Cx0=w/2+px+size.w/2,Cy0=h/2+py+size.h/2;
    let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
    for(const corner of [[-1,-1],[1,-1],[-1,1],[1,1]]){
     const X=size.w/2*corner[0],Y=size.h/2*corner[1];
     const x1=X*rZ-Y*uZ,y1=X*uZ+Y*rZ;              // rotateZ
     const x2=x1*rY,y2=y1,z2=-x1*uY;               // rotateY
     const y3=y2*rX-z2*uX,z3=y2*uX+z2*rX;          // rotateX
     const k=1200/(1200-z3);
     const sxp=w/2+(Cx0-w/2+x2*sc)*k,syp=h/2+(Cy0-h/2+y3*sc)*k;    // 원근 원점(화면 중심) 기준으로 투영
     if(sxp<minX)minX=sxp;if(sxp>maxX)maxX=sxp;if(syp<minY)minY=syp;if(syp>maxY)maxY=syp;
    }
    if(maxX>zs.l&&minX<zs.r&&maxY>zs.t&&minY<zs.b){
     const pushL=maxX-zs.l,pushR=zs.r-minX,pushT=maxY-zs.t,pushB=zs.b-minY,m=Math.min(pushL,pushR,pushT,pushB);
     if(m===pushL)px-=pushL;else if(m===pushR)px+=pushR;else if(m===pushT)py-=pushT;else py+=pushB;
    }}
   el.style.transform=`translate3d(${px}px,${py}px,0) scale(${sc*Math.max(.58,fit)}) rotateX(${c.tiltX+Math.sin(th)*9}deg) rotateY(${c.tiltY+Math.cos(th)*18}deg) rotateZ(${c.tiltZ+Math.sin(th*.6)*7}deg)`;
   // #429 2/2: 깊이는 크기와 밝기로만 — 카드는 언제나 불투명(opacity 1, 비침 없음), blur는 쓰지 않는다.
   // 대표: "흐리게 처리한 카드는 별로, 선명한 게 좋다"(2026-11-08). 뒤쪽 카드는 밝기 0.78까지 조금 어둡게.
   const depth=(!demo&&cards.length<=8)?1:Math.max(0,Math.min(1,(z+520)/1040));
   el.style.filter=`brightness(${(0.78+0.22*depth).toFixed(3)})`;
   el.style.zIndex=Math.round(1000+z);});
  if(motionOn()){camera={x:camera.x+(cameraTarget.x-camera.x)*CAMERA_LERP,y:camera.y+(cameraTarget.y-camera.y)*CAMERA_LERP};}
  if(!paused&&!document.hidden&&!dialog.open)raf=requestAnimationFrame(frame);
 }
 function schedule(){if(!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
 app.addEventListener('pointerdown',e=>{if(e.target.closest('.center,.topbar'))return;drag={x:e.clientX,id:e.pointerId};moved=0;},{signal});
 app.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x;moved+=Math.abs(dx);phase+=dx*.0038;drag.x=e.clientX;schedule();},{signal});
 // 누르지 않아도 배경만 작게 움직인다. 문구·버튼·상단 메뉴는 .center/.topbar에 남아 고정된다.
 app.addEventListener('pointermove',e=>{if(!finePointer.matches||!motionOn())return;const box=app.getBoundingClientRect(),clamp=(v,limit)=>Math.max(-limit,Math.min(limit,v));cameraTarget={x:clamp((e.clientX-box.left-box.width/2)*CAMERA_X,CAMERA_LIMIT_X),y:clamp((e.clientY-box.top-box.height/2)*CAMERA_Y,CAMERA_LIMIT_Y)};schedule();},{signal});
 app.addEventListener('pointerleave',()=>{if(!finePointer.matches)return;cameraTarget={x:0,y:0};schedule();},{signal});
 window.addEventListener('pointerup',()=>{drag=null;schedule()},{signal});window.addEventListener('pointercancel',()=>{drag=null;moved=20},{signal});window.addEventListener('resize',schedule,{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else schedule()},{signal});
 // #81 뷰포트 높이 계약은 첫 화면만 갖는다. 동기화 안내가 흐름에 얹히는 만큼만 빼고,
 // 나머지 화면(책장·기억책·작업공간)은 본문 자연 높이 뒤에 안내가 오도록 건드리지 않는다.
 // 가리는 방식(overflow)은 쓰지 않고, 안내가 자라면 첫 화면이 그 만큼 줄어든다.
 const noticeOuter=()=>{const bar=document.getElementById("sync-bar");if(!bar)return 0;const cs=getComputedStyle(bar);return Math.round(bar.getBoundingClientRect().height+parseFloat(cs.marginTop||0)+parseFloat(cs.marginBottom||0));};
 // #429 2/2: 가운데 안전 구역 = 제목·문구·버튼 묶음(.center) 사각형 + 여백 32px. 창 크기가 바뀌면 다시 잰다.
 let safeZone=null;
 const measureSafeZone=()=>{const c=shadow.querySelector('.center');if(!c){safeZone=null;return;}const box=app.getBoundingClientRect(),r=c.getBoundingClientRect(),M=32;safeZone={l:r.left-box.left-M,t:r.top-box.top-M,r:r.right-box.left+M,b:r.bottom-box.top+M};};
 const fitNotice=()=>{host.style.height=`calc(100dvh - ${noticeOuter()}px)`;measureSafeZone();schedule();};
 const noticeResize=typeof ResizeObserver==="function"?new ResizeObserver(fitNotice):null;
 const barNow=document.getElementById("sync-bar");
 if(noticeResize&&barNow)noticeResize.observe(barNow);
 const barWatch=typeof MutationObserver==="function"?new MutationObserver(()=>{if(noticeResize){noticeResize.disconnect();const bar=document.getElementById("sync-bar");if(bar)noticeResize.observe(bar);}fitNotice();}):null;
 if(barWatch)barWatch.observe(document.body,{childList:true});
 window.addEventListener("resize",fitNotice,{signal});
 // 글꼴이 늦게 도착해 제목 묶음 크기가 바뀌면 안전 구역을 다시 잰다.
 document.fonts?.ready?.then(()=>{measureSafeZone();schedule();});
 track(()=>noticeResize?.disconnect());
 track(()=>barWatch?.disconnect());
 // #394: 트리 드롭다운의 "내 순간 전체 보기"로 열렸으면 순간 목록을 처음부터 연다(트리 골라진 상태).
 if(momentList?.initialOpen)index();
 fitNotice();
 schedule();track(()=>cancelAnimationFrame(raf));track(()=>dialog.close());
 // #213 2번: 첫 화면 도구 줄의 "보기" 메뉴가 움직임을 읽고 바꾼다. dispose는 함수 그대로 둔다.
 dispose.motion={get paused(){return paused;},set(value){setMotionPaused(value);},toggle(){setMotionPaused(!paused);return paused;}};
 return dispose;
}
