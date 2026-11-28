import { MSG, isShellMessage } from '../../frame-messages.mjs';
// 내 트리(책장) 동작 (#231 후속, 2026-11-09).
// 계산(표지 색·이름·정보 줄·검색·카드 배치·페이지)은 shelf-model.mjs로 옮기고 여기서는 화면만 다룬다.
// 조건·문구·id·순서 변경 0. #291(궤도)와 같이 모듈로 불러 쓴다.
import {
  COVER_PALETTE, bookMeta, buildShelf,
  escapeShelf, filterShelf, findBook, lastMomentDate as lastMomentDateOf,
  recentChapters, resolveShelfIndex, resumeCard, resumeName, shelfBook, shelfRowLayout,
  treeTitleOf, youtubeId as youtubeIdOf
} from './shelf-model.mjs';
import { shelfOrder } from '../../inbox-model.mjs';
import { titleView, titleDisplayOf, shouldReloadForTitleDisplay } from '../../book-usability.mjs';
import { coverFallbackAttrs, mountThumbFallback } from '../../thumb-fallback.mjs';
import { createReader } from './shelf-reader.js';
import { VIEWS } from './shelf-views.mjs';

{
  {
    'use strict';
      var $ = function (selector) { return document.querySelector(selector); };
      var $$ = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
      var sourceLabel = 'bookmarks_LIKE_only_2026-07-28.html';
      // #212: 표지에 보이는 이름은 한 번만 쓴다. 자동 접미사(", 나의 순간들")는 표시 단계에서만 뺀다(tree-name.mjs).
      var namer = function (value) { return (window.LTTreeName && window.LTTreeName.displayTreeTitle) ? window.LTTreeName.displayTreeTitle(value) : value; };
      var treeTitle = function (value) { return treeTitleOf(value, namer); };
      var lastMomentDate = lastMomentDateOf;
      // #212: 표지 색은 테마 변수를 넘긴다. 밤은 장미색이 아닌 값, 정원은 지금 크림색 책장 색이며
      // 실제 색값은 identity.css의 --lt-cover-N에만 있다(테마를 바꿔도 다시 그릴 필요가 없다).
      var palette = COVER_PALETTE;
      var books = buildShelf(shelfOrder(LTDEMO.library), palette, namer);
      var initialFilter='all';try{var asked=localStorage.getItem('lt41.shelfFilter');if(asked==='public'||asked==='all')initialFilter=asked;localStorage.removeItem('lt41.shelfFilter');}catch{}
      var state = { filter:initialFilter, query:'', selectedId:null, shelfIndex:0, shelfOffset:0, shelfList:[], chapterIndex:0, open:false, openProgress:0, pageTurning:false };
      var storageKey = 'lovetree-people-book-shelf-v2-1-true-page-motion';
      var drag = { active:false, mode:'', startX:0, startY:0, moved:false, startProgress:0 };
      // #1366: 계정 설정(bookDisplay와 같은 길) → 기기 미러 → 기본 회전.
      function shelfView() {
        try { var v=parent.LT41?.prefs?.shelfView; if(v==='shelf'||v==='carousel')return v; } catch {}
        try { var m=localStorage.getItem('lt41.shelfView'); if(m==='shelf'||m==='carousel')return m; } catch {}
        return 'carousel';
      }
      function paintShelfViewInline(){
        var view=shelfView();
        $$('#shelf-view-inline [data-shelf-view]').forEach(function(b){b.setAttribute('aria-checked',String(b.dataset.shelfView===view));});
      }
      // #1631: 서재 선택 단추는 셸 보기 설정과 같은 값을 표시한다.
      function shelfOpenModeValue(){
        try{var v=parent.document.documentElement.dataset.ltShelfOpenMode;if(v==='preview'||v==='direct')return v;}catch{}
        try{return localStorage.getItem('lt41.shelfOpenMode')==='direct'?'direct':'preview';}catch{return 'preview';}
      }
      function paintShelfOpenModeInline(value){
        var mode=(value==='preview'||value==='direct')?value:shelfOpenModeValue();
        $$('#shelf-open-choice [data-shelf-open-mode]').forEach(function(b){
          var checked=b.dataset.shelfOpenMode===mode;
          b.setAttribute('aria-checked',String(checked));
          b.tabIndex=checked?0:-1;
        });
      }
      // #1446: 첫 화면 '내 공개 트리'가 서재를 공개만 걸러 열 때 칸 표시도 같이 맞춘다.
      function paintShelfFilterInline(){
        $$('#shelf-filter-inline [data-filter]').forEach(function(b){b.setAttribute('aria-checked',String(b.dataset.filter===state.filter));});
      }
      // #1376 1단계: 값 읽기는 공용에 두고, 보기 모듈에는 이름과 공용 동작만 넘긴다.
      // 저장(prefs.shelfView + lt41.shelfView)과 전환 메시지는 아래 공용 경로를 그대로 쓴다.
      var view = null;
      function relayout() { if (view) view.layout(viewCtx()); }
      function viewCtx() {
        return {
          rail: function () { return $('#shelfRail'); },
          books: function () { return state.shelfList; },
          cards: function () { return $$('#shelfRail .book-card'); },
          railWidth: function () { var rail = $('#shelfRail'); return rail ? rail.clientWidth : 0; },
          center: function () { return state.shelfIndex; },
          setCenter: function (i) { state.shelfIndex = i; },
          offset: function () { return state.shelfOffset || 0; },
          setOffset: function (i) { state.shelfOffset = i; },
          save: save,
          open: function (index) { selectShelfIndex(index); },
          arrows: applyShelfArrows,
          atmosphere: setShelfAtmosphere,
          reported: reportShelfTree,
          relayout: relayout,
          state: state
        };
      }
      function ensureView() {
        var name = shelfView();
        if (view && view.name === name) return;
        if (view) view.destroy();
        view = VIEWS.create(name);
      }
      try {
        var saved = {};
        state.selectedId = null;
        state.shelfIndex = Number.isInteger(saved.shelfIndex) ? saved.shelfIndex : 0;
        state.chapterIndex = Number.isInteger(saved.chapterIndex) ? saved.chapterIndex : 0;
        state.open = false;
        state.openProgress = 0;
      } catch (error) {}
      state.shelfIndex=Math.max(0,books.findIndex(book=>book.id===parent.LT41.tree.id));
      function getBook(id) { return findBook(books, id); }
      function save() {} // Selection belongs to the shell; never persist another account's library.
      // #1446: 공개 트리 여부는 셸 상태가 아니라 서버 shares로만 안다. 실패하면 아무 책도 공개로 표시하지 않는다.
      function readPublicFlags(){
       try{
        fetch('/api/shares',{headers:{accept:'application/json'}}).then(function(r){return r.ok?r.json():null}).then(function(body){
         var ids={};(Array.isArray(body&&body.shares)?body.shares:[]).forEach(function(s){if(s&&s.status==='active'&&s.treeId)ids[s.treeId]=true;});
         var changed=false;
         books.forEach(function(book){var next=ids[book.id]===true;if(book.public!==next){book.public=next;changed=true;}});
         if(changed)renderShelf();
        }).catch(function(){});
       }catch(error){}
      }
      var esc = escapeShelf;
      var youtubeId = function (url) { return youtubeIdOf(url, window.LTMedia && window.LTMedia.describe); };
      function showToast(message) { var toast=$('#toast'); toast.textContent=message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(function(){toast.classList.remove('show');},2400); }
      function coverClasses(book) {
        var cIdx = COVER_PALETTE.indexOf(book.color);
        var aIdx = COVER_PALETTE.indexOf(book.accent);
        var tilt = (String(book.id || '').length % 5) - 2;
        var tiltName = tilt === -2 ? 'tilt-m2' : tilt === -1 ? 'tilt-m1' : tilt === 0 ? 'tilt-0' : tilt === 1 ? 'tilt-p1' : 'tilt-p2';
        return (cIdx >= 0 ? ' cover-c' + (cIdx + 1) : '') + (aIdx >= 0 ? ' cover-a' + (aIdx + 1) : '') + ' ' + tiltName;
      }
       function renderShelf() {
         var list=filterShelf(books, state.filter, state.query);

         state.shelfList=list;
        state.shelfIndex=resolveShelfIndex(list, state.selectedId, state.shelfIndex);
        $('#resultCount').textContent='트리 '+list.length+'개';
         var viewport=$('#shelfViewport');if(viewport)viewport.dataset.shelfView=shelfView();
         paintShelfViewInline();paintShelfFilterInline();
        var railWidth=($('#shelfRail')&&$('#shelfRail').clientWidth)||0;
        // #944: 시작은 첫 책 왼쪽 끝이 책장 안쪽 여백. 고른 책이 뒤쪽이면 보이게만 최소로 민다.
        // #1366: 선반은 그리드가 모든 책을 보여 주므로 캐러셀 넘김 값을 쓰지 않는다.
        state.shelfOffset=shelfView()==='shelf'?0:shelfRowLayout(list.length, railWidth).offsetFor(state.shelfIndex, state.shelfOffset||0);
        // #889 원래 결정: 화살표는 책이 한 줄에 다 안 들어갈 때(넘김 배치일 때)만 둔다.
        applyShelfArrows(list.length,railWidth);
        // 261118 대표 지적 4: 트리가 있으면 소개 문 대신 이어 보기 띠 한 줄. 트리 0개일 때만 소개 문('…한 권의 책으로.'+'책 열기')이 보인다.
        var hero=document.querySelector('.hero');
        if(hero)hero.classList.toggle('strip-mode',list.length>0);
        // #256-1: 목록이 바뀔 때마다 다시 그린다. 칸은 검색·필터와 무관하게 전체 책 기준이라 좁아져도 그대로다.
        renderResumeCard();
        renderRecent();
        $('#shelfRail').innerHTML=(list.length?list.map(function(book,index){
          // #212: 표지에 이름 한 번만. 사진 표지에는 제목을 올리지 않고(표지 사진만), 표지 아래는 두 줄로 — '제목 · N개 순간' / 'N일 전 추가'(한 줄 넘으면 말줄임).
          // #256-3: 디자인 표지는 shelf-model coverChoice 판정(book.design)을 그대로 쓴다. 없으면 속성도 없다(기존 화면 변화 0).
          var metaParts=bookMeta(book).split(' · ');
          var metaLine1=book.name+' · '+metaParts[0];
          var metaLine2=metaParts.slice(1).join(' · ');
          // #1495: 둘러보기에 소개된 트리만 아주 작게 '둘러보기에 보임' — 누르면 셸이 그 트리 공유 판을 연다. 소개 안 된 트리는 표시 없음.
          var discovered=(function(){try{return !!(parent.LT41_DISCOVER&&parent.LT41_DISCOVER[book.id]===true)}catch(e){return false}})();
          // 보이는 글자는 표지 안(테두리 안쪽 8px)에 두어 표지의 기울기·떠오름을 그대로 따르고, 마우스·손가락 누름도 이 글자가 받는다.
          // 단추 안에 단추를 둘 수 없어, 키보드·화면 읽기용 단추는 그 자리에 투명하게 겹치고 누름은 통과시킨다.
          var discoverMark=discovered?'<span class="book-discover-mark" data-discover-share="'+esc(book.id)+'" aria-hidden="true"><span class="mark-full">둘러보기에 보임</span><span class="mark-short"><svg class="mark-eye" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>공개</span></span>':'';
          var discoverBadge=discovered?'<button type="button" class="book-discover" data-discover-share="'+esc(book.id)+'" aria-label="'+esc(book.name)+' 둘러보기에 보임, 공유 판 열기"></button>':'';
          return '<article class="book-card" data-book-index="'+index+'"><button type="button" data-book-id="'+esc(book.id)+'" aria-label="'+esc(book.name)+' 책 열기">'+
            '<div class="book-cover'+coverClasses(book)+'"'+(book.design?' data-cover-design="'+esc(book.design)+'"':'')+'>'+(book.coverMedia?'<img class="book-cover-media" src="'+esc(book.coverMedia)+'"'+coverFallbackAttrs(book.coverCandidates||[book.coverMedia])+' alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span class="cover-symbol"><span>'+esc(book.symbol)+'</span></span>'+(book.coverMedia?'<span class="cover-name-band">'+esc(book.name)+'</span>':'<strong class="cover-title">'+esc(book.name)+'</strong>')+discoverMark+'</div>'+
            '<span class="book-card-meta"><span class="book-card-meta-title">'+esc(metaLine1)+'</span><span class="book-card-meta-date">'+esc(metaLine2)+'</span></span></button><button type="button" class="book-manage" data-manage-id="'+esc(book.id)+'" aria-label="'+esc(book.name)+' 고치기">⋯</button>'+discoverBadge+'</article>';
        }).join(''):'<div class="empty"><strong>찾는 책이 없어요.</strong><span>트리 이름·좋아하는 대상·순간 제목으로 검색해 보세요.</span></div>');
        // #1285 빈 칸 자리와 배치는 보기 모듈이 맡는다(#1376 1단계).
        relayout();
        placeDiscoverButtons();
      }
      // #1495: 투명 단추를 표지 안 '둘러보기에 보임' 자리에 맞춘다. 위치는 변형 전 배치값(offset)이라 책 기울기·이동과 무관하고, 보기·폭이 바뀔 때만 다시 잰다.
      function placeDiscoverButtons(){
        $$('#shelfRail .book-card').forEach(function(card){
          var button=card.querySelector('.book-discover'),mark=card.querySelector('.book-discover-mark'),cover=card.querySelector('.book-cover');
          if(!button||!mark||!cover)return;
          // 대표 결정 B: 한 줄 '둘러보기에 보임'이 표지 안쪽 8px에 들어가지 않는 좁은 표지에서만 '공개'+눈 아이콘으로 줄인다(두 줄 접기 없음).
          mark.classList.remove('is-short');
          var full=mark.querySelector('.mark-full'),cs=getComputedStyle(mark);
          var need=(full?full.offsetWidth:0)+parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight)+parseFloat(cs.borderLeftWidth)+parseFloat(cs.borderRightWidth);
          if(need>cover.clientWidth-16)mark.classList.add('is-short');
          var x=0,y=0,node=mark;
          while(node&&node!==card){x+=node.offsetLeft;y+=node.offsetTop;node=node.offsetParent;}
          card.style.setProperty('--discover-x',x+'px');card.style.setProperty('--discover-y',y+'px');
          card.style.setProperty('--discover-w',mark.offsetWidth+'px');card.style.setProperty('--discover-h',mark.offsetHeight+'px');
        });
      }      // #256-1 → 261118 대표 지적 4: 이어 보기 띠 한 줄 — [가로 썸네일] 트리 이름 · 순간 제목 · '이어 보기 ▶'.
      // 마지막 위치는 새로 저장하지 않고, 셸이 이미 저장·복원하는 계정 위치를 읽어 보여 준다.
      // 글자는 썸네일 밖에 놓고(사진 위 겹침 금지), 주소 문구(동영상 사이트 이름)는 넣지 않는다.
      function renderResumeCard() {
        var strip=$('#resumeStrip');
        if(!strip)return;
        var context=window.parent&&window.parent.LT41?window.parent.LT41:null;
        var info=resumeCard({
          source:context?context.source:'server',
          treeId:context&&context.tree?context.tree.id:'',
          momentId:typeof LTDEMO.get==='function'?String(LTDEMO.get()||''):'',
          books:books
        });
        var show=!!info.book;
        strip.hidden=!show;
        if(!show){strip.onclick=null;return;}
        var thumb=$('#resumeThumb');
        if(thumb){
          // #1366 ⑤ 가로 썸네일도 책 표지와 같은 규칙: 그 트리의 표지 사진(첫 순간/바꾼 표지)을 먼저 쓰고,
          // 없으면 순간 사진, 그래도 없으면 표지 색 칸으로 남긴다. 글자는 썸네일 밖에 둔다.
          var fallbackChapter=info.book.chapters.find(function(c){return c.image||(c.thumbCandidates&&c.thumbCandidates.length)});
          var momentCandidates=info.moment&&info.moment.thumbCandidates&&info.moment.thumbCandidates.length?info.moment.thumbCandidates:[];
          var fallbackCandidates=fallbackChapter&&fallbackChapter.thumbCandidates&&fallbackChapter.thumbCandidates.length?fallbackChapter.thumbCandidates:[];
          var src=info.book.coverMedia || momentCandidates[0] || (info.moment&&info.moment.image) || fallbackCandidates[0] || (fallbackChapter&&fallbackChapter.image) || '';
          var candidates=info.book.coverMedia?(info.book.coverCandidates||[src]):(momentCandidates.length?momentCandidates:(fallbackCandidates.length?fallbackCandidates:(src?[src]:[])));
          // #1273 8번: 그림이 없으면 빈 색 칸으로 남지 않게 트리 이름 첫 글자로 표지를 채운다(사진 위에는 글자를 얹지 않는다).
          thumb.innerHTML=src?'<img src="'+esc(src)+'"'+coverFallbackAttrs(candidates||[src])+' alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="resume-thumb-mark" aria-hidden="true">'+esc(String(info.treeName||info.book.name||'책').slice(0,1))+'</span>';
          thumb.style.setProperty('--cover',info.book.color);
          thumb.style.setProperty('--cover-accent',info.book.accent);
          if(info.book.design)thumb.setAttribute('data-cover-design',info.book.design);else thumb.removeAttribute('data-cover-design');
        }
        var setting=(()=>{try{return parent.LT41?.prefs?.titleDisplay||'both'}catch{return 'both'}})();
        $('#resumeTree').textContent=info.treeName||info.book.name;
        var momentMain=info.moment&&titleView(info.moment,setting).main?titleView(info.moment,setting).main.replace(/[.。!?！？]+$/u,''):'';
        $('#resumeMoment').textContent=momentMain||(info.book.chapters[0]?resumeName(info.book.chapters[0].title):'');
        // #1497 3번: 순간 제목이 트리 이름과 같으면(첫 순간 이름 = 트리 이름) 같은 이름을 두 번 보이지 않게 점과 함께 숨긴다.
        var sameName=resumeName($('#resumeMoment').textContent).replace(/\s+/g,'')===resumeName($('#resumeTree').textContent).replace(/\s+/g,'');
        $('#resumeMoment').hidden=sameName;
        var resumeDot=strip.querySelector('.resume-dot');if(resumeDot)resumeDot.hidden=sameName;
        $('#resumeGo').textContent=info.action+' ▶';
        strip.dataset.resumeKind=info.kind;
        strip.onclick=function(){
          if(info.kind==='first'){parent.postMessage({type:MSG.write,mode:'new'},location.origin);return;}
          // #1094 목록 방식: 띠도 목록으로 곧바로 연다(책 방식은 지금처럼 책으로 바로 간다).
          if(reader&&typeof reader.shelfBookDisplay==='function'&&reader.shelfBookDisplay()==='list'){openReader(info.book.id,null);return;}
          if(info.moment)LTDEMO.openBook(info.moment.id,info.book.id);
          else LTDEMO.openBook(info.book.chapters[0]&&info.book.chapters[0].id,info.book.id);
        };
      }
      // 다른 화면의 크게 보기와 같은 영상 플레이어·사진 확대 형식을 사용한다.
      function openRecentMoment(book,chapter) {
        var media=window.LTMedia&&window.LTMedia.describe?window.LTMedia.describe(chapter.url||''):null;
        if(media&&(media.kind==='youtube'||media.kind==='video')&&typeof window.LTMedia.openLightbox==='function'){
          window.LTMedia.openLightbox(chapter.url,chapter.title||'순간');
          return;
        }
        var previous=document.activeElement;
        var old=document.querySelector('.shelf-recent-viewer');
        if(old)old.remove();
        var overlay=document.createElement('div');
        overlay.className='lt-lightbox shelf-recent-viewer';
        overlay.setAttribute('role','dialog');
        overlay.setAttribute('aria-modal','true');
        overlay.setAttribute('aria-label','순간 크게 보기');
        var stage=document.createElement('div');
        stage.className='lt-lightbox-stage';
        var src=chapter.image||(chapter.thumbCandidates&&chapter.thumbCandidates[0])||'';
        if(src){
          var image=document.createElement('img');
          image.className='shelf-recent-viewer-image';
          image.src=src;
          image.alt=chapter.title||'순간';
          image.referrerPolicy='no-referrer';
          stage.appendChild(image);
        }else{
          var note=document.createElement('p');
          note.className='shelf-recent-viewer-text';
          note.textContent=chapter.title||'순간';
          stage.appendChild(note);
        }
        var close=document.createElement('button');
        close.type='button';
        close.className='lt-lightbox-close';
        close.setAttribute('aria-label','크게 보기 닫기');
        close.textContent='×';
        var caption=document.createElement('p');
        caption.className='lt-lightbox-title';
        caption.textContent=(chapter.title||'순간')+(chapter.date?' · '+chapter.date:'');
        function finish(){
          document.removeEventListener('keydown',onKey,true);
          overlay.remove();
          if(previous&&previous.isConnected)previous.focus({preventScroll:true});
        }
        function onKey(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish();}}
        document.addEventListener('keydown',onKey,true);
        close.addEventListener('click',finish);
        overlay.addEventListener('click',function(event){if(event.target===overlay)finish();});
        overlay.append(stage,close,caption);
        document.body.appendChild(overlay);
        close.focus();
      }
      // #1366 ⑥: 고른 트리의 최근 순간 여섯 개와 숫자를 책장 아래에 둔다.
      function renderRecent() {
        var sec=$('#shelfRecent'),row=$('#shelfRecentRow'),stats=$('#shelfRecentStats');
        if(!sec||!row||!stats)return;
        var book=state.shelfList[state.shelfIndex];
        if(!book||!book.chapters.length){sec.hidden=true;row.innerHTML='';stats.textContent='';return;}
        var list=recentChapters(book.chapters);
        stats.textContent=bookMeta(book);
        row.innerHTML=list.map(function(chapter){
          var src=chapter.image||(chapter.thumbCandidates&&chapter.thumbCandidates[0])||'';
          var candidates=chapter.thumbCandidates&&chapter.thumbCandidates.length?chapter.thumbCandidates:[src];
          var image=src?'<img src="'+esc(src)+'"'+coverFallbackAttrs(candidates)+' alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="shelf-recent-letter" aria-hidden="true">'+esc(String(book.name||'책').slice(0,1))+'</span>';
          return '<button type="button" class="shelf-recent-item" data-moment-id="'+esc(chapter.id)+'" aria-label="'+esc(chapter.title||'순간')+' 크게 보기">'+
            '<span class="shelf-recent-visual'+(src?'':' shelf-recent-visual--empty')+'" aria-hidden="true">'+image+'</span>'+
            '<span class="shelf-recent-name">'+esc(chapter.title||'순간')+'</span></button>';
        }).join('');
        sec.style.setProperty('--shelf-recent-cover',book.color);
        Array.prototype.forEach.call(row.querySelectorAll('[data-moment-id]'),function(button){
          button.onclick=function(){
            var chapter=list.find(function(item){return String(item.id)===button.dataset.momentId;});
            if(chapter)openRecentMoment(book,chapter);
          };
        });
        sec.hidden=false;
      }
      function setShelfAtmosphere(book) {
        var viewport=$('#shelfViewport');
        if(!viewport||!book)return;
        viewport.style.setProperty('--shelf-accent',book.color);
        viewport.setAttribute('data-selected-book',book.id);
      }
      // 화살표 0개(다 들어감) / 2개(넘침). 레일 폭이 정해지기 전에는 잠시 숨기고, ResizeObserver가 다시 맞춘다.
      function applyShelfArrows(count, railWidth) {
        // #1366: 선반은 여러 줄 그리드라 넘김이 없다. 화살표는 회전 보기에서만 둔다.
        var show=shelfView()!=='shelf'&&railWidth>0&&shelfRowLayout(count, railWidth).mode==='carousel'&&count>0;
        var prevArrow=$('#shelfPrev'),nextArrow=$('#shelfNext');
        if(prevArrow)prevArrow.hidden=!show;
        if(nextArrow)nextArrow.hidden=!show;
      }
      function reportShelfTree(center){
        renderRecent();
        // 261118 대표 지적 2차 5: 서재에서 마지막에 본 트리(가운데 책의 트리)를 셸에 알린다 —
        // 서재 화면에서 콕·보드·지도 탭을 누르면 그 트리로 열린다.
        var centered=state.shelfList[center];
        if(centered&&centered.id!==state.reportedTreeId){state.reportedTreeId=centered.id;try{parent.postMessage({type:MSG.shelfTree,treeId:centered.id},location.origin);}catch{}}
      }
      function selectShelfIndex(index) {
        if(index<0||index>=state.shelfList.length)return;
        if(index!==state.shelfIndex){state.shelfIndex=index;relayout();}
        var book=state.shelfList[index];
        if(book)openReader(book.id,getShelfCard(index));
      }
      function getShelfCard(index) { return $('#shelfRail [data-book-index="'+index+'"]'); }
      // 읽기(펼침·장 넘김·끌기)는 shelf-reader.js가 맡는다. 상태·도우미만 넘겨 준다.
      var reader = createReader({ $: $, $$: $$, state: state, getBook: getBook, showToast: showToast, save: save, renderShelf: renderShelf, getShelfCard: getShelfCard });
      var setCover = reader.setCover, renderChapterList = reader.renderChapterList, clearVideo = reader.clearVideo,
        renderPage = reader.renderPage, mountVideo = reader.mountVideo, applyOpenProgress = reader.applyOpenProgress,
        animateOpenProgress = reader.animateOpenProgress, renderReader = reader.renderReader,
        openReader = reader.openReader, backToShelf = reader.backToShelf, openBook = reader.openBook,
        closeBook = reader.closeBook, turnPage = reader.turnPage, bindBookDrag = reader.bindBookDrag;
      // ── #1468: 배선을 쓰는 것끼리 작은 함수로 나눈다. 등록하는 귀와 처리기 내용은 이전 한 함수와 같다(동작 바뀜 0). ──
      function openNewTree(){parent.postMessage({type:MSG.newTree},location.origin);}
      function openManageTree(id){parent.postMessage({type:MSG.manageTree,treeId:id},location.origin);}
      // 261118 대표 지적 3: '+ 새 트리' 입구는 오른쪽 단추(#shelfNewTree) 하나다. 트리 고치기·만들기는 셸의 흐름으로 넘긴다.
      function bindTreeActions(){
        $('#shelfRail').addEventListener('click',function(event){var railManage=event.target.closest('[data-manage-id]');if(railManage)openManageTree(railManage.dataset.manageId);var share=event.target.closest('[data-discover-share]');if(share){event.stopPropagation();try{parent.postMessage({type:MSG.openShare,treeId:share.dataset.discoverShare},location.origin);}catch{}}});
        $('#shelfNewTree').addEventListener('click',openNewTree);
      }
      // 보기 전환(회전·선반): 저장과 전환은 셸이 맡긴다.
      function bindViewSwitch(){
       $$('#shelf-view-inline [data-shelf-view]').forEach(function(b){b.onclick=function(){try{parent.postMessage({type:MSG.setShelfView,value:b.dataset.shelfView},location.origin)}catch{}};});
      }
      // #1631: 단추·Enter는 같은 경로, 화살표는 두 선택지 사이를 이동한다.
      function bindShelfOpenModeSwitch(){
        var buttons=$$('#shelf-open-choice [data-shelf-open-mode]');
        function choose(b){
          if(!b)return;
          paintShelfOpenModeInline(b.dataset.shelfOpenMode);
          try{parent.postMessage({type:MSG.setShelfOpenMode,value:b.dataset.shelfOpenMode},location.origin)}catch{}
        }
        buttons.forEach(function(b,index){
          b.addEventListener('click',function(){choose(b);});
          b.addEventListener('keydown',function(event){
            if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();choose(b);return;}
            var step=(event.key==='ArrowRight'||event.key==='ArrowDown')?1:(event.key==='ArrowLeft'||event.key==='ArrowUp')?-1:0;
            if(!step&&event.key!=='Home'&&event.key!=='End')return;
            event.preventDefault();event.stopPropagation();
            var target=event.key==='Home'?buttons[0]:event.key==='End'?buttons[buttons.length-1]:buttons[(index+step+buttons.length)%buttons.length];
            target?.focus();choose(target);
          });
        });
        paintShelfOpenModeInline();
      }
      // 찾기·걸러 보기·지금 책 바로 열기: 목록이 바뀌면 서재를 다시 그린다.
      function bindSearchActions(){
        $('#shelfJump').addEventListener('click',function(){state.query='';state.filter='all';$('#searchInput').value='';paintShelfFilterInline();renderShelf();var book=getShelfCard(state.shelfIndex)?.querySelector('button[data-book-id]');if(book)openReader(book.dataset.bookId,book.closest('.book-card'));});
        $('#searchInput').addEventListener('input',function(event){state.query=event.target.value;renderShelf();});
        $$('#shelf-filter-inline [data-filter]').forEach(function(button){button.addEventListener('click',function(){state.filter=button.dataset.filter==='public'?'public':'all';paintShelfFilterInline();renderShelf();});});
      }
      // 화살표·휠: 회전 보기 넘김(휠 한 칸 이동은 #1438 그대로).
      function bindCarouselMoves(){
        $('#shelfPrev').addEventListener('click',function(){view.move(-1);});
        $('#shelfNext').addEventListener('click',function(){view.move(1);});
        // #1366 ⑧: 세로 휠만 회전 넘김으로 쓴다. 레일 밖과 가로 트랙패드는 기본 스크롤에 맡긴다.
        // 한 묶음당 한 칸, 연속 휠은 잠깐 무시해 건너뛰기를 막는다.
        var wheelAt=0;
        $('#shelfRail').addEventListener('wheel',function(event){
          if(shelfView()!=='carousel'||event.ctrlKey)return;
          if(Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
          if(Math.abs(event.deltaY)<2)return;
          event.preventDefault();
          var at=Date.now();
          if(at-wheelAt<320)return;
          wheelAt=at;
          view.move(event.deltaY>0?1:-1);
        },{passive:false});
      }
      // 펼침 보기(책 읽기): 열기·닫기·장 넘김·끌기·키보드.
      function bindReaderActions(){
        $('#backToShelf').addEventListener('click',backToShelf);
        $('#openBookButton').addEventListener('click',openBook);
        $('#closeBookButton').addEventListener('click',closeBook);
        $('#prevPage').addEventListener('click',function(){turnPage(-1);});
        $('#nextPage').addEventListener('click',function(){turnPage(1);});
        $('#rightPage').addEventListener('click',function(event){if(event.target.closest('[data-play-video]'))mountVideo();});
        bindBookDrag();
        document.addEventListener('keydown',function(event){if(!state.selectedId){if(event.key==='ArrowRight')view.move(1);if(event.key==='ArrowLeft')view.move(-1);return;}if(event.key==='Escape'&&state.open){closeBook();return;}if(state.open&&event.key==='ArrowRight')turnPage(1);if(state.open&&event.key==='ArrowLeft')turnPage(-1);});
      }
      function bind(){
        // #1495: 폭이 바뀌면 표지 크기가 달라지니 투명 단추 자리를 다시 잰다.
        if(typeof addEventListener==='function')addEventListener('resize',function(){requestAnimationFrame(placeDiscoverButtons);});
        bindTreeActions();bindViewSwitch();bindShelfOpenModeSwitch();bindSearchActions();bindCarouselMoves();bindReaderActions();
      }
// #481: 제목 보기가 바뀌면 책장의 제목(이어 읽기·표지)도 다시 그려야 한다. 다만 날짜 표기와 같은 판정으로
// '지금 그린 값과 다르고, 기기 미러가 이미 그 값일 때'만 다시 띄운다 — 받을 때마다 새로고침하면 고리가 된다.
const renderedTitleDisplay=titleDisplayOf((()=>{try{return parent.LT41?.prefs?.titleDisplay||'both'}catch{return 'both'}})());
window.__shelfListenerInstalled=true;
if(typeof addEventListener==='function')addEventListener('message',e=>{
 if(!isShellMessage(e))return;
 if(e.data?.type===MSG.shelfOpenMode){paintShelfOpenModeInline(e.data.value);return;}
 if(e.data?.type===MSG.shelfView){
   ensureView();view.mount(viewCtx());
   renderShelf();
   return;
  }
  // #1495: 셸이 소개 상태를 새로 알면(서재가 뜬 뒤 확인·공유 판에서 바꿈) 카드 표시를 다시 그린다.
 if(e.data?.type===MSG.discoverState){renderShelf();return;}
 if(e.data?.type===MSG.shelfFilter){
   state.filter=e.data.value==='public'?'public':'all';
   paintShelfFilterInline();renderShelf();
   return;
  }
  if(e.data?.type===MSG.shelfSelectTree){
  window.__pickSeen=e.data.treeId;
  var picked=books.findIndex(b=>b.id===e.data.treeId);
  if(picked>=0){var rail=$('#shelfRail');state.shelfIndex=picked;state.shelfOffset=shelfRowLayout(state.shelfList.length,rail?rail.clientWidth:0).offsetFor(picked,state.shelfOffset||0);relayout();}
  return;
 }
 if(e.data?.type===MSG.treesSaved){
  // #984: 저장이 서버에서 확인되면 책장·열린 책의 표지를 바로 다시 그린다(다시 열 필요 없이).
  // 저장 실패 때는 이 메시지가 오지 않는다 — 책장은 원래 표지를 그대로 두고, 셸의 저장 안내 떠가 실패를 알린다.
  var freshTrees=window.parent&&window.parent.LT41?window.parent.LT41.trees:null;
  if(!Array.isArray(freshTrees))return;
  if(e.data.background){
   if(!LTDEMO.refresh?.())return;
   LTDEMO.refreshLibrary();
   books=buildShelf(shelfOrder(LTDEMO.library),palette,namer);
   renderShelf();
   var openBook=getBook(state.selectedId);if(openBook&&state.open)setCover(openBook);
   return;
  }
  if(freshTrees.length!==books.length){location.reload();return;}
  var savedChanged=false,savedOpenChanged=false;
  for(const t of freshTrees){
   var at=books.findIndex(function(b){return b.id===t.id;});
   var lib=LTDEMO.library.find(function(x){return x.id===t.id;});
   if(at<0||!lib){location.reload();return;}
   lib.title=t.title;lib.subject=t.subject;lib.coverMode=t.coverMode||'';lib.coverDesign=t.coverDesign||'';lib.coverMomentId=t.coverMomentId||'';lib.inbox=t.inbox===true;
   var freshBook=shelfBook(lib,at,palette,namer);
   if(JSON.stringify(books[at])===JSON.stringify(freshBook))continue;
   books[at]=freshBook;savedChanged=true;
   if(state.selectedId===t.id)savedOpenChanged=true;
  }
  if(savedChanged)renderShelf();
  if(savedOpenChanged){var savedOpenBook=getBook(state.selectedId);if(savedOpenBook)setCover(savedOpenBook);}
  return;
 }
 if(e.data?.type===MSG.treesRenamed){
  var fresh=window.parent&&window.parent.LT41?window.parent.LT41.trees:null;
  if(Array.isArray(fresh)&&fresh.length!==books.length){location.reload();return;}
  if(Array.isArray(fresh)){
   let changed=false;
   for(const t of fresh){
    const book=books.find(b=>b.id===t.id);
    if(book&&book.name!==treeTitle(t.title)){book.name=treeTitle(t.title);changed=true;}
   }
   if(changed)renderShelf();
   return;
  }
  let changed=false;
  for(const t of (Array.isArray(e.data.titles)?e.data.titles:[])){
   const book=books.find(b=>b.id===t.id),name=treeTitle(t.title);
   if(book&&book.name!==name){book.name=name;changed=true;}
  }
  if(changed)renderShelf();
  return;
 }
 if(e.data?.type!==MSG.titleDisplay)return;
 let mirror=null;try{mirror=localStorage.getItem('lt41.titleDisplay');}catch{}
 if(shouldReloadForTitleDisplay({value:e.data.value,rendered:renderedTitleDisplay,mirror}))location.reload();
});

      mountThumbFallback(document);
      ensureView();view.mount(viewCtx());
      renderShelf();renderResumeCard();bind();readPublicFlags();
  }
}
