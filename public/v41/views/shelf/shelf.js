import { MSG } from '../../frame-messages.mjs';
// 내 트리(책장) 동작 (#231 후속, 2026-11-09).
// 계산(표지 색·이름·정보 줄·검색·카드 배치·페이지)은 shelf-model.mjs로 옮기고 여기서는 화면만 다룬다.
// 조건·문구·id·순서 변경 0. #291(궤도)와 같이 모듈로 불러 쓴다.
import {
  COVER_PALETTE, allBooks as allBooksOf, bookMeta, buildShelf, carouselTransform,
  escapeShelf, filterShelf, findBook, lastMomentDate as lastMomentDateOf,
  resolveShelfIndex, resumeCard, resumeName, shelfBook, shelfRowLayout, shelfRotationLayout,
  treeTitleOf, youtubeId as youtubeIdOf
} from './shelf-model.mjs';
import { shelfOrder } from '../../inbox-model.mjs';
import { titleView, titleDisplayOf, shouldReloadForTitleDisplay } from '../../book-usability.mjs';
import { coverFallbackAttrs, mountThumbFallback } from '../../thumb-fallback.mjs';
import { localDateOnly } from '../../local-date.mjs';
import { createReader } from './shelf-reader.js';

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
      var state = { filter:'all', query:'', selectedId:null, shelfIndex:0, shelfOffset:0, shelfList:[], chapterIndex:0, open:false, openProgress:0, customBooks:[], pageTurning:false };
      var storageKey = 'lovetree-people-book-shelf-v2-1-true-page-motion';
      var drag = { active:false, mode:'', startX:0, startY:0, moved:false, startProgress:0 };
      var shelfDrag = { active:false, startX:0, moved:false, downIndex:null };
      // #1093: 계정 설정(bookDisplay와 같은 길) → 기기 미러 → 기본 선반.
      function shelfView() {
        try { var v=parent.LT41?.prefs?.shelfView; if(v==='shelf'||v==='carousel')return v; } catch {}
        try { var m=localStorage.getItem('lt41.shelfView'); if(m==='shelf'||m==='carousel')return m; } catch {}
        return 'shelf';
      }
      function paintShelfViewInline(){
        var view=shelfView();
        $$('#shelf-view-inline [data-shelf-view]').forEach(function(b){b.setAttribute('aria-checked',String(b.dataset.shelfView===view));});
      }
      try {
        var saved = {};
        state.selectedId = null;
        state.shelfIndex = Number.isInteger(saved.shelfIndex) ? saved.shelfIndex : 0;
        state.chapterIndex = Number.isInteger(saved.chapterIndex) ? saved.chapterIndex : 0;
        state.open = false;
        state.openProgress = 0;
        state.customBooks = [];
      } catch (error) {}
      state.shelfIndex=Math.max(0,books.findIndex(book=>book.id===parent.LT41.tree.id));
      function allBooks() { return allBooksOf(books, state.customBooks); }
      function getBook(id) { return findBook(allBooks(), id); }
      function save() {} // Selection belongs to the shell; never persist another account's library.
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
      function openModal(id) { $('#'+id).classList.remove('hidden'); }
      function closeModal(id) { $('#'+id).classList.add('hidden'); }
       function renderShelf() {
         var list=filterShelf(allBooks(), state.filter, state.query);

         state.shelfList=list;
        state.shelfIndex=resolveShelfIndex(list, state.selectedId, state.shelfIndex);
        $('#resultCount').textContent='트리 '+list.length+'개';
         var viewport=$('#shelfViewport');if(viewport)viewport.dataset.shelfView=shelfView();
         paintShelfViewInline();
        var railWidth=($('#shelfRail')&&$('#shelfRail').clientWidth)||0;
        // #944: 시작은 첫 책 왼쪽 끝이 책장 안쪽 여백. 고른 책이 뒤쪽이면 보이게만 최소로 민다.
        state.shelfOffset=shelfRowLayout(list.length, railWidth).offsetFor(state.shelfIndex, state.shelfOffset||0);
        // #889 원래 결정: 화살표는 책이 한 줄에 다 안 들어갈 때(넘김 배치일 때)만 둔다.
        applyShelfArrows(list.length,railWidth);
        // 261118 대표 지적 4: 트리가 있으면 소개 문 대신 이어 보기 띠 한 줄. 트리 0개일 때만 소개 문('…한 권의 책으로.'+'책 열기')이 보인다.
        var hero=document.querySelector('.hero');
        if(hero)hero.classList.toggle('strip-mode',list.length>0);
        // #256-1: 목록이 바뀔 때마다 다시 그린다. 칸은 검색·필터와 무관하게 전체 책(allBooks) 기준이라 좁아져도 그대로다.
        renderResumeCard();
        $('#shelfRail').innerHTML=(list.length?list.map(function(book,index){
          // #212: 표지에 이름 한 번만. 표지 아래는 "순간 N개 · 마지막 YYYY-MM-DD" 하나만. "책 · 02"·"기본 표지" 같은 내부 표시는 없다.
          // #256-3: 디자인 표지는 shelf-model coverChoice 판정(book.design)을 그대로 쓴다. 없으면 속성도 없다(기존 화면 변화 0).
          return '<article class="book-card" data-book-index="'+index+'"><button type="button" data-book-id="'+esc(book.id)+'" aria-label="'+esc(book.name)+' 책 열기">'+
            '<div class="book-cover'+coverClasses(book)+'"'+(book.design?' data-cover-design="'+esc(book.design)+'"':'')+'>'+(book.coverMedia?'<img class="book-cover-media" src="'+esc(book.coverMedia)+'"'+coverFallbackAttrs(book.coverCandidates||[book.coverMedia])+' alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span class="cover-symbol"><span>'+esc(book.symbol)+'</span></span><strong class="cover-title">'+esc(book.name)+'</strong></div>'+
            '<span class="book-card-meta"><span>'+esc(bookMeta(book))+'</span></span></button><button type="button" class="book-manage" data-manage-id="'+esc(book.id)+'" aria-label="'+esc(book.name)+' 고치기">⋯</button></article>';
        }).join(''):'<div class="empty"><strong>찾는 책이 없어요.</strong><span>트리 이름·좋아하는 대상·순간 제목으로 검색해 보세요.</span></div>');
        updateCarousel(false);
      }
      // #256-1 → 261118 대표 지적 4: 이어 보기 띠 한 줄 — [가로 썸네일] 트리 이름 · 순간 제목 · '이어 보기 ▶'.
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
          books:allBooks()
        });
        var show=!!info.book;
        strip.hidden=!show;
        if(!show){strip.onclick=null;return;}
        var thumb=$('#resumeThumb');
        if(thumb){
          // 가로 썸네일: 마지막 순간의 사진을 먼저 쓰고, 없으면 책 표지 사진·표지 색 칸으로 채운다. 글자는 썸네일 안에 넣지 않는다.
          var src=info.moment&&info.moment.thumb?info.moment.thumb:(info.book.coverMedia||'');
          var candidates=info.moment&&info.moment.thumbCandidates?info.moment.thumbCandidates:(info.book.coverCandidates||[info.book.coverMedia]);
          thumb.innerHTML=src?'<img src="'+esc(src)+'"'+coverFallbackAttrs(candidates||[src])+' alt="" loading="lazy" referrerpolicy="no-referrer">':'';
          thumb.style.setProperty('--cover',info.book.color);
          thumb.style.setProperty('--cover-accent',info.book.accent);
          if(info.book.design)thumb.setAttribute('data-cover-design',info.book.design);else thumb.removeAttribute('data-cover-design');
        }
        var setting=(()=>{try{return parent.LT41?.prefs?.titleDisplay||'both'}catch{return 'both'}})();
        $('#resumeTree').textContent=info.treeName||info.book.name;
        var momentMain=info.moment&&titleView(info.moment,setting).main?titleView(info.moment,setting).main.replace(/[.。!?！？]+$/u,''):'';
        $('#resumeMoment').textContent=momentMain||(info.book.chapters[0]?resumeName(info.book.chapters[0].title):'');
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
      function setShelfAtmosphere(book) {
        var viewport=$('#shelfViewport');
        if(!viewport||!book)return;
        viewport.style.setProperty('--shelf-accent',book.color);
        viewport.setAttribute('data-selected-book',book.id);
      }
      // 화살표 0개(다 들어감) / 2개(넘침). 레일 폭이 정해지기 전에는 잠시 숨기고, ResizeObserver가 다시 맞춘다.
      function applyShelfArrows(count, railWidth) {
        // 화살표는 보기 방식과 무관하게 옛날과 같은 넘침 조건에서만 뜬다(도구 줄 토글은 계산에 넣지 않는다).
        var show=railWidth>0&&shelfRowLayout(count, railWidth).mode==='carousel'&&count>0;
        var prevArrow=$('#shelfPrev'),nextArrow=$('#shelfNext');
        if(prevArrow)prevArrow.hidden=!show;
        if(nextArrow)nextArrow.hidden=!show;
      }
      function clearDragX(rail){
        if(!rail||!rail.style)return;
        if(typeof rail.style.removeProperty==='function')rail.style.removeProperty('--drag-x');
        else if(typeof rail.style.setProperty==='function')rail.style.setProperty('--drag-x','');
        else delete rail.style['--drag-x'];
      }
      function setDragX(rail,px){
        if(!rail||!rail.style)return;
        if(typeof rail.style.setProperty==='function')rail.style.setProperty('--drag-x',px+'px');
        else rail.style['--drag-x']=px+'px';
      }
      function reportShelfTree(center){
        // 261118 대표 지적 2차 5: 서재에서 마지막에 본 트리(가운데 책의 트리)를 셸에 알린다 —
        // 서재 화면에서 콕·보드·지도 탭을 누르면 그 트리로 열린다.
        var centered=state.shelfList[center];
        if(centered&&centered.id!==state.reportedTreeId){state.reportedTreeId=centered.id;try{parent.postMessage({type:MSG.shelfTree,treeId:centered.id},location.origin);}catch{}}
      }
      function updateCarousel() {
        var rail=$('#shelfRail');
        if(!rail)return;
        applyShelfArrows(state.shelfList.length, rail.clientWidth);
        var center=state.shelfIndex;
        if(shelfView()==='shelf'){
          // 선반은 그리드가 자리를 정한다 — 넘침 화살표는 예전처럼 레일 전체를 한 칸씩 민다.
          setDragX(rail,-(state.shelfOffset||0)*200);
          state.shelfList.forEach(function(book,index){
            var card=rail.querySelector('[data-book-index="'+index+'"]');
            if(card)card.classList.toggle('is-center',index===center);
          });
          setShelfAtmosphere(state.shelfList[center]);
          reportShelfTree(center);
          return;
        }
        // 회전: 예전 책장의 가운데 책 + 좌우 기울임을 되살리되 모든 책을 끝까지 보이게 둔다.
        var layout=shelfRotationLayout(state.shelfList.length, rail.clientWidth);
        center=layout.centerFor(center);state.shelfIndex=center;
        state.shelfList.forEach(function(book,index){
          var card=rail.querySelector('[data-book-index="'+index+'"]');
          if(!card)return;
          card.style.setProperty('--x',layout.xOf(index,center)+'px');
          card.style.setProperty('--rot',layout.rotate(index,center)+'deg');
          card.style.setProperty('--alpha','1');
          card.style.setProperty('--scale',String(layout.scale(index,center)));
          card.style.setProperty('--z',layout.depth(index,center)+'px');
          card.style.setProperty('--y','0px');
          card.style.zIndex=String(100-Math.abs(index-center));
          card.classList.toggle('is-center',index===center);
        });
        clearDragX(rail);
        setShelfAtmosphere(state.shelfList[center]);
        reportShelfTree(center);
      }
      function moveShelf(direction) {
        if(!state.shelfList.length)return;
        var rail=$('#shelfRail'),layout=shelfRowLayout(state.shelfList.length,rail?rail.clientWidth:0);
        if(shelfView()==='shelf'){
          // 선반도 예전과 같은 넘침 조건에서 화살표 한 칸만큼 레일을 민다.
          var next=Math.max(0,Math.min(layout.maxOffset,(state.shelfOffset||0)+direction));
          if(next===state.shelfOffset)return;
          state.shelfOffset=next;save();updateCarousel();
          return;
        }
        var center=Math.max(0,Math.min(state.shelfList.length-1,(state.shelfIndex||0)+direction));
        if(center===state.shelfIndex)return;
        state.shelfIndex=center;save();updateCarousel();
      }
      function selectShelfIndex(index) {
        if(index<0||index>=state.shelfList.length)return;
        if(index!==state.shelfIndex){state.shelfIndex=index;updateCarousel();}
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
      function bindShelfDrag() {
        var rail=$('#shelfRail');
        var lpTimer=null,lpTarget=null,lpStart=null,lpFired=false;
        var clearLp=function(){if(lpTimer){clearTimeout(lpTimer);lpTimer=null;}lpStart=null;};
        rail.addEventListener('click',function(event){if(event.target.closest('[data-manage-id]'))return;if(lpFired){lpFired=false;lpTarget=null;return;}if(event.detail===0){var card=event.target.closest('[data-book-index]');if(card)selectShelfIndex(Number(card.dataset.bookIndex));}});
        rail.addEventListener('pointerdown',function(event){
          if(event.target.closest('[data-manage-id]'))return;
          var card=event.target.closest('.book-card');
          lpFired=false;lpTarget=(card&&card.dataset&&card.dataset.bookIndex!==undefined)?card:null;
          clearLp();lpStart={x:event.clientX,y:event.clientY};
          if(lpTarget){lpTimer=setTimeout(function(){if(lpTarget){lpTarget.classList.add('show-manage');lpFired=true;}lpTimer=null;},500);}
          shelfDrag.active=true;shelfDrag.startX=event.clientX;shelfDrag.moved=false;shelfDrag.downIndex=card?Number(card.dataset.bookIndex):null;shelfDrag.startIndex=state.shelfIndex||0;
          rail.classList.add('dragging');rail.setPointerCapture(event.pointerId);
        });
        rail.addEventListener('pointermove',function(event){
          if(lpTimer&&lpStart&&(Math.abs(event.clientX-lpStart.x)>7||Math.abs(event.clientY-lpStart.y)>7))clearLp();
          if(!shelfDrag.active)return;
          var dx=event.clientX-shelfDrag.startX;
          shelfDrag.lastDx=dx;
           if(Math.abs(dx)>7)shelfDrag.moved=true;
          // 끊김 방지(#1086와 같은 길): 움직이는 동안에는 레일의 CSS 변수 한 개만 바꾼다(카드별 재계산 없음).
           if(shelfDrag.moved&&shelfView()==='carousel')rail.style.setProperty('--drag-x',dx+'px');
        });
        rail.addEventListener('pointerup',function(){
          clearLp();
          if(!shelfDrag.active)return;
          var moved=shelfDrag.moved,downIndex=shelfDrag.downIndex,longFired=lpFired;
          shelfDrag.active=false;rail.classList.remove('dragging');
          if(moved&&shelfView()==='carousel'){
             var shifted=Math.round(-(shelfDrag.lastDx||0)/200);
             state.shelfIndex=Math.max(0,Math.min(state.shelfList.length-1,shelfDrag.startIndex+shifted));
             save();updateCarousel();
           } else if(moved){clearDragX(rail);}
          else if(longFired){/* 길게 누르기: ⋯만 보이고 책은 열지 않는다 */}
          else if(downIndex!==null)selectShelfIndex(downIndex);
          shelfDrag.downIndex=null;
          if(!longFired){lpTarget=null;}
        });
        rail.addEventListener('pointercancel',function(){clearLp();lpFired=false;lpTarget=null;if(!shelfDrag.active)return;shelfDrag.active=false;rail.classList.remove('dragging');state.shelfIndex=shelfDrag.startIndex||0;updateCarousel();});
        // #서재-빈공간: 레일 폭이 정해진 뒤에도 배치를 다시 잡는다 — 화면이 뜨는 동안 폭이 정해지기 전에
        // 그려지면 '왼쪽부터 순서 배치'가 그대로 남는다. 폭이 변할 때만 다시 그리므로 되풀이되지 않는다.
        if (typeof ResizeObserver !== 'undefined') { var shelfRailRo = new ResizeObserver(function () { updateCarousel(); }); shelfRailRo.observe(rail); }
      }
      function bind() {
        // 261118 대표 지적 3: '+ 새 트리' 입구는 오른쪽 단추(#shelfNewTree) 하나다.
        var openNewTree=function(){parent.postMessage({type:MSG.newTree},location.origin);};
        var openManageTree=function(id){parent.postMessage({type:MSG.manageTree,treeId:id},location.origin);};
        $('#shelfRail').addEventListener('click',function(event){var railManage=event.target.closest('[data-manage-id]');if(railManage)openManageTree(railManage.dataset.manageId);});
       $$('#shelf-view-inline [data-shelf-view]').forEach(function(b){b.onclick=function(){try{parent.postMessage({type:MSG.setShelfView,value:b.dataset.shelfView},location.origin)}catch{}};});
        $('#shelfNewTree').addEventListener('click',openNewTree);
        $('#shelfJump').addEventListener('click',function(){state.query='';state.filter='all';$('#searchInput').value='';$$('.filter').forEach(function(item){item.classList.toggle('active',item.dataset.filter==='all');});renderShelf();var book=getShelfCard(state.shelfIndex)?.querySelector('button[data-book-id]');if(book)openReader(book.dataset.bookId,book.closest('.book-card'));});
        $('#searchInput').addEventListener('input',function(event){state.query=event.target.value;renderShelf();});
        $$('.filter').forEach(function(button){button.addEventListener('click',function(){state.filter=button.dataset.filter;$$('.filter').forEach(function(item){item.classList.toggle('active',item===button);});renderShelf();});});
        $('#shelfPrev').addEventListener('click',function(){moveShelf(-1);});
        $('#shelfNext').addEventListener('click',function(){moveShelf(1);});
        $('#backToShelf').addEventListener('click',backToShelf);
        $('#openBookButton').addEventListener('click',openBook);
        $('#closeBookButton').addEventListener('click',closeBook);
        $('#prevPage').addEventListener('click',function(){turnPage(-1);});
        $('#nextPage').addEventListener('click',function(){turnPage(1);});
        $('#rightPage').addEventListener('click',function(event){if(event.target.closest('[data-play-video]'))mountVideo();});
        bindBookDrag();bindShelfDrag();
        document.addEventListener('keydown',function(event){if(!state.selectedId){if(event.key==='ArrowRight')moveShelf(1);if(event.key==='ArrowLeft')moveShelf(-1);return;}if(event.key==='Escape'&&state.open){closeBook();return;}if(state.open&&event.key==='ArrowRight')turnPage(1);if(state.open&&event.key==='ArrowLeft')turnPage(-1);});
        $('#newBookButton').addEventListener('click',function(){openModal('newBookModal');});
        $$('[data-close]').forEach(function(button){button.addEventListener('click',function(){closeModal(button.dataset.close);});});
        $$('.modal-backdrop').forEach(function(backdrop){backdrop.addEventListener('click',function(event){if(event.target===backdrop)closeModal(backdrop.id);});});
        $('#newBookForm').addEventListener('submit',function(event){
          event.preventDefault();
          var name=$('#newBookName').value.trim(),url=$('#newBookUrl').value.trim();
          if(!name||!url)return;
          state.customBooks.push({id:'custom-'+Date.now(),name:name,category:'all',color:palette[0],accent:palette[0],symbol:'♡',description:'새롭게 기록하기 시작한 트리.',tags:['새 책','첫 마음'],lastDate:localDateOnly(),chapters:[{title:$('#newBookChapter').value.trim()||'처음 마음이 움직인 장면',url:url,mood:'첫 마음',note:'이 사람을 처음 책으로 만들게 된 순간'}]});
          save();closeModal('newBookModal');$('#newBookForm').reset();renderShelf();showToast(name+'의 책을 만들었어요.');
        });
      }
// #481: 제목 보기가 바뀌면 책장의 제목(이어 읽기·표지)도 다시 그려야 한다. 다만 날짜 표기와 같은 판정으로
// '지금 그린 값과 다르고, 기기 미러가 이미 그 값일 때'만 다시 띄운다 — 받을 때마다 새로고침하면 고리가 된다.
const renderedTitleDisplay=titleDisplayOf((()=>{try{return parent.LT41?.prefs?.titleDisplay||'both'}catch{return 'both'}})());
window.__shelfListenerInstalled=true;
if(typeof addEventListener==='function')addEventListener('message',e=>{
 if(e.data?.type===MSG.shelfView){
   renderShelf();
   return;
  }
  if(e.data?.type===MSG.shelfSelectTree){
  window.__pickSeen=e.data.treeId;
  var picked=books.findIndex(b=>b.id===e.data.treeId);
  if(picked>=0){var rail=$('#shelfRail');state.shelfIndex=picked;state.shelfOffset=shelfRowLayout(state.shelfList.length,rail?rail.clientWidth:0).offsetFor(picked,state.shelfOffset||0);updateCarousel();}
  return;
 }
 if(e.data?.type===MSG.treesSaved){
  // #984: 저장이 서버에서 확인되면 책장·열린 책의 표지를 바로 다시 그린다(다시 열 필요 없이).
  // 저장 실패 때는 이 메시지가 오지 않는다 — 책장은 원래 표지를 그대로 두고, 셸의 저장 안내 떠가 실패를 알린다.
  var freshTrees=window.parent&&window.parent.LT41?window.parent.LT41.trees:null;
  if(!Array.isArray(freshTrees))return;
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
      renderShelf();renderResumeCard();bind();
  }
}
