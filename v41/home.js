import {createHomeHistory} from './home-history.mjs';
import { MSG, isShellMessage } from '../public/v41/frame-messages.mjs';
// #586: 첫 화면 문서는 src/styles.css 를 읽지 않는다(vite가 styles-*.css link를 주입해 궤도 그림자의
// 스타일 재계산이 프레임당 수십 ms가 걸렸다). 그림자가 쓰는 --ui 토큰은 v41/home.html 의 style에 둔다.
import {mountOrbit,ORBIT_EXAMPLE} from '../src/views/orbit.js';
import {homeCardsPlan,readHomeCardsMode} from './home-cards.js';
import {HOME_ORBIT_LIMIT, ltDateStyle, dateStyleOf, shouldReloadForDateStyle} from './home-moments.js';
import {fetchPopularCards} from './home-popular.js';
import {createHomeActions} from './home-actions.js';
import {homePresentation} from './home-presentation.js';
import {applyHomeCenter} from './home-center.js';
import {readTheme,writeTheme,appliedTheme,applyThemeAttribute} from '../public/v41/header-state.mjs';
import {readTitleDisplay, titleDisplayOf, shouldReloadForTitleDisplay} from '../public/v41/book-usability.mjs';
import {momentListEntries, momentListTrees} from './moment-list.js';
import {youtubeIdFrom,isVerticalMoment} from '../public/v41/youtube-id.mjs';
import {isAutoTitle} from '../public/v41/auto-title.mjs';
import {fetchVideoMetadata} from '../public/v41/video-title.mjs';
import {fetchVideoStatus} from '../public/v41/video-status.mjs';
// 261116 PR 2: 카드 모드(마지막·고정·그날·무작위·트리)·숫자 줄이기 — 순수 계산 한 벌.
import {HOME_MOMENT_KEY, readHomeMoment, normalizeHomeMoment, homeMomentPick, homeDayMoment, homeMomentMenu, formatCount} from './home-card-mode.js';
const themeHost=document.getElementById('orbit');
function syncTheme(theme){applyThemeAttribute(themeHost,appliedTheme(theme,'home'));}
function applyTheme(theme){applyThemeAttribute(document.documentElement,appliedTheme(theme,'home'));syncTheme(theme);}
applyTheme(readTheme(localStorage));
const shellBody=parent.document.body;
const context=parent.LT41||{source:shellBody.dataset.recordSource,member:shellBody.dataset.member,treeCount:Number(shellBody.dataset.treeCount||0)};
const bridge=createHomeActions({getContext:()=>parent.LT41,send:message=>parent.postMessage(message,location.origin),gallery:true});
const presentation=homePresentation(context);
const loggedIn=presentation.centerState.member==='in';
const hasMoments=presentation.centerState.momentCount>0;
// 2026-11-08 카드 출처: 예시/인기/내 것만/섞어서. 저장값이 없으면 로그인=섞어서, 로그아웃=예시.
const mode=readHomeCardsMode(localStorage,{loggedIn});
const popular=mode==='popular'?await fetchPopularCards({limit:HOME_ORBIT_LIMIT}):[];
// 2026-11-10 CTO 결정(#340): 내 기록(서버·소유자)의 YouTube 순간은 #330 판정 한 벌(autoLoadMedia)로
// 썸네일 카드를 처음부터 만든다. 판정 입력은 media-preview의 currentContext(셸 기록 상태)와 같은 값이다.
const mediaState=globalThis.LTMedia?.currentContext?.()||{source:'',owned:false};
const youtube={describe:url=>globalThis.LTMedia?.describe?.(url)??null,auto:globalThis.LTMedia?.autoLoadMedia?.(mediaState.source,mediaState.owned)===true || (context.source==='server' && loggedIn && shellBody.dataset.member==='in')};
const cardsPlan=homeCardsPlan({mode,loggedIn,context,popular,youtube});
// 첫 화면이 셸의 기록을 다 받기 전에 그려지면 내 사진·영상 순간이 아직 없어 '예시만' 궤도로 시작한다(운영 11-24).
// #1109 뒤로는 셸이 프레임을 다시 띄우지 않으므로, 기록이 도착했을 때 궤도 카드 구성이 달라지면 첫 화면만 다시 그린다.
const cardsPlanKey=plan=>plan.kind+':'+plan.cards.map(c=>c?.id||c?.key||'').join(',');
const initialCardsPlanKey=cardsPlanKey(cardsPlan);
const cardTrees=cardsPlan.cards.length?[{id:'home-cards',title:'첫 화면 카드',moments:cardsPlan.cards}]:[];
// #394: 순간 목록은 모든 트리의 순간을 최근 순으로 보는 곳. 트리 드롭다운의 "내 순간 전체 보기"로
// 열릴 때는 셸이 남긴 요청(LT41_MOMENTS_OPEN)의 트리가 골라진 상태로 시작한다.
const momentsRequest=parent.LT41_MOMENTS_OPEN??null;try{console.log('[home] momentsRequest',JSON.stringify(momentsRequest||null));}catch{}
// 261116 PR 2: 카드 모드 값 — 계정 설정(LT41.prefs.homeMoment)을 먼저 보고 기기 미러, 없으면 기본(마지막).
let homeMomentValue=readHomeMoment({prefs:parent.LT41,storage:localStorage});
const homeMomentDay=loggedIn?homeDayMoment(context.trees):null;
const momentList=loggedIn?{
 trees:momentListTrees(context.trees),
 entries:momentListEntries({trees:context.trees,youtube}),
 initialTreeId:momentsRequest?.treeId||'all',
 initialOpen:!!momentsRequest,
 initialPicking:momentsRequest?.picking===true,
 initialNotice:momentsRequest?.notice||null
}:null;
const homeMomentChoice=homeMomentPick(momentList?.entries,homeMomentValue,{day:homeMomentDay,trees:momentList?.trees||[]});
if(momentList){momentList.recent=homeMomentChoice.moment;momentList.recentHeader=homeMomentChoice.header;}
const setHomePortrait=moment=>{const vertical=!!(moment&&isVerticalMoment(moment));document.getElementById('orbit')?.toggleAttribute('data-lt-home-portrait',vertical);};
setHomePortrait(homeMomentChoice.moment);
// 이 문서가 그려질 때 쓴 날짜 표기. 셸이 같은 값을 다시 보내면 새로고침하지 않는다(아래 메시지 처리).
const renderedDateStyle=dateStyleOf(ltDateStyle());
// #481: 이 문서가 그릴 때 쓴 제목 보기. 받은 값이 이것과 다를 때만 다시 띄운다.
const renderedTitleDisplay=titleDisplayOf(readTitleDisplay(parent.LT41));
 const homeHistory=createHomeHistory(document.getElementById('orbit'));
 window.LTHomeHistory=homeHistory;
 const orbit=mountOrbit(document.getElementById('orbit'),{
 trees:cardTrees,examples:cardsPlan.examples?ORBIT_EXAMPLE.moments.slice(0,cardsPlan.examples):[],
 // 내 것만 0장은 예시로 대체하지 않고 빈 궤도와 첫 순간 안내를 남긴다.
 empty:cardsPlan.kind==='mine-empty',
 // #780: 큰 제목·부제목은 카드(mix-empty)가 비었는지보다 로그인 여부를 먼저 본다. 카드는 그대로 예시다.
 loggedIn,
 momentList,
 prefs:parent.LT41?.prefs||null,
 titleDisplay:readTitleDisplay(parent.LT41),
 dateStyle:renderedDateStyle,
 // 261116 PR 2: 순간 창의 '첫 화면에 걸기' — 계정 설정에 고정하고 모드를 '고정한 순간'으로 바꾼다.
 homePin:{
  pinned:c=>homeMomentValue.mode==='pin'&&homeMomentValue.momentId===c.id&&homeMomentValue.treeId===c.treeId,
  toggle:c=>{setHomeMoment(isPinnedMoment(c)?{mode:'last'}:{mode:'pin',momentId:c.id,treeId:c.treeId});return isPinnedMoment(c);}
 },
 onOpen:card=>{if(card.source==='public'){parent.location.hash=`#share/${card.shareId}/${card.view||'book'}`;return;}bridge.actions.openMine(card.treeId,card.id);},
 storage:{getItem:()=>null,setItem:()=>{}},context:{...presentation.context,readOnly:cardsPlan.kind==='example'},
 authHtml:`<button class="menuBtn auth-entry" data-home-account>${presentation.accountLabel}</button>`,actions:bridge.actions
});
// #394: 순간 목록 열기 요청을 받았다고 셸에 알린다 — 셸은 요청 플래그를 치워 다음 화면 이동에 되풀이하지 않게 한다.
if(momentsRequest){try{parent.postMessage({type:MSG.momentsOpened},location.origin)}catch{}}
const shadow=document.getElementById('orbit').shadowRoot;
const viewerStyle=document.createElement('style');
viewerStyle.textContent=`#mediaViewerHome .mediaVisual iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}#mediaViewerHome .mediaActions button,#mediaViewerHome .mediaActions a{display:inline-flex;align-items:center;justify-content:center;font-size:13px;min-height:44px;padding:8px 14px}#mediaViewerHome .mediaWhy[hidden]{display:none}#mediaViewerHome .mediaVisual [hidden]{display:none}#mediaViewerHome .mediaVisual .videoPlay{z-index:3}#mediaViewerHome .mediaVisual .mediaClose{z-index:4}`;
shadow.append(viewerStyle);
const viewer=document.createElement('div');viewer.className='mediaViewer';viewer.id='mediaViewerHome';viewer.setAttribute('aria-hidden','true');
viewer.innerHTML=`<div class="mediaShell" role="dialog" aria-modal="true" aria-labelledby="mediaTitleHome"><div class="mediaVisual" id="mediaVisualHome"><button class="mediaClose" id="mediaCloseHome" aria-label="미디어 닫기">×</button><div class="videoBadge" id="mediaTypeBadgeHome">사진</div><img id="mediaImageHome" alt="" src="" hidden><button class="videoPlay" id="mediaPlayHome" aria-label="미디어 미리보기 재생">▶</button><div class="mediaMemo" id="mediaMemoHome" hidden><div class="memoLabel">순간 기록</div><div class="memoMain" id="mediaMemoBodyHome"></div><div class="memoDate" id="mediaMemoDateHome"></div></div></div><div class="mediaInfo"><div class="mediaKicker" id="mediaKickerHome">순간</div><h3 id="mediaTitleHome"></h3><div class="mediaMeta" id="mediaMetaHome"></div><div class="mediaWhy" hidden><b>이어지는 이야기</b><p id="mediaWhyHome"></p></div><div class="mediaActions"><button class="primary" id="mediaBookHome">책에서 이어 보기</button><a id="mediaExternalHome" href="#" target="_blank" rel="noopener" hidden>원본 보기 ↗</a></div></div></div>`;
shadow.append(viewer);
const vEl=id=>shadow.querySelector('#'+id);
shadow.querySelector('.recent-card')?.setAttribute('tabindex','0');
let viewerOpener=null;
let viewerSequence=0;
let viewerSignal=new AbortController();
const mediaKind=(videoId,moment)=>videoId?'동영상':moment.image?'사진':'기록';
const fallbackVideoTitle='함께 간직한 영상';
function closeHomeViewer(){
 if(!viewer.classList.contains('open'))return;
 viewerSequence++;viewerSignal.abort();viewer.querySelector('iframe')?.remove();
 viewer.classList.remove('open');viewer.setAttribute('aria-hidden','true');
 homeHistory.dismiss('viewer');
 try{parent.postMessage({type:MSG.viewer,open:false},location.origin)}catch{}
 vEl('mediaImageHome').hidden=true;vEl('mediaMemoHome').hidden=true;
 viewerOpener?.focus?.();viewerOpener=null;
}
function openHomeViewer(moment,opener=null){
 if(!moment||viewer.classList.contains('open'))return;
 const orbitDialog=shadow.querySelector('dialog');if(orbitDialog?.open)orbitDialog.close();
 viewerOpener=opener||shadow.querySelector('.recent-card')||document.activeElement;
 const videoId=youtubeIdFrom(moment.url||'');
 const sequence=++viewerSequence;viewerSignal.abort();viewerSignal=new AbortController();
 const savedTitle=typeof moment.mediaMetadata?.title==='string'?moment.mediaMetadata.title.trim():'';
 const namedTitle=!isAutoTitle(moment.title)&&typeof moment.title==='string'?moment.title.trim():'';
 vEl('mediaTitleHome').textContent=namedTitle||savedTitle||(videoId?fallbackVideoTitle:'간직한 순간');
 if(videoId&&!savedTitle&&!namedTitle){fetchVideoMetadata(videoId).then(meta=>{if(sequence===viewerSequence&&viewer.classList.contains('open')&&meta?.title)vEl('mediaTitleHome').textContent=meta.title;}).catch(()=>{});}
 vEl('mediaMetaHome').textContent=[moment.date||'',moment.emotion||''].filter(Boolean).join(' · ');
 const why=vEl('mediaWhyHome'),whyRow=why.closest('.mediaWhy');
 why.textContent=moment.whyNext||'';whyRow.hidden=!why.textContent;
 vEl('mediaKickerHome').textContent=`순간 · ${mediaKind(videoId,moment)}`;
 vEl('mediaTypeBadgeHome').textContent=mediaKind(videoId,moment);
 const img=vEl('mediaImageHome'),memo=vEl('mediaMemoHome');
 img.hidden=!moment.image;memo.hidden=!!videoId||!!moment.image;
 if(moment.image)img.src=moment.image;
 if(!videoId&&!moment.image){vEl('mediaMemoBodyHome').textContent=moment.note||moment.title||'';vEl('mediaMemoDateHome').textContent=[moment.date||'',moment.emotion||''].filter(Boolean).join(' · ');}
 const play=vEl('mediaPlayHome');play.hidden=true;play.onclick=null;
 const book=vEl('mediaBookHome'),external=vEl('mediaExternalHome');
 book.onclick=()=>{closeHomeViewer();bridge.actions.openBook(moment.treeId,moment.id);};
 external.hidden=!moment.url;if(moment.url)external.href=moment.url;
 const visual=vEl('mediaVisualHome');
 visual.querySelector('iframe')?.remove();
 if(videoId){
  const showExternalOnly=()=>{if(sequence!==viewerSequence)return;visual.querySelector('iframe')?.remove();img.hidden=!moment.image;play.hidden=true;external.hidden=false;external.textContent='YouTube에서 보기';};
  const startEmbed=()=>{if(sequence!==viewerSequence||!viewer.classList.contains('open'))return;visual.querySelector('iframe')?.remove();
   const frame=document.createElement('iframe');frame.src=`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
   frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.title=vEl('mediaTitleHome').textContent;
   img.hidden=true;play.hidden=true;visual.append(frame);};
  play.onclick=startEmbed;
  fetchVideoStatus(videoId).then(status=>{if(sequence!==viewerSequence||!viewer.classList.contains('open'))return;
   if(status==='noembed'||status==='private'||status==='gone'){showExternalOnly();return;}
   play.hidden=false;img.hidden=!moment.image;
  }).catch(()=>{if(sequence===viewerSequence)play.hidden=false;});
  addEventListener('message',event=>{if(sequence!==viewerSequence||!['https://www.youtube.com','https://www.youtube-nocookie.com'].includes(event.origin))return;
   let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch{return;}
   if(data?.event==='onError'&&[101,150].includes(Number(data.info)))showExternalOnly();
  },{signal:viewerSignal.signal});
 }
 viewer.classList.add('open');viewer.setAttribute('aria-hidden','false');
 homeHistory.open('viewer',closeHomeViewer);
 try{parent.postMessage({type:MSG.viewer,open:true},location.origin)}catch{}
 vEl('mediaCloseHome').focus();
}
vEl('mediaCloseHome').onclick=closeHomeViewer;
viewer.addEventListener('click',event=>{if(event.target===viewer)closeHomeViewer();});
addEventListener('keydown',event=>{if(event.key==='Escape')closeHomeViewer();});
shadow.addEventListener('click',event=>{
 if(!event.target.closest?.('.recent-card'))return;
 if(event.target.closest?.('[data-recent-head],[data-recent-change],[data-recent-play]'))return;
 event.stopPropagation();event.preventDefault();
 openHomeViewer(homeMomentChoice?.moment);
},true);
shadow.addEventListener('click',event=>{
 const floating=event.target.closest?.('.card');
 if(!floating||event.target.closest?.('[data-lt-title-edit],a[href]'))return;
 const label=floating.querySelector('.caption span')?.textContent||'';
 const pool=[...(momentList?.entries||[]),...(ORBIT_EXAMPLE?.moments||[])];
 const moment=pool.find(entry=>entry.id===floating.dataset.id||(entry.title&&label.includes(entry.title)));
 if(!moment)return;
 event.stopPropagation();event.preventDefault();
 openHomeViewer(moment,floating.querySelector('.surface')||floating);
},true);
// 261116 PR 2: 오른쪽 위 '순간 목록' 단추는 없앤다 — 목록 입구는 가운데 세트 첫 단추로 옮겼다.
shadow.querySelector('.top-actions > .menuBtn[data-do="index"]')?.remove();
// #380(2026-11-11): 가운데 세 버튼 — 자리·개수 그대로, 남은 폭을 똑같이 나눠 세 폭 동일(가장 긴 글자 기준 고정), 로그인 후 상태 한 줄.
const centerStyle=document.createElement('style');
// 버튼 폭(대표 2026-11-13): 세 개일 때의 폭(약 176px)을 넘지 않게 묶는다 — 두 개면 265px씩 늘어나 둔해 보였다.
// 휴대폰: 줄을 꽉 채우지 않는다. 두 개는 나란히(사이 10px), 세 개는 세로로 쌓되 폭 240px까지만 — 양옆과 버튼 사이에 여백을 둔다.
centerStyle.textContent='.center .actions{gap:10px}.center .actions .subtleBtn{flex:1 1 0%;max-width:176px;min-width:0;overflow-wrap:anywhere;text-align:center;line-height:1.15}@media (max-width:480px){.center .actions{gap:10px}.center .actions .subtleBtn{max-width:150px}.center .actions[data-count="3"]:not([data-inline]){flex-direction:column;align-items:center}.center .actions[data-count="3"]:not([data-inline]) .subtleBtn{flex:0 0 auto;width:100%;max-width:240px}}';
shadow.append(centerStyle);
// 2026-11-07 테마 A/B: 첫 화면 오른쪽 위 도구 줄의 버튼 하나로 밤/정원을 바꾼다. 저장 키는 셸과 같다(lt41.theme).
// 정원 색은 public/v41/identity.css의 정원 블록에만 있고, 그 파일을 그림자 루트에도 넣어 :host 규칙을 쓴다.
// 문서에서 이미 읽은 같은 출처의 스타일을 그림자 영역에도 첫 그림 전에 적용한다.
// 글꼴 가져오기는 문서에서 처리했으므로 다시 요청하지 않는다.
const identitySheet=document.querySelector('link[href="/v41/identity.css"]')?.sheet;
if(identitySheet){
 const themeStyle=document.createElement('style');
 themeStyle.textContent=Array.from(identitySheet.cssRules).filter(rule=>rule.type!==CSSRule.IMPORT_RULE).map(rule=>rule.cssText).join('\n');
 shadow.append(themeStyle);
}else{
 const themeStyle=document.createElement('link');themeStyle.rel='stylesheet';themeStyle.href='/v41/identity.css';shadow.append(themeStyle);
}
// 셸(계정 메뉴)이 이 문서의 html에 속성을 바꾸면 그림자 루트의 호스트와 버튼 글자를 맞춘다.
new MutationObserver(()=>syncTheme(readTheme(localStorage))).observe(document.documentElement,{attributes:true,attributeFilter:['data-lt-theme']});
// 2026-11-05: 공통 헤더가 워드마크·둘러보기·로그인을 맡으므로 첫 화면 안의 것은 숨기고, 고유 버튼(움직임 멈춤·순간 목록)은 다른 화면의 도구 줄과 같은 자리(오른쪽 위)에 둔다.
const identity=document.createElement('style');
identity.textContent=`:host{--ui:'Pretendard Variable',Pretendard,system-ui,sans-serif}.app{font-family:var(--ui)}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:13px}.menuBtn{font-size:14px}.topbar .brand{display:none}.topbar{justify-content:flex-end;padding:12px 28px}.top-actions>.home-community,.top-actions>[data-home-account]{display:none}`;
shadow.append(identity);
// 2026-11-08 #213 2번: 도구 줄 버튼은 둘(보기·순간 목록)이고, 시각 높이 36·누르는 영역 44로 맞춘다.
const cardUI=document.createElement('style');
cardUI.textContent=`.top-actions>.menuBtn{position:relative;min-height:44px;display:inline-flex;align-items:center;padding-block:0}.top-actions>.menuBtn:after{content:'';position:absolute;inset:0;border-radius:999px}[data-home-account],.home-community{display:none}`;
shadow.append(cardUI);
// #380(2026-11-11): 로그인 전 [＋ 첫 순간 추가·둘러보기·어떻게 쓰나요] / 로그인 후 [＋ 순간 추가·둘러보기](#426: 세 번째 자리는 숨김, 최근 순간 카드가 "이어 보기"를 대신).
// 로그인 전이면 지금 두 줄 그대로, 로그인 후면 상태에 따라 큰 제목 아래 둘째 줄도 함께 갱신한다(아래 상태 블록).
const centerButtons=[...shadow.querySelectorAll('.center .actions button')];
const centerPlan=applyHomeCenter(centerButtons,presentation.centerState);
// #1246: the public-tree entrance has its own outline compass, not a filled action.
const exploreButton=centerButtons.find(button=>button.dataset.do==='community');
if(exploreButton){
 const ns='http://www.w3.org/2000/svg';
 const compass=document.createElementNS(ns,'svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24','aria-hidden':'true',focusable:'false',class:'home-compass',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round'}))compass.setAttribute(key,value);
 const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx','12');circle.setAttribute('cy','12');circle.setAttribute('r','9');
 const needle=document.createElementNS(ns,'path');needle.setAttribute('d','M16 8l-2.5 5.5L8 16l2.5-5.5L16 8Z');
 compass.append(circle,needle);exploreButton.prepend(compass);
}
const byDo=name=>centerButtons.find(b=>b.dataset.do===name);
// 보이는 버튼 수를 표시한다(위 버튼 폭 규칙이 쓴다). 로그인 세트는 390에서도 한 줄(data-inline — 옛 세로 쌓기는 로그아웃만).
const actionsRow=shadow.querySelector('.center .actions');
actionsRow?.setAttribute('data-count',String(centerButtons.filter(b=>!b.hidden&&b.style.display!=='none').length));
if(hasMoments)actionsRow?.setAttribute('data-inline','');
// '순간 목록' → 궤도의 목록 창(전체). 둘러보기 → 기존 community. '어떻게 쓰나요'(#635)는 같은 첫 화면의 안내 패널(orbit-dialog·showModal 틀)을 연다.
const momentsButton=byDo('moments');if(momentsButton)momentsButton.onclick=()=>orbit?.index?.('all');
const communityButton=byDo('community');if(communityButton)communityButton.onclick=()=>bridge.actions.community();
const guideButton=byDo('guide');if(guideButton)guideButton.onclick=openGuide;
// 2026-11-14 대표 결정: 로그인한 첫 화면 셋째 단추 '내 트리'는 내 트리 목록(책장)으로 간다.
const treesButton=byDo('trees');if(treesButton)treesButton.onclick=()=>bridge.actions.navigate('trees');
// #635: '어떻게 쓰나요' 안내 패널 — 기존 패널 틀(orbit-dialog·showModal·닫기 단추·포커스 되돌리기)을 그대로 쓴다.
// 새 화면·새 경로는 만들지 않는다. 궤도는 창이 열려 있는 동안 멈춘다(orbit.js의 dialog 규칙과 같다).
let motionPaused=false;
const guideDialog=document.createElement('dialog');
guideDialog.className='orbit-dialog';
/* #635 PR B: guideStyle의 모든 규칙은 #guidePanel로 적힌다 — id가 없으면 패딩·테마 규칙이 통째로 무시됐다(내용이 테두리에 붙은 원인). */
guideDialog.id='guidePanel';
guideDialog.setAttribute('aria-label','어떻게 쓰나요');
/* 단추는 오른쪽 아래로 모으고(justify-content:flex-end), 주 단추('첫 순간 추가')를 오른쪽 끝에 둔다 — 탭 순서도 보이는 순서와 같게 DOM 순서를 바꾼다. */
guideDialog.innerHTML=`<button class="close" data-do="guide-close" aria-label="안내 닫기">닫기 ×</button><div class="guide-body"><h2 tabindex="-1">어떻게 쓰나요</h2><ol class="guide-list"><li>좋아하는 영상 링크를 붙여 넣으면 순간이 바로 담겨요</li><li>순간들은 트리로 묶여요(그룹·주제별로 여러 개)</li><li>책·보드·지도로 내 기록을 다시 봐요</li><li>순간이 3개 이상이면 둘러보기에서 다른 팬도 볼 수 있어요(이름·아이디는 보이지 않아요)</li></ol><div class="detail-buttons"><button data-do="guide-community">둘러보기</button><button class="primary-cta" data-do="guide-new">첫 순간 추가</button></div><div class="guide-policy"><a href="https://auth.padiem.net/privacy#lovetree" target="_blank" rel="noopener">개인정보 처리방침</a><a href="https://auth.padiem.net/terms" target="_blank" rel="noopener">이용약관</a></div></div></div>`;
shadow.append(guideDialog);
const guideStyle=document.createElement('style');
guideStyle.textContent=`#guidePanel{word-break:keep-all}#guidePanel .guide-body{padding:42px;max-width:620px;margin:0 auto}#guidePanel h2{margin:0 0 18px;font-size:26px;outline:none;width:fit-content;max-width:100%}/* #662: 제목 상자가 창 폭을 통째로 차지해 닫기 단추 영역과 포개졌다 — 글자 폭만큼만. */.guide-list{margin:0;padding:0;list-style:none;counter-reset:guide;display:grid;gap:12px}.guide-list li{counter-increment:guide;display:flex;gap:12px;align-items:baseline;font-size:15px;line-height:1.7;color:#d9d2e2}.guide-list li::before{content:counter(guide);flex:0 0 auto;min-width:26px;min-height:26px;display:inline-grid;place-items:center;border:1px solid #615364;border-radius:50%;color:#e8b8c9;font-size:12px}#guidePanel .detail-buttons{margin-top:24px;justify-content:flex-end}/* 처리방침·약관 링크(2026-11-16): 단추 줄 아래 작은 글씨, 새 창. 누름 영역 44px. */#guidePanel .guide-policy{margin-top:18px;display:flex;gap:16px;justify-content:center}#guidePanel .guide-policy a{min-height:44px;display:inline-flex;align-items:center;font-size:14px;letter-spacing:.04em;color:#a99fb5;text-decoration:underline;text-underline-offset:3px}:host([data-lt-theme=garden]) #guidePanel .guide-policy a{color:var(--lt-muted)}:host([data-lt-theme=garden]) #guidePanel{background:var(--lt-paper);color:var(--lt-ink);border-color:var(--lt-line)}:host([data-lt-theme=garden]) #guidePanel h2{color:var(--lt-ink)}:host([data-lt-theme=garden]) .guide-list li{color:var(--lt-muted)}:host([data-lt-theme=garden]) .guide-list li::before{border-color:var(--lt-gold-line);color:var(--lt-gold-ink)}:host([data-lt-theme=garden]) #guidePanel .detail-buttons button{background:var(--lt-paper);color:var(--lt-ink);border-color:var(--lt-line)}:host([data-lt-theme=garden]) #guidePanel .primary-cta{background:var(--lt-primary);color:var(--lt-primary-ink);border-color:var(--lt-primary)}:host([data-lt-theme=garden]) #guidePanel .close{background:var(--lt-paper);color:var(--lt-ink);border-color:var(--lt-line)}`;
shadow.append(guideStyle);
let guideOpener=null;
function openGuide(){
 guideOpener=shadow.activeElement;
 guideDialog.showModal();
 orbit?.motion?.set?.(true);
 /* #635 PR B: 처음 포커스는 닫기 단추가 아니라 패널 제목으로 둔다 — 닫기에 프로그램 포커스가 가면
    마우스·터치로 열어도 두꺼운 포커스 테두리가 바로 보였다. 제목(tabindex=-1)은 테두리가 없고,
    단추들의 포커스 테두리는 이미 :focus-visible 규칙이라 키보드로 탐색할 때만 보인다. */
 guideDialog.querySelector('h2')?.focus();
}
guideDialog.addEventListener('close',()=>{guideOpener?.focus?.();orbit?.motion?.set?.(motionPaused);});
guideDialog.addEventListener('click',e=>{
 if(e.target===guideDialog){guideDialog.close();return;}/* 바깥 누르면 닫는다(공통 틀) */
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.do==='guide-close')guideDialog.close();
 else if(b.dataset.do==='guide-new'){guideDialog.close();bridge.actions.start();}/* 로그아웃 첫 단추와 같은 동작 */
 else if(b.dataset.do==='guide-community'){guideDialog.close();bridge.actions.community();}
});
// #481 L10: lt41-login-focus는 보내는 쪽이 없는 고아 수신기였다(셸에 postMessage 없음) —
// 그 수신기와, 그 수신기만 쓰던 loginFocusButton 추적을 함께 지운다.
// 로그아웃 첫 버튼은 로그인/가입으로.
{
  const first=centerButtons[0];
  if(!hasMoments)first.onclick=loggedIn?()=>bridge.actions.requestMoment('add'):bridge.actions.start;
}
// 예시 모드는 궤도의 기존 안내를 그대로 두고, 나머지는 계획의 문구를 쓴다(빈 문자열이면 숨김).
// #1204: the bottom guidance row was removed; keep home actions initialization independent of it.
// 261116 PR 2(대표 확정): 큰 제목 아래 둘째 줄 안내(옛 정리 알림·첫 순간 안내)는 치웠다 —
// 그 자리(글귀 바로 아래)에 '+ 순간 추가' 단추(밝은 채움)가 온다. 로그인 상태만 — 로그아웃은 지금처럼 둔다.
if(hasMoments){
 const quote=shadow.querySelector('.center > p:not(.center-note)');
 const addTop=document.createElement('button');
 addTop.type='button';addTop.className='subtleBtn primary-cta home-add-top';
 addTop.textContent='＋ 순간 추가';
 addTop.onclick=()=>bridge.actions.requestMoment('add');
 quote?.after(addTop);
}
// ── 261116 PR 2: 카드 모드 저장·머리글 메뉴·가운데 카드 아래 정보 줄 ─────────────────────
const isPinnedMoment=c=>!!c&&homeMomentValue.mode==='pin'&&homeMomentValue.momentId===c.id&&homeMomentValue.treeId===c.treeId;
const setHomeMoment=next=>{
 homeMomentValue=normalizeHomeMoment(next);
 try{localStorage.setItem(HOME_MOMENT_KEY,JSON.stringify(homeMomentValue))}catch{}
 // 계정 설정(이미 있는 저장 길)에 저장한다 — 셸이 setPrefs로 계정 기록에 반영한다.
 try{parent.postMessage({type:MSG.homeMoment,value:homeMomentValue},location.origin)}catch{}
 const picked=homeMomentPick(momentList?.entries,homeMomentValue,{day:homeMomentDay,trees:momentList?.trees||[]});
 orbit?.recent?.set(picked.moment,picked.header);
 setHomePortrait(picked.moment);
 closeRecentMenu();
};
 let recentMenu=null,recentMenuOpener=null;
 function closeRecentMenu(){
  const menu=recentMenu,opener=recentMenuOpener;
  recentMenu=null;recentMenuOpener=null;
  if(menu){try{if(menu.open)menu.close();}catch{} menu.remove();}
  if(opener)opener.setAttribute('aria-expanded','false');
 }
 function openRecentMenu(button){
  closeRecentMenu();
  recentMenuOpener=button;button.setAttribute('aria-expanded','true');
  recentMenu=document.createElement('dialog');recentMenu.className='recent-menu';recentMenu.setAttribute('aria-label','첫 화면 카드 고르기');
  const list=document.createElement('div');list.className='recent-menu-list';list.setAttribute('role','menu');
  for(const item of homeMomentMenu(homeMomentValue,{trees:momentList?.trees||[]})){
   const head=document.createElement('button');head.type='button';head.setAttribute('role','menuitemradio');
   head.setAttribute('aria-checked',String(homeMomentValue.mode===item.mode));head.textContent=item.label;
   if(item.mode!=='tree')head.dataset.mode=item.mode;
   if(item.disabled)head.disabled=true;
   head.onclick=()=>{closeRecentMenu();if(item.disabled||item.mode==='tree')return;setHomeMoment({mode:item.mode,momentId:item.mode==='pin'?homeMomentValue.momentId:'',treeId:item.mode==='pin'?homeMomentValue.treeId:''});};
   list.append(head);
   if(item.mode==='tree'){for(const tree of item.trees){
    const tb=document.createElement('button');tb.type='button';tb.className='recent-menu-sub';tb.setAttribute('role','menuitemradio');
    tb.setAttribute('aria-checked',String(homeMomentValue.mode==='tree'&&homeMomentValue.treeId===tree.id));tb.textContent=tree.label;
    tb.onclick=()=>{closeRecentMenu();setHomeMoment({mode:'tree',treeId:tree.id});};
    list.append(tb);
   }}
  }
  recentMenu.append(list);
  recentMenu.addEventListener('click',event=>{if(event.target===recentMenu)closeRecentMenu();});
  recentMenu.addEventListener('cancel',event=>{event.preventDefault();const opener=recentMenuOpener;closeRecentMenu();opener?.focus();});
  shadow.append(recentMenu);
  recentMenu.showModal();
  const card=shadow.querySelector('.recent-card'),rect=card?.getBoundingClientRect(),menu=recentMenu.getBoundingClientRect();
  if(rect&&menu){
   const width=Math.ceil(menu.width),height=Math.ceil(menu.height);
   let left=Math.round(rect.left+rect.width/2-width/2),top=Math.round(rect.top-height-6);
   if(top<8)top=Math.round(rect.bottom+6);
   if(top+height>document.documentElement.clientHeight-8)top=Math.max(8,Math.round(document.documentElement.clientHeight-height-8));
   if(top<8)top=8;
   left=Math.max(8,Math.min(left,document.documentElement.clientWidth-width-8));
   recentMenu.style.left=`${left}px`;recentMenu.style.top=`${top}px`;
  }
  recentMenu.querySelector('button:not([disabled])')?.focus();
 }
  shadow.addEventListener('click',event=>{
   const head=event.target.closest?.('[data-recent-head],[data-recent-change]');
   if(head){if(recentMenu)closeRecentMenu();else openRecentMenu(head);return;}
  });
// #942·#1087: 숫자는 단추 바로 아래 두 줄로 둔다. 공개 집계는 기존 API를 재사용한다.
const countLines=new Map();
for(const button of centerButtons){
 if(button.hidden)continue;
 const group=document.createElement('div');group.className='home-action-group';
 button.before(group);group.append(button);
 const line=document.createElement('div');line.className='home-count';line.hidden=true;line.setAttribute('data-lt-keep-clear','');
 // #1246: reserve both public-stat rows before the request completes, including on failure.
 if(button.dataset.do==='community')line.setAttribute('data-reserve','');
 group.append(line);countLines.set(button.dataset.do,line);
}
function countItem(name,count,label,action){
 const node=document.createElement(action?'button':'span');node.className='home-count-item';
 const nameCell=document.createElement('span');nameCell.className='home-count-name';nameCell.textContent=name;
 const valueCell=document.createElement('span');valueCell.className='home-count-value';valueCell.textContent=formatCount(count);
 node.append(nameCell,' ',valueCell);
 if(action){node.type='button';node.setAttribute('aria-label',label);node.onclick=action;}
 return node;
}
function showCount(key,items){
 const line=countLines.get(key);if(!line)return;
 line.replaceChildren();
 for(let i=0;i<2;i+=1){
  const row=document.createElement('span');row.className='home-count-line';
  const item=items[i];
  if(item)row.append(countItem(item.name,item.count,item.label,item.action));
  line.append(row);
 }
 line.hidden=false;return line;
}
// #1109: 셸이 같은 화면에서 상태만 바꿨을 때 프레임을 다시 띄우지 않고 숫자·최근 순간만 제자리에서 고친다.
function refreshCountsFromParent(){
 const fresh=parent.LT41?.trees;
 if(!Array.isArray(fresh))return false;
 context.trees=fresh;
 if(mode!=='example'&&mode!=='popular'){
  const media=globalThis.LTMedia?.currentContext?.();
  const nextYoutube={describe:youtube.describe,auto:globalThis.LTMedia?.autoLoadMedia?.(media?.source,media?.owned)===true||youtube.auto};
  const next=homeCardsPlan({mode,loggedIn,context,popular,youtube:nextYoutube});
  const anyDialogOpen=[...document.querySelectorAll('dialog')].some(d=>d.open)||[...(document.querySelector('#orbit')?.shadowRoot?.querySelectorAll('dialog')||[])].some(d=>d.open);
  if(cardsPlanKey(next)!==initialCardsPlanKey&&!anyDialogOpen){location.reload();return true;}
 }
 const inbox=fresh.find(t=>t?.inbox===true),inboxCount=inbox?.moments?.length||0;
 const total=fresh.reduce((n,t)=>n+(t?.moments?.length||0),0);
 if(!total)return true;
 showCount('moments',[
  {name:`순간`,count:total,label:`내 순간 ${total}개 목록 열기`,action:openMoments},
  inboxCount?{name:`정리 전`,count:inboxCount,label:`정리 전 순간 ${inboxCount}개 정리하기`,action:()=>bridge.actions.cleanup()}:null
 ]);
 const publicRow=countLines.get('trees')?.lastElementChild;
 const treeCount=showCount('trees',[{name:`트리`,count:fresh.length,label:`트리 ${fresh.length}개 서재 열기`,action:openTrees},null]);
 if(publicRow&&treeCount)treeCount.lastElementChild.replaceWith(publicRow);
  // 처음 그릴 때와 같은 길로 다시 고른다 — 머리글까지 넘겨야 같은 마크업·글자 크기로 그려진다.
  const media=globalThis.LTMedia?.currentContext?.();
  youtube.auto=globalThis.LTMedia?.autoLoadMedia?.(media?.source,media?.owned)===true;
  const trees=momentListTrees(fresh),entries=momentListEntries({trees:fresh,youtube});
  const picked=homeMomentPick(entries,homeMomentValue,{day:loggedIn?homeDayMoment(fresh):null,trees});
  if(momentList){momentList.trees=trees;momentList.entries=entries;momentList.recent=picked.moment;momentList.recentHeader=picked.header;}
  if(picked.moment)orbit?.recent?.set(picked.moment,picked.header);
  return true;
}
const inboxTree=(Array.isArray(context.trees)?context.trees:[]).find(t=>t?.inbox===true);
const inboxCount=inboxTree?.moments?.length||0;
const totalCount=momentList?.entries?.length||0;
const openMoments=()=>orbit?.index?.('all');
const openCommunity=()=>bridge.actions.community();
const openTrees=()=>bridge.actions.navigate('trees');
if(hasMoments){
 showCount('moments',[
  {name:`순간`,count:totalCount,label:`내 순간 ${totalCount}개 목록 열기`,action:openMoments},
  inboxCount?{name:`정리 전`,count:inboxCount,label:`정리 전 순간 ${inboxCount}개 정리하기`,action:()=>bridge.actions.cleanup()}:null
 ]);
 showCount('trees',[
  {name:`트리`,count:momentList?.trees?.length||0,label:`트리 ${momentList?.trees?.length||0}개 서재 열기`,action:openTrees},
  null
 ]);
 (async()=>{try{
  const answer=await fetch('/api/shares',{headers:{accept:'application/json'}});
  if(!answer.ok)return;
  const body=await answer.json();
  const ids=new Set((Array.isArray(body?.shares)?body.shares:[]).filter(s=>s?.status==='active').map(s=>s.treeId).filter(Boolean));
  const n=ids.size;
  showCount('trees',[
   {name:`트리`,count:momentList?.trees?.length||0,label:`트리 ${momentList?.trees?.length||0}개 서재 열기`,action:openTrees},
   {name:`공개 트리`,count:n,label:`공개 트리 ${n}개 서재에서 보기`,action:openTrees}
  ]);
 }catch{ /* 공개 트리 수를 못 받으면 둘째 줄은 빈 자리로 둔다. */ }})();
}
(async()=>{const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),8000);try{
 const answer=await fetch('/api/community/stats',{headers:{accept:'application/json'},signal:ctrl.signal});
 if(!answer.ok)return;
 const stats=await answer.json();
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 if(!valid(stats?.trees)||(!hasMoments&&!valid(stats?.moments)))return;
 const prefix=loggedIn?'':'예시 ';
 showCount('community',hasMoments?[
  {name:`공개 트리`,count:stats.trees,label:`공개 트리 ${stats.trees}개 둘러보기`,action:openCommunity},
  {name:`공개 순간`,count:stats.moments,label:`공개 순간 ${stats.moments}개 둘러보기`,action:openCommunity}
 ]:[
  {name:`${prefix}공개 트리`,count:stats.trees,label:`공개 트리 ${stats.trees}개 둘러보기`,action:openCommunity},
  {name:`순간`,count:stats.moments,label:`공개 순간 ${stats.moments}개 둘러보기`,action:openCommunity}
 ]);
 }catch{ /* 집계를 받지 못하면 해당 줄만 숨긴다. */ }finally{clearTimeout(timer);}})();
