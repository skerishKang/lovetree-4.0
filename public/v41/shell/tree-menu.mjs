import { normalizeTreeOpenView } from '../tree-open-view.mjs';
import { MSG } from '../frame-messages.mjs';
// createTreeMenu — shell.mjs에서 코드 위치만 옮긴 모듈(#886 PR 2). 동작은 그대로다.
export function createTreeMenu(deps){
const { $, document, window, location, treePopover, treeTrigger, thumbnailCandidates, coverFallbackAttrs, coverModeOf, normalizeCoverDesign, displayTreeTitle, cleanupAvailable, writeLocation, renderAccount, flowNavigation, choose, show, openEditor, openLoginStart } = deps;
const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function treeMomentThumb(m){return thumbnailCandidates(m,{autoLoad:true})[0]||''}
function treeCoverMarkup(tree){
 // #380 5번: 드롭다운 표지도 같은 판정(coverModeOf)을 따른다 — 디자인을 고른 트리는 사진 대신 디자인 보지를 보여 준다.
 const mode=coverModeOf(tree);
 if(mode==='design'){
  const design=normalizeCoverDesign(tree?.coverDesign);
  if(design)return `<span class="tree-cover" data-cover-design="${escHTML(design)}" aria-hidden="true"></span>`;
 }
 const moments=Array.isArray(tree?.moments)?[...tree.moments].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))):[];
 const cover=mode!=='design'&&tree?.coverMomentId?moments.find(m=>m.id===tree.coverMomentId):null;
 const chosen=(cover&&treeMomentThumb(cover)?cover:null)||moments.find(m=>Boolean(treeMomentThumb(m)))||null;
 const thumb=chosen?treeMomentThumb(chosen):'';
 const fallback=chosen?coverFallbackAttrs(chosen):'';
 return `<span class="tree-cover" aria-hidden="true">${thumb?`<img src="${escHTML(thumb)}"${fallback} alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</span>`;
}
function renderTreeMenu(){
 if(!treePopover)return;
 const trees=Array.isArray(deps.model?.trees)?[...deps.model.trees]:[];
 const ordered=trees.sort((a,b)=>Number(b?.inbox===true)-Number(a?.inbox===true));
 // #1028·#1079: 모든 폭에서 목록 칸을 감싸고, 트리가 8개 이상이면 이름 거르는 칸을 맨 위에 둔다.
 const currentId=window.LT41?.tree?.id||'';
 const rows=ordered.map(tree=>{
  const active=tree.id===currentId;
  const count=tree.inbox===true?`정리 전 ${tree.moments?.length||0}`:`${tree.moments?.length||0}개의 순간`;
  return `<button type="button" role="menuitemradio" class="tree-item" data-tree-id="${escHTML(tree.id)}" aria-checked="${active}">${treeCoverMarkup(tree)}<span class="tree-name">${escHTML(displayTreeTitle(tree.title||tree.subject||'트리'))}</span><span class="tree-count">${count}</span>${active?'<span class="tree-check" aria-hidden="true">✓</span>':''}</button>`;
 }).join('');
 // #380 5번: '정리하기' 입구는 여기 한 곳(지금 트리가 모아둔 순간일 때 '정리 전 N' 바로 아래)뿐이다.
 const currentTree=window.LT41?.tree||null;
 const cleanupRow=cleanupAvailable({source:deps.source,owned:!!deps.member?.snapshot().owned,tree:currentTree})&&deps.member?.snapshot().writable
  ? `<button type="button" role="menuitem" class="tree-item tree-cleanup" data-tree-action="cleanup"><span class="tree-name">정리 전 ${currentTree?.moments?.length||0}개 정리하기</span></button>` : '';
 // #627 PR B: 기존 '정리' 옆에 두는 꼬리표 정리 입구(내 기록·쓸 수 있을 때만).
 const tagsRow=deps.source==='server'&&deps.member?.snapshot().owned&&deps.member.snapshot().writable
  ? '<button type="button" role="menuitem" class="tree-item tree-tags" data-tree-action="tags"><span class="tree-name">꼬리표 정리</span></button>' : '';
 const manage=deps.source==='server'&&window.LT41&&deps.member?.snapshot().owned&&deps.member.snapshot().writable;
 // #394: 트리 드롭다운 맨 아래 "내 순간 전체 보기"(#380의 "내 트리 전체 보기" 자리 옆). 내 기록(서버)에서만 보인다.
 const momentsEntry=deps.source==='server'&&window.LT41?'<button type="button" role="menuitem" data-tree-action="moments">내 순간 전체 보기</button>':'';
 // #380 2번: 맨 아래 "내 트리 전체 보기" — 지금의 책장 화면(모든 트리의 책장)을 연다. 로그인 상태에서만 보인다.
 const shelfEntry=deps.member?.snapshot().owned?'<button type="button" role="menuitem" data-tree-action="shelf">서재 전체 보기</button>':'';
 // 261119 대표 결정: 목록 아래 메뉴 순서는 ＋ 새 트리 → 이 트리 관리 → 이 트리 공유 → 꼬리표 정리.
 // '정리 전 N개 정리하기'는 #380 5번대로 목록 바로 아래(맨 앞)에 둔다.
 const searchBox=ordered.length>=8?'<div class="tree-search" role="none"><input type="search" data-tree-search placeholder="트리 찾기" aria-label="트리 찾기" autocomplete="off" /></div>':'';
 const list=`${searchBox}<div class="tree-list" role="none">${rows}</div>`;
  // #1285 6번: 보기·관리·공유·위험 동작을 구분선으로 나눈다. 단추 순서는 그대로 둔다.
  const divider = '<div class="tree-group-divider" role="separator" aria-hidden="true"></div>';
  const viewGroup = `${shelfEntry}${momentsEntry}`;
  const shareButtons = manage ? '<button type="button" role="menuitem" data-tree-action="manage">이 트리 관리 (이름·표지)</button><button type="button" role="menuitem" data-tree-action="share">이 트리 공유</button>' : '';
  const dangerRow = cleanupRow ? divider + cleanupRow.replace('tree-item tree-cleanup', 'tree-item tree-cleanup tree-danger') : '';
  treePopover.innerHTML = '<div class="lt-tree-picker-heading"><strong>?? ???</strong><button type="button" data-tree-close aria-label="?? ?? ??">?</button></div>' + list + `<div class="tree-foot" role="none"><button type="button" role="menuitem" data-tree-action="new">＋ 새 트리</button>${manage ? divider + shareButtons : ''}${tagsRow}${viewGroup ? divider + viewGroup : ''}${dangerRow}</div>`;
 treePopover.querySelector('[data-tree-close]')?.addEventListener('click',()=>closeTreeMenu(true));
 const search=treePopover.querySelector('[data-tree-search]');
 search?.addEventListener('input',()=>{
  const q=search.value.trim().toLowerCase();
  treePopover.querySelectorAll('[data-tree-id]').forEach(b=>{ const name=b.querySelector('.tree-name')?.textContent||''; b.hidden=!!q && !name.toLowerCase().includes(q); });
  const active=treePopover.querySelector('[data-tree-id][aria-checked="true"]');
  if(active&&!active.hidden)scrollTreeItemIntoView(active);
 });
  // 트리를 누르면 그 트리로 이동한다: 책·보드·지도를 보던 중이면 같은 보기로, 그 외(첫 화면·내 트리·둘러보기)에는 그 트리의 책으로. 주소도 따라오게 남긴다.
  const OPEN_FILES={tree:'track61-tree.html',board:'track58-pinboard.html',book:'track59-sketchbook.html',network:'track56-network.html'};
  treePopover.querySelectorAll('[data-tree-id]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.treeId;
    if(!id || deps.source!=='server' || !deps.member?.snapshot().owned || !deps.member?.snapshot().writable)return;
    const tree=deps.model?.trees?.find(t=>t.id===id);
    if(!tree)return;
    closeTreeMenu();
    if(id===window.LT41?.tree?.id)return;
    choose(id,'',true);
    show(OPEN_FILES[normalizeTreeOpenView(tree.openView)],false,id);
    flowNavigation();
    writeLocation();
    focusChoiceOnReady();
  });
 treePopover.querySelector('[data-tree-action="new"]')?.addEventListener('click',()=>{closeTreeMenu();if(deps.member?.snapshot().writable)openEditor('new');else openLoginStart('new-tree');});
 treePopover.querySelector('[data-tree-action="cleanup"]')?.addEventListener('click',()=>{closeTreeMenu();deps.shellCleanup.open({});});
 // #627 PR B: 기존 '정리' 옆의 두 번째 입구 — 꼬리표 정리(이름 바꾸기·합치기·제안).
 treePopover.querySelector('[data-tree-action="tags"]')?.addEventListener('click',()=>{closeTreeMenu();deps.shellTagManager.open();});
 treePopover.querySelector('[data-tree-action="manage"]')?.addEventListener('click',()=>{deps.shellPanels.openTreeManager();closeTreeMenu();});
 treePopover.querySelector('[data-tree-action="share"]')?.addEventListener('click',()=>{closeTreeMenu();$('share-menu').click();});
 // #394: 첫 화면 순간 목록을 지금 트리가 골라진 상태로 연다. 화면을 다시 불러오므로 요청을 전역 플래그로 남긴다.
 treePopover.querySelector('[data-tree-action="moments"]')?.addEventListener('click',()=>{closeTreeMenu();window.LT41_MOMENTS_OPEN={treeId:window.LT41?.tree?.id||''};show('src064-orbit.html');});
 // #380 2번: 드롭다운 맨 아래 "내 트리 전체 보기" → 책장 화면. 로그인 상태에서만 이 버튼이 그려진다.
 treePopover.querySelector('[data-tree-action="shelf"]')?.addEventListener('click',()=>{closeTreeMenu();show('track32-bookshelf.html');});
}
// #1028: 목록 칸만 스크롤해 고른 줄이 보이게 한다(페이지 전체 스크롤은 건드리지 않는다).
function scrollTreeItemIntoView(item){
 const list=item.closest('.tree-list');if(!list||list.scrollHeight<=list.clientHeight)return;
 const a=item.getBoundingClientRect(),box=list.getBoundingClientRect();
 if(a.bottom>box.bottom)list.scrollTop+=a.bottom-box.bottom+4;
 else if(a.top<box.top)list.scrollTop-=box.top-a.top+4;
}
let activeFrame=null;
function activeViewFrame(){
 return ['view','view-next'].map(id=>document.getElementById(id)).find(f=>f?.contentWindow && !f.hidden && f.getClientRects().length>0) || document.getElementById('view');
}
function tellFrame(open, focus=false){
 const frame=activeFrame;
 if(frame?.contentWindow)frame.contentWindow.postMessage({type:'lt41-toolbar-tree-picker-state',open,focus},location.origin);
}
function focusChoiceOnReady(){
 const frame=activeViewFrame();
 frame?.addEventListener('load',()=>{frame.contentWindow?.postMessage({type:'lt41-toolbar-tree-picker-state',open:false,focus:true},location.origin);},{once:true});
}
function openTreeMenu(via='keyboard',rect=null,frame=null){
 if(!treePopover || deps.source!=='server' || !deps.member?.snapshot().owned || !deps.member?.snapshot().writable)return;
 activeFrame=frame||activeViewFrame();
 renderTreeMenu();
 treePopover.dataset.ltOpenedBy=via;
 treePopover.hidden=false;
 treePopover.setAttribute('role','dialog');
 treePopover.setAttribute('aria-label','?? ???');
 treePopover.classList.add('lt-toolbar-picker');
 treePopover.style.setProperty('--lt-picker-left',Math.round(rect?.left||24)+'px');
 treePopover.style.setProperty('--lt-picker-top',Math.round((rect?.bottom||60)+6)+'px');
 tellFrame(true);
 const active=treePopover.querySelector('[data-tree-id][aria-checked="true"]');
 (active||treePopover.querySelector('[data-tree-close]'))?.focus({preventScroll:true});
 if(active)scrollTreeItemIntoView(active);
}
function closeTreeMenu(focus=false){
 if(!treePopover || treePopover.hidden)return;
 treePopover.hidden=true;
 tellFrame(false,focus);
 activeFrame=null;
}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin || event.data?.type!=='lt41-toolbar-tree-picker')return;
 const frame=activeViewFrame();
 if(!frame || event.source!==frame.contentWindow || deps.source!=='server' || !deps.member?.snapshot().owned || !deps.member?.snapshot().writable || !window.LT41?.tree)return;
 if(!['track32-bookshelf.html','track59-sketchbook.html','track58-pinboard.html','track56-network.html','track61-tree.html'].includes(deps.current))return;
 if(!treePopover.hidden){closeTreeMenu(true);return;}
 const r=event.data.rect;
 if(!r||![r.left,r.bottom].every(Number.isFinite))return;
 const fr=frame.getBoundingClientRect();
 openTreeMenu(event.data.via,{left:Math.max(0,Math.min(innerWidth-44,fr.left+r.left)),bottom:fr.top+r.bottom},frame);
});
if(treePopover)treePopover.addEventListener('keydown',event=>{
 const items=[...treePopover.querySelectorAll('button')].filter(b=>!b.hidden && b.getClientRects().length);
 const at=items.indexOf(document.activeElement);
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=event.key==='ArrowDown'?(at+1)%items.length:(at-1+items.length)%items.length;items[next]?.focus();}
 else if(event.key==='Home'){event.preventDefault();items[0]?.focus();}
 else if(event.key==='End'){event.preventDefault();items.at(-1)?.focus();}
 else if(event.key==='Tab' && matchMedia('(max-width:900px)').matches){
  if(event.shiftKey && at===0){event.preventDefault();items.at(-1)?.focus();}
  else if(!event.shiftKey && at===items.length-1){event.preventDefault();items[0]?.focus();}
 }
});
function outsideClick(event){
 if(!treePopover||treePopover.hidden)return;
 if(treePopover.contains(event.target))return;
 event.preventDefault();event.stopPropagation();closeTreeMenu(true);
}
function escKey(event){
 if(event.key==='Escape'&&treePopover&&!treePopover.hidden){event.preventDefault();event.stopPropagation();closeTreeMenu(true);}
}
document.addEventListener('pointerdown',outsideClick,true);
document.addEventListener('keydown',escKey,true);
function bindFrame(frame){
 try{
  const doc=frame.contentDocument;if(!doc)return;
  doc.addEventListener('pointerdown',outsideClick,true);
  doc.addEventListener('keydown',escKey,true);
 }catch{}
}
for(const frame of document.querySelectorAll('iframe')){
 frame.addEventListener('load',()=>bindFrame(frame),true);
 bindFrame(frame);
}
return { escHTML, treeMomentThumb, treeCoverMarkup, renderTreeMenu, scrollTreeItemIntoView, openTreeMenu, closeTreeMenu };
}
