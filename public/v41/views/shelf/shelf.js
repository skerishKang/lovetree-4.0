// 내 트리(책장) 동작 (#231 후속, 2026-11-09).
// 계산(표지 색·이름·정보 줄·검색·카드 배치·페이지)은 shelf-model.mjs로 옮기고 여기서는 화면만 다룬다.
// 조건·문구·id·순서 변경 0. #291(궤도)와 같이 모듈로 불러 쓴다.
import {
  COVER_PALETTE, allBooks as allBooksOf, bookMeta, buildShelf, carouselTransform, coverStyle as coverStyleOf,
  escapeShelf, filterShelf, findBook, lastMomentDate as lastMomentDateOf,
  resolveShelfIndex, resumeCard, resumeName,
  treeTitleOf, youtubeId as youtubeIdOf
} from './shelf-model.mjs';
import { shelfOrder, INBOX_LABEL } from '../../inbox-model.mjs';
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
      var state = { filter:'all', query:'', selectedId:null, shelfIndex:0, shelfList:[], chapterIndex:0, open:false, openProgress:0, customBooks:[], pageTurning:false };
      var storageKey = 'lovetree-people-book-shelf-v2-1-true-page-motion';
      var drag = { active:false, mode:'', startX:0, startY:0, moved:false, startProgress:0 };
      var shelfDrag = { active:false, startX:0, moved:false, downIndex:null };
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
      var coverStyle = coverStyleOf;
      function openModal(id) { $('#'+id).classList.remove('hidden'); }
      function closeModal(id) { $('#'+id).classList.add('hidden'); }
      function renderShelf() {
        var list=filterShelf(allBooks(), state.filter, state.query);
        state.shelfList=list;
        state.shelfIndex=resolveShelfIndex(list, state.selectedId, state.shelfIndex);
        $('#resultCount').textContent='트리 '+list.length+'개';
        // #465: 넘길 책이 없으면(1권 이하) 좌우 넘김 화살표를 숨긴다.
        var prevArrow=$('#shelfPrev'),nextArrow=$('#shelfNext');
        if(prevArrow)prevArrow.hidden=list.length<=1;
        if(nextArrow)nextArrow.hidden=list.length<=1;
        // 261118 대표 지적 4: 트리가 있으면 소개 문 대신 이어 보기 띠 한 줄. 트리 0개일 때만 소개 문('…한 권의 책으로.'+'책 열기')이 보인다.
        var hero=document.querySelector('.hero');
        if(hero)hero.classList.toggle('strip-mode',list.length>0);
        // #256-1: 목록이 바뀔 때마다 다시 그린다. 칸은 검색·필터와 무관하게 전체 책(allBooks) 기준이라 좁아져도 그대로다.
        renderResumeCard();
        $('#shelfRail').innerHTML=(list.length?list.map(function(book,index){
          // #212: 표지에 이름 한 번만. 표지 아래는 "순간 N개 · 마지막 YYYY-MM-DD" 하나만. "책 · 02"·"기본 표지" 같은 내부 표시는 없다.
          // #256-3: 디자인 표지는 shelf-model coverChoice 판정(book.design)을 그대로 쓴다. 없으면 속성도 없다(기존 화면 변화 0).
          return '<article class="book-card" data-book-index="'+index+'"><button type="button" data-book-id="'+esc(book.id)+'" aria-label="'+esc(book.name)+' 책 열기">'+
            '<div class="book-cover"'+(book.design?' data-cover-design="'+esc(book.design)+'"':'')+' style="'+coverStyle(book)+'">'+(book.inbox?'<span class="inbox-chip">'+INBOX_LABEL+'</span>':'')+(book.coverMedia?'<img class="book-cover-media" src="'+esc(book.coverMedia)+'"'+coverFallbackAttrs(book.coverCandidates||[book.coverMedia])+' alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span class="cover-symbol"><span>'+esc(book.symbol)+'</span></span><strong class="cover-title">'+esc(book.name)+'</strong></div>'+
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
          if(info.kind==='first'){parent.postMessage({type:'lt41-write',mode:'new'},location.origin);return;}
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
      function updateCarousel() {
        var rail=$('#shelfRail');
        if(!rail)return;
        var center=state.shelfIndex;
        state.shelfList.forEach(function(book,index){
          var card=rail.querySelector('[data-book-index="'+index+'"]');
          if(!card)return;
          // #212: 중앙 카드는 레일 높이(375)보다 큰 352px이라 위로 뜨면 표지 윗부분이 잘렸다.
          // 중앙은 위로 띄우지 않고 아래로 살짝 내리고, 배율을 레일 안에 들어가는 값으로 조정한다.
          var placed=carouselTransform(index-center);
          card.style.setProperty('--x',placed.x+'px');
          card.style.setProperty('--y',placed.y+'px');
          card.style.setProperty('--z',placed.z+'px');
          card.style.setProperty('--scale',placed.scale);
          card.style.setProperty('--rot',placed.rotate+'deg');
          card.style.setProperty('--alpha',placed.alpha);
          card.style.zIndex=String(placed.zIndex);
          card.classList.toggle('is-center',index===center);
          card.style.pointerEvents=placed.pointerEvents;
          card.style.filter=placed.filter;
        });
        setShelfAtmosphere(state.shelfList[center]);
      }
      function moveShelf(direction) {
        if(!state.shelfList.length)return;
        var next=Math.max(0,Math.min(state.shelfList.length-1,state.shelfIndex+direction));
        if(next===state.shelfIndex)return;
        state.shelfIndex=next;save();updateCarousel();
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
          shelfDrag.active=true;shelfDrag.startX=event.clientX;shelfDrag.moved=false;shelfDrag.downIndex=card?Number(card.dataset.bookIndex):null;shelfDrag.startIndex=state.shelfIndex;
          rail.classList.add('dragging');rail.setPointerCapture(event.pointerId);
        });
        rail.addEventListener('pointermove',function(event){
          if(lpTimer&&lpStart&&(Math.abs(event.clientX-lpStart.x)>7||Math.abs(event.clientY-lpStart.y)>7))clearLp();
          if(!shelfDrag.active)return;
          var dx=event.clientX-shelfDrag.startX;
          if(Math.abs(dx)>7)shelfDrag.moved=true;
          if(shelfDrag.moved){state.shelfIndex=Math.max(0,Math.min(state.shelfList.length-1,shelfDrag.startIndex-dx/158));updateCarousel();}
        });
        rail.addEventListener('pointerup',function(){
          clearLp();
          if(!shelfDrag.active)return;
          var moved=shelfDrag.moved,downIndex=shelfDrag.downIndex,longFired=lpFired;
          shelfDrag.active=false;rail.classList.remove('dragging');
          if(moved){state.shelfIndex=Math.round(state.shelfIndex);save();updateCarousel();}
          else if(longFired){/* 길게 누르기: ⋯만 보이고 책은 열지 않는다 */}
          else if(downIndex!==null)selectShelfIndex(downIndex);
          shelfDrag.downIndex=null;
          if(!longFired){lpTarget=null;}
        });
        rail.addEventListener('pointercancel',function(){clearLp();lpFired=false;lpTarget=null;if(!shelfDrag.active)return;shelfDrag.active=false;rail.classList.remove('dragging');state.shelfIndex=Math.round(state.shelfIndex);updateCarousel();});
      }
      function bind() {
        // 261118 대표 지적 3: '+ 새 트리' 입구는 오른쪽 단추(#shelfNewTree) 하나다.
        var openNewTree=function(){parent.postMessage({type:'lt41-write',mode:'new'},location.origin);};
        var openManageTree=function(id){parent.postMessage({type:'lt41-manage-tree',treeId:id},location.origin);};
        $('#shelfRail').addEventListener('click',function(event){var railManage=event.target.closest('[data-manage-id]');if(railManage)openManageTree(railManage.dataset.manageId);});
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
      mountThumbFallback(document);
      renderShelf();renderResumeCard();bind();
  }
}

// #481: 제목 보기가 바뀌면 책장의 제목(이어 읽기·표지)도 다시 그려야 한다. 다만 날짜 표기와 같은 판정으로
// '지금 그린 값과 다르고, 기기 미러가 이미 그 값일 때'만 다시 띄운다 — 받을 때마다 새로고침하면 고리가 된다.
const renderedTitleDisplay=titleDisplayOf((()=>{try{return parent.LT41?.prefs?.titleDisplay||'both'}catch{return 'both'}})());
if(typeof addEventListener==='function')addEventListener('message',e=>{
 if(e.data?.type!=='lt41-title-display')return;
 let mirror=null;try{mirror=localStorage.getItem('lt41.titleDisplay');}catch{}
 if(shouldReloadForTitleDisplay({value:e.data.value,rendered:renderedTitleDisplay,mirror}))location.reload();
});