const infoStyle=document.createElement('style');
infoStyle.textContent=`.home-add-top{margin-top:12px;font-size:15px;pointer-events:auto}@media(max-width:650px){.home-add-top{font-size:14px}}
.center .actions{gap:18px;align-items:flex-start;flex-wrap:nowrap}
.center .actions .home-action-group{flex:1 1 0%;max-width:176px;min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:5px}
.center .actions .home-action-group .subtleBtn{flex:none;width:100%;max-width:none;box-sizing:border-box;height:44px;white-space:nowrap;overflow-wrap:normal}
.home-count{display:block;font-size:12px;line-height:16px;min-height:32px;white-space:nowrap;color:var(--lt-muted)}
.home-count-line{display:block;min-height:16px;line-height:16px}
.home-count[hidden]{display:none}
.home-count[data-reserve][hidden]{display:block;visibility:hidden}
.home-count-item{display:flex;align-items:baseline;justify-content:space-between;gap:4px;width:100%;min-width:0;white-space:nowrap}
.home-count-name{color:var(--lt-muted);text-align:left}
.home-count-value{color:var(--lt-pearl);font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.home-count button{font:inherit;font-size:13px;line-height:inherit;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;text-decoration:none}
.home-count button:hover{text-decoration:underline;text-underline-offset:3px}
.home-count button:focus-visible{outline:2px solid #e8b8c9;outline-offset:2px;border-radius:4px}
@media(max-width:480px){.center .actions:not([data-inline]){flex-direction:column;align-items:center}.center .actions:not([data-inline]) .home-action-group{flex:none;width:100%;max-width:240px}.center .actions[data-inline] .home-action-group{max-width:150px}}
.recent-menu{position:fixed;z-index:4000;inset:auto;margin:0;min-width:220px;max-width:min(300px,86vw);max-height:calc(100dvh - 16px);overflow:hidden;padding:6px;border:1px solid var(--lt-line,rgba(255,255,255,.14));border-radius:14px;background:#07070c;box-shadow:0 18px 44px rgba(0,0,0,.5)}.recent-menu::backdrop{background:transparent}.recent-menu-list{display:grid;gap:1px;max-height:min(60dvh,420px);overflow-y:auto;overscroll-behavior:contain}.recent-menu button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;padding:0 12px;border:0;border-radius:8px;background:none;cursor:pointer;font:inherit;font-size:13px;color:#e6ddef;text-align:left}.recent-menu button[aria-checked="true"]{color:var(--lt-gold,#ffe6a6)}.recent-menu button[disabled]{color:var(--lt-muted,#9b98a6);cursor:default}.recent-menu button:focus-visible{outline:2px solid #e8b8c9;outline-offset:-2px}.recent-menu .recent-menu-sub{padding-left:22px;font-size:12px;color:#cfc6dd}:host([data-lt-theme=garden]) .recent-menu{background:var(--lt-paper,#f7f0e8);border-color:var(--lt-line-paper)}:host([data-lt-theme=garden]) .recent-menu button{color:var(--lt-ink)}:host([data-lt-theme=garden]) .recent-menu button[aria-checked="true"]{color:var(--lt-gold-ink)}:host([data-lt-theme=garden]) .recent-menu button[disabled],:host([data-lt-theme=garden]) .recent-menu .recent-menu-sub{color:var(--lt-muted)}`;
shadow.append(infoStyle);
const mobileFit=document.createElement('style');mobileFit.textContent='@media(max-width:768px){.topbar{gap:12px;flex-wrap:wrap;align-items:center;padding:8px 12px}.top-actions{gap:6px;flex-shrink:0;flex-wrap:wrap;margin-left:auto}.topbar .menuBtn{white-space:nowrap;padding:10px 9px;font-size:14px}.actions .subtleBtn{font-size:14px}.center .center-note{font-size:14px}.hint{font-size:14px}}';shadow.append(mobileFit);
// #380 5번: 첫 화면 오른쪽 위 "보기 ▾" 메뉴(테마·움직임·카드 출처)는 없앴다.
// 로그인 상태의 같은 항목은 설정 창(셸)의 '화면' 묶음에 있고, 셸이 아래 두 메시지로 알려 준다.
// 로그아웃에는 설정 입구가 없으므로 테마만 오른쪽 위 작은 ◐ 단추로 남긴다(저장 키 lt41.theme 그대로).
addEventListener('message',event=>{
 if(event.origin!==location.origin)return;
 const type=event.data?.type;
  if(type===MSG.motion){motionPaused=!!event.data.paused;orbit?.motion?.set?.(motionPaused);}
  // #1109: 배경 상태 반영은 다시 띄우지 않고 지금 화면의 숫자·최근 순간만 고친다.
  else if(type===MSG.treesSaved&&isShellMessage(event)){refreshCountsFromParent();}
  else if(type===MSG.homeCards){location.reload();}
  else if(type===MSG.homeMomentSet){setHomeMoment(event.data.value);}

 // #481: 제목 보기도 궤도가 그릴 때 값을 박아 두므로(orbit의 titleMode) 바뀌면 다시 떠야 한다.
 // 날짜 표기와 같은 판정 — 지금 그린 값과 다르고, 기기 미러가 이미 그 값일 때만(다시 뜨면 새 값으로 그려진다).
 else if(type===MSG.titleDisplay){
  let titleMirror=null;try{titleMirror=localStorage.getItem('lt41.titleDisplay');}catch{}
  if(shouldReloadForTitleDisplay({value:event.data.value,rendered:renderedTitleDisplay,mirror:titleMirror}))location.reload();
 }
 // #441 후속: 날짜 표기도 책·보드·지도처럼 열린 채 바로 반영한다(궤도는 셸 iframe이라 다시 그려야 한다).
 // 셸은 프레임이 뜰 때마다 같은 값을 보내므로, 값이 실제로 바뀌었을 때만 다시 띄운다(shouldReloadForDateStyle).
 else if(type===MSG.dateStyle){
  let mirror=null;try{mirror=localStorage.getItem('lt41.dateStyle');}catch{}
  if(shouldReloadForDateStyle({value:event.data.value,rendered:renderedDateStyle,mirror}))location.reload();
 }
 // 2026-11-16 계정 메뉴 정리: 셸 계정 메뉴의 '어떻게 쓰나요'가 이 메시지로 같은 안내 패널을 연다.
 // 이미 열려 있을 때 showModal을 다시 부르면 InvalidStateError가 나므로 열려 있으면 무시한다.
 else if(type===MSG.openGuide){if(!guideDialog.open)openGuide();}
});
// #776 규칙: 테마는 머리줄 #theme-toggle 하나로 통일 — 첫 화면 ◐ 빠른 단추는 두지 않는다.
// 로그아웃은 내 순간이 없으므로 '순간 목록' 입구도 두지 않는다(예시 카드는 '감상 예시' 안내 그대로).
if(!loggedIn)shadow.querySelector('[data-do="index"]')?.remove();
// 2026-11-08 #213 2번: 도구 줄 버튼은 "보기"·"순간 목록" 둘만 남긴다. 공통 헤더가 이미 둘러보기·로그인을 맡으므로
// 첫 화면 안의 중복 버튼은 만들지 않고, 궤도가 넣어 둔 계정 자리도 지운다(화면 낭독기 순서에서도 사라진다).
shadow.querySelector('[data-home-account]')?.remove();
shadow.querySelectorAll('.firstMark').forEach(e=>e.textContent='첫 순간');
const dialog=shadow.querySelector('dialog');
const labels=new MutationObserver(()=>{const b=dialog.querySelector('[data-do=book]');if(b&&b.textContent!=='책 열기')b.textContent='책 열기';});
labels.observe(dialog,{childList:true,subtree:true});
addEventListener('pagehide',()=>labels.disconnect(),{once:true});
addEventListener('pagehide',()=>orbit(),{once:true});
